// Arcade WNBA duel bracket (1x1), powered by the real standalone Street possession engine.
import { newStreetGame, simulateStreet } from '../arcade/street.js';
import { createRng } from '../core/rng.js';
export function runWnbaDuelTournament(players,{seed='wnba-duel',target=11,shuffle=true}={}){
  if(!Array.isArray(players)||![8,16].includes(players.length))throw Error('Duelo WNBA exige 8 ou 16 atletas.');
  if(typeof seed!=='string'||seed.length>80||![11,21].includes(target)||typeof shuffle!=='boolean')throw Error('Configuração do duelo inválida.');
  if(players.some(p=>!p||!p.name||!p.id||!p.attributes)||new Set(players.map(p=>String(p.id))).size!==players.length)throw Error('Atletas duplicadas ou inválidas.');
  let bracket=shuffle?createRng(`wnba-duel:${seed}`).shuffle(players):[...players];
  const rounds=[];
  for(let round=1;bracket.length>1;round++){
    const next=[],games=[];
    for(let i=0;i<bracket.length;i+=2){
      const a=bracket[i],b=bracket[i+1];
      const squads=[a,b].map(p=>({id:`DUEL-${p.id}`,name:p.name,roster:[p],colors:['#9a7ad8','#212e3d']}));
      const match=simulateStreet(newStreetGame(squads,{seed:`${seed}:round${round}:game${i/2}`,squadSize:1,target}),{limit:600});
      if(!match.over||match.winner===null)throw Error('O duelo não terminou dentro do limite de posses.');
      const winner=match.winner===0?a:b;
      games.push({a:a.id,b:b.id,nameA:a.name,nameB:b.name,score:[...match.score],winner:winner.id,winnerName:winner.name,possessions:match.possessions});
      next.push(winner);
    }
    rounds.push(games);bracket=next;
  }
  return {league:'WNBA',type:'duel-tournament',seed,target,rounds,champion:bracket[0].id,championName:bracket[0].name,played:rounds.flat().length,persisted:false};
}
