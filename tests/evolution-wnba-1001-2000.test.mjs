import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WNBA_TEAMS } from '../src/wnba/catalog.js';
import { buildWnbaArcadeSchedule, runWnbaArcadeLeague } from '../src/wnba/arcade-league.js';
import { defaultWnbaLibrary, readWnbaLibrary, writeWnbaLibrary, validateWnbaLibrary,
  activeWnbaStudio, switchWnbaRosterSlot, updateWnbaRosterSlot, addWnbaRosterSlot,
  removeWnbaRosterSlot, renameWnbaRosterSlot, exportWnbaLibrary, importWnbaLibrary, WNBA_LIBRARY_KEY } from '../src/wnba/roster-library.js';
import { defaultWnbaStudio, WNBA_STUDIO_KEY } from '../src/wnba/roster-studio.js';
import { compareWnbaStreetTactics, STREET_STRATEGIES } from '../src/wnba/street-lab.js';

const ids=n=>WNBA_TEAMS.slice(0,n).map(t=>t.id);
const store=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),values};};
const lib=()=>defaultWnbaLibrary();

test('Arcade league: correct fixture count for 4, 6, 8, 10, 15 teams',()=>{
 for(const n of [4,6,8,10,15]) {const rows=buildWnbaArcadeSchedule(ids(n));assert.equal(rows.flat().length,n*(n-1)/2);}
});
test('Arcade league: double round gives exactly two opposing fixtures',()=>{
 const matches=buildWnbaArcadeSchedule(ids(6),{doubleRound:true}).flat();
 assert.equal(matches.length,30);
 for(const a of ids(6))for(const b of ids(6))if(a!==b)assert.equal(matches.filter(m=>m.home===a&&m.away===b).length,1);
});
test('Arcade league: odd team count gives one bye per round',()=>{
 const rows=buildWnbaArcadeSchedule(ids(15));assert.equal(rows.length,15);
 assert.ok(rows.every(r=>r.length===7));
 assert.deepEqual(ids(15).map(id=>rows.filter(r=>!r.some(g=>g.home===id||g.away===id)).length),Array(15).fill(1));
});
test('Arcade league: no repeat opponent in single round robin',()=>{
 const schedule=buildWnbaArcadeSchedule(ids(8)).flat();
 assert.equal(new Set(schedule.map(g=>[g.home,g.away].sort().join('|'))).size,28);
});
test('Arcade league: rejects duplicated franchise',()=>assert.throws(()=>buildWnbaArcadeSchedule([ids(4)[0],ids(4)[0],ids(4)[2],ids(4)[3]]),/válidas/));
test('Arcade league: rejects wrong counts',()=>assert.throws(()=>buildWnbaArcadeSchedule(ids(5)),/4, 6, 8, 10 ou 15/));
test('Arcade league: rejects missing franchise',()=>assert.throws(()=>buildWnbaArcadeSchedule(['???',...ids(4).slice(1)]),/válidas/));
test('Arcade league: rejects nonboolean doubleRound',()=>assert.throws(()=>buildWnbaArcadeSchedule(ids(4),{doubleRound:'yes'}),/inválido/));
test('Arcade league: deterministic seed',()=>assert.deepEqual(runWnbaArcadeLeague(ids(6),{seed:'fixed'}),runWnbaArcadeLeague(ids(6),{seed:'fixed'})));
test('Arcade league: results sum up to match count',()=>{
 const out=runWnbaArcadeLeague(ids(8));assert.equal(out.games,28);
 assert.equal(out.standings.reduce((s,r)=>s+r.wins,0),28);
 assert.equal(out.standings.reduce((s,r)=>s+r.losses,0),28);
 assert.ok(out.standings.every(x=>x.played===7));
});
test('Arcade league: scored points match conceded points across all franchises',()=>{
 const out=runWnbaArcadeLeague(ids(6),{doubleRound:true});
 assert.equal(out.standings.reduce((s,r)=>s+r.pf,0),out.standings.reduce((s,r)=>s+r.pa,0));
 assert.ok(out.standings.every(x=>x.played===10&&x.pct>=0&&x.pct<=1));
});
test('Arcade league: playoffs champion belongs to competitors',()=>{
 const out=runWnbaArcadeLeague(ids(4));assert.ok(ids(4).includes(out.champion));
 assert.deepEqual(out.bracket.map(r=>r.length),[2,1]);
});
test('Arcade league: can disable finals and never persists',()=>{
 const out=runWnbaArcadeLeague(ids(4),{finals:false});
 assert.equal(out.bracket.length,0);assert.equal(out.persisted,false);
});
test('Arcade league: all 15 real WNBA franchises can participate and finish',()=>{
 const out=runWnbaArcadeLeague(ids(15));assert.equal(out.games,105);assert.equal(out.standings.length,15);
 assert.ok(out.standings.every(x=>x.played===14));
});
test('Arcade league: invalid seed rejected',()=>assert.throws(()=>runWnbaArcadeLeague(ids(4),{seed:'x'.repeat(81)}),/inválida/));

