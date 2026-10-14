/** Evolution 11–100: análises de leitura. Proíbe alterações de entidades/saves. */
import { ATTRIBUTE_GROUPS } from '../players/attributes.js';
import { normalizeSearch } from './search.js';
import { potentialEstimate } from '../players/potential.js';

const n = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const average = (values) => { const safe = values.filter((v) => n(v) !== null); return safe.length ? safe.reduce((a, b) => a + b, 0) / safe.length : null; };
const descending = (a, b) => (b ?? -Infinity) - (a ?? -Infinity);
export const LAB_STAGES = Object.freeze([
  ['11–20', 'Scouting', 'Busca, filtros multicritério, idade, posição, conferência, OVR, potencial e comparativos.'],
  ['21–30', 'DNA do atleta', 'Atributos agregados, percentis, estilo, forças e diferenças entre atletas.'],
  ['31–40', 'Franquias', 'Profundidade, núcleo, média de idade, cinco líderes, equilíbrio e rankings.'],
  ['41–50', 'Partidas', 'Filtros por status, equipe, fase, margem, pontuação, ordem e período.'],
  ['51–60', 'Indicadores de jogos', 'Margens, prorrogações, médias, filtros temporais e recordes.'],
  ['61–70', 'Duelos', 'Confrontos diretos, mandos, margens, sequência, prorrogações e placares.'],
  ['71–80', 'Líderes estatísticos', 'Dez categorias de temporada, médias, porcentagens e amostras mínimas.'],
  ['81–90', 'CSV e robustez', 'Exportação segura, dados ausentes, invariância e validação dos filtros.'],
  ['91–100', 'DNA comparado', 'Eixos equilibrados, vantagens, dados incompletos e imutabilidade.'],
]);

export function athleteRows(players, teams, ageOf = (p) => p.age, { godMode = false } = {}) {
  const rows = [...players].map((p) => {
    const team = teams.get?.(p.teamId);
    const groups = ATTRIBUTE_GROUPS.map((g) => {
      const v = average(g.attributes.map((a) => n(p.attributes?.[a.key])));
      return { id: g.id ?? g.key ?? g.label, label: g.label, value: v };
    });
    const age = n(ageOf(p));
    const estimated = n(p.potential) != null && n(p.ovr) != null ? potentialEstimate(p, age) : null;
    const potentialSort = estimated ? godMode ? estimated.exact : estimated.high : null;
    const potentialLabel = !estimated ? '—' : godMode || estimated.low === estimated.high ? String(estimated.exact) : `${estimated.low}–${estimated.high}`;
    return { id: p.id, name: String(p.name ?? ''), teamId: p.teamId ?? null,
      team: team?.fullName ?? 'Sem franquia', conference: team?.conference ?? null,
      positions: Array.isArray(p.positions) ? [...p.positions] : [], country: p.country ?? '—',
      age, ovr: n(p.ovr), potential: godMode ? n(p.potential) : null, potentialSort, potentialLabel,
      gap: potentialSort == null || n(p.ovr) == null ? null : potentialSort - p.ovr,
      groups, source: p };
  });
  const sorted = [...rows].filter((r) => r.ovr != null).sort((a, b) => a.ovr - b.ovr);
  rows.forEach((r) => {
    if (r.ovr == null) { r.percentile = null; return; }
    const below = sorted.filter((s) => s.ovr < r.ovr).length;
    const tied = sorted.filter((s) => s.ovr === r.ovr).length;
    r.percentile = sorted.length > 1 ? Math.round(100 * (below + (tied - 1) / 2) / (sorted.length - 1)) : 100;
  });
  return rows;
}

export function filterAthletes(rows, { search = '', conference = 'all', team = 'all', position = 'all', minAge = 0, maxAge = 100,
  minOvr = 0, maxOvr = 100, minPotential = 0, country = 'all', sort = 'ovr', direction = 'desc' } = {}) {
  const needle = normalizeSearch(search);
  const filtered = rows.filter((r) => {
    if (conference !== 'all' && r.conference !== conference) return false;
    if (team !== 'all' && r.teamId !== team) return false;
    if (position !== 'all' && !r.positions.includes(position)) return false;
    if (country !== 'all' && r.country !== country) return false;
    if (r.age != null && (r.age < minAge || r.age > maxAge)) return false;
    if (r.ovr == null || r.ovr < minOvr || r.ovr > maxOvr) return false;
    if ((r.potentialSort == null && minPotential > 0) || (r.potentialSort != null && r.potentialSort < minPotential)) return false;
    return !needle || normalizeSearch(`${r.name} ${r.team} ${r.country} ${r.positions.join(' ')}`).includes(needle);
  });
  const dir = direction === 'asc' ? -1 : 1;
  filtered.sort((a, b) => {
    if (sort === 'name' || sort === 'team' || sort === 'country') return dir * String(a[sort]).localeCompare(String(b[sort]), 'pt-BR') || a.id.localeCompare(b.id);
    const key = sort === 'potential' ? 'potentialSort' : sort;
    return dir * descending(a[key], b[key]) || a.name.localeCompare(b.name, 'pt-BR');
  });
  return filtered;
}

