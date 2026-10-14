// WNBA exhibition simulation: 4x10 min, independent of NBA world/season/save.
// Deterministic per seed, per-team box score and quarter breakdown.
import { createRng } from '../core/rng.js';
import { WNBA_BY_ID, WNBA_PLAYERS, wnbaRoster } from './catalog.js';
const roll=(rng,p)=>rng.next()<Math.min(.99,Math.max(.01,p));
const choose=(rng,players,fn)=>rng.weighted(players.map(p=>[p,Math.max(.1,fn(p))]));
export function wnbaMatchTeams(a,b) {
 const ids=[typeof a==='string'?a:a?.id,typeof b==='string'?b:b?.id];
 if(ids[0]===ids[1])throw Error('Selecione franquias diferentes.');
 return ids.map(id=>{const t=WNBA_BY_ID.get(id);if(!t)throw Error(`Franquia WNBA desconhecida: ${id}`);const roster=wnbaRoster(id);if(roster.length<5)throw Error(`${t.fullName} sem quinteto.`);return {...t,roster};});
}
const emptyLine=(p,teamId)=>({id:p.id,name:p.name,teamId,pts:0,fgm:0,fga:0,tpm:0,tpa:0,ftm:0,fta:0,orb:0,drb:0,ast:0,stl:0,blk:0,tov:0,pf:0});
function possession(rng,team,opp,stats,period,log){
 const shooter=choose(rng,team.roster,p=>Math.pow(Math.max(2,p.stats2026.ppg+2),1.35));
 const row=stats.get(shooter.id);
 if(roll(rng,.115)) { row.tov++;if(roll(rng,.38)) {const d=choose(rng,opp.roster,p=>p.attributes.steals);stats.get(d.id).stl++;}return 0;}
 const three=roll(rng, shooter.role==='G'?.41:shooter.role==='F'?.28:.1);
 const shotSkill=three?shooter.attributes.threePoint:shooter.attributes.rimFinishing;
 const defense=opp.roster.slice(0,5).reduce((v,p)=>v+p.attributes.defensiveIQ,0)/5;
 const prob=Math.min(.63,Math.max(.18,(three?.32:.46)+(shotSkill-68)*.0034-(defense-67)*.0018));
 row.fga++;if(three)row.tpa++;
 let pts=0;
 if(roll(rng,prob)){pts=three?3:2;row.fgm++;if(three)row.tpm++;
  if(roll(rng,.55)){const teammates=team.roster.filter(p=>p.id!==shooter.id);const assister=choose(rng,teammates,p=>p.stats2026.apg+1);stats.get(assister.id).ast++;}}
 else{const side=roll(rng,.75)?opp:team;const rebounder=choose(rng,side.roster,p=>p.stats2026.rpg+1);stats.get(rebounder.id)[side===team?'orb':'drb']++;}
 if(roll(rng,.09)){const attempts=pts>0?1:2;row.fta+=attempts;let ft=0;for(let k=0;k<attempts;k++)if(roll(rng,.78))ft++;row.ftm+=ft;pts+=ft;}
 row.pts+=pts;
 if(pts)log.push({quarter:period,side:team.id,player:shooter.name,points:pts,text:`${shooter.name}: ${pts} pt${pts>1?'s':''}`});
 return pts;
}
export function simulateWnbaCustom(specs,{seed='wnba-fantasy',possessionsPerTeam=82}={}){
 if(!Array.isArray(specs)||specs.length!==2||specs.some(t=>!t?.id||!t.name||!Array.isArray(t.roster)||t.roster.length<5||t.roster.length>15))throw Error('Amistoso exige duas equipes com 5 a 15 jogadoras.');
 const teams=specs;
 if(teams[0].id===teams[1].id)throw Error('Equipes repetidas.');
 const ids=teams.flatMap(t=>t.roster.map(p=>String(p?.id)));
 if(new Set(ids).size!==ids.length||teams.some(t=>t.roster.some(p=>!p||!Number.isFinite(p.stats2026?.ppg)||!Number.isFinite(p.attributes?.threePoint))))throw Error('Jogadoras repetidas ou inválidas.');
 if(!Number.isInteger(possessionsPerTeam)||possessionsPerTeam<32||possessionsPerTeam>125)throw Error('Ritmo de posses inválido.');
 const rng=createRng(`wnba-game:${seed}:${teams[0].id}:${teams[1].id}`);
 const stats=new Map(teams.flatMap(t=>t.roster.map(p=>[p.id,emptyLine(p,t.id)])));
 const quarters=[[],[]],logs=[];
 for(let q=1;q<=4;q++){
  const pts=[0,0],count=Math.floor(possessionsPerTeam/4)+(q<=possessionsPerTeam%4?1:0);
  for(let i=0;i<count;i++){const first=(i+q)%2;pts[first]+=possession(rng,teams[first],teams[1-first],stats,q,logs);pts[1-first]+=possession(rng,teams[1-first],teams[first],stats,q,logs);}
  for(let i=0;i<2;i++)quarters[i].push(pts[i]);
 }
 const total=i=>quarters[i].reduce((a,b)=>a+b,0);
 let extra=0;while(total(0)===total(1)&&extra<8){extra++;const pts=[0,0];for(let i=0;i<6;i++)for(let s=0;s<2;s++)pts[s]+=possession(rng,teams[s],teams[1-s],stats,4+extra,logs);for(let i=0;i<2;i++)quarters[i].push(pts[i]);}
 if(total(0)===total(1)){const t=choose(rng,teams,p=>p.roster.reduce((s,x)=>s+x.ovr,0));const side=t.id===teams[0].id?0:1;const shooter=choose(rng,t.roster,p=>p.stats2026.ppg+2);stats.get(shooter.id).pts++;stats.get(shooter.id).ftm++;stats.get(shooter.id).fta++;quarters[side][quarters[side].length-1]++;logs.push({quarter:4+extra,side:t.id,player:shooter.name,points:1,text:'Lance livre decisivo'});}
 const score=[total(0),total(1)];
 const box=teams.map(t=>t.roster.map(p=>stats.get(p.id)).sort((a,b)=>b.pts-a.pts));
 return {league:'WNBA',type:'exhibition',seed,teams:teams.map(t=>({id:t.id,name:t.fullName,colors:t.colors})),score,quarters,box,ot:extra,winner:teams[score[0]>score[1]?0:1].id,
 leaders:box.map(lines=>lines[0]),events:logs.slice(-32),rules:{periods:4,periodMinutes:10,shotClock:24},persisted:false};
}
/** Official franchise rosters are resolved by ID; custom matches remain independent. */
export function simulateWnbaExhibition(teamA,teamB,options={}){
 return simulateWnbaCustom(wnbaMatchTeams(teamA,teamB),options);
}
/** Nonpersistent best-of series; does not create a season or playoff bracket in career. */
export function wnbaExhibitionSeries(teamA,teamB,{seed='wnba-series',bestOf=3}={}){
 if(![3,5,7].includes(bestOf))throw Error('Séries avulsas exigem melhor de 3, 5 ou 7.');
 wnbaMatchTeams(teamA,teamB);
 const victories=[0,0],games=[];
 for(let n=0;n<bestOf&&Math.max(...victories)<Math.ceil(bestOf/2);n++){
  const swapped=n%2===1;
  const ids=swapped?[teamB,teamA]:[teamA,teamB];
  const result=simulateWnbaExhibition(...ids,{seed:`${seed}:game${n+1}`});
  victories[result.winner===teamA?0:1]++;
  games.push({number:n+1,...result});
 }
 return {league:'WNBA',type:'exhibition-series',seed,bestOf,teams:[teamA,teamB],victories,champion:victories[0]>victories[1]?teamA:teamB,games,persisted:false};
}
export function wnbaCup(ids,{seed='wnba-cup'}={}){
 if(![4,8].includes(ids.length))throw Error('Copa WNBA requer 4 ou 8 equipes.');
 if(new Set(ids).size!==ids.length)throw Error('Franquia repetida na copa.');
 ids.forEach(id=>{if(!WNBA_BY_ID.has(id))throw Error('Franquia não encontrada.');});
 const rounds=[];let current=[...ids];let round=0;
 while(current.length>1){round++;const games=[];const next=[];
  for(let i=0;i<current.length;i+=2){const match=simulateWnbaExhibition(current[i],current[i+1],{seed:`${seed}:r${round}:g${i/2}`});games.push(match);next.push(match.winner);}rounds.push(games);current=next;
 }
 return {league:'WNBA',seed,rounds,champion:current[0],persisted:false};
}
export function wnbaAllStars(conference,size=10){if(!['East','West'].includes(conference))throw Error('Conferência inválida');return WNBA_PLAYERS.filter(p=>WNBA_BY_ID.get(p.teamId).conference===conference).sort((a,b)=>b.ovr-a.ovr).slice(0,size);}
