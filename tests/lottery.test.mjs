import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/core/rng.js';
import { DEFAULT_LOTTERY_ODDS, drawLottery, planDraftOrder } from '../src/draft/lottery.js';
import { buildPickSet } from '../src/contracts/picks.js';

const ids = Array.from({ length: 32 }, (_, i) => `T${String(i + 1).padStart(2, '0')}`);
const standings = (n = 32) => ids.slice(0, n).map((teamId, i) => ({ teamId, wins: 10 + i, losses: 72 - i, playoffs: i >= n - 16 }));

test('loteria: soma das probabilidades = 100% e sorteio nunca repete equipe', () => {
  assert.equal(DEFAULT_LOTTERY_ODDS.reduce((a, b) => a + b, 0), 1000);
  const pool = ids.slice(0, 14);
  for (let seed = 0; seed < 50; seed++) {
    const out = drawLottery(pool, { rng: createRng(seed) });
    assert.equal(out.drawn.length, 4);
    assert.equal(new Set(out.order).size, 14);
    assert.deepEqual([...out.order].sort(), [...pool].sort());
  }
});

test('loteria: nenhuma equipe cai mais de 4 posições e a pior tem a maior chance de ser a 1ª', () => {
  const pool = ids.slice(0, 14);
  const first = new Map();
  for (let seed = 0; seed < 1500; seed++) {
    const out = drawLottery(pool, { rng: createRng(`s${seed}`) });
    pool.forEach((id, i) => assert.ok(out.order.indexOf(id) <= i + 4, `${id} caiu demais`));
    first.set(out.order[0], (first.get(out.order[0]) ?? 0) + 1);
  }
  assert.ok(first.get('T01') > first.get('T14') || !first.get('T14'), 'pior campanha tem mais chances');
  assert.ok(first.get('T01') / 1500 > 0.1 && first.get('T01') / 1500 < 0.18, `~14%: ${first.get('T01') / 1500}`);
});

test('ordem do Draft comum: 32 + 32 picks, todos os números únicos', () => {
  const picks = buildPickSet({ expansion: {} }, ids, 2028, { date: '2028-06-01' });
  const plan = planDraftOrder({ season: 2028, standings: standings(), picks, rng: createRng('a') });
  assert.equal(plan.round1Size, 32);
  assert.equal(plan.numbers.size, 64);
  assert.deepEqual([...plan.numbers.values()].sort((a, b) => a - b), Array.from({ length: 64 }, (_, i) => i + 1));
  // playoff teams ficam depois dos 14 da loteria + 2 não classificados
  assert.ok(plan.numbers.get('2028-R1-T32') > 16);
});

test('ordem do Draft 2027 com reservas: LVJ #1/#10 e SEA #4/#5; 34 picks na 1ª rodada, sem duplicatas', () => {
  const league = { expansion: { initialDraftSeason: 2027, initialDraftPicks: { LVJ: [1, 10], SEA: [4, 5] } } };
  const teams = [...ids.slice(0, 30), 'LVJ', 'SEA'];
  const picks = buildPickSet(league, teams, 2027, { date: '2027-06-01' });
  const table = teams.map((teamId, i) => ({ teamId, wins: 5 + i, losses: 77 - i, playoffs: i >= 14 }));
  const plan = planDraftOrder({ season: 2027, standings: table, picks, rng: createRng('b') });
  assert.equal(plan.round1Size, 34);
  assert.equal(plan.numbers.size, 66);
  const numbers = [...plan.numbers.values()].sort((a, b) => a - b);
  assert.deepEqual(numbers, Array.from({ length: 66 }, (_, i) => i + 1));
  assert.equal(plan.numbers.get('2027-R1-LVJ'), 1);
  assert.equal(plan.numbers.get('2027-R1-LVJ-X2'), 10);
  assert.equal(plan.numbers.get('2027-R1-SEA'), 4);
  assert.equal(plan.numbers.get('2027-R1-SEA-X2'), 5);
  // as 30 franquias estabelecidas ocupam exatamente os 30 slots restantes da 1ª rodada
  const taken = new Set(['2027-R1-LVJ', '2027-R1-LVJ-X2', '2027-R1-SEA', '2027-R1-SEA-X2']);
  const others = [...plan.numbers].filter(([id]) => id.includes('-R1-') && !taken.has(id)).map(([, n]) => n);
  assert.equal(others.length, 30);
  assert.ok(others.every((n) => ![1, 4, 5, 10].includes(n)));
  // 2ª rodada: 32 picks depois da 1ª
  const second = [...plan.numbers].filter(([id]) => id.includes('-R2-')).map(([, n]) => n);
  assert.equal(second.length, 32);
  assert.ok(Math.min(...second) === 35);
});

test('ordem do Draft: determinística para a mesma semente', () => {
  const picks = buildPickSet({ expansion: {} }, ids, 2028, { date: 'x' });
  const a = planDraftOrder({ season: 2028, standings: standings(), picks, rng: createRng('z') });
  const b = planDraftOrder({ season: 2028, standings: standings(), picks, rng: createRng('z') });
  assert.deepEqual([...a.numbers], [...b.numbers]);
});
