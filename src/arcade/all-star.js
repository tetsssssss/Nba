// Seleção reprodutível por conferência. Convocação baseada em OVR, não é um evento da temporada.
import { createRng, hashString } from '../core/rng.js';
const rated = (p) => Number.isFinite(p.ovr) && Number.isFinite(p.id);
const rank = (a, b) => b.ovr - a.ovr || String(a.id).localeCompare(String(b.id));
export function allStarSelections(players, teams, size = 12) {
  const byTeam = new Map(teams.map((t) => [t.id, t.conference]));
  const eligible = players.filter((p) => rated(p) && p.teamId && byTeam.has(p.teamId));
  const east = eligible.filter((p) => byTeam.get(p.teamId) === 'East').sort(rank).slice(0, size);
  const west = eligible.filter((p) => byTeam.get(p.teamId) === 'West').sort(rank).slice(0, size);
  return [east, west];
}
export function allStarTeam(players, conference, index = 0) {
  const name = conference === 'East' ? 'All-Stars Leste' : 'All-Stars Oeste';
  const t = { id: conference === 'East' ? 'AS_E' : 'AS_W', name, fullName: name,
    colors: index === 0 ? ['#2975ff', '#e9f3ff'] : ['#ef3c6c', '#fff0f5'] };
  return { ...t, team: t, roster: players, aiCoach: true };
}
// Concurso de três pontos: cinco racks, cinco bolas cada; última bola vale 2.
export function threePointRound(player, seed) {
  const rng = createRng(`3pt:${seed}:${player.id}`);
  const ratingOf = value => Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 50;
  const rating = ratingOf(player.attributes?.threePoint) * 0.7 + ratingOf(player.attributes?.catchAndShoot) * 0.3;
  const p = Math.min(.79, Math.max(.2, 0.28 + (rating - 50) * 0.008));
  const racks = Array.from({ length: 5 }, () => Array.from({ length: 5 }, (_, i) => rng.chance(p) ? (i === 4 ? 2 : 1) : 0));
  const balls = racks.flat();
  const made = balls.filter(value => value > 0).length;
  return { id: player.id, name: player.name, racks, points: balls.reduce((a, b) => a + b, 0),
    made, attempts: balls.length, accuracy: `${(100 * made / balls.length).toFixed(1)}%`, total: 30 };
}
export function threePointContest(players, seed = 'allstar') {
  return [...players].filter(rated).sort((a, b) => (b.attributes?.threePoint ?? 0) - (a.attributes?.threePoint ?? 0)).slice(0, 8)
    .map((p) => threePointRound(p, seed)).sort((a, b) => b.points - a.points || String(a.id).localeCompare(String(b.id)));
}
// Concurso de enterradas: quatro critérios explícitos, com variação reprodutível.
export function dunkContest(players, seed = 'dunks') {
  const rng = createRng(`dunks:${seed}`);
  return [...players].filter(rated).sort((a, b) => (b.attributes?.dunk ?? 0) - (a.attributes?.dunk ?? 0)).slice(0, 6)
    .map((p) => {
      const a = p.attributes || {};
      const base = 0.55 * (a.dunk ?? 50) + 0.25 * (a.vertical ?? 50) + 0.2 * (a.shotCreation ?? 50);
      const attempts = [0, 1].map(() => Math.max(25, Math.min(50, Math.round(18 + base * 0.30 + rng.float(-6, 6)))));
      return { id: p.id, name: p.name, attempts, points: attempts.reduce((s, x) => s + x, 0) };
    }).sort((a, b) => b.points - a.points || String(a.id).localeCompare(String(b.id)));
}

/** Draft de capitães avulso: seleciona os melhores 24 e distribui em snake draft reproduzível. */
export function captainsDraft(players, { size = 12, seed = 'captains' } = {}) {
  const pool = [...players].filter(rated).sort(rank).slice(0, size * 2);
  if (pool.length < size * 2) throw Error('Jogadores insuficientes para o draft All-Star.');
  const [first, second, ...rest] = pool;
  const ordered = [...rest].sort((a,b)=>b.ovr-a.ovr || hashString(`${seed}:${a.id}`)-hashString(`${seed}:${b.id}`));
  const draft = [[first],[second]];
  for (let i = 0; i < ordered.length; i++) {
    // Serpentina: equipes alternam a vantagem de escolha a cada dois picks.
    const owner = Math.floor(i / 2) % 2 === 0 ? [1, 0][i % 2] : [0, 1][i % 2];
    draft[owner].push(ordered[i]);
  }
  return draft;
}

/** MVP de um amistoso All-Star: desempenho de box score, nunca concedido na carreira. */
export function exhibitionMvp(record) {
  if (!Array.isArray(record?.box)) return null;
  const rows = record.box.flatMap((team, side) => (team.players ?? []).map((p) => ({
    id:p.id, name:p.name, side, pts:p.pts ?? 0, reb:(p.orb ?? 0)+(p.drb ?? 0), ast:p.ast ?? 0, stl:p.stl ?? 0,
    impact:(p.pts ?? 0) + .6*((p.orb??0)+(p.drb??0)) + .8*(p.ast??0) + (p.stl??0),
  })));
  return rows.sort((a,b)=>b.impact-a.impact || b.pts-a.pts || String(a.id).localeCompare(String(b.id)))[0] ?? null;
}
