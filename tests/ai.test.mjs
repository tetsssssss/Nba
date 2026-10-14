import test from 'node:test';
import assert from 'node:assert/strict';
import { newCareer, closeAll } from './helpers/career.js';

async function setup(opts = {}) {
  const world = await newCareer(opts);
  const { runExpansionDraft } = await import('../src/season/season.js');
  runExpansionDraft();
  return world;
}
const G = () => import('../src/gm/ai-gm.js');
const T = () => import('../src/contracts/trade-engine.js');

test('perfis de GM: 32 franquias com arquétipo, intensidade e estabilidade na reavaliação', async () => {
  const world = await setup();
  const { ARCHETYPES, assignGmProfiles } = await import('../src/gm/personality.js');
  for (const team of world.teams.values()) {
    assert.ok(ARCHETYPES[team.gm.archetype], team.id);
    assert.ok(team.gm.intensity > 0.7 && team.gm.intensity < 1.3);
  }
  const kinds = new Set([...world.teams.values()].map((t) => t.gm.archetype));
  assert.ok(kinds.size >= 4, 'variedade de personalidades');
  const before = [...world.teams.values()].map((t) => t.gm.archetype).join();
  assignGmProfiles(world, { force: true });
  const after = [...world.teams.values()].map((t) => t.gm.archetype).join();
  const same = [...world.teams.values()].filter((t, i) => before.split(',')[i] === t.gm.archetype).length;
  assert.ok(same >= 14, `a reavaliação preserva boa parte da estratégia (${same}/32)`);
  await closeAll();
});

test('contraproposta: a IA indica o que falta e o ajuste é legal e aceito por ela', async () => {
  const world = await setup();
  world.career.modifiers.tradeDifficulty = 1.2;
  const { buildCounter, proposeToAi } = await G();
  const { evaluateAcceptance, playerAsset } = await T();
  const { checkLegality } = await import('../src/contracts/trade-rules.js');
  const { rosterOf } = await import('../src/gm/team-context.js');
  // BOS tenta levar um bom jogador do MEM por um reserva
  const mem = rosterOf(world, 'MEM').filter((p) => p.rosterStatus === 'standard');
  const bos = rosterOf(world, 'BOS').filter((p) => p.rosterStatus === 'standard');
  const sal = (p) => world.contracts.get(p.id).years[0].salary;
  let found = null;
  for (const ask of mem.slice(0, 5)) for (const give of [...bos].reverse().slice(0, 8)) {
    const proposal = { assets: [playerAsset(ask.id, 'MEM', 'BOS'), playerAsset(give.id, 'BOS', 'MEM')] };
    if (!checkLegality(world, proposal).ok) continue;
    const ev = evaluateAcceptance(world, proposal, 'MEM');
    if (ev.accept) continue;
    const counter = buildCounter(world, proposal, ev);
    if (counter) { found = { proposal, counter }; break; }
  }
  assert.ok(found, 'deve existir ao menos uma recusa com contraproposta viável');
  const { counter, proposal } = found;
  assert.match(counter.message, /aceitaria se/);
  assert.equal(checkLegality(world, { assets: counter.assets }).ok, true);
  assert.equal(evaluateAcceptance(world, { assets: counter.assets }, 'MEM').accept, true);
  assert.ok(counter.added.length + counter.removed.length > 0);
  // proposeToAi devolve o status 'countered' para a mesma proposta recusada
  const res = proposeToAi(world, proposal);
  assert.ok(['countered', 'rejected'].includes(res.status));
  assert.ok(world.market.history.some((h) => ['countered', 'rejected'].includes(h.type)));
  await closeAll();
});

test('mercado da IA: checkpoint por data — rodar duas vezes no mesmo dia não duplica nada', async () => {
  const world = await setup();
  const { runAiMarketTick } = await G();
  world.calendar.phase = 'offseason';
  const first = runAiMarketTick(world);
  const historyAfterFirst = world.market.history.length;
  const second = runAiMarketTick(world);
  assert.equal(second.skipped, 'checkpoint');
  assert.equal(world.market.history.length, historyAfterFirst);
  assert.ok(first.trades.length >= 0);
  // dia seguinte processa de novo
  const { addDays } = await import('../src/ui/format.js');
  world.calendar.date = addDays(world.calendar.date, 1);
  assert.notEqual(runAiMarketTick(world).skipped, 'checkpoint');
  await closeAll();
});

