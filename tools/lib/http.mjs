// Fetch com cache em disco, retry e limite de concorrência para o pipeline de dados.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOOLS_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const ROOT_DIR = resolve(TOOLS_DIR, '..');
export const CACHE_DIR = join(TOOLS_DIR, '.cache');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export const NBA_STATS_HEADERS = {
  'User-Agent': UA,
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Origin: 'https://www.nba.com',
  Referer: 'https://www.nba.com/',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function readCache(key) {
  try {
    return JSON.parse(await readFile(join(CACHE_DIR, `${key}.json`), 'utf8'));
  } catch {
    return undefined;
  }
}

export async function writeCache(key, value) {
  const file = join(CACHE_DIR, `${key}.json`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value), 'utf8');
}

/**
 * Busca `url` e devolve o corpo (JSON por padrão), reutilizando o cache em disco.
 * Falhas definitivas lançam erro; o chamador decide se o recurso é opcional.
 */
export async function cachedFetch(key, url, { headers = {}, as = 'json', refresh = false, retries = 3, timeout = 45000, delay = 0 } = {}) {
  if (!refresh) {
    const hit = await readCache(key);
    if (hit !== undefined) return hit;
  }
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (delay) await sleep(delay);
      const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(timeout) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const value = as === 'json' ? JSON.parse(text) : text;
      await writeCache(key, value);
      return value;
    } catch (err) {
      lastErr = err;
      await sleep(1500 * (attempt + 1));
    }
  }
  throw new Error(`Falha ao buscar ${url}: ${lastErr?.message}`);
}

/** Executa `worker` sobre `items` com no máximo `limit` chamadas simultâneas. */
export async function mapLimit(items, limit, worker) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await worker(items[i], i);
      }
    }),
  );
  return out;
}

/** Converte um resultSet da stats.nba.com em lista de objetos. */
export function rowsOf(payload, index = 0) {
  const sets = payload.resultSets ?? (payload.resultSet ? [payload.resultSet] : []);
  const set = Array.isArray(sets) ? sets[index] : sets;
  if (!set) return [];
  return set.rowSet.map((row) => Object.fromEntries(set.headers.map((h, i) => [h, row[i]])));
}
