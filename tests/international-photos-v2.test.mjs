import test from 'node:test';
import assert from 'node:assert/strict';
import {INT_PLAYERS} from '../src/international/catalog.js';
import {curatedPhotos,photoRecord,photoKey,photoStats} from '../src/international/photos.js';
const players=INT_PLAYERS.filter(p=>['NBB','EUROLEAGUE'].includes(p.league));
const keys=new Set(players.map(photoKey));
test('novos retratos v2: identidade e procedência associadas a jogador cadastrado',()=>{
 assert.ok(Object.keys(curatedPhotos).length>=37);
 for(const [key,r] of Object.entries(curatedPhotos)){
  assert.ok(keys.has(key),key);assert.match(r.url,/^https:\/\//);assert.match(r.source,/^https:\/\//);assert.ok(r.credit);
 }
});
test('cobertura ampliada e soma consistente entre ligas',()=>{
 const s=photoStats(players,{});assert.equal(s.total,352);
 assert.ok(s.curated>=37);assert.ok(s.curated+s['nba-headshot']>=37);assert.equal(s.pending+s.curated+s['nba-headshot']+s.custom,352);
});
test('jogadores com foto pesquisada conservam identidade e origem',()=>{
 for(const name of ['EUROLEAGUE-RMA:Trey Lyles','NBB-FRA:Cristiano Felicio','EUROLEAGUE-OLY:Tyler Dorsey','NBB-COR:Elinho Corazza']){
  const player=players.find(p=>photoKey(p)===name);assert.ok(player,name);
  const result=photoRecord(player,{});assert.equal(result.source,'curated');assert.ok(result.sourceUrl);
 }
});
