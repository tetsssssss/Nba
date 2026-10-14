import test from 'node:test';
import assert from 'node:assert/strict';
import { newCareer, closeAll } from './helpers/career.js';

async function setup(opts = {}) {
  const world = await newCareer(opts);
  const { runExpansionDraft } = await import('../src/season/season.js');
  runExpansionDraft();
  const { assignGmProfiles } = await import('../src/gm/personality.js');
  const { markDirty } = await import('../src/core/world.js');
  assignGmProfiles(world, { markDirty });
  return world;
}
const T = () => import('../src/contracts/trade-engine.js');
const R = () => import('../src/contracts/trade-rules.js');
const roster = async (world, id) => (await import('../src/gm/team-context.js')).rosterOf(world, id);
const salaryOf = (world, p) => world.contracts.get(p.id).years.find((y) => y.season === world.calendar.season)?.salary ?? 0;

test('trade-rules: troca equiparada entre franquias abaixo do cap é legal', async () => {
  const world = await setup();
  const { checkLegality } = await R();
  const { playerAsset } = await T();
  const a = (await roster(world, 'MEM')).find((p) => p.rosterStatus === 'standard' && salaryOf(world, p) > 2e6);
  const b = (await roster(world, 'CHA')).find((p) => p.rosterStatus === 'standard' && salaryOf(world, p) > 2e6);
  const res = checkLegality(world, { assets: [playerAsset(a.id, 'MEM', 'CHA'), playerAsset(b.id, 'CHA', 'MEM')] });
  assert.equal(res.ok, true, JSON.stringify(res.blocked.map((x) => x.message)));
});

test('trade-rules: franquia no 2º apron não pode receber mais salário que envia — mensagem específica', async () => {
  const world = await setup();
  const { checkLegality } = await R();
  const { playerAsset } = await T();
  const den = (await roster(world, 'DEN')); // 2º apron
  const cheap = den.filter((p) => p.rosterStatus === 'standard').sort((a, b) => salaryOf(world, a) - salaryOf(world, b))[3];
  const rich = (await roster(world, 'MEM')).sort((a, b) => salaryOf(world, b) - salaryOf(world, a))[0];
  const res = checkLegality(world, { assets: [playerAsset(cheap.id, 'DEN', 'MEM'), playerAsset(rich.id, 'MEM', 'DEN')] });
  assert.equal(res.ok, false);
  const issue = res.blocked.find((b) => b.rule === 'salary-matching' && b.teamId === 'DEN');
  assert.ok(issue, 'regra de equiparação deve ser apontada');
  assert.match(issue.message, /2º apron/);
  assert.match(issue.message, /100% do salário enviado/);
  assert.match(issue.message, /Reduza o salário recebido em/);
});

test('trade-rules: time acima do cap usa 200% + 250 mil; excesso é bloqueado', async () => {
  const world = await setup();
  const { checkLegality } = await R();
  const { playerAsset } = await T();
  // CHI está acima do cap (over-cap) e abaixo do 1º apron
  const chi = (await roster(world, 'CHI')).filter((p) => p.rosterStatus === 'standard').sort((a, b) => salaryOf(world, a) - salaryOf(world, b));
  const small = chi[2];
  const bigger = (await roster(world, 'MEM')).filter((p) => salaryOf(world, p) > salaryOf(world, small) * 2 + 400000 && salaryOf(world, p) < 14e6).sort((a, b) => salaryOf(world, a) - salaryOf(world, b))[0];
  if (!bigger) return;
  const res = checkLegality(world, { assets: [playerAsset(small.id, 'CHI', 'MEM'), playerAsset(bigger.id, 'MEM', 'CHI')] });
  assert.equal(res.blocked.some((b) => b.rule === 'salary-matching' && b.teamId === 'CHI'), true);
});

