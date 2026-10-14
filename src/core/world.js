// Estado em memória da carreira aberta. As entidades pequenas e muito consultadas
// (franquias, jogadores, contratos...) ficam em Maps; as que crescem sem limite
// (jogos, notícias, estatísticas) são lidas do IndexedDB sob demanda.
import { bulkWrite, getAll, getAllByIndex, get, openSaveDb, pageByIndex, putSaveSummary } from './db.js';
import { emit } from './events.js';
import { getSetting } from './settings.js';
import { starOf, summarize } from './universe.js';
import { positionOverall } from '../players/overall.js';
import { teamPayroll } from '../contracts/cap.js';
import { commitSaveSnapshot } from './save-snapshot.js';
import { capSeason } from '../contracts/rules-config.js';

/** @type {null | object} */
let world = null;
let autosaveTimer = null;
let saving = null;

export const getWorld = () => world;
export const hasWorld = () => world !== null;

export async function loadWorld(saveId) {
  await unloadWorld();
  const db = await openSaveDb(saveId);
  const [metaRows, teams, players, contracts, coaches, owners, arenas, draftPicks, prospects, finances, careerStats] = await Promise.all(
    ['meta', 'teams', 'players', 'contracts', 'coaches', 'owners', 'arenas', 'draftPicks', 'prospects', 'finances', 'careerStats'].map((s) => getAll(db, s)),
  );
  const meta = Object.fromEntries(metaRows.map((m) => [m.key, m.value]));
  const games = await getAll(db, 'games');
  const playerSeasons = meta.calendar ? await getAllByIndex(db, 'playerSeasons', 'season', meta.calendar.season) : [];
  if (!meta.career || !meta.calendar) {
    db.close();
    throw new Error('Save incompleto ou corrompido: dados de carreira ausentes.');
  }
  world = {
    saveId,
    db,
    career: meta.career,
    calendar: meta.calendar,
    league: meta.league,
    history: meta.history,
    seedInfo: meta.seedInfo,
    teams: new Map(teams.map((t) => [t.id, t])),
    players: new Map(players.map((p) => [p.id, p])),
    contracts: new Map(contracts.map((c) => [c.playerId, c])),
    coaches: new Map(coaches.map((c) => [c.id, c])),
    owners: new Map(owners.map((o) => [o.id, o])),
    arenas: new Map(arenas.map((a) => [a.id, a])),
    // Prompt mestre (Trade Machine / Draft / Finanças / Offseason): stores que já existiam no schema v1
    // e passam a ser carregadas; `market`, `draft` e `offseason` são documentos da store `meta`.
    draftPicks: new Map(draftPicks.map((p) => [p.id, p])),
    prospects: new Map(prospects.map((p) => [p.id, p])),
    finances: new Map(finances.map((f) => [f.id, f])),
    careerStats: new Map(careerStats.map((c) => [c.playerId, c])), // somente leitura: base de produção para valuation
    market: meta.market ?? null,
    draft: meta.draft ?? null,
    offseason: meta.offseason ?? null,
    rosterVersion: 0,
    // calendário e resultados (sem box score: esse fica na store boxScores) e estatísticas da temporada em curso
    games: new Map(games.map((g) => [g.id, g])),
    seasonStats: new Map(playerSeasons.map((s) => [s.playerId, s])),
    dirty: { teams: new Set(), players: new Set(), contracts: new Set(), coaches: new Set(), owners: new Set(), arenas: new Set(), meta: new Set(), games: new Set(), seasonStats: new Set(), draftPicks: new Set(), prospects: new Set(), finances: new Set(), careerStats: new Set() },
    pending: { news: [], transactions: [], games: [], boxScores: [] },
    createdAt: null,
    name: null,
  };
  emit('world:loaded', world);
  return world;
}

export async function unloadWorld() {
  if (!world) return;
  clearTimeout(autosaveTimer);
  await saveWorld();
  world.db.close();
  world = null;
  emit('world:unloaded');
}

// ------------------------------------------------------------------ escrita
/** Marca um registro como alterado; o autosave grava em seguida. */
export function markDirty(store, id) {
  if (!world) return;
  world.dirty[store].add(id);
  if (world.quiet) return; // simulação em lote: o chamador grava e avisa uma vez no fim
  emit('world:dirty');
  if (getSetting('autosave')) {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => saveWorld().catch((err) => emit('save:error', err)), getSetting('autosaveDelayMs'));
  }
}

export const hasUnsavedChanges = () => Boolean(world) && (world.summaryNeedsSync || Object.values(world.dirty).some((s) => s.size > 0) || Object.values(world.pending).some((list) => list.length > 0));

