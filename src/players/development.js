// Progressão determinística para invocação única na transição de offseason.
// A integração com a fase de offseason depende do módulo de playoffs/ano atualizado.
import { createRng } from '../core/rng.js';
const cap = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function developPlayer(player, { age = 27, minutes = 0, injured = false, seed = '' } = {}) {
  const rng = createRng(`development:${seed}:${player.id}`);
  const potential = Math.max(player.ovr ?? 50, player.potential ?? player.ovr ?? 50);
  const prime = age <= 22 ? 1.2 : age <= 26 ? 0.7 : age <= 29 ? 0.1 : age <= 33 ? -0.5 : -1.25;
  const playing = cap(minutes / 24, 0, 1.4) - 0.5;
  const target = prime + playing * 0.5 - (injured ? 0.6 : 0) + (rng.next() - 0.5) * 1.5;
  const limited = target > 0 ? Math.min(target, Math.max(0, potential - (player.ovr ?? 50)) * 0.35) : target;
  const delta = cap(Math.round(limited), -3, 3);
  const attributes = Object.fromEntries(Object.entries(player.attributes).map(([key, value]) => [key, typeof value === 'number' ? cap(value + delta, 1, 99) : value]));
  return { ...player, attributes, development: { age, delta, seasonSeed: seed } };
}
export function simulateOffseasonDevelopment(players, { year, statsById = new Map(), ageOf = (p) => p.age ?? 27 } = {}) {
  return players.map((player) => developPlayer(player, { age: ageOf(player), minutes: statsById.get(player.id)?.min / Math.max(1, statsById.get(player.id)?.gp ?? 1) || 0, injured: player.injury?.status === 'Out', seed: year }));
}
