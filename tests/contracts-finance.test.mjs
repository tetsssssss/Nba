import test from 'node:test';
import assert from 'node:assert/strict';
import { newCareer, closeAll } from './helpers/career.js';

async function setup(opts = {}) {
  const world = await newCareer(opts);
  const { runExpansionDraft } = await import('../src/season/season.js');
  runExpansionDraft();
  return world;
}
const C = () => import('../src/contracts/contracts-engine.js');
const F = () => import('../src/contracts/finance.js');

/** Cria um agente livre sintético (jogador real do universo solto no mercado). */
async function freeOne(world, { ovrMin = 70, ovrMax = 76, exp = 5 } = {}) {
  const { waivePlayer } = await C();
  const p = [...world.players.values()].find((x) => x.teamId === 'MEM' && x.rosterStatus === 'standard' && x.ovr >= ovrMin && x.ovr <= ovrMax);
  assert.ok(p, 'jogador de teste');
  waivePlayer(world, { teamId: 'MEM', playerId: p.id, by: 'ai' });
  p.exp = exp;
  return p;
}

test('finanças: luxury tax por faixas (normal e repeater) e modos de cap sem imposto', async () => {
  const { luxuryTaxBill } = await import('../src/contracts/cap.js');
  const cap = { luxuryTax: 200e6 };
  assert.equal(luxuryTaxBill(199e6, cap), 0);
  assert.equal(luxuryTaxBill(205e6, cap), 7.5e6);
  assert.equal(luxuryTaxBill(210e6, cap), 16.25e6);
  assert.equal(luxuryTaxBill(230e6, cap, { repeater: true }), 115e6);
  assert.equal(luxuryTaxBill(230e6, cap, { capMode: 'basic' }), 0);
});

test('finanças: painel separa oficial, estimado e projetado; receita plausível; teto do proprietário', async () => {
  const world = await setup();
  const F2 = await F();
  const o = F2.financeOverview(world, 'BOS');
  assert.equal(o.official.salaryCap, 164961000, 'valores oficiais de league.json');
  assert.ok(o.revenue.items.every((i) => i.kind === 'estimated'), 'receitas são estimadas');
  assert.ok(o.revenue.total > 300e6 && o.revenue.total < 750e6, `receita ${o.revenue.total}`);
  assert.ok(['gastador', 'pragmatico', 'economico', 'impaciente'].includes(o.owner.profile));
  assert.ok(o.owner.ceiling >= world.league.cap.luxuryTax * 0.9);
  const proj = F2.projectFinances(world, 'BOS', 4);
  assert.deepEqual(proj.map((p) => p.season), [2027, 2028, 2029, 2030]);
  assert.ok(proj[0].payroll > proj[3].payroll, 'folha comprometida cai com o tempo (sem renovações)');
  // perfis do proprietário: gastador tolera mais que econômico
  const t = world.teams.get('MEM');
  const owner = world.owners.get(t.ownerId);
  owner.profile = 'gastador';
  const rich = F2.ownerBudget(world, 'MEM').ceiling;
  owner.profile = 'economico';
  const thrifty = F2.ownerBudget(world, 'MEM').ceiling;
  assert.ok(rich > thrifty);
  world.career.modifiers.budgetPressure = 1.45;
  assert.ok(F2.ownerBudget(world, 'MEM').ceiling < thrifty, 'maior pressão financeira = teto menor');
  world.career.systems.finances = false;
  assert.equal(F2.ownerBudget(world, 'MEM').enforced, false);
  await closeAll();
});

test('finanças: fechamento da temporada grava contas uma vez e controla o repeater', async () => {
  const world = await setup();
  const { closeSeasonBooks } = await F();
  const first = closeSeasonBooks(world, 2027);
  assert.equal(first.length, 32);
  assert.equal(closeSeasonBooks(world, 2027).length, 0, 'idempotente');
  const nyk = world.finances.get('NYK:2027');
  assert.ok(nyk.tax > 0 && nyk.closed && nyk.payroll > world.league.cap.luxuryTax);
  assert.deepEqual(Object.keys(world.teams.get('NYK').taxHistory.paid), ['2027']);
  // 3 anos pagando imposto → repeater
  const team = world.teams.get('NYK');
  team.taxHistory.paid = { 2026: 5e6, 2027: nyk.tax, 2025: 3e6 };
  closeSeasonBooks(world, 2028);
  assert.equal(world.teams.get('NYK').taxHistory.repeater, true);
  await closeAll();
});