/** Grava com snapshot isolado; chamadas concorrentes esperam o lote anterior. */
export function saveWorld() {
  if (!world) return Promise.resolve();
  if (saving) return saving.then(() => (hasUnsavedChanges() || world?.summaryNeedsSync ? saveWorld() : undefined));
  const w = world;
  saving = commitSaveSnapshot(w, {
    write: bulkWrite,
    updateSummary: putSaveSummary,
    summarizeWorld: () => {
      const team = w.teams.get(w.career.teamId);
      return { ...summarize(w.saveId, w.name, w.career, w.calendar, team, w.createdAt ?? new Date().toISOString(), starOf(w.players.values(), team.id)), ...(w.summaryExtra ?? {}) };
    },
    notify: emit,
  }).finally(() => { saving = null; });
  return saving;
}

/** Registra dados do índice de saves que o resumo precisa preservar (nome, criação). */
export function setSaveIdentity({ name, createdAt, extra = null }) {
  if (!world) return;
  world.name = name;
  world.createdAt = createdAt;
  world.summaryExtra = extra; // slot, origem e nota do save: preservados a cada gravação
}

// ------------------------------------------------------------------ consultas
export const userTeam = () => world.teams.get(world.career.teamId);

export function teamRoster(teamId) {
  const out = [];
  for (const p of world.players.values()) if (p.teamId === teamId) out.push(p);
  return out.sort((a, b) => b.ovr - a.ovr);
}

export const payrollOf = (teamId, season = capSeason(world)) =>
  teamPayroll(teamRoster(teamId), world.contracts, world.teams.get(teamId), world.league.cap, season, world.career.capMode);

export function playerAge(player, date = world?.calendar.date) {
  if (!player.birthDate || !date) return player.age;
  const [y, m, d] = date.split('-').map(Number);
  const [by, bm, bd] = player.birthDate.split('-').map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

export const careerStatsOf = (playerId) => get(world.db, 'careerStats', playerId);
export const recentNews = (limit = 20, offset = 0) => pageByIndex(world.db, 'news', 'date', { limit, offset });
export const recentTransactions = (limit = 50) => pageByIndex(world.db, 'transactions', 'date', { limit });
/** Amistosos mais recentes primeiro (jogos oficiais são consultados por season/season.js). */
export async function recentGames(limit = 10) {
  return [...world.games.values()].filter((g) => g.type === 'exhibition').sort((a, b) => (b.playedAt ?? b.id).localeCompare(a.playedAt ?? a.id)).slice(0, limit);
}

// ------------------------------------------------------------------ mutações básicas
let sequence = 0;
const nextId = (prefix) => `${prefix}-${world.calendar.date}-${Date.now().toString(36)}${(sequence++).toString(36)}`;

export function addNews(item) {
  const record = { id: nextId('news'), date: world.calendar.date, teamIds: [], playerIds: [], source: 'Redação NBA Universe', ...item };
  world.pending.news.push(record);
  markDirty('meta', 'calendar');
  emit('news:added', record);
  return record;
}

/** Registra um jogo disputado (ver src/match/bridge.js para o formato). */
export function addGame(record) {
  const stored = { id: nextId('game'), date: world.calendar.date, season: world.calendar.season, playedAt: new Date().toISOString(), ...record };
  world.games.set(stored.id, stored);
  markDirty('games', stored.id);
  emit('game:recorded', stored);
  return stored;
}

export function addTransaction(item) {
  const record = { id: nextId('tx'), date: world.calendar.date, season: world.calendar.season, ...item };
  world.pending.transactions.push(record);
  markDirty('meta', 'calendar');
  return record;
}

/** Recalcula valores derivados depois de alterar atributos ou posições. */
export function refreshPlayer(player) {
  player.ovr = positionOverall(player.attributes, player.positions[0]);
  if (player.potential < player.ovr) player.potential = player.ovr;
  markDirty('players', player.id);
}

export function movePlayer(player, toTeamId, { type = 'transfer', note = null } = {}) {
  const fromTeamId = player.teamId;
  if (fromTeamId === toTeamId) return;
  player.teamId = toTeamId;
  bumpRosters();
  markDirty('players', player.id);
  const contract = world.contracts.get(player.id);
  if (contract) {
    contract.teamId = toTeamId;
    contract.yearsWithTeam = 0;
    markDirty('contracts', player.id);
  }
  addTransaction({ type, playerIds: [player.id], fromTeamId, toTeamId, note });
  emit('roster:changed', { teamIds: [fromTeamId, toTeamId] });
}

/** Invalida caches derivados dos elencos (tabela da liga, necessidades). Chamar em qualquer mudança de elenco. */
export function bumpRosters() {
  if (world) world.rosterVersion = (world.rosterVersion ?? 0) + 1;
}

export function setCalendarDate(date) {
  world.calendar.date = date;
  markDirty('meta', 'calendar');
  emit('calendar:changed', world.calendar);
}
