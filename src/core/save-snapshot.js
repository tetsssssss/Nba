/**
 * Um lote de gravação é isolado da fila editável: falhas restauram exatamente os
 * IDs e registros originais. Injeção de adaptadores permite testes de falha real.
 */
const META_KEYS = { career: 'career', calendar: 'calendar', league: 'league', history: 'history' };
const PENDING_KEYS = ['news', 'transactions', 'games', 'boxScores'];

export async function commitSaveSnapshot(w, { write, updateSummary, summarizeWorld, notify = () => {} }) {
  const dirty = w.dirty;
  const pending = w.pending;
  w.dirty = Object.fromEntries(Object.keys(dirty).map((store) => [store, new Set()]));
  w.pending = Object.fromEntries(PENDING_KEYS.map((store) => [store, []]));
  const writes = {};
  for (const store of ['teams', 'players', 'contracts', 'coaches', 'owners', 'arenas']) {
    if (dirty[store]?.size) writes[store] = [...dirty[store]].map((id) => w[store].get(id)).filter(Boolean);
  }
  if (dirty.meta?.size) writes.meta = [...dirty.meta].map((key) => ({ key, value: w[META_KEYS[key]] }));
  if (dirty.games?.size) writes.games = [...dirty.games].map((id) => w.games.get(id)).filter(Boolean);
  if (dirty.seasonStats?.size) writes.playerSeasons = [...dirty.seasonStats].map((id) => w.seasonStats.get(id)).filter(Boolean);
  for (const store of PENDING_KEYS) {
    if (pending[store]?.length) writes[store] = [...(writes[store] ?? []), ...pending[store]];
  }
  const changed = Object.keys(writes).length > 0;
  if (changed) notify('save:start');
  try {
    if (changed) await write(w.db, writes);
    // Uma falha do índice não pode fazer desaparecer uma gravação feita com sucesso.
    w.summaryNeedsSync = true;
    await updateSummary(summarizeWorld());
    w.summaryNeedsSync = false;
    if (changed) notify('save:done', new Date());
  } catch (err) {
    for (const [store, ids] of Object.entries(dirty)) for (const id of ids) w.dirty[store].add(id);
    for (const store of PENDING_KEYS) w.pending[store] = [...(pending[store] ?? []), ...w.pending[store]];
    w.summaryNeedsSync = true;
    notify('save:error', err);
    throw err;
  }
}
