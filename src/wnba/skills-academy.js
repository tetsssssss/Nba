// Deterministic arcade skill drills. No career progression or persistence.
import { createRng } from '../core/rng.js';
const DRILLS=Object.freeze(['three-point','ball-handling','playmaking','defense']);
export const WNBA_SKILL_DRILLS=DRILLS;
const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
export function runWnbaSkillAcademy(athletes,{seed='skills-academy',rounds=3}={}){
  if(!Array.isArray(athletes)||athletes.length<1||athletes.length>30||new Set(athletes.map(p=>String(p?.id))).size!==athletes.length)throw Error('Escolha de 1 a 30 atletas diferentes.');
  if(typeof seed!=='string'||seed.length>80||!Number.isInteger(rounds)||rounds<1||rounds>10)throw Error('Configuração do treino inválida.');
  const keys={ 'three-point':'threePoint','ball-handling':'ballHandling','playmaking':'passing','defense':'perimeterDefense'};
  if(athletes.some(p=>!p||!p.name||Object.values(keys).some(k=>!Number.isFinite(p.attributes?.[k])||p.attributes[k]<0||p.attributes[k]>100)))throw Error('Atributos do atleta inválidos.');
  const leaderboard=athletes.map(player=>{
    const drills=DRILLS.map(drill=>{
      const skill=player.attributes[keys[drill]],rng=createRng(`${seed}:${player.id}:${drill}`);
      const attempts=Array.from({length:rounds*5},()=>rng.chance(clamp(.18+skill*.0062,.18,.84))?1:0);
      return {drill,skill,made:attempts.reduce((a,b)=>a+b,0),attempted:attempts.length,rate:attempts.reduce((a,b)=>a+b,0)/attempts.length};
    });
    return {id:player.id,name:player.name,ovr:player.ovr,drills,score:drills.reduce((sum,d)=>sum+d.made,0),possible:rounds*5*DRILLS.length};
  }).sort((a,b)=>b.score-a.score||String(a.name).localeCompare(String(b.name)));
  return {type:'wnba-skills-academy',league:'WNBA',seed,rounds,leaderboard,winner:leaderboard[0].id,persisted:false};
}