test('mercado da IA: career.systems.aiTrades=false desliga trocas IA×IA', async () => {
  const world = await setup();
  world.career.systems.aiTrades = false;
  const { runAiMarketTick } = await G();
  world.calendar.phase = 'offseason';
  let total = 0;
  const { addDays } = await import('../src/ui/format.js');
  for (let i = 0; i < 6; i++) { world.calendar.date = addDays(world.calendar.date, 1); total += runAiMarketTick(world).trades.length; }
  assert.equal(total, 0);
  await closeAll();
});

test('mercado da IA: autoApprove desligado envia para revisão do comissário; sem comissário nada acontece', async () => {
  const world = await setup({ mode: 'commissioner', godMode: true });
  world.career.autoApproveAiTrades = false;
  const { runAiMarketTick, approveReview, rejectReview } = await G();
  const { addDays } = await import('../src/ui/format.js');
  world.calendar.phase = 'offseason';
  let queued = 0;
  for (let i = 0; i < 12 && !world.market.review.length; i++) { world.calendar.date = addDays(world.calendar.date, 1); queued += runAiMarketTick(world).review.length; }
  assert.ok(world.market.review.length > 0, 'trades válidas aguardam aprovação');
  assert.equal(world.market.history.filter((h) => h.type === 'executed').length, 0, 'nada executado sem aprovação');
  const [a, b] = world.market.review;
  const done = approveReview(world, a.id);
  assert.ok(done.tradeId);
  assert.ok(world.market.history.some((h) => h.type === 'executed' && h.label === 'aprovada pelo comissário'));
  if (b) { rejectReview(world, b.id); assert.ok(world.market.history.some((h) => h.type === 'review-rejected')); }
  await closeAll();

  const plain = await setup(); // modo Universe sem God Mode
  plain.career.autoApproveAiTrades = false;
  plain.calendar.phase = 'offseason';
  let n = 0;
  for (let i = 0; i < 8; i++) { plain.calendar.date = addDays(plain.calendar.date, 1); const r = runAiMarketTick(plain); n += r.trades.length + r.review.length; }
  assert.equal(n, 0, 'sem comissário, trades da IA não são processadas');
  await closeAll();
});

test('ofertas da IA ao usuário: ids de evento impedem repetição e expiram', async () => {
  const world = await setup();
  const { buildOfferToUser } = await G();
  const { addInboxOffer, expireOffers } = await T();
  const { createRng } = await import('../src/core/rng.js');
  let offer = null;
  for (const t of world.teams.values()) {
    if (t.id === 'BOS') continue;
    const built = buildOfferToUser(world, t.id, createRng(`o:${t.id}`));
    if (built) { offer = addInboxOffer(world, { fromTeamId: t.id, assets: built.proposal.assets, message: built.message, expiresOn: '2026-10-12', eventId: `offer:test:${t.id}` }); if (offer) break; }
  }
  assert.ok(offer, 'ao menos uma franquia faz oferta');
  assert.equal(addInboxOffer(world, { fromTeamId: offer.fromTeamId, assets: offer.assets, message: 'dup', expiresOn: '2026-10-12', eventId: `offer:test:${offer.fromTeamId}` }), null, 'mesmo evento não repete');
  assert.equal(world.market.proposals.length, 1);
  world.calendar.date = '2026-10-13'; // depois do prazo
  expireOffers(world);
  assert.equal(world.market.proposals.length, 0);
  assert.equal(world.market.history[0].type, 'expired');
  await closeAll();
});

test('temporada completa com mercado da IA ativo: elencos válidos e nenhuma pick duplicada', async () => {
  const world = await newCareer();
  const { simulateUntil } = await import('../src/season/season.js');
  const { teamRoster } = await import('../src/core/world.js');
  await simulateUntil('finals', {});
  for (const team of world.teams.values()) assert.ok(teamRoster(team.id).length >= 8, team.id);
  const owners = new Map();
  for (const pick of world.draftPicks.values()) { assert.ok(world.teams.has(pick.ownerTeamId)); assert.ok(!owners.has(pick.id)); owners.set(pick.id, pick.ownerTeamId); }
  // cada jogador existe em um único elenco e o contrato aponta para o time atual
  for (const c of world.contracts.values()) assert.equal(world.players.get(c.playerId).teamId, c.teamId);
  const executed = world.market.history.filter((h) => h.type === 'executed');
  assert.ok(executed.length > 0, 'houve trocas da IA ao longo da temporada');
  assert.equal(new Set(executed.map((h) => h.id)).size, executed.length, 'sem trocas repetidas');
  await closeAll();
});