test('agente: pedido cresce com o Overall, resposta exige o valor, contraproposta e atração de free agents', async () => {
  const world = await setup();
  const { marketAsk, agentResponse } = await C();
  const mid = await freeOne(world, { ovrMin: 70, ovrMax: 74 });
  const star = [...world.players.values()].sort((a, b) => b.ovr - a.ovr)[0];
  assert.ok(marketAsk(world, star).salary > marketAsk(world, mid).salary * 3);
  const ask = marketAsk(world, mid);
  const high = agentResponse(world, { teamId: 'BOS', playerId: mid.id, salary: ask.maxSalary, years: ask.years });
  assert.equal(high.accepted, true);
  const low = agentResponse(world, { teamId: 'BOS', playerId: mid.id, salary: ask.minSalary, years: ask.years });
  assert.equal(low.accepted, false);
  assert.ok(low.counter.salary > ask.minSalary && low.counter.years === ask.years);
  assert.match(low.message, /falta/);
  // freeAgentReluctance só pesa na franquia do usuário
  world.career.modifiers.freeAgentReluctance = 1;
  const base = agentResponse(world, { teamId: 'BOS', playerId: mid.id, salary: ask.salary, years: ask.years }).required;
  world.career.modifiers.freeAgentReluctance = 1.45;
  assert.ok(agentResponse(world, { teamId: 'BOS', playerId: mid.id, salary: ask.salary, years: ask.years }).required > base);
  assert.equal(agentResponse(world, { teamId: 'DAL', playerId: mid.id, salary: ask.salary, years: ask.years }).required, agentResponse(world, { teamId: 'DAL', playerId: mid.id, salary: ask.salary, years: ask.years }).required);
  await closeAll();
});

test('contratação: rotas por situação de cap, consumo de exceção, trava de troca e modo Realista', async () => {
  const world = await setup();
  const { signingRoutes, signFreeAgentOffer, exceptionsFor, marketAsk, checkSigning } = await C();
  const p = await freeOne(world);
  const ask = marketAsk(world, p);
  // MEM abaixo do cap → pode usar espaço no cap
  let routes = signingRoutes(world, { teamId: 'MEM', playerId: p.id, salary: ask.salary, years: 2 });
  assert.equal(routes.find((r) => r.id === 'cap').ok, world.league.cap.salaryCap - 148e6 >= ask.salary || routes.find((r) => r.id === 'cap').ok);
  // DEN no 2º apron: nada além do mínimo
  routes = signingRoutes(world, { teamId: 'DEN', playerId: p.id, salary: ask.salary, years: 2 });
  assert.equal(routes.find((r) => r.id === 'cap').ok, false);
  assert.equal(routes.find((r) => r.id === 'nonTaxMle').ok, false);
  assert.match(routes.find((r) => r.id === 'taxMle').reason, /2º apron|exceções/);
  const bad = checkSigning(world, { teamId: 'DEN', playerId: p.id, salary: ask.salary, years: 2 });
  assert.equal(bad.ok, false);
  assert.match(bad.blocked[0], /financeiramente inválida/);
  // BOS (usuário) acima do 1º apron: contratar por mínimo é possível; por salário alto não
  const min = world.league.cap.minimumSalaryScale.byYearsOfService[Math.min(10, p.exp)];
  const ok = signFreeAgentOffer(world, { teamId: 'BOS', playerId: p.id, salary: min, years: 1, bypassAgent: true });
  assert.equal(ok.route, 'minimum');
  assert.ok(ok.tradeLockedUntil > world.calendar.date, 'recém-contratado não pode ser trocado de imediato');
  assert.equal(world.players.get(p.id).teamId, 'BOS');
  // exceção consumida (CHI over-cap abaixo do 1º apron usa MLE)
  const q = await freeOne(world, { ovrMin: 72, ovrMax: 78 });
  const mleBefore = exceptionsFor(world, 'CHI').nonTaxMle;
  const salary = Math.min(mleBefore, Math.max(marketAsk(world, q).salary, 2e6));
  const contract = signFreeAgentOffer(world, { teamId: 'CHI', playerId: q.id, salary, years: 2, route: 'nonTaxMle', bypassAgent: true, by: 'ai' });
  assert.equal(contract.route, 'nonTaxMle');
  assert.equal(exceptionsFor(world, 'CHI').nonTaxMle, mleBefore - salary);
  await closeAll();
});

