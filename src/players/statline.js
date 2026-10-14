// Leitura das linhas de carreira (arrays compactos gravados em careerStats).
export const COL = { season: 0, team: 1, gp: 2, gs: 3, min: 4, fgm: 5, fga: 6, tpm: 7, tpa: 8, ftm: 9, fta: 10, orb: 11, drb: 12, ast: 13, stl: 14, blk: 15, tov: 16, pf: 17, pts: 18 };

/** Médias da temporada mais recente, somando as passagens por mais de um time. */
export function lastSeasonLine(career) {
  const rows = career?.rows;
  if (!rows?.length) return null;
  const season = Math.max(...rows.map((r) => r[COL.season]));
  const last = rows.filter((r) => r[COL.season] === season);
  const gp = last.reduce((a, r) => a + r[COL.gp], 0);
  if (!gp) return null;
  const avg = (c) => last.reduce((a, r) => a + r[c] * r[COL.gp], 0) / gp;
  const made = (m, a) => (avg(a) > 0 ? (avg(m) / avg(a)) * 100 : null);
  return {
    season, gp, min: avg(COL.min), pts: avg(COL.pts), reb: avg(COL.orb) + avg(COL.drb), ast: avg(COL.ast), stl: avg(COL.stl), blk: avg(COL.blk), tov: avg(COL.tov),
    fgPct: made(COL.fgm, COL.fga), tpPct: made(COL.tpm, COL.tpa), ftPct: made(COL.ftm, COL.fta), tpm: avg(COL.tpm),
  };
}
