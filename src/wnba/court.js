// Schematic WNBA Street shot chart: places are illustrative zones, NOT tracking data.
export function wnbaStreetShotZones(game){
 if(!game||!Array.isArray(game.events))return [];
 return [...game.events].reverse().filter(e=>e.kind!=='steal').map(e=>{
  const outside=e.kind==='long'||(e.kind==='miss'&&e.text?.includes('de fora'));
  const made=e.points>0;
  const jitter=(e.n*23+(Number(e.playerId)||0)%13)%83;
  const x=outside?78+(e.n*17)%62:301+(e.n*13)%33;
  const y=outside?63+jitter*1.35:88+jitter*.76;
  return {n:e.n,x,y,kind:outside?'outside':'paint',made,side:e.offense,label:`Posse ${e.n}: ${e.text}`};
 });
}