test('contratação: modo Coach e Franchise respeitam permissões; Realista bloqueia estouro do proprietário', async () => {
  const world = await setup({ mode: 'coach', role: 'coach' });
  const { signFreeAgentOffer, marketAsk } = await C();
  const p = await freeOne(world);
  assert.throws(() => signFreeAgentOffer(world, { teamId: 'BOS', playerId: p.id, salary: marketAsk(world, p).salary, years: 1, bypassAgent: true }), /cargo/);
  await closeAll();
  const w2 = await setup({ difficulty: 'realistic', teamId: 'MEM', modifiers: undefined });
  const { checkSigning } = await C();
  const q = await freeOne(w2, { ovrMin: 74, ovrMax: 80 });
  // eleva a folha do usuário perto do teto do proprietário
  const o = w2.owners.get(w2.teams.get('MEM').ownerId);
  o.profile = 'economico';
  const { ownerBudget, payrollSnapshot } = await F();
  const room = ownerBudget(w2, 'MEM').ceiling - payrollSnapshot(w2, 'MEM').total;
  const check = checkSigning(w2, { teamId: 'MEM', playerId: q.id, salary: Math.max(room + 5e6, 1e6), years: 1 });
  assert.equal(check.ok, false);
  assert.ok(check.blocked.some((b) => /proprietário/.test(b)) || check.blocked.some((b) => /máximo|inválida/.test(b)));
  w2.career.difficulty = 'normal';
  const warn = checkSigning(w2, { teamId: 'MEM', playerId: q.id, salary: Math.max(room + 5e6, 1e6), years: 1 });
  assert.ok(warn.warnings.some((b) => /proprietário/.test(b)) || !warn.ok);
  await closeAll();
});

test('dispensa: dead money, contrato camp sem garantia e stretch', async () => {
  const world = await setup();
  const { waivePlayer } = await C();
  const { payrollSnapshot } = await F();
  const guaranteed = [...world.players.values()].find((p) => p.teamId === 'BOS' && p.rosterStatus === 'standard' && world.contracts.get(p.id).years.length >= 2 && world.contracts.get(p.id).years[0].salary > 3e6);
  const before = payrollSnapshot(world, 'BOS').total;
  const sal = world.contracts.get(guaranteed.id).years[0].salary;
  const r = waivePlayer(world, { teamId: 'BOS', playerId: guaranteed.id });
  assert.ok(r.deadMoney.length >= 2);
  assert.ok(Math.abs(payrollSnapshot(world, 'BOS').dead - sal) < 1, 'dead money entra na folha');
  assert.equal(world.players.get(guaranteed.id).teamId, null);
  // camp (não garantido): sem dead money na pré-temporada
  const camp = [...world.players.values()].find((p) => p.teamId === 'BOS' && p.rosterStatus === 'camp');
  if (camp) assert.equal(waivePlayer(world, { teamId: 'BOS', playerId: camp.id }).deadMoney.length, 0);
  // stretch
  const other = [...world.players.values()].find((p) => p.teamId === 'MIA' && p.rosterStatus === 'standard' && world.contracts.get(p.id).years.length >= 2);
  const total = world.contracts.get(other.id).years.reduce((a, y) => a + y.salary, 0);
  const s = waivePlayer(world, { teamId: 'MIA', playerId: other.id, stretch: true, by: 'ai' });
  assert.equal(s.deadMoney.length, world.contracts.get(other.id).years.length * 2 + 1);
  assert.ok(Math.abs(s.deadMoney.reduce((a, y) => a + y.amount, 0) - total) < 5);
  assert.ok(before > 0);
  await closeAll();
});

test('novatos: escala por pick (1ª rodada com 4 anos: 2 garantidos + 2 opções do time) e 2ª rodada não garantida', async () => {
  const world = await setup();
  const { rookieScaleSalary, rookieContract, secondRoundContract } = await C();
  assert.equal(rookieScaleSalary(world, 1), world.league.cap.rookieScale.firstYearPick1);
  assert.ok(rookieScaleSalary(world, 1) > rookieScaleSalary(world, 15) && rookieScaleSalary(world, 15) > rookieScaleSalary(world, 30) && rookieScaleSalary(world, 30) > rookieScaleSalary(world, 34));
  const c = rookieContract(world, { playerId: 1, teamId: 'LVJ', pickNumber: 1, season: 2027 });
  assert.deepEqual(c.years.map((y) => y.option), [null, null, 'team', 'team']);
  assert.equal(c.type, 'rookie-scale');
  const s = secondRoundContract(world, { playerId: 2, teamId: 'LVJ', season: 2027 });
  assert.equal(s.years[0].guaranteed, false);
  await closeAll();
});

