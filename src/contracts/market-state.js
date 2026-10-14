// Documento persistente do mercado (meta.market): propostas, rascunhos, histórico de negociações,
// fila de revisão do comissário, checkpoints da IA e log de intervenções administrativas.
import { markDirty } from '../core/world.js';

const HISTORY_LIMIT = 400;
const EVENT_LIMIT = 800;
const ADMIN_LIMIT = 300;

export const defaultMarket = () => ({
  version: 1,
  seq: 0,
  proposals: [], // ofertas vivas: do usuário aguardando resposta e da IA aguardando o usuário
  drafts: [], // rascunhos salvos pelo usuário
  locked: [], // propostas travadas para comparação
  history: [], // negociações encerradas (aceitas, recusadas, expiradas, contrapropostas)
  review: [], // trades entre franquias da IA aguardando aprovação do comissário
  ai: { lastTick: null, events: [], lastInboxDay: null },
  prefs: { futurePickYearsAhead: null }, // null = usa league.trade.futurePickYearsAhead
  adminLog: [], // intervenções do God Mode
  cash: {}, // { 'TEAM:season': { sent, received } }
});

export function ensureMarket(world) {
  if (!world.market) {
    world.market = defaultMarket();
    markDirty('meta', 'market');
    return world.market;
  }
  const base = defaultMarket();
  let changed = false;
  for (const [key, value] of Object.entries(base)) {
    if (world.market[key] === undefined) { world.market[key] = value; changed = true; }
  }
  for (const [key, value] of Object.entries(base.ai)) {
    if (world.market.ai[key] === undefined) { world.market.ai[key] = value; changed = true; }
  }
  if (changed) markDirty('meta', 'market');
  return world.market;
}

export function nextMarketId(world, prefix) {
  const market = ensureMarket(world);
  market.seq += 1;
  markDirty('meta', 'market');
  return `${prefix}-${world.calendar.season}-${String(market.seq).padStart(4, '0')}`;
}

export function pushHistory(world, entry) {
  const market = ensureMarket(world);
  market.history.unshift({ date: world.calendar.date, season: world.calendar.season, ...entry });
  if (market.history.length > HISTORY_LIMIT) market.history.length = HISTORY_LIMIT;
  markDirty('meta', 'market');
}

/** Registra um id de evento da IA; devolve false se já foi processado (idempotência). */
export function claimAiEvent(world, eventId) {
  const events = ensureMarket(world).ai.events;
  if (events.includes(eventId)) return false;
  events.push(eventId);
  if (events.length > EVENT_LIMIT) events.splice(0, events.length - EVENT_LIMIT);
  markDirty('meta', 'market');
  return true;
}

export function logAdmin(world, action, details = {}) {
  const market = ensureMarket(world);
  market.adminLog.unshift({ id: nextMarketId(world, 'adm'), date: world.calendar.date, season: world.calendar.season, action, ...details });
  if (market.adminLog.length > ADMIN_LIMIT) market.adminLog.length = ADMIN_LIMIT;
  markDirty('meta', 'market');
}

/** Quantos anos à frente picks podem ser negociadas (preferência do usuário > regra da liga). */
export function futurePickYears(world) {
  const pref = world.market?.prefs?.futurePickYearsAhead;
  const value = Number.isInteger(pref) ? pref : world.league.trade?.futurePickYearsAhead ?? 1;
  return Math.max(0, value);
}
