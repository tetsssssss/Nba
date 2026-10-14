/** Evolution 03–10. Projeções PURAS de apresentação. Nenhuma alteração no estado do universo. */
import { ATTRIBUTE_GROUPS } from '../players/attributes.js';
import { COL } from '../players/statline.js';

const finite = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
export const bounded = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, finite(v)));
export const safeRate = (made, attempted) => finite(attempted) > 0 ? 100 * finite(made) / finite(attempted) : null;

export function playerFingerprint(player, groups = ATTRIBUTE_GROUPS) {
  return groups.filter((g) => g.attributes?.length).map((g) => {
    const values = g.attributes.map((a) => player?.attributes?.[a.key]).filter((v) => typeof v === 'number' && Number.isFinite(v));
    return { id: g.id ?? g.key ?? g.label, label: g.label, value: values.length ? bounded(values.reduce((s, v) => s + v, 0) / values.length) : null };
  });
}

export function fingerprintSummary(fingerprint) {
  const valid = fingerprint.filter((g) => g.value !== null).sort((a, b) => b.value - a.value);
  if (!valid.length) return { best: null, secondary: null, weakest: null, spread: null };
  return { best: valid[0], secondary: valid[1] ?? null, weakest: valid.at(-1), spread: valid[0].value - valid.at(-1).value };
}

export function seasonPerformanceSeries(career, limit = 9) {
  const bySeason = new Map();
  for (const row of career?.rows ?? []) {
    const season = Number(row?.[COL.season]);
    const gp = finite(row?.[COL.gp]);
    if (!Number.isFinite(season) || gp <= 0) continue;
    const stat = bySeason.get(season) ?? { season, gp: 0, points: 0, rebounds: 0, assists: 0 };
    stat.gp += gp;
    stat.points += gp * finite(row[COL.pts]);
    stat.rebounds += gp * (finite(row[COL.orb]) + finite(row[COL.drb]));
    stat.assists += gp * finite(row[COL.ast]);
    bySeason.set(season, stat);
  }
  return [...bySeason.values()].sort((a, b) => a.season - b.season).slice(-limit).map((row) => ({
    season: row.season,
    gp: row.gp,
    pts: row.points / row.gp,
    reb: row.rebounds / row.gp,
    ast: row.assists / row.gp,
  }));
}

export function boxTeamMetrics(side) {
  const s = side?.total;
  if (!s) return null;
  const pts = finite(s.pts), fga = finite(s.fga), fgm = finite(s.fgm);
  const tpm = finite(s.tpm), tpa = finite(s.tpa), ast = finite(s.ast), tov = finite(s.tov);
  const orb = finite(s.orb), drb = finite(s.drb);
  return {
    pts, fga, fgm, tpm, tpa, ast, tov, rebounds: orb + drb,
    fg: safeRate(fgm, fga), three: safeRate(tpm, tpa),
    efg: fga > 0 ? 100 * (fgm + .5 * tpm) / fga : null,
    astTo: tov > 0 ? ast / tov : ast > 0 ? null : 0,
  };
}

export function gameFlow(periods) {
  const safe = Array.isArray(periods) ? periods : [];
  if (!safe.length) return { steps: [], biggestHome: null, biggestAway: null, momentum: null };
  let home = 0, away = 0, biggestHome = 0, biggestAway = 0;
  const steps = safe.map((p, i) => {
    home += finite(p.home); away += finite(p.away);
    biggestHome = Math.max(biggestHome, home - away);
    biggestAway = Math.max(biggestAway, away - home);
    return { label: p.label ?? `Q${i + 1}`, home, away, margin: home - away, homePoints: finite(p.home), awayPoints: finite(p.away) };
  });
  const changes = steps.filter((step, i) => i && Math.sign(step.margin) !== Math.sign(steps[i - 1].margin) && step.margin !== 0).length;
  return { steps, biggestHome, biggestAway, leadChangesAtPeriods: changes, momentum: steps.at(-1)?.margin ?? null };
}

export function leagueLeaders(players, field, limit = 8) {
  return [...players].filter((p) => Number.isFinite(Number(p?.[field])))
    .sort((a, b) => finite(b[field]) - finite(a[field]) || String(a.name).localeCompare(String(b.name)))
    .slice(0, limit).map((p, i) => ({ id: p.id, name: p.name, teamId: p.teamId, value: finite(p[field]), rank: i + 1 }));
}

export function teamLandscape(teams, players, limit = 32) {
  const byTeam = new Map();
  for (const p of players) {
    if (!p.teamId) continue;
    const entry = byTeam.get(p.teamId) ?? [];
    entry.push(p); byTeam.set(p.teamId, entry);
  }
  return [...teams].map((t) => {
    const roster = byTeam.get(t.id) ?? [];
    const stars = [...roster].filter((p) => Number.isFinite(p.ovr)).sort((a, b) => b.ovr - a.ovr).slice(0, 5);
    const strength = stars.length ? stars.reduce((s, p) => s + p.ovr, 0) / stars.length : null;
    return { id: t.id, name: t.fullName, team: t, strength, athletes: roster.length, stars: stars.length, top: stars[0] ?? null };
  }).sort((a, b) => (b.strength ?? -1) - (a.strength ?? -1) || a.name.localeCompare(b.name)).slice(0, limit);
}
