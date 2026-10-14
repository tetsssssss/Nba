import test from 'node:test';
import assert from 'node:assert/strict';
import { ARCADE25D_CAMERAS, arcadePoseFor, projectArcadeCourt } from '../src/match/renderer-arcade25d.js';

test('2.5D Arcade expõe quatro câmeras distintas sem tocar no motor', () => {
  assert.deepEqual(ARCADE25D_CAMERAS.map(([id]) => id), ['broadcast', 'close', 'follow', 'baseline']);
});

test('pose arcade usa eventos do MatchSim sem modificar jogador, bola ou relógio', () => {
  const player = { id: 'p-23', vx: 6, vy: 0, hasBall: false, anim: { type: 'pass', t: 10 } };
  const sim = { t: 10.2, ball: { state: 'held', owner: null }, clock: 421 };
  assert.equal(arcadePoseFor(player, sim), 2);
  assert.deepEqual(player, { id: 'p-23', vx: 6, vy: 0, hasBall: false, anim: { type: 'pass', t: 10 } });
  assert.deepEqual(sim, { t: 10.2, ball: { state: 'held', owner: null }, clock: 421 });
});

test('projeção arcade é pura e preserva a leitura de profundidade', () => {
  const view = { w: 1200, h: 640, cx: 47, width: 104, scale: 18 };
  const near = projectArcadeCourt({ x: 47, y: 5, z: 0 }, view);
  const far = projectArcadeCourt({ x: 47, y: 45, z: 0 }, view);
  const lifted = projectArcadeCourt({ x: 47, y: 25, z: 8 }, view);
  assert.ok(near.depth < far.depth);
  assert.ok(lifted.y < projectArcadeCourt({ x: 47, y: 25, z: 0 }, view).y);
  assert.deepEqual(view, { w: 1200, h: 640, cx: 47, width: 104, scale: 18 });
});
