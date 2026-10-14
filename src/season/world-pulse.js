// Retrato derivado da temporada atual. Nenhuma notícia ou resultado é inventado ou gravado.
// Funções puras para reutilização no hub do universo, Central do GM e testes.
import { computeStandings } from './standings.js';

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const validFinal = (game, season) => game?.status === 'final' &&
  (season == null || String(game.season) === String(season)) &&
  Array.isArray(game.score) && game.score.length === 2 && game.score.every((v) => Number.isFinite(v));
const finalRegular = (game, season) => game?.type === 'regular' && validFinal(game, season);
const finalOfficial = (game, season) => validFinal(game, season) &&
  !['exhibition', 'scrimmage', 'quick', 'sandbox'].includes(game.type) &&
  ['regular', 'playoff', 'playoffs', 'play-in', 'playin', 'postseason'].includes(game.type);

export function seasonSnapshot(teams, games, season = null) {
  const allTeams = [...teams];
  const official = [...games].filter((g) => finalOfficial(g, season)).sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
  const played = official.filter((g) => finalRegular(g, season));
  const standings = computeStandings(allTeams, played);
  const rankings = [...standings.rows.values()].map((r) => {
    const recent = (r.l10[0] + r.l10[1]) || 0;
    const momentum = recent ? r.l10[0] / recent : 0;
    const score = r.gp ? 100 * (r.pct * .62 + momentum * .28) + clamp(r.diff, -20, 20) * .5 : null;
    return { ...r, momentum, score, team: allTeams.find((t) => t.id === r.id) };
  }).sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity) || b.gp - a.gp || a.id.localeCompare(b.id));

  const pairs = new Map();
  for (const g of played) {
    const ids = [g.home, g.away].sort();
    const key = ids.join(':');
    const rivalry = pairs.get(key) ?? { id: key, teamIds: ids, meetings: 0, close: 0, overtimes: 0, wins: { [ids[0]]: 0, [ids[1]]: 0 }, lastGame: null };
    const margin = Math.abs(g.score[0] - g.score[1]);
    rivalry.meetings++;
    if (margin <= 5) rivalry.close++;
    if (g.overtimes > 0) rivalry.overtimes++;
    rivalry.wins[g.score[0] > g.score[1] ? g.home : g.away]++;
    rivalry.lastGame = g;
    pairs.set(key, rivalry);
  }
  const duels = [...pairs.values()].filter((d) => d.meetings >= 2 || d.close).sort((a, b) =>
    (b.meetings * 2 + b.close * 3 + b.overtimes * 2) - (a.meetings * 2 + a.close * 3 + a.overtimes * 2) || b.lastGame.date.localeCompare(a.lastGame.date)).slice(0, 8);

  const highlights = [];
  for (const g of official.slice(-40).reverse()) {
    const margin = Math.abs(g.score[0] - g.score[1]);
    const winnerId = g.score[0] > g.score[1] ? g.home : g.away;
    const loserId = winnerId === g.home ? g.away : g.home;
    const winner = allTeams.find((t) => t.id === winnerId)?.name ?? winnerId;
    const loser = allTeams.find((t) => t.id === loserId)?.name ?? loserId;
    if (g.overtimes > 0 || margin <= 3) {
      highlights.push({ id: g.id, date: g.date, game: g, teamIds: [winnerId, loserId], tone: g.overtimes ? 'ot' : 'close', title: `${winner} vence ${loser} ${g.overtimes ? 'na prorrogação' : 'por margem mínima'}`, text: `${g.score[0]} a ${g.score[1]} · ${g.overtimes ? `${g.overtimes} prorrogação(ões)` : `${margin} ponto(s) de diferença`}` });
    }
    if (highlights.length >= 8) break;
  }
  const allStreaks = rankings.filter((r) => r.gp && Math.abs(r.streak) >= 3).sort((a, b) => Math.abs(b.streak) - Math.abs(a.streak));
  const streaks = allStreaks.slice(0, 5);
  return { played: official.length, regularPlayed: played.length, rankings, standings, duels, highlights, streaks, totalStreaks: allStreaks.length, games: official };
}

export function franchisePulse(snapshot, teamId, scheduledGames = []) {
  const row = snapshot.standings.rows.get(teamId);
  if (!row) return null;
  const schedule = scheduledGames.filter((g) => (g.home === teamId || g.away === teamId) && g.type === 'regular');
  const total = schedule.length;
  const completed = Math.min(total || row.gp, row.gp);
  const recent = row.l10[0] + row.l10[1];
  const target = row.gp ? Math.max(0, Math.round(82 * row.pct)) : null;
  return {
    played: row.gp, total, completed, percent: total ? clamp(Math.round(100 * completed / total), 0, 100) : 0,
    wins: row.w, losses: row.l, seed: row.seed, zone: row.gp ? row.zone : null,
    streak: row.streak, lastTen: [...row.l10], trend: recent ? Math.round(100 * row.l10[0] / recent) : null,
    projectedWins: total && row.gp ? Math.round(total * row.pct) : target,
  };
}
