// Temporada da carreira aberta: calendário, avanço de dias, resultados, campanha e estatísticas.
// É aqui que a partida (2D ou simulação rápida) passa a valer para o universo — os seis passos
// descritos em match/bridge.js: jogo agendado → elencos do dia → jogar → box score → estatísticas → campanha.
import { addNews, getWorld, markDirty, movePlayer, saveWorld, setCalendarDate, teamRoster } from '../core/world.js';
import { get } from '../core/db.js';
import { emit } from '../core/events.js';
import { createRng } from '../core/rng.js';
import { addDays } from '../ui/format.js';
import { generateSchedule } from './schedule.js';
import { simulateQuickGame } from './quick-game.js';
import { computeStandings } from './standings.js';
import { planExpansionDraft } from './expansion.js';
import { salaryIn } from '../contracts/cap.js';
import { createPostseason, progressPostseason, postseasonGames as extractPostseasonGames } from './postseason.js';

const STAT_KEYS = ['pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'orb', 'drb', 'ast', 'stl', 'blk', 'tov', 'pf'];
const MIN_ROSTER = 8;

const cal = () => getWorld().league.calendar;
const season = () => getWorld().calendar.season;

/** Jogos oficiais da temporada em curso, em ordem de data. */
export function seasonGames() {
  const s = season();
  return [...getWorld().games.values()].filter((g) => g.type === 'regular' && g.season === s).sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1));
}

/** Gera o calendário da temporada se ainda não existir (carreiras novas e saves de antes do calendário). */
export function ensureSchedule() {
  const world = getWorld();
  if (!cal() || seasonGames().length) return false;
  const teams = [...world.teams.values()];
  const games = generateSchedule(teams, { season: season(), start: cal().regularSeasonStart, days: cal().regularSeasonDays, breaks: [cal().allStarBreak], rng: createRng(`${world.saveId}:calendario:${season()}`) });
  for (const g of games) {
    world.games.set(g.id, g);
    markDirty('games', g.id);
  }
  return true;
}

export const playoffGames = () => extractPostseasonGames([...getWorld().games.values()], season());
export const officialGames = () => [...seasonGames(), ...playoffGames()].sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
export const gamesOn = (date) => officialGames().filter((g) => g.date === date);
export const teamGames = (teamId) => officialGames().filter((g) => g.home === teamId || g.away === teamId);
export const nextGameOf = (teamId) => teamGames(teamId).find((g) => g.status !== 'final') ?? null;
export const lastGameOf = (teamId) => teamGames(teamId).filter((g) => g.status === 'final').at(-1) ?? null;
/** Jogo do usuário hoje que ainda não foi disputado. */
export function userGameToday() {
  const world = getWorld();
  return gamesOn(world.calendar.date).find((g) => g.status !== 'final' && (g.home === world.career.teamId || g.away === world.career.teamId)) ?? null;
}
export const regularSeasonOver = () => seasonGames().length > 0 && seasonGames().every((g) => g.status === 'final');
export const seasonOver = () => getWorld().calendar.phase === 'offseason' || getWorld().calendar.phase === 'complete';
export const standings = () => computeStandings([...getWorld().teams.values()], seasonGames());

/** Elenco apto a jogar hoje (quem está "Out" não entra). */
export const gameRoster = (teamId) => teamRoster(teamId).filter((p) => p.injury?.status !== 'Out');

// ------------------------------------------------------------------ Expansion Draft automático
export const teamsWithoutRoster = () => [...getWorld().teams.values()].filter((t) => gameRoster(t.id).length < MIN_ROSTER); // apenas diagnóstico, nunca gatilho do Draft

