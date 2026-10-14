import test from 'node:test';
import assert from 'node:assert/strict';
import { createBroadcastNarrator } from '../src/audio/broadcast-narration.js';
class FakeVoice { constructor(text) { this.text = text; } }
test('narrador só fala após ativação e somente fatos registrados',()=>{
  const said=[]; let cancelled=0;
  const synth={speaking:false,speak:utter=>said.push(utter),cancel:()=>cancelled++};
  const narrator=createBroadcastNarrator({synth,Voice:FakeVoice});
  assert.equal(narrator.announce({type:'block',text:'toco de Silva'}),false);
  assert.equal(narrator.setEnabled(true),true);
  assert.equal(narrator.announce({type:'shot',text:'Arremesso não cai',major:false}),false);
  assert.equal(narrator.announce({type:'shot',teamName:'Casa',text:'Silva faz enterrada',major:true}),true);
  assert.equal(said.length,1);assert.equal(said[0].lang,'pt-BR');
  assert.match(said[0].text,/Casa. Silva faz enterrada/);
  assert.equal(narrator.announce({type:'block',text:'toco',major:true},{speed:4}),false);
  narrator.dispose();assert.equal(cancelled,1);
});
test('narrador sem API não quebra partida',()=>{
  const n=createBroadcastNarrator({synth:null,Voice:null});
  assert.equal(n.available,false);assert.equal(n.setEnabled(true),false);
  assert.equal(n.announce({type:'timeout',text:'tempo'}),false);
});
