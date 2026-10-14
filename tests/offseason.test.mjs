import test from 'node:test';
import assert from 'node:assert/strict';
import { newCareer, closeAll } from './helpers/career.js';

async function playSeason(world) {
  const { simulateUntil } = await import('../src/season/season.js');
  await simulateUntil('finals', {});
  assert.equal(world.calendar.phase, 'offseason');
}
const O = () => import('../src/season/offseason.js');

function assertLeagueHealthy(world, { phase }) {
  const { rosterOf } = world.__helpers;
  for (const team of world.teams.values()) {
    const roster = rosterOf(world, team.id);
    const standard = roster.filter((p) => p.rosterStatus !== 'two-way');
    assert.ok(standard.length >= 13 && standard.length <= 21, `${team.id}: ${standard.length} jogadores (${phase})`);
  }
  for (const c of world.contracts.values()) {
    const p = world.players.get(c.playerId);
    if (p.teamId) assert.equal(c.teamId, p.teamId, `contrato de ${p.name} aponta para outro time`);
  }
  for (const p of world.players.values()) {
    if (p.teamId) assert.ok(world.teams.has(p.teamId));
    if (p.teamId) assert.ok(world.contracts.has(p.id), `${p.name} sem contrato`);
    if (p.retired) assert.equal(p.teamId, null);
  }
}

test('offseason: criada ao fim das finais, finais e premiações automáticas, aposentadorias na fila', async () => {
  const world = await newCareer();
  await playSeason(world);
  const { offseasonStatus } = await O();
  const status = offseasonStatus(world);
  assert.equal(status.steps.length, 11);
  assert.deepEqual(status.steps.slice(0, 2).map((s) => s.status), ['done', 'done']);
  assert.equal(status.current.id, 'retirements');
  assert.ok(world.offseason.awards.champion, 'campeão registrado');
  assert.ok(world.offseason.awards.scoring.value > 10);
  assert.ok([...world.finances.values()].filter((f) => f.season === 2027).length === 32, 'contas de 2027 fechadas para as 32 franquias');
  // estatísticas arquivadas na carreira do jogador
  const anyStat = [...world.seasonStats.values()][0];
  assert.ok(world.careerStats.get(anyStat.playerId).rows.some((r) => r[0] === 2027));
  await closeAll();
});

test('aposentadorias: plausíveis, determinísticas, preservam histórico e tiram o contrato da folha', async () => {
  const world = await newCareer();
  await playSeason(world);
  const { retirementOutlook, decideRetirements, retirePlayer, unretirePlayer } = await import('../src/players/retirement.js');
  const a = decideRetirements(world, 2027);
  const b = decideRetirements(world, 2027);
  assert.deepEqual(a.map((x) => [x.playerId, x.retires]), b.map((x) => [x.playerId, x.retires]));
  const retiring = a.filter((x) => x.retires);
  assert.ok(retiring.length >= 1 && retiring.length <= 40, `${retiring.length} aposentadorias`);
  const ages = retiring.map((x) => x.age);
  assert.ok(Math.min(...ages) >= 32, 'ninguém se aposenta cedo demais');
  // um jovem astro nunca se aposenta
  const star = [...world.players.values()].find((p) => p.ovr >= 90 && world.players.get(p.id).birthDate.slice(0, 4) > '1998');
  if (star) assert.ok(retirementOutlook(world, star).probability < 0.01);
  // idade pesa: 40 anos tem muito mais chance que 33
  const old = [...world.players.values()].sort((x, y) => x.birthDate.localeCompare(y.birthDate))[0];
  assert.ok(retirementOutlook(world, old).probability > 0.2);
  // aplicar: sai do elenco, mantém registro e estatísticas; contrato fora da folha
  const target = retiring[0];
  const player = world.players.get(target.playerId);
  const teamBefore = player.teamId;
  const { payrollOf } = await import('../src/core/world.js');
  const payBefore = teamBefore ? payrollOf(teamBefore).total : 0;
  retirePlayer(world, target.playerId, { season: 2027, reason: 'teste' });
  assert.equal(player.teamId, null);
  assert.equal(player.retired.season, 2027);
  assert.ok(world.players.has(target.playerId), 'registro histórico preservado');
  if (teamBefore) assert.ok(payrollOf(teamBefore).total <= payBefore);
  assert.equal(world.contracts.get(target.playerId).status, 'retired');
  assert.ok(world.teams.get(teamBefore)?.retiredPlayers?.some((r) => r.playerId === target.playerId) || !teamBefore);
  assert.equal(retirePlayer(world, target.playerId), null, 'idempotente');
  assert.equal(unretirePlayer(world, target.playerId), true);
  await closeAll();
});

