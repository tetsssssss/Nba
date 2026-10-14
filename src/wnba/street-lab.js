// Side A changes strategy; side B stays balanced. Results are simulated, never stored.
import { WNBA_BY_ID, wnbaRoster } from './catalog.js';
import { newStreetGame, streetPossession } from '../arcade/street.js';
export const STREET_STRATEGIES = ['balanced', 'outside', 'drive', 'pass'];
export function compareWnbaStreetTactics(homeId, awayId, {seed='wnba-street-lab', games=16, size=3, target=11}={}) {
  if (homeId===awayId || !WNBA_BY_ID.has(homeId) || !WNBA_BY_ID.has(awayId)) throw Error('Escolha duas franquias WNBA diferentes.');
  if (!Number.isInteger(games)||games<4||games>100 || ![1,2,3].includes(size) || ![11,21].includes(target)) throw Error('Configuração Street Lab inválida.');
  if (typeof seed!=='string'||seed.length>80) throw Error('Semente Street Lab inválida.');
  const teams=[homeId,awayId].map(id=>({ id, name:WNBA_BY_ID.get(id).fullName, roster:wnbaRoster(id).slice(0,size) }));
  if (teams.some(t=>t.roster.length<size)) throw Error('Elenco Street insuficiente.');
  const rows=STREET_STRATEGIES.map(tactic=>{
    const scores=[0,0];let wins=0,completed=0,attempted=0;
    for (let i=0;i<games;i++) {
      let state=newStreetGame(teams,{seed:`${seed}:test${i}`,target,squadSize:size});
      for(let possession=0;possession<350&&!state.over;possession++)
        state=streetPossession(state,state.offense===0?tactic:'balanced');
      if (!state.over) continue; // Don't count an unfinished game as a defeat.
      completed++; attempted+=state.possessions; scores[0]+=state.score[0]; scores[1]+=state.score[1];
      if(state.winner===0)wins++;
    }
    return { tactic, completed, wins, losses:completed-wins,
      winRate:completed?wins/completed:0, avgFor:completed?Number((scores[0]/completed).toFixed(2)):0,
      avgAgainst:completed?Number((scores[1]/completed).toFixed(2)):0,
      avgPossessions:completed?Number((attempted/completed).toFixed(2)):0 };
  });
  return { league:'WNBA', type:'street-tactics-study', teams:[homeId,awayId], seed, games, size,target,
    rows, best:[...rows].sort((a,b)=>b.winRate-a.winRate||b.avgFor-a.avgFor)[0]?.tactic, persisted:false };
}
