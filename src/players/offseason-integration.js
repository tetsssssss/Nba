// Integração idempotente opcional para a passagem de temporada implementada separadamente.
// Chamar UMA VEZ no encerramento da offseason, com o ano que terminou, antes de limpar seasonStats.
import { simulateOffseasonDevelopment } from './development.js';
import { positionOverall } from './overall.js';
import { markDirty } from '../core/world.js';
export function applyOffseasonDevelopment(world, completedSeason) {
  if (!Number.isInteger(completedSeason)) throw new Error('Informe a temporada concluída.');
  const marker = `development:${completedSeason}`;
  if (world.career.lifecycleEvents?.includes(marker)) return { applied: false, changed: 0 };
  const ageOf = (p) => p.age ?? (p.birthDate ? completedSeason - Number(p.birthDate.slice(0,4)) : 27);
  const developed = simulateOffseasonDevelopment([...world.players.values()], { year: completedSeason, ageOf, statsById: world.seasonStats });
  let changed = 0;
  for (const candidate of developed) {
    const old = world.players.get(candidate.id);
    const delta = candidate.development.delta;
    if (delta) {
      old.attributes = candidate.attributes;
      old.ovr = positionOverall(old.attributes,old.positions[0]);
      old.development = candidate.development;
      markDirty('players',old.id);
      changed++;
    }
  }
  world.career.lifecycleEvents ??= [];
  world.career.lifecycleEvents.push(marker);
  markDirty('meta','career');
  return { applied: true, changed };
}
