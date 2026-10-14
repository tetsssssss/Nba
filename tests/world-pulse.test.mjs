import test from 'node:test';
import assert from 'node:assert/strict';
import { franchisePulse, seasonSnapshot } from '../src/season/world-pulse.js';

const teams = [
  { id: 'A', name: 'Alpha', conference: 'East', division: 'Atlantic' },
  { id: 'B', name: 'Beta', conference: 'East', division: 'Atlantic' },
  { id: 'C', name: 'Charlie', conference: 'West', division: 'Pacific' },
];
const game = (id, home, away, score, extra = {}) => ({ id, season: 2026, type: 'regular', status: 'final', date: `2026-10-${String(id).padStart(2, '0')}`, home, away, score, ...extra });

const fixtures = [
  game(1, 'A', 'B', [104, 102]),
  game(2, 'B', 'A', [98, 112]),
  game(3, 'C', 'A', [99, 100], { overtimes: 1 }),
  game(4, 'B', 'C', [95, 93]),
  game(5, 'A', 'B', [120, 119]),
];

test('retrato considera apenas jogos oficiais finalizados da temporada atual', () => {
  const extra = [game(6, 'A', 'B', [130, 100], { type: 'exhibition' }), game(7, 'A', 'B', [130, 100], { season: 2025 }), game(8, 'A', 'B', [130, 100], { status: 'scheduled' })];
  const pulse = seasonSnapshot(teams, [...fixtures, ...extra], 2026);
  assert.equal(pulse.played, 5);
  assert.equal(pulse.standings.rows.get('A').w, 4);
  assert.equal(pulse.standings.rows.get('B').l, 3);
});

test('destaca sequências positivas e negativas calculadas, sem criar dados', () => {
  const pulse = seasonSnapshot(teams, fixtures, 2026);
  assert.equal(pulse.standings.rows.get('A').streak, 4);
  assert.equal(pulse.streaks[0].id, 'A');
  assert.equal(pulse.streaks[0].streak, 4);
  assert.equal(pulse.rankings[0].id, 'A');
});

test('duelos repetidos têm histórico de vitórias e finais apertados', () => {
  const pulse = seasonSnapshot(teams, fixtures, 2026);
  const duel = pulse.duels.find((d) => d.teamIds.includes('A') && d.teamIds.includes('B'));
  assert.equal(duel.meetings, 3);
  assert.equal(duel.close, 2);
  assert.deepEqual(duel.wins, { A: 3, B: 0 });
});

test('realces representam prorrogação e placares verdadeiros', () => {
  const pulse = seasonSnapshot(teams, fixtures, 2026);
  assert.equal(pulse.highlights.length, 4);
  assert.match(pulse.highlights.find((h) => h.game.id === 3).title, /prorrogação/);
  assert.match(pulse.highlights.find((h) => h.game.id === 1).text, /104 a 102/);
});

test('pré-temporada não produz ranking fictício ou falso destaque', () => {
  const pulse = seasonSnapshot(teams, [], 2026);
  assert.equal(pulse.played, 0);
  assert.equal(pulse.rankings.filter((r) => r.gp).length, 0);
  assert.equal(pulse.streaks.length, 0);
  assert.equal(pulse.duels.length, 0);
  assert.equal(pulse.highlights.length, 0);
  assert.equal(pulse.rankings[0].score, null);
});

test('progresso de carreira usa total real da agenda e respeita limite de 100%', () => {
  const pulse = seasonSnapshot(teams, fixtures, 2026);
  const schedule = [...fixtures, game(6, 'A', 'C', [0, 0], { status: 'scheduled' }), game(7, 'A', 'C', [0, 0], { status: 'scheduled' })];
  const mine = franchisePulse(pulse, 'A', schedule);
  assert.equal(mine.played, 4);
  assert.equal(mine.total, 6);
  assert.equal(mine.percent, 67);
  assert.equal(mine.projectedWins, 6);
  assert.deepEqual(mine.lastTen, [4, 0]);
});

test('franquia inexistente não recebe projeção ou indicadores', () => {
  assert.equal(franchisePulse(seasonSnapshot(teams, [], 2026), 'X', []), null);
});

test('não altera a ordem original dos jogos nem os dados das equipes', () => {
  const before = JSON.stringify({ teams, fixtures });
  seasonSnapshot(teams, fixtures, 2026);
  assert.equal(JSON.stringify({ teams, fixtures }), before);
});

test('jogo inválido não contamina classificação', () => {
  const pulse = seasonSnapshot(teams, [game(1, 'A', 'B', [100, Number.NaN]), ...fixtures], 2026);
  assert.equal(pulse.played, fixtures.length);
});

test('confronto único apertado é registrado como duelo, sem declarar rivalidade permanente', () => {
  const pulse = seasonSnapshot(teams, [game(1, 'B', 'C', [100, 99])], 2026);
  assert.equal(pulse.duels.length, 1);
  assert.equal(pulse.duels[0].meetings, 1);
});


test('partidas de playoffs aparecem nas manchetes sem contaminar a classificação da temporada regular', () => {
  const playoff = game(9, 'B', 'C', [121, 119], { type: 'playoff' });
  const snapshot = seasonSnapshot(teams, [...fixtures, playoff], 2026);
  assert.equal(snapshot.played, 6);
  assert.equal(snapshot.regularPlayed, 5);
  assert.equal(snapshot.standings.rows.get('B').w, 1);
  assert.ok(snapshot.highlights.some((h) => h.id === 9));
});
