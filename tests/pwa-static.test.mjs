import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const j=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
test('manifesto permite instalar no Android como PWA e traz ícones reais',async()=>{
 const m=await j('manifest.webmanifest');
 assert.equal(m.display,'standalone');assert.equal(m.start_url,'./#/start');
 assert.ok(m.icons.some(icon=>icon.sizes==='192x192'));
 assert.ok(m.icons.some(icon=>icon.sizes==='512x512'&&icon.purpose==='maskable'));
 for(const icon of m.icons) assert.ok((await stat(new URL(icon.src,root))).size>1000);
});
test('catálogo offline cobre arquivos essenciais para partida e carreira',async()=>{
 const m=await j('offline-assets.json');
 const required=['index.html','src/main.js','src/core/saves.js','src/ui/views/match-live.js','src/match/broadcast-show-state.js','data/seed/teams.json','data/static/franchises.json','css/broadcast-tv.css','manifest.webmanifest'];
 for(const path of required) { assert.ok(m.files.includes(path),`Faltando ${path}`); await stat(new URL(path,root)); }
 assert.ok(m.files.length>170);
});
test('index referencia service-worker/manifest sem substituir o jogo por HTML estático',async()=>{
 const html=await readFile(new URL('index.html',root),'utf8');
 assert.match(html,/manifest\.webmanifest/);
 assert.match(html,/src\/main\.js/);
 assert.match(html,/src\/pwa\/install\.js/);
 const script=await readFile(new URL('sw.js',root),'utf8');
 assert.match(script,/caches\.open/);
 assert.match(script,/offline-assets\.json/);
 assert.doesNotMatch(script,/(indexedDB|\.put\(.*career)/);
});

test('service worker e catálogo offline usam a mesma versão de cache após o deploy',async()=>{
 const m=await j('offline-assets.json');
 const sw=await readFile(new URL('sw.js',root),'utf8');
 assert.ok(sw.includes(`const VERSION = '${m.version}'`));
 assert.match(m.version,/20261014/);
});
