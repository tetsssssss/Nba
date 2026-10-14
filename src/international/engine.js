// Motor rápido FIBA autônomo: períodos de 10 minutos, relógio de 24 s,
// prorrogação de 5 minutos, estatísticas coerentes com o placar.
import { createRng } from '../core/rng.js';
import { teamSpec, playableTeams, LEAGUE_INFO, INT_TEAM_MAP } from './catalog.js';
const chance=(rng,p)=>rng.next()<Math.max(0,Math.min(1,p));
function pick(rng,players,weight){return rng.weighted(players.map(p=>[p,Math.max(0.01,weight(p))]));}
const empty=(p,t)=>({id:p.id,name:p.name,teamId:t,pts:0,fgm:0,fga:0,tpm:0,tpa:0,ftm:0,fta:0,orb:0,drb:0,ast:0,stl:0,blk:0,tov:0,pf:0});
function turn(rng,team,opp,stats,q,events){
 const scorer=pick(rng,team.roster,p=>Math.pow(p.ovr/50,3));
 const line=stats.get(scorer.id);const defender=pick(rng,opp.roster,p=>p.attributes.perimeterDefense);
 if(chance(rng,.105)){line.tov++;if(chance(rng,.29))stats.get(defender.id).stl++;return 0;}
 const three=chance(rng,scorer.role==='G'?.39:scorer.role==='F'?.29:.14);
 const skill=three?scorer.attributes.threePoint:scorer.attributes.rimFinishing;
 const defense=opp.roster.slice(0,5).reduce((s,p)=>s+p.attributes.defensiveIQ,0)/5;
 const hit=chance(rng,(three?.32:.47)+(skill-70)*.0035-(defense-70)*.0018);
 line.fga++;if(three)line.tpa++;
 let pts=0;
 if(hit){line.fgm++;pts=three?3:2;if(three)line.tpm++;
  if(chance(rng,.56)){const mate=pick(rng,team.roster.filter(p=>p.id!==scorer.id),p=>p.attributes.passing);stats.get(mate.id).ast++;}}
 else {const side=chance(rng,.70)?opp:team;const p=pick(rng,side.roster,p=>p.attributes.defensiveRebounding);stats.get(p.id)[side===team?'orb':'drb']++;}
 if(chance(rng,.115)){const shots=hit?1:2;line.fta+=shots;for(let i=0;i<shots;i++)if(chance(rng,.75+(scorer.attributes.freeThrow-68)*.002)){line.ftm++;pts++;}}
 line.pts+=pts;
 if(pts)events.push({quarter:q,side:team.id,player:scorer.name,points:pts,text:`${scorer.name}: +${pts} (${three?'arremesso de 3 ou lance livre':'jogada de 2 ou lance livre'})`});
 return pts;
}
export function simulateInternational(a,b,{seed='fiba-2026',possessions=73}={}){
 if(!Number.isInteger(possessions)||possessions<40||possessions>105)throw Error('Ritmo de posses inválido.');
 const teams=[teamSpec(a),teamSpec(b)];if(a===b)throw Error('Escolha equipes diferentes.');
 if(teams[0].league!==teams[1].league)throw Error('Amistosos exigem duas equipes da mesma competição.');
 const rng=createRng(`international:${seed}:${a}:${b}`),stats=new Map(teams.flatMap(t=>t.roster.map(p=>[p.id,empty(p,t.id)]))),quarters=[[],[]],events=[];
 for(let q=1;q<=4;q++){
  const scores=[0,0],total=Math.floor(possessions/4)+(q<=possessions%4?1:0);
  for(let i=0;i<total;i++)for(const s of ((i+q)%2?[0,1]:[1,0]))scores[s]+=turn(rng,teams[s],teams[1-s],stats,q,events);
  for(let i=0;i<2;i++)quarters[i].push(scores[i]);
 }
 const sum=i=>quarters[i].reduce((s,x)=>s+x,0);
 let overtime=0;
 while(sum(0)===sum(1)&&overtime<10){overtime++;const pts=[0,0];for(let j=0;j<9;j++)for(const side of [0,1])pts[side]+=turn(rng,teams[side],teams[1-side],stats,4+overtime,events);for(let s=0;s<2;s++)quarters[s].push(pts[s]);}
 if(sum(0)===sum(1)){const side=Math.floor(rng.next()*2),p=teams[side].roster[0],row=stats.get(p.id);row.pts++;row.ftm++;row.fta++;quarters[side][quarters[side].length-1]++;}
 const score=[sum(0),sum(1)],box=teams.map(t=>t.roster.map(p=>stats.get(p.id)).sort((x,y)=>y.pts-x.pts));
 return {league:teams[0].league,type:'exhibition',seed,teams:teams.map(t=>({id:t.id,name:t.name,colors:t.colors})),score,quarters,box,
 ot:overtime,winner:teams[score[0]>score[1]?0:1].id,events:events.slice(-60),rules:{periods:4,periodMinutes:10,shotClock:24,overtimeMinutes:5},persisted:false};
}
export function knockout(ids,{seed='international-cup'}={}){
 if(![4,8,16].includes(ids.length)||new Set(ids).size!==ids.length)throw Error('Copa requer 4, 8 ou 16 equipes diferentes.');
 const leagues=new Set(ids.map(id=>INT_TEAM_MAP.get(id)?.league));if(leagues.size!==1||leagues.has(undefined))throw Error('Selecione equipes da mesma liga.');
 let current=[...ids],round=0;const rounds=[];
 while(current.length>1){round++;const matches=[],next=[];
  for(let i=0;i<current.length;i+=2){const match=simulateInternational(current[i],current[i+1],{seed:`${seed}-${round}-${i/2}`});matches.push(match);next.push(match.winner);}
  rounds.push(matches);current=next;
 }
 return {league:[...leagues][0],rounds,champion:current[0],persisted:false};
}
const groupOrder={A:['SRB','LAT','CZE','TUR','EST','POR'],B:['GER','LTU','MNE','FIN','GBR','SWE'],C:['ESP','GRE','ITA','GEO','BIH','CYP'],D:['FRA','SLO','POL','ISR','BEL','ISL']};
export function euroBasketTournament({seed='eurobasket-2025-alt'}={}){
 const groups={};const allGames=[];
 for(const [group,codes] of Object.entries(groupOrder)){
  const ids=codes.map(c=>'EUROBASKET-'+c),table=new Map(ids.map(id=>[id,{id,wins:0,losses:0,scored:0,conceded:0,diff:0}]));
  const games=[];
  for(let i=0;i<6;i++)for(let j=i+1;j<6;j++){
   const g=simulateInternational(ids[i],ids[j],{seed:`${seed}-group-${group}-${i}-${j}`});games.push(g);allGames.push(g);
   for(const side of [0,1]){const t=table.get(g.teams[side].id);t.scored+=g.score[side];t.conceded+=g.score[1-side];if(g.winner===t.id)t.wins++;else t.losses++;t.diff=t.scored-t.conceded;}
  }
  const standings=[...table.values()].sort((a,b)=>b.wins-a.wins||b.diff-a.diff||b.scored-a.scored||a.id.localeCompare(b.id));
  groups[group]={games,standings};
 }
 // A1-B4, A2-B3, ... C1-D4. Os classificados seguem até a final.
 const A=groups.A.standings,B=groups.B.standings,C=groups.C.standings,D=groups.D.standings;
 const firstRound=[[A[0],B[3]],[A[1],B[2]],[A[2],B[1]],[A[3],B[0]],[C[0],D[3]],[C[1],D[2]],[C[2],D[1]],[C[3],D[0]]].map(x=>x.map(v=>v.id));
 let pairs=firstRound,round=0;const knockoutRounds=[];
 while(pairs.length){round++;const games=pairs.map(([a,b],i)=>simulateInternational(a,b,{seed:`${seed}-knockout-${round}-${i}`}));knockoutRounds.push(games);const winners=games.map(g=>g.winner);if(winners.length===1)break;pairs=[];for(let i=0;i<winners.length;i+=2)pairs.push([winners[i],winners[i+1]]);}
 return {league:'EUROBASKET',groups,rounds:knockoutRounds,champion:knockoutRounds.at(-1)[0].winner,games:allGames.length+knockoutRounds.flat().length,persisted:false,seed};
}
