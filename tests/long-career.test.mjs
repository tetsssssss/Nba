// Cenário E: carreira longa. Cinco temporadas completas (simulação, offseason, Draft, mercado) com recarga do save no meio,
// conferindo que não surgem jogadores duplicados, contratos órfãos, picks de dois donos ou aposentadorias repetidas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newCareer, closeAll } from './helpers/career.js';

function integrity(world, label) {
  const rosters = new Map();
  for (const p of world.players.values()) {
    assert.equal(world.players.get(p.id), p, `${label}: id duplicado ${p.id}`);
    if (p.teamId) {
      assert.ok(world.teams.has(p.teamId), `${label}: ${p.name} em time inexistente`);
      assert.ok(!p.retired, `${label}: aposentado ${p.name} ainda em elenco`);
      assert.ok(world.contracts.has(p.id), `${label}: ${p.name} sem contrato`);
      assert.equal(world.contracts.get(p.id).teamId, p.teamId, `${label}: contrato de ${p.name} em outro time`);
      rosters.set(p.teamId, (rosters.get(p.teamId) ?? 0) + 1);
    }
  }
  for (const c of world.contracts.values()) {
    const p = world.players.get(c.playerId);
    assert.ok(p, `${label}: contrato órfão ${c.playerId}`);
    if (p.retired) assert.equal(c.teamId ?? null, null, `${label}: aposentado ${p.name} com contrato em time`);
  }
  for (const team of world.teams.keys()) assert.ok((rosters.get(team) ?? 0) >= 13, `${label}: ${team} com ${rosters.get(team)} jogadores`);
  const keys = new Set();
  for (const pick of world.draftPicks.values()) {
    const key = `${pick.season}-${pick.round}-${pick.originalTeamId}-${pick.id}`;
    assert.ok(!keys.has(key), `${label}: pick duplicada ${pick.id}`);
    keys.add(key);
    assert.ok(world.teams.has(pick.ownerTeamId), `${label}: pick ${pick.id} sem dono válido`);
  }
  const used = new Map();
  for (const pr of world.prospects.values()) {
    if (pr.status !== 'drafted') continue;
    assert.ok(!used.has(pr.id), `${label}: prospecto repetido`);
    used.set(pr.id, true);
  }
  const drafted = [...world.draftPicks.values()].filter((p) => p.prospectId);
  assert.equal(new Set(drafted.map((p) => p.prospectId)).size, drafted.length, `${label}: prospecto escolhido duas vezes`);
}

test('carreira longa: cinco temporadas, cinco Drafts, recarga no meio e nenhuma corrupção', async () => {
  let world = await newCareer({ teamId: 'BOS' });
  const { simulateUntil, beginNextSeason } = await import('../src/season/season.js');
  const { autoCompleteOffseason } = await import('../src/season/offseason.js');
  const { loadWorld, getWorld } = await import('../src/core/world.js');
  const retiredSeen = new Set();
  const seasonsPlayed = [];
  for (let year = 0; year < 5; year++) {
    seasonsPlayed.push(world.calendar.season);
    await simulateUntil('finals', {});
    assert.equal(world.calendar.phase, 'offseason');
    // negocia uma pick futura do usuário na própria offseason (propriedade tem de permanecer única)
    const mine = [...world.draftPicks.values()].find((p) => p.ownerTeamId === 'BOS' && p.originalTeamId === 'BOS' && p.round === 2 && p.status === 'available' && p.season > world.calendar.season);
    if (mine) { const { transferPick } = await import('../src/contracts/picks.js'); transferPick(world, mine.id, 'MEM', { by: 'test' }); }
    autoCompleteOffseason(world);
    for (const p of world.players.values()) if (p.retired) {
      if (!retiredSeen.has(p.id)) retiredSeen.add(p.id);
    }
    assert.equal(beginNextSeason(), true);
    world = getWorld();
    integrity(world, `após offseason ${seasonsPlayed.at(-1)}`);
    if (year === 2) { // recarga no meio da carreira
      const saveId = world.saveId;
      const { saveWorld } = await import('../src/core/world.js');
      await saveWorld();
      world = await loadWorld(saveId);
      integrity(world, 'após recarga');
    }
  }
  assert.deepEqual(seasonsPlayed, [2027, 2028, 2029, 2030, 2031]);
  assert.equal(world.calendar.season, 2032);
  assert.deepEqual(Object.keys(world.career.draftLog).map(Number).sort(), [2027, 2028, 2029, 2030, 2031], 'cinco Drafts arquivados');
  for (const season of Object.keys(world.career.draftLog)) assert.equal(world.career.draftLog[season].length, season === '2027' ? 66 : 64, `Draft ${season} completo`);
  assert.ok(retiredSeen.size >= 20, `${retiredSeen.size} aposentadorias ao longo de cinco anos`);
  assert.ok([...world.draftPicks.values()].some((p) => p.ownerTeamId === 'MEM' && p.originalTeamId === 'BOS'), 'pick negociada continua com o novo dono');
  await closeAll();
});