test('offseason completa: draft, aposentadorias, free agency, ajuste de elenco, desenvolvimento e nova temporada', async () => {
  const world = await newCareer();
  await playSeason(world);
  const { autoCompleteOffseason } = await O();
  const { beginNextSeason } = await import('../src/season/season.js');
  const { rosterOf } = await import('../src/gm/team-context.js');
  world.__helpers = { rosterOf };
  const capBefore = world.league.cap.salaryCap;
  const ovrBefore = new Map([...world.players.values()].map((p) => [p.id, p.ovr]));
  autoCompleteOffseason(world);
  assert.ok(world.offseason.steps.every((s) => s.status === 'done'), JSON.stringify(world.offseason.steps.map((s) => [s.id, s.status])));
  assert.equal(world.draft.status, 'complete');
  assert.equal(world.draft.picks.length, 66);
  assert.ok(world.offseason.retirements.applied);
  assert.ok(world.career.lifecycleEvents.includes('development:2027'));
  assert.ok(world.league.cap.salaryCap > capBefore, 'cap projetado cresce');
  assert.equal(world.league.cap.projected, true);
  assert.equal(world.league.cap.history[0].salaryCap, capBefore, 'valores oficiais de 2026-27 preservados no histórico');
  const retired = [...world.players.values()].filter((p) => p.retired);
  assert.ok(retired.length > 0);
  assert.equal(beginNextSeason(), true);
  assert.equal(world.calendar.season, 2028);
  assert.equal(world.calendar.phase, 'preseason');
  assert.equal(world.offseason, null);
  assertLeagueHealthy(world, { phase: 'preseason 2028' });
  // draftees entraram como jogadores de verdade
  assert.ok([...world.players.values()].filter((p) => p.draft?.year === 2027 && p.fictional).length >= 60);
  // desenvolvimento aplicado uma vez: algum Overall mudou e a idade deixou de ser a do seed
  const changed = [...world.players.values()].filter((p) => ovrBefore.has(p.id) && ovrBefore.get(p.id) !== p.ovr).length;
  assert.ok(changed > 50, `${changed} jogadores evoluíram/regrediram`);
  // picks: horizonte de 7 Drafts (2028-2034) e nenhuma pick de 2027 aberta
  const seasons = new Set([...world.draftPicks.values()].filter((p) => p.status !== 'exercised').map((p) => p.season));
  assert.deepEqual([...seasons].sort(), [2028, 2029, 2030, 2031, 2032, 2033, 2034]);
  // calendário de 2028 gerado
  const { seasonGames } = await import('../src/season/season.js');
  assert.equal(seasonGames().length, 32 * 82 / 2);
  await closeAll();
});

test('offseason: desenvolvimento é idempotente (recarregar não faz crescer de novo)', async () => {
  const world = await newCareer();
  await playSeason(world);
  const { applyOffseasonDevelopment } = await import('../src/players/offseason-integration.js');
  const first = applyOffseasonDevelopment(world, 2027);
  assert.equal(first.applied, true);
  const snap = JSON.stringify([...world.players.values()].map((p) => [p.id, p.ovr, p.attributes.speed]));
  const second = applyOffseasonDevelopment(world, 2027);
  assert.equal(second.applied, false);
  assert.equal(JSON.stringify([...world.players.values()].map((p) => [p.id, p.ovr, p.attributes.speed])), snap);
  await closeAll();
});

