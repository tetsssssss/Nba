// Read-only Street replay from real possessions retained by the game engine.
// The Street engine intentionally keeps at most the last 60 events.
export function wnbaStreetReplay(game) {
  if (!game || game.teams?.length!==2 || !Array.isArray(game.events) || !Array.isArray(game.score))
    throw Error('Jogo Street inválido para replay.');
  const frames=[...game.events].reverse().map(event=>{
    if (!Number.isInteger(event.n)||event.n<1 || !Array.isArray(event.score)||event.score.length!==2||
        !event.score.every(x=>Number.isFinite(x)&&x>=0)||![0,1].includes(event.offense))
      throw Error('Evento Street inválido no replay.');
    return { possession:event.n, offense:event.offense, team:game.teams[event.offense].name,
      text:String(event.text??''), kind:event.kind, points:event.points??0,
      score:[...event.score], diff:event.score[0]-event.score[1] };
  });
  if (frames.some((f,i)=>i>0&&f.possession<=frames[i-1].possession)) throw Error('Replay com posses fora de ordem.');
  return { league:game.teams.some(t=>t.league==='WNBA')?'WNBA':'Street',
    frames, retained:frames.length, total:game.possessions??frames.at(-1)?.possession??0,
    truncated:(game.possessions??0)>frames.length,
    finalScore:[...game.score], over:!!game.over, persisted:false };
}
