// NBB 2025/26, FIBA EuroBasket 2025, EuroLeague 2025/26: exposições avulsas.
// Identidades reais transcritas de listas de entidades esportivas; atributos são estimativas do JOGO.
// Nunca criar atletas para cobrir elencos incompletos.
import sourceTeams from './teams.json' with {type:'json'};
import photos from './photo-ids.json' with {type:'json'};
import stars from './stars.json' with {type:'json'};
import {photoRecord} from './photos.js';
import { ATTRIBUTE_KEYS } from '../players/attributes.js';

export const LEAGUE_INFO = Object.freeze({
 NBB:{name:'Novo Basquete Brasil',short:'NBB',snapshot:'2025/26',accent:'#00A76B',source:'https://lnb.com.br/equipes/',competition:'Clubes brasileiros',size:20},
 EUROLEAGUE:{name:'EuroLeague',short:'EuroLeague',snapshot:'2025/26',accent:'#E95E32',source:'https://mediacentre.euroleague.net/en/app/2/communication/communication/preview/23369',competition:'Clubes europeus',size:20},
 EUROBASKET:{name:'FIBA EuroBasket',short:'EuroBasket',snapshot:'2025',accent:'#328DE5',source:'https://www.fiba.basketball/en/news/roster-tracker-who-is-playing-at-fiba-eurobasket-2025',competition:'Seleções nacionais',size:24},
});
const clamp=(n,lo=35,hi=97)=>Math.max(lo,Math.min(hi,Math.round(n)));
const strhash=(s)=>{let h=2166136261;for (let i=0;i<s.length;i++){h=Math.imul(h^s.charCodeAt(i),16777619);}return h>>>0;};
const leaders=new Set(stars);
const colorMap={FLA:['#CF253A','#101820'],FRA:['#101820','#DDC89A'],COR:['#161616','#FFFFFF'],BRA:['#165D9B','#FAF6ED'],MIN:['#152C52','#F0F4FA'],OLY:['#C31938','#E8EBEF'],PAO:['#148E6E','#F3F3F3'],RMA:['#F5E2A3','#252F53'],BAR:['#B62944','#1D4A82'],FEN:['#E0AD31','#132E55'],CZV:['#BC2333','#F4F4F4'],GER:['#242424','#D9B74A'],SRB:['#D32635','#284F8E'],FRAe:['#2454A4','#F5F5F5'],SLO:['#2C90C7','#FAF9F3']};
function colorOf(source){let col=colorMap[source.shortId];if(col)return col;const hue=strhash(source.id)%360;return [`hsl(${hue} 53% 37%)`,`hsl(${(hue+148)%360} 66% 78%)`];}
export const INT_TEAMS=Object.freeze(sourceTeams.map(t=>Object.freeze({
 id:t.id,shortId:t.shortId,name:t.name,fullName:t.name,city:t.region,colors:colorOf(t),region:t.region,group:t.group,league:t.league,source:t.source,playersListed:t.names.length,record:{wins:0,losses:0},
}))); 
export const INT_TEAM_MAP=new Map(INT_TEAMS.map(t=>[t.id,t]));
function makePlayer(name,t,index){
 const h=strhash(`${t.id}:${name}`), famous=leaders.has(name), group=['PG','SG','SF','PF','C'][index%5],big=group==='C'||group==='PF',guard=group==='PG'||group==='SG';
 const baseline=clamp((t.league==='NBB'?66:70)+(h%13)-6+(famous?13:0),48,94);
 const a=Object.fromEntries(ATTRIBUTE_KEYS.map((key,i)=>[key,clamp(baseline+((h>>>(i%16))&7)-3)]));
 for(const key of ['threePoint','midRange','catchAndShoot','shotCreation','pullUp'])a[key]=clamp(baseline+(guard?5:-3)+(h%7)-3);
 for(const key of ['passing','passingVision','ballHandling','pickAndRoll','decisionMaking'])a[key]=clamp(baseline+(guard?7:-4));
 for(const key of ['defensiveRebounding','offensiveRebounding','interiorDefense','strength','blocks'])a[key]=clamp(baseline+(big?8:-7));
 for(const key of ['speed','agility','acceleration','perimeterDefense'])a[key]=clamp(baseline+(guard?5:-5));
 const photoId=photos[name]??null;
 const id=1000000000+(h%100000000);
 return Object.freeze({id,teamId:t.id,league:t.league,name,lastName:name.split(' ').slice(-1)[0],positions:[group],role:guard?'G':big?'C':'F',position:group,
 heightIn:big?82:guard?75:79,weight:big?220:guard?183:205,ovr:clamp(baseline),attributes:a,
 tendencies:{threePointFreq:guard?54:26,rimAttackFreq:big?66:52,passFirst:guard?58:31,pnrHandlerFreq:guard?55:12,pnrRollFreq:big?72:25,crashOffensiveGlass:big?69:25,driveFreq:guard?59:37,catchShootFreq:guard?48:37,contestShots:65,pushPace:guard?56:38},
 photoId,photoVerified:!!photoId,photoSource:photoId?'NBA public headshot':'not-verified',photoUrl:photoId?`https://cdn.nba.com/headshots/nba/latest/260x190/${photoId}.png`:null,
 ratingSource:'simulated-attributes-v1',stats2026:null});
}
export const INT_PLAYERS=Object.freeze(sourceTeams.flatMap(x=>{
 const team=INT_TEAM_MAP.get(x.id);return x.names.map((name,i)=>makePlayer(name,team,i));
}));
export const rosterOf=(teamId)=>INT_PLAYERS.filter(p=>p.teamId===teamId).sort((a,b)=>b.ovr-a.ovr);
export const leagueTeams=(league)=>INT_TEAMS.filter(t=>t.league===league);
export const playableTeams=(league)=>leagueTeams(league).filter(t=>rosterOf(t.id).length>=5);
export const eligible=(id)=>rosterOf(id).length>=5;
export function teamSpec(id){const team=INT_TEAM_MAP.get(id);if(!team)throw Error('Equipe não encontrada.');const roster=rosterOf(id);if(roster.length<5)throw Error(`${team.name} está catalogado, mas ainda não há cinco jogadores com nomes confirmados na base. Não serão criados atletas fictícios.`);return {...team,team,roster};}
export const profileImage=(p)=>p?photoRecord(p).url:null;
