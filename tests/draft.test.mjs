import test from 'node:test';
import assert from 'node:assert/strict';
import { newCareer, closeAll } from './helpers/career.js';

async function toOffseason(opts = {}) {
  const world = await newCareer(opts);
  const { simulateUntil } = await import('../src/season/season.js');
  await simulateUntil('finals', {});
  assert.equal(world.calendar.phase, 'offseason');
  return world;
}
const D = () => import('../src/draft/draft-engine.js');

test('Draft 2027: loteria uma vez só, ordem com 66 picks, reservas de expansão e sem duplicatas', async () => {
  const world = await toOffseason();
  const { runLottery, ensureDraft } = await D();
  const lottery = runLottery(world);
  assert.equal(world.draft.season, 2027);
  assert.equal(world.draft.order.length, 66);
  assert.equal(new Set(world.draft.order.map((o) => o.number)).size, 66);
  const num = (id) => world.draftPicks.get(id).number;
  assert.deepEqual([num('2027-R1-LVJ'), num('2027-R1-LVJ-X2'), num('2027-R1-SEA'), num('2027-R1-SEA-X2')], [1, 10, 4, 5]);
  // todas as franquias estabelecidas aparecem exatamente uma vez na 1ª rodada
  const firstRound = world.draft.order.filter((o) => o.round === 1).map((o) => world.draftPicks.get(o.pickId).originalTeamId);
  assert.equal(firstRound.length, 34);
  assert.equal(new Set(firstRound).size, 32);
  // loteria não inclui as franquias de expansão (picks reservadas) e é idempotente
  assert.ok(!lottery.pool.includes('LVJ') && !lottery.pool.includes('SEA'));
  const again = runLottery(world);
  assert.deepEqual(again.drawn, lottery.drawn);
  assert.equal(ensureDraft(world), world.draft);
  await closeAll();
});

test('Draft 2027: simular até a minha pick, escolher, não repetir prospecto, sem dupla seleção da pick', async () => {
  const world = await toOffseason();
  const { runLottery, startDraft, simToUserPick, makePick, availableProspects, currentEntry, userOwnsCurrent } = await D();
  runLottery(world);
  startDraft(world);
  const made = simToUserPick(world);
  assert.ok(world.draft.status === 'live' || world.draft.status === 'complete');
  if (world.draft.status === 'live') {
    assert.ok(userOwnsCurrent(world));
    const entry = currentEntry(world);
    const best = availableProspects(world)[0];
    const rec = makePick(world, { prospectId: best.id, by: 'user' });
    assert.equal(rec.teamId, 'BOS');
    assert.equal(world.draftPicks.get(entry.pickId).status, 'exercised');
    assert.equal(world.prospects.get(best.id).status, 'drafted');
    assert.ok(world.players.get(rec.playerId));
    assert.equal(world.contracts.get(rec.playerId).type, entry.round === 1 ? 'rookie-scale' : 'camp');
    assert.throws(() => makePick(world, { prospectId: best.id, by: 'user' }), /já foi selecionado|não pertence/);
  }
  assert.ok(made.length > 0);
  await closeAll();
});

test('Draft: pausa bloqueia ações e persistência retoma exatamente da próxima escolha', async () => {
  const world = await toOffseason();
  const { runLottery, startDraft, autoPick, pauseDraft, resumeDraft } = await D();
  const { saveWorld } = await import('../src/core/world.js');
  runLottery(world);
  startDraft(world);
  for (let i = 0; i < 7; i++) autoPick(world);
  pauseDraft(world);
  assert.throws(() => autoPick(world), /pausado/);
  await saveWorld();
  const cursor = world.draft.cursor;
  const picksMade = world.draft.picks.map((p) => p.prospectId);
  const { openCareer, closeCareer } = await import('../src/core/saves.js');
  const id = world.saveId;
  await closeCareer();
  const again = await openCareer(id);
  assert.equal(again.draft.cursor, cursor, 'o Draft não recomeça');
  assert.deepEqual(again.draft.picks.map((p) => p.prospectId), picksMade);
  assert.equal(again.draft.paused, true);
  assert.equal(again.draft.lottery.drawn.length, 4);
  resumeDraft(again);
  const rec = autoPick(again);
  assert.equal(rec.number, cursor + 1);
  assert.equal(again.prospects.get(picksMade[0]).status, 'drafted');
  await closeAll();
});

