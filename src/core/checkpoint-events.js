import { checkpointBefore } from './saves.js';
import { markDirty } from './world.js';
/** Idempotência por temporada, compatível com saves antigos sem checkpointEvents. */
export async function checkpointForNextDay(world) {
  if (world.calendar.phase !== 'preseason') return null;
  const start = world.league.calendar?.regularSeasonStart;
  if (!start || world.calendar.date >= start) return null;
  const nextDate = new Date(`${world.calendar.date}T12:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  if (nextDate.toISOString().slice(0, 10) < start) return null;
  const marker = `season-start:${world.calendar.season}`;
  if (world.career.checkpointEvents?.includes(marker)) return null;
  const copy = await checkpointBefore('season-start');
  if (copy) {
    world.career.checkpointEvents ??= [];
    world.career.checkpointEvents.push(marker);
    markDirty('meta', 'career');
  }
  return copy;
}