test('WNBA library: starts with one valid slot',()=>{
 const l=lib();assert.equal(l.slots.length,1);assert.deepEqual(activeWnbaStudio(l),defaultWnbaStudio());
});
test('WNBA library: migration reads legacy studio without writing old namespace',()=>{
 const s=store();s.setItem(WNBA_STUDIO_KEY,JSON.stringify(defaultWnbaStudio()));
 assert.deepEqual(activeWnbaStudio(readWnbaLibrary(s)),defaultWnbaStudio());
 assert.deepEqual([...s.values.keys()],[WNBA_STUDIO_KEY]);
});
test('WNBA library: read/write uses isolated key',()=>{
 const s=store();writeWnbaLibrary(s,lib());assert.deepEqual([...s.values.keys()],[WNBA_LIBRARY_KEY]);
 assert.deepEqual(readWnbaLibrary(s),lib());
});
test('WNBA library: two slots are independent clones',()=>{
 let l=addWnbaRosterSlot(lib());let active=activeWnbaStudio(l);
 active.teams[0].name='Eclipse A';l=updateWnbaRosterSlot(l,active);
 l=switchWnbaRosterSlot(l,'wslot-1');assert.equal(activeWnbaStudio(l).teams[0].name,'Aurora All-Stars');
});
test('WNBA library: every new slot gets a stable ID',()=>{
 let l=lib();l=addWnbaRosterSlot(l);l=addWnbaRosterSlot(l);l=removeWnbaRosterSlot(l,'wslot-2');l=addWnbaRosterSlot(l);
 assert.deepEqual(l.slots.map(s=>s.id),['wslot-1','wslot-3','wslot-4']);
});
test('WNBA library: cannot exceed eight slots',()=>{
 let l=lib();for(let i=1;i<8;i++)l=addWnbaRosterSlot(l);
 assert.throws(()=>addWnbaRosterSlot(l),/Limite/);
});
test('WNBA library: cannot delete last slot',()=>assert.throws(()=>removeWnbaRosterSlot(lib(),'wslot-1'),/pelo menos um/));
test('WNBA library: deleting selected slot switches to another',()=>{
 let l=addWnbaRosterSlot(lib());l=removeWnbaRosterSlot(l,l.activeId);
 assert.equal(l.slots.length,1);assert.equal(l.activeId,'wslot-1');
});
test('WNBA library: invalid renamed slot rejected',()=>assert.throws(()=>renameWnbaRosterSlot(lib(),'wslot-1','<script>'),/inválido/));
test('WNBA library: rejects repeated ID, broken counter and missing active',()=>{
 const a=lib();a.slots.push(structuredClone(a.slots[0]));assert.throws(()=>validateWnbaLibrary(a),/duplicado/);
 const b=lib();b.nextId=1;assert.throws(()=>validateWnbaLibrary(b),/Contador/);
 const c=lib();c.activeId='wslot-5';assert.throws(()=>validateWnbaLibrary(c),/inexistente/);
});
test('WNBA library: valid export/import round-trip',()=>{
 const l=addWnbaRosterSlot(lib());assert.deepEqual(importWnbaLibrary(exportWnbaLibrary(l)),l);
});
test('WNBA library: rejects malformed and oversize JSON',()=>{
 assert.throws(()=>importWnbaLibrary('{'),/JSON/);
 assert.throws(()=>importWnbaLibrary('x'.repeat(300001)),/grande/);
});
test('WNBA library: invalid storage falls back safely',()=>assert.deepEqual(readWnbaLibrary({getItem(){throw Error('blocked')}}),lib()));

