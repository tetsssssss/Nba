import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMERAS_3D, GRAPHICS_QUALITY, MatchRenderer3D, parseObjMesh, qualityOf, visualBall, replayProjection } from '../src/match/renderer3d.js';

test('cinco câmeras e três níveis de qualidade têm valores válidos', () => {
  assert.equal(new Set(CAMERAS_3D.map(([id]) => id)).size, 5);
  assert.deepEqual(Object.keys(GRAPHICS_QUALITY), ['low', 'medium', 'high']);
  assert.equal(qualityOf('antigo'), GRAPHICS_QUALITY.medium);
  assert.ok(GRAPHICS_QUALITY.low.dpr < GRAPHICS_QUALITY.high.dpr);
});

test('a representação 3D da bola lê o estado sem modificá-lo', () => {
  const ball = { x: 31, y: 22, z: 8, state: 'shot', owner: null };
  const sim = { ball, t: 0.4, state: 'play' };
  assert.deepEqual(visualBall(sim), { x: 31, y: 22, z: 8 });
  assert.deepEqual(ball, { x: 31, y: 22, z: 8, state: 'shot', owner: null });
  ball.state = 'held'; ball.owner = { dribbled: true };
  const drawn = visualBall(sim);
  assert.equal(drawn.x, 31);
  assert.ok(drawn.z >= 0.5 && drawn.z <= 3.2);
  assert.equal(ball.z, 8);
  ball.state = 'dead';
  assert.equal(visualBall(sim), null);
});

test('WebGL2 ausente falha antes de tocar na simulação', () => {
  const sim = { score: [3, 2], ball: { x: 1, y: 2, z: 3 } };
  const canvas = { addEventListener() {}, getContext() { return null; } };
  assert.throws(() => new MatchRenderer3D(canvas, sim), /WebGL2 indisponível/);
  assert.deepEqual(sim.score, [3, 2]);
  assert.deepEqual(sim.ball, { x: 1, y: 2, z: 3 });
});

test('OBJ exportado do Blender vira malha sem tocar no estado da partida', () => {
  const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'f 1 2 3'].join('\n');
  const vertices = parseObjMesh(obj);
  assert.equal(vertices.length, 24, 'um triângulo gera 3 vértices de 8 atributos');
  assert.deepEqual(vertices.slice(0, 3), [0, 0, 0]);
  assert.throws(() => parseObjMesh('v 0 0 0'), /OBJ sem faces/);
});

test('replay usa snapshots reais sem mudar o estado vivo', () => {
  const livePlayer={id:'p1',x:20,y:20,vx:0,vy:0,team:0,anim:null};
  const sim={t:9,score:[4,3],ball:{x:20,y:20,z:4,state:'held'},teams:[{all:[livePlayer]},{all:[]}]};
  const old={t:2,players:[['p1',10,10,0,0]]};
  const frame={t:2.1,q:1,clock:400,score:[2,3],ball:[12,11,6,'shot'],players:[['p1',12,11,0.5,0]]};
  const projected=replayProjection(sim,frame,old);
  assert.deepEqual(projected.score,[2,3]);
  assert.deepEqual(projected.ball,{x:12,y:11,z:6,state:'shot',owner:null});
  assert.ok(Math.abs(projected.court[0].vx-20)<1e-9);
  assert.deepEqual(sim.score,[4,3]);
  assert.equal(sim.ball.x,20);
  assert.equal(livePlayer.x,20);
});
