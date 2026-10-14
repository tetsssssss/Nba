import test from 'node:test';
import assert from 'node:assert/strict';
import { newCareer, closeAll } from './helpers/career.js';

async function setup(opts = {}) {
  const world = await newCareer(opts);
  const { runExpansionDraft } = await import('../src/season/season.js');
  runExpansionDraft();
  return world;
}
const G = () => import('../src/core/godmode.js');
const P = () => import('../src/core/godmode-permissions.js');

test('God Mode: Franchise e Coach nunca recebem poderes, mesmo com godMode=true adulterado', async () => {
  const P2 = await P();
  for (const mode of ['franchise', 'coach']) {
    const world = await setup({ mode, role: mode === 'coach' ? 'coach' : 'gm' });
    world.career.godMode = true; // save adulterado
    assert.equal(P2.godModeAllowed(world.career), false, mode);
    const G2 = await G();
    assert.throws(() => G2.activateOverride(world, 'OVERRIDE TOTAL'), /God Mode/);
    assert.throws(() => G2.takeControl(world, 'MIA'), /God Mode/);
    assert.throws(() => G2.adminMovePlayer(world, [...world.players.keys()][0], 'MIA'), /God Mode/);
    await closeAll();
  }
});

test('God Mode: Commissioner preserva permissões — trocar de franquia e quem pode revisar trades da IA', async () => {
  const world = await setup({ mode: 'commissioner', godMode: true });
  const G2 = await G();
  const P2 = await P();
  assert.equal(P2.godModeAllowed(world.career), true);
  assert.equal(P2.canSwitchTeams(world.career), true);
  assert.equal(P2.canReviewAiTrades(world.career), true);
  G2.takeControl(world, 'MIA');
  assert.equal(world.career.teamId, 'MIA');
  assert.equal(world.market.adminLog[0].action, 'switch-team');
  await closeAll();
  const plain = await setup({});
  assert.equal(P2.canSwitchTeams(plain.career), false, 'Universe sem God Mode não troca de franquia');
  plain.career.godMode = true; plain.career.mode = 'universe';
  assert.equal(P2.canSwitchTeams(plain.career), true, 'Universe com God Mode ligado pode');
  await closeAll();
});

test('Forçar aceitação ignora a IA mas mantém a legalidade; Override Total precisa de ativação e lista as regras ignoradas', async () => {
  const world = await setup({ mode: 'commissioner', godMode: true });
  const G2 = await G();
  const T = await import('../src/contracts/trade-engine.js');
  const { rosterOf } = await import('../src/gm/team-context.js');
  // proposta ruim para a IA (MEM entrega seu melhor jogador por nada de valor), mas legal em salário
  const mem = rosterOf(world, 'MEM').filter((p) => p.rosterStatus === 'standard');
  const mine = rosterOf(world, 'BOS').filter((p) => p.rosterStatus === 'standard');
  const star = mem[0];
  const sal = (p) => world.contracts.get(p.id).years[0].salary;
  const filler = mine.reverse().find((p) => sal(p) >= sal(star) * 0.5 && sal(p) <= sal(star) * 1.3) ?? mine[0];
  const proposal = { assets: [T.playerAsset(star.id, 'MEM', 'BOS'), T.playerAsset(filler.id, 'BOS', 'MEM')] };
  const legal = (await import('../src/contracts/trade-rules.js')).checkLegality(world, proposal);
  if (legal.ok && !T.evaluateAcceptanceAll(world, proposal).accepted) {
    assert.throws(() => G2.adminTrade(world, proposal, 'approve'), /recusou/);
    const done = G2.adminTrade(world, proposal, 'force');
    assert.equal(world.players.get(star.id).teamId, 'BOS');
    assert.equal(done.ignored.length, 0, 'legalidade mantida, nada ignorado');
    assert.equal(world.market.adminLog[0].action, 'trade-force');
  }
  // ilegal (dinheiro acima do limite): force não basta
  const illegal = { assets: [T.cashAsset(world.league.cap.tradeCashLimit * 3, 'MEM', 'CHA')] };
  assert.throws(() => G2.adminTrade(world, illegal, 'force'), /dinheiro/);
  assert.throws(() => G2.adminTrade(world, illegal, 'override'), /Override Total/);
  assert.throws(() => G2.activateOverride(world, 'sim'), /OVERRIDE TOTAL/);
  G2.activateOverride(world, 'OVERRIDE TOTAL');
  const out = G2.adminTrade(world, illegal, 'override');
  assert.deepEqual(out.ignored.map((i) => `${i.rule}:${i.teamId}`).sort(), ['cash-limit:CHA', 'cash-limit:MEM'], 'quem envia e quem recebe estouram o limite');
  const log = world.market.adminLog.find((l) => l.action === 'trade-override');
  assert.equal(log.rulesIgnored[0].rule, 'cash-limit');
  assert.match(log.rulesIgnored[0].message, /dinheiro/);
  G2.deactivateOverride(world);
  assert.equal(world.career.godOverride.active, false);
  await closeAll();
});

