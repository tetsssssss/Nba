import { access, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const manifest = JSON.parse(await readFile(join(root, 'manifest.webmanifest'), 'utf8'));
const offline = JSON.parse(await readFile(join(root, 'offline-assets.json'), 'utf8'));
if (manifest.display !== 'standalone' || manifest.start_url !== './#/start') throw Error('PWA inválido');
const worker = await readFile(join(root, 'sw.js'), 'utf8');
if (!/^[a-z0-9-]{10,80}$/i.test(offline.version) || !worker.includes(`const VERSION = '${offline.version}'`))
  throw Error('Versão do cache no service worker diverge do catálogo offline');
if (!Array.isArray(offline.files) || offline.files.length < 100) throw Error('Precache incompleto');
for (const file of offline.files) {
  if (file.startsWith('/') || file.includes('..') || file.includes('://')) throw Error(`Caminho inválido: ${file}`);
  await access(join(root, file));
}
for (const icon of manifest.icons) await access(join(root, icon.src));
console.log(`PWA íntegro: ${offline.files.length} recursos locais e ${manifest.icons.length} ícones.`);
