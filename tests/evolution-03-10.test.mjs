import test from 'node:test';
import assert from 'node:assert/strict';
import { ATTRIBUTE_GROUPS, ATTRIBUTE_KEYS } from '../src/players/attributes.js';
import { COL } from '../src/players/statline.js';
import { bounded, safeRate, playerFingerprint, fingerprintSummary, seasonPerformanceSeries, boxTeamMetrics, gameFlow, leagueLeaders, teamLandscape } from '../src/ui/experience-insights.js';

const attributes = Object.fromEntries(ATTRIBUTE_KEYS.map((key) => [key, 70]));
const teams = [
  { id: 'A', fullName: 'Alpha', colors: ['#000000'] },
  { id: 'B', fullName: 'Beta', colors: ['#ffffff'] },
];
const roster = [
  { id: 3, name: 'C', teamId: 'A', ovr: 87, potential: 88 },
  { id: 1, name: 'A', teamId: 'B', ovr: 88, potential: 89 },
  { id: 2, name: 'B', teamId: 'A', ovr: 90, potential: 92 },
];
const mkRow = (season, team, gp, pts, reb, ast) => {
  const r = Array.from({ length: 19 }, () => 0);
  r[COL.season] = season; r[COL.team] = team; r[COL.gp] = gp; r[COL.pts] = pts;
  r[COL.orb] = reb * .25; r[COL.drb] = reb * .75; r[COL.ast] = ast;
  return r;
};

test('E03 radar possui cinco eixos na ordem original, sem alterar o jogador', () => {
  const player = { attributes: { ...attributes } };
  const fp = playerFingerprint(player);
  assert.equal(fp.length, 5);
  assert.deepEqual(fp.map((g) => g.id), ATTRIBUTE_GROUPS.map((g) => g.id));
  assert.ok(fp.every((g) => g.value === 70));
  assert.equal(player.attributes.rimFinishing, 70);
});
test('E03 radar não inventa grupos sem avaliações', () => {
  const fp = playerFingerprint({ attributes: {} });
  assert.ok(fp.every((g) => g.value === null));
  assert.deepEqual(fingerprintSummary(fp), { best: null, secondary: null, weakest: null, spread: null });
});
test('E03 limita eixos e números extremos', () => {
  const fp = playerFingerprint({ attributes: Object.fromEntries(ATTRIBUTE_KEYS.map((key) => [key, 999])) });
  assert.ok(fp.every((g) => g.value === 100));
  assert.equal(bounded(-90), 0);
  assert.equal(bounded(Infinity), 0);
});
test('E03 identifica maior força sem sugerir capacidade inexistente', () => {
  const fp = [{ label: 'Ataque', value: 80 }, { label: 'Defesa', value: 90 }, { label: 'Físico', value: 61 }];
  assert.equal(fingerprintSummary(fp).best.label, 'Defesa');
  assert.equal(fingerprintSummary(fp).spread, 29);
});
test('E04 tendência estatística vazia não cria temporadas', () => {
  assert.deepEqual(seasonPerformanceSeries(null), []);
  assert.deepEqual(seasonPerformanceSeries({ rows: [mkRow(2026, 'A', 0, 99, 9, 9)] }), []);
});
test('E04 temporadas somam passagem por dois times com média ponderada', () => {
  const c = { rows: [mkRow(2025, 'A', 80, 10, 5, 4), mkRow(2026, 'A', 10, 20, 4, 6), mkRow(2026, 'B', 30, 12, 8, 2)] };
  const first = structuredClone(c);
  const series = seasonPerformanceSeries(c);
  assert.equal(series.length, 2);
  assert.equal(series[1].gp, 40);
  assert.equal(series[1].pts, 14);
  assert.equal(series[1].reb, 7);
  assert.equal(series[1].ast, 3);
  assert.deepEqual(c, first);
});
test('E04 limite de pontos garante no máximo nove temporadas', () => {
  const c = { rows: Array.from({ length: 12 }, (_, i) => mkRow(2012 + i, 'A', 82, i, i / 2, 1)) };
  assert.equal(seasonPerformanceSeries(c).length, 9);
  assert.equal(seasonPerformanceSeries(c)[0].season, 2015);
});
test('E05 métricas box score sem dados não inventam eficiência', () => {
  assert.equal(boxTeamMetrics(null), null);
  assert.equal(safeRate(12, 0), null);
  assert.equal(boxTeamMetrics({ total: { pts: 10, fgm: 0, fga: 0 } }).efg, null);
});
test('E05 eFG pondera bolas de três corretamente', () => {
  const m = boxTeamMetrics({ total: { fga: 100, fgm: 47, tpm: 13, tpa: 35, ast: 24, tov: 12, orb: 8, drb: 32, pts: 110 } });
  assert.equal(m.efg, 53.5);
  assert.equal(m.fg, 47);
  assert.equal(m.astTo, 2);
  assert.equal(m.rebounds, 40);
});
test('E05 assistências sem desperdícios são exibidas sem razão falsa', () => {
  assert.equal(boxTeamMetrics({ total: { ast: 15, tov: 0 } }).astTo, null);
});
test('E05 fluxo de partidas respeita casa fora e prorrogação', () => {
  const flow = gameFlow([{ label: 'Q1', home: 22, away: 24 }, { label: 'Q2', home: 25, away: 20 }, { label: 'Q3', home: 21, away: 22 }, { label: 'Q4', home: 22, away: 24 }, { label: 'OT', home: 11, away: 8 }]);
  assert.equal(flow.steps.length, 5);
  assert.equal(flow.steps[0].margin, -2);
  assert.equal(flow.steps.at(-1).home, 101);
  assert.equal(flow.steps.at(-1).away, 98);
  assert.equal(flow.biggestHome, 3);
  assert.equal(flow.biggestAway, 2);
});
test('E05 fluxo vazio não inventa vantagem', () => {
  assert.deepEqual(gameFlow([]).steps, []);
  assert.equal(gameFlow([]).momentum, null);
});
test('E06 líderes não alteram a lista original', () => {
  const clone = structuredClone(roster);
  assert.deepEqual(leagueLeaders(roster, 'ovr').map((p) => p.id), [2, 1, 3]);
  assert.deepEqual(roster, clone);
});
test('E06 ranking aceita filtro vazio e limita quantidade', () => {
  assert.deepEqual(leagueLeaders([], 'ovr'), []);
  assert.equal(leagueLeaders(roster, 'potential', 2).length, 2);
  assert.equal(leagueLeaders(roster, 'potential', 2)[0].id, 2);
});
test('E07 força de equipe tem valor nulo sem atletas', () => {
  const r = teamLandscape([...teams, { id: 'C', fullName: 'Gamma' }], roster);
  assert.equal(r.find((x) => x.id === 'C').strength, null);
});
test('E07 força de equipe não usa jogadores de outras franquias', () => {
  const r = teamLandscape(teams, roster);
  assert.equal(r[0].id, 'A');
  assert.equal(r[0].strength, 88.5);
  assert.equal(r[1].strength, 88);
  assert.equal(roster[0].teamId, 'A');
});
test('E07 desempate é estável por nome', () => {
  assert.deepEqual(teamLandscape(teams, [], 2).map((x) => x.id), ['A', 'B']);
});
