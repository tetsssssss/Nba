import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostseason, progressPostseason } from '../src/season/postseason.js';
import { commitSaveSnapshot } from '../src/core/save-snapshot.js';

const conferences = Object.fromEntries(['East', 'West'].map((c) => [c,
  Array.from({ length: 16 }, (_, i) => ({ id: `${c}${i + 1}`, seed: i + 1, w: 65 - i, l: 17 + i }))]));
const chooseWinner = (g) => g.home < g.away ? g.home : g.away;

test('Play-in: usa seeds 7–10, protege as seis vagas diretas e classifica oito por conferência', () => {
  const { post, games } = createPostseason(conferences, 2027, '2027-04-28');
  assert.equal(games.length, 4);
  assert.deepEqual(new Set(games.filter((g) => g.home === 'East7' || g.home === 'West7').map((g) => g.away)), new Set(['East8', 'West8']));
  assert.equal(post.stage, 'playin-first');
  assert.deepEqual(post.seedOrder.East.slice(0, 6), ['East1','East2','East3','East4','East5','East6']);
});

test('Playoffs: campeão e vice após séries melhor de sete, com mando 2-2-1-1-1 e sem jogos duplicados', () => {
  const { post, games } = createPostseason(conferences, 2027, '2027-04-28');
  let steps = 0;
  let firstRoundSeen = false;
  const seen = new Set(games.map((g) => g.id));
  while (post.stage !== 'complete' && steps++ < 170) {
    const active = games.filter((g) => g.status === 'scheduled').sort((a,b) => a.date.localeCompare(b.date));
    assert.ok(active.length, `Sem partidas na fase ${post.stage}`);
    const today = active[0].date;
    for (const g of active.filter((g) => g.date === today)) {
      g.status = 'final';
      g.score = chooseWinner(g) === g.home ? [103, 95] : [95, 103];
    }
    const additions = progressPostseason(post, games, today);
    for (const g of additions) {
      assert.ok(!seen.has(g.id), `Confronto duplicado: ${g.id}`);
      seen.add(g.id);
      games.push(g);
    }
    if (post.stage === 'first-round' && !firstRoundSeen) {
      firstRoundSeen = true;
      assert.equal(post.rounds[0].series.length, 8);
      assert.deepEqual(post.qualified.East.slice(0, 6), post.seedOrder.East.slice(0, 6));
    }
  }
  assert.ok(firstRoundSeen);
  assert.ok(steps < 170);
  assert.ok(post.champion && post.runnerUp && post.champion !== post.runnerUp);
  assert.equal(post.rounds.length, 4);
  assert.equal(post.rounds.at(-1).series[0].winner, post.champion);
  assert.ok(post.rounds.flatMap((r) => r.series).every((s) => s.winner && s.wins.some((w) => w === 4)));
  for (const s of post.rounds.flatMap((r) => r.series)) {
    const g = s.games.map((id) => games.find((x) => x.id === id));
    assert.equal(g[0].home, s.teams[0]);
    if (g.length > 1) assert.equal(g[1].home, s.teams[0]);
    if (g.length > 2) assert.equal(g[2].home, s.teams[1]);
    if (g.length > 3) assert.equal(g[3].home, s.teams[1]);
    assert.ok(g.length <= 7);
  }
  assert.deepEqual(progressPostseason(post, games, games.at(-1).date), []);
});

function mockWorld() {
  return {
    db: {}, teams: new Map([['A', { id:'A', record:{wins:1, losses:0} }]]), players:new Map(), contracts:new Map(), coaches:new Map(), owners:new Map(), arenas:new Map(), games:new Map(), seasonStats:new Map(),
    career:{ teamId:'A' }, calendar:{ date:'2027-05-01', season:2027 }, league:{}, history:{},
    dirty:{teams:new Set(['A']),players:new Set(),contracts:new Set(),coaches:new Set(),owners:new Set(),arenas:new Set(),meta:new Set(),games:new Set(),seasonStats:new Set()},
    pending:{news:[{id:'n1'}],transactions:[],games:[],boxScores:[]},
  };
}

test('Save: erro de IndexedDB preserva dirty/pending para retry', async () => {
  const w = mockWorld();
  await assert.rejects(commitSaveSnapshot(w, {
    write: async () => { throw new Error('QuotaExceeded'); },
    updateSummary: async () => {}, summarizeWorld:() => ({}),
  }), /QuotaExceeded/);
  assert.ok(w.dirty.teams.has('A'));
  assert.equal(w.pending.news.length, 1);
  let rows;
  await commitSaveSnapshot(w, { write:async (_, data) => { rows = data; }, updateSummary:async()=>{},summarizeWorld:()=>({}) });
  assert.equal(rows.teams[0].id, 'A');
  assert.equal(rows.news[0].id, 'n1');
  assert.equal(w.dirty.teams.size, 0);
  assert.equal(w.pending.news.length, 0);
});

test('Save: alterações feitas durante transação ficam para a próxima gravação', async () => {
  const w = mockWorld();
  let release;
  const barrier = new Promise((resolve) => { release=resolve; });
  const first = commitSaveSnapshot(w, {write:async()=>{await barrier;},updateSummary:async()=>{},summarizeWorld:()=>({})});
  w.dirty.meta.add('calendar');
  w.pending.news.push({id:'n2'});
  release();
  await first;
  assert.ok(w.dirty.meta.has('calendar'));
  assert.deepEqual(w.pending.news.map((n)=>n.id),['n2']);
});

test('Save: resumo com falha não perde a flag e pode ser sincronizado no retry', async () => {
  const w = mockWorld();
  await assert.rejects(commitSaveSnapshot(w, {write:async()=>{}, updateSummary:async()=>{throw Error('índice indisponível');}, summarizeWorld:()=>({})}), /índice indisponível/);
  assert.ok(w.summaryNeedsSync);
  await commitSaveSnapshot(w, {write:async()=>{}, updateSummary:async()=>{}, summarizeWorld:()=>({})});
  assert.equal(w.summaryNeedsSync, false);
});

test('Uma segunda temporada gera outro calendário de 82 jogos sem sobrescrever a anterior', async () => {
  const { createRng } = await import('../src/core/rng.js');
  const { generateSchedule } = await import('../src/season/schedule.js');
  const { buildTeams } = await import('../src/core/universe.js');
  const { loadSeedSync } = await import('../tools/sim-season.mjs');
  const teams = buildTeams(loadSeedSync());
  const make = (year, start, breaks) => generateSchedule(teams, { season: year, start, days: 174, breaks:[breaks], rng:createRng(`career:calendario:${year}`) });
  const first = make(2027,'2026-10-20',['2027-02-12','2027-02-17']);
  const second = make(2028,'2027-10-20',['2028-02-12','2028-02-17']);
  assert.equal(first.length,1312);
  assert.equal(second.length,1312);
  assert.ok(first.every((g)=>g.season===2027));
  assert.ok(second.every((g)=>g.season===2028));
  assert.equal(new Set([...first,...second].map((g)=>g.id)).size,2624);
  for (const t of teams) assert.equal(second.filter((g)=>g.home===t.id).length,41);
});
