// Gerência de saves: múltiplas carreiras, cada uma em seu banco IndexedDB.
import { STORE_NAMES, SCHEMA_VERSION, bulkWrite, deleteSaveDb, deleteSaveSummary, dumpSave, listSaves, openSaveDb, putSaveSummary } from './db.js';
import { createUniverse, loadSeed } from './universe.js';
import { getWorld, loadWorld, saveWorld, setSaveIdentity, unloadWorld } from './world.js';
import { getSetting, setSetting } from './settings.js';
import { SAVE_FORMAT, validateSavePayload } from './save-validation.js';
import { ensureWorldSystems } from './bootstrap.js';

/** Identificador de save: instante + sufixo aleatório. Não participa da simulação (não precisa ser determinístico). */
const newSaveId = () => `c${Date.now().toString(36)}${[...crypto.getRandomValues(new Uint8Array(3))].map((b) => b.toString(36).padStart(2, '0')).join('')}`;

const MAX_CHECKPOINTS = 3; // por carreira; os mais antigos são apagados
/** Eventos antes dos quais o jogo guarda um ponto de restauração (quando os sistemas existirem). */
export const CHECKPOINT_EVENTS = { 'season-start': 'início da temporada', 'trade-deadline': 'trade deadline', playoffs: 'playoffs', draft: 'Draft', 'free-agency': 'free agency' };

export { listSaves };

export async function createCareer(options) {
  const seed = await loadSeed();
  const saveId = newSaveId();
  const db = await openSaveDb(saveId);
  let summary;
  try {
    summary = await createUniverse(db, saveId, options, seed);
  } catch (err) {
    db.close();
    await deleteSaveDb(saveId).catch(() => {});
    throw err;
  }
  db.close();
  await putSaveSummary(summary);
  return openCareer(saveId);
}

/** Abre uma carreira. Em caso de erro o save NÃO é apagado: quem chama oferece tentar de novo ou exportar. */
export async function openCareer(saveId) {
  const summary = (await listSaves()).find((s) => s.id === saveId);
  const world = await loadWorld(saveId);
  setSaveIdentity({ name: summary?.name ?? null, createdAt: summary?.createdAt ?? null, extra: summary ? { slot: summary.slot ?? null, parentId: summary.parentId ?? null, note: summary.note ?? null } : null });
  setSetting('lastSaveId', saveId);
  ensureWorldSystems(world); // picks, prospectos e mercado: idempotente, também para saves antigos
  return world;
}

export async function closeCareer() {
  await unloadWorld();
  setSetting('lastSaveId', null);
}

export async function deleteCareer(saveId) {
  if (getWorld()?.saveId === saveId) await closeCareer();
  await deleteSaveDb(saveId);
  await deleteSaveSummary(saveId);
}

/** Exporta a carreira inteira como objeto JSON (para backup em arquivo). Funciona mesmo se o save não abrir no jogo. */
export async function exportCareer(saveId) {
  const open = getWorld()?.saveId === saveId;
  const db = open ? getWorld().db : await openSaveDb(saveId);
  try {
    const summary = (await listSaves()).find((s) => s.id === saveId);
    return { format: SAVE_FORMAT, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), summary, stores: await dumpSave(db) };
  } finally {
    if (!open) db.close();
  }
}

export const checkBackup = (payload) => validateSavePayload(payload, { schemaVersion: SCHEMA_VERSION, storeNames: STORE_NAMES });

async function writeNewSave(stores, summary) {
  const saveId = newSaveId();
  // abrir o banco aplica todas as migrações até o formato atual
  const db = await openSaveDb(saveId);
  try {
    const writes = {};
    for (const name of STORE_NAMES) if (Array.isArray(stores[name])) writes[name] = stores[name];
    await bulkWrite(db, writes);
  } catch (err) {
    db.close();
    await deleteSaveDb(saveId).catch(() => {});
    throw err;
  }
  db.close();
  const now = new Date().toISOString();
  const stored = { ...summary, id: saveId, createdAt: now, updatedAt: now };
  await putSaveSummary(stored);
  return stored;
}

/** Importa um backup como uma NOVA carreira (nunca sobrescreve uma existente). */
export async function importCareer(payload) {
  const check = checkBackup(payload);
  if (!check.ok) {
    const err = new Error(check.errors[0]);
    err.problems = check.errors;
    throw err;
  }
  const summary = await writeNewSave(payload.stores, { ...payload.summary, name: `${payload.summary?.name ?? check.info.teamName ?? 'Carreira'} (importado)`, slot: null, parentId: null });
  return { ...summary, warnings: check.warnings };
}

/**
 * Copia uma carreira para um novo slot. É assim que existem saves manuais e pontos de
 * restauração: cada um é um universo independente (alguns MB), nunca um ponteiro para o original.
 * @param kind 'manual' | 'checkpoint'
 */
export async function duplicateCareer(saveId, { kind = 'manual', note = null } = {}) {
  if (getWorld()?.saveId === saveId) await saveWorld();
  const saves = await listSaves();
  const source = saves.find((s) => s.id === saveId);
  if (!source) throw new Error('Save de origem não encontrado.');
  const backup = await exportCareer(saveId);
  const rootId = source.parentId ?? source.id;
  const siblings = saves.filter((s) => (s.parentId ?? s.id) === rootId && s.slot === kind);
  const label = kind === 'checkpoint' ? `Ponto de restauração${note ? ` — antes de ${note}` : ''}` : `Save ${siblings.length + 1}`;
  const copy = await writeNewSave(backup.stores, { ...source, name: `${source.name.replace(/ · (Save \d+|Ponto de restauração.*)$/, '')} · ${label}`, slot: kind, parentId: rootId, note });
  if (kind === 'checkpoint') {
    const old = siblings.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')).slice(MAX_CHECKPOINTS - 1);
    for (const s of old) await deleteCareer(s.id).catch(() => {});
  }
  return copy;
}

/**
 * Chamado pelos sistemas de jogo logo antes de um evento importante (ver CHECKPOINT_EVENTS).
 * Respeita a preferência do usuário e nunca interrompe o jogo se a cópia falhar.
 */
export async function checkpointBefore(eventId) {
  const world = getWorld();
  if (!world || !getSetting('checkpoints') || !CHECKPOINT_EVENTS[eventId]) return null;
  try {
    return await duplicateCareer(world.saveId, { kind: 'checkpoint', note: CHECKPOINT_EVENTS[eventId] });
  } catch (err) {
    console.warn('Ponto de restauração não pôde ser criado', err);
    return null;
  }
}