test('Draft completo: 66 escolhas, jogadores criados, undrafted vira agente livre, ids únicos e notas', async () => {
  const world = await toOffseason();
  const { runLottery, simAll, classOf } = await D();
  runLottery(world);
  const made = simAll(world);
  assert.equal(made.length, 66);
  assert.equal(world.draft.status, 'complete');
  assert.equal(new Set(made.map((m) => m.prospectId)).size, 66);
  assert.equal(new Set(made.map((m) => m.playerId)).size, 66);
  for (const m of made) { assert.ok(['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D'].includes(m.grade)); assert.ok(m.analysis.analysts.length >= 3); assert.ok(m.analysis.fan.approval >= 5); }
  const pk = [...world.draftPicks.values()].filter((p) => p.season === 2027);
  assert.ok(pk.every((p) => p.status === 'exercised' && p.prospectId));
  const undrafted = classOf(world, 2027).filter((p) => p.status === 'undrafted');
  assert.ok(undrafted.length > 0);
  assert.ok(undrafted.some((p) => world.players.get(p.playerId)?.teamId === null), 'undrafted com OVR >= 58 entra no mercado');
  // histórico derivado: picks exercidas ligam o prospecto ao jogador
  const first = made[0];
  assert.equal(world.prospects.get(first.prospectId).draft.pick, 1);
  assert.equal(first.teamId, 'LVJ');
  // próxima turma já existe
  assert.ok(classOf(world, 2028).length > 0);
  await closeAll();
});

test('Draft: trocar uma pick durante o Draft muda quem escolhe; pick de outro não pode ser usada pelo usuário', async () => {
  const world = await toOffseason();
  const { runLottery, startDraft, currentEntry, makePick, availableProspects, liveOrder } = await D();
  const { transferPick } = await import('../src/contracts/picks.js');
  runLottery(world);
  startDraft(world);
  const entry = currentEntry(world);
  const owner = world.draftPicks.get(entry.pickId).ownerTeamId;
  assert.notEqual(owner, 'BOS');
  assert.throws(() => makePick(world, { prospectId: availableProspects(world)[0].id, by: 'user' }), /pertence a/);
  transferPick(world, entry.pickId, 'BOS', { via: 'teste' });
  assert.equal(liveOrder(world)[0].ownerTeamId, 'BOS', 'a ordem reflete a troca imediatamente');
  const rec = makePick(world, { prospectId: availableProspects(world)[0].id, by: 'user' });
  assert.equal(rec.teamId, 'BOS');
  await closeAll();
});

test('scouting: ruído estável, proporcional a scoutingNoise e reduzido por treinos; verdade só no God Mode', async () => {
  const world = await newCareer();
  const { ensureDraft, classOf } = await D();
  const S = await import('../src/draft/scouting.js');
  ensureDraft(world);
  const p = classOf(world)[10];
  world.career.modifiers.scoutingNoise = 1;
  const a = S.scoutReport(world, p, S.SCOUTS[0]);
  assert.deepEqual(S.scoutReport(world, p, S.SCOUTS[0]), a, 'estável ao reabrir a tela');
  const sdHigh = S.noiseSd(world, p) ;
  world.career.modifiers.scoutingNoise = 0.6;
  assert.ok(S.noiseSd(world, p) < sdHigh);
  world.career.modifiers.scoutingNoise = 1;
  world.draft.workouts[p.id] = 3;
  assert.ok(S.noiseSd(world, p) < sdHigh * 0.5);
  world.draft.workouts[p.id] = 0;
  world.career.systems.scoutingFog = false;
  assert.equal(S.noiseSd(world, p), 0);
  world.career.systems.scoutingFog = true;
  assert.equal(S.scoutReport(world, p).exact, false);
  world.career.mode = 'commissioner'; world.career.godMode = true;
  assert.equal(S.scoutReport(world, p).exact, true);
  assert.equal(S.scoutReport(world, p).potential, p.potential);
  await closeAll();
});

test('prospectos: classes fictícias, determinísticas, nomes únicos, sem foto e coerentes com a posição', async () => {
  const world = await newCareer();
  const { generateProspectClass } = await import('../src/draft/prospects.js');
  const { positionOverall } = await import('../src/players/overall.js');
  const a = generateProspectClass({ draftYear: 2029, seed: 'x', size: 60 });
  const b = generateProspectClass({ draftYear: 2029, seed: 'x', size: 60 });
  assert.deepEqual(a.map((p) => p.name), b.map((p) => p.name));
  assert.equal(new Set(a.map((p) => p.name)).size, 60);
  for (const p of a) {
    assert.equal(p.fictional, true);
    assert.equal(p.photoSource, 'none');
    assert.equal(p.ovr, positionOverall(p.attributes, p.positions[0]));
    assert.ok(p.potential >= p.ovr && p.potential <= 99);
    assert.ok(p.age >= 19 && p.age <= 23);
  }
  assert.ok(a[0].potential > a[59].potential && a[0].ovr > a[59].ovr, 'melhores primeiro');
  const names = new Set([...world.players.values()].map((p) => p.name.toLowerCase()));
  assert.ok([...world.prospects.values()].every((p) => !names.has(p.name.toLowerCase())), 'nenhum prospecto fictício reaproveita nome de jogador do universo');
  await closeAll();
});
