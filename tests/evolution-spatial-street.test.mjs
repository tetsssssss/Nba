import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newSpatialStreetGame, spatialStreetPossession, simulateSpatialStreet, spatialStreetSummary, STREET_COURT, SPATIAL_TACTICS } from '../src/arcade/street-spatial.js';
import { WNBA_TEAMS, WNBA_PLAYERS, wnbaRoster } from '../src/wnba/catalog.js';

const squads = size => ['WIND','WLVA'].map(id=>({id,name:WNBA_TEAMS.find(t=>t.id===id).fullName,colors:['#9c51b6','#203b4e'],roster:wnbaRoster(id).slice(0,size)}));
const start=(size=3,seed='street-fixture',target=11)=>newSpatialStreetGame(squads(size),{seed,target,squadSize:size});
const allStats = game => game.box.flatMap(team=>Object.values(team));
for(const format of [1,2,3]){
  test(`Street spatial ${format}x${format}: squad and player counts`,()=>{
    const g=start(format);
    assert.equal(g.squadSize,format);
    assert.equal(g.teams.flatMap(t=>t.roster).length,2*format);
  });
  test(`Street spatial ${format}x${format}: a full simulated match reaches the win condition`,()=>{
    const g=simulateSpatialStreet(start(format),{limit:500});
    assert.equal(g.over,true);assert.ok([0,1].includes(g.winner));
    assert.ok(g.score[g.winner]>=11);
    assert.ok(g.score[g.winner]-g.score[1-g.winner]>=2||g.score[g.winner]>=25);
    assert.equal(g.persisted,false);
  });
  test(`Street spatial ${format}x${format}: every recorded position is on court`,()=>{
    const g=spatialStreetPossession(start(format));
    const frames=g.events[0].frames;
    assert.ok(frames.length>=25);
    for(const f of frames){
      assert.ok(f.ball.x>=0&&f.ball.x<=STREET_COURT.width);
      assert.ok(f.ball.y>=-5&&f.ball.y<=STREET_COURT.height);
      for(let side=0;side<2;side++){
        assert.equal(f.teams[side].length,format);
        for(const p of f.teams[side]){
          assert.ok(p.x>=0&&p.x<=STREET_COURT.width);
          assert.ok(p.y>=0&&p.y<=STREET_COURT.height);
        }
      }
    }
  });
}
for(const tactic of SPATIAL_TACTICS){
  test(`Street spatial: ${tactic} game deterministic from same seed`,()=>{
    const g=simulateSpatialStreet(start(3,`same-${tactic}`),{tactic});
    assert.deepEqual(g,simulateSpatialStreet(start(3,`same-${tactic}`),{tactic}));
  });
  test(`Street spatial: ${tactic} box score consistency`,()=>{
    const g=simulateSpatialStreet(start(3,`stats-${tactic}`),{tactic});
    assert.deepEqual(g.score,g.box.map(b=>Object.values(b).reduce((s,p)=>s+p.pts,0)));
    assert.ok(allStats(g).every(p=>p.fgm<=p.fga&&p.twom<=p.twoa&&p.twoa<=p.fga));
    assert.ok(allStats(g).every(p=>p.stl>=0&&p.tov>=0));
  });
}
test('Street spatial: first possession does not mutate input state',()=>{
  const g=start();const json=JSON.stringify(g);
  const n=spatialStreetPossession(g);
  assert.equal(JSON.stringify(g),json);assert.notStrictEqual(n,g);
  assert.deepEqual(g.score,[0,0]);assert.equal(g.possessions,0);assert.equal(n.possessions,1);
});
test('Street spatial: no event is generated after the match ends',()=>{
  const g=simulateSpatialStreet(start());assert.strictEqual(spatialStreetPossession(g),g);
});
test('Street spatial: no duplicate athlete IDs allowed',()=>{
  const s=squads(3);s[1].roster[0]=s[0].roster[0];
  assert.throws(()=>newSpatialStreetGame(s),/repetidos/);
});
test('Street spatial: rejects two equal teams only by player identity, not arbitrary team name',()=>{
  const s=squads(1);s[1].id=s[0].id;
  assert.equal(newSpatialStreetGame(s,{squadSize:1}).teams.length,2);
});
test('Street spatial: rejects unknown lineup count',()=>assert.throws(()=>newSpatialStreetGame(squads(3),{squadSize:4}),/formato/));
test('Street spatial: rejects insufficient lineup',()=>assert.throws(()=>newSpatialStreetGame(squads(2),{squadSize:3}),/atleta/));
test('Street spatial: rejects invalid goal',()=>assert.throws(()=>newSpatialStreetGame(squads(3),{target:9}),/meta/));
test('Street spatial: rejects unknown tactic',()=>assert.throws(()=>spatialStreetPossession(start(),'wizard'),/tática/));
test('Street spatial: rejects simulation limit out of bounds',()=>{
  assert.throws(()=>simulateSpatialStreet(start(),{limit:0}),/Limite/);
  assert.throws(()=>simulateSpatialStreet(start(),{limit:2000}),/Limite/);
});
test('Street spatial: result always has valid contest factor and distance',()=>{
  const g=simulateSpatialStreet(start(3,'pressure'));
  assert.ok(g.events.every(e=>e.contest>=0&&e.contest<=1&&e.defenderDistance>=0));
});
test('Street spatial: captured shot distance is derived from court positions',()=>{
  const g=simulateSpatialStreet(start(2,'geometry'),{tactic:'outside'});
  assert.ok(g.events.some(e=>e.isLong));
  for(const e of g.events){
    if(e.kind==='steal')continue;
    const last=e.frames[e.frames.length-1];
    assert.ok(Math.abs(last.ball.x-369)<.001&&Math.abs(last.ball.y-120)<.001);
  }
});
test('Street spatial: events retained up to last 60, number remains increasing',()=>{
  const g=simulateSpatialStreet(start(3,'history',21));
  assert.ok(g.events.length<=60);
  assert.ok(g.events.every((e,i)=>i===0||e.n<g.events[i-1].n));
});
test('Street spatial: later possessions alternate attacker except game over',()=>{
  let g=start(2),prev;
  for(let i=0;i<20&&!g.over;i++){
    prev=g;g=spatialStreetPossession(g);
    if(!g.over)assert.equal(g.offense,1-prev.offense);
  }
});
test('Street spatial: summary handles empty and active matches',()=>{
  const g=start();assert.deepEqual(spatialStreetSummary(g).shots,[{attempts:0,made:0,steals:0},{attempts:0,made:0,steals:0}]);
  const a=spatialStreetSummary(spatialStreetPossession(g));
  assert.equal(a.possessions,1);assert.equal(a.over,false);
});
test('Street spatial: invalid summary rejected',()=>assert.throws(()=>spatialStreetSummary({engine:'old'}),/inválida/));
test('Street spatial: simulated contest changes with defender ratings',()=>{
  const weak=squads(1),strong=squads(1);
  const weakDef={...weak[1].roster[0],attributes:{...weak[1].roster[0].attributes,speed:1,perimeterDefense:1}};
  const strongDef={...strong[1].roster[0],attributes:{...strong[1].roster[0].attributes,speed:99,perimeterDefense:99}};
  weak[1].roster=[weakDef];strong[1].roster=[strongDef];
  const one=spatialStreetPossession(newSpatialStreetGame(weak,{squadSize:1,seed:'defense'}));
  const two=spatialStreetPossession(newSpatialStreetGame(strong,{squadSize:1,seed:'defense'}));
  assert.ok(two.events[0].defenderDistance<one.events[0].defenderDistance);
  assert.ok(two.events[0].contest>=one.events[0].contest);
});
test('Street spatial: does not depend on career modules',()=>{
  for(const file of ['../src/arcade/street-spatial.js','../src/ui/components/street-spatial.js']){
    const source=readFileSync(new URL(file,import.meta.url),'utf8');
    assert.doesNotMatch(source,/from ['"][^'"]*(core\/world|core\/saves|season\/season|contracts\/)/);
  }
});
test('Street spatial: UI advertises experimental mode without removing classic Street',()=>{
  const ui=readFileSync(new URL('../src/ui/views/wnba.js',import.meta.url),'utf8');
  assert.match(ui,/\['street','Street WNBA'\]/);
  assert.match(ui,/\['street-2d','Street 2D'\]/);
  assert.match(ui,/active==='street-2d'\?spatialStreet/);
});
test('Street spatial: CSS includes responsive and reduced-motion rules',()=>{
  const css=readFileSync(new URL('../css/evolution-spatial-street.css',import.meta.url),'utf8');
  assert.match(css,/@media\(max-width:640px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});

test('Street spatial: pass tactic animates ball transfer to a different player',()=>{
  const g=spatialStreetPossession(start(3,'passing'),'pass');
  const ev=g.events[0];assert.notEqual(ev.passerId,ev.shooterId);
  assert.equal(ev.frames[0].phase,'pass');assert.ok(ev.frames.some(f=>f.phase==='movement'));
  assert.ok(ev.frames.some(f=>f.phase==='pass'&&f.ball.x<200));
});
test('Street spatial: a successful pass-and-score registers an assist',()=>{
  let assists=0,successful=0;
  for(let i=0;i<50;i++){
    const g=simulateSpatialStreet(start(3,`assist-${i}`),{tactic:'pass'});
    successful+=g.events.filter(e=>e.points>0&&e.passerId).length;
    assists+=allStats(g).reduce((a,p)=>a+p.ast,0);
  }
  assert.ok(successful>0);assert.equal(assists,successful);
});
