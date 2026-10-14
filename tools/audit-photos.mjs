// Auditoria de fotos: verifica (HEAD) se cada jogador tem fotografia válida em
// cada fonte e grava data/seed/photo-manifest.json. O resolver central
// (src/media/photos.js) usa o manifesto para nunca pedir uma imagem que não existe.
//
// Uso: node tools/audit-photos.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT_DIR, mapLimit, sleep } from './lib/http.mjs';

const SOURCES = {
  nba: (p) => (p.id ? `https://cdn.nba.com/headshots/nba/latest/260x190/${p.id}.png` : null),
  espn: (p) => (p.espnId ? `https://a.espncdn.com/i/headshots/nba/players/full/${p.espnId}.png` : null),
};

// O CDN da NBA responde 200 com uma silhueta genérica quando não há foto do jogador.
// Essa resposta é identificada pelo ETag de fallback.png e conta como "sem foto".
async function fallbackEtag() {
  try {
    const res = await fetch('https://cdn.nba.com/headshots/nba/latest/260x190/fallback.png', { method: 'HEAD', signal: AbortSignal.timeout(15000) });
    return res.headers.get('etag');
  } catch {
    return null;
  }
}
const NBA_FALLBACK = await fallbackEtag();
if (!NBA_FALLBACK) console.warn('Não foi possível identificar a silhueta genérica da NBA; fotos ausentes podem passar despercebidas.');

async function exists(url) {
  if (!url) return false;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
      if (res.ok) return (res.headers.get('content-type') ?? '').startsWith('image/') && res.headers.get('etag') !== NBA_FALLBACK;
      if (res.status === 404 || res.status === 403) return false;
    } catch {
      /* tenta de novo */
    }
    await sleep(800 * (attempt + 1));
  }
  return null; // inconclusivo (rede): não marca como ausente
}

const players = JSON.parse(await readFile(join(ROOT_DIR, 'data/seed/players.json'), 'utf8'));
const result = {};
const summary = { total: players.length, nba: 0, espn: 0, both: 0, none: 0, inconclusive: 0 };
let done = 0;
await mapLimit(players, 6, async (p) => {
  const [nba, espn] = await Promise.all([exists(SOURCES.nba(p)), exists(SOURCES.espn(p))]);
  if (nba === null || espn === null) summary.inconclusive++;
  // inconclusivo conta como "tentar": o resolver ainda cai no placeholder se falhar
  const flags = `${nba !== false ? 'n' : ''}${espn !== false && p.espnId ? 'e' : ''}`;
  result[p.id] = flags;
  if (flags.includes('n')) summary.nba++;
  if (flags.includes('e')) summary.espn++;
  if (flags === 'ne') summary.both++;
  if (flags === '') summary.none++;
  if (++done % 100 === 0) console.log(`  ${done}/${players.length}`);
});

const missing = players.filter((p) => result[p.id] === '').map((p) => ({ id: p.id, name: p.name, teamId: p.teamId }));
await writeFile(
  join(ROOT_DIR, 'data/seed/photo-manifest.json'),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), legend: 'n = foto no CDN da NBA, e = foto na ESPN, vazio = sem foto (placeholder)', summary, missing, players: result })}\n`,
  'utf8',
);
console.log(`Fotos: ${summary.total} jogadores | NBA ${summary.nba} | ESPN ${summary.espn} | ambas ${summary.both} | sem foto ${summary.none} | inconclusivos ${summary.inconclusive}`);
for (const m of missing) console.log(`  sem foto: ${m.name} (${m.teamId})`);
