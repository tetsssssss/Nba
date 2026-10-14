import test from 'node:test';
import assert from 'node:assert/strict';
import { broadcastClockText, broadcastPeriodLabel, broadcastOverlayState, broadcastCueFromEvent, createBroadcastCueTracker } from '../src/match/broadcast-overlay-state.js';

test('placar televisivo usa período, clock, posse e pontos oficiais', () => {
  const snapshot={teams:['Estrelas','Titãs'],score:[89,86],quarter:4,clock:268.9,shotClock:10.2,possession:0,over:false};
  const before=structuredClone(snapshot);
  const view=broadcastOverlayState(snapshot,{mode:'official'});
  assert.deepEqual(view.names,['Estrelas','Titãs']);
  assert.deepEqual(view.score,['89','86']);
  assert.equal(view.period,'4º QUARTO');
  assert.equal(view.clock,'4:28');
  assert.equal(view.shotClock,'11s');
  assert.equal(view.possession,0);
  assert.equal(view.mode,'JOGO OFICIAL');
  assert.deepEqual(snapshot,before);
});

test('prorrogação, encerramento e formatos de relógio não inventam série', () => {
  assert.equal(broadcastPeriodLabel(5),'1ª PRORROGAÇÃO');
  assert.equal(broadcastPeriodLabel(6,true),'FINAL · 2ª PRORROGAÇÃO');
  assert.equal(broadcastClockText(11.8),'0:11');
  assert.equal(broadcastClockText(-20),'0:00');
  const s=broadcastOverlayState({teams:['A','B'],score:[101,101],quarter:5,clock:0,shotClock:0,possession:null,over:true});
  assert.equal(s.shotClock,'—');
  assert.equal(s.possession,null);
  assert.equal(s.mode,'EXIBIÇÃO');
  assert.equal(Object.keys(s).includes('series'),false);
});

test('classificação de lance não afirma acerto sem confirmação',()=>{
  const cue=broadcastCueFromEvent({text:'Arremesso de três não cai',team:1,clock:81,q:2},['Casa','Fora']);
  assert.equal(cue.type,'shot');
  assert.equal(cue.label,'Finalização');
  assert.equal(cue.teamName,'Fora');
  assert.equal(cue.text,'Arremesso de três não cai');
  assert.equal(broadcastCueFromEvent({text:'Passe lateral',team:0}),null);
  assert.equal(broadcastCueFromEvent({text:''}),null);
});

test('rastreador ignora histórico inicial e anuncia somente eventos novos', () => {
  const before={text:'A faz cesta',team:0,q:1,clock:90};
  const tracker=createBroadcastCueTracker([before]);
  assert.equal(tracker.observe([before],['A','B']),null);
  const latest={text:'B pede tempo',team:1,q:1,clock:80};
  assert.equal(tracker.observe([before,latest],['A','B']).type,'timeout');
  assert.equal(tracker.observe([before,latest],['A','B']),null);
});

test('rastreador resume lotes acelerados sem criar acontecimentos', () => {
  const tracker=createBroadcastCueTracker([]);
  const group=[{text:'A faz cesta',team:0},{text:'B dá um passe',team:1},{text:'A dá um toco',team:0}];
  const cue=tracker.observe(group,['A','B']);
  assert.equal(cue.type,'block');
  assert.equal(tracker.observe(group,['A','B']),null);
  const rotated=[{text:'A rouba a bola',team:0}];
  assert.equal(tracker.observe(rotated,['A','B']).type,'steal');
  assert.equal(tracker.observe([],['A','B']),null);
});

test('dados legados e valores inválidos não provocam exceções', () => {
  const value=broadcastOverlayState({score:[NaN,-3],teams:[null,'B'],quarter:'5',clock:Infinity,shotClock:-8,over:false});
  assert.deepEqual(value.score,['0','0']);
  assert.equal(value.clock,'0:00');
  assert.equal(value.shotClock,'0s');
  assert.equal(value.names[1],'B');
});
