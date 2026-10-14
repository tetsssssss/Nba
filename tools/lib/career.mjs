// Carreira real por temporada a partir do endpoint de estatísticas da ESPN.

export const CAREER_COLUMNS = ['season', 'teamId', 'gp', 'gs', 'min', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'orb', 'drb', 'ast', 'stl', 'blk', 'tov', 'pf', 'pts'];

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const pair = (v) => String(v ?? '0-0').split('-').map(n);

/**
 * @param payload resposta de /athletes/{id}/stats
 * @param teamByEspnId Map<espnTeamId, franchiseId>
 * @returns { rows, bySeason, techRate, tenure(teamId), improvement }
 */
export function parseCareer(payload, teamByEspnId) {
  const averages = payload?.categories?.find((c) => c.name === 'averages');
  const misc = payload?.categories?.find((c) => c.name === 'miscellaneous');
  if (!averages?.statistics?.length) return { rows: [], bySeason: [], techRate: 0, lastTeams: [], improvement: 0 };
  const idx = Object.fromEntries(averages.labels.map((l, i) => [l, i]));
  const rows = averages.statistics.map((s) => {
    const v = s.stats;
    const [fgm, fga] = pair(v[idx.FG]);
    const [tpm, tpa] = pair(v[idx['3PT']]);
    const [ftm, fta] = pair(v[idx.FT]);
    return [
      s.season.year, teamByEspnId.get(String(s.teamId)) ?? null, n(v[idx.GP]), n(v[idx.GS]), n(v[idx.MIN]), fgm, fga, tpm, tpa, ftm, fta,
      n(v[idx.OR]), n(v[idx.DR]), n(v[idx.AST]), n(v[idx.STL]), n(v[idx.BLK]), n(v[idx.TO]), n(v[idx.PF]), n(v[idx.PTS]),
    ];
  });
  rows.sort((a, b) => a[0] - b[0]);

  // agregado por temporada (trocas no meio do ano geram uma linha por time)
  const map = new Map();
  for (const r of rows) {
    const cur = map.get(r[0]) ?? { year: r[0], gp: 0, min: 0, prod: 0 };
    cur.gp += r[2];
    cur.min += r[2] * r[4];
    cur.prod += r[2] * (r[18] + r[11] + r[12] + r[13] + r[14] + r[15] - r[16]);
    map.set(r[0], cur);
  }
  const bySeason = [...map.values()].map((s) => ({ year: s.year, gp: s.gp, mpg: s.gp ? s.min / s.gp : 0, prod36: s.min ? (s.prod / s.min) * 36 : 0 }));

  let techRate = 0;
  if (misc?.statistics?.length) {
    const mi = Object.fromEntries(misc.labels.map((l, i) => [l, i]));
    const recent = misc.statistics.filter((s) => s.season.year >= bySeason.at(-1).year - 1);
    const points = recent.reduce((a, s) => a + n(s.stats[mi.TECH]) + 2 * n(s.stats[mi.FLAG]) + 3 * n(s.stats[mi.EJECT]), 0);
    const minutes = bySeason.filter((s) => s.year >= bySeason.at(-1).year - 1).reduce((a, s) => a + s.gp * s.mpg, 0);
    techRate = minutes > 200 ? (points / minutes) * 1000 : 0;
  }

  const solid = bySeason.filter((s) => s.gp >= 20);
  let improvement = 0;
  if (solid.length >= 3) {
    const avg = (xs) => xs.reduce((a, s) => a + s.prod36, 0) / xs.length;
    improvement = Math.max(-2, Math.min(2, (avg(solid.slice(-2)) - avg(solid.slice(0, 2))) / 4));
  }
  return { rows, bySeason, techRate, lastTeams: rows.map((r) => [r[0], r[1]]), improvement };
}

/** Temporadas consecutivas mais recentes pelo time atual. */
export function tenureWith(lastTeams, teamId) {
  const seasons = [...new Set(lastTeams.map((t) => t[0]))].sort((a, b) => b - a);
  let tenure = 0;
  for (const year of seasons) {
    const teams = lastTeams.filter((t) => t[0] === year).map((t) => t[1]);
    if (teams.at(-1) !== teamId && !teams.includes(teamId)) break;
    tenure++;
    if (teams.length > 1 && teams[0] !== teamId) break; // chegou no meio daquela temporada
  }
  return tenure;
}
