// Jogadores observados (favoritos) da carreira aberta. Fica no save, não no LocalStorage.
import { getWorld, markDirty } from './world.js';
import { emit } from './events.js';

const list = () => (getWorld().career.watchlist ??= []);

export const isWatched = (playerId) => list().includes(playerId);
export const watchedIds = () => [...list()];

export function toggleWatched(playerId) {
  const ids = list();
  const i = ids.indexOf(playerId);
  if (i >= 0) ids.splice(i, 1);
  else ids.push(playerId);
  markDirty('meta', 'career');
  emit('watchlist:changed', playerId);
  return i < 0;
}
