// Motor de trocas: avalia (legalidade · equilíbrio · aceitação), propõe, contrapropõe e executa.
//
// Três avaliações independentes — nunca confundir:
//   A) LEGALIDADE: a liga consegue registrar a troca? (trade-rules.js)
//   B) EQUILÍBRIO: quem recebe mais valor esportivo e quais as consequências? (visão pública, sem viés de franquia)
//   C) ACEITAÇÃO:  a diretoria quer fazê-la? (visão interna, com o perfil do GM, a dificuldade da carreira e o contexto)
import { addNews, addTransaction, bumpRosters, markDirty, movePlayer } from '../core/world.js';
import { emit } from '../core/events.js';
import { createRng } from '../core/rng.js';
import { modeShows } from '../core/modes.js';
import { checkLegality, normalizeProposal, teamSummaries, assetKey } from './trade-rules.js';
import { addSwapRight, pickLabel, transferPick } from './picks.js';
import { claimAiEvent, ensureMarket, nextMarketId, pushHistory } from './market-state.js';
import { capSeason, tradeRules } from './rules-config.js';
import { fitFactor, ovrValue, pickValue, playerValue, swapValue, tradeMargin, utility } from './valuation.js';
import { profileOf } from '../gm/personality.js';
import { ageOf, leagueTable, rosterOf, rosterRating, teamNeeds } from '../gm/team-context.js';
import { godModeAllowed, overrideActive } from '../core/godmode-permissions.js';
import { money } from '../ui/format.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dollarsPerPoint = (cap) => 0.4e6 * (cap.salaryCap / 164961000);

/** Franquias controladas pelo usuário (apenas a dele; no Commissioner a "ativa"). */
export const userTeamId = (world) => world.career.teamId;
export const isUserTeam = (world, teamId) => teamId === world.career.teamId;

// ------------------------------------------------------------------ montagem
export const playerAsset = (playerId, from, to) => ({ kind: 'player', playerId, from, to });
export const pickAsset = (pickId, from, to, protection = null) => ({ kind: 'pick', pickId, from, to, ...(protection ? { protection } : {}) });
export const cashAsset = (amount, from, to) => ({ kind: 'cash', amount, from, to });
export const swapAsset = (pickId, ownPickId, from, to) => ({ kind: 'swap', pickId, ownPickId, from, to });

export function describeAsset(world, a) {
  if (a.kind === 'player') {
    const p = world.players.get(a.playerId);
    return p ? `${p.name} (${p.positions[0]}, ${p.ovr})` : `Atleta ${a.playerId}`;
  }
  if (a.kind === 'pick') {
    const pick = world.draftPicks.get(a.pickId);
    return pick ? `${pickLabel(pick)}${a.protection ? ` · protegida top ${a.protection.top}` : ''}` : a.pickId;
  }
  if (a.kind === 'swap') return `Swap ${a.pickId} ↔ ${a.ownPickId}`;
  return `Dinheiro ${money(a.amount)}`;
}

// ------------------------------------------------------------------ B) equilíbrio
function valuesFor(world, assets, teamId, { view, profile }) {
  return assets.map((a) => {
    if (a.kind === 'player') {
      const p = world.players.get(a.playerId);
      if (!p) return { asset: a, value: 0 };
      const pv = playerValue(world, p, { teamId, view, profile });
      const fit = teamId ? fitFactor(world, teamId, p) : 1;
      return { asset: a, value: pv.value > 0 ? pv.value * fit : pv.value, detail: pv };
    }
    if (a.kind === 'pick') {
      const pick = world.draftPicks.get(a.pickId);
      if (!pick) return { asset: a, value: 0 };
      const view2 = a.protection ? { ...pick, protection: { ...a.protection }, ownerTeamId: a.to } : pick;
      return { asset: a, value: pickValue(world, view2, { teamId, profile }).value };
    }
    if (a.kind === 'swap') {
      const pick = world.draftPicks.get(a.pickId);
      const own = world.draftPicks.get(a.ownPickId);
      return { asset: a, value: pick && own ? swapValue(world, own, pick) * (profile.picks ?? 1) : 0 };
    }
    return { asset: a, value: a.amount / (dollarsPerPoint(world.league.cap) * 2.5) };
  });
}

