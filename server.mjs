// Servidor estático local, sem dependências. O jogo usa ES modules, que o
// navegador não carrega via file:// — por isso ele é servido em localhost.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.env.PORT) || 5173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.wasm': 'application/wasm',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// Nada fora destas pastas/arquivos é servido (tools/, tests/, .git/ ficam de fora).
const PUBLIC = ['index.html', 'css', 'src', 'data', 'assets', 'manifest.webmanifest', 'sw.js', 'offline-assets.json'];

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (rel === '') rel = 'index.html';
    const top = rel.split('/')[0];
    const file = normalize(join(ROOT, rel));
    if (!PUBLIC.includes(top) || (file !== ROOT && !file.startsWith(ROOT + sep))) {
      res.writeHead(404).end('Not found');
      return;
    }
    const info = await stat(file);
    if (info.isDirectory()) {
      res.writeHead(404).end('Not found');
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      // Sem cache: durante o desenvolvimento os módulos mudam o tempo todo.
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(err.code === 'ENOENT' ? 404 : 500).end(err.code === 'ENOENT' ? 'Not found' : 'Server error');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`A porta ${PORT} já está em uso — o jogo provavelmente já está aberto em http://localhost:${PORT}`);
    process.exit(0);
  }
  throw err;
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`NBA Universe Manager em http://localhost:${PORT}`);
  console.log('Deixe esta janela aberta enquanto joga. Ctrl+C encerra o servidor.');
});
