import test from 'node:test';
import assert from 'node:assert/strict';
import { coreStrength, franchiseSnapshot, filterFranchises, gamePresentation } from '../src/ui/presentation-insights.js';

const t1 = { id: 'AAA', fullName: 'Águias de Seattle', name: 'Águias', division: 'Pacific', conference: 'West', record: { wins: 23 } };
const t2 = { id: 'BBB', fullName: 'Boston Stars', name: 'Stars', division: 'Atlantic', conference: 'East', record: { wins: 31 } };
const players = {
  AAA: [{ ovr: 80, age: 23 }, { ovr: 90, age: 29 }, { ovr: 70, age: 22 }],
  BBB: [{ ovr: 78, age: 30 }, { ovr: 77, age: 31 }],
};
const getData = () => franchiseSnapshot([t1, t2], (id) => players[id], () => ({ total: 200 }), (p) => p.age);

test('núcleo vazio não inventa força', () => assert.equal(coreStrength([]), null));
test('força é calculada com jogadores ordenados e não muta elenco', () => {
  const input = [...players.AAA];
  const strength = coreStrength(input);
  assert.equal(Math.round(strength), 80);
  assert.deepEqual(input.map((p) => p.ovr), [80, 90, 70]);
});
test('núcleo exclui overall inválido', () => assert.equal(coreStrength([{ ovr: NaN }, { ovr: 77 }]), 77));
test('snapshot agrega equipes, atletas e idade', () => {
  const s = getData();
  assert.equal(s.teams, 2);
  assert.equal(s.athletes, 5);
  assert.equal(s.rows[0].avgAge, 74 / 3);
  assert.equal(s.strongest.team.id, 'AAA');
});
test('snapshot não passa índice do elenco ao callback de idade', () => {
  const s = franchiseSnapshot([t1], (id) => players[id], () => ({ total: 200 }), (player, date = '2026-10-05') => {
    assert.equal(date, '2026-10-05');
    return player.age;
  });
  assert.equal(s.rows[0].avgAge, 74 / 3);
});
test('snapshot não modifica o mundo original', () => {
  const input = [t1, t2];
  getData();
  assert.equal(input[0], t1);
  assert.equal(t1.record.wins, 23);
});
test('filtro busca texto com acentos e por divisão', () => {
  assert.deepEqual(filterFranchises(getData().rows, { search: 'aguias' }).map((r) => r.team.id), ['AAA']);
  assert.deepEqual(filterFranchises(getData().rows, { search: 'atlantic' }).map((r) => r.team.id), ['BBB']);
});
test('filtro respeita conferência e busca simultaneamente', () => {
  assert.deepEqual(filterFranchises(getData().rows, { conference: 'West', search: 'boston' }), []);
  assert.deepEqual(filterFranchises(getData().rows, { conference: 'East' }).map((r) => r.team.id), ['BBB']);
});
test('ordenação por nome, vitórias e folha mantém array original', () => {
  const original = getData().rows;
  assert.deepEqual(filterFranchises(original, { order: 'name' }).map((r) => r.team.id), ['AAA', 'BBB']);
  assert.deepEqual(filterFranchises(original, { order: 'wins' }).map((r) => r.team.id), ['BBB', 'AAA']);
  assert.deepEqual(original.map((r) => r.team.id), ['AAA', 'BBB']);
});
test('jogo agendado não gera margem nem líder fictício', () => {
  const p = gamePresentation({ status: 'scheduled' }, null);
  assert.equal(p.complete, false);
  assert.equal(p.difference, null);
  assert.deepEqual(p.leaders, [null, null]);
});
test('placar diferencia mandante e visitante corretamente', () => {
  const p = gamePresentation({ status: 'final', score: [104, 111] }, null);
  assert.equal(p.result, 'away');
  assert.equal(p.difference, 7);
});
test('placar empate residual é relatado e não é interpretado como vitória', () => {
  const p = gamePresentation({ status: 'final', score: [100, 100] }, null);
  assert.equal(p.result, 'tied');
  assert.equal(p.difference, 0);
});
test('parciais e prorrogações são lidas sem modificar o detalhe', () => {
  const detail = { periods: [[25, 24, 23, 25, 11], [21, 28, 22, 26, 9]] };
  const p = gamePresentation({ status: 'final', score: [108, 106] }, detail);
  assert.equal(p.periods.length, 5);
  assert.deepEqual(p.periods[4], { number: 5, label: '1ª prorrogação', home: 11, away: 9 });
  assert.deepEqual(detail.periods[0], [25, 24, 23, 25, 11]);
});
test('lideranças usam pontos do box e respeitam ordem mandante/visitante', () => {
  const detail = { box: [
    { players: [{ id: 'p1', name: 'A', pts: 17 }, { id: 'p2', name: 'B', pts: 30 }] },
    { players: [{ id: 'p3', name: 'C', pts: 24 }] },
  ] };
  const p = gamePresentation({ status: 'final', score: [113, 111] }, detail);
  assert.equal(p.leaders[0].name, 'B');
  assert.equal(p.leaders[1].points, 24);
  assert.equal(detail.box[0].players[0].name, 'A');
});
test('dados históricos sem parciais ou box permanecem legíveis', () => {
  const p = gamePresentation({ status: 'final', score: [82, 70] }, { periods: null, box: [] });
  assert.deepEqual(p.periods, []);
  assert.deepEqual(p.leaders, [null, null]);
});
