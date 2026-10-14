// Calibração da temporada: gera o calendário, faz o Expansion Draft automático e simula os 1.312 jogos
// no modelo rápido, imprimindo médias por time e a classificação. Uso: node tools/sim-season.mjs [semente]
import { readFileSync } from 'node:fs';
import { createRng } from '../src/core/rng.js';
import { buildPlayers, buildTeams } from '../src/core/universe.js';
import { generateSchedule } from '../src/season/schedule.js';
import { simulateQuickGame } from '../src/season/quick-game.js';
import { computeStandings } from '../src/season/standings.js';
import { planExpansionDraft } from '../src/season/expansion.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
export function loadSeedSync() {
  return { teams: read('data/seed/teams.json'), players: read('data/seed/players.json'), ratings: read('data/seed/ratings.json'), contracts: read('data/seed/contracts.json'), franchises: read('data/static/franchises.json'), history: read('data/seed/history.json'), league: read('data/static/league.json') };
}

if (process.argv[1]?.endsWith('sim-season.mjs')) {
  const seed = loadSeedSync();
  const teams = buildTeams(seed);
  const players = buildPlayers(seed);
  const rng = createRng(process.argv[2] ?? 'temporada');
  const cal = seed.league.calendar;
  const plan = planExpansionDraft(players, { existing: teams.filter((t) => !t.expansion).map((t) => t.id), expansion: teams.filter((t) => t.expansion).map((t) => t.id), date: cal.regularSeasonStart, rng });
  const byId = new Map(players.map((p) => [p.id, p]));
  for (const pk of plan.picks) byId.get(pk.playerId).teamId = pk.teamId;
  const rosterOf = (id) => players.filter((p) => p.teamId === id).sort((a, b) => b.ovr - a.ovr);
  const t0 = Date.now();
  const schedule = generateSchedule(teams, { season: 2027, start: cal.regularSeasonStart, days: cal.regularSeasonDays, breaks: [cal.allStarBreak], rng });
  const tGen = Date.now() - t0;
  const sum = {};
  let top = { pts: 0 };
  const tot = new Map();
  const t1 = Date.now();
  for (const g of schedule) {
    const rec = simulateQuickGame({ id: g.home, roster: rosterOf(g.home) }, { id: g.away, roster: rosterOf(g.away) }, rng);
    Object.assign(g, { status: 'final', score: rec.score });
    for (const t of rec.box) {
      for (const [k, v] of Object.entries(t.total)) sum[k] = (sum[k] ?? 0) + v;
      for (const p of t.players) {
        if (p.pts > top.pts) top = p;
        const s = tot.get(p.id) ?? { name: p.name, gp: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tpm: 0 };
        s.gp++;
        s.pts += p.pts;
        s.reb += p.orb + p.drb;
        s.ast += p.ast;
        s.stl += p.stl;
        s.blk += p.blk;
        s.tpm += p.tpm;
        tot.set(p.id, s);
      }
    }
    sum.ot = (sum.ot ?? 0) + (rec.overtimes ? 1 : 0);
    sum.homeWins = (sum.homeWins ?? 0) + (rec.score[0] > rec.score[1] ? 1 : 0);
  }
  const n = schedule.length * 2;
  const per = (k) => (sum[k] / n).toFixed(1);
  const pct = (a, b) => ((sum[a] / sum[b]) * 100).toFixed(1);
  console.log(`Calendário: ${schedule.length} jogos de ${schedule[0].date} a ${schedule.at(-1).date} (gerado em ${tGen} ms); simulação em ${Date.now() - t1} ms`);
  console.log(`PTS ${per('pts')} (115)  FG ${per('fgm')}/${per('fga')} ${pct('fgm', 'fga')}% (47)  3P ${per('tpm')}/${per('tpa')} ${pct('tpm', 'tpa')}% (36; 37)  LL ${per('ftm')}/${per('fta')} ${pct('ftm', 'fta')}% (78; 22)`);
  console.log(`REB ${((sum.orb + sum.drb) / n).toFixed(1)} (44)  OREB ${per('orb')} (11)  AST ${per('ast')} (26)  ROB ${per('stl')} (8)  TOC ${per('blk')} (5)  ERR ${per('tov')} (14)  F ${per('pf')} (20)`);
  console.log(`Mandante vence ${((sum.homeWins / schedule.length) * 100).toFixed(1)}% (≈55)  prorrogações ${((sum.ot / schedule.length) * 100).toFixed(1)}% (≈6)  maior pontuação individual: ${top.name} ${top.pts}`);
  const lead = (k) => [...tot.values()].filter((s) => s.gp >= 50).sort((a, b) => b[k] / b.gp - a[k] / a.gp).slice(0, 3).map((s) => `${s.name.split(" ").pop()} ${(s[k] / s.gp).toFixed(1)}`).join(", ");
  console.log(`Líderes — PTS: ${lead("pts")} · REB: ${lead("reb")} · AST: ${lead("ast")} · ROB: ${lead("stl")} · TOC: ${lead("blk")} · 3PM: ${lead("tpm")}`);
  const { conferences } = computeStandings(teams, schedule);
  for (const [conf, list] of Object.entries(conferences)) console.log(`${conf}: ${list.map((r) => `${r.id} ${r.w}-${r.l}`).join('  ')}`);
  console.log(`Expansion Draft (ordem ${plan.order.join(', ')}): ${plan.picks.slice(0, 8).map((p) => `${p.teamId}←${byId.get(p.playerId).name} (${p.fromTeamId})`).join(' · ')} …`);
}
