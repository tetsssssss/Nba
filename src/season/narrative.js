// Narrativa derivada de fatos do simulador, sem eventos fictícios lançados ao acaso.
export function teamSeasonSummary(teamId, games) {
  const played = (games ?? []).filter((g) => g.status === 'final' && (g.home === teamId || g.away === teamId));
  const wins = played.filter((g) => (g.home === teamId ? g.score[0] > g.score[1] : g.score[1] > g.score[0]));
  const close = played.filter((g) => Math.abs(g.score[0] - g.score[1]) <= 5);
  const overtimes = played.filter((g) => g.overtimes > 0);
  const margins = played.map((g) => (g.home === teamId ? g.score[0] - g.score[1] : g.score[1] - g.score[0]));
  return { games: played.length, wins: wins.length, losses: played.length - wins.length, closeGames: close.length, overtimeGames: overtimes.length, bestWin: margins.length ? Math.max(0, ...margins) : 0, worstLoss: margins.length ? Math.max(0, ...margins.map((x) => -x)) : 0 };
}
export function seasonAwards(stats, players) {
  const records = [...stats].filter((s) => s.gp >= 20 && players.has(s.playerId));
  const sorted = [...records].sort((a,b) => ((b.pts / b.gp) + (b.ast / b.gp)*1.5 + ((b.orb+b.drb)/b.gp)*1.1 + (b.stl+b.blk)/b.gp*2.5) - ((a.pts / a.gp) + (a.ast / a.gp)*1.5 + ((a.orb+a.drb)/a.gp)*1.1 + (a.stl+a.blk)/a.gp*2.5));
  return { bestStatisticalSeason: sorted[0] ? { playerId: sorted[0].playerId, season: sorted[0].season } : null };
}