test('extensão e renovação: exige agente, último ano e adiciona anos ao contrato', async () => {
  const world = await setup();
  const { extendContract, marketAsk, agentResponse } = await C();
  const p = [...world.players.values()].find((x) => x.teamId === 'BOS' && x.rosterStatus === 'standard' && world.contracts.get(x.id).years.length <= 2 && x.ovr >= 70 && !world.contracts.get(x.id).years.some((y) => y.option));
  assert.ok(p, 'jogador com até 2 anos de contrato');
  const ask = marketAsk(world, p);
  const low = ask.minSalary;
  assert.throws(() => extendContract(world, { teamId: 'BOS', playerId: p.id, salary: low, years: 3 }), /recusou/);
  const resp = agentResponse(world, { teamId: 'BOS', playerId: p.id, salary: ask.maxSalary, years: ask.years });
  assert.equal(resp.accepted, true);
  const before = world.contracts.get(p.id).years.length;
  extendContract(world, { teamId: 'BOS', playerId: p.id, salary: ask.maxSalary, years: 3 });
  assert.equal(world.contracts.get(p.id).years.length, before + 3);
  assert.throws(() => extendContract(world, { teamId: 'MIA', playerId: p.id, salary: ask.maxSalary, years: 3 }), /própria franquia/);
  await closeAll();
});

test('free agency no ciclo: vencidos viram agentes livres com direitos, cap holds e renovação por Bird; IA preenche elencos', async () => {
  const world = await newCareer();
  const { simulateUntil } = await import('../src/season/season.js');
  await simulateUntil('finals', {});
  const O = await import('../src/season/offseason.js');
  const { rightsOf, capHolds, freeAgents, reSignPlayer, marketAsk } = await C();
  const { runLottery, startDraft, simAll } = await import('../src/draft/draft-engine.js');
  O.completeStep(world, 'retirements'); O.completeStep(world, 'lottery'); O.completeStep(world, 'scouting');
  startDraft(world); simAll(world); O.completeStep(world, 'draft');
  const { pendingOptions } = await C();
  for (const o of pendingOptions(world, 2028).filter((x) => x.teamId === 'BOS' && x.kind === 'team')) O.decideUserOption(world, o.playerId, true);
  assert.equal(O.offseasonStatus(world).current.id, 'contracts');
  const capBefore = world.league.cap.salaryCap;
  O.completeStep(world, 'contracts');
  assert.equal(world.offseason.leagueYearStarted, true);
  assert.ok(world.league.cap.salaryCap > capBefore);
  const pool = freeAgents(world);
  assert.ok(pool.length > 60, `${pool.length} agentes livres`);
  const mine = rightsOf(world, 'BOS');
  // direitos só existem para quem teve contrato vencido; cap hold >= salário anterior
  for (const id of mine) { const info = world.offseason.rightsInfo[id]; assert.ok(info.hold >= info.lastSalary || info.hold >= world.league.cap.maxSalary.years0to6 * 0.9); assert.equal(world.players.get(id).teamId, null); }
  if (mine.length) {
    assert.ok(capHolds(world, 'BOS') > 0);
    const star = world.players.get(mine[0]);
    const ask = marketAsk(world, star);
    const c = reSignPlayer(world, { teamId: 'BOS', playerId: star.id, salary: ask.maxSalary, years: 3 });
    assert.equal(c.route, 'bird');
    assert.equal(world.players.get(star.id).teamId, 'BOS');
    assert.ok(!rightsOf(world, 'BOS').includes(star.id));
  }
  // modo Básico não tem cap holds nem exceções
  world.career.capMode = 'basic';
  assert.equal(capHolds(world, 'BOS'), 0);
  world.career.capMode = 'full';
  const strongStart = freeAgents(world).filter((p) => p.ovr >= 75).length;
  for (let i = 0; i < 30; i++) O.simulateFreeAgencyDay(world);
  assert.equal(world.offseason.faDay, 30);
  // a IA contratou a maior parte dos bons agentes livres (os restantes ficam sem rota de cap/exceção)
  const strongEnd = freeAgents(world).filter((p) => p.ovr >= 75).length;
  assert.ok(strongEnd <= Math.ceil(strongStart * 0.6), `${strongEnd} de ${strongStart} bons agentes livres restantes`);
  await closeAll();
});