test('Street lab: deterministic results for same seed',()=>{
 const opts={seed:'repeat',games:8};assert.deepEqual(compareWnbaStreetTactics('WIND','WLVA',opts),compareWnbaStreetTactics('WIND','WLVA',opts));
});
test('Street lab: four strategies and valid score ranges',()=>{
 const x=compareWnbaStreetTactics('WIND','WLVA',{games:8});
 assert.deepEqual(x.rows.map(r=>r.tactic),STREET_STRATEGIES);
 assert.ok(x.rows.every(r=>r.completed>0 && r.completed<=8 && r.wins+r.losses===r.completed && r.winRate>=0 && r.winRate<=1));
});
test('Street lab: all sizes and both targets finish',()=>{
 for(const size of [1,2,3])for(const target of [11,21]){
  const x=compareWnbaStreetTactics('WIND','WLVA',{size,target,games:4});assert.equal(x.rows.length,4);
 }
});
test('Street lab: tactics can affect simulated results',()=>{
 const x=compareWnbaStreetTactics('WIND','WLVA',{games:24});
 assert.ok(new Set(x.rows.map(r=>`${r.avgFor}:${r.avgPossessions}:${r.wins}`)).size>1);
});
test('Street lab: unchanged WNBA stats and no persistence',()=>{
 const x=compareWnbaStreetTactics('WIND','WLVA',{games:4});assert.equal(x.persisted,false);
});
test('Street lab: rejects same team, missing team and invalid sample',()=>{
 assert.throws(()=>compareWnbaStreetTactics('WIND','WIND'),/diferentes/);
 assert.throws(()=>compareWnbaStreetTactics('WIND','INVALID'),/diferentes/);
 assert.throws(()=>compareWnbaStreetTactics('WIND','WLVA',{games:0}),/inválida/);
});

test('Integration: routes and CSS linked',()=>{
 const ui=readFileSync(new URL('../src/ui/views/wnba.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(ui,/arcade-league/);assert.match(ui,/street-lab/);assert.match(ui,/readWnbaLibrary/);
 assert.match(html,/evolution-1001-2000\.css/);
});
test('Isolation: new WNBA modules have no career-world dependencies',()=>{
 const src=['arcade-league.js','roster-library.js','street-lab.js'].map(f=>readFileSync(new URL(`../src/wnba/${f}`,import.meta.url),'utf8')).join('\n');
 assert.doesNotMatch(src,/from ['"][^'"]*(?:\/core\/world|\/core\/saves|\/season\/season|\/contracts\/)/);
});
import { wnbaStreetReplay } from '../src/wnba/replay.js';
import { newStreetGame, simulateStreet } from '../src/arcade/street.js';
import { wnbaRoster } from '../src/wnba/catalog.js';
test('Street replay: real recorded possessions preserve chronological scores',()=>{
 const teams=['WIND','WLVA'].map(id=>({id,name:id,roster:wnbaRoster(id).slice(0,3)}));
 const game=simulateStreet(newStreetGame(teams,{seed:'real-street-replay',target:11}));
 const out=wnbaStreetReplay(game);assert.equal(out.persisted,false);
 assert.ok(out.frames.length>1);
 assert.ok(out.frames.every((e,i)=>i===0||e.possession>out.frames[i-1].possession));
 assert.deepEqual(out.frames.at(-1).score,game.score);
});
test('Street replay: rejects malformed score and missing game',()=>{
 assert.throws(()=>wnbaStreetReplay(null),/inválido/);
 assert.throws(()=>wnbaStreetReplay({teams:[{name:'a'},{name:'b'}],score:[0,0],events:[{n:1,offense:0,score:[-1,0]}]}),/inválido/);
});
test('Street replay: clearly marks truncated possession history',()=>{
 const game={teams:[{name:'A'},{name:'B'}],score:[11,9],possessions:65,events:[{n:65,score:[11,9],offense:0,text:'cesta',kind:'drive',points:1}]};
 assert.equal(wnbaStreetReplay(game).truncated,true);
});
