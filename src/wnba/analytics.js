// Read-only WNBA observatory. Input data are snapshots, NOT in-career season stats.
import { WNBA_TEAMS, WNBA_PLAYERS, WNBA_BY_ID, wnbaRoster } from './catalog.js';
const accent=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const WNBA_STATS=['ppg','rpg','apg','ovr'];
export function searchWnbaPlayers({query='',teamId='All',position='All',sort='ppg',limit=80}={}){
 if(!WNBA_STATS.includes(sort))throw Error('Métrica WNBA não reconhecida.');
 if(!Number.isInteger(limit)||limit<1||limit>200)throw Error('Limite inválido.');
 const q=accent(query).trim();
 return WNBA_PLAYERS.filter(p=>(teamId==='All'||p.teamId===teamId)&&(position==='All'||p.role===position)&&(!q||accent(p.name).includes(q)))
   .sort((a,b)=>(sort==='ovr'?b.ovr-a.ovr:b.stats2026[sort]-a.stats2026[sort])||a.name.localeCompare(b.name)).slice(0,limit);
}
export function wnbaTeamSnapshot(teamId){
 const team=WNBA_BY_ID.get(teamId);if(!team)throw Error('Franquia WNBA desconhecida.');
 const roster=wnbaRoster(teamId);
 const avg=fn=>Number((roster.reduce((sum,p)=>sum+fn(p),0)/roster.length).toFixed(2));
 return {id:team.id,name:team.fullName,conference:team.conference,colors:team.colors,size:roster.length,
  overallTop5:avgTop(roster,5,p=>p.ovr),overallAll:avg(p=>p.ovr),
  ppgTotal:Number(roster.reduce((s,p)=>s+p.stats2026.ppg,0).toFixed(1)),
  topScorer:[...roster].sort((a,b)=>b.stats2026.ppg-a.stats2026.ppg)[0],
  positionCounts:Object.fromEntries(['G','F','C'].map(pos=>[pos,roster.filter(p=>p.role===pos).length])),
  roster};
}
const avgTop=(list,n,f)=>Number(([...list].sort((a,b)=>f(b)-f(a)).slice(0,n).reduce((s,p)=>s+f(p),0)/Math.min(n,list.length)).toFixed(2));
export function wnbaLeagueSnapshot(){return WNBA_TEAMS.map(t=>wnbaTeamSnapshot(t.id)).sort((a,b)=>b.overallTop5-a.overallTop5||a.name.localeCompare(b.name));}
export function wnbaComparePlayers(id1,id2){
 const a=WNBA_PLAYERS.find(p=>String(p.id)===String(id1)),b=WNBA_PLAYERS.find(p=>String(p.id)===String(id2));
 if(!a||!b||a.id===b.id)throw Error('Selecione duas jogadoras diferentes.');
 const groups=[['Pontuação','ppg'],['Rebotes','rpg'],['Assistências','apg']].map(([label,key])=>({label,a:a.stats2026[key],b:b.stats2026[key],diff:Number((a.stats2026[key]-b.stats2026[key]).toFixed(1))}));
 const ratings=[['Criação','shotCreation'],['Três pontos','threePoint'],['Passe','passing'],['Defesa','perimeterDefense'],['Rebotes','defensiveRebounding']].map(([label,key])=>({label,a:a.attributes[key],b:b.attributes[key]}));
 return {a,b,groups,ratings,source:'2026 snapshot / simulator ratings'};
}
export function wnbaCsv(values,columns){
 const escape=v=>`"${String(v??'').replace(/"/g,'""')}"`;
 return '\uFEFF'+[columns.map(c=>escape(c.label)).join(','),...values.map(v=>columns.map(c=>escape(c.value(v))).join(','))].join('\r\n');
}
