// Sliders, modos, validação de save, comandos do técnico, destaques e a ponte partida → carreira.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SLIDER_GROUPS, activePreset, applyPreset, defaultsOf, resetSliders, setSlider, simSliders, sliderValues } from '../src/core/sliders.js';
import { getSettings } from '../src/core/settings.js';
import { CAREER_MODES, GAME_MODES, careerRules, modeShows } from '../src/core/modes.js';
import { ROLE_BY_ID } from '../src/core/career-options.js';
import { SAVE_FORMAT, validateSavePayload } from '../src/core/save-validation.js';
import { MatchSim } from '../src/match/sim.js';
import { DEFAULT_TACTICS, TIMEOUTS_PER_GAME, normalizeSimSliders } from '../src/match/tactics.js';
import { matchNotes, periodScores, playerStreak, scoringRun } from '../src/match/highlights.js';
import { buildGameRecord, validateGameRecord } from '../src/match/bridge.js';
import { rosterOf } from '../tools/sim-match.mjs';

const game = (seed, { sliders, tactics = [{}, {}], aiCoach = [true, true], quarter = 360 } = {}) =>
  new MatchSim(
    [
      { id: 'BOS', name: 'Celtics', colors: ['#007A33'], roster: rosterOf('BOS'), tactics: tactics[0], aiCoach: aiCoach[0] },
      { id: 'DEN', name: 'Nuggets', colors: ['#0E2240'], roster: rosterOf('DEN'), tactics: tactics[1], aiCoach: aiCoach[1] },
    ],
    { seed, quiet: true, quarterSeconds: quarter, sliders },
  );
const total = (sim, team, key) => sim.boxScore()[team].total[key];

// ------------------------------------------------------------------ sliders
test('sliders: todo slider tem faixa coerente, padrão dentro da faixa e explicação', () => {
  for (const group of SLIDER_GROUPS) {
    for (const s of group.sliders) {
      assert.ok(s.min < s.max && s.default >= s.min && s.default <= s.max, `${group.id}.${s.key}: faixa`);
      assert.ok((s.default - s.min) % s.step === 0, `${group.id}.${s.key}: padrão alinhado ao passo`);
      assert.ok(s.tip.length > 20, `${group.id}.${s.key}: sem explicação`);
    }
    for (const p of group.presets) for (const key of Object.keys(p.values)) assert.ok(group.sliders.some((s) => s.key === key), `preset ${p.id}: slider desconhecido ${key}`);
  }
});

test('sliders: gravar limita à faixa, alinha ao passo e persiste nas configurações', () => {
  resetSliders('simulation');
  assert.deepEqual(sliderValues('simulation'), defaultsOf('simulation'));
  setSlider('simulation', 'pace', 999);
  assert.equal(sliderValues('simulation').pace, 150);
  setSlider('simulation', 'pace', 113);
  assert.equal(sliderValues('simulation').pace, 115);
  assert.equal(getSettings().sliders.simulation.pace, 115);
  assert.equal(simSliders().pace, 1.15);
  assert.equal(activePreset('simulation'), 'custom');
  resetSliders('simulation');
  assert.equal(activePreset('simulation'), 'simulation');
});

test('sliders: presets aplicam valores e são reconhecidos; valores corrompidos caem no padrão', () => {
  applyPreset('simulation', 'hardcore');
  assert.equal(activePreset('simulation'), 'hardcore');
  assert.equal(sliderValues('simulation').turnovers, 115);
  resetSliders('simulation');
  assert.deepEqual(sliderValues('simulation', { simulation: { pace: 'abc', three: null } }), defaultsOf('simulation'));
  assert.deepEqual(normalizeSimSliders({ pace: 9, three: 'x', fouls: 0.1 }), { ...normalizeSimSliders(), pace: 1.5, fouls: 0.5 });
});

// ------------------------------------------------------------------ modos
test('modos: carreiras têm cargos válidos e status declarado; Coach Mode esconde contratos', () => {
  assert.deepEqual(CAREER_MODES.map((m) => m.id), ['universe', 'franchise', 'coach', 'commissioner']);
  for (const m of GAME_MODES) assert.ok(['functional', 'partial', 'planned'].includes(m.status), m.id);
  for (const m of CAREER_MODES) {
    assert.ok(m.career.roles.every((r) => ROLE_BY_ID[r]) && m.career.roles.includes(m.career.defaultRole), m.id);
    assert.notEqual(m.status, 'functional', 'carreira sem temporada simulada não pode se dizer completa');
  }
  for (const m of GAME_MODES.filter((x) => x.kind === 'instant')) assert.ok(m.path.startsWith('/play/'));
  assert.equal(modeShows({ mode: 'coach' }, 'cap'), false);
  assert.equal(modeShows({ mode: 'universe' }, 'cap'), true);
  assert.equal(modeShows({}, 'market'), true); // save antigo, sem modo gravado
  assert.equal(careerRules({ mode: 'commissioner' }).switchTeams, true);
});