export function franchiseRows(teams, players, ageOf = (p) => p.age) {
  const byTeam = new Map();
  for (const p of players) if (p.teamId) { if (!byTeam.has(p.teamId)) byTeam.set(p.teamId, []); byTeam.get(p.teamId).push(p); }
  return [...teams].map((team) => {
    const roster = byTeam.get(team.id) ?? [];
    const valid = roster.filter((p) => n(p.ovr) !== null).sort((a, b) => b.ovr - a.ovr);
    const topFive = valid.slice(0, 5);
    const rotation = valid.slice(0, 8);
    const averageFive = average(topFive.map((p) => p.ovr));
    const averageBench = average(valid.slice(5, 10).map((p) => p.ovr));
    return { id: team.id, name: team.fullName, conference: team.conference, division: team.division,
      team, players: roster.length, core: averageFive, rotation: average(rotation.map((p) => p.ovr)),
      bench: averageBench, depth: valid.length, leader: topFive[0] ?? null, leaderOvr: topFive[0]?.ovr ?? null,
      age: average(roster.map((p) => ageOf(p))), youth: roster.filter((p) => n(ageOf(p)) != null && ageOf(p) < 25).length,
      spread: topFive.length >= 5 ? topFive[0].ovr - topFive.at(-1).ovr : null,
      topFive: topFive.map((p) => ({ id: p.id, name: p.name, ovr: p.ovr })) };
  });
}

export function filterFranchiseLab(rows, { search = '', conference = 'all', sort = 'core', direction = 'desc' } = {}) {
  const needle = normalizeSearch(search);
  const result = rows.filter((r) => (conference === 'all' || r.conference === conference) && (!needle || normalizeSearch(`${r.name} ${r.division}`).includes(needle)));
  const dir = direction === 'asc' ? -1 : 1;
  return result.sort((a, b) => sort === 'name'
    ? dir * a.name.localeCompare(b.name, 'pt-BR')
    : dir * descending(a[sort], b[sort]) || a.name.localeCompare(b.name, 'pt-BR'));
}

export function gameRows(games, season = null) {
  return [...games].filter((g) => season == null || String(g.season ?? season) === String(season)).map((g) => {
    const played = g.status === 'final' && Array.isArray(g.score) && g.score.length === 2 && g.score.every((s) => n(s) !== null);
    return { id: g.id, home: g.home, away: g.away, date: g.date ?? '', season: g.season ?? season,
      type: g.type ?? 'regular', status: played ? 'final' : 'scheduled',
      homeScore: played ? g.score[0] : null, awayScore: played ? g.score[1] : null,
      total: played ? g.score[0] + g.score[1] : null, margin: played ? Math.abs(g.score[0] - g.score[1]) : null,
      winner: played ? g.score[0] === g.score[1] ? null : g.score[0] > g.score[1] ? g.home : g.away : null,
      overtimes: played ? Math.max(0, n(g.overtimes) ?? 0) : 0 };
  });
}

export function filterGames(rows, { team = 'all', opponent = 'all', status = 'all', type = 'all', minTotal = 0,
  maxMargin = Infinity, search = '', sort = 'date', direction = 'desc', from = '', to = '' } = {}) {
  const needle = normalizeSearch(search);
  const dir = direction === 'asc' ? -1 : 1;
  return rows.filter((g) => {
    if (team !== 'all' && team !== g.home && team !== g.away) return false;
    if (opponent !== 'all' && opponent !== g.home && opponent !== g.away) return false;
    if (team !== 'all' && opponent !== 'all' && team === opponent) return false;
    if (status !== 'all' && g.status !== status) return false;
    if (type !== 'all' && g.type !== type) return false;
    if (minTotal > 0 && (g.total == null || g.total < minTotal)) return false;
    if (maxMargin !== Infinity && (g.margin == null || g.margin > maxMargin)) return false;
    if (from && g.date < from || to && g.date > to) return false;
    return !needle || normalizeSearch(`${g.id} ${g.home} ${g.away} ${g.date}`).includes(needle);
  }).sort((a, b) => sort === 'date'
    ? dir * String(b.date).localeCompare(String(a.date)) || a.id.localeCompare(b.id)
    : dir * descending(a[sort], b[sort]) || String(b.date).localeCompare(String(a.date)));
}

export function gameSummary(rows) {
  const final = rows.filter((r) => r.status === 'final');
  return { total: rows.length, played: final.length, pending: rows.length - final.length,
    points: average(final.map((r) => r.total)), margin: average(final.map((r) => r.margin)),
    close: final.filter((r) => r.margin <= 5).length, overtime: final.filter((r) => r.overtimes > 0).length,
    blowouts: final.filter((r) => r.margin >= 20).length, high: final.reduce((a, b) => a && a.total >= b.total ? a : b, null) };
}

