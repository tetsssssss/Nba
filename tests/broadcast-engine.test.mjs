import test from 'node:test';
import assert from 'node:assert/strict';
import { broadcastSnapshot, scoreProgression, classifyBroadcastEvent, recommendBroadcastCamera } from '../src/match/broadcast-bridge.js';

const sim = () => ({
  teams: [{ name:'Azuis' }, { name:'Verdes' }], score:[5,3], quarter:2, clock:69.5,
  shotClock:12.2, offense:1, over:false,
  scoreLog:[{ team:0, pts:2, q:1, t:1 }, { team:1, pts:3, q:1, t:2 }, { team:0, pts:3, q:2, t:3 }],
  events:[{ team:0, text:'A enterra!', q:2, clock:80, major:true }, { team:1, text:'B pede tempo', q:2, clock:70, major:false }],
});

test('transmissão reflete placar, posse e relógios oficiais sem modificar o simulador', () => {
  const input=sim(), before=structuredClone(input), shot=broadcastSnapshot(input);
  assert.deepEqual(shot.score,[5,3]);
  assert.equal(shot.headline,'Azuis lidera por 2 pontos');
  assert.equal(shot.possession,1);
  assert.equal(shot.shotClock,12.2);
  assert.equal(shot.events[0].type,'timeout');
  assert.deepEqual(input,before);
});
test('progresso do placar é cumulativo e preserva ordem dos lançamentos', () => {
  const progress=scoreProgression(sim().scoreLog,[5,3]);
  assert.equal(progress.verified,true);
  assert.deepEqual(progress.points.map(p=>p.lead),[0,2,-1,2]);
  assert.deepEqual(progress.totals,[5,3]);
});
test('histórico incompleto não é anunciado como verificado', () => {
  assert.equal(scoreProgression([{team:0,pts:2}], [4,0]).verified,false);
});
test('logs inválidos não produzem pontos fantasma', () => {
  const p=scoreProgression([{team:-1,pts:3},{team:2,pts:2},{team:0,pts:-1},{team:1,pts:2},{team:0,pts:Infinity}]);
  assert.deepEqual(p.totals,[0,2]);
});
test('fim de jogo relata vencedor e elimina posse', () => {
  const state=sim();state.over=true;
  const s=broadcastSnapshot(state);
  assert.equal(s.headline,'Azuis venceu por 2 pontos');
  assert.equal(s.possession,null);
});
test('empate não atribui líder fictício', () => {
  const state=sim(); state.score=[10,10];
  assert.equal(broadcastSnapshot(state).leader,null);
});
test('reconhecimento de eventos usa apenas texto registrado', () => {
  assert.equal(classifyBroadcastEvent({text:'Faz o toco!'}),'block');
  assert.equal(classifyBroadcastEvent({text:'Rebote defensivo'}),'rebound');
  assert.equal(classifyBroadcastEvent({text:'A marca uma cesta'}),'shot');
  assert.equal(classifyBroadcastEvent({text:'Mensagem desconhecida'}),'other');
});
test('diretor da transmissão recomenda câmeras sem alterar simulação', () => {
  const snap=broadcastSnapshot(sim());
  assert.equal(recommendBroadcastCamera(snap,{time:1, previousChange:0, minInterval:4}),'broadcast');
  const shot={...snap,events:[{type:'shot',major:true}]};
  assert.equal(recommendBroadcastCamera(shot,{time:10}),'basket');
  assert.equal(recommendBroadcastCamera(shot,{time:10,previous:'follow',previousChange:9}),'follow');
  assert.equal(recommendBroadcastCamera({...snap,over:true},{time:10}),'diagonal');
});
test('entradas sem arrays ou com dados legados não derrubam o painel', () => {
  const state={score:[8,6],quarter:1,clock:15,teams:[]};
  assert.equal(broadcastSnapshot(state).events.length,0);
  assert.equal(broadcastSnapshot(state).progress.verified,false);
});
