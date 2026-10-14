// Calibração: simula partidas completas sem renderização, com elencos reais do seed,
// e imprime médias por time para comparar com a NBA.
// Uso: node tools/sim-match.mjs [jogos=6] [timeA=BOS] [timeB=aleatório]
import { readFileSync } from 'node:fs';
import { MatchSim } from '../src/match/sim.js';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/seed/${f}`, import.meta.url), 'utf8'));
const players = read('players.json');
const ratings = new Map(read('ratings.json').map((r) => [r.playerId, r]));
const teamIds = [...new Set(players.map((p) => p.teamId))];

export function rosterOf(teamId) {
  return players
    .filter((p) => p.teamId === teamId && p.injury?.status !== 'Out')
    .map((p) => ({ ...p, ...ratings.get(p.id), ovr: ratings.get(p.id).overall }))
    .sort((a, b) => b.ovr - a.ovr)
    .slice(0, 13);
}

if (process.argv[1]?.endsWith('sim-match.mjs')) {
  const games = Number(process.argv[2] ?? 6);
  const sum = {};
  const add = (k, v) => (sum[k] = (sum[k] ?? 0) + v);
  const t0 = Date.now();
  let steps = 0;
  for (let g = 0; g < games; g++) {
    const a = process.argv[3] ?? teamIds[(g * 7) % teamIds.length];
    const b = process.argv[4] ?? teamIds[(g * 11 + 5) % teamIds.length];
    if (a === b) continue;
    const sim = new MatchSim([{ id: a, name: a, colors: [], roster: rosterOf(a) }, { id: b, name: b, colors: [], roster: rosterOf(b) }], { seed: `cal-${g}`, quiet: true });
    sim.runToEnd();
    steps += sim.t * 30;
    const box = sim.boxScore();
    for (const t of box) for (const [k, v] of Object.entries(t.total)) add(k, v);
    const m = sim.metrics;
    add('poss', m.possessions[0] + m.possessions[1]);
    add('teams', 2);
    for (const k of ['drives', 'moves', 'screens', 'screenHits', 'cuts', 'passes', 'shots', 'openShots', 'qualitySum', 'paintTouches', 'badPassTO', 'fastBreakPts', 'spacingSum', 'spacingN', 'contestSum', 'decisions']) add(k, m[k]);
    const top = box.map((t) => t.rows.slice().sort((x, y) => y.pts - x.pts)[0]);
    console.log(`${a} ${sim.score[0]} x ${sim.score[1]} ${b}  (OT ${Math.max(0, sim.quarter - 4)})  cestinhas: ${top.map((r) => `${r.name} ${r.pts}pts ${r.min.toFixed(0)}min`).join(' | ')}`);
  }
  const n = sum.teams;
  const per = (k) => (sum[k] / n).toFixed(1);
  const pct = (a, b) => ((sum[a] / sum[b]) * 100).toFixed(1);
  console.log(`\nMédias por time em ${n / 2} jogos (referência NBA entre parênteses)`);
  console.log(`  PTS ${per('pts')} (115)   posses ${per('poss')} (100)`);
  console.log(`  FG ${per('fgm')}/${per('fga')} = ${pct('fgm', 'fga')}% (47%)   3P ${per('tpm')}/${per('tpa')} = ${pct('tpm', 'tpa')}% (36%, 37 tentativas)   LL ${per('ftm')}/${per('fta')} = ${pct('ftm', 'fta')}% (78%, 22 tentativas)`);
  console.log(`  REB ${per('reb')} (44)  OREB ${per('orb')} (11)  AST ${per('ast')} (26)  ROB ${per('stl')} (8)  TOC ${per('blk')} (5)  ERR ${per('tov')} (14)  FALTAS ${per('pf')} (20)`);
  console.log(`  drives ${per('drives')}  dribles ${per('moves')}  bloqueios ${per('screens')} (com contato ${per('screenHits')})  cortes ${per('cuts')}  passes ${per('passes')}`);
  console.log(`  arremessos livres ${pct('openShots', 'shots')}%  qualidade média ${(sum.qualitySum / sum.shots).toFixed(1)}  contest médio ${((sum.contestSum / sum.shots) * 100).toFixed(0)}%  toques no garrafão ${per('paintTouches')}  erros de passe ${per('badPassTO')}  pts de transição ${per('fastBreakPts')}`);
  console.log(`  espaçamento médio ${(sum.spacingSum / sum.spacingN).toFixed(1)} pés   decisões/jogo ${(sum.decisions / (n / 2)).toFixed(0)}`);
  console.log(`  desempenho: ${(steps / ((Date.now() - t0) / 1000) / 30).toFixed(0)}x tempo real`);
}
