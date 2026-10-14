// Ambiente de testes em Node: IndexedDB em memória (fake-indexeddb) e fetch lendo os arquivos do projeto.
// Importar este módulo ANTES de qualquer módulo de src/.
import './../vendor/fake-indexeddb/auto/index.mjs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (!globalThis.localStorage) {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear() };
}

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

if (!globalThis.__numTestFetch) {
  globalThis.__numTestFetch = true;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (typeof url === 'string' && !/^[a-z]+:/i.test(url)) {
      try {
        const body = await readFile(path.join(ROOT, url), 'utf8');
        return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
      } catch {
        return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
      }
    }
    return realFetch(url, init);
  };
}
