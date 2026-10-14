// Camada de persistência (IndexedDB). Cada carreira vive em seu próprio banco
// (`num-save-<id>`); um banco pequeno (`num-meta`) guarda o índice de saves.
// Entidades ficam em stores separadas — nada de um único blob gigante.

const META_DB = 'num-meta';
const SAVE_PREFIX = 'num-save-';

/**
 * Migrações do banco de um save, em ordem. A versão do banco é o tamanho desta
 * lista; para evoluir o schema, ACRESCENTE uma função — nunca edite as antigas,
 * ou saves existentes deixam de abrir.
 */
const MIGRATIONS = [
  // v1 — fundação
  (db) => {
    const store = (name, keyPath, indexes = {}) => {
      const s = db.createObjectStore(name, { keyPath });
      for (const [index, path] of Object.entries(indexes)) s.createIndex(index, path);
    };
    store('meta', 'key');
    store('teams', 'id');
    store('players', 'id', { teamId: 'teamId' });
    store('contracts', 'playerId', { teamId: 'teamId' });
    store('careerStats', 'playerId');
    store('coaches', 'id', { teamId: 'teamId' });
    store('staff', 'id', { teamId: 'teamId' });
    store('owners', 'id');
    store('arenas', 'id');
    store('finances', 'id', { teamId: 'teamId', season: 'season' });
    store('draftPicks', 'id', { ownerTeamId: 'ownerTeamId', season: 'season' });
    store('prospects', 'id', { draftYear: 'draftYear' });
    store('seasons', 'season');
    store('games', 'id', { season: 'season', date: 'date' });
    store('transactions', 'id', { date: 'date' });
    store('injuries', 'id', { playerId: 'playerId' });
    store('relationships', 'id', { a: 'a', b: 'b' });
    store('news', 'id', { date: 'date' });
  },
  // v2 — temporada: box scores fora do registro do jogo (o calendário fica leve em memória)
  // e estatísticas acumuladas de cada jogador por temporada
  (db) => {
    db.createObjectStore('boxScores', { keyPath: 'id' });
    db.createObjectStore('playerSeasons', { keyPath: 'id' }).createIndex('season', 'season');
  },
];

export const SCHEMA_VERSION = MIGRATIONS.length;
export const STORE_NAMES = ['meta', 'teams', 'players', 'contracts', 'careerStats', 'coaches', 'staff', 'owners', 'arenas', 'finances', 'draftPicks', 'prospects', 'seasons', 'games', 'transactions', 'injuries', 'relationships', 'news', 'boxScores', 'playerSeasons'];

const wrap = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const done = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transação abortada'));
  });

function open(name, version, upgrade) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = (event) => upgrade(request.result, event.oldVersion, request.transaction);
    request.onsuccess = () => {
      const db = request.result;
      // outra aba pediu upgrade/exclusão: solta a conexão em vez de travá-la
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Banco bloqueado por outra aba do jogo. Feche as outras abas e tente de novo.'));
  });
}

// ------------------------------------------------------------------ banco de um save
export function openSaveDb(saveId) {
  return open(SAVE_PREFIX + saveId, SCHEMA_VERSION, (db, oldVersion) => {
    for (let v = oldVersion; v < SCHEMA_VERSION; v++) MIGRATIONS[v](db);
  });
}

export function deleteSaveDb(saveId) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(SAVE_PREFIX + saveId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Save aberto em outra aba. Feche-a para excluir.'));
  });
}

export const getAll = (db, store) => wrap(db.transaction(store).objectStore(store).getAll());
export const get = (db, store, key) => wrap(db.transaction(store).objectStore(store).get(key));
export const count = (db, store) => wrap(db.transaction(store).objectStore(store).count());
export const getAllByIndex = (db, store, index, value) => wrap(db.transaction(store).objectStore(store).index(index).getAll(value));

/**
 * Grava e/ou remove registros de várias stores numa única transação.
 * @param writes  { store: [registros] }
 * @param deletes { store: [chaves] }
 */
export function bulkWrite(db, writes = {}, deletes = {}) {
  const stores = [...new Set([...Object.keys(writes), ...Object.keys(deletes)])].filter((s) => (writes[s]?.length ?? 0) + (deletes[s]?.length ?? 0) > 0);
  if (!stores.length) return Promise.resolve();
  const tx = db.transaction(stores, 'readwrite');
  for (const name of stores) {
    const store = tx.objectStore(name);
    for (const record of writes[name] ?? []) store.put(record);
    for (const key of deletes[name] ?? []) store.delete(key);
  }
  return done(tx);
}

export const put = (db, store, record) => bulkWrite(db, { [store]: [record] });

/** Página de registros de um índice, do mais recente para o mais antigo. */
export function pageByIndex(db, store, index, { limit = 50, offset = 0, direction = 'prev' } = {}) {
  return new Promise((resolve, reject) => {
    const out = [];
    let skipped = false;
    const request = db.transaction(store).objectStore(store).index(index).openCursor(null, direction);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || out.length >= limit) return resolve(out);
      if (offset && !skipped) {
        skipped = true;
        return cursor.advance(offset);
      }
      out.push(cursor.value);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

/** Dump completo do save (exportação). */
export async function dumpSave(db) {
  const out = {};
  for (const name of STORE_NAMES) out[name] = await getAll(db, name);
  return out;
}

// ------------------------------------------------------------------ índice de saves
function openMeta() {
  return open(META_DB, 1, (db) => db.createObjectStore('saves', { keyPath: 'id' }));
}

export async function listSaves() {
  const db = await openMeta();
  try {
    const saves = await getAll(db, 'saves');
    return saves.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  } finally {
    db.close();
  }
}

export async function putSaveSummary(summary) {
  const db = await openMeta();
  try {
    await bulkWrite(db, { saves: [summary] });
  } finally {
    db.close();
  }
}

export async function deleteSaveSummary(saveId) {
  const db = await openMeta();
  try {
    await bulkWrite(db, {}, { saves: [saveId] });
  } finally {
    db.close();
  }
}