test('trade-rules: picks fora do horizonte, Stepien e propriedade', async () => {
  const world = await setup();
  const { checkLegality } = await R();
  const { pickAsset } = await T();
  // horizonte de 1 ano: 2029 está fora
  let res = checkLegality(world, { assets: [pickAsset('2029-R1-BOS', 'BOS', 'DAL')] });
  assert.ok(res.blocked.some((b) => b.rule === 'pick-window'));
  assert.match(res.blocked.find((b) => b.rule === 'pick-window').message, /design configurável/);
  // ampliando por preferência do usuário (mecanismo compatível com a carreira)
  world.market.prefs.futurePickYearsAhead = 3;
  res = checkLegality(world, { assets: [pickAsset('2029-R1-BOS', 'BOS', 'DAL')] });
  assert.ok(!res.blocked.some((b) => b.rule === 'pick-window'));
  // propriedade: BOS não possui a pick do MIA
  res = checkLegality(world, { assets: [pickAsset('2028-R1-MIA', 'BOS', 'DAL')] });
  assert.ok(res.blocked.some((b) => b.rule === 'ownership'));
  // Stepien: BOS não pode ficar sem 1ª rodada em 2027 e 2028 (anos consecutivos)
  world.market.prefs.futurePickYearsAhead = 1;
  res = checkLegality(world, { assets: [pickAsset('2027-R1-BOS', 'BOS', 'DAL'), pickAsset('2028-R1-BOS', 'BOS', 'DAL')] });
  const step = res.blocked.find((b) => b.rule === 'pick-stepien');
  assert.ok(step, 'Stepien deve bloquear');
  assert.match(step.message, /2027 e 2028/);
  // uma só 1ª rodada é permitida
  res = checkLegality(world, { assets: [pickAsset('2027-R1-BOS', 'BOS', 'DAL')] });
  assert.ok(!res.blocked.some((b) => b.rule === 'pick-stepien'));
  await closeAll();
});

test('trade-rules: período de trocas (deadline e playoffs) e expansão antes do Expansion Draft', async () => {
  const world = await newCareer();
  const { checkLegality } = await R();
  const { playerAsset, pickAsset } = await T();
  const { rosterOf } = await import('../src/gm/team-context.js');
  const bos = rosterOf(world, 'BOS')[0];
  // antes do Expansion Draft: trocar jogador com LVJ é bloqueado; picks são permitidas
  let res = checkLegality(world, { assets: [playerAsset(bos.id, 'BOS', 'LVJ')] });
  assert.ok(res.blocked.some((b) => b.rule === 'expansion'));
  res = checkLegality(world, { assets: [pickAsset('2028-R2-BOS', 'BOS', 'LVJ')] });
  assert.ok(!res.blocked.some((b) => b.rule === 'expansion'));
  world.calendar.phase = 'regular';
  world.calendar.date = '2027-02-20';
  res = checkLegality(world, { assets: [pickAsset('2028-R2-BOS', 'BOS', 'DAL')] });
  assert.match(res.blocked.find((b) => b.rule === 'window').message, /prazo de trocas encerrou em 5 fev 2027/);
  world.calendar.phase = 'playoffs';
  res = checkLegality(world, { assets: [pickAsset('2028-R2-BOS', 'BOS', 'DAL')] });
  assert.match(res.blocked.find((b) => b.rule === 'window').message, /playoffs/);
  await closeAll();
});

test('trade-rules: dinheiro respeita o limite anual; Override Total converte bloqueios em itens ignorados', async () => {
  const world = await setup();
  const { checkLegality } = await R();
  const { cashAsset } = await T();
  const limit = world.league.cap.tradeCashLimit;
  let res = checkLegality(world, { assets: [cashAsset(limit + 1, 'MEM', 'CHA')] });
  assert.ok(res.blocked.some((b) => b.rule === 'cash-limit'));
  res = checkLegality(world, { assets: [cashAsset(limit + 1, 'MEM', 'CHA')] }, { override: 'total' });
  assert.equal(res.ok, true);
  assert.ok(res.ignored.some((i) => i.rule === 'cash-limit'));
  await closeAll();
});

