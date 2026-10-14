import test from 'node:test';
import assert from 'node:assert/strict';
import { newCareer, closeAll } from './helpers/career.js';

test('auditoria do universo: integridade com picks, Draft, agentes livres e aposentados', async () => {
  const world = await newCareer();
  const { auditWorld } = await import('../src/dev/audit.js');
  const { simulateUntil } = await import('../src/season/season.js');
  const check = () => auditWorld(world).filter((c) => !c.ok && c.level === 'error');
  assert.deepEqual(check().map((c) => c.name), []);
  await simulateUntil('finals', {});
  const O = await import('../src/season/offseason.js');
  O.autoCompleteOffseason(world);
  assert.deepEqual(check().map((c) => `${c.name}: ${c.detail}`), []);
  await closeAll();
});

test('backup: exporta e importa picks, prospectos e documentos de gestão; rejeita corrupção', async () => {
  const world = await newCareer();
  const S = await import('../src/core/saves.js');
  const { transferPick } = await import('../src/contracts/picks.js');
  const { saveWorld } = await import('../src/core/world.js');
  transferPick(world, '2028-R1-BOS', 'MIA', { via: 'teste' });
  world.market.prefs.futurePickYearsAhead = 2;
  await saveWorld();
  const backup = await S.exportCareer(world.saveId);
  assert.ok(backup.stores.draftPicks.length >= 450 && backup.stores.prospects.length >= 290);
  assert.ok(backup.stores.meta.some((m) => m.key === 'market'));
  assert.equal(S.checkBackup(backup).ok, true);
  const imported = await S.importCareer(backup);
  const again = await S.openCareer(imported.id);
  assert.equal(again.draftPicks.get('2028-R1-BOS').ownerTeamId, 'MIA');
  assert.equal(again.market.prefs.futurePickYearsAhead, 2);
  const broken = structuredClone(backup);
  broken.stores.draftPicks.push({ ...broken.stores.draftPicks[0] });
  assert.match(S.checkBackup(broken).errors.join(' '), /Picks de Draft/);
  const broken2 = structuredClone(backup);
  broken2.stores.draftPicks[3].ownerTeamId = 'XXX';
  assert.match(S.checkBackup(broken2).errors.join(' '), /franquias que não existem/);
  const broken3 = structuredClone(backup);
  const s27 = broken3.stores.draftPicks.filter((k) => k.season === 2027 && k.number == null);
  s27[0].number = 7; s27[1].number = 7;
  assert.match(S.checkBackup(broken3).errors.join(' '), /mesma posição/);
  // backup antigo (sem as stores novas) continua válido e é preenchido ao abrir
  const old = structuredClone(backup);
  delete old.stores.draftPicks; delete old.stores.prospects; old.stores.meta = old.stores.meta.filter((m) => !['market', 'draft', 'offseason'].includes(m.key));
  assert.equal(S.checkBackup(old).ok, true);
  const legacy = await S.importCareer(old);
  const reopened = await S.openCareer(legacy.id);
  assert.ok(reopened.draftPicks.size >= 450, 'picks criadas na primeira abertura');
  assert.equal(reopened.draftPicks.get('2028-R1-BOS').ownerTeamId, 'BOS');
  assert.ok(reopened.market);
  await closeAll();
});

test('save antigo no meio da offseason (sem documento offseason) é migrado ao abrir', async () => {
  const world = await newCareer();
  const { simulateUntil } = await import('../src/season/season.js');
  await simulateUntil('finals', {});
  const { saveWorld } = await import('../src/core/world.js');
  world.offseason = null; // simula save criado antes deste pacote
  world.draft = null;
  const { markDirty } = await import('../src/core/world.js');
  markDirty('meta', 'offseason'); markDirty('meta', 'draft');
  await saveWorld();
  const S = await import('../src/core/saves.js');
  const id = world.saveId;
  await S.closeCareer();
  const again = await S.openCareer(id);
  const O = await import('../src/season/offseason.js');
  const status = O.offseasonStatus(again);
  assert.equal(status.steps[0].status, 'done');
  assert.equal(status.current.id, 'retirements');
  assert.equal(again.calendar.phase, 'offseason');
  await closeAll();
});
