import test from 'node:test';
import assert from 'node:assert/strict';
import { INT_TEAMS, INT_PLAYERS, LEAGUE_INFO, leagueTeams, playableTeams, eligible, rosterOf, teamSpec } from '../src/international/catalog.js';
import { simulateInternational, knockout, euroBasketTournament } from '../src/international/engine.js';
import { MatchSim } from '../src/match/sim.js';

for (const [league,expected,playable] of [['NBB',20,9],['EUROLEAGUE',20,20],['EUROBASKET',24,24]]){
 test(`${league}: clubes e times realmente jogáveis`,()=>{
  assert.equal(leagueTeams(league).length,expected);
  assert.equal(playableTeams(league).length,playable);
  assert.ok(playableTeams(league).every(t=>rosterOf(t.id).length>=5));
  assert.ok(leagueTeams(league).every(t=>t.source.startsWith('https://')));
 });
 test(`${league}: amistoso determinístico e estatísticas somam pontuação`,()=>{
  const [a,b]=playableTeams(league);
  const run=()=>simulateInternational(a.id,b.id,{seed:'int-test'});
  const x=run(),y=run();assert.deepEqual(x,y);assert.notEqual(x.score[0],x.score[1]);
  assert.equal(x.persisted,false);assert.equal(x.rules.periodMinutes,10);
  for(let i=0;i<2;i++){
   assert.equal(x.score[i],x.quarters[i].reduce((a,b)=>a+b,0));
   assert.equal(x.score[i],x.box[i].reduce((a,b)=>a+b.pts,0));
   assert.ok(x.box[i].every(p=>p.pts>=0&&p.fga>=p.fgm&&p.tpa>=p.tpm&&p.fta>=p.ftm));
  }
 });
 test(`${league}: motores 2D inicializam sem alterar carreira`,()=>{
  const info=playableTeams(league).slice(0,2).map(t=>({...teamSpec(t.id),aiCoach:true}));
  const match=new MatchSim(info,{seed:'int-2d',quarterSeconds:600,quiet:true});
  for(let i=0;i<25;i++)match.step(1/30);
  assert.equal(match.court.length,10);assert.ok(match.clock<600);assert.equal(match.teams.length,2);
 });
 test(`${league}: copa de 8 equipes`,()=>{
  const ids=playableTeams(league).slice(0,8).map(t=>t.id);
  const cup=knockout(ids,{seed:'int-cup'});assert.ok(ids.includes(cup.champion));
  assert.deepEqual(cup.rounds.map(r=>r.length),[4,2,1]);assert.equal(cup.persisted,false);
 });
}
test('64 identidades de equipes e 640 atletas reais catalogados',()=>{
 assert.equal(INT_TEAMS.length,64);assert.equal(INT_PLAYERS.length,640);
 assert.equal(new Set(INT_PLAYERS.map(t=>t.id)).size,INT_PLAYERS.length);
 assert.equal(new Set(INT_TEAMS.map(t=>t.id)).size,INT_TEAMS.length);
 assert.ok(INT_PLAYERS.every(p=>p.name&&Number.isInteger(p.ovr)&&p.ovr>=35&&p.ovr<=97));
});
test('NBB sem atletas verificados não é completado com jogador inventado',()=>{
 const missing=leagueTeams('NBB').find(t=>!eligible(t.id));assert.ok(missing);
 assert.equal(rosterOf(missing.id).length,0);assert.throws(()=>teamSpec(missing.id),/não há cinco jogadores/);
});
test('competição diferente e time repetido rejeitados',()=>{
 const [a,b]=playableTeams('NBB'),[c]=playableTeams('EUROBASKET');
 assert.throws(()=>simulateInternational(a.id,a.id),/diferentes/);
 assert.throws(()=>simulateInternational(a.id,c.id),/mesma competição/);
 assert.throws(()=>knockout([a.id,b.id,c.id,a.id]),/4, 8 ou 16/);
 assert.throws(()=>simulateInternational(a.id,b.id,{possessions:-1}),/inválido/);
});
test('EuroBasket 2025: 24 equipes e quatro grupos oficiais',()=>{
 const b=euroBasketTournament({seed:'alternative-2025'});
 assert.deepEqual(Object.keys(b.groups),['A','B','C','D']);
 assert.ok(Object.values(b.groups).every(g=>g.games.length===15&&g.standings.length===6&&g.standings.reduce((x,y)=>x+y.wins,0)===15));
 assert.deepEqual(b.rounds.map(r=>r.length),[8,4,2,1]);
 assert.equal(b.games,75);assert.ok(b.champion.startsWith('EUROBASKET-'));assert.equal(b.persisted,false);
});
test('EuroBasket é reproduzível com a mesma semente',()=>{
 const a=euroBasketTournament({seed:'seed-same'}),b=euroBasketTournament({seed:'seed-same'});
 assert.equal(a.champion,b.champion);assert.deepEqual(a.rounds.map(r=>r.map(x=>x.score)),b.rounds.map(r=>r.map(x=>x.score)));
});
test('atributos e retratos com procedência e fallback honesto',()=>{
 const withPhoto=INT_PLAYERS.filter(p=>p.photoUrl);
 assert.ok(withPhoto.length>=20);assert.ok(withPhoto.every(p=>p.photoId&&p.photoUrl.includes(`/260x190/${p.photoId}.png`)));
 assert.ok(INT_PLAYERS.some(p=>!p.photoUrl));
 assert.ok(INT_PLAYERS.every(p=>p.ratingSource==='simulated-attributes-v1'));
});
