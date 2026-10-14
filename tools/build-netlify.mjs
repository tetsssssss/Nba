// Prepara a distribuição estática, sem servidor Node, sem testes e sem dados privados.
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const dest = join(root, 'dist', 'netlify');
const dirs = ['assets', 'css', 'data', 'src'];
const files = ['index.html', 'manifest.webmanifest', 'sw.js', '_headers'];
async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await walk(path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}
await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });
for (const dir of dirs) await cp(join(root, dir), join(dest, dir), { recursive: true });
for (const file of files) await cp(join(root, file), join(dest, file));
const paths = (await Promise.all(dirs.map(dir => walk(join(dest, dir))))).flat()
  .map(path => relative(dest, path).replaceAll('\\', '/'))
  .filter(path => !path.endsWith('/README.txt'));
const offline = { version: 'nuv-management-20261014-r1',
  files: ['index.html', 'manifest.webmanifest', 'sw.js', ...paths].sort() };
await writeFile(join(dest, 'offline-assets.json'), JSON.stringify(offline, null, 2) + '\n');
await writeFile(join(root, 'offline-assets.json'), JSON.stringify(offline, null, 2) + '\n');
const manifest = JSON.parse(await readFile(join(dest, 'manifest.webmanifest'), 'utf8'));
if (!Array.isArray(manifest.icons) || manifest.icons.length < 2) throw Error('Manifest PWA sem ícones');
console.log(`Netlify preparado: ${offline.files.length} assets no catálogo offline, destino dist/netlify`);
