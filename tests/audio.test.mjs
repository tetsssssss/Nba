import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyBasketballEvent, createSoundscape, SOUND_KINDS } from '../src/audio/soundscape.js';

const cases = [
  ['João converte bola de três — livre', 'swish'],
  ['Bruno converte enterrada', 'dunk'],
  ['Ana erra bandeja', 'rim'],
  ['Joana converte o lance livre', 'swish'],
  ['Joana erra o lance livre', 'rim'],
  ['Pivô faz falta em Ana', 'whistle'],
  ['Estouro dos 24 segundos.', 'buzzer'],
  ['Fim do 2º quarto: Casa 40 x 39 Visitante', 'buzzer'],
  ['Fim do tempo extra', 'buzzer'],
  ['Defensor rouba a bola de Atacante', 'steal'],
  ['Defensor dá um toco em Atacante', 'steal'],
  ['Bola fora.', 'whistle'],
  ['Tempo pedido pelo equipe', 'whistle'],
  ['Armador passe para Ala', 'pass'],
  ['Armador pega o rebote defensivo', null],
];
for (const [text, expected] of cases) test(`classifica som: ${text}`, () => assert.equal(classifyBasketballEvent({text}), expected));
test('ignora eventos inválidos sem quebrar', () => {
  for (const v of [null, undefined, {}, {text: 42}]) assert.equal(classifyBasketballEvent(v), null);
});
test('catálogo possui somente identificadores de som conhecidos', () => assert.equal(new Set(SOUND_KINDS).size, SOUND_KINDS.length));

function fakeAudio() {
  const calls = [];
  const param = () => ({ value: 1, setTargetAtTime: (...a) => calls.push(['master', ...a]), setValueAtTime(){}, linearRampToValueAtTime(){}, exponentialRampToValueAtTime(){} });
  const node = () => ({connect(){}, gain:param(), frequency:param(), start(){calls.push(['start'])}, stop(){calls.push(['stop'])}});
  const ctx = { state: 'suspended', destination: {}, currentTime: 1, sampleRate: 8000,
    async resume(){this.state='running';calls.push(['resume']);}, async close(){this.state='closed';calls.push(['close']);},
    createGain:node,createOscillator:node,createBufferSource:node,createBiquadFilter:node,
    createBuffer(){return {getChannelData(){return new Float32Array(4000)}};},
  };
  return {ctx, calls};
}
test('nenhum efeito é executado antes da ativação pelo usuário', async () => {
  const {ctx, calls} = fakeAudio();
  const engine=createSoundscape({contextFactory:()=>ctx,preferences:()=>({enabled:true,master:.7,court:1,arena:1})});
  engine.setActive(true);
  assert.equal(engine.play('bounce'),false);
  assert.equal(calls.length,0);
  assert.equal(await engine.unlock(), true);
  assert.equal(engine.play('bounce'),true);
  assert.ok(calls.some(c=>c[0]==='start'));
  engine.dispose();
});
test('navegador sem AudioContext não causa exceção', async () => {
  const engine=createSoundscape({contextFactory:()=>null,preferences:()=>({enabled:true,master:1,court:1,arena:1})});
  engine.setActive(true); assert.equal(await engine.unlock(), false);assert.equal(engine.play('swish'),false);
});
test('preferência desabilitada bloqueia desbloqueio e todos os efeitos', async () => {
  const {ctx}=fakeAudio(); const options={enabled:false,master:1,court:1,arena:1};
  const engine=createSoundscape({contextFactory:()=>ctx,preferences:()=>options});
  engine.setActive(true); assert.equal(await engine.unlock(),false);
  options.enabled=true;await engine.unlock();assert.equal(engine.play('whistle'),true);
  options.enabled=false;assert.equal(engine.play('buzzer'),false);engine.dispose();
});
test('volume zero e canal silenciado bloqueiam efeitos', async () => {
  const {ctx}=fakeAudio();const p={enabled:true,master:0,court:1,arena:1};
  const engine=createSoundscape({contextFactory:()=>ctx,preferences:()=>p});engine.setActive(true);await engine.unlock();
  assert.equal(engine.play('rim'),false);p.master=1;p.court=0;assert.equal(engine.play('rim'),false);
  p.court=1;assert.equal(engine.play('rim'),true);p.arena=0;assert.equal(engine.play('crowd'),false);engine.dispose();
});
test('repetições excessivas sofrem cooldown, sem alterar eventos', async () => {
  let now=1000;const {ctx}=fakeAudio();const engine=createSoundscape({contextFactory:()=>ctx,timestamp:()=>now,preferences:()=>({enabled:true,master:1,court:1,arena:1})});
  engine.setActive(true);await engine.unlock();
  const e={text:'Arremessador converte bola de três',major:false};
  assert.equal(engine.playBasketballEvent(e),true);
  assert.equal(engine.playBasketballEvent(e),false);
  assert.deepEqual(e,{text:'Arremessador converte bola de três',major:false});
  now+=300;assert.equal(engine.playBasketballEvent(e),true);engine.dispose();
});
test('simulação rápida não gera avalanche de sons', async () => {
  const {ctx}=fakeAudio();const engine=createSoundscape({contextFactory:()=>ctx,preferences:()=>({enabled:true,master:1,court:1,arena:1})});
  engine.setActive(true);await engine.unlock();
  assert.equal(engine.playBasketballEvent({text:'converte enterrada'}, {speed:8}),false);
  assert.equal(engine.courtTick({ballHeld:true,speed:8}),false);
  assert.equal(engine.played,0);engine.dispose();
});
test('efeitos param depois que a tela é desmontada', async () => {
  const {ctx}=fakeAudio();const engine=createSoundscape({contextFactory:()=>ctx,preferences:()=>({enabled:true,master:1,court:1,arena:1})});
  await engine.unlock();engine.setActive(true);assert.equal(engine.play('shoe'),true);
  engine.setActive(false);assert.equal(engine.play('pass'),false);engine.dispose();
});
test('todas as categorias de efeitos sintetizam sem falhas', async () => {
  let now=0;const {ctx}=fakeAudio();const engine=createSoundscape({contextFactory:()=>ctx,timestamp:()=>now,preferences:()=>({enabled:true,master:1,court:1,arena:1})});
  await engine.unlock();engine.setActive(true);
  for(const kind of SOUND_KINDS){now+=1000;assert.equal(engine.play(kind),true,kind);}
  assert.equal(engine.played,SOUND_KINDS.length);engine.dispose();
});
