// Multiple fantasy rosters in a separate, versioned localStorage namespace.
// Never import the NBA World or write to the career IndexedDB.
import { defaultWnbaStudio, validateWnbaStudio, readWnbaStudio } from './roster-studio.js';
export const WNBA_LIBRARY_KEY = 'wnba-arcade-roster-library-v1';
export const WNBA_LIBRARY_VERSION = 1;
export const WNBA_LIBRARY_MAX = 8;
const NAME = /^[\p{L}\p{N} .,'!&()_-]{1,42}$/u;
const ID = /^wslot-[1-9][0-9]{0,6}$/;

export function defaultWnbaLibrary(studio = defaultWnbaStudio()) {
  return { version:1, activeId:'wslot-1', nextId:2,
    slots:[{ id:'wslot-1', name:'Meu primeiro roster', studio:validateWnbaStudio(studio) }] };
}
export function validateWnbaLibrary(raw) {
  if (!raw || raw.version !== WNBA_LIBRARY_VERSION || !Array.isArray(raw.slots) || raw.slots.length<1 || raw.slots.length>WNBA_LIBRARY_MAX)
    throw Error('Biblioteca WNBA: versão ou quantidade de slots inválida.');
  if (!Number.isSafeInteger(raw.nextId) || raw.nextId<2 || raw.nextId>10_000_000) throw Error('Contador de slots WNBA inválido.');
  const used = new Set();
  const slots = raw.slots.map(s => {
    if (typeof s?.id!=='string' || !ID.test(s.id) || used.has(s.id)) throw Error('Identificador de slot duplicado ou inválido.');
    used.add(s.id);
    if (typeof s.name!=='string' || !NAME.test(s.name.trim())) throw Error('Nome de slot WNBA inválido.');
    return { id:s.id, name:s.name.trim(), studio:validateWnbaStudio(s.studio) };
  });
  if (!used.has(raw.activeId)) throw Error('Slot WNBA ativo inexistente.');
  const maxId = Math.max(...slots.map(s=>Number(s.id.slice(6))));
  if (raw.nextId <= maxId) throw Error('Contador de slots WNBA inconsistente.');
  return { version:1, activeId:raw.activeId, nextId:raw.nextId, slots };
}
export function readWnbaLibrary(storage) {
  try {
    const raw = storage?.getItem(WNBA_LIBRARY_KEY);
    if (raw) return validateWnbaLibrary(JSON.parse(raw));
  } catch { /* fallback without mutating corrupted or unavailable storage */ }
  return defaultWnbaLibrary(readWnbaStudio(storage));
}
export function writeWnbaLibrary(storage, library) {
  const result=validateWnbaLibrary(library);
  storage.setItem(WNBA_LIBRARY_KEY, JSON.stringify(result));
  return result;
}
export function activeWnbaStudio(library) {
  const result=validateWnbaLibrary(library);
  return result.slots.find(s=>s.id===result.activeId).studio;
}
export function switchWnbaRosterSlot(library, id) {
  const result=validateWnbaLibrary(library);
  if (!result.slots.some(s=>s.id===id)) throw Error('Slot WNBA inexistente.');
  result.activeId=id; return result;
}
export function updateWnbaRosterSlot(library, studio) {
  const result=validateWnbaLibrary(library);
  result.slots.find(s=>s.id===result.activeId).studio=validateWnbaStudio(studio);
  return validateWnbaLibrary(result);
}
export function addWnbaRosterSlot(library, { name='Novo roster', copyActive=true }={}) {
  const result=validateWnbaLibrary(library);
  if (result.slots.length>=WNBA_LIBRARY_MAX) throw Error('Limite de 8 rosters WNBA atingido.');
  const id=`wslot-${result.nextId++}`;
  result.slots.push({ id, name, studio:copyActive?activeWnbaStudio(result):defaultWnbaStudio() });
  result.activeId=id;
  return validateWnbaLibrary(result);
}
export function renameWnbaRosterSlot(library, id, name) {
  const result=validateWnbaLibrary(library);
  const slot=result.slots.find(s=>s.id===id);
  if (!slot) throw Error('Slot WNBA inexistente.');
  slot.name=name;
  return validateWnbaLibrary(result);
}
export function removeWnbaRosterSlot(library,id) {
  const result=validateWnbaLibrary(library);
  if (!result.slots.some(s=>s.id===id)) throw Error('Slot WNBA inexistente.');
  if (result.slots.length===1) throw Error('É preciso manter pelo menos um roster WNBA.');
  result.slots=result.slots.filter(s=>s.id!==id);
  if (result.activeId===id) result.activeId=result.slots[0].id;
  return validateWnbaLibrary(result);
}
export function exportWnbaLibrary(library) { return JSON.stringify(validateWnbaLibrary(library),null,2); }
export function importWnbaLibrary(json) {
  if (typeof json!=='string'||json.length>300_000) throw Error('Arquivo de biblioteca WNBA inválido ou muito grande.');
  let raw; try { raw=JSON.parse(json); } catch { throw Error('JSON da biblioteca WNBA inválido.'); }
  return validateWnbaLibrary(raw);
}
