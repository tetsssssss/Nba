// Nonpersistent WNBA All-Star events derived from game ratings only.
import { createRng } from '../core/rng.js';
import { WNBA_PLAYERS } from './catalog.js';
import { runStreetCircuit } from '../arcade/street.js';
const rank=(a,b)=>b.ovr-a.ovr||a.name.localeCompare(b.name);
export function wnbaCaptainsDraft({size=10,seed='wnba-all-star'}={}){
 if(!Number.isInteger(size)||size<5||size>12)throw Error('Tamanho All-Star inválido.');
 const pool=[...WNBA_PLAYERS].sort(rank).slice(0,2*size), captains=[pool[0],pool[1]];
 const rest=createRng(`wnba-captains:${seed}`).shuffle(pool.slice(2));
 const rosters=[[captains[0]],[captains[1]]],picks=[];
 for(let i=0;i<rest.length;i++){
  const side=Math.floor(i/2)%2===0?1-i%2:i%2;
  rosters[side].push(rest[i]);picks.push({round:i+1,side,id:rest[i].id,name:rest[i].name});
 }
 return {rosters,captains,picks,seed,persisted:false};
}
export function wnbaSkillsChallenge({seed='wnba-skills',participants=8}={}){
 if(!Number.isInteger(participants)||participants<2||participants>16)throw Error('Participantes inválidas.');
 const pool=[...WNBA_PLAYERS].sort((a,b)=>(b.attributes.ballHandling+b.attributes.passing+b.attributes.speed)-(a.attributes.ballHandling+a.attributes.passing+a.attributes.speed)).slice(0,participants);
 return pool.map(p=>{
  const rng=createRng(`wnba-skills:${seed}:${p.id}`);
  const phases=[['Condução','ballHandling'],['Passe','passing'],['Agilidade','speed'],['Finalização','layup']].map(([name,key])=>{
   const rating=p.attributes[key];const time=Number(Math.max(5,21-rating*.14+rng.float(-1.8,1.8)).toFixed(2));
   return {name,rating,time};
  });
  return {id:p.id,name:p.name,teamId:p.teamId,phases,total:Number(phases.reduce((s,x)=>s+x.time,0).toFixed(2))};
 }).sort((a,b)=>a.total-b.total||a.name.localeCompare(b.name));
}
export function wnbaStreetCircuit(teamIds,{seed='wnba-street-circuit',target=11}={}){
 if(!Array.isArray(teamIds)||![4,8].includes(teamIds.length)||new Set(teamIds).size!==teamIds.length)throw Error('Circuito WNBA exige 4 ou 8 franquias únicas.');
 const {WNBA_BY_ID,wnbaRoster}=WNBA_STREET_CATALOG;
 const squads=teamIds.map(id=>{
  const team=WNBA_BY_ID.get(id);if(!team)throw Error('Franquia desconhecida.');
  return {id,name:team.fullName,colors:team.colors,roster:wnbaRoster(id).slice(0,3)};
 });
 return {...runStreetCircuit(squads,{seed,target}),league:'WNBA',persisted:false};
}
// Exported catalog references are direct imports, never World or NBA career.
import { WNBA_BY_ID, wnbaRoster } from './catalog.js';
const WNBA_STREET_CATALOG={WNBA_BY_ID,wnbaRoster};
