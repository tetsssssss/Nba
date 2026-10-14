// Street 2D independente: movimento calculado ANTES da decisão de arremesso.
// Coordenadas normalizadas em uma meia quadra de 420 x 240 unidades; cesta em (369, 120).
// Não consulta nem altera saves, contratos, temporada ou dados da Carreira.
import { createRng } from '../core/rng.js';

export const STREET_COURT = Object.freeze({ width: 420, height: 240, hoop: Object.freeze({x: 369, y: 120}) });
export const SPATIAL_TACTICS = Object.freeze(['balanced','outside','drive','pass']);
const clamp = (x,lo,hi) => Math.max(lo,Math.min(hi,x));
const rating = (p,key) => clamp(Number.isFinite(p?.attributes?.[key])?p.attributes[key]:60, 1,99);
const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const lerp = (a,b,t) => a+(b-a)*t;
const copyFrame = (team0,team1,ball,at,phase) => ({
  at,phase,teams:[team0.map(p=>({id:p.id,x:p.x,y:p.y})),team1.map(p=>({id:p.id,x:p.x,y:p.y}))],
  ball:{x:ball.x,y:ball.y}
});

/** Cria partida avulsa, sem referência ao mundo NBA. */
export function newSpatialStreetGame(teams,{seed='spatial-street',target=11,squadSize=3}={}){
  if (![1,2,3].includes(squadSize)) throw Error('Street 2D: formato deve ser 1x1, 2x2 ou 3x3.');
  if (![11,21].includes(target)) throw Error('Street 2D: meta deve ser 11 ou 21.');
  if (!Array.isArray(teams)||teams.length!==2 || teams.some(t=>!Array.isArray(t?.roster)||t.roster.length!==squadSize))
    throw Error(`Street 2D exige ${squadSize} atleta(s) por equipe.`);
  const ids=teams.flatMap(t=>t.roster.map(p=>String(p?.id??'')));
  if(ids.some(id=>!id)||new Set(ids).size!==ids.length) throw Error('Street 2D: IDs inexistentes ou repetidos.');
  if(teams.some(t=>t.roster.some(p=>typeof p.name!=='string'||!p.name.trim()))) throw Error('Street 2D: atleta sem nome.');
  return {teams,seed:String(seed),target,squadSize,score:[0,0],offense:0,possessions:0,events:[],
    box:teams.map(t=>Object.fromEntries(t.roster.map(p=>[String(p.id),{pts:0,fgm:0,fga:0,twom:0,twoa:0,stl:0,tov:0,ast:0}]))),
    winner:null,over:false,persisted:false,engine:'spatial-street-v1'};
}

