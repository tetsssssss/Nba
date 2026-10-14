// Baseline de regressão: comportamento do código de 14/10/2026 ANTES do prompt mestre
// (Trade Machine, Draft, Finanças, Offseason, God Mode). Estes testes devem continuar verdes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newCareer, closeAll } from './helpers/career.js';

test('baseline: universo de 32 franquias, calendário de 82 jogos e persistência', async () => {
  const world = await newCareer();
  assert.equal(world.teams.size, 32);
  assert.equal(world.calendar.season, 2027);
  assert.equal(world.calendar.phase, 'preseason');
  const { seasonGames } = await import('../src/season/season.js');
  const games = seasonGames();
  assert.equal(games.length, 32 * 82 / 2);
  for (const team of world.teams.values()) assert.equal(games.filter((g) => g.home === team.id || g.away === team.id).length, 82, team.id);
  await closeAll();
});

test('baseline: Expansion Draft, temporada completa, playoffs e virada de temporada simplificada', async () => {
  const world = await newCareer();
  const { simulateUntil, runExpansionDraft, beginNextSeason, seasonOver } = await import('../src/season/season.js');
  const { saveWorld, teamRoster } = await import('../src/core/world.js');
  assert.equal(teamRoster('SEA').length, 0);
  await simulateUntil('finals', {});
  assert.ok(seasonOver(), 'temporada deve terminar na offseason');
  assert.equal(world.calendar.phase, 'offseason');
  assert.ok(world.calendar.postseason.champion, 'campeão definido');
  assert.equal(world.career.completedSeasons.length, 1);
  assert.ok(world.career.expansionDraft.picks.length > 0);
  for (const team of world.teams.values()) assert.ok(teamRoster(team.id).length >= 8, `${team.id} com elenco`);
  const rosterBefore = new Map([...world.players.values()].map((p) => [p.id, p.teamId]));
  assert.equal(runExpansionDraft(), null, 'Expansion Draft é idempotente');
  assert.throws(() => beginNextSeason(), /offseason/, 'agora a virada normal exige a offseason');
  assert.equal(beginNextSeason({ simplified: true }), true);
  assert.equal(world.calendar.season, 2028);
  assert.equal(world.calendar.phase, 'preseason');
  for (const p of world.players.values()) assert.equal(p.teamId, rosterBefore.get(p.id), 'virada simplificada preserva elencos');
  await saveWorld();
  await closeAll();
});

test('baseline: trade 1x1 e persistência após reabrir a carreira', async () => {
  const world = await newCareer();
  const { evaluateTrade, executeTrade } = await import('../src/contracts/market.js');
  const { teamRoster, saveWorld } = await import('../src/core/world.js');
  const { simulateUntil } = await import('../src/season/season.js');
  await simulateUntil('week', {}); // roda o Expansion Draft
  const a = teamRoster('BOS').find((p) => p.rosterStatus === 'standard' && p.ovr < 72);
  const b = teamRoster('MIA').find((p) => p.rosterStatus === 'standard' && Math.abs(p.ovr - a.ovr) <= 1);
  const verdict = evaluateTrade(world, { fromTeamId: 'BOS', toTeamId: 'MIA', sendId: a.id, receiveId: b.id });
  assert.equal(typeof verdict.ok, 'boolean');
  if (verdict.ok) {
    executeTrade({ fromTeamId: 'BOS', toTeamId: 'MIA', sendId: a.id, receiveId: b.id });
    assert.equal(world.players.get(a.id).teamId, 'MIA');
  }
  await saveWorld();
  const { openCareer, closeCareer } = await import('../src/core/saves.js');
  const id = world.saveId;
  await closeCareer();
  const again = await openCareer(id);
  assert.equal(again.teams.size, 32);
  assert.equal(again.players.get(a.id).teamId, verdict.ok ? 'MIA' : 'BOS');
  await closeAll();
});
