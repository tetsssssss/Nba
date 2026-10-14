/**
 * Projeções de APRESENTAÇÃO, sem alterar mundo, temporada, contrato ou save.
 * Mantê-las puras permite testar as páginas de Liga e Jogo sem um navegador.
 */
const safeNum = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function coreStrength(roster) {
  const top = [...(roster ?? [])].filter((p) => Number.isFinite(p?.ovr))
    .sort((a, b) => b.ovr - a.ovr).slice(0, 8);
  if (!top.length) return null;
  const weights = top.map((_, i) => i < 5 ? 1.4 : 0.6);
  return top.reduce((sum, p, i) => sum + p.ovr * weights[i], 0) /
    weights.reduce((a, b) => a + b, 0);
}

export function franchiseSnapshot(teams, getRoster, getPayroll, getAge) {
  const rows = teams.map((team) => {
    const roster = getRoster(team.id);
    const payroll = getPayroll(team.id);
    const ages = roster.map((player) => getAge(player)).filter((v) => Number.isFinite(v));
    return {
      team,
      roster,
      payroll,
      strength: coreStrength(roster),
      avgAge: ages.length ? ages.reduce((a, v) => a + v, 0) / ages.length : null,
      wins: safeNum(team.record?.wins ?? team.record?.w ?? team.lastSeason?.wins),
    };
  });
  return {
    rows,
    teams: rows.length,
    athletes: rows.reduce((n, r) => n + r.roster.length, 0),
    strongest: rows.filter((r) => r.strength != null).sort((a, b) => b.strength - a.strength)[0] ?? null,
  };
}

/** UI-only filter: no persistence or calendar logic. */
export function filterFranchises(rows, { search = '', conference = 'all', order = 'strength' } = {}) {
  const key = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const needle = key(search);
  const result = rows.filter(({ team }) =>
    (conference === 'all' || team.conference === conference) &&
    (!needle || key(`${team.fullName} ${team.name} ${team.id} ${team.division}`).includes(needle)));
  const numeric = (r) => {
    switch (order) {
      case 'wins': return r.wins;
      case 'age': return r.avgAge ?? -1;
      case 'payroll': return r.payroll?.total ?? 0;
      default: return r.strength ?? -1;
    }
  };
  return result.sort((a, b) => order === 'name'
    ? a.team.fullName.localeCompare(b.team.fullName, 'pt-BR')
    : numeric(b) - numeric(a) || a.team.fullName.localeCompare(b.team.fullName, 'pt-BR'));
}

/** Scoreboard-only. Source game is never modified. Home is index 0; away is index 1. */
export function gamePresentation(game, detail) {
  const score = Array.isArray(game?.score) ? game.score : [];
  const home = safeNum(score[0]);
  const away = safeNum(score[1]);
  const complete = game?.status === 'final' && score.length === 2 && score.every((n) => Number.isFinite(Number(n)));
  const difference = complete ? Math.abs(home - away) : null;
  const result = !complete ? 'scheduled' : home === away ? 'tied' : home > away ? 'home' : 'away';
  const periods = Array.isArray(detail?.periods) && Array.isArray(detail.periods[0]) && Array.isArray(detail.periods[1])
    ? Array.from({ length: Math.max(detail.periods[0].length, detail.periods[1].length) }, (_, i) => ({
      number: i + 1,
      label: i < 4 ? `${i + 1}º período` : `${i - 3}ª prorrogação`,
      home: safeNum(detail.periods[0][i]),
      away: safeNum(detail.periods[1][i]),
    })) : [];
  const leaders = [0, 1].map((teamIndex) => {
    const players = detail?.box?.[teamIndex]?.players;
    if (!Array.isArray(players) || !players.length) return null;
    const first = [...players].sort((a, b) => safeNum(b.pts) - safeNum(a.pts))[0];
    return { name: first.name ?? 'Jogador', points: safeNum(first.pts), id: first.id ?? null };
  });
  return { complete, result, difference, periods, leaders, home, away };
}