export function headToHead(rows, a, b) {
  if (!a || !b || a === b) return { a, b, meetings: 0, winsA: 0, winsB: 0, ties: 0, homeWins: 0, awayWins: 0, ot: 0, close: 0, margin: null, pointsA: null, pointsB: null, recent: [] };
  const games = rows.filter((g) => g.status === 'final' && ((g.home === a && g.away === b) || (g.home === b && g.away === a))).sort((x, y) => y.date.localeCompare(x.date));
  return { a, b, meetings: games.length, winsA: games.filter((g) => g.winner === a).length,
    winsB: games.filter((g) => g.winner === b).length, ties: games.filter((g) => !g.winner).length,
    homeWins: games.filter((g) => g.winner === g.home).length, awayWins: games.filter((g) => g.winner === g.away).length,
    ot: games.filter((g) => g.overtimes > 0).length, close: games.filter((g) => g.margin <= 5).length,
    margin: average(games.map((g) => g.margin)),
    pointsA: average(games.map((g) => g.home === a ? g.homeScore : g.awayScore)),
    pointsB: average(games.map((g) => g.home === b ? g.homeScore : g.awayScore)), recent: games };
}

export const STAT_FIELDS = Object.freeze([
  ['pts', 'Pontos', 'PPG'], ['reb', 'Rebotes', 'RPG'], ['ast', 'Assistências', 'APG'],
  ['stl', 'Roubos', 'SPG'], ['blk', 'Tocos', 'BPG'], ['tpm', 'Bolas de três', '3PM'],
  ['min', 'Minutos', 'MPG'], ['tov', 'Turnovers', 'TOV'], ['fg', 'Aproveitamento de quadra', 'FG%'],
  ['three', 'Aproveitamento de três', '3P%'],
]);
export function statisticRows(seasonStats, players) {
  return [...seasonStats].filter((s) => s?.gp > 0 && players.has?.(s.playerId)).map((s) => {
    const player = players.get(s.playerId), gp = s.gp;
    return { id: s.playerId, name: player.name, teamId: player.teamId, gp,
      pts: (s.pts ?? 0) / gp, reb: ((s.orb ?? 0) + (s.drb ?? 0)) / gp,
      ast: (s.ast ?? 0) / gp, stl: (s.stl ?? 0) / gp, blk: (s.blk ?? 0) / gp,
      tpm: (s.tpm ?? 0) / gp, min: (s.min ?? 0) / gp, tov: (s.tov ?? 0) / gp,
      fg: s.fga > 0 ? 100 * s.fgm / s.fga : null,
      three: s.tpa > 0 ? 100 * s.tpm / s.tpa : null };
  });
}
export function statLeaders(rows, metric = 'pts', { minGames = 1, limit = 20, team = 'all' } = {}) {
  if (!STAT_FIELDS.some(([key]) => key === metric)) return [];
  return rows.filter((r) => r.gp >= minGames && (team === 'all' || r.teamId === team) && n(r[metric]) !== null)
    .sort((a, b) => descending(a[metric], b[metric]) || a.name.localeCompare(b.name, 'pt-BR'))
    .slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 }));
}

const quote = (v) => `"${String(v ?? '').replaceAll('"', '""').replace(/^[=+@\-]/, (s) => `'${s}`)}"`;
export function toCsv(rows, keys, { separator = ';', bom = true } = {}) {
  const header = keys.map((k) => quote(k.label ?? k.key)).join(separator);
  const lines = rows.map((r) => keys.map(({ key }) => quote(r[key])).join(separator));
  return `${bom ? '\ufeff' : ''}${[header, ...lines].join('\r\n')}`;
}

/** E91–100: pareamento estritamente descritivo, nunca previsão da próxima partida. */
export function compareAthletes(a, b) {
  if (!a || !b || a.id === b.id) return { valid: false, groups: [], leftAdvantage: 0, rightAdvantage: 0, ties: 0, meanGap: null, leader: null };
  const right = new Map((b.groups ?? []).map((g) => [g.id, g]));
  const groups = (a.groups ?? []).filter((g) => right.has(g.id)).map((g) => {
    const other = right.get(g.id);
    const diff = g.value == null || other.value == null ? null : g.value - other.value;
    return { id: g.id, label: g.label, left: g.value, right: other.value, diff,
      advantage: diff == null ? null : diff > 0 ? 'left' : diff < 0 ? 'right' : 'tie' };
  });
  const comparable = groups.filter((g) => g.diff != null);
  const meanGap = average(comparable.map((g) => Math.abs(g.diff)));
  const leftAdvantage = comparable.filter((g) => g.diff > 0).length;
  const rightAdvantage = comparable.filter((g) => g.diff < 0).length;
  const ties = comparable.filter((g) => g.diff === 0).length;
  return { valid: true, groups, leftAdvantage, rightAdvantage, ties, meanGap,
    leader: leftAdvantage === rightAdvantage ? 'balanced' : leftAdvantage > rightAdvantage ? 'left' : 'right' };
}
