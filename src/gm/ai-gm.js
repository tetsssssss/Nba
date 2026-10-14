// IA das 31 diretorias (a do usuário nunca é controlada aqui): contrapropostas, ofertas ao usuário e trocas
// entre franquias da IA. Nada roda ao abrir ou atualizar uma tela: tudo parte de `runAiMarketTick`, chamado
// pela passagem de calendário, com checkpoint por data e identificadores de evento (idempotente).
import { createRng } from '../core/rng.js';
import { markDirty } from '../core/world.js';
import { emit } from '../core/events.js';
import { canReviewAiTrades, godModeAllowed } from '../core/godmode-permissions.js';
import { assetKey, checkLegality, normalizeProposal } from '../contracts/trade-rules.js';
import { addInboxOffer, cashAsset, checkTrade, describeAsset, evaluateAcceptance, evaluateBalance, executeProposal, expireOffers, pickAsset, playerAsset, proposeTrade, userTeamId } from '../contracts/trade-engine.js';
import { claimAiEvent, ensureMarket, nextMarketId, pushHistory } from '../contracts/market-state.js';
import { tradeDeadline } from '../contracts/rules-config.js';
import { nextDraftSeason } from '../contracts/picks.js';
import { futurePickYears } from '../contracts/market-state.js';
import { playerValue, pickValue, utility } from '../contracts/valuation.js';
import { ARCHETYPES, assignGmProfiles, profileOf } from './personality.js';
import { addDays } from '../ui/format.js';
import { ageOf, leagueTable, rosterOf, teamNeeds } from './team-context.js';

const WEEKLY = 7;
const names = (world, ids) => ids.map((id) => world.teams.get(id)?.name ?? id);

// ------------------------------------------------------------------ candidatos
function tradablePicks(world, teamId) {
  const draftSeason = nextDraftSeason(world);
  const horizon = futurePickYears(world);
  return [...world.draftPicks.values()].filter((p) => p.ownerTeamId === teamId && p.status !== 'exercised' && p.season <= draftSeason + horizon);
}
function tradablePlayers(world, teamId) {
  return rosterOf(world, teamId).filter((p) => !p.retired && world.contracts.get(p.id) && !world.contracts.get(p.id).tradeLockedUntil);
}

// ------------------------------------------------------------------ contraproposta
/**
 * A diretoria `refusal.teamId` recusou: procura o menor ajuste que a faria aceitar — pedir mais um ativo
 * do usuário ou abrir mão de algo que ela cederia. Devolve null se não houver ajuste razoável.
 */
export function buildCounter(world, rawProposal, refusal) {
  const proposal = normalizeProposal(rawProposal);
  const aiId = refusal.teamId;
  const humanId = userTeamId(world);
  const baseKeys = new Set(proposal.assets.map(assetKey));
  const humanSide = proposal.teams.includes(humanId) ? humanId : proposal.teams.find((t) => t !== aiId);
  const candidates = [];
  for (const pick of tradablePicks(world, humanSide)) {
    const asset = pickAsset(pick.id, humanSide, aiId);
    if (!baseKeys.has(assetKey(asset))) candidates.push(asset);
  }
  const mine = tradablePlayers(world, humanSide)
    .map((p) => ({ p, v: playerValue(world, p, { teamId: aiId, view: 'internal' }).value }))
    .filter((x) => x.v > 1)
    .sort((a, b) => b.v - a.v)
    .slice(0, 14);
  for (const { p } of mine) {
    const asset = playerAsset(p.id, humanSide, aiId);
    if (!baseKeys.has(assetKey(asset))) candidates.push(asset);
  }
  const userCost = (assets) => utility(assets.map((a) => (a.kind === 'player' ? playerValue(world, world.players.get(a.playerId), { view: 'public' }).value : pickValue(world, world.draftPicks.get(a.pickId), {}).value)));
  const accepts = (assets) => {
    const test = { ...proposal, assets: [...proposal.assets, ...assets] };
    if (!checkLegality(world, test).ok) return false;
    return evaluateAcceptance(world, test, aiId, { against: 'user' }).accept;
  };
  // 1) pedir um ativo a mais
  let best = null;
  for (const a of candidates) {
    if (!accepts([a])) continue;
    const cost = userCost([a]);
    if (!best || cost < best.cost) best = { assets: [a], cost };
  }
  // 2) pedir dois
  if (!best) {
    const ranked = candidates.map((a) => ({ a, cost: userCost([a]) })).sort((x, y) => x.cost - y.cost).slice(0, 8);
    for (let i = 0; i < ranked.length; i++) for (let j = i + 1; j < ranked.length; j++) {
      const pair = [ranked[i].a, ranked[j].a];
      if (!accepts(pair)) continue;
      const cost = userCost(pair);
      if (!best || cost < best.cost) best = { assets: pair, cost };
    }
  }
  if (best) {
    const added = best.assets.map((a) => describeAsset(world, a));
    return { assets: [...proposal.assets, ...best.assets], added: best.assets, removed: [], message: `${world.teams.get(aiId).fullName} aceitaria se você incluísse ${added.join(' e ')}.` };
  }
  // 3) abrir mão de algo que a IA cederia
  const aiGives = proposal.assets.filter((a) => a.from === aiId);
  if (aiGives.length > 1) {
    let drop = null;
    for (const a of aiGives) {
      const test = { ...proposal, assets: proposal.assets.filter((x) => x !== a) };
      if (!test.assets.some((x) => x.from === aiId)) continue;
      if (!checkLegality(world, test).ok) continue;
      if (!evaluateAcceptance(world, test, aiId, { against: 'user' }).accept) continue;
      const cost = userCost([a].filter((x) => x.kind !== 'cash'));
      if (!drop || cost < drop.cost) drop = { asset: a, test, cost };
    }
    if (drop) return { assets: drop.test.assets, added: [], removed: [drop.asset], message: `${world.teams.get(aiId).fullName} aceitaria se ${describeAsset(world, drop.asset)} ficasse com eles.` };
  }
  return null;
}

