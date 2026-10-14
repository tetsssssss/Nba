import test from 'node:test';
import assert from 'node:assert/strict';
import {INT_PLAYERS,INT_TEAM_MAP} from '../src/international/catalog.js';
import {curatedPhotos,photoKey,photoRecord,photoStats,photoSearchUrl,readCustomPhotos,writeCustomPhotos,validateImageUrl,exportPhotoOverrides,importPhotoOverrides,PHOTO_STORAGE_KEY} from '../src/international/photos.js';
const ib=INT_PLAYERS.filter(p=>p.league==='NBB'||p.league==='EUROLEAGUE');
const allowed=new Set(ib.map(photoKey));
function mem(){const m=new Map();return {getItem:key=>m.get(key)||null,setItem:(k,v)=>m.set(k,v)};}
test('catálogo de pesquisa contém apenas atletas verdadeiramente listados',()=>{
 assert.ok(Object.keys(curatedPhotos).length>=11);
 for(const [key,record] of Object.entries(curatedPhotos)){
  assert.ok(allowed.has(key),key);
  assert.ok(validateImageUrl(record.url));assert.ok(validateImageUrl(record.source));
  assert.ok(record.credit&&record.checked);
 }
});
test('NBB e EuroLeague: cobertura auditável e nenhuma foto atribuída por homônimo',()=>{
 assert.equal(ib.length,352);
 const summary=photoStats(ib,{});
 assert.equal(summary.total,352);
 assert.ok(summary.curated>=11);
 assert.ok(summary.curated+summary['nba-headshot']>=25);
 assert.equal(summary.curated+summary['nba-headshot']+summary.custom+summary.pending,352);
 assert.ok(summary.pending>=0);
});
test('fotos curadas precedem IDs legados somente para identidade exata',()=>{
 const p=ib.find(p=>photoKey(p)==='EUROLEAGUE-RMA:Andres Feliz');
 assert.equal(photoRecord(p,{}).source,'curated');
 const legacy=ib.find(p=>p.photoId&&!curatedPhotos[photoKey(p)]);
 assert.equal(photoRecord(legacy,{}).source,'nba-headshot');
 const pending=ib.find(p=>!p.photoId&&!curatedPhotos[photoKey(p)]);
 assert.equal(photoRecord(pending,{}).source,'pending');
});
test('URLs impróprias nunca são inseridas no navegador',()=>{
 for(const s of ['javascript:alert(1)','http://example.com/x.png','data:image/png;base64,abc','file:///secret','https://name:pwd@example.com/photo.jpg','',null])assert.equal(validateImageUrl(s),null);
 assert.ok(validateImageUrl('https://exemplo.com/image.png'));
});
test('fotos personalizadas permanecem fora dos saves NBA e preservam base oficial',()=>{
 const db=mem(),key=photoKey(ib[0]);
 writeCustomPhotos({[key]:'https://cdn.example.com/player.jpg',fake:'javascript:1'},db);
 assert.equal(JSON.parse(db.getItem(PHOTO_STORAGE_KEY))[key],'https://cdn.example.com/player.jpg');
 assert.equal(readCustomPhotos(db)[key],'https://cdn.example.com/player.jpg');
 assert.equal(photoRecord(ib[0],readCustomPhotos(db)).source,'custom');
 assert.equal(photoRecord(ib[0],{}).source,curatedPhotos[key]?'curated':ib[0].photoId?'nba-headshot':'pending');
});
test('importação/exportação de catálogo valida formato e identidade',()=>{
 const key=photoKey(ib[0]);
 const text=exportPhotoOverrides({[key]:'https://example.com/p.png'});
 assert.deepEqual(importPhotoOverrides(text,allowed),{[key]:'https://example.com/p.png'});
 assert.deepEqual(importPhotoOverrides(exportPhotoOverrides({'usuario:desconhecido':'https://example.com/p.png'}),allowed),{});
 assert.throws(()=>importPhotoOverrides('{',allowed),/JSON/);
 assert.throws(()=>importPhotoOverrides(JSON.stringify({schema:'wrong',photos:{}}),allowed),/Formato/);
 assert.throws(()=>importPhotoOverrides(exportPhotoOverrides({[key]:'javascript:1'}),allowed),/URL/);
});
test('cada jogador possui pesquisa no Google Imagens pelo próprio nome e equipe',()=>{
 for(const p of ib){const u=photoSearchUrl({...p,teamName:INT_TEAM_MAP.get(p.teamId).name});assert.ok(u.startsWith('https://www.google.com/search?tbm=isch&q='));assert.ok(decodeURIComponent(u).includes(p.name));}
});
