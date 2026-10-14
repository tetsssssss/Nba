// node tools/compare-engines.mjs [jogos=24] [seed=qa]
import { createRng } from '../src/core/rng.js';
import { simulateQuickGame } from '../src/season/quick-game.js';
import { MatchSim } from '../src/match/sim.js';
import { rosterOf } from './sim-match.mjs';
const count = Math.min(200, Math.max(1, Number(process.argv[2] ?? 24)));
const seed = process.argv[3] ?? 'qa';
const opponents = [['BOS','DEN'],['LAL','GSW'],['NYK','MIL'],['DAL','PHX']];
const stats = ['pts','fgm','fga','tpm','tpa','orb','drb','ast','pf'];
const tot = { quick: Object.fromEntries(stats.map((k)=>[k,0])), spatial: Object.fromEntries(stats.map((k)=>[k,0])) };
for (let i=0; i<count;i++) {
 const [a,b] = opponents[i%opponents.length];
 const teams = [a,b].map((id)=>({id,name:id,colors:[],roster:rosterOf(id)}));
 const q = simulateQuickGame(teams[0],teams[1],createRng(`${seed}:${i}`));
 const spatial = new MatchSim(teams,{seed:`${seed}:${i}`,quiet:true}); spatial.runToEnd();
 for (const [mode, box] of [['quick',q.box],['spatial',spatial.boxScore()]]) for (const t of box) for (const stat of stats) tot[mode][stat] += t.total[stat];
}
for (const mode of ['quick','spatial']) {
 const per = Object.fromEntries(stats.map((k)=>[k, +(tot[mode][k]/(2*count)).toFixed(2)]));
 per.fgPct = +(per.fgm/per.fga*100).toFixed(1); per.tpPct = +(per.tpm/per.tpa*100).toFixed(1);
 console.log(JSON.stringify({mode,count,seed,perTeam:per}));
}