/** Realiza o Expansion Draft automático (ver expansion.js). Devolve o plano aplicado, ou null se não era preciso. */
export function runExpansionDraft() {
  const world = getWorld();
  const rules = world.league.expansion;
  if (world.career.expansionDraft?.picks) return null; // idempotência ao reabrir um save
  const expansionIds = new Set(rules?.teams ?? []);
  const empty = [...world.teams.values()].filter((t) => expansionIds.has(t.id) && teamRoster(t.id).length < MIN_ROSTER);
  if (!empty.length) return null;
  const players = [...world.players.values()];
  const plan = planExpansionDraft(players, {
    existing: [...world.teams.values()].filter((t) => !empty.includes(t)).map((t) => t.id),
    expansion: empty.map((t) => t.id),
    protectedPerTeam: rules.protectedPerTeam,
    maxLostPerTeam: rules.maxLostPerTeam,
    date: world.calendar.date,
    rng: createRng(`${world.saveId}:expansion`),
    salaryOf: (p) => salaryIn(world.contracts.get(p.id), world.calendar.season),
    protectedOverrides: world.career.expansionProtections ?? {},
    preferredPicks: world.career.expansionPreferences ?? {},
  });
  for (const pk of plan.picks) movePlayer(world.players.get(pk.playerId), pk.teamId, { type: 'expansion-draft', note: `Expansion Draft, escolha ${pk.pick}` });
  const names = (teamId) => plan.picks.filter((p) => p.teamId === teamId).slice(0, 4).map((p) => world.players.get(p.playerId).name).join(', ');
  for (const t of empty) addNews({ category: 'draft', teamIds: [t.id], playerIds: plan.picks.filter((p) => p.teamId === t.id).map((p) => p.playerId), title: `${t.fullName} monta o primeiro elenco no Expansion Draft`, body: `A liga realizou o Expansion Draft em formato automático: cada franquia protegeu ${rules.protectedPerTeam} jogadores e perdeu no máximo ${rules.maxLostPerTeam}. Primeiras escolhas do ${t.name}: ${names(t.id)}.` });
  world.career.expansionDraft = { date: world.calendar.date, auto: true, order: plan.order, picks: plan.picks };
  markDirty('meta', 'career');
  emit('roster:changed', { teamIds: [...world.teams.keys()] });
  return plan;
}

// ------------------------------------------------------------------ resultados
/**
 * Registra o resultado de um jogo oficial: campanha das duas franquias, estatísticas da temporada
 * de cada jogador e box score. `record` vem do motor 2D (bridge.buildGameRecord) ou do modelo rápido.
 */
export function applyResult(game, record) {
  const world = getWorld();
  if (game.status === 'final') return game;
  Object.assign(game, { status: 'final', score: [...record.score], overtimes: record.overtimes ?? 0, quick: Boolean(record.quick), userTeamId: record.userTeamId ?? null });
  markDirty('games', game.id);
  world.pending.boxScores.push({ id: game.id, season: game.season, periods: record.periods, box: record.box });
  const winner = record.score[0] > record.score[1] ? 0 : 1;
  [game.home, game.away].forEach((teamId, i) => {
    const isRegular = game.type === 'regular';
    const team = world.teams.get(teamId);
    team.record ??= { wins: 0, losses: 0 };
    if (isRegular) {
      team.record[i === winner ? 'wins' : 'losses']++;
      markDirty('teams', teamId);
    }
    if (!isRegular) return; // box score dos playoffs é guardado, mas não mistura médias da temporada regular
    for (const p of record.box[i].players) {
      let s = world.seasonStats.get(p.id);
      if (!s) {
        s = { id: `${game.season}:${p.id}`, season: game.season, playerId: p.id, teamId, gp: 0, gs: 0, min: 0, ...Object.fromEntries(STAT_KEYS.map((k) => [k, 0])) };
        world.seasonStats.set(p.id, s);
      }
      s.teamId = teamId;
      s.gp++;
      if (p.starter) s.gs++;
      s.min += p.min;
      for (const k of STAT_KEYS) s[k] += p[k] ?? 0;
      markDirty('seasonStats', p.id);
    }
  });
  emit('game:final', game);
  return game;
}

/** Simula um jogo no modelo rápido. A semente depende só do save e do jogo: a ordem de simulação não muda o resultado. */
function quickSim(game) {
  const world = getWorld();
  const side = (id) => ({ id, roster: gameRoster(id), rotation: world.teams.get(id)?.rotation });
  return applyResult(game, simulateQuickGame(side(game.home), side(game.away), createRng(`${world.saveId}:${game.id}`)));
}

/** Box score de um jogo encerrado (da fila de gravação ou do banco). */
export async function boxScoreOf(gameId) {
  const world = getWorld();
  return world.pending.boxScores.find((b) => b.id === gameId) ?? (await get(world.db, 'boxScores', gameId)) ?? null;
}

// ------------------------------------------------------------------ avanço do calendário
/**
 * Avança um dia: disputa (no modelo rápido) todos os jogos de hoje que ainda não aconteceram e vira a data.
 * O jogo do usuário entra na simulação rápida se ele não o jogou no 2D antes de avançar.
 * @returns { date, played: [jogos], events: [{ type, ... }] } — eventos para a interface anunciar
 */
function schedulePostseasonGames(games) {
  const w = getWorld();
  for (const g of games) {
    if (w.games.has(g.id)) continue;
    w.games.set(g.id, g);
    markDirty('games', g.id);
  }
  markDirty('meta', 'calendar');
}

