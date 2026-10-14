// Contexto esportivo e financeiro de uma franquia: força, ranking, necessidades por posição e
// situação de cap. Funções puras sobre o `world`; usadas por valuation, picks, IA e Draft.
import { teamPayroll } from '../contracts/cap.js';
import { POSITIONS } from '../players/attributes.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const WEIGHTS = [0.17, 0.145, 0.125, 0.11, 0.095, 0.08, 0.07, 0.06, 0.05, 0.04];

export const ageOf = (world, player) => {
  if (!player?.birthDate) return player?.age ?? 26;
  const [y, m, d] = world.calendar.date.split('-').map(Number);
  const [by, bm, bd] = player.birthDate.split('-').map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
};

/**
 * Jogadores do elenco (padrão, two-way e camp), do melhor para o pior.
 * O índice por franquia é memoizado por `world.rosterVersion` (bumpRosters() em toda mudança de elenco ou Overall).
 */
export function rosterOf(world, teamId) {
  const idx = world.__rosterIdx;
  if (!idx || idx.version !== world.rosterVersion || idx.size !== world.players.size) {
    const map = new Map();
    for (const p of world.players.values()) if (p.teamId) (map.get(p.teamId) ?? map.set(p.teamId, []).get(p.teamId)).push(p);
    for (const list of map.values()) list.sort((a, b) => b.ovr - a.ovr || a.id - b.id);
    world.__rosterIdx = { version: world.rosterVersion, size: world.players.size, map };
  }
  return [...(world.__rosterIdx.map.get(teamId) ?? [])];
}

/** Força do elenco (0-100): média ponderada dos 10 melhores; lesionados "Out" pesam menos. */
export function rosterRating(players) {
  const list = [...players].filter((p) => p.rosterStatus !== 'camp').sort((a, b) => b.ovr - a.ovr).slice(0, 10);
  if (!list.length) return 0;
  let acc = 0;
  let total = 0;
  list.forEach((p, i) => {
    const w = WEIGHTS[i] * (p.injury?.status === 'Out' ? 0.55 : 1);
    acc += w * p.ovr;
    total += w;
  });
  return acc / total;
}

let tableCache = { key: null, value: null };

/** Tabela da liga: força, campanha e ranking de cada franquia. Memoizada por data e versão dos elencos. */
export function leagueTable(world) {
  const key = `${world.saveId}|${world.calendar.date}|${world.rosterVersion ?? 0}`;
  if (tableCache.key === key) return tableCache.value;
  const byTeam = new Map();
  for (const p of world.players.values()) if (p.teamId) (byTeam.get(p.teamId) ?? byTeam.set(p.teamId, []).get(p.teamId)).push(p);
  const rows = [...world.teams.values()].map((team) => {
    const roster = byTeam.get(team.id) ?? [];
    const rec = team.record ?? { wins: 0, losses: 0 };
    const gp = rec.wins + rec.losses;
    const rating = rosterRating(roster);
    const last = team.lastSeason;
    const lastPct = last ? last.wins / Math.max(1, last.wins + last.losses) : null;
    // Antes da temporada a campanha do ano anterior pesa mais; depois a atual domina.
    const weight = clamp(gp / 40, 0, 1);
    const prior = lastPct ?? 0.5;
    const winPct = gp ? (rec.wins / gp) * weight + prior * (1 - weight) : prior;
    return { teamId: team.id, rating, winPct, gp, wins: rec.wins, losses: rec.losses, size: roster.length, expansion: team.expansion && roster.length === 0 };
  });
  const sorted = [...rows].sort((a, b) => b.rating * 0.65 + b.winPct * 35 - (a.rating * 0.65 + a.winPct * 35) || a.teamId.localeCompare(b.teamId));
  sorted.forEach((r, i) => { r.rank = i + 1; });
  const table = { rows: new Map(rows.map((r) => [r.teamId, r])), ranking: sorted.map((r) => r.teamId), count: rows.length };
  tableCache = { key, value: table };
  return table;
}

/** Projeção de slot de Draft de uma franquia (1 = pior campanha esperada). */
export function projectedPickSlot(world, teamId, yearsAhead = 0) {
  const table = leagueTable(world);
  const row = table.rows.get(teamId);
  const n = table.count;
  const fromWorst = n - (row?.rank ?? Math.ceil(n / 2)) + 1; // rank 32 → slot 1
  const mean = (n + 1) / 2;
  const regress = Math.pow(0.55, yearsAhead);
  return clamp(mean + (fromWorst - mean) * regress, 1, n);
}

export function payrollFor(world, teamId, season = world.calendar.season, roster = null) {
  const team = world.teams.get(teamId);
  return teamPayroll(roster ?? rosterOf(world, teamId), world.contracts, team, world.league.cap, season, world.career.capMode);
}

/** Necessidade por posição (0 = confortável, ~1.5 = urgente) e profundidade do elenco. */
export function teamNeeds(world, teamId, { starter = 76, roster: override = null } = {}) {
  const roster = (override ?? rosterOf(world, teamId)).filter((p) => p.rosterStatus !== 'camp');
  const need = {};
  for (const pos of POSITIONS) {
    const here = roster.filter((p) => p.positions[0] === pos || p.positions[1] === pos).sort((a, b) => b.ovr - a.ovr);
    const top = here[0]?.ovr ?? 55;
    const second = here[1]?.ovr ?? 55;
    need[pos] = clamp((starter - top) / 10, 0, 1.2) + clamp((starter - 8 - second) / 22, 0, 0.45) + (here.length < 2 ? 0.25 : 0);
  }
  const standard = roster.filter((p) => p.rosterStatus === 'standard');
  const healthy = standard.filter((p) => p.injury?.status !== 'Out');
  const depth = clamp((11 - healthy.length) / 4, 0, 1.2);
  const ordered = Object.entries(need).sort((a, b) => b[1] - a[1]);
  return { byPosition: need, depth, top: ordered.filter(([, v]) => v > 0.25).map(([pos]) => pos), standardCount: standard.length, healthyCount: healthy.length };
}

/** Situação de cap de uma franquia depois de uma mudança hipotética de folha. */
export function capStanding(cap, total, capMode = 'full') {
  const advanced = capMode === 'advanced' || capMode === 'full';
  const tax = capMode !== 'basic';
  if (advanced && total > cap.secondApron) return 'second-apron';
  if (advanced && total > cap.firstApron) return 'first-apron';
  if (tax && total > cap.luxuryTax) return 'tax';
  return total > cap.salaryCap ? 'over-cap' : 'under-cap';
}
