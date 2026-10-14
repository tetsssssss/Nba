import test from 'node:test';
import assert from 'node:assert/strict';
import { broadcastCompetitionName, broadcastQuarterPoints, broadcastScorers,
  broadcastShowCard, createBroadcastShowTracker } from '../src/match/broadcast-show-state.js';
const sim = () => ({
  score: [32, 25], scoreLog: [{team: 0, q:1,pts:2}, {team:1,q:1,pts:3}, {team:0,q:1,pts:3}],
  teams: [
    {name:'Casa',lineup:[{short:'A'}],all:[{name:'Atleta A',stats:{pts:11,orb:1,drb:3,ast:4}}]},
    {name:'Fora',lineup:[{short:'B'}],all:[{name:'Atleta B',stats:{pts:8,orb:2,drb:1,ast:2}}]},
  ], quarter:1, t:0, over:false, timeout:null, clock:360, shotClock:24, events:[],
  boxScore() { return [{ total: { reb:12,ast:6,tpm:4,tov:3 } }, {total: {reb:9,ast:5,tpm:3,tov:2}}]; }
});
test('vinheta de pré-jogo usa quintetos e nomes existentes sem mudar a simulação', () => {
  const s=sim(); const before=JSON.stringify(s);
  const intro=broadcastShowCard(s,'pregame',{presentationTitle:'All-Star Game'});
  assert.equal(intro.heading,'NOITE DE JOGO');
  assert.equal(intro.competition,'All-Star Game');
  assert.deepEqual(intro.names,['Casa','Fora']);
  assert.deepEqual(intro.players.map(p=>p.player),['A','B']);
  assert.equal(JSON.stringify(s),before);
});
test('vinhetas de timeout/quarto/final usam somente estatísticas e placar existentes', () => {
  const s=sim();
  assert.deepEqual(broadcastQuarterPoints(s,1),[5,3]);
  assert.deepEqual(broadcastScorers(s,1).map(p=>p.pts),[11,8]);
  assert.deepEqual(broadcastShowCard(s,'timeout').stats[0],{label:'Rebotes',values:[12,9]});
  const quarter=broadcastShowCard(s,'quarter',{completedQuarter:1});
  assert.match(quarter.description,/5 × 3/);
  s.over=true;
  const final=broadcastShowCard(s,'final');
  assert.equal(final.heading,'FIM DE JOGO');
  assert.match(final.description,/Vitória de Casa por 7/);
});
test('não inventa playoff ou All-Star sem contexto',()=>{
  assert.equal(broadcastCompetitionName({mode:'quick'}),'NBA Universe TV · Partida');
  assert.match(broadcastCompetitionName({competition:'playoffs'}),/Playoffs/);
  assert.match(broadcastCompetitionName({competition:'finals'}),/Finais/);
  assert.match(broadcastCompetitionName({competition:'wnba'}),/WNBA/);
});
test('rastreador respeita tempo, pausas e transição de períodos sem duplicar',()=>{
  const s=sim();let ms=0;
  const tracker=createBroadcastShowTracker(s,{now:()=>ms,duration:500});
  assert.equal(tracker.refresh().kind,'pregame');
  ms=510;assert.equal(tracker.refresh(),null);
  s.quarter=2;
  assert.equal(tracker.refresh().kind,'quarter');
  assert.equal(tracker.refresh().kind,'quarter');
  ms=1020;assert.equal(tracker.refresh(),null);
  s.timeout={team:0,t:1};assert.equal(tracker.refresh().kind,'timeout');
  assert.equal(tracker.setEnabled(false),false);
  assert.equal(tracker.refresh(),null);
  s.over=true;
  assert.equal(tracker.refresh(),null);
  tracker.setEnabled(true);
  assert.equal(tracker.refresh(),null);
});
test('final automática aparece quando partida termina e expira após duas janelas',()=>{
  const s=sim();let ms=0;
  const tracker=createBroadcastShowTracker(s,{now:()=>ms,duration:200});
  tracker.refresh();ms=300;tracker.refresh();s.over=true;
  assert.equal(tracker.refresh().kind,'final');
  ms=650;assert.equal(tracker.refresh().kind,'final');
  ms=701;assert.equal(tracker.refresh(),null);
});
