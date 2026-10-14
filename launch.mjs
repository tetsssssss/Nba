// Iniciador local: escolhe uma porta disponível, inicia o servidor e abre o navegador.
// Requer somente Node.js >=20. Não altera arquivos de jogo ou saves.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const freePort = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    server.close(error => error ? reject(error) : resolve(port));
  });
});
const url = `http://localhost:${freePort}`;
const child = spawn(process.execPath, [join(root, 'server.mjs')], {
  cwd: root, env: { ...process.env, PORT: String(freePort) }, stdio: ['inherit', 'pipe', 'pipe']
});
let didOpen = false;
function openBrowser() {
  if (didOpen) return;
  didOpen = true;
  console.log(`Abra o jogo em: ${url}`);
  if (process.env.NBA_NO_BROWSER === '1') return;
  const command = process.platform === 'win32' ? 'cmd.exe'
    : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', `start "" "${url}"`] : [url];
  try {
    const opener = spawn(command, args, { stdio: 'ignore', windowsHide: true });
    opener.once('error', () => console.log(`Abra manualmente: ${url}`));
    opener.unref();
  } catch { console.log(`Abra manualmente: ${url}`); }
}
child.stdout.on('data', data => {
  const msg = data.toString();
  process.stdout.write(msg);
  if (msg.includes('NBA Universe Manager em')) openBrowser();
});
child.stderr.on('data', data => process.stderr.write(data));
child.once('error', err => { console.error('Não foi possível iniciar o jogo:', err.message); process.exitCode = 1; });
child.once('exit', code => { if (code && !didOpen) console.error('O servidor não iniciou.'); process.exitCode = code ?? 0; });
function shutdown() { if (child.pid) child.kill('SIGTERM'); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