/** Equilíbrio esportivo: valor neutro (público) recebido e cedido por cada franquia + consequências. */
export function evaluateBalance(world, proposal, { view = godModeAllowed(world.career) ? 'god' : 'public' } = {}) {
  const p = normalizeProposal(proposal);
  const sums = teamSummaries(world, p);
  const perTeam = {};
  for (const teamId of p.teams) {
    const incoming = p.assets.filter((a) => a.to === teamId);
    const outgoing = p.assets.filter((a) => a.from === teamId);
    const inV = valuesFor(world, incoming, null, { view, profile: { id: 'neutral', picks: 1, youth: 1, vets: 1, salary: 1, now: 1, future: 1 } });
    const outV = valuesFor(world, outgoing, null, { view, profile: { id: 'neutral', picks: 1, youth: 1, vets: 1, salary: 1, now: 1, future: 1 } });
    const receives = utility(inV.map((x) => x.value));
    const gives = utility(outV.map((x) => x.value));
    perTeam[teamId] = { teamId, receives, gives, net: receives - gives, incoming: inV, outgoing: outV, impact: rosterImpact(world, teamId, p, sums[teamId]) };
  }
  let verdict = { label: 'Equilibrada', side: null, index: 0 };
  if (p.teams.length === 2) {
    const [a, b] = p.teams.map((id) => perTeam[id]);
    const scale = Math.max(8, (a.receives + a.gives) / 2);
    const index = clamp(a.net / scale, -1, 1);
    verdict = { index, side: Math.abs(index) < 0.12 ? null : index > 0 ? a.teamId : b.teamId, label: Math.abs(index) < 0.12 ? 'Equilibrada' : Math.abs(index) < 0.35 ? 'Ligeiramente favorável' : 'Muito desigual' };
  } else {
    const nets = Object.values(perTeam).map((t) => t.net);
    const spread = Math.max(...nets) - Math.min(...nets);
    verdict = { index: 0, side: null, label: spread < 12 ? 'Equilibrada' : 'Assimétrica entre as franquias', spread };
  }
  return { perTeam, verdict, finance: sums };
}

/** O que a troca faz com o elenco: força, ranking, necessidades, folha e profundidade. */
export function rosterImpact(world, teamId, proposal, summary) {
  const roster = rosterOf(world, teamId);
  const sentIds = new Set(proposal.assets.filter((a) => a.kind === 'player' && a.from === teamId).map((a) => a.playerId));
  const received = proposal.assets.filter((a) => a.kind === 'player' && a.to === teamId).map((a) => world.players.get(a.playerId)).filter(Boolean);
  const after = [...roster.filter((p) => !sentIds.has(p.id)), ...received];
  const table = leagueTable(world);
  const ratingBefore = rosterRating(roster);
  const ratingAfter = rosterRating(after);
  const others = [...table.rows.values()].filter((r) => r.teamId !== teamId).map((r) => r.rating);
  const rankOf = (rating) => 1 + others.filter((r) => r > rating).length;
  const needsBefore = teamNeeds(world, teamId, { roster });
  const needsAfter = teamNeeds(world, teamId, { roster: after });
  const avgAge = (list) => (list.length ? list.reduce((a, p) => a + ageOf(world, p), 0) / list.length : 0);
  return {
    ratingBefore, ratingAfter, rankBefore: rankOf(ratingBefore), rankAfter: rankOf(ratingAfter),
    needsBefore: needsBefore.top, needsAfter: needsAfter.top,
    ageBefore: avgAge(roster), ageAfter: avgAge(after), sizeBefore: summary?.standardBefore, sizeAfter: summary?.standardAfter,
    winsDelta: Math.round((ratingAfter - ratingBefore) * 1.8 * 10) / 10, // ~1,8 vitória por ponto de rating (estimativa)
  };
}