export function advanceDay() {
  const world = getWorld();
  const events = [];
  if (seasonOver()) return { date: world.calendar.date, played: [], events: [{ type: 'offseason' }] };
  if (world.calendar.phase === 'preseason' || world.calendar.phase === 'regular') ensureSchedule();
  const { date } = world.calendar;
  // Migração não destrutiva: saves anteriores ao prompt 09 marcavam 'playoffs',
  // mas não guardavam confrontos. Inicializa a fase sem apagar jogos antigos.
  if (world.calendar.phase === 'playoffs' && !world.calendar.postseason && regularSeasonOver()) {
    const { post, games } = createPostseason(standings().conferences, season(), addDays(date, 2));
    world.calendar.postseason = post;
    schedulePostseasonGames(games);
    events.push({ type: 'playoff-round', round: post.stage });
  }
  if (world.calendar.phase === 'preseason' || world.calendar.phase === 'regular') {
    if (date >= cal().regularSeasonStart || addDays(date, 1) >= cal().regularSeasonStart) {
      const plan = runExpansionDraft();
      if (plan) events.push({ type: 'expansion-draft', plan });
    }
  }
  const pendingGames = gamesOn(date).filter((g) => g.status !== 'final');
  for (const g of pendingGames) for (const teamId of [g.home, g.away]) {
    if (gameRoster(teamId).length < 5) throw new Error(`Elenco insuficiente para ${teamId} no jogo ${g.id}. Corrija a disponibilidade antes de avançar.`);
  }
  const played = pendingGames.map(quickSim);
  const next = addDays(date, 1);
  if (world.calendar.phase === 'preseason' && next >= cal().regularSeasonStart) {
    world.calendar.phase = 'regular';
    events.push({ type: 'season-start' });
    addNews({ category: 'liga', title: 'Começa a temporada regular', body: `São 82 jogos por franquia. Os seis primeiros de cada conferência avançam direto e do 7º ao 10º disputam o play-in.` });
  }
  if (world.calendar.phase === 'regular' && regularSeasonOver()) {
    const { post, games } = createPostseason(standings().conferences, season(), addDays(date, 2));
    world.calendar.postseason = post;
    world.calendar.phase = 'playoffs';
    schedulePostseasonGames(games);
    events.push({ type: 'season-over', typeLabel: 'playoffs-start' });
    addNews({ category: 'liga', title: 'Temporada regular encerrada: começam o play-in e os playoffs', body: 'A disputa pelo título já tem os confrontos iniciais definidos. O calendário avança até as finais.' });
  } else if (world.calendar.phase === 'playoffs') {
    const post = world.calendar.postseason;
    if (!post) throw new Error('Save sem quadro de playoffs. Restaure ou atualize o calendário.');
    const before = post.stage;
    const games = progressPostseason(post, playoffGames(), date);
    schedulePostseasonGames(games);
    if (post.stage !== before) {
      events.push({ type: 'playoff-round', round: post.stage });
      if (post.stage === 'complete') {
        world.calendar.phase = 'offseason';
        world.career.completedSeasons ??= [];
        if (!world.career.completedSeasons.some((s) => s.season === season())) {
          world.career.completedSeasons.push({ season: season(), champion: post.champion, runnerUp: post.runnerUp, completedAt: date });
        }
        markDirty('meta', 'career');
        const champ = world.teams.get(post.champion);
        addNews({ category: 'liga', teamIds: [post.champion, post.runnerUp], title: `${champ.fullName} é campeão da NBA!`, body: `Título de ${season() - 1}-${String(season()).slice(-2)} confirmado nas finais. O calendário entra na offseason.` });
        events.push({ type: 'champion', teamId: post.champion });
      }
    }
  }
  setCalendarDate(world.calendar.phase === 'offseason' ? date : next);
  return { date: world.calendar.date, played, events };
}

/**
 * Virada simplificada: preserva contratos e elencos atuais, sem fingir que draft,
 * free agency ou ajuste automático do CBA já existem neste módulo.
 */
