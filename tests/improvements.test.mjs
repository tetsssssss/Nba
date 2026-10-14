import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/core/rng.js';
import { playableRoster, assertPlayableRoster } from '../src/players/eligibility.js';
import { makeRotation, resolveRotation, validateRotation } from '../src/players/rotation.js';
import { simulateQuickGame } from '../src/season/quick-game.js';
import { planExpansionDraft } from '../src/season/expansion.js';
import { validateSavePayload, SAVE_FORMAT } from '../src/core/save-validation.js';
import { evaluateTrade } from '../src/contracts/market.js';
import { developPlayer, simulateOffseasonDevelopment } from '../src/players/development.js';
import { teamSeasonSummary, seasonAwards } from '../src/season/narrative.js';
import { rosterOf } from '../tools/sim-match.mjs';
const roster = rosterOf('BOS');
const opposite = rosterOf('DEN');
const make = (id, list=roster) => ({id,roster:list});

test('roster mínimo: 0/1/3/4 falham antes do RNG avançar', () => {
  for (const n of [0,1,3,4]) {
    const rng = createRng('roster-invalid');
    assert.throws(() => simulateQuickGame(make('BOS',roster.slice(0,n)), make('DEN',opposite),rng), {code:'INSUFFICIENT_ROSTER'});
    assert.equal(rng.getState(),createRng('roster-invalid').getState());
  }
});
test('roster mínimo: cinco atletas funcionam e minutos totais batem', () => {
  const a = make('BOS',roster.slice(0,5));
  const result = simulateQuickGame(a,make('DEN',opposite),createRng('five'));
  assert.equal(result.box[0].players.length,5);
  assert.ok(Math.abs(result.box[0].players.reduce((n,p)=>n+p.min,0)-240) < .6);
});
test('roster mínimo: lesão e duplicação bloqueiam a partida', () => {
  assert.throws(()=>assertPlayableRoster(make('BOS',[...roster.slice(0,4),{...roster[4], injury:{status:'Out'}}])),/necessários 5/);
  assert.throws(()=>assertPlayableRoster(make('BOS',[...roster.slice(0,4),roster[0]])),/repetidos/);
});
test('rotação manual: exige cinco titulares distintos e válidos', () => {
  const ids = roster.slice(0,5).map(p=>p.id);
  assert.ok(validateRotation(makeRotation(ids,{},roster),roster));
  assert.throws(()=>makeRotation([ids[0],ids[0],...ids.slice(2)],{},roster));
  assert.throws(()=>makeRotation(ids,{[ids[0]]:55},roster));
});
test('rotação manual: seleção e escalação são determinísticas', () => {
  const starters=roster.slice(1,6).map(p=>p.id);
  const custom={starters,minutes:Object.fromEntries(roster.slice(1,6).map(p=>[p.id,35]))};
  const resolved = resolveRotation(custom,roster,null);
  assert.deepEqual(resolved.starters.map(p=>p.id),starters);
  const a=simulateQuickGame({...make('BOS'),rotation:custom},make('DEN',opposite),createRng('rotation'));
  assert.deepEqual(a.box[0].players.filter(p=>p.starter).map(p=>p.id),starters);
  assert.ok(Math.abs(a.box[0].players.reduce((n,p)=>n+p.min,0)-240) < 1);
});
test('expansão: proteções configuradas mantêm atletas fora do pool',()=>{
  const originals=roster.slice(0,10).map(p=>({...p,teamId:'BOS',rosterStatus:'standard'}));
  const selected=originals.slice(3,10).map(p=>p.id);
  const plan=planExpansionDraft(originals, {existing:['BOS'], expansion:['SEA'], protectedPerTeam:7,maxLostPerTeam:2, rosterTarget:14, date:'2026-10-20',rng:createRng('protect'), protectedOverrides:{BOS:selected}});
  assert.deepEqual(plan.protectedIds.BOS, selected);
  assert.ok(plan.picks.every(p=>!selected.includes(p.playerId)));
  assert.ok(plan.picks.length<=2);
});
test('expansão: preferência dá prioridade quando atleta está disponível',()=>{
 const src=roster.slice(0,10).map(p=>({...p,teamId:'BOS',rosterStatus:'standard'}));
 const wanted=src[9].id;
 const plan=planExpansionDraft(src,{existing:['BOS'],expansion:['SEA'],protectedPerTeam:7,maxLostPerTeam:2,rosterTarget:2,date:'2026-10-20',rng:createRng('pref'),protectedOverrides:{BOS:src.slice(0,7).map(p=>p.id)},preferredPicks:{SEA:[wanted]}});
 assert.equal(plan.picks[0].playerId,wanted);
});
test('backup vazio/incompleto é rejeitado, com informação específica',()=>{
 const payload={format:SAVE_FORMAT,schemaVersion:2,stores:{meta:[{key:'career',value:{teamId:'BOS'}},{key:'calendar',value:{season:2027}},{key:'league',value:{}}],teams:[{id:'BOS'}],players:[{id:1,teamId:'BOS',attributes:{},positions:['PG']}],contracts:[{playerId:1}]}};
 const res=validateSavePayload(payload,{schemaVersion:2,storeNames:Object.keys(payload.stores)});
 assert.equal(res.ok,false);
 assert.match(res.errors.join(' '),/Regras da liga/);
 assert.match(res.errors.join(' '),/Calendário/);
});
test('mercado: proposta de equipe errada é recusada sem alterar estado',()=>{
 const a={...roster[0],teamId:'BOS',rosterStatus:'standard'},b={...opposite[0],teamId:'DEN',rosterStatus:'standard'};
 const world={teams:new Map([['BOS',{id:'BOS'}],['DEN',{id:'DEN'}]]),players:new Map([[a.id,a],[b.id,b]]),contracts:new Map([[a.id,{years:[{season:2027,salary:10000000}]}],[b.id,{years:[{season:2027,salary:10000000}]}]]),calendar:{season:2027},league:{cap:{salaryCap:160000000,luxuryTax:180000000,firstApron:190000000,secondApron:200000000}},career:{capMode:'basic'}};
 const r=evaluateTrade(world,{fromTeamId:'DEN',toTeamId:'BOS',sendId:a.id,receiveId:b.id});
 assert.equal(r.ok,false);
 assert.equal(a.teamId,'BOS');
});
test('progresso: determinismo e limites de atributos',()=>{
 const p=roster[0];
 const a=developPlayer(p,{seed:'2028',age:20,minutes:35});
 const b=developPlayer(p,{seed:'2028',age:20,minutes:35});
 assert.deepEqual(a,b);assert.equal(p.attributes.shotCreation,roster[0].attributes.shotCreation);
 assert.ok(Object.values(a.attributes).filter(v=>typeof v==='number').every(v=>v>=1&&v<=99));
 assert.equal(simulateOffseasonDevelopment([p],{year:2028}).length,1);
});
test('narrativa: resume somente partidas finais da franquia',()=>{
 const games=[{home:'BOS',away:'DEN',status:'final',score:[102,100],overtimes:1},{home:'LAL',away:'BOS',status:'final',score:[110,105]},{home:'DEN',away:'LAL',status:'final',score:[95,93]},{home:'BOS',away:'MIA',status:'scheduled'}];
 assert.deepEqual(teamSeasonSummary('BOS',games),{games:2,wins:1,losses:1,closeGames:2,overtimeGames:1,bestWin:2,worstLoss:5});
 assert.equal(seasonAwards([],new Map()).bestStatisticalSeason,null);
});