// ------------------------------------------------------------------ C) aceitação
const proposalSeed = (world, p) => `${world.saveId}:${world.calendar.date}:${p.assets.map(assetKey).sort().join('|')}`;

/**
 * A diretoria de `teamId` aceita? Visão interna (potencial verdadeiro com ruído do aiGmSharpness),
 * perfil do GM, necessidades, profundidade, pressão salarial e dificuldade da carreira.
 * @param opts.against  'user' aplica tradeDifficulty; 'ai' (AI×AI) usa margem neutra.
 */
export function evaluateAcceptance(world, proposal, teamId, { against = 'user' } = {}) {
  const p = normalizeProposal(proposal);
  const team = world.teams.get(teamId);
  const profile = profileOf(team);
  const sums = teamSummaries(world, p)[teamId];
  const incoming = p.assets.filter((a) => a.to === teamId);
  const outgoing = p.assets.filter((a) => a.from === teamId);
  const inV = valuesFor(world, incoming, teamId, { view: 'internal', profile });
  const outV = valuesFor(world, outgoing, teamId, { view: 'internal', profile });
  const exponent = 1 + 0.3 * ((profile.stars ?? 1.2) / 1.2);
  // jogador franquia: dispensar o melhor jogador do elenco custa mais
  const best = rosterOf(world, teamId)[0];
  for (const o of outV) if (o.asset.kind === 'player' && best && o.asset.playerId === best.id && best.ovr >= 85) o.value *= 1.12;
  const inU = utility(inV.map((x) => x.value), exponent);
  const outU = utility(outV.map((x) => x.value), exponent);

  const cap = world.league.cap;
  const budget = world.career.modifiers?.budgetPressure ?? 1;
  const taxDelta = sums.taxAfter - sums.taxBefore;
  const taxCost = (taxDelta / (dollarsPerPoint(cap) * 1.6)) * (profile.salary ?? 1) * (against === 'user' ? Math.max(0.6, budget) : 1);
  const surplusRelief = taxDelta < 0 ? (-taxDelta / (dollarsPerPoint(cap) * 1.6)) * 0.6 * (profile.salary ?? 1) : 0;
  const rosterMax = ['regular', 'playoffs'].includes(world.calendar.phase) ? world.league.roster.standardMax : world.league.roster.offseasonMax;
  const depthPenalty = Math.max(0, 13 - sums.standardAfter) * 2.5 * (profile.depth ?? 1) + Math.max(0, sums.standardAfter - rosterMax) * 1.2;
  const costs = Math.max(0, taxCost) + depthPenalty;
  const gains = surplusRelief;

  const difficulty = against === 'user' ? world.career.modifiers?.tradeDifficulty ?? 1 : 1;
  const sharpness = against === 'user' ? world.career.modifiers?.aiGmSharpness ?? 1 : 1;
  const margin = tradeMargin(difficulty);
  const required = Math.max(0, outU) * margin + 1;
  const noise = createRng(`${proposalSeed(world, p)}:${teamId}`).normal() * (1.2 + 0.025 * (Math.abs(inU) + Math.abs(outU))) / Math.max(0.5, sharpness);
  const net = inU - outU - costs + gains + noise;
  const scale = clamp(0.06 * (Math.abs(inU) + Math.abs(outU)) / 2, 3, 25);
  const probability = 1 / (1 + Math.exp(-(net - required) / scale));
  const accept = net >= required;

  // justificativa legível
  const pros = [];
  const cons = [];
  const topIn = [...inV].sort((a, b) => b.value - a.value)[0];
  const topOut = [...outV].sort((a, b) => b.value - a.value)[0];
  if (topIn && topIn.value > 8) pros.push(`Recebe ${describeAsset(world, topIn.asset)} (valor ${Math.round(topIn.value)}).`);
  if (topOut && topOut.value > 8) cons.push(`Cede ${describeAsset(world, topOut.asset)} (valor ${Math.round(topOut.value)}).`);
  if (surplusRelief > 1) pros.push(`Reduz a conta de imposto em ${money(-taxDelta)}.`);
  if (taxCost > 1) cons.push(`Eleva o imposto de luxo em ${money(taxDelta)}.`);
  if (depthPenalty > 1) cons.push(sums.standardAfter < 13 ? `Deixaria o elenco com ${sums.standardAfter} jogadores.` : `Lotaria o elenco (${sums.standardAfter} contratos).`);
  const arche = team.gm?.archetype;
  if (arche && profile.label) pros.push(`Perfil da diretoria: ${profile.label}.`);
  const fitIn = incoming.filter((a) => a.kind === 'player').map((a) => world.players.get(a.playerId)).find((pl) => pl && fitFactor(world, teamId, pl) > 1.04);
  if (fitIn) pros.push(`${fitIn.name} cobre uma necessidade de ${fitIn.positions[0]}.`);
  if (!accept) cons.unshift(`O pacote vale ${Math.round(inU - costs + gains)} para eles contra ${Math.round(outU)} que cederiam${margin > 0.01 ? ` (exigem ~${Math.round(margin * 100)}% de margem na dificuldade atual)` : ''}.`);

  return { teamId, accept, net, required, shortfall: Math.max(0, required - net), probability, inU, outU, costs, gains, pros, cons, profile: profile.id, margin };
}

