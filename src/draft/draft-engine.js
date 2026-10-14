// Draft profissional (Draft Night): loteria, ordem, escolhas da IA, escolhas do usuário, pausa e retomada.
// Estado persistente em `world.draft` (meta.draft) + stores `draftPicks` e `prospects`: fechar o navegador no
// meio do evento retoma exatamente da próxima escolha, sem refazer nada (a ordem e cada seleção são gravadas
// a cada pick; as sementes são derivadas do save, nunca de relógio).
//
// Draft 2026 pertence ao histórico e nunca é recriado. O Draft 2027 usa as picks reservadas de league.expansion
// (LVJ #1/#10, SEA #4/#5) — ver contracts/picks.js e draft/lottery.js.
import { addNews, addTransaction, bumpRosters, markDirty } from '../core/world.js';
import { createRng } from '../core/rng.js';
import { emit } from '../core/events.js';
import { godModeAllowed } from '../core/godmode-permissions.js';
import { computeStandings } from '../season/standings.js';
import { picksOfSeason, resolveConveyance } from '../contracts/picks.js';
import { draftRules } from '../contracts/rules-config.js';
import { rookieContract, secondRoundContract } from '../contracts/contracts-engine.js';
import { ovrValue, projectOvr } from '../contracts/valuation.js';
import { profileOf, horizonWeights } from '../gm/personality.js';
import { teamNeeds } from '../gm/team-context.js';
import { ensureProspectClasses } from './prospects.js';
import { planDraftOrder } from './lottery.js';
import { analyzePick } from './draft-analysis.js';
import { createUndraftedPlayer, prospectToPlayer } from './player-factory.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const LOG_LIMIT = 160;

// ------------------------------------------------------------------ estado
/**
 * Documento do Draft do ano de calendário (o evento da temporada em curso: 2027 durante toda a temporada
 * 2026-27 e sua offseason, concluído ou não). O documento só é substituído quando a temporada seguinte começa.
 */
export function ensureDraft(world, season = world.calendar.season) {
  if (world.draft?.season === season) return world.draft;
  world.draft = {
    season, status: 'pending', createdOn: world.calendar.date, lottery: null, order: [], cursor: 0, picks: [], log: [], paused: false,
    workouts: {}, userBoard: [], seed: `${world.saveId}:draft:${season}`,
  };
  ensureProspectClasses(world, season, { markDirty });
  markDirty('meta', 'draft');
  return world.draft;
}

const entryOf = (draft, index) => draft.order[index] ?? null;
export const currentEntry = (world) => (world.draft ? entryOf(world.draft, world.draft.cursor) : null);
export const classOf = (world, season = world.draft?.season) => [...world.prospects.values()].filter((p) => p.draftYear === season);
export const availableProspects = (world) => classOf(world).filter((p) => p.status === 'available');

function say(world, text) {
  const draft = world.draft;
  draft.log.unshift({ n: draft.cursor, text });
  if (draft.log.length > LOG_LIMIT) draft.log.length = LOG_LIMIT;
}

/** Ordem com os donos ATUAIS das picks (trocas durante o Draft refletem na hora). */
export function liveOrder(world) {
  const draft = world.draft;
  if (!draft) return [];
  return draft.order.map((e, index) => {
    const pick = world.draftPicks.get(e.pickId);
    const made = draft.picks.find((p) => p.pickId === e.pickId);
    return { ...e, index, ownerTeamId: made?.teamId ?? pick?.ownerTeamId, originalTeamId: pick?.originalTeamId, status: made ? 'made' : index === draft.cursor ? 'current' : 'upcoming', made, protection: pick?.protection ?? null, traded: pick ? pick.ownerTeamId !== pick.originalTeamId : false, kind: pick?.kind };
  });
}

// ------------------------------------------------------------------ loteria
/** Campanhas (e se foi aos playoffs) das franquias, a partir dos jogos da temporada. */
export function standingsForDraft(world) {
  const season = world.calendar.season;
  const games = [...world.games.values()].filter((g) => g.type === 'regular' && g.season === season);
  const table = computeStandings([...world.teams.values()], games);
  const qualified = new Set(Object.values(world.calendar.postseason?.qualified ?? {}).flat());
  return [...table.rows.values()].map((r) => ({ teamId: r.id, wins: r.w, losses: r.l, playoffs: qualified.has(r.id), diff: r.diff }));
}

export function lotteryReady(world) {
  return world.calendar.phase === 'offseason' && Boolean(world.calendar.postseason?.champion);
}