export function beginNextSeason() {
  const w = getWorld();
  if (w.calendar.phase !== 'offseason') throw new Error('A temporada precisa terminar para iniciar a próxima.');
  if ((w.career.completedSeasons?.length ?? 0) >= (w.career.careerLength ?? 10)) {
    w.calendar.phase = 'complete';
    markDirty('meta', 'calendar');
    return false;
  }
  const previous = standings().rows;
  for (const t of w.teams.values()) {
    const record = previous.get(t.id);
    t.lastSeason = { ...(t.lastSeason ?? {}), wins: record?.w ?? 0, losses: record?.l ?? 0, conference: t.conference, conferenceRank: record?.seed ?? 0, playoffs: w.calendar.postseason?.champion === t.id ? 'Campeão da NBA' : (w.calendar.postseason?.qualified?.[t.conference]?.includes(t.id) ? 'Playoffs' : 'Não se classificou') };
    t.record = { wins: 0, losses: 0 };
    markDirty('teams', t.id);
  }
  w.seasonStats = new Map();
  w.calendar.season += 1;
  w.calendar.phase = 'preseason';
  delete w.calendar.postseason;
  const shift = (date) => date.replace(/^\d{4}/, (y) => String(Number(y) + 1));
  w.league.calendar.regularSeasonStart = shift(w.league.calendar.regularSeasonStart);
  w.league.calendar.allStarBreak = w.league.calendar.allStarBreak.map(shift);
  w.calendar.date = shift(w.calendar.date);
  // Pré-temporada: duas semanas antes da abertura.
  w.calendar.date = addDays(w.league.calendar.regularSeasonStart, -14);
  markDirty('meta', 'calendar');
  markDirty('meta', 'league');
  addNews({ category: 'liga', title: `Temporada ${w.calendar.season - 1}-${String(w.calendar.season).slice(-2)} iniciada`, body: 'Novo calendário de 82 jogos por franquia. Os elencos existentes foram preservados; mercado e draft de offseason ainda são funcionalidades separadas.' });
  ensureSchedule();
  emit('calendar:changed', w.calendar);
  return true;
}

export const SIM_TARGETS = {
  'next-game': { label: 'O próximo jogo do meu time', done: () => Boolean(userGameToday()) },
  week: { label: 'Daqui a 7 dias', days: 7 },
  month: { label: 'Daqui a 30 dias', days: 30 },
  'all-star': { label: 'O All-Star break', done: () => getWorld().calendar.date >= cal().allStarBreak[0] },
  end: { label: 'O fim da temporada regular', done: () => getWorld().calendar.phase === 'playoffs' || seasonOver() },
  finals: { label: 'A decisão do título', done: () => seasonOver() },
};

/**
 * Simula vários dias em sequência, cedendo o controle à interface entre eles.
 * @param target   chave de SIM_TARGETS
 * @param onDay    (resultado de advanceDay) => void, para mostrar progresso
 * @param shouldStop () => boolean, para o usuário interromper
 */
export async function simulateUntil(target, { onDay = () => {}, shouldStop = () => false, beforeDay = async () => {} } = {}) {
  const world = getWorld();
  const spec = SIM_TARGETS[target];
  const events = [];
  let days = 0;
  world.quiet = true; // um único "alterado/salvo" no fim, em vez de milhares
  try {
    while (!seasonOver() && !shouldStop()) {
      if (days > 0 && spec.done?.()) break;
      if (days > 400) throw new Error('Limite de segurança de 400 dias atingido. Verifique o calendário.');
      if (spec.days && days >= spec.days) break;
      await beforeDay(world);
      const out = advanceDay();
      events.push(...out.events);
      days++;
      onDay(out);
      if (days % 3 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    world.quiet = false;
  }
  emit('world:dirty');
  await saveWorld();
  emit('calendar:changed', world.calendar);
  return { days, events };
}

// ------------------------------------------------------------------ estatísticas
const perGame = (s, key) => (key === 'reb' ? (s.orb + s.drb) / s.gp : s[key] / s.gp);

/** Líderes da temporada em médias por jogo (mínimo de jogos proporcional ao andamento da temporada). */
export function leaders(stat, limit = 5) {
  const world = getWorld();
  const mostGames = Math.max(0, ...[...world.seasonStats.values()].map((s) => s.gp));
  const minGames = Math.max(1, Math.floor(mostGames * 0.6));
  return [...world.seasonStats.values()]
    .filter((s) => s.gp >= minGames && world.players.has(s.playerId))
    .map((s) => ({ player: world.players.get(s.playerId), stats: s, value: perGame(s, stat) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

/** Médias da temporada em curso de um jogador, no mesmo formato de players/statline.js. */
export function seasonLine(playerId) {
  const s = getWorld().seasonStats.get(playerId);
  if (!s?.gp) return null;
  const avg = (k) => s[k] / s.gp;
  const pct = (m, a) => (s[a] ? (s[m] / s[a]) * 100 : null);
  return { season: s.season, gp: s.gp, gs: s.gs, min: avg('min'), pts: avg('pts'), reb: (s.orb + s.drb) / s.gp, ast: avg('ast'), stl: avg('stl'), blk: avg('blk'), tov: avg('tov'), fgPct: pct('fgm', 'fga'), tpPct: pct('tpm', 'tpa'), ftPct: pct('ftm', 'fta'), tpm: avg('tpm') };
}