/** Avalia a aceitação de TODAS as franquias controladas pela IA que participam da troca. */
export function evaluateAcceptanceAll(world, proposal) {
  const p = normalizeProposal(proposal);
  const decisions = {};
  const humans = new Set([userTeamId(world)]);
  const againstUser = p.teams.some((t) => humans.has(t));
  for (const teamId of p.teams) {
    if (humans.has(teamId)) { decisions[teamId] = { teamId, human: true, accept: true, probability: 1, pros: [], cons: [] }; continue; }
    decisions[teamId] = evaluateAcceptance(world, p, teamId, { against: againstUser ? 'user' : 'ai' });
  }
  const ai = Object.values(decisions).filter((d) => !d.human);
  return { decisions, accepted: ai.every((d) => d.accept), probability: ai.length ? ai.reduce((a, d) => a * d.probability, 1) : 1 };
}

// ------------------------------------------------------------------ painel completo (VERIFICAR TROCA)
export function checkTrade(world, proposal, { override = null } = {}) {
  const p = normalizeProposal(proposal);
  const legality = checkLegality(world, p, { override });
  const balance = evaluateBalance(world, p);
  const acceptance = evaluateAcceptanceAll(world, p);
  const reasons = [];
  if (legality.ok) reasons.push('Legalidade: a troca pode ser registrada pela liga.');
  else reasons.push(...legality.blocked.map((b) => b.message));
  reasons.push(`Equilíbrio esportivo: ${balance.verdict.label}${balance.verdict.side ? ` (favorece ${world.teams.get(balance.verdict.side)?.name})` : ''}.`);
  for (const d of Object.values(acceptance.decisions)) if (!d.human) reasons.push(`${world.teams.get(d.teamId).name}: ${d.accept ? 'aceitaria' : 'recusaria'} (${Math.round(d.probability * 100)}% de chance).`);
  return { proposal: p, legality, balance, acceptance, reasons };
}

// ------------------------------------------------------------------ permissões
export function canNegotiateFor(world, teamId) {
  if (!modeShows(world.career, 'market')) return { ok: false, reason: 'Seu cargo ou modo de jogo não conduz negociações.' };
  if (teamId === world.career.teamId) return { ok: true };
  if (godModeAllowed(world.career)) return { ok: true };
  return { ok: false, reason: 'Você só conduz trocas pela sua franquia.' };
}