/** Calcula uma posse e registra trajetória de cada jogador, bola e defesa. */
export function spatialStreetPossession(state,tactic='balanced'){
  if(state.over)return state;
  if(!SPATIAL_TACTICS.includes(tactic))throw Error('Street 2D: tática desconhecida.');
  const rng=createRng(`${state.seed}:spatial:${state.possessions}`);
  const offense=state.offense, defense=1-offense;
  const atk=state.teams[offense].roster,def=state.teams[defense].roster;
  const shooter=rng.weighted(atk.map(p=>[p,20+rating(p,'shotCreation')+rating(p,'ballHandling')/2]));
  const shooterIndex=atk.findIndex(p=>p.id===shooter.id);
  const passerIndex=tactic==='pass'&&atk.length>1?(shooterIndex+1)%atk.length:null;
  const isLong = rng.chance(({balanced:.45,outside:.88,drive:.1,pass:.58})[tactic]);
  // Para pontos longos, a bola deve ser solta mais afastada da cesta.
  const lane = shooterIndex===0?0:(shooterIndex%2?1:-1);
  const targetX = isLong?lerp(175,210,rng.next()):lerp(313,337,rng.next());
  const targetY = clamp(120+lane*51+rng.float(-22,22),27,213);
  const offenseInitial=atk.map((p,i)=>({id:p.id,x:78+i*21,y:120+(i===0?0:i%2?64:-64)}));
  const defenseInitial=def.map((p,i)=>({id:p.id,x:245+i*12,y:120+(i===0?0:i%2?56:-56)}));
  const offenseFinal=offenseInitial.map((p,i)=>i===shooterIndex?{...p,x:targetX,y:targetY}:
    {...p,x:clamp(213+i*34,170,324),y:clamp(p.y+(tactic==='pass'?19:5),32,208)});
  // Defensor marca atacante mais próximo, reagindo conforme velocidade e atributos.
  const dSpeed=def.map(p=>(rating(p,'speed')+rating(p,'perimeterDefense'))/2);
  const defenseFinal=defenseInitial.map((p,i)=>{
    const assigned=offenseFinal[i%offenseFinal.length];
    const capability=clamp((dSpeed[i]-45)/70,.15,.76);
    return {id:p.id,x:lerp(p.x,assigned.x+24,capability),y:lerp(p.y,assigned.y,capability)};
  });
  const contact=defenseFinal.map((p,i)=>({i,d:dist(p,offenseFinal[shooterIndex])})).sort((a,b)=>a.d-b.d)[0];
  const defender=def[contact.i];
  const defensiveDistance=contact.d;
  const frames=[];
  const numFrames=25;
  for(let tick=0;tick<numFrames;tick++){
    const t=tick/(numFrames-1),ease=t*t*(3-2*t);
    const a=offenseInitial.map((p,i)=>({...p,x:lerp(p.x,offenseFinal[i].x,ease),y:lerp(p.y,offenseFinal[i].y,ease)}));
    const d=defenseInitial.map((p,i)=>({...p,x:lerp(p.x,defenseFinal[i].x,ease),y:lerp(p.y,defenseFinal[i].y,ease)}));
    const holder=a[shooterIndex];
    // Na tática de circulação há passe percorrendo a quadra, antes da finalização.
    const passer=passerIndex===null?holder:a[passerIndex];
    const passProgress=passerIndex!==null?clamp(tick/9,0,1):1;
    const ballLocation={x:lerp(passer.x,holder.x,passProgress)+5,
      y:lerp(passer.y,holder.y,passProgress)-(tick%6<3?2:8)};
    frames.push(copyFrame(offense===0?a:d,offense===0?d:a,
      ballLocation,tick,passerIndex!==null&&tick<=9?'pass':'movement'));
  }
  const playerId=String(shooter.id),defId=String(defender.id);
  const box=state.box.map(b=>Object.fromEntries(Object.entries(b).map(([id,s])=>[id,{...s}])));
  const shooterStats=box[offense][playerId],defenderStats=box[defense][defId];
  // Separação física entre defensor e arremessadora muda a probabilidade do lance.
  const pressure=clamp((44-defensiveDistance)/44,0,1);
  const stealChance=clamp(.065+pressure*.095+(rating(defender,'steals')-60)*.001-
    (rating(shooter,'ballHandling')-60)*.001-(tactic==='pass'?.018:0),.01,.24);
  let points=0,kind='miss',text;
  if(rng.chance(stealChance)){
    kind='steal';shooterStats.tov++;defenderStats.stl++;
    text=`${defender.name} intercepta ${shooter.name} na marcação.`;
  } else {
    const skill=isLong ? .7*rating(shooter,'threePoint')+.3*rating(shooter,'catchAndShoot') :
      .55*rating(shooter,'rimFinishing')+.25*rating(shooter,'layup')+.2*rating(shooter,'shotCreation');
    const counter=isLong?rating(defender,'perimeterDefense'):rating(defender,'interiorDefense');
    const pMake=clamp((isLong?.37:.6)+(skill-70)*.0045-(counter-65)*.0015-
      pressure*.19+(tactic==='pass'?.02:0),.09,.82);
    shooterStats.fga++;if(isLong)shooterStats.twoa++;
    if(rng.chance(pMake)){
      points=isLong?2:1;kind=isLong?'long':'drive';shooterStats.fgm++;
      if(isLong)shooterStats.twom++;shooterStats.pts+=points;
      if(passerIndex!==null)box[offense][String(atk[passerIndex].id)].ast++;
      text=`${shooter.name} marca ${points} ponto${points===2?'s':''} com ${defensiveDistance.toFixed(0)} unidades de separação.`;
    }else text=`${shooter.name} erra ${isLong?'arremesso longo':'infiltração'} sob marcação.`;
    // Trajetória da bola até o aro, incluindo arco visual.
    const from=offenseFinal[shooterIndex],hoop=STREET_COURT.hoop;
    for(let i=1;i<=13;i++){
      const t=i/13;
      frames.push(copyFrame(offense===0?offenseFinal:defenseFinal,offense===0?defenseFinal:offenseFinal,
        {x:lerp(from.x,hoop.x,t),y:lerp(from.y,hoop.y,t)-Math.sin(t*Math.PI)*30},numFrames-1+i,'shot'));
    }
  }
  const score=[...state.score];score[offense]+=points;
  const over=score[offense]>=state.target && (score[offense]-score[defense]>=2||score[offense]>=25);
  const event={n:state.possessions+1,offense,shooterId:playerId,defenderId:defId,
    passerId:passerIndex!==null?String(atk[passerIndex].id):null,
    kind,points,isLong,contest:Number(pressure.toFixed(3)),defenderDistance:Number(defensiveDistance.toFixed(2)),
    text,score:[...score],frames,tactic};
  return {...state,score,box,offense:over?offense:defense,possessions:state.possessions+1,
    over,winner:over?offense:null,events:[event,...state.events].slice(0,60)};
}

export function simulateSpatialStreet(game,{tactic='balanced',limit=400}={}){
  if(!Number.isInteger(limit)||limit<1||limit>1000)throw Error('Limite de posses inválido.');
  let current=game;
  for(let i=0;i<limit&&!current.over;i++)current=spatialStreetPossession(current,tactic);
  return current;
}

export function spatialStreetSummary(game){
  if(game?.engine!=='spatial-street-v1')throw Error('Partida espacial inválida.');
  return {score:[...game.score],possessions:game.possessions,winner:game.winner,over:game.over,
    lastEvent:game.events[0]??null,shots:game.box.map(b=>Object.values(b).reduce((a,s)=>({attempts:a.attempts+s.fga,made:a.made+s.fgm,steals:a.steals+s.stl}),{attempts:0,made:0,steals:0}))};
}