import { applyOffseasonDevelopment } from '../src/players/offseason-integration.js';
test('offseason: envelhecimento/desenvolvimento aplica apenas uma vez por temporada',()=>{
 const p={...roster[0],attributes:{...roster[0].attributes},age:20};
 const fake={career:{},players:new Map([[p.id,p]]),seasonStats:new Map([[p.id,{gp:40,min:1400}]])};
 const first=applyOffseasonDevelopment(fake,2027);
 const before=structuredClone(fake.players.get(p.id).attributes);
 const second=applyOffseasonDevelopment(fake,2027);
 assert.equal(first.applied,true);
 assert.equal(second.applied,false);
 assert.deepEqual(fake.players.get(p.id).attributes,before);
 assert.deepEqual(fake.career.lifecycleEvents,['development:2027']);
});
test('playableRoster: inativos e lesionados ficam excluídos',()=>{
 const list=[...roster.slice(0,5).map(p=>({...p})),{...roster[5],injury:{status:'Out'}},{...roster[6],rosterStatus:'inactive'}];
 assert.equal(playableRoster(list).length,5);
});

import { signFreeAgent } from '../src/contracts/market.js';
test('free agency: equipe sem permissão e ofertas inválidas não mudam o atleta',()=>{
 const free={...roster[0],teamId:null,rosterStatus:'standard'};
 const fake={career:{teamId:'DEN',mode:'franchise',capMode:'basic'},calendar:{season:2027},teams:new Map([['BOS',{id:'BOS',deadMoney:[]}]]),players:new Map([[free.id,free]]),contracts:new Map(),league:{cap:{salaryCap:160000000}}};
 assert.throws(()=>signFreeAgent({teamId:'BOS',playerId:free.id,salary:2000000},fake),/cargo/);
 fake.career.teamId='BOS';
 assert.throws(()=>signFreeAgent({teamId:'BOS',playerId:free.id,salary:-1},fake),/mínimo/);
 assert.equal(free.teamId,null);
 assert.equal(fake.contracts.size,0);
});