function assertParticipation(world, p, by) {
  if (by === 'ai' || by === 'commissioner') return;
  const mine = world.career.teamId;
  if (!p.teams.includes(mine) && !godModeAllowed(world.career)) throw new Error('Sua franquia precisa participar da troca.');
  for (const teamId of p.teams) {
    if (teamId === mine) { const perm = canNegotiateFor(world, mine); if (!perm.ok) throw new Error(perm.reason); }
  }
}

// ------------------------------------------------------------------ execução
function createTradeException(world, s, tradeId) {
  const rules = tradeRules(world);
  const team = world.teams.get(s.teamId);
  const amount = s.outgoing - s.incoming;
  if (amount <= 0 || s.after <= world.league.cap.salaryCap) return null; // abaixo do cap não precisa de exceção
  const until = new Date(`${world.calendar.date}T12:00:00Z`);
  until.setUTCDate(until.getUTCDate() + rules.tradeExceptionValidDays);
  const exception = { id: `tpe-${tradeId}-${s.teamId}`, amount, createdOn: world.calendar.date, expiresOn: until.toISOString().slice(0, 10), tradeId, usedOn: null };
  team.tradeExceptions = [...(team.tradeExceptions ?? []).filter((e) => e.expiresOn >= world.calendar.date && !e.usedOn), exception];
  markDirty('teams', team.id);
  return exception;
}

/**
 * Aplica a troca. Toda validação é anterior a qualquer mutação.
 * @param opts.by         'user' | 'ai' | 'commissioner'
 * @param opts.force      "Forçar aceitação": ignora a vontade da IA, mantém a legalidade
 * @param opts.override   'total': ignora as regras (exige God Mode; os itens ignorados vão para o histórico)
 */
