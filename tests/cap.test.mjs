import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capHitIn, capLines, contractSummary, salaryIn, seasonLabel, teamPayroll } from '../src/contracts/cap.js';

const cap = { salaryCap: 100, luxuryTax: 130, firstApron: 140, secondApron: 150 };
const contract = (playerId, salaries, extra = {}) => ({ playerId, years: salaries.map((salary, i) => ({ season: 2027 + i, salary, option: null })), twoWay: false, source: 'hoopshype', ...extra });
const world = (list) => new Map(list.map((c) => [c.playerId, c]));
const roster = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));

test('rótulo de temporada usa o ano final', () => {
  assert.equal(seasonLabel(2027), '2026-27');
  assert.equal(seasonLabel(2030), '2029-30');
  assert.equal(seasonLabel(2100), '2099-00');
});

test('resumo de contrato', () => {
  const c = contract(1, [10, 11, 12]);
  c.years[2].option = 'player';
  assert.deepEqual(contractSummary(c, 2027), { salary: 10, yearsLeft: 3, total: 33, endSeason: 2029, expiring: false, finalOption: 'player', estimated: false });
  assert.equal(contractSummary(c, 2029).expiring, true);
  assert.equal(contractSummary(c, 2030).endSeason, null);
  assert.equal(contractSummary(null, 2027), null);
  assert.equal(contractSummary(contract(2, [5], { source: 'estimated' }), 2027).estimated, true);
  assert.equal(salaryIn(c, 2028), 11);
  assert.equal(salaryIn(c, 2040), 0);
});

test('folha: status por faixa de cap', () => {
  const run = (total, mode = 'full') => teamPayroll(roster(1), world([contract(1, [total])]), { deadMoney: [] }, cap, 2027, mode).status;
  assert.equal(run(90), 'under-cap');
  assert.equal(run(100), 'under-cap');
  assert.equal(run(120), 'over-cap');
  assert.equal(run(135), 'tax');
  assert.equal(run(145), 'first-apron');
  assert.equal(run(160), 'second-apron');
});

test('folha: o modo de cap define quais linhas existem', () => {
  const run = (mode) => teamPayroll(roster(1), world([contract(1, [160])]), { deadMoney: [] }, cap, 2027, mode).status;
  assert.equal(run('basic'), 'over-cap');
  assert.equal(run('intermediate'), 'tax');
  assert.equal(run('advanced'), 'second-apron');
  assert.deepEqual(capLines('basic'), { luxuryTax: false, aprons: false });
  assert.deepEqual(capLines('intermediate'), { luxuryTax: true, aprons: false });
});

test('folha: two-way fora do cap, dead money dentro, cap hit prevalece sobre salário', () => {
  const contracts = world([
    contract(1, [50]),
    contract(2, [1], { twoWay: true }),
    { ...contract(3, [4]), years: [{ season: 2027, salary: 4, capHit: 2.5, option: null }] },
    contract(4, [3], { source: 'estimated' }),
  ]);
  const team = { deadMoney: [{ name: 'Dispensado', years: [{ season: 2027, amount: 20 }, { season: 2028, amount: 20 }] }] };
  const p = teamPayroll(roster(4), contracts, team, cap, 2027);
  assert.equal(p.live, 55.5);
  assert.equal(p.dead, 20);
  assert.equal(p.total, 75.5);
  assert.equal(p.twoWay, 1);
  assert.equal(p.standardCount, 3);
  assert.equal(p.twoWayCount, 1);
  assert.equal(p.estimated, 3);
  assert.equal(p.capSpace, 24.5);
  assert.equal(capHitIn(contracts.get(3), 2027), 2.5);
  assert.equal(teamPayroll(roster(4), contracts, team, cap, 2029).total, 0, 'sem compromissos em 2028-29');
});

test('folha: elenco vazio e jogador sem contrato não quebram', () => {
  const p = teamPayroll([{ id: 9 }], new Map(), undefined, cap, 2027);
  assert.equal(p.total, 0);
  assert.equal(p.standardCount, 1);
  assert.equal(teamPayroll([], new Map(), { deadMoney: [] }, cap, 2027).status, 'under-cap');
});