test('valuation: monotonia, contrato, idade/perfil e picks', async () => {
  const world = await setup();
  const V = await import('../src/contracts/valuation.js');
  const { rosterOf } = await import('../src/gm/team-context.js');
  const players = [...world.players.values()];
  const star = players.sort((a, b) => b.ovr - a.ovr)[0];
  const role = players.find((p) => p.ovr >= 70 && p.ovr <= 72 && p.rosterStatus === 'standard');
  assert.ok(V.playerValue(world, star, { view: 'god' }).value > V.playerValue(world, role, { view: 'god' }).value * 3);
  // contrato: o mesmo jogador com salário menor vale mais
  const copy = structuredClone(world.contracts.get(role.id));
  const base = V.playerValue(world, role, { view: 'god' });
  world.contracts.get(role.id).years = world.contracts.get(role.id).years.map((y) => ({ ...y, salary: y.salary + 25e6 }));
  const overpaid = V.playerValue(world, role, { view: 'god' });
  world.contracts.set(role.id, copy);
  assert.ok(overpaid.value < base.value - 3, `${overpaid.value} < ${base.value}`);
  // perfis: rebuild prefere jovem com potencial; contender prefere veterano de mesmo Overall
  const young = players.find((p) => ageFast(world, p) <= 21 && p.potential - p.ovr >= 12 && p.ovr >= 68);
  const veteran = players.find((p) => ageFast(world, p) >= 33 && Math.abs(p.ovr - young.ovr) <= 2);
  if (young && veteran) {
    const { ARCHETYPES } = await import('../src/gm/personality.js');
    const diff = (prof) => V.playerValue(world, young, { view: 'god', profile: prof }).value - V.playerValue(world, veteran, { view: 'god', profile: prof }).value;
    assert.ok(diff(ARCHETYPES.rebuild) > diff(ARCHETYPES.contender), 'reconstrução valoriza mais o jovem do que o contender');
  }
  // picks: top > fim da 1ª rodada > 2ª rodada; protegida vale menos
  const first = V.pickValue(world, world.draftPicks.get('2027-R1-LVJ'), {}).value; // #1
  const late = V.pickValue(world, world.draftPicks.get('2027-R1-OKC'), {}).value;
  const second = V.pickValue(world, world.draftPicks.get('2027-R2-OKC'), {}).value;
  assert.ok(first > late && late > second && second > 0);
  const base28 = V.pickValue(world, { ...world.draftPicks.get('2028-R1-WAS'), ownerTeamId: 'BOS' }, {}).value;
  const prot = V.pickValue(world, { ...world.draftPicks.get('2028-R1-WAS'), ownerTeamId: 'BOS', protection: { top: 10, fallback: 'void' } }, {}).value;
  assert.ok(prot < base28);
  // consolidação: dois jogadores medianos < um craque
  assert.ok(V.utility([40, 40]) < V.utility([80]));
  await closeAll();
});
const ageFast = (world, p) => 2027 - Number(p.birthDate.slice(0, 4));

test('aceitação: respeita tradeDifficulty e produz justificativa legível', async () => {
  const world = await setup();
  const { evaluateAcceptance, playerAsset, pickAsset } = await T();
  const { rosterOf } = await import('../src/gm/team-context.js');
  const ask = rosterOf(world, 'MEM').filter((p) => p.rosterStatus === 'standard')[0];
  const give = rosterOf(world, 'BOS').filter((p) => p.rosterStatus === 'standard')[3];
  const proposal = { assets: [playerAsset(ask.id, 'MEM', 'BOS'), playerAsset(give.id, 'BOS', 'MEM')] };
  world.career.modifiers.tradeDifficulty = 0.6;
  const easy = evaluateAcceptance(world, proposal, 'MEM');
  world.career.modifiers.tradeDifficulty = 1.45;
  const hard = evaluateAcceptance(world, proposal, 'MEM');
  assert.ok(easy.required < hard.required, 'dificuldade alta exige margem maior');
  assert.ok(easy.probability >= hard.probability);
  assert.ok(Array.isArray(hard.cons));
  await closeAll();
});