// ------------------------------------------------------------------ validação de save
const validPayload = () => ({
  format: SAVE_FORMAT,
  schemaVersion: 1,
  stores: {
    meta: [{ key: 'career', value: { teamId: 'BOS' } }, { key: 'calendar', value: { season: 2027, date: '2026-10-18' } }, { key: 'league', value: { cap: { salaryCap: 160000000 } } }],
    teams: [{ id: 'BOS', fullName: 'Boston Celtics' }],
    players: [{ id: 1, teamId: 'BOS', attributes: {}, positions: ['PG'] }],
    contracts: [{ playerId: 1 }],
  },
});
const opts = { schemaVersion: 1, storeNames: ['meta', 'teams', 'players', 'contracts', 'games'] };

test('save: backup íntegro passa e devolve o resumo', () => {
  const r = validateSavePayload(validPayload(), opts);
  assert.equal(r.ok, true);
  assert.deepEqual(r.info, { teams: 1, players: 1, season: 2027, teamName: 'Boston Celtics' });
});

test('save: formato errado, versão mais nova e blocos ausentes são recusados com mensagem clara', () => {
  assert.match(validateSavePayload([], opts).errors[0], /não contém um save/);
  assert.match(validateSavePayload({ format: 'outro', schemaVersion: 1, stores: {} }, opts).errors[0], /não é um backup/);
  assert.match(validateSavePayload({ ...validPayload(), schemaVersion: 9 }, opts).errors[0], /versão mais nova/);
  const noPlayers = validPayload();
  delete noPlayers.stores.players;
  assert.match(validateSavePayload(noPlayers, opts).errors[0], /"players"/);
});

test('save: integridade — franquia do usuário, jogadores quebrados ou órfãos', () => {
  const lostTeam = validPayload();
  lostTeam.stores.meta[0].value.teamId = 'XXX';
  assert.match(validateSavePayload(lostTeam, opts).errors.join(' '), /franquia do usuário/);
  const broken = validPayload();
  broken.stores.players.push({ id: 2, teamId: 'ZZZ', attributes: null, positions: ['C'] });
  const r = validateSavePayload(broken, opts);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /sem identificação, atributos ou posição/);
  const dup = validPayload();
  dup.stores.players.push({ ...dup.stores.players[0] });
  assert.match(validateSavePayload(dup, opts).errors.join(' '), /duplicados/);
  const older = validateSavePayload(validPayload(), { ...opts, schemaVersion: 2 });
  assert.equal(older.ok, true);
  assert.match(older.warnings.join(' '), /será migrado/);
});

// ------------------------------------------------------------------ comandos do técnico
test('técnico: tática muda o estado e devolve o aviso; chave desconhecida é ignorada', () => {
  const sim = game('coach-1');
  assert.deepEqual(sim.teams[0].tactics, DEFAULT_TACTICS);
  assert.equal(sim.setTactic(0, 'pace', 1), 'Ritmo: acelerado');
  assert.equal(sim.teams[0].tactics.pace, 1);
  assert.equal(sim.setTactic(0, 'coverage', 'switch'), 'Cobertura do pick and roll: troca');
  assert.equal(sim.teams[0].coverage, 'switch');
  assert.equal(sim.setTactic(0, 'inexistente', 1), null);
  const star = sim.teams[0].lineup[1];
  assert.equal(sim.setTactic(0, 'star', star.id), `Prioridade ofensiva: ${star.short}`);
});

test('técnico: substituição pedida só acontece na bola parada seguinte e respeita as regras', () => {
  const sim = game('coach-2', { aiCoach: [false, true] });
  sim.setTactic(0, 'autoSubs', false);
  sim.advance(20);
  const t = sim.teams[0];
  const out = t.lineup[4];
  const sub = t.all.find((p) => !t.lineup.includes(p));
  assert.equal(sim.requestSub(0, out.id, t.lineup[0].id).ok, false, 'quem já está em quadra não entra');
  assert.equal(sim.requestSub(0, out.id, sub.id).ok, true);
  assert.ok(t.lineup.includes(out), 'troca não pode acontecer com a bola em jogo');
  for (let i = 0; i < 9000 && t.lineup.includes(out); i++) sim.step();
  assert.ok(t.lineup.includes(sub) && !t.lineup.includes(out));
  assert.equal(t.lineup.length, 5);
  assert.equal(new Set(sim.court).size, 10);
});

test('técnico: tempo desconta do time, e a IA nunca gasta os tempos do usuário', () => {
  const sim = game('coach-3', { aiCoach: [false, true] });
  sim.advance(30);
  const result = sim.callTimeout(0);
  assert.ok(['granted', 'queued'].includes(result));
  for (let i = 0; i < 3000 && !sim.timeout; i++) sim.step();
  assert.equal(sim.timeout.team, 0);
  assert.equal(sim.teams[0].timeouts, TIMEOUTS_PER_GAME - 1);
  sim.runToEnd();
  assert.equal(sim.teams[0].timeouts, TIMEOUTS_PER_GAME - 1, 'tempo do usuário gasto sem pedido');
  sim.teams[0].timeouts = 0;
  assert.equal(sim.callTimeout(0), 'no', 'jogo encerrado não aceita tempo');
});