test('edições administrativas: contrato, salário, atributos, pick, movimentação e condições da liga ficam registradas', async () => {
  const world = await setup({ mode: 'commissioner', godMode: true });
  const G2 = await G();
  const p = [...world.players.values()].find((x) => x.teamId === 'BOS' && x.rosterStatus === 'standard');
  const ovrBefore = p.ovr;
  G2.adminEditAttributes(world, p.id, { threePoint: 99, speed: 99 }, { potential: 97 });
  assert.ok(world.players.get(p.id).ovr >= ovrBefore - 1);
  assert.equal(world.players.get(p.id).attributes.threePoint, 99);
  assert.throws(() => G2.adminEditAttributes(world, p.id, { inexistente: 5 }), /desconhecido/);
  const c = G2.adminEditContract(world, p.id, { years: [{ season: 2027, salary: 12e6 }, { season: 2028, salary: 13e6, option: 'player' }] });
  assert.equal(c.years.length, 2);
  assert.throws(() => G2.adminEditContract(world, p.id, { years: [{ season: 2027, salary: 1 }, { season: 2029, salary: 1 }] }), /consecutivos/);
  G2.adminCorrectSalary(world, p.id, 2027, 9e6);
  assert.equal(world.contracts.get(p.id).years[0].salary, 9e6);
  G2.adminSetPickOwner(world, '2028-R1-BOS', 'MIA', { protection: { top: 5, fallback: 'rollover', endSeason: 2029 } });
  assert.equal(world.draftPicks.get('2028-R1-BOS').ownerTeamId, 'MIA');
  assert.equal(world.draftPicks.get('2028-R1-BOS').protection.top, 5);
  assert.throws(() => G2.adminSetPickOwner(world, '2027-R2-BOS', 'MIA', { protection: { top: 5, fallback: 'void' } }), /1ª rodada/);
  G2.adminMovePlayer(world, p.id, 'DAL');
  assert.equal(world.players.get(p.id).teamId, 'DAL');
  assert.equal(world.contracts.get(p.id).teamId, 'DAL');
  G2.adminMovePlayer(world, p.id, null);
  assert.equal(world.players.get(p.id).teamId, null);
  G2.adminLeagueConditions(world, { salaryCap: 170e6, futurePickYearsAhead: 3 });
  assert.equal(world.league.cap.salaryCap, 170e6);
  assert.equal(world.market.prefs.futurePickYearsAhead, 3);
  assert.throws(() => G2.adminLeagueConditions(world, { luxuryTax: 100e6 }), /ordem/);
  G2.adminEvent(world, 'injury', { playerId: [...world.players.values()].find((x) => x.teamId === 'MIA').id });
  G2.adminEvent(world, 'owner-shift', { teamId: 'MIA', profile: 'gastador' });
  assert.throws(() => G2.adminEvent(world, 'nada', {}), /desconhecido/);
  const actions = world.market.adminLog.map((l) => l.action);
  for (const a of ['edit-attributes', 'edit-contract', 'correct-salary', 'set-pick-owner', 'move-player', 'league-conditions', 'event-injury', 'event-owner-shift']) assert.ok(actions.includes(a), a);
  await closeAll();
});

test('God Mode: define escolhas do Draft e controla aposentadorias', async () => {
  const world = await newCareer({ mode: 'commissioner', godMode: true });
  const { simulateUntil } = await import('../src/season/season.js');
  await simulateUntil('finals', {});
  const G2 = await G();
  const O = await import('../src/season/offseason.js');
  const D = await import('../src/draft/draft-engine.js');
  const { decideRetirements } = await import('../src/players/retirement.js');
  const list = decideRetirements(world, 2027);
  const keep = list.find((r) => r.retires);
  const star = [...world.players.values()].find((p) => p.ovr >= 90 && p.teamId);
  G2.adminRetirement(world, keep.playerId, 'keep');
  G2.adminRetirement(world, star.id, 'force');
  O.completeStep(world, 'retirements');
  assert.equal(world.players.get(star.id).retired.season, 2027);
  assert.ok(!world.players.get(keep.playerId).retired, 'mantido pelo comissário');
  D.runLottery(world); D.startDraft(world);
  const target = D.availableProspects(world).at(-1);
  G2.adminForceDraftPick(world, 1, target.id);
  const rec = D.autoPick(world);
  assert.equal(rec.prospectId, target.id, 'a escolha #1 foi definida pelo comissário');
  assert.throws(() => G2.adminForceDraftPick(world, 5, target.id), /já foi selecionado/);
  await closeAll();
});

test('revisão de trades da IA: aprovar e vetar ficam no log do comissário', async () => {
  const world = await setup({ mode: 'commissioner', godMode: true });
  world.career.autoApproveAiTrades = false;
  const A = await import('../src/gm/ai-gm.js');
  const G2 = await G();
  const { addDays } = await import('../src/ui/format.js');
  world.calendar.phase = 'offseason';
  for (let i = 0; i < 14 && world.market.review.length < 2; i++) { world.calendar.date = addDays(world.calendar.date, 1); A.runAiMarketTick(world); }
  assert.ok(world.market.review.length >= 1);
  const [a, b] = world.market.review;
  G2.adminApproveReview(world, a.id);
  if (b) G2.adminRejectReview(world, b.id);
  const actions = world.market.adminLog.map((l) => l.action);
  assert.ok(actions.includes('review-approve'));
  if (b) assert.ok(actions.includes('review-reject'));
  await closeAll();
});
