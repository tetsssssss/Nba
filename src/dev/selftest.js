// Autoteste da camada de persistência, executado no navegador (IndexedDB real).
import { bulkWrite, count, deleteSaveDb, get, getAll, getAllByIndex, openSaveDb, pageByIndex, STORE_NAMES } from '../core/db.js';

export async function runDbSelfTest() {
  const id = `selftest-${Date.now().toString(36)}`;
  const results = [];
  const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail });
  let db;
  try {
    db = await openSaveDb(id);
    check('Banco criado com todas as stores', STORE_NAMES.every((s) => db.objectStoreNames.contains(s)), `${db.objectStoreNames.length} stores`);

    const players = Array.from({ length: 500 }, (_, i) => ({ id: i + 1, name: `Teste ${i + 1}`, teamId: i % 2 ? 'AAA' : 'BBB', attributes: { speed: i % 100 } }));
    const t0 = performance.now();
    await bulkWrite(db, { players, meta: [{ key: 'career', value: { managerName: 'Teste' } }] });
    check('Escrita em lote (500 jogadores)', (await count(db, 'players')) === 500, `${(performance.now() - t0).toFixed(0)} ms`);

    check('Leitura por chave', (await get(db, 'players', 42))?.name === 'Teste 42');
    check('Leitura por índice (teamId)', (await getAllByIndex(db, 'players', 'teamId', 'AAA')).length === 250);

    await bulkWrite(db, { players: [{ ...players[0], name: 'Alterado' }] }, { players: [2] });
    check('Atualização e remoção na mesma transação', (await get(db, 'players', 1)).name === 'Alterado' && (await get(db, 'players', 2)) === undefined && (await count(db, 'players')) === 499);

    await bulkWrite(db, { news: Array.from({ length: 30 }, (_, i) => ({ id: `n${i}`, date: `2026-10-${String(i + 1).padStart(2, '0')}`, title: `Notícia ${i}` })) });
    const page = await pageByIndex(db, 'news', 'date', { limit: 5, offset: 5 });
    check('Paginação por data (mais recentes primeiro)', page.length === 5 && page[0].date === '2026-10-25', page.map((n) => n.date.slice(8)).join(','));

    db.close();
    db = await openSaveDb(id);
    check('Dados persistem após reabrir', (await getAll(db, 'meta'))[0]?.value.managerName === 'Teste' && (await count(db, 'players')) === 499);
  } catch (err) {
    check('Execução sem exceções', false, err.message);
  } finally {
    db?.close();
    try {
      await deleteSaveDb(id);
      check('Banco de teste removido', true);
    } catch (err) {
      check('Banco de teste removido', false, err.message);
    }
  }
  return results;
}
