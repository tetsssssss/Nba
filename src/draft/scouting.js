// Scouting: o que o usuário PODE saber sobre um prospecto. A verdade (attributes/ovr/potential/baseRank)
// só aparece no God Mode; as demais visões têm erro proporcional a career.modifiers.scoutingNoise e
// diminuem com treinos individuais (workouts). Todo ruído é estável (semente), então reabrir a tela não muda a nota.
import { createRng } from '../core/rng.js';
import { godModeAllowed } from '../core/godmode-permissions.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const SCOUTS = [
  { id: 'sc-1', name: 'Marco Ribeiro', role: 'Chefe de scouting', potentialBias: 0, noise: 0.8, focus: 'Visão geral' },
  { id: 'sc-2', name: 'Dana Whitfield', role: 'Scout universitária', potentialBias: 1.4, noise: 1.0, focus: 'Aposta no teto de potencial' },
  { id: 'sc-3', name: 'Yusuf Demir', role: 'Scout internacional', potentialBias: -1.2, noise: 1.15, focus: 'Prefere produto acabado' },
];
export const MAX_WORKOUTS = 15;

const fogOn = (world) => world.career.systems?.scoutingFog !== false;
export const noiseLevel = (world) => (fogOn(world) ? world.career.modifiers?.scoutingNoise ?? 1 : 0);

export function workoutsDone(world, prospectId) {
  return world.draft?.workouts?.[prospectId] ?? 0;
}
export function workoutsUsed(world) {
  return Object.values(world.draft?.workouts ?? {}).reduce((a, n) => a + n, 0);
}

/** Desvio-padrão (pontos de rating) do erro de uma avaliação. 3 treinos reduzem ~60%. */
export function noiseSd(world, prospect, scout = SCOUTS[0]) {
  const reduction = 1 - Math.min(3, workoutsDone(world, prospect.id)) * 0.2;
  return 3.1 * noiseLevel(world) * scout.noise * reduction;
}

/** Avaliação de um scout: Overall e potencial estimados, nota e ranking pessoal (ranking vem de `board`). */
export function scoutReport(world, prospect, scout = SCOUTS[0]) {
  if (godModeAllowed(world.career)) return { scoutId: 'god', ovr: prospect.ovr, potential: prospect.potential, ovrLow: prospect.ovr, ovrHigh: prospect.ovr, potLow: prospect.potential, potHigh: prospect.potential, sd: 0, exact: true };
  const sd = noiseSd(world, prospect, scout);
  const rng = createRng(`${world.saveId}:scout:${scout.id}:${prospect.id}:${world.career.startSeason}`);
  const ovr = clamp(Math.round(prospect.ovr + rng.normal() * sd * 0.6), 45, 90);
  const potential = clamp(Math.round(prospect.potential + scout.potentialBias + rng.normal() * sd), ovr, 99);
  const spread = Math.max(1, Math.round(sd * 0.9));
  return { scoutId: scout.id, ovr, potential, ovrLow: ovr - Math.ceil(spread / 2), ovrHigh: ovr + Math.ceil(spread / 2), potLow: potential - spread, potHigh: potential + spread, sd, exact: false };
}

/** Consenso: média dos scouts (com os treinos já refletidos no ruído). */
export function consensus(world, prospect) {
  if (godModeAllowed(world.career)) return scoutReport(world, prospect, SCOUTS[0]);
  const reports = SCOUTS.map((s) => scoutReport(world, prospect, s));
  const avg = (key) => Math.round(reports.reduce((a, r) => a + r[key], 0) / reports.length);
  const sd = reports.reduce((a, r) => a + r.sd, 0) / reports.length / Math.sqrt(reports.length);
  const spread = Math.max(1, Math.round(sd * 0.9));
  const ovr = avg('ovr');
  const potential = avg('potential');
  return { scoutId: 'consenso', ovr, potential, ovrLow: ovr - Math.ceil(spread / 2), ovrHigh: ovr + Math.ceil(spread / 2), potLow: potential - spread, potHigh: potential + spread, sd, exact: false, reports };
}

/** Nota composta usada para ordenar: potencial pesa mais que o presente nos prospectos jovens. */
export const compositeScore = (r, age) => r.ovr * (age >= 22 ? 0.62 : 0.45) + r.potential * (age >= 22 ? 0.38 : 0.55);

/**
 * Big board do usuário: ranking pelo consenso dos scouts (com ruído) — não pelo `baseRank` verdadeiro.
 * Devolve cada prospecto com ranking por scout, mock draft público (posição estimada) e sinais de steal/bust.
 */
export function bigBoard(world, prospects) {
  const rows = prospects.map((p) => {
    const cons = consensus(world, p);
    const mockNoise = createRng(`${world.saveId}:mock:${p.id}`).normal() * (3 + 0.07 * p.baseRank) * Math.max(0.35, noiseLevel(world));
    return { prospect: p, consensus: cons, score: compositeScore(cons, p.age), mockKey: p.baseRank + mockNoise };
  });
  const byScore = [...rows].sort((a, b) => b.score - a.score || a.prospect.id.localeCompare(b.prospect.id));
  byScore.forEach((r, i) => { r.rank = i + 1; });
  [...rows].sort((a, b) => a.mockKey - b.mockKey).forEach((r, i) => { r.mockRank = i + 1; });
  for (const scout of SCOUTS) {
    [...rows].sort((a, b) => compositeScore(scoutReport(world, b.prospect, scout), b.prospect.age) - compositeScore(scoutReport(world, a.prospect, scout), a.prospect.age)).forEach((r, i) => { (r.scoutRanks ??= {})[scout.id] = i + 1; });
  }
  for (const r of rows) {
    const ranks = Object.values(r.scoutRanks);
    r.disagreement = Math.max(...ranks) - Math.min(...ranks);
    r.signal = r.mockRank - r.rank >= 9 ? 'steal' : r.rank - r.mockRank >= 9 ? 'bust' : r.disagreement >= 14 ? 'divided' : null;
  }
  return byScore;
}

export const SIGNAL_LABEL = { steal: 'Possível steal', bust: 'Risco de bust', divided: 'Scouts divididos' };

/** Marca/limpa observações do usuário sobre um prospecto. */
export function setScoutingNote(prospect, patch) {
  prospect.scouting = { notes: '', favorite: false, ...(prospect.scouting ?? {}), ...patch };
}
