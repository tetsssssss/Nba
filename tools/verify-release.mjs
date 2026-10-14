// Confere ou atualiza o inventário SHA-256 do pacote local, sem tocar nos saves do navegador.
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const rootPath = fileURLToPath(root);
const manifestPath = join(rootPath, 'RELEASE-MANIFEST.json');
const skip = new Set(['.git', 'node_modules', 'dist', 'RELEASE-MANIFEST.json']);
async function collect(dir = rootPath) {
  const found = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (skip.has(item.name)) continue;
    const path = join(dir, item.name);
    if (item.isDirectory()) found.push(...await collect(path));
    else if (item.isFile()) found.push(path);
  }
  return found;
}
const files = (await Promise.all((await collect()).map(async (path) => ({
  path: relative(rootPath, path).replaceAll('\\', '/'),
  sha256: createHash('sha256').update(await readFile(path)).digest('hex'),
})))).sort((a, b) => a.path.localeCompare(b.path, 'en'));
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (process.argv.includes('--update')) {
  // Preserve release metadata supplied by the maintainer; only refresh file hashes.
  manifest.files = files;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Manifesto atualizado: ${files.length} arquivos.`);
} else {
  const listed = new Map(manifest.files.map((entry) => [entry.path, entry.sha256]));
  const changed = files.filter((entry) => listed.get(entry.path) !== entry.sha256).map((entry) => entry.path);
  const missing = [...listed.keys()].filter((path) => !files.some((entry) => entry.path === path));
  if (changed.length || missing.length) {
    console.error(JSON.stringify({ changed, missing }, null, 2));
    process.exitCode = 1;
  } else console.log(`Manifesto íntegro: ${files.length} arquivos.`);
}