export function executeProposal(world, rawProposal, { by = 'user', force = false, override = null, label = null } = {}) {
  const p = normalizeProposal(rawProposal);
  if (override === 'total' && !overrideActive(world.career)) throw new Error('Override Total exige God Mode com ativação explícita.');
  if ((force || override) && !godModeAllowed(world.career)) throw new Error('Forçar uma troca exige God Mode (modo Commissioner).');
  assertParticipation(world, p, by);
  const legality = checkLegality(world, p, { override });
  if (!legality.ok) {
    const err = new Error(legality.blocked[0].message);
    err.details = legality.blocked;
    throw err;
  }
  const acceptance = evaluateAcceptanceAll(world, p);
  if (!acceptance.accepted && !force && !override && by !== 'commissioner') {
    const refuse = Object.values(acceptance.decisions).find((d) => !d.human && !d.accept);
    const err = new Error(`${world.teams.get(refuse.teamId).fullName} recusou a proposta.`);
    err.details = [refuse];
    throw err;
  }
  const tradeId = nextMarketId(world, 'trade');
  const season = capSeason(world);
  const sums = legality.teams;
  const names = p.teams.map((id) => world.teams.get(id).name);

  // exceções de troca usadas
  for (const w of legality.warnings) {
    if (!w.exceptionId) continue;
    const team = world.teams.get(w.teamId);
    const e = team.tradeExceptions?.find((x) => x.id === w.exceptionId);
    if (e) { e.usedOn = world.calendar.date; markDirty('teams', team.id); }
  }
  const playerAssets = p.assets.filter((a) => a.kind === 'player');
  const note = `Troca ${tradeId}${label ? ` · ${label}` : ''}`;
  for (const a of playerAssets) movePlayer(world.players.get(a.playerId), a.to, { type: 'trade', note });
  for (const a of p.assets.filter((x) => x.kind === 'pick')) transferPick(world, a.pickId, a.to, { via: tradeId, note, protection: a.protection ?? undefined });
  for (const a of p.assets.filter((x) => x.kind === 'swap')) addSwapRight(world, a.pickId, { holderTeamId: a.to, withPickId: a.ownPickId });
  const market = ensureMarket(world);
  for (const a of p.assets.filter((x) => x.kind === 'cash')) {
    const out = (market.cash[`${a.from}:${season}`] ??= { sent: 0, received: 0 });
    const inn = (market.cash[`${a.to}:${season}`] ??= { sent: 0, received: 0 });
    out.sent += a.amount;
    inn.received += a.amount;
  }
  for (const teamId of p.teams) if (sums[teamId]) createTradeException(world, sums[teamId], tradeId);

  const summary = p.assets.map((a) => ({ ...a, label: describeAsset(world, a) }));
  addTransaction({ type: 'trade-multi', tradeId, teamIds: p.teams, playerIds: playerAssets.map((a) => a.playerId), pickIds: p.assets.filter((a) => a.kind === 'pick' || a.kind === 'swap').map((a) => a.pickId), note });
  const body = p.teams.map((teamId) => {
    const got = p.assets.filter((a) => a.to === teamId).map((a) => describeAsset(world, a));
    return `${world.teams.get(teamId).name} recebe ${got.length ? got.join(', ') : 'nada'}`;
  }).join('; ');
  addNews({ category: 'mercado', title: p.teams.length === 2 ? `${names[0]} e ${names[1]} fecham troca` : `Troca entre ${p.teams.length} franquias: ${names.join(', ')}`, body: `${body}.${override ? ' Operação aprovada pelo comissário fora das regras tradicionais.' : ''}`, teamIds: p.teams, playerIds: playerAssets.map((a) => a.playerId) });
  pushHistory(world, { id: tradeId, type: 'executed', by, teams: p.teams, assets: summary, forced: Boolean(force), override: override === 'total' ? legality.ignored.map((i) => i.rule) : null, label });
  bumpRosters();
  emit('roster:changed', { teamIds: p.teams });
  emit('trade:executed', { tradeId, teams: p.teams });
  return { tradeId, legality, acceptance };
}

// ------------------------------------------------------------------ PROPOR TROCA
/**
 * Envia a proposta à(s) diretoria(s) adversária(s). Quem responde é a IA: aceita (e a troca é executada),
 * recusa ou devolve uma contraproposta (calculada em ai-gm.js e injetada por `counterBuilder`).
 */
export function proposeTrade(world, rawProposal, { counterBuilder = null, label = null } = {}) {
  const p = normalizeProposal(rawProposal);
  assertParticipation(world, p, 'user');
  const legality = checkLegality(world, p);
  const proposalId = nextMarketId(world, 'prop');
  if (!legality.ok) {
    pushHistory(world, { id: proposalId, type: 'blocked', by: 'user', teams: p.teams, assets: p.assets.map((a) => ({ ...a, label: describeAsset(world, a) })), reasons: legality.blocked.map((b) => b.message) });
    return { status: 'blocked', proposalId, legality };
  }
  const acceptance = evaluateAcceptanceAll(world, p);
  if (acceptance.accepted) {
    const result = executeProposal(world, p, { by: 'user', label });
    return { status: 'accepted', proposalId, tradeId: result.tradeId, legality, acceptance };
  }
  const refuse = Object.values(acceptance.decisions).find((d) => !d.human && !d.accept);
  const counter = counterBuilder ? counterBuilder(world, p, refuse) : null;
  const entry = { id: proposalId, type: counter ? 'countered' : 'rejected', by: 'user', teams: p.teams, assets: p.assets.map((a) => ({ ...a, label: describeAsset(world, a) })), reasons: refuse.cons, probability: acceptance.probability, counter: counter ? { assets: counter.assets.map((a) => ({ ...a })), message: counter.message } : null };
  pushHistory(world, entry);
  return { status: counter ? 'countered' : 'rejected', proposalId, legality, acceptance, counter, refuse };
}

