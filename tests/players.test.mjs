import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ATTRIBUTE_GROUPS, ATTRIBUTE_KEYS, POSITIONS } from '../src/players/attributes.js';
import { OVERALL_CALIBRATION, POSITION_WEIGHTS, allPositionOveralls, positionOverall, positionScore } from '../src/players/overall.js';
import { TENDENCY_KEYS } from '../src/players/tendencies.js';
import { autoDepthChart } from '../src/players/depth.js';
import { careerStage, potentialEstimate } from '../src/players/potential.js';
import { createRng, hashString, stableNoise } from '../src/core/rng.js';

const flat = (value) => Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, value]));

test('catálogo: 45 atributos únicos em 5 grupos', () => {
  assert.equal(ATTRIBUTE_KEYS.length, 45);
  assert.equal(new Set(ATTRIBUTE_KEYS).size, 45);
  assert.deepEqual(ATTRIBUTE_GROUPS.map((g) => g.id), ['offense', 'playmaking', 'defense', 'physical', 'mental']);
  assert.equal(new Set(TENDENCY_KEYS).size, TENDENCY_KEYS.length);
  assert.ok(TENDENCY_KEYS.length >= 30, 'dezenas de tendências');
});

test('pesos por posição somam 1 e ignoram atributos fora do Overall', () => {
  for (const pos of POSITIONS) {
    const sum = Object.values(POSITION_WEIGHTS[pos]).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `${pos}: soma ${sum}`);
    for (const k of ['workEthic', 'leadership', 'competitiveness', 'durability']) assert.equal(POSITION_WEIGHTS[pos][k], 0, `${pos}.${k}`);
  }
});

test('Overall depende da posição', () => {
  const big = { ...flat(55), interiorDefense: 95, blocks: 95, defensiveRebounding: 95, rimFinishing: 92, strength: 90, offensiveRebounding: 90 };
  const guard = { ...flat(55), ballHandling: 95, passing: 95, passingVision: 92, threePoint: 92, pullUp: 90, speed: 90 };
  assert.ok(positionOverall(big, 'C') > positionOverall(big, 'PG') + 5, 'pivô vale mais como C');
  assert.ok(positionOverall(guard, 'PG') > positionOverall(guard, 'C') + 5, 'armador vale mais como PG');
  assert.deepEqual(Object.keys(allPositionOveralls(big)), POSITIONS);
});

test('Overall é monotônico e limitado a 0-100', () => {
  for (const pos of POSITIONS) {
    let previous = -1;
    for (let v = 0; v <= 100; v += 5) {
      const ovr = positionOverall(flat(v), pos);
      assert.ok(ovr >= previous, `${pos}: ${v} → ${ovr} < ${previous}`);
      assert.ok(ovr >= 0 && ovr <= 100);
      previous = ovr;
    }
    const base = flat(70);
    for (const k of ATTRIBUTE_KEYS) {
      assert.ok(positionScore({ ...base, [k]: 90 }, pos) >= positionScore(base, pos), `${pos}: subir ${k} não pode baixar o score`);
    }
  }
});

test('calibração do Overall tem a forma esperada', () => {
  for (const pos of POSITIONS) {
    const c = OVERALL_CALIBRATION[pos];
    assert.ok(c.b > 0 && c.c >= 0 && Number.isFinite(c.a) && c.knot > 40 && c.knot < 95, pos);
  }
});

test('depth chart automático não repete jogador e respeita lesões', () => {
  const mk = (id, positions, value, injury = null) => ({ id, name: `P${id}`, positions, attributes: flat(value), injury });
  const roster = [mk(1, ['PG'], 85), mk(2, ['PG', 'SG'], 80), mk(3, ['SG'], 70), mk(4, ['SF', 'PF'], 78), mk(5, ['PF', 'C'], 76), mk(6, ['C'], 90, { status: 'Out' }), mk(7, ['C'], 72), mk(8, ['SF'], 60)];
  const { chart, unused } = autoDepthChart(roster, 2);
  const used = POSITIONS.flatMap((p) => chart[p].map((s) => s.player.id));
  assert.equal(new Set(used).size, used.length, 'sem repetição');
  assert.equal(chart.PG[0].player.id, 1);
  assert.equal(chart.SG[0].player.id, 2, 'o segundo armador sobe para SG por render mais lá do que o SG puro');
  assert.ok(!used.includes(6), 'lesionado fora da rotação');
  assert.ok(unused.some((p) => p.id === 6));
  for (const pos of POSITIONS) assert.ok(chart[pos].length >= 1, `${pos} com titular`);
});

test('potencial exibido é uma faixa coerente', () => {
  const young = { id: 1630001, ovr: 74, potential: 88, ratingConfidence: 'low' };
  const est = potentialEstimate(young, 20);
  assert.ok(est.low >= young.ovr && est.high <= 99 && est.low <= est.high);
  assert.ok(est.high - est.low >= 4, 'jovem com pouca amostra tem faixa larga');
  assert.equal(est.exact, 88);
  const vet = { id: 2544, ovr: 89, potential: 89, ratingConfidence: 'high' };
  assert.deepEqual(potentialEstimate(vet, 34), { low: 89, high: 89, exact: 89 });
  assert.equal(careerStage(20).id, 'prospect');
  assert.equal(careerStage(28).id, 'prime');
  assert.equal(careerStage(36).id, 'decline');
});

test('RNG é determinístico por semente', () => {
  const a = createRng('save-1');
  const b = createRng('save-1');
  const c = createRng('save-2');
  const seqA = Array.from({ length: 20 }, () => a.next());
  assert.deepEqual(seqA, Array.from({ length: 20 }, () => b.next()));
  assert.notDeepEqual(seqA, Array.from({ length: 20 }, () => c.next()));
  assert.ok(seqA.every((v) => v >= 0 && v < 1));
  assert.equal(hashString('abc'), hashString('abc'));
  assert.equal(stableNoise(7, 'x'), stableNoise(7, 'x'));
  const r = createRng(42);
  for (let i = 0; i < 200; i++) {
    const n = r.int(3, 7);
    assert.ok(Number.isInteger(n) && n >= 3 && n <= 7);
  }
  assert.deepEqual([...r.shuffle([1, 2, 3, 4, 5])].sort(), [1, 2, 3, 4, 5]);
});
