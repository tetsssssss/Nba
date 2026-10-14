// Valida o seed gerado (dados reais + ratings) e a definição do universo.
// Falha aqui significa: rode `npm run data:build` e investigue antes de entregar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ATTRIBUTE_KEYS, POSITIONS } from '../src/players/attributes.js';
import { OVERALL_CALIBRATION, positionOverall } from '../src/players/overall.js';
import { TENDENCY_KEYS } from '../src/players/tendencies.js';
import { buildTeams } from '../src/core/universe.js';
import { DIFFICULTIES, DIFFICULTY_SYSTEMS, ROLES, defaultCareerOptions } from '../src/core/career-options.js';
import { normalizeName, parseHeight, ageOn } from '../tools/lib/names.mjs';

const read = (rel) => JSON.parse(readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8'));
const seed = {
  meta: read('data/seed/meta.json'),
  teams: read('data/seed/teams.json'),
  players: read('data/seed/players.json'),
  ratings: read('data/seed/ratings.json'),
  contracts: read('data/seed/contracts.json'),
  career: read('data/seed/career-stats.json'),
  coaches: read('data/seed/coaches.json'),
  history: read('data/seed/history.json'),
  franchises: read('data/static/franchises.json'),
  league: read('data/static/league.json'),
};
const photos = read('data/seed/photo-manifest.json');
const validation = read('data/seed/validation.json');

test('universo: 32 franquias, 16 por conferência, 8 divisões de 4', () => {
  const teams = buildTeams(seed);
  assert.equal(teams.length, 32);
  assert.equal(new Set(teams.map((t) => t.id)).size, 32);
  for (const conf of ['East', 'West']) assert.equal(teams.filter((t) => t.conference === conf).length, 16, conf);
  const divisions = new Map();
  for (const t of teams) divisions.set(`${t.conference}/${t.division}`, (divisions.get(`${t.conference}/${t.division}`) ?? 0) + 1);
  assert.equal(divisions.size, 8);
  assert.ok([...divisions.values()].every((n) => n === 4));
  const by = Object.fromEntries(teams.map((t) => [t.id, t]));
  assert.equal(by.SEA.conference, 'West');
  assert.equal(by.LVJ.conference, 'West');
  assert.equal(by.NOP.conference, 'East');
  assert.equal(by.MIN.conference, 'West');
  for (const t of teams) {
    assert.match(t.colors[0], /^#[0-9A-F]{6}$/i, `${t.id} cor`);
    assert.ok(t.fans?.note && t.market > 0, `${t.id} mercado/torcida`);
    for (const rival of t.rivals) assert.ok(by[rival], `${t.id}: rival ${rival} inexistente`);
  }
});

test('Seattle recupera a história; Las Vegas é nova; Thunder só mantém a era OKC', () => {
  const by = Object.fromEntries(buildTeams(seed).map((t) => [t.id, t]));
  assert.deepEqual(by.SEA.championships, [1979]);
  assert.equal(by.SEA.founded, 1967);
  assert.ok(by.SEA.retiredNumbers.length >= 6);
  assert.ok(by.SEA.allTimeRecord.wins > 1500, 'retrospecto oficial da era Seattle');
  assert.equal(by.SEA.expansion, true);
  assert.equal(by.LVJ.founded, 2026);
  assert.deepEqual(by.LVJ.championships, []);
  assert.ok(!by.OKC.championships.includes(1979));
  assert.ok(by.OKC.championships.includes(2025));
  assert.equal(by.OKC.founded, 2008);
  assert.ok(seed.history.champions.some((c) => c.year === 1979 && c.teamId === 'SEA'));
});

test('regras da liga', () => {
  const { cap, expansion, roster, trade } = seed.league;
  assert.ok(cap.salaryCap < cap.luxuryTax && cap.luxuryTax < cap.firstApron && cap.firstApron < cap.secondApron);
  assert.ok(cap.minimumTeamSalary < cap.salaryCap);
  assert.equal(cap.minimumSalaryScale.byYearsOfService.length, 11);
  assert.equal(cap.rookieScale.ratioByPick.length, 30);
  assert.equal(expansion.protectedPerTeam, 7);
  assert.equal(expansion.maxLostPerTeam, 2);
  assert.deepEqual(expansion.initialDraftPicks, { LVJ: [1, 10], SEA: [4, 5] });
  assert.equal(expansion.initialDraftSeason, 2027); // decisão do usuário: o Draft 2026 real não é refeito
  assert.equal(roster.standardMax, 15);
  assert.equal(trade.futurePickYearsAhead, 1);
  assert.equal(seed.league.careerLengthSeasons, 10);
  assert.equal(seed.league.capModes.length, 4);
});

test('jogadores: identidade e bio', () => {
  const teamIds = new Set(seed.teams.map((t) => t.id));
  assert.equal(teamIds.size, 30);
  assert.ok(seed.players.length >= 450, `apenas ${seed.players.length} jogadores`);
  assert.equal(new Set(seed.players.map((p) => p.id)).size, seed.players.length, 'ids únicos');
  for (const p of seed.players) {
    assert.ok(Number.isInteger(p.id) && p.name && p.firstName != null && p.lastName, `identidade ${p.id}`);
    assert.ok(teamIds.has(p.teamId), `${p.name}: time ${p.teamId}`);
    assert.ok(p.positions.length >= 1 && p.positions.length <= 2 && p.positions.every((x) => POSITIONS.includes(x)), `${p.name}: posições`);
    assert.ok(p.heightIn >= 66 && p.heightIn <= 92, `${p.name}: altura ${p.heightIn}`);
    assert.ok(p.age == null || (p.age >= 18 && p.age <= 45), `${p.name}: idade ${p.age}`);
  }
  const noAge = seed.players.filter((p) => p.age == null);
  assert.ok(noAge.length <= seed.players.length * 0.02, `${noAge.length} sem idade`);
  for (const t of seed.teams) {
    const n = seed.players.filter((p) => p.teamId === t.id).length;
    assert.ok(n >= 13 && n <= 23, `${t.id}: ${n} jogadores`);
  }
});

test('ratings: 45 atributos, tendências e Overall coerente com a fórmula', () => {
  const players = new Map(seed.players.map((p) => [p.id, p]));
  assert.equal(seed.ratings.length, seed.players.length);
  for (const r of seed.ratings) {
    const p = players.get(r.playerId);
    assert.ok(p, `rating sem jogador ${r.playerId}`);
    for (const k of ATTRIBUTE_KEYS) assert.ok(Number.isInteger(r.attributes[k]) && r.attributes[k] >= 0 && r.attributes[k] <= 100, `${p.name}.${k} = ${r.attributes[k]}`);
    assert.equal(Object.keys(r.attributes).length, 45);
    for (const k of TENDENCY_KEYS) assert.ok(Number.isInteger(r.tendencies[k]) && r.tendencies[k] >= 0 && r.tendencies[k] <= 100, `${p.name} tendência ${k}`);
    assert.equal(r.overall, positionOverall(r.attributes, p.positions[0]), `${p.name}: Overall do seed ≠ fórmula do jogo`);
    assert.ok(r.potential >= r.overall && r.potential <= 99, `${p.name}: potencial ${r.potential} < overall ${r.overall}`);
    assert.ok(['high', 'medium', 'low', 'none'].includes(r.confidence));
  }
});

test('ratings: a constante de calibração do jogo é a mesma usada para gerar o seed', () => {
  for (const pos of POSITIONS) {
    const { a, b, c, knot } = seed.meta.ratingModel.calibration[pos];
    assert.deepEqual(OVERALL_CALIBRATION[pos], { a, b, c, knot }, `${pos}: atualize OVERALL_CALIBRATION em src/players/overall.js`);
  }
});

test('ratings: distribuição plausível', () => {
  const ovr = seed.ratings.map((r) => r.overall).sort((a, b) => a - b);
  const median = ovr[Math.floor(ovr.length / 2)];
  assert.ok(ovr.at(-1) >= 95 && ovr.at(-1) <= 99, `melhor jogador: ${ovr.at(-1)}`);
  assert.ok(ovr[0] >= 55, `pior jogador: ${ovr[0]}`);
  assert.ok(median >= 68 && median <= 76, `mediana: ${median}`);
  const elite = ovr.filter((v) => v >= 90).length;
  assert.ok(elite >= 6 && elite <= 25, `${elite} jogadores 90+`);
  // especialistas reconhecíveis: o modelo precisa enxergar o óbvio
  const byName = (name) => seed.ratings.find((r) => r.playerId === seed.players.find((p) => p.name === name)?.id);
  const curry = byName('Stephen Curry');
  if (curry) assert.ok(curry.attributes.threePoint >= 92, `Curry 3PT ${curry.attributes.threePoint}`);
  const gobert = byName('Rudy Gobert');
  if (gobert) assert.ok(gobert.attributes.interiorDefense >= 85 && gobert.attributes.threePoint <= 45, 'Gobert: protetor de aro que não arremessa');
});

test('contratos: todo jogador tem um, com anos válidos', () => {
  const players = new Map(seed.players.map((p) => [p.id, p]));
  assert.equal(seed.contracts.length, seed.players.length);
  assert.equal(new Set(seed.contracts.map((c) => c.playerId)).size, seed.contracts.length);
  for (const c of seed.contracts) {
    const p = players.get(c.playerId);
    assert.ok(p, `contrato sem jogador ${c.playerId}`);
    assert.equal(c.teamId, p.teamId, `${p.name}: time do contrato`);
    assert.ok(c.years.length >= 1 && c.years.length <= 6, `${p.name}: ${c.years.length} anos`);
    assert.equal(c.years[0].season, seed.league.startSeason, `${p.name}: primeiro ano`);
    c.years.forEach((y, i) => {
      assert.equal(y.season, seed.league.startSeason + i, `${p.name}: anos consecutivos`);
      assert.ok(y.salary > 0 && y.salary < 80e6, `${p.name}: salário ${y.salary}`);
      assert.ok([null, 'player', 'team'].includes(y.option));
    });
    assert.ok(['standard', 'rookie-scale', 'two-way', 'camp'].includes(c.type), `${p.name}: tipo ${c.type}`);
    assert.ok(['hoopshype', 'espn', 'estimated'].includes(c.source));
  }
  const estimated = seed.contracts.filter((c) => c.source === 'estimated').length;
  assert.ok(estimated <= seed.contracts.length * 0.2, `${estimated} contratos estimados`);
});

test('franquias reais: dados oficiais presentes', () => {
  const coachTeams = new Set(seed.coaches.map((c) => c.teamId));
  for (const t of seed.teams) {
    assert.ok(t.logo?.startsWith('https://'), `${t.id}: logo`);
    assert.ok(t.arena.name, `${t.id}: arena`);
    assert.ok(t.lastSeason && t.lastSeason.wins + t.lastSeason.losses === 82, `${t.id}: campanha 2025-26`);
    assert.ok(coachTeams.has(t.id), `${t.id}: técnico`);
    assert.ok(Array.isArray(t.deadMoney));
  }
  assert.equal(new Set(seed.coaches.map((c) => c.id)).size, seed.coaches.length, 'técnicos com id único');
});

test('história: campeão da temporada anterior e drafts recentes', () => {
  const last = seed.history.lastSeason;
  assert.ok(last.champion && last.runnerUp && /^4-[0-3]$/.test(last.finalsScore));
  assert.equal(last.playoffSeries.length, 15);
  assert.ok(seed.history.champions.some((c) => c.year === 2026 && c.teamId === last.champion));
  assert.equal(seed.history.drafts[2026].length, 60);
  assert.equal(seed.history.drafts[2026][0].pick, 1);
  const years = seed.history.champions.map((c) => c.year);
  assert.equal(new Set(years).size, years.length, 'um campeão por ano');
});

test('fotos: manifesto cobre o elenco e a grande maioria tem fotografia real', () => {
  for (const p of seed.players) assert.ok(p.id in photos.players, `${p.name} fora do manifesto — rode npm run photos:audit`);
  const withPhoto = seed.players.filter((p) => photos.players[p.id] !== '').length;
  assert.ok(withPhoto / seed.players.length >= 0.95, `apenas ${withPhoto}/${seed.players.length} com foto`);
  // estrelas nunca podem cair em placeholder
  for (const r of seed.ratings.filter((x) => x.overall >= 80)) assert.notEqual(photos.players[r.playerId], '', `jogador 80+ sem foto: ${r.playerId}`);
});

test('validação do seed sem erros', () => {
  assert.equal(validation.counts.error, 0, JSON.stringify(validation.issues.filter((i) => i.level === 'error')));
});

test('opções de carreira', () => {
  assert.deepEqual(ROLES.map((r) => r.id), ['owner', 'president', 'pobo', 'gm', 'coach']);
  assert.deepEqual(DIFFICULTIES.map((d) => d.id), ['casual', 'easy', 'normal', 'realistic', 'hardcore', 'custom']);
  for (const d of DIFFICULTIES) for (const s of DIFFICULTY_SYSTEMS) assert.ok(d.modifiers[s.key] > 0, `${d.id}.${s.key}`);
  const o = defaultCareerOptions();
  assert.equal(o.careerLength, 10);
  assert.equal(o.godMode, false);
  o.modifiers.injuryRate = 9;
  assert.equal(defaultCareerOptions().modifiers.injuryRate, 1, 'opções padrão não compartilham estado');
});

test('normalização de nomes entre fontes', () => {
  assert.equal(normalizeName('Luka Dončić'), 'luka doncic');
  assert.equal(normalizeName('Jaren Jackson Jr.'), 'jaren jackson');
  assert.equal(normalizeName('Ernest Udeh, Jr.'), normalizeName('Ernest Udeh Jr'));
  assert.equal(normalizeName("De'Aaron Fox"), 'deaaron fox');
  assert.equal(normalizeName('Shai Gilgeous-Alexander'), 'shai gilgeous alexander');
  assert.equal(normalizeName('Robert Williams III'), 'robert williams');
  assert.equal(parseHeight('6-8'), 80);
  assert.equal(parseHeight(''), null);
  assert.equal(ageOn('1998-03-03', '2026-10-05'), 28);
  assert.equal(ageOn('1998-10-06', '2026-10-05'), 27);
  assert.equal(ageOn(null, '2026-10-05'), null);
});
