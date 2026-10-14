// Calendário, simulação rápida, classificação e Expansion Draft automático.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/core/rng.js';
import { buildPlayers, buildTeams } from '../src/core/universe.js';
import { buildMatchups, generateSchedule } from '../src/season/schedule.js';
import { simulateQuickGame } from '../src/season/quick-game.js';
import { computeStandings } from '../src/season/standings.js';
import { planExpansionDraft } from '../src/season/expansion.js';
import { validateGameRecord } from '../src/match/bridge.js';
import { loadSeedSync } from '../tools/sim-season.mjs';

const seed = loadSeedSync();
const teams = buildTeams(seed);
const cal = seed.league.calendar;
const schedule = (rngSeed = 'teste') => generateSchedule(teams, { season: 2027, start: cal.regularSeasonStart, days: cal.regularSeasonDays, breaks: [cal.allStarBreak], rng: createRng(rngSeed) });
const league = () => {
  const players = buildPlayers(seed);
  const plan = planExpansionDraft(players, { existing: teams.filter((t) => !t.expansion).map((t) => t.id), expansion: teams.filter((t) => t.expansion).map((t) => t.id), date: cal.regularSeasonStart, rng: createRng('exp') });
  return { players, plan };
};

test('calendário: 82 jogos por franquia, 41 em casa, e a fórmula de confrontos fecha', () => {
  const games = buildMatchups(teams, 2027);
  assert.equal(games.length, 1312);
  const info = new Map(teams.map((t) => [t.id, t]));
  for (const t of teams) {
    const mine = games.filter(([h, a]) => h === t.id || a === t.id);
    assert.equal(mine.length, 82, t.id);
    assert.equal(mine.filter(([h]) => h === t.id).length, 41, `${t.id} em casa`);
    const vs = (f) => mine.filter(([h, a]) => f(info.get(h === t.id ? a : h))).length;
    assert.equal(vs((o) => o.division === t.division), 12, `${t.id} divisão`);
    assert.equal(vs((o) => o.conference === t.conference && o.division !== t.division), 38, `${t.id} conferência`);
    assert.equal(vs((o) => o.conference !== t.conference), 32, `${t.id} outra conferência`);
  }
});

test('calendário: datas válidas — ninguém joga duas vezes no dia nem três dias seguidos, e o All-Star break fica livre', () => {
  const games = schedule();
  assert.equal(games.length, 1312);
  assert.equal(games[0].date, cal.regularSeasonStart);
  assert.ok(games.at(-1).date <= '2027-04-25', `fim em ${games.at(-1).date}`);
  assert.equal(new Set(games.map((g) => g.id)).size, 1312);
  const days = new Map(teams.map((t) => [t.id, []]));
  for (const g of games) {
    assert.ok(g.date < cal.allStarBreak[0] || g.date > cal.allStarBreak[1], `jogo no All-Star break: ${g.date}`);
    days.get(g.home).push(g.date);
    days.get(g.away).push(g.date);
  }
  const day = (iso) => Date.parse(iso) / 864e5;
  for (const [id, list] of days) {
    assert.equal(new Set(list).size, 82, `${id} joga duas vezes no mesmo dia`);
    const d = list.map(day);
    for (let i = 2; i < d.length; i++) assert.ok(d[i] - d[i - 2] > 2, `${id}: três jogos em três dias`);
  }
});

test('calendário: determinístico pela semente', () => {
  const key = (list) => list.map((g) => `${g.date}${g.home}${g.away}`).join();
  assert.equal(key(schedule('a')), key(schedule('a')));
  assert.notEqual(key(schedule('a')), key(schedule('b')));
});

test('expansion draft automático: 7 protegidos, no máximo 2 perdidos, escolhas alternadas e elencos completos', () => {
  const { players, plan } = league();
  const byId = new Map(players.map((p) => [p.id, p]));
  assert.equal(plan.picks.length, 28);
  const lost = new Map();
  plan.picks.forEach((pk, i) => {
    assert.equal(pk.teamId, plan.order[i % 2], 'escolhas alternadas');
    lost.set(pk.fromTeamId, (lost.get(pk.fromTeamId) ?? 0) + 1);
    assert.ok(!plan.protectedIds[pk.fromTeamId].includes(pk.playerId), 'jogador protegido foi escolhido');
    assert.equal(byId.get(pk.playerId).rosterStatus, 'standard');
  });
  for (const [team, n] of lost) assert.ok(n <= 2, `${team} perdeu ${n}`);
  for (const ids of Object.values(plan.protectedIds)) assert.equal(ids.length, 7);
  assert.equal(new Set(plan.picks.map((p) => p.playerId)).size, 28);
});