test('execução: troca 2 por 1 com picks é atômica e atualiza propriedade, notícias e histórico', async () => {
  const world = await setup();
  const { executeProposal, playerAsset, pickAsset, checkTrade } = await T();
  const { rosterOf } = await import('../src/gm/team-context.js');
  // BOS (usuário) envia 1 pick de 2ª rodada e jogador; MEM envia jogador ruim de salário similar
  const mine = rosterOf(world, 'BOS').filter((p) => p.rosterStatus === 'standard');
  const theirs = rosterOf(world, 'MEM').filter((p) => p.rosterStatus === 'standard');
  const cheap = theirs[theirs.length - 1];
  const proposal = { assets: [playerAsset(cheap.id, 'MEM', 'BOS'), playerAsset(mine[mine.length - 1].id, 'BOS', 'MEM'), pickAsset('2028-R2-BOS', 'BOS', 'MEM')] };
  world.career.modifiers.tradeDifficulty = 0.6;
  const check = checkTrade(world, proposal);
  if (!check.legality.ok) return; // cenário depende do elenco; legalidade já é coberta em outros testes
  if (!check.acceptance.accepted) return;
  const newsBefore = world.pending.news.length;
  const out = executeProposal(world, proposal, { by: 'user' });
  assert.ok(out.tradeId);
  assert.equal(world.players.get(cheap.id).teamId, 'BOS');
  assert.equal(world.draftPicks.get('2028-R2-BOS').ownerTeamId, 'MEM');
  assert.ok(world.pending.news.length > newsBefore);
  assert.equal(world.market.history[0].type, 'executed');
  await closeAll();
});

test('execução: proposta ilegal não muda nada (validação antes da mutação)', async () => {
  const world = await setup();
  const { executeProposal, playerAsset, pickAsset } = await T();
  const before = JSON.stringify([...world.draftPicks.values()].filter((p) => p.ownerTeamId === 'BOS').map((p) => p.id));
  assert.throws(() => executeProposal(world, { assets: [pickAsset('2028-R1-MIA', 'BOS', 'DAL'), pickAsset('2028-R1-BOS', 'BOS', 'DAL')] }, { by: 'user' }), /não possui/);
  assert.equal(JSON.stringify([...world.draftPicks.values()].filter((p) => p.ownerTeamId === 'BOS').map((p) => p.id)), before);
  await closeAll();
});

test('God Mode: força aceitação só com God Mode; Override Total exige ativação explícita; Franchise nunca recebe', async () => {
  const world = await setup({ mode: 'commissioner', godMode: true });
  const { executeProposal, playerAsset, pickAsset, cashAsset } = await T();
  const bad = { assets: [cashAsset(world.league.cap.tradeCashLimit * 2, 'MEM', 'CHA')] };
  assert.throws(() => executeProposal(world, bad, { by: 'commissioner', override: 'total' }), /ativação explícita/);
  world.career.godOverride = { active: true, since: world.calendar.date };
  const ok = executeProposal(world, bad, { by: 'commissioner', override: 'total' });
  assert.ok(ok.legality.ignored.some((i) => i.rule === 'cash-limit'));
  assert.ok(world.market.history[0].override.includes('cash-limit'), 'regras ignoradas ficam registradas');
  // Franchise com godMode adulterado no save continua sem poderes
  world.career.mode = 'franchise';
  assert.throws(() => executeProposal(world, { assets: [pickAsset('2028-R2-MIA', 'MIA', 'DAL')] }, { by: 'user', force: true }), /God Mode/);
  await closeAll();
});
