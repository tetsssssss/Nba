// Play-in e playoffs da liga de 32 times. Motor puro, reproduzível via IDs persistidos.
// Nunca altera a classificação nem os registros da temporada regular.
export const ROUND_NAMES = {
  'playin-first': 'Play-in · primeira rodada',
  'playin-final': 'Play-in · vagas finais',
  'first-round': 'Primeira rodada',
  'semifinals': 'Semifinais de conferência',
  'conference-finals': 'Finais de conferência',
  finals: 'Finais da NBA',
  complete: 'Campeão definido',
};
const plusDays = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 864e5).toISOString().slice(0, 10);
const winner = (g) => (g.score[0] > g.score[1] ? g.home : g.away);
const loser = (g) => (g.score[0] > g.score[1] ? g.away : g.home);
const PAIRS = [[0, 7], [3, 4], [2, 5], [1, 6]];
const HOME_PATTERN = [0, 0, 1, 1, 0, 1, 0];

export function createPostseason(conferences, season, firstDate) {
  const post = { season, stage: 'playin-first', seedOrder: {}, seedWins: {}, qualified: {}, playin: {}, rounds: [], champion: null, runnerUp: null };
  const games = [];
  for (const conf of ['East', 'West']) {
    const order = conferences[conf]?.slice(0, 10);
    if (!order || order.length < 10) throw new Error(`Play-in sem dez equipes na conferência ${conf}.`);
    post.seedOrder[conf] = order.map((r) => r.id);
    for (const r of order) post.seedWins[r.id] = r.w;
    post.playin[conf] = {};
    games.push(gameRecord(season, `pi-${conf}-78`, firstDate, order[6].id, order[7].id, 'playin'));
    games.push(gameRecord(season, `pi-${conf}-910`, firstDate, order[8].id, order[9].id, 'playin'));
  }
  return { post, games };
}
const gameRecord = (season, code, date, home, away, type, extra = {}) => ({ id: `post-${season}-${code}`, season, date, home, away, type, status: 'scheduled', ...extra });

function startRound(post, stage, date, opponents) {
  post.stage = stage;
  const games = [];
  const round = { stage, series: opponents.map(({ conf, a, b, label }, i) => ({
    id: `${stage}-${conf}-${i}`, conf, teams: [a, b], label, wins: [0, 0], games: [], winner: null,
  })) };
  post.rounds.push(round);
  for (const series of round.series) games.push(scheduleSeries(post, series, date));
  return games;
}
function scheduleSeries(post, series, date) {
  const index = series.games.length;
  const highHome = HOME_PATTERN[index] === 0;
  const [home, away] = highHome ? series.teams : [...series.teams].reverse();
  const game = gameRecord(post.season, `${series.id}-g${index + 1}`, date, home, away, 'playoff', { seriesId: series.id, round: series.label, gameNumber: index + 1 });
  series.games.push(game.id);
  return game;
}
const roundsDone = (round) => round.series.every((s) => s.winner);

/**
 * Recebe todos os jogos do save, sem side effects. Devolve novos confrontos se a
 * fase anterior terminou; idempotente quando chamado várias vezes no mesmo dia.
 */
export function progressPostseason(post, games, today) {
  if (post.stage === 'complete') return [];
  const byId = new Map(games.map((g) => [g.id, g]));
  const next = plusDays(today, 2);
  if (post.stage === 'playin-first') {
    if (!['East', 'West'].every((c) => ['78', '910'].every((slot) => byId.get(`post-${post.season}-pi-${c}-${slot}`)?.status === 'final'))) return [];
    post.stage = 'playin-final';
    return ['East', 'West'].map((c) => {
      const g78 = byId.get(`post-${post.season}-pi-${c}-78`);
      const g910 = byId.get(`post-${post.season}-pi-${c}-910`);
      post.playin[c].seven = winner(g78);
      return gameRecord(post.season, `pi-${c}-final`, next, loser(g78), winner(g910), 'playin');
    });
  }
  if (post.stage === 'playin-final') {
    if (!['East', 'West'].every((c) => byId.get(`post-${post.season}-pi-${c}-final`)?.status === 'final')) return [];
    for (const c of ['East', 'West']) {
      const eighth = winner(byId.get(`post-${post.season}-pi-${c}-final`));
      post.playin[c].eight = eighth;
      post.qualified[c] = [...post.seedOrder[c].slice(0, 6), post.playin[c].seven, eighth];
    }
    const matchups = ['East', 'West'].flatMap((conf) => PAIRS.map(([i, j]) => ({ conf, a: post.qualified[conf][i], b: post.qualified[conf][j], label: 'Primeira rodada' })));
    return startRound(post, 'first-round', next, matchups);
  }
  const round = post.rounds.at(-1);
  if (!round) throw new Error('Estado dos playoffs inválido: rodada ausente.');
  const added = [];
  for (const series of round.series) {
    if (series.winner) continue;
    const finished = series.games.map((id) => byId.get(id)).filter((g) => g?.status === 'final');
    const wins = series.teams.map((t) => finished.filter((g) => winner(g) === t).length);
    series.wins = wins;
    if (wins.some((w) => w >= 4)) { series.winner = series.teams[wins.findIndex((w) => w >= 4)]; continue; }
    if (!series.games.some((id) => byId.get(id)?.status !== 'final')) added.push(scheduleSeries(post, series, next));
  }
  if (!roundsDone(round)) return added;
  if (round.stage === 'finals') {
    post.stage = 'complete';
    post.champion = round.series[0].winner;
    post.runnerUp = round.series[0].teams.find((id) => id !== post.champion);
    return [];
  }
  if (round.stage === 'first-round' || round.stage === 'semifinals') {
    const stage = round.stage === 'first-round' ? 'semifinals' : 'conference-finals';
    const label = ROUND_NAMES[stage];
    const opponents = ['East', 'West'].flatMap((conf) => {
      const series = round.series.filter((s) => s.conf === conf);
      return [[0, 1], [2, 3]].slice(0, series.length / 2).map(([a, b]) => {
        const sides = [series[a].winner, series[b].winner];
        sides.sort((x, y) => post.seedOrder[conf].indexOf(x) - post.seedOrder[conf].indexOf(y));
        return { conf, a: sides[0], b: sides[1], label };
      });
    });
    return startRound(post, stage, next, opponents);
  }
  const east = round.series.find((s) => s.conf === 'East').winner;
  const west = round.series.find((s) => s.conf === 'West').winner;
  const ordered = [east, west].sort((a, b) => (post.seedWins[b] - post.seedWins[a]) || a.localeCompare(b));
  return startRound(post, 'finals', next, [{ conf: 'Finals', a: ordered[0], b: ordered[1], label: 'Finais da NBA' }]);
}
export const postseasonGames = (all, season) => all.filter((g) => g.season === season && (g.type === 'playin' || g.type === 'playoff')).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