// ------------------------------------------------------------------ rascunhos, travas e propostas vivas
export function saveDraft(world, name, rawProposal) {
  const market = ensureMarket(world);
  const p = normalizeProposal(rawProposal);
  const draft = { id: nextMarketId(world, 'draft'), name: name?.trim() || `Rascunho ${market.drafts.length + 1}`, savedOn: world.calendar.date, teams: p.teams, assets: p.assets };
  market.drafts.unshift(draft);
  market.drafts.length = Math.min(market.drafts.length, 40);
  markDirty('meta', 'market');
  return draft;
}
export function deleteDraft(world, id) {
  const market = ensureMarket(world);
  market.drafts = market.drafts.filter((d) => d.id !== id);
  markDirty('meta', 'market');
}
export function lockProposal(world, name, rawProposal) {
  const market = ensureMarket(world);
  const p = normalizeProposal(rawProposal);
  const entry = { id: nextMarketId(world, 'lock'), name: name?.trim() || `Proposta travada ${market.locked.length + 1}`, lockedOn: world.calendar.date, teams: p.teams, assets: p.assets };
  market.locked.unshift(entry);
  market.locked.length = Math.min(market.locked.length, 8);
  markDirty('meta', 'market');
  return entry;
}
export function unlockProposal(world, id) {
  const market = ensureMarket(world);
  market.locked = market.locked.filter((d) => d.id !== id);
  markDirty('meta', 'market');
}

/** Registra uma oferta recebida (da IA para o usuário) até `expiresOn`. */
export function addInboxOffer(world, { fromTeamId, assets, message, expiresOn, eventId }) {
  if (eventId && !claimAiEvent(world, eventId)) return null;
  const market = ensureMarket(world);
  const offer = { id: nextMarketId(world, 'offer'), status: 'pending', initiatedBy: 'ai', fromTeamId, createdOn: world.calendar.date, expiresOn, message, teams: [...new Set(assets.flatMap((a) => [a.from, a.to]))], assets };
  market.proposals.unshift(offer);
  market.proposals.length = Math.min(market.proposals.length, 30);
  markDirty('meta', 'market');
  emit('market:offer', offer);
  return offer;
}

/** Remove ofertas vencidas ou que deixaram de ser válidas. Chamar a cada avanço de dia. */
export function expireOffers(world) {
  const market = ensureMarket(world);
  const today = world.calendar.date;
  const keep = [];
  for (const offer of market.proposals) {
    if (offer.status !== 'pending') continue;
    if (offer.expiresOn < today || !checkLegality(world, offer).ok) {
      pushHistory(world, { id: offer.id, type: 'expired', by: 'ai', teams: offer.teams, assets: offer.assets.map((a) => ({ ...a, label: describeAsset(world, a) })) });
    } else keep.push(offer);
  }
  if (keep.length !== market.proposals.length) { market.proposals = keep; markDirty('meta', 'market'); }
}

export function acceptOffer(world, offerId) {
  const market = ensureMarket(world);
  const offer = market.proposals.find((o) => o.id === offerId);
  if (!offer) throw new Error('Oferta não encontrada ou expirada.');
  const result = executeProposal(world, offer, { by: 'user', force: false, label: 'oferta recebida' });
  market.proposals = market.proposals.filter((o) => o.id !== offerId);
  markDirty('meta', 'market');
  return result;
}
export function declineOffer(world, offerId) {
  const market = ensureMarket(world);
  const offer = market.proposals.find((o) => o.id === offerId);
  if (!offer) return;
  market.proposals = market.proposals.filter((o) => o.id !== offerId);
  pushHistory(world, { id: offer.id, type: 'declined', by: 'user', teams: offer.teams, assets: offer.assets.map((a) => ({ ...a, label: describeAsset(world, a) })) });
}

export { ovrValue };