/** PROPOR TROCA: a diretoria responde (aceita e executa, recusa ou devolve uma contraproposta). */
export const proposeToAi = (world, proposal, opts = {}) => proposeTrade(world, proposal, { counterBuilder: buildCounter, ...opts });

// ------------------------------------------------------------------ ofertas da IA ao usuário
/**
 * Procura um pacote que a IA `aiId` ofereceria ao usuário por um jogador de que precisa. O pacote precisa
 * ser legal (salary matching incluído), aceitável para a IA e minimamente atraente para o usuário
 * (equilíbrio público não pior que -4). Devolve a proposta ou null.
 */
export function buildOfferToUser(world, aiId, rng) {
  const humanId = userTeamId(world);
  if (aiId === humanId) return null;
  const needs = teamNeeds(world, aiId);
  const profile = profileOf(world.teams.get(aiId));
  const targets = tradablePlayers(world, humanId)
    .filter((p) => p.rosterStatus === 'standard' && p.ovr >= 70)
    .map((p) => {
      const need = Math.max(needs.byPosition[p.positions[0]] ?? 0, 0);
      const v = playerValue(world, p, { teamId: aiId, view: 'internal' }).value;
      const youth = ageOf(world, p) <= 24 ? profile.youth : 1;
      return { p, score: v * (0.8 + need * 0.35) * youth * (0.7 + rng.next() * 0.6), v };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const ownPlayers = tradablePlayers(world, aiId).filter((p) => p.rosterStatus === 'standard')
    .map((p) => ({ p, mine: playerValue(world, p, { teamId: aiId, view: 'internal' }).value, theirs: playerValue(world, p, { view: 'public' }).value }))
    .filter((o) => o.mine > 0.5)
    .sort((a, b) => b.theirs / Math.max(1, b.mine) - a.theirs / Math.max(1, a.mine));
  const ownPicks = tradablePicks(world, aiId)
    .map((k) => ({ k, mine: pickValue(world, k, { teamId: aiId }).value, theirs: pickValue(world, k, {}).value }))
    .filter((o) => o.mine > 0.5)
    .sort((a, b) => a.mine - b.mine);
  for (const { p: target } of targets) {
    const salary = world.contracts.get(target.id)?.years.find((y) => y.season === world.calendar.season)?.salary ?? 0;
    const bySalary = [...ownPlayers].sort((a, b) => Math.abs((world.contracts.get(a.p.id)?.years[0].salary ?? 0) - salary) - Math.abs((world.contracts.get(b.p.id)?.years[0].salary ?? 0) - salary)).slice(0, 8);
    const pool = [...new Map([...ownPlayers.slice(0, 4), ...bySalary.slice(0, 5)].map((o) => [o.p.id, o])).values()];
    const packages = [];
    for (let i = 0; i < pool.length; i++) packages.push([pool[i]]);
    for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) packages.push([pool[i], pool[j]]);
    for (const pack of packages) {
      const base = [playerAsset(target.id, humanId, aiId), ...pack.map((o) => playerAsset(o.p.id, aiId, humanId))];
      for (const sweetener of [[], ...ownPicks.slice(0, 3).map((k) => [k]), ownPicks.length > 1 ? [ownPicks[0], ownPicks[1]] : null].filter(Boolean)) {
        const proposal = { assets: [...base, ...sweetener.map((o) => pickAsset(o.k.id, aiId, humanId))] };
        if (!checkLegality(world, proposal).ok) continue;
        const aiEval = evaluateAcceptance(world, proposal, aiId, { against: 'ai' });
        if (!aiEval.accept) continue;
        const balance = evaluateBalance(world, proposal);
        if (balance.perTeam[humanId].net < -4) continue;
        return { proposal, target, message: `${world.teams.get(aiId).fullName} (${ARCHETYPES[world.teams.get(aiId).gm?.archetype]?.label ?? 'diretoria'}) quer ${target.name}.` };
      }
    }
  }
  return null;
}

// ------------------------------------------------------------------ trocas IA × IA
function sampleAiPairs(world, rng, count) {
  const humanId = userTeamId(world);
  const teams = [...world.teams.values()].filter((t) => t.id !== humanId && rosterOf(world, t.id).length >= 12);
  const pairs = [];
  for (let i = 0; i < count * 6 && pairs.length < count; i++) {
    const a = rng.pick(teams);
    const b = rng.pick(teams);
    if (a.id === b.id) continue;
    if (pairs.some(([x, y]) => (x === a.id && y === b.id) || (x === b.id && y === a.id))) continue;
    pairs.push([a.id, b.id]);
  }
  return pairs;
}

/** Melhor troca 1×1 / 2×1 / 1×2 entre duas franquias da IA que as duas aceitem e a liga permita. */
export function findAiTrade(world, aId, bId) {
  const players = (id) => tradablePlayers(world, id).filter((p) => p.rosterStatus === 'standard').slice(0, 10);
  const a = players(aId);
  const b = players(bId);
  let best = null;
  const consider = (assets) => {
    const proposal = { assets };
    if (!checkLegality(world, proposal).ok) return;
    const ea = evaluateAcceptance(world, proposal, aId, { against: 'ai' });
    const eb = evaluateAcceptance(world, proposal, bId, { against: 'ai' });
    if (!ea.accept || !eb.accept) return;
    const surplus = Math.min(ea.net - ea.required, eb.net - eb.required);
    if (!best || surplus > best.surplus) best = { proposal, surplus, ea, eb };
  };
  for (const x of a) for (const y of b) {
    if (Math.abs(x.ovr - y.ovr) > 9) continue;
    consider([playerAsset(x.id, aId, bId), playerAsset(y.id, bId, aId)]);
  }
  // consolidação: dois por um (profundidade por talento)
  for (const y of b.slice(0, 5)) {
    for (let i = 0; i < Math.min(a.length, 6); i++) for (let j = i + 1; j < Math.min(a.length, 6); j++) {
      if (y.ovr < Math.max(a[i].ovr, a[j].ovr)) continue;
      consider([playerAsset(a[i].id, aId, bId), playerAsset(a[j].id, aId, bId), playerAsset(y.id, bId, aId)]);
    }
  }
  // jogador por pick
  for (const y of b.slice(0, 6)) for (const k of tradablePicks(world, aId).slice(0, 6)) consider([playerAsset(y.id, bId, aId), pickAsset(k.id, aId, bId)]);
  return best;
}

// ------------------------------------------------------------------ passagem de tempo
const dayOfSeason = (world) => {
  const start = world.league.calendar?.regularSeasonStart;
  if (!start) return 0;
  return Math.round((Date.parse(`${world.calendar.date}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 864e5);
};

/**
 * Processa o mercado da IA para a data atual UMA ÚNICA VEZ. Chamado pelo avanço de calendário.
 * @returns { skipped?: string, offers: [], trades: [], review: [], strategy: [] }
 */
export function runAiMarketTick(world, { force = false } = {}) {
  const market = ensureMarket(world);
  const date = world.calendar.date;
  const result = { offers: [], trades: [], review: [], strategy: [] };
  if (!force && market.ai.lastTick && market.ai.lastTick >= date) return { skipped: 'checkpoint', ...result };
  market.ai.lastTick = date;
  markDirty('meta', 'market');
  expireOffers(world);
  const phase = world.calendar.phase;
  if (phase === 'playoffs' || phase === 'complete') return { skipped: 'fase', ...result };
  const deadline = tradeDeadline(world);
  if (phase === 'regular' && deadline && date > deadline) return { skipped: 'prazo', ...result };
  const weekly = phase === 'regular' ? dayOfSeason(world) % WEEKLY === 0 : phase === 'preseason' ? dayOfSeason(world) % 3 === 0 : true;
  if (!weekly && !force) return { skipped: 'intervalo', ...result };

  // estratégia: reavaliada na metade da temporada, a partir dos resultados
  if (phase === 'regular') {
    const table = leagueTable(world);
    const gpMax = Math.max(0, ...[...table.rows.values()].map((r) => r.gp));
    if (gpMax >= 41 && claimAiEvent(world, `strategy:${world.calendar.season}:midseason`)) {
      const changes = assignGmProfiles(world, { markDirty, force: true }).filter((c) => c.teamId !== userTeamId(world) && c.from);
      result.strategy.push(...changes);
    }
  }

  // ofertas ao usuário (no máximo 1 por semana; sem spam)
  const rngOffer = createRng(`${world.saveId}:ai-offer:${date}`);
  const humanId = userTeamId(world);
  const pending = market.proposals.filter((o) => o.status === 'pending').length;
  if (pending < 3 && claimAiEvent(world, `offer:${date}`)) {
    const aiTeams = rngOffer.shuffle([...world.teams.values()].filter((t) => t.id !== humanId && rosterOf(world, t.id).length >= 12)).slice(0, 5);
    for (const team of aiTeams) {
      if (!rngOffer.chance(0.5)) continue;
      const built = buildOfferToUser(world, team.id, rngOffer);
      if (!built) continue;
      const offer = addInboxOffer(world, { fromTeamId: team.id, assets: built.proposal.assets, message: built.message, expiresOn: addDays(date, 6), eventId: `offer:${date}:${team.id}` });
      if (offer) { result.offers.push(offer); break; }
    }
  }

  // IA × IA
  const aiTradesOn = world.career.systems?.aiTrades !== false;
  const autoApprove = world.career.autoApproveAiTrades !== false;
  if (aiTradesOn && (autoApprove || canReviewAiTrades(world.career))) {
    const rng = createRng(`${world.saveId}:ai-trades:${date}`);
    const attempts = phase === 'offseason' ? 3 : phase === 'preseason' ? 2 : 2;
    for (const [aId, bId] of sampleAiPairs(world, rng, attempts + 2)) {
      if (result.trades.length + result.review.length >= attempts) break;
      const eventId = `ai-trade:${date}:${[aId, bId].sort().join('-')}`;
      if (!claimAiEvent(world, eventId)) continue;
      const found = findAiTrade(world, aId, bId);
      if (!found) continue;
      if (autoApprove) {
        try {
          const done = executeProposal(world, found.proposal, { by: 'ai' });
          result.trades.push({ tradeId: done.tradeId, teams: [aId, bId], proposal: found.proposal });
        } catch (err) { /* proposta deixou de ser válida entre a busca e a execução: descartada */ }
      } else {
        const review = { id: nextMarketId(world, 'review'), createdOn: date, teams: [aId, bId], assets: found.proposal.assets, surplus: found.surplus, summary: `${names(world, [aId, bId]).join(' × ')}` };
        market.review.unshift(review);
        market.review.length = Math.min(market.review.length, 20);
        markDirty('meta', 'market');
        result.review.push(review);
      }
    }
  }
  if (result.offers.length || result.trades.length || result.review.length) emit('market:tick', result);
  return result;
}

// ------------------------------------------------------------------ revisão do comissário
export function approveReview(world, reviewId) {
  if (!canReviewAiTrades(world.career)) throw new Error('Somente o comissário (God Mode) aprova trades entre franquias da IA.');
  const market = ensureMarket(world);
  const review = market.review.find((r) => r.id === reviewId);
  if (!review) throw new Error('Trade não encontrada na fila de revisão.');
  const done = executeProposal(world, { assets: review.assets }, { by: 'commissioner', reviewed: true, label: 'aprovada pelo comissário' });
  market.review = market.review.filter((r) => r.id !== reviewId);
  markDirty('meta', 'market');
  return done;
}
export function rejectReview(world, reviewId) {
  if (!canReviewAiTrades(world.career)) throw new Error('Somente o comissário (God Mode) revisa trades entre franquias da IA.');
  const market = ensureMarket(world);
  const review = market.review.find((r) => r.id === reviewId);
  if (!review) return;
  market.review = market.review.filter((r) => r.id !== reviewId);
  pushHistory(world, { id: review.id, type: 'review-rejected', by: 'commissioner', teams: review.teams, assets: review.assets.map((a) => ({ ...a, label: describeAsset(world, a) })) });
  markDirty('meta', 'market');
}

export { godModeAllowed, cashAsset, checkTrade };
