import test from 'node:test';
import assert from 'node:assert/strict';
import { newCareer, closeAll } from './helpers/career.js';

test('picks: 7 Drafts de registros, IDs estáveis e sem duplicatas; Draft 2026 não é recriado', async () => {
  const world = await newCareer();
  const { picksOfSeason, pickId } = await import('../src/contracts/picks.js');
  assert.equal(world.draftPicks.size, [2027, 2028, 2029, 2030, 2031, 2032, 2033].reduce((n, y) => n + picksOfSeason(world, y).length, 0));
  assert.equal(picksOfSeason(world, 2026).length, 0, 'Draft 2026 pertence ao histórico');
  assert.equal(new Set([...world.draftPicks.keys()]).size, world.draftPicks.size);
  for (const team of world.teams.values()) {
    assert.ok(world.draftPicks.has(pickId(2028, 1, team.id)));
    assert.ok(world.draftPicks.has(pickId(2028, 2, team.id)));
  }
  assert.equal(picksOfSeason(world, 2028).length, 64);
  await closeAll();
});

test('picks: picks reservadas do Draft 2027 (LVJ #1/#10, SEA #4/#5) sem duplicar nenhuma franquia', async () => {
  const world = await newCareer();
  const { picksOfSeason } = await import('../src/contracts/picks.js');
  const first = picksOfSeason(world, 2027).filter((p) => p.round === 1);
  assert.equal(first.length, 34, '32 picks naturais + 2 extras de expansão');
  const reserved = first.filter((p) => p.slotLocked).map((p) => [p.originalTeamId, p.number]).sort();
  assert.deepEqual(reserved, [['LVJ', 1], ['LVJ', 10], ['SEA', 4], ['SEA', 5]]);
  for (const team of world.teams.values()) {
    const own = first.filter((p) => p.originalTeamId === team.id);
    assert.equal(own.length, ['LVJ', 'SEA'].includes(team.id) ? 2 : 1, team.id);
  }
  assert.equal(picksOfSeason(world, 2027).filter((p) => p.round === 2).length, 32);
  assert.equal(picksOfSeason(world, 2028).filter((p) => p.slotLocked).length, 0, 'reservas valem só para o Draft inicial');
  assert.equal(world.league.expansion.initialDraftPicks.LVJ.join(), '1,10', 'configuração do usuário preservada');
  await closeAll();
});

test('picks: transferência mantém um único dono e histórico completo', async () => {
  const world = await newCareer();
  const { transferPick, ownsPick, pickId } = await import('../src/contracts/picks.js');
  const id = pickId(2028, 1, 'BOS');
  assert.ok(ownsPick(world, 'BOS', id));
  transferPick(world, id, 'DAL', { via: 'trade-x' });
  assert.ok(!ownsPick(world, 'BOS', id));
  assert.ok(ownsPick(world, 'DAL', id));
  const pick = world.draftPicks.get(id);
  assert.equal(pick.status, 'negotiated');
  assert.equal(pick.transfers.length, 1);
  transferPick(world, id, 'BOS', { via: 'trade-y' });
  assert.equal(pick.status, 'available');
  assert.equal(pick.transfers.length, 2);
  assert.throws(() => transferPick(world, 'inexistente', 'DAL'));
  await closeAll();
});

test('picks: proteção top N converte quando cai dentro e transfere quando cai fora', async () => {
  const world = await newCareer();
  const { transferPick, resolveConveyance, pickId } = await import('../src/contracts/picks.js');
  // BOS deve a pick 2028 a DAL, protegida top 5, rola para 2029
  const id = pickId(2028, 1, 'BOS');
  transferPick(world, id, 'DAL', { protection: { top: 5, fallback: 'rollover', endSeason: 2029 } });
  world.draftPicks.get(id).number = 3; // caiu dentro da proteção
  const effects = resolveConveyance(world, 2028);
  const pick = world.draftPicks.get(id);
  assert.equal(pick.ownerTeamId, 'BOS', 'não transfere');
  assert.equal(pick.status, 'converted');
  const next = world.draftPicks.get(pickId(2029, 1, 'BOS'));
  assert.equal(next.ownerTeamId, 'DAL', 'obrigação rola para o ano seguinte');
  assert.equal(effects[0].outcome, 'protected');
  assert.deepEqual(resolveConveyance(world, 2028), [], 'idempotente');

  const id2 = pickId(2028, 1, 'MIA');
  transferPick(world, id2, 'DAL', { protection: { top: 5, fallback: 'second-round', endSeason: 2028 } });
  world.draftPicks.get(id2).number = 9;
  resolveConveyance(world, 2028);
  assert.equal(world.draftPicks.get(id2).ownerTeamId, 'DAL', 'caiu fora da proteção: conveyed');
  assert.equal(world.draftPicks.get(id2).conversion.type, 'conveyed');
  await closeAll();
});

test('picks: swap rights dão a melhor das duas escolhas ao titular do direito', async () => {
  const world = await newCareer();
  const { transferPick, addSwapRight, resolveConveyance, pickId } = await import('../src/contracts/picks.js');
  const a = pickId(2028, 1, 'DAL'); // pick que DAL cede a BOS com direito de swap
  const b = pickId(2028, 1, 'BOS');
  transferPick(world, a, 'MIA');
  addSwapRight(world, a, { holderTeamId: 'BOS', withPickId: b });
  world.draftPicks.get(a).number = 4;
  world.draftPicks.get(b).number = 12; // a do BOS é pior: o swap é exercido
  const effects = resolveConveyance(world, 2028);
  assert.equal(effects.at(-1).outcome, 'exercised');
  assert.equal(world.draftPicks.get(a).ownerTeamId, 'BOS');
  assert.equal(world.draftPicks.get(b).ownerTeamId, 'MIA');
  await closeAll();
});

test('picks: persistem e sobrevivem a reabrir a carreira (sem recriar)', async () => {
  const world = await newCareer();
  const { transferPick, pickId } = await import('../src/contracts/picks.js');
  const { saveWorld } = await import('../src/core/world.js');
  const { openCareer, closeCareer } = await import('../src/core/saves.js');
  transferPick(world, pickId(2029, 1, 'LAL'), 'NYK', { via: 'teste' });
  await saveWorld();
  const id = world.saveId;
  const size = world.draftPicks.size;
  await closeCareer();
  const again = await openCareer(id);
  assert.equal(again.draftPicks.size, size);
  assert.equal(again.draftPicks.get(pickId(2029, 1, 'LAL')).ownerTeamId, 'NYK');
  await closeAll();
});