test('offseason: requisitos obrigatórios bloqueiam o avanço; persistência mantém a fase', async () => {
  const world = await newCareer();
  await playSeason(world);
  const { completeStep, offseasonStatus } = await O();
  const { saveWorld } = await import('../src/core/world.js');
  const { openCareer, closeCareer } = await import('../src/core/saves.js');
  completeStep(world, 'retirements');
  completeStep(world, 'lottery');
  assert.ok(world.draft.lottery);
  completeStep(world, 'scouting');
  assert.throws(() => completeStep(world, 'draft'), /Draft/);
  assert.throws(() => completeStep(world, 'contracts'), /fase ativa/);
  await saveWorld();
  const id = world.saveId;
  await closeCareer();
  const again = await openCareer(id);
  const status = offseasonStatus(again);
  assert.equal(status.current.id, 'draft');
  assert.equal(again.draft.lottery.drawn.length, 4);
  assert.ok(status.progress > 0.4 && status.progress < 0.6);
  await closeAll();
});

test('offseason: roster do usuário precisa estar válido para avançar', async () => {
  const world = await newCareer();
  await playSeason(world);
  const O2 = await O();
  const { autoCompleteOffseason, requirements } = O2;
  // leva até a fase de elenco
  const off = world.offseason;
  const { runLottery, simAll, startDraft } = await import('../src/draft/draft-engine.js');
  O2.completeStep(world, 'retirements'); O2.completeStep(world, 'lottery'); O2.completeStep(world, 'scouting');
  startDraft(world); simAll(world); O2.completeStep(world, 'draft');
  // a team option do usuário é pendência obrigatória: sem decidir, a fase não avança
  const { pendingOptions } = await import('../src/contracts/contracts-engine.js');
  const mine = pendingOptions(world, 2028).filter((o) => o.teamId === 'BOS' && o.kind === 'team');
  if (mine.length) {
    assert.throws(() => O2.completeStep(world, 'contracts'), /Team option/);
    for (const o of mine) O2.decideUserOption(world, o.playerId, true);
  }
  O2.completeStep(world, 'contracts');
  O2.completeStep(world, 'free-agency');
  O2.completeStep(world, 'renewals');
  assert.equal(off.current, 'roster');
  const issues = requirements(world, 'roster');
  // com novatos 'camp' e elenco irregular o usuário precisa agir (ou o elenco já estava ok)
  if (issues.length) assert.throws(() => O2.completeStep(world, 'roster'));
  const { aiRosterAdjust } = await import('../src/gm/ai-offseason.js');
  aiRosterAdjust(world, world.career.teamId, { minimum: 14 });
  assert.equal(requirements(world, 'roster').length, 0);
  O2.completeStep(world, 'roster');
  assert.equal(off.current, 'next-season');
  await closeAll();
});

test('duas offseasons seguidas (2027 → 2028 → 2029) mantêm a liga íntegra', async () => {
  const world = await newCareer();
  const { rosterOf } = await import('../src/gm/team-context.js');
  world.__helpers = { rosterOf };
  const { beginNextSeason } = await import('../src/season/season.js');
  const { autoCompleteOffseason } = await O();
  for (let year = 0; year < 2; year++) {
    await playSeason(world);
    autoCompleteOffseason(world);
    assert.equal(beginNextSeason(), true);
    assertLeagueHealthy(world, { phase: `preseason ${world.calendar.season}` });
  }
  assert.equal(world.calendar.season, 2029);
  assert.equal(world.draft.season, 2028);
  assert.equal(world.draft.picks.length, 64);
  const rookies2028 = [...world.players.values()].filter((p) => p.draft?.year === 2028 && p.fictional);
  assert.ok(rookies2028.length >= 60);
  assert.equal(new Set([...world.players.keys()]).size, world.players.size);
  await closeAll();
});