test('técnico: matchup definido troca o alvo de dois defensores', () => {
  const sim = game('coach-4');
  const [mine, theirs] = sim.teams;
  const defender = mine.lineup[0];
  const target = theirs.lineup[3];
  sim.setMatchup(0, defender.id, target.id);
  assert.equal(defender.man, target);
  assert.equal(new Set(mine.lineup.map((p) => p.man)).size, 5, 'cada atacante continua com um marcador');
});

// ------------------------------------------------------------------ sliders e táticas mudam o jogo de forma mensurável
test('motor: mesma semente + mesmos sliders = mesma partida; sliders diferentes = partidas diferentes', () => {
  const a = game('det-1', { sliders: { pace: 1.2 } });
  const b = game('det-1', { sliders: { pace: 1.2 } });
  const c = game('det-1', { sliders: { pace: 0.8 } });
  for (const s of [a, b, c]) s.runToEnd();
  assert.deepEqual(a.score, b.score);
  assert.deepEqual(a.boxScore(), b.boxScore());
  assert.notDeepEqual(a.boxScore(), c.boxScore());
});

test('motor: slider de ritmo muda o número de posses; slider de três muda o volume de bolas de três', () => {
  const sum = (sliders, f) => ['s1', 's2', 's3'].reduce((acc, seed) => {
    const sim = game(seed, { sliders });
    sim.runToEnd();
    return acc + f(sim);
  }, 0);
  const poss = (s) => s.metrics.possessions[0] + s.metrics.possessions[1];
  const threes = (s) => total(s, 0, 'tpa') + total(s, 1, 'tpa');
  assert.ok(sum({ pace: 1.5, shots: 1.5 }, poss) > sum({ pace: 0.5, shots: 0.5 }, poss) * 1.04, 'ritmo alto deveria gerar mais posses');
  assert.ok(sum({ three: 1.5 }, threes) > sum({ three: 0.5 }, threes) * 1.25, 'slider de três deveria aumentar as tentativas');
});

test('motor: prioridade ofensiva do técnico desloca a seleção de arremessos do time', () => {
  const tpaShare = (focus) => ['t1', 't2', 't3'].reduce((acc, seed) => {
    const sim = game(seed, { tactics: [{ focus }, {}] });
    sim.runToEnd();
    return acc + total(sim, 0, 'tpa') / total(sim, 0, 'fga');
  }, 0);
  assert.ok(tpaShare('three') > tpaShare('rim') + 0.06, 'pedir bola de três deveria aumentar a fatia de tentativas de três');
});

// ------------------------------------------------------------------ destaques e ponte com a carreira
test('destaques: sequência de pontos e pontos seguidos de um jogador', () => {
  const fake = { t: 100, quarter: 2, teams: [{ index: 0, name: 'A', all: [{ id: 7, short: 'Sete', stats: { pts: 12, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, pf: 0 }, fouledOut: false }], lineup: [] }, { index: 1, name: 'B', all: [], lineup: [] }], scoreLog: [] };
  const add = (t, team, pts, id) => fake.scoreLog.push({ t, q: 1, team, pts, id });
  add(10, 1, 2, 1);
  add(20, 0, 3, 7);
  add(40, 0, 2, 7);
  add(55, 0, 3, 7);
  add(70, 0, 2, 7);
  add(90, 0, 2, 7);
  assert.deepEqual({ team: scoringRun(fake).team, a: scoringRun(fake).a, b: scoringRun(fake).b }, { team: 0, a: 12, b: 0 });
  assert.deepEqual(playerStreak(fake), { team: 0, id: 7, pts: 12 });
  assert.ok(matchNotes(fake).some((n) => /12 pontos seguidos/.test(n.text)));
  add(95, 1, 2, 1); // o adversário pontua por último: não há sequência em andamento
  assert.equal(scoringRun(fake), null);
});

test('ponte: partida encerrada vira um registro coerente da store games', () => {
  const sim = game('bridge-1', { aiCoach: [false, true] });
  sim.runToEnd();
  const record = buildGameRecord(sim, { userTeam: 0 });
  assert.deepEqual(validateGameRecord(record), []);
  assert.equal(record.type, 'exhibition');
  assert.equal(record.userTeamId, 'BOS');
  assert.deepEqual(record.score, sim.score);
  assert.deepEqual(periodScores(sim).map((p) => p.reduce((a, b) => a + b, 0)), sim.score);
  assert.ok(JSON.stringify(record).length < 20000, 'registro de jogo deve ser pequeno');
  const tampered = { ...record, score: [record.score[0] + 1, record.score[1]] };
  assert.ok(validateGameRecord(tampered).length > 0);
});