test('simulação rápida: registro coerente, determinístico e com números plausíveis', () => {
  const { players, plan } = league();
  const byId = new Map(players.map((p) => [p.id, p]));
  for (const pk of plan.picks) byId.get(pk.playerId).teamId = pk.teamId;
  const side = (id) => ({ id, roster: players.filter((p) => p.teamId === id).sort((a, b) => b.ovr - a.ovr) });
  const a = simulateQuickGame(side('BOS'), side('LVJ'), createRng('q1'));
  const b = simulateQuickGame(side('BOS'), side('LVJ'), createRng('q1'));
  assert.deepEqual(a, b);
  assert.deepEqual(validateGameRecord(a), []);
  assert.notEqual(a.score[0], a.score[1]);
  const sum = { pts: 0, fga: 0, tov: 0, n: 0 };
  const rng = createRng('q2');
  for (let i = 0; i < 60; i++) {
    const rec = simulateQuickGame(side(teams[i % 32].id), side(teams[(i * 7 + 3) % 32].id === teams[i % 32].id ? 'BOS' : teams[(i * 7 + 3) % 32].id), rng);
    assert.deepEqual(validateGameRecord(rec), []);
    for (const t of rec.box) {
      sum.pts += t.total.pts;
      sum.fga += t.total.fga;
      sum.tov += t.total.tov;
      sum.n++;
      assert.ok(Math.abs(t.players.reduce((m, p) => m + p.min, 0) - 240 * (1 + (rec.overtimes * 5) / 48)) < 3, 'minutos somam 240');
    }
  }
  const avg = (k) => sum[k] / sum.n;
  assert.ok(avg('pts') > 105 && avg('pts') < 124, `pontos ${avg('pts').toFixed(1)}`);
  assert.ok(avg('fga') > 82 && avg('fga') < 96, `arremessos ${avg('fga').toFixed(1)}`);
  assert.ok(avg('tov') > 10 && avg('tov') < 17, `erros ${avg('tov').toFixed(1)}`);
});

test('classificação: campanha, ordem, jogos atrás, sequência e zonas', () => {
  const mini = [
    { id: 'A', conference: 'East', division: 'X' }, { id: 'B', conference: 'East', division: 'X' }, { id: 'C', conference: 'East', division: 'Y' }, { id: 'D', conference: 'West', division: 'Z' },
  ];
  const g = (date, home, away, hs, as, type = 'regular') => ({ date, home, away, type, status: 'final', score: [hs, as] });
  const table = computeStandings(mini, [g('2026-10-20', 'A', 'B', 100, 90), g('2026-10-21', 'A', 'C', 110, 100), g('2026-10-22', 'B', 'A', 99, 101), g('2026-10-23', 'C', 'B', 80, 90), g('2026-10-24', 'D', 'A', 120, 100), g('2026-10-25', 'A', 'B', 1, 200, 'exhibition'), { date: '2026-10-26', home: 'A', away: 'B', type: 'regular', status: 'scheduled' }]);
  const a = table.rows.get('A');
  assert.deepEqual([a.w, a.l, a.seed, a.streak], [3, 1, 1, -1]);
  assert.deepEqual([a.home, a.away, a.conf, a.div], [[2, 0], [1, 1], [3, 0], [2, 0]]);
  assert.deepEqual(table.conferences.East.map((r) => r.id), ['A', 'B', 'C']);
  assert.equal(table.rows.get('B').gb, 1.5);
  assert.equal(table.rows.get('D').seed, 1);
  assert.equal(a.zone, 'playoff');
});

test('temporada inteira no modelo rápido: toda franquia joga 82 e a liga tem campanhas plausíveis', () => {
  const { players, plan } = league();
  const byId = new Map(players.map((p) => [p.id, p]));
  for (const pk of plan.picks) byId.get(pk.playerId).teamId = pk.teamId;
  const rosters = new Map(teams.map((t) => [t.id, players.filter((p) => p.teamId === t.id).sort((a, b) => b.ovr - a.ovr)]));
  const games = schedule('temporada-teste');
  const rng = createRng('temporada-teste');
  for (const game of games) Object.assign(game, { status: 'final', score: simulateQuickGame({ id: game.home, roster: rosters.get(game.home) }, { id: game.away, roster: rosters.get(game.away) }, rng).score });
  const table = computeStandings(teams, games);
  const wins = [...table.rows.values()].map((r) => r.w);
  for (const r of table.rows.values()) assert.equal(r.w + r.l, 82, r.id);
  assert.equal(wins.reduce((a, b) => a + b, 0), 1312);
  assert.ok(Math.max(...wins) >= 55 && Math.max(...wins) <= 74, `melhor campanha: ${Math.max(...wins)}`);
  assert.ok(Math.min(...wins) >= 8 && Math.min(...wins) <= 30, `pior campanha: ${Math.min(...wins)}`);
  assert.equal(table.conferences.East.length, 16);
  assert.equal(table.conferences.West.filter((r) => r.zone === 'playin').length, 4);
});