/**
 * Sorteia a loteria, define a ordem das duas rodadas e resolve proteções e swaps. Idempotente: com a
 * loteria feita devolve o resultado gravado (nunca sorteia de novo).
 */
export function runLottery(world, { standings = null } = {}) {
  const draft = ensureDraft(world);
  if (draft.lottery) return draft.lottery;
  if (!standings && !lotteryReady(world)) throw new Error('A loteria só acontece depois das Finais.');
  const rules = draftRules(world);
  const picks = picksOfSeason(world, draft.season);
  const table = standings ?? standingsForDraft(world);
  const plan = planDraftOrder({ season: draft.season, standings: table, picks, rng: createRng(`${draft.seed}:lottery`), odds: rules.lotteryOdds, lotteryTeams: rules.lotteryTeams, drawn: rules.lotteryDraws });
  for (const pick of picks) {
    const number = plan.numbers.get(pick.id);
    if (number == null) throw new Error(`Pick sem número no Draft ${draft.season}: ${pick.id}.`);
    if (pick.number != null && pick.number !== number && pick.slotLocked) throw new Error(`Pick reservada alterada: ${pick.id}.`);
    pick.number = number;
    markDirty('draftPicks', pick.id);
  }
  const effects = resolveConveyance(world, draft.season);
  draft.order = picks.map((p) => ({ number: p.number, round: p.round, pickId: p.id })).sort((a, b) => a.number - b.number);
  if (new Set(draft.order.map((o) => o.number)).size !== draft.order.length) throw new Error('A ordem do Draft contém números repetidos.');
  draft.lottery = { pool: plan.lottery.pool, odds: plan.lottery.odds, drawn: plan.lottery.drawn, order: plan.lottery.order, round1Size: plan.round1Size, round2Size: plan.round2Size, standings: table, effects, doneOn: world.calendar.date };
  draft.status = 'ready';
  const winner = plan.lottery.drawn[0];
  if (winner) addNews({ category: 'draft', title: `${world.teams.get(winner).fullName} vence a loteria do Draft ${draft.season}`, body: `Os quatro primeiros sorteados: ${plan.lottery.drawn.map((id) => world.teams.get(id).name).join(', ')}. As franquias de expansão ocupam as posições reservadas (${Object.entries(world.league.expansion?.initialDraftPicks ?? {}).map(([id, s]) => `${id} #${s.join('/#')}`).join(', ')}).`, teamIds: plan.lottery.drawn });
  for (const e of effects) {
    if (e.type === 'protection' && e.outcome === 'protected') addNews({ category: 'draft', title: `Proteção acionada: ${world.teams.get(e.originalTeamId).name} fica com a pick #${e.number}`, body: `A escolha protegida top ${e.top} não é transferida; a obrigação é convertida (${e.fallback === 'second-round' ? '2ª rodada' : e.fallback === 'rollover' ? 'rola para o ano seguinte' : 'cancelada'}).`, teamIds: [e.originalTeamId, e.teamId] });
    if (e.type === 'swap' && e.outcome === 'exercised') addNews({ category: 'draft', title: `Swap exercido: ${world.teams.get(e.holderTeamId).name} fica com a melhor pick`, body: `${e.gained} passa para ${world.teams.get(e.holderTeamId).name}.`, teamIds: [e.holderTeamId, e.otherTeamId] });
  }
  markDirty('meta', 'draft');
  emit('draft:lottery', draft.lottery);
  return draft.lottery;
}

// ------------------------------------------------------------------ avaliação da IA
/** Valor de um prospecto na visão da diretoria `teamId` (potencial com ruído do aiGmSharpness; nunca vê o baseRank). */
export function prospectValueFor(world, prospect, teamId, { exact = false } = {}) {
  const team = world.teams.get(teamId);
  const profile = profileOf(team);
  const sharp = world.career.modifiers?.aiGmSharpness ?? 1;
  const rng = createRng(`${world.saveId}:ai-scout:${teamId}:${prospect.id}`);
  const noise = exact ? 0 : rng.normal() * (2.7 / Math.max(0.5, sharp));
  const ovr = clamp(prospect.ovr + noise * 0.4, 45, 95);
  const pot = clamp(prospect.potential + noise, ovr, 99);
  const weights = horizonWeights(profile);
  let core = 0;
  weights.forEach((w, y) => { core += w * ovrValue(projectOvr(ovr, pot, prospect.age, y + 1)); });
  const base = core / (1 + 0.78 + 0.6 + 0.46 + 0.35);
  return base * (1 + 0.07 * ((profile.youth ?? 1) - 1));
}

/** Escolha da IA: melhor valor com peso crescente de necessidade nas posições mais baixas. */
export function aiChoice(world, teamId, entry, available) {
  const needs = teamNeeds(world, teamId);
  const late = clamp((entry.number - 6) / 40, 0, 0.6);
  const rng = createRng(`${world.draft.seed}:pick:${entry.number}`);
  let best = null;
  for (const p of available) {
    const need = Math.max(needs.byPosition[p.positions[0]] ?? 0, 0);
    const score = prospectValueFor(world, p, teamId) * (1 + late * need * 0.45) * (0.97 + rng.next() * 0.06);
    if (!best || score > best.score) best = { prospect: p, score };
  }
  return best?.prospect ?? null;
}

// ------------------------------------------------------------------ escolher
function assertCanAct(world) {
  const draft = world.draft;
  if (!draft || draft.status === 'pending') throw new Error('A loteria ainda não foi realizada.');
  if (draft.status === 'complete') throw new Error('O Draft já foi concluído.');
  if (draft.status === 'ready') throw new Error('O Draft ainda não começou.');
  if (draft.paused) throw new Error('O Draft está pausado.');
}

export function startDraft(world) {
  const draft = ensureDraft(world);
  if (!draft.lottery) runLottery(world);
  if (draft.status === 'ready') {
    draft.status = 'live';
    say(world, `Draft ${draft.season} aberto. Primeira escolha: ${world.teams.get(liveOrder(world)[0].ownerTeamId).fullName}.`);
    markDirty('meta', 'draft');
    emit('draft:started', draft);
  }
  return draft;
}
export function pauseDraft(world) {
  if (!world.draft || world.draft.status !== 'live') throw new Error('Não há Draft em andamento para pausar.');
  world.draft.paused = true;
  markDirty('meta', 'draft');
}
export function resumeDraft(world) {
  if (!world.draft) throw new Error('Não há Draft.');
  world.draft.paused = false;
  markDirty('meta', 'draft');
}

/**
 * Seleciona `prospectId` na escolha da vez. `by`: 'user' (só se a pick pertence a ele, ou God Mode), 'ai', 'auto'.
 * Valida tudo antes de mutar; impede dupla seleção do prospecto e da pick.
 */
export function makePick(world, { prospectId, by = 'user', teamId = null }) {
  assertCanAct(world);
  const draft = world.draft;
  const entry = currentEntry(world);
  if (!entry) throw new Error('Não há mais escolhas.');
  const pick = world.draftPicks.get(entry.pickId);
  const prospect = world.prospects.get(prospectId);
  if (!pick || pick.status === 'exercised') throw new Error('Esta escolha já foi exercida.');
  if (!prospect || prospect.draftYear !== draft.season) throw new Error('Prospecto inexistente neste Draft.');
  if (prospect.status !== 'available') throw new Error(`${prospect.name} já foi selecionado.`);
  const owner = pick.ownerTeamId;
  if (by === 'user' && owner !== world.career.teamId && !godModeAllowed(world.career)) throw new Error(`A escolha #${entry.number} pertence a ${world.teams.get(owner).fullName}, não à sua franquia.`);
  const drafting = teamId ?? owner;
  if (drafting !== owner && !godModeAllowed(world.career)) throw new Error('Somente o dono da escolha pode usá-la.');

  const player = prospectToPlayer(world, prospect, { teamId: drafting, round: pick.round, number: entry.number, season: draft.season });
  const contract = pick.round === 1 ? rookieContract(world, { playerId: player.id, teamId: drafting, pickNumber: entry.number, season: draft.season }) : { ...secondRoundContract(world, { playerId: player.id, teamId: drafting, season: draft.season }), type: 'camp' };
  contract.tradeLockedUntil = null;
  world.players.set(player.id, player);
  world.contracts.set(player.id, contract);
  world.careerStats.set(player.id, { playerId: player.id, rows: [], advanced: null });
  markDirty('players', player.id);
  markDirty('contracts', player.id);
  markDirty('careerStats', player.id);

  prospect.status = 'drafted';
  prospect.draft = { year: draft.season, round: pick.round, pick: entry.number, teamId: drafting, playerId: player.id };
  prospect.playerId = player.id;
  markDirty('prospects', prospect.id);
  pick.status = 'exercised';
  pick.prospectId = prospect.id;
  pick.exercisedBy = drafting;
  markDirty('draftPicks', pick.id);

  const analysis = analyzePick(world, { number: entry.number, round: pick.round, teamId: drafting, prospect, available: availableProspects(world).concat([prospect]), all: classOf(world) });
  const record = { number: entry.number, round: pick.round, pickId: pick.id, teamId: drafting, originalTeamId: pick.originalTeamId, prospectId: prospect.id, playerId: player.id, at: world.calendar.date, by, grade: analysis.grade, analysis };
  draft.picks.push(record);
  draft.cursor += 1;
  bumpRosters();
  const team = world.teams.get(drafting);
  say(world, `#${entry.number}: ${team.name} seleciona ${prospect.name} (${prospect.positions[0]}, ${prospect.school}). Nota ${analysis.grade}.`);
  if (pick.round === 1) addNews({ category: 'draft', title: `${team.name} escolhe ${prospect.name} na posição #${entry.number}`, body: `${prospect.positions[0]} de ${prospect.age} anos (${prospect.school}, ${prospect.country}). ${analysis.analysts[0]?.text ?? ''}`, teamIds: [drafting], playerIds: [player.id] });
  addTransaction({ type: 'draft', playerIds: [player.id], toTeamId: drafting, fromTeamId: null, note: `Draft ${draft.season}, escolha #${entry.number} (${pick.round}ª rodada)` });
  if (draft.cursor >= draft.order.length) finalizeDraft(world);
  markDirty('meta', 'draft');
  emit('draft:pick', record);
  return record;
}

/** Escolha da IA (ou do usuário no automático) pela avaliação da diretoria. */
export function autoPick(world, { by = 'ai' } = {}) {
  assertCanAct(world);
  const entry = currentEntry(world);
  const pick = world.draftPicks.get(entry.pickId);
  const forcedId = world.draft.forced?.[entry.number];
  const forced = forcedId ? world.prospects.get(forcedId) : null; // escolha definida pelo comissário (God Mode)
  const prospect = forced?.status === 'available' ? forced : aiChoice(world, pick.ownerTeamId, entry, availableProspects(world));
  if (!prospect) throw new Error('Não há prospectos disponíveis.');
  return makePick(world, { prospectId: prospect.id, by: by === 'auto' ? 'auto' : 'ai', teamId: pick.ownerTeamId });
}

export const userOwnsCurrent = (world) => {
  const entry = currentEntry(world);
  return Boolean(entry) && world.draftPicks.get(entry.pickId)?.ownerTeamId === world.career.teamId;
};

/** Simula as escolhas da IA até a próxima do usuário (ou até o fim). Respeita a pausa. */
export function simToUserPick(world, { max = 400 } = {}) {
  const made = [];
  startDraft(world);
  while (world.draft.status === 'live' && !world.draft.paused && made.length < max) {
    if (userOwnsCurrent(world)) break;
    made.push(autoPick(world));
  }
  return made;
}
/** Simula tudo (inclusive as escolhas do usuário, pelo ranking da diretoria). */
export function simAll(world) {
  const made = [];
  startDraft(world);
  while (world.draft.status === 'live' && !world.draft.paused) made.push(autoPick(world, { by: userOwnsCurrent(world) ? 'auto' : 'ai' }));
  return made;
}

// ------------------------------------------------------------------ fim do Draft
export function finalizeDraft(world) {
  const draft = world.draft;
  if (draft.status === 'complete') return;
  draft.status = 'complete';
  draft.completedOn = world.calendar.date;
  let undrafted = 0;
  for (const p of classOf(world, draft.season)) {
    if (p.status !== 'available') continue;
    p.status = 'undrafted';
    markDirty('prospects', p.id);
    if (p.ovr >= 58) { createUndraftedPlayer(world, p); undrafted++; }
  }
  // arquivo compacto: o documento do Draft é substituído no ano seguinte, a nota e a ordem ficam no histórico
  world.career.draftLog ??= {};
  world.career.draftLog[draft.season] = draft.picks.map((m) => ({ number: m.number, round: m.round, teamId: m.teamId, originalTeamId: m.originalTeamId, prospectId: m.prospectId, playerId: m.playerId, grade: m.grade }));
  markDirty('meta', 'career');
  say(world, `Draft ${draft.season} concluído: ${draft.picks.length} escolhas; ${undrafted} não selecionados entram no mercado.`);
  addNews({ category: 'draft', title: `Draft ${draft.season} termina com ${draft.picks.length} escolhas`, body: `${undrafted} jogadores sem escolha assinam como agentes livres. Primeiro escolhido: ${draft.picks[0] ? `${world.prospects.get(draft.picks[0].prospectId).name} (${world.teams.get(draft.picks[0].teamId).name})` : '—'}.` });
  ensureProspectClasses(world, draft.season + 1, { markDirty });
  markDirty('meta', 'draft');
  emit('draft:complete', draft);
}
