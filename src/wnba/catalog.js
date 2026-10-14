// Snapshot 2026, WNBA official team rosters. Independent of the NBA career seed.
// PPG/RPG/APG are 2026 official team roster display figures, used only as a calibration aid.
// Unlisted athletes are NOT invented; development players are identified where known.
// Attributes below are GAME RATINGS, never official WNBA ratings.
import { ATTRIBUTE_KEYS } from '../players/attributes.js';

export const WNBA_SNAPSHOT = '2026-10-08';
// Official 2026 conference composition: seven East, eight West.
const franchiseRows = [
 ['ATL','Atlanta','Dream','East','#E31837','#85BAEA','dream'],
 ['CHI','Chicago','Sky','East','#4B91CF','#F6D467','sky'],
 ['CON','Connecticut','Sun','East','#F37021','#052C57','sun'],
 ['DAL','Dallas','Wings','West','#0C2340','#C4D600','wings'],
 ['GSV','Golden State','Valkyries','West','#9C7BEA','#17172B','valkyries'],
 ['IND','Indiana','Fever','East','#E03A3E','#F5BD36','fever'],
 ['LVA','Las Vegas','Aces','West','#B72A2A','#1A1A1A','aces'],
 ['LAS','Los Angeles','Sparks','West','#642F96','#F3AC36','sparks'],
 ['MIN','Minnesota','Lynx','West','#236192','#72C8E7','lynx'],
 ['NYL','New York','Liberty','East','#6ECEB2','#15191B','liberty'],
 ['PHX','Phoenix','Mercury','West','#E56020','#2B1355','mercury'],
 ['POR','Portland','Fire','West','#E6543B','#24242E','fire'],
 ['SEA','Seattle','Storm','West','#2D9B69','#F0E96D','storm'],
 ['TOR','Toronto','Tempo','East','#D53B51','#D6C6F9','tempo'],
 ['WAS','Washington','Mystics','East','#DF3037','#213B76','mystics'],
];
export const WNBA_TEAMS = franchiseRows.map(([id,city,name,conference,c1,c2,slug])=>({
 id:`W${id}`,shortId:id,city,name,fullName:`${city} ${name}`,conference,colors:[c1,c2],rosterSource:`https://${slug}.wnba.com/roster`,record:{wins:0,losses:0},league:'WNBA',
}));

// official roster names and statistical labels. Format: name | role | PPG | RPG | APG
// Names are transcribed from WNBA 2026 official franchise roster pages.
const rows = {
 ATL:`Naz Hillmon|F|9.1|4.6|1.6;Te-Hina Paopao|G|3.7|0.8|1.4;Jordin Canada|G|11.6|3.5|7.3;Angel Reese|F|16.4|12.1|2.8;Rhyne Howard|G|17.7|3.8|3.7;Madina Okot|C|5.4|3.3|0.3;Allisha Gray|G|19.0|3.5|2.6;Isobel Borlase|G|4.8|1.5|1.0;Sika Kone|F|1.8|1.0|0.2;DeWanna Bonner|F|10.4|6.0|1.6;Shatori Walker-Kimbrough|G|1.1|0.4|0.5;Brionna Jones|C|9.3|6.1|2.1`,
 CHI:`Jacy Sheldon|G|6.4|1.4|1.8;Elizabeth Williams|C|5.2|3.6|1.4;Skylar Diggins|G|14.2|3.2|4.9;Rickea Jackson|F|18.0|4.8|2.0;DiJonai Carrington|G|8.8|3.1|0.6;Natasha Cloud|G|11.1|3.4|4.8;Kamilla Cardoso|C|14.7|8.6|2.5`,
 CON:`Diamond Miller|F|9.8|2.7|1.4;Hailey Van Lith|G|5.5|1.6|2.1;Ashlon Jackson|G|3.4|1.3|0.8;Charlisse Leger-Walker|G|7.2|2.5|3.7;Gianna Kneepkens|G|3.5|1.4|0.6;Aaliyah Edwards|F|11.1|4.7|1.0;Olivia Nelson-Ododa|C|10.1|5.9|1.6;Raegan Beers|F|4.6|3.2|0.8;Saniya Rivers|G|6.9|2.5|3.1;Kennedy Burke|F|8.8|3.2|1.4;Brittney Griner|C|13.6|5.7|2.6;Leila Lacan|G|11.4|1.9|4.4`,
 DAL:`Odyssey Sims|G|4.6|0.9|2.0;Paige Bueckers|G|20.9|4.1|5.9;Alysha Clark|F|2.6|1.7|0.7;Alanna Smith|F|6.0|3.9|1.0;Aziaha James|G|6.1|2.4|1.3;Maddy Siegrist|F|6.5|2.7|0.9;Arike Ogunbowale|G|15.3|3.0|3.3;Li Yueru|C|3.3|2.8|0.5;Haley Jones|F|3.2|1.7|0.9;Jessica Shepard|F|14.5|11.1|5.3;Kitija Laksa|G|3.0|1.8|0.0;Awak Kuier|F|6.3|3.9|1.0;Azzi Fudd|G|13.1|1.7|1.8`,
 GSV:`Gabby Williams|F|14.4|3.3|2.2;Kaitlyn Chen|G|7.2|1.1|1.9;Laeticia Amihere|F|3.9|3.0|1.0;Juste Jocyte|G|3.1|0.8|1.1;Kayla Thornton|F|7.7|4.5|0.7;Kaila Charles|G|6.3|4.7|1.4;Iliana Rupert|C|0|0|0;Janelle Salaun|F|12.7|4.0|1.2;Tiffany Hayes|G|9.0|2.0|2.5;Veronica Burton|G|12.2|3.6|5.7;Cecilia Zandalasini|F|8.6|2.1|1.7;Kiah Stokes|C|3.6|5.8|1.3`,
 IND:`Kelsey Mitchell|G|24.7|1.7|2.8;Myisha Hines-Allen|F|3.8|3.3|1.5;Raven Johnson|G|3.1|1.7|1.2;Mercedes Russell|C|1.6|1.1|0.6;Aliyah Boston|C|16.1|8.0|3.0;Sophie Cunningham|G|7.9|2.3|1.2;Lexie Hull|G|5.2|3.0|0.7;Damiris Dantas|C|3.3|1.5|0.3;Grace VanSlooten|F|1.8|0.6|0.2;Makayla Timpson|F|5.7|4.9|0.5;Caitlin Clark|G|22.3|4.0|8.3;Monique Billings|F|6.5|4.8|1.0;Tyasha Harris|G|4.1|1.1|2.0`,
 LVA:`Jackie Young|G|18.9|4.4|6.8;Kierstan Bell|F|1.9|1.4|0.6;Janiah Barker|F|0|0|0;NaLyssa Smith|F|11.7|6.4|0.9;Stephanie Talbot|F|4.0|2.6|1.0;Dana Evans|G|3.6|1.4|2.1;Chelsea Gray|G|12.0|3.3|6.7;Mai Yamamoto|G|5.1|1.1|1.4;Kalani Brown|C|6.0|1.7|0.3;Brianna Turner|F|1.6|2.3|0.2;A'ja Wilson|C|26.2|9.4|3.2;Jewell Loyd|G|8.0|2.3|1.4;Cheyenne Parker-Tyus|F|5.4|2.9|0.7`,
 LAS:`Monique Akoa Makani|G|7.6|1.8|2.2;Chance Gray|G|3.1|1.1|1.0;Tonie Morgan|G|5.7|1.3|2.7;Dearica Hamby|F|14.5|7.0|2.4;Jihyun Park|G|2.2|1.0|0.6;Ariel Atkins|G|8.5|2.9|2.8;Rae Burrell|G|14.6|2.3|2.5;Aaliyah Nye|G|1.0|0.3|0.2;Erica Wheeler|G|9.0|1.9|5.0;Cameron Brink|F|9.5|5.0|1.5;Nneka Ogwumike|F|17.3|9.0|3.1;Emma Cannon|F|3.9|1.4|0.3`,
 MIN:`Natasha Howard|F|14.8|7.6|3.3;Liatu King|F|3.5|2.3|0.2;Maya Caldwell|G|4.1|2.4|1.1;Aari McDonald|G|7.3|0.7|2.0;Olivia Miles|G|19.8|4.7|6.0;Anastasiia Olairi Kosu|F|3.6|2.0|0.7;Antonia Delaere|G|3.0|0.8|1.1;Courtney Williams|G|13.8|4.8|4.3;Dorka Juhasz|F|3.6|3.1|1.4;Kayla McBride|G|17.6|3.0|2.2;Emma Cechova|C|8.3|3.7|0;Napheesa Collier|F|16.8|6.9|2.6`,
 NYL:`Satou Sabally|F|10.4|2.8|1.9;Marine Fauthoux|G|4.4|2.0|1.9;Rebekah Gardner|G|5.0|2.4|1.2;Rebecca Allen|F|5.8|2.6|0.6;Leonie Fiebich|F|8.8|3.0|2.1;Raquel Carrera|C|1.7|1.2|0.5;Pauline Astier|G|9.3|2.7|3.3;Sabrina Ionescu|G|14.6|3.8|4.7;Han Xu|C|6.3|2.5|0.7;Marine Johannes|G|8.2|2.0|2.4;Anneli Maley|F|0.7|1.1|0.4;Breanna Stewart|F|20.8|8.3|3.3;Jonquel Jones|C|14.5|9.1|2.6`,
 PHX:`Kelsey Plum|G|21.5|2.1|5.4;Noemie Brochant|F|6.3|2.1|1.9;Kahleah Copper|G|21.5|3.7|1.9;Natasha Mack|C|8.9|6.7|1.1;Shay Ciezki|G|8.5|1.5|1.6;Lexi Held|G|5.4|1.1|1.4;Valeriane Ayayi|F|6.3|2.8|1.3;Maddy Westbeld|F|2.6|1.8|0.6;Alyssa Thomas|F|14.3|7.8|8.5;Jovana Nogic|G|10.4|1.1|1.6;Kyara Linskens|C|3.0|2.4|0.6;Sami Whitcomb|G|5.3|1.7|2.1;Marta Suarez|F|3.5|1.5|0.4`,
 POR:`Carla Leite|G|16.1|2.2|6.3;Jordan Harrison|G|5.1|1.8|4.2;Sarah Ashlee Barker|G|10.7|4.5|2.4;Bridget Carleton|F|14.6|4.5|2.1;Teja Oblak|G|5.6|1.6|3.2;Amy Okonkwo|F|5.2|1.2|0.2;Nyadiew Puoch|F|4.3|2.2|0.8;Luisa Geiselsoder|C|4.5|2.6|1.3;Megan DiLeo|C|13.1|4.3|0.9;Frieda Buhner|F|6.3|2.1|0.7;Emily Engstler|F|10.1|5.7|2.1;Serah Williams|F|4.3|2.7|0.5;Karlie Samuelson|G|4.8|1.5|0.9`,
 SEA:`Natisha Hiedeman|G|14.7|2.5|5.0;Taylor Thierry|F|1.9|1.7|0.5;Flau'jae Johnson|G|14.9|4.8|2.9;Jade Melbourne|G|9.1|2.1|3.7;Zia Cooke|G|7.5|1.7|1.1;Awa Fam|C|10.3|5.9|1.8;Ezi Magbegor|C|6.9|4.0|1.8;Dominique Malonga|C|17.1|8.8|1.7;Jordan Horston|F|4.5|3.5|1.3;Stefanie Dolson|C|3.3|2.4|1.2;Katie Lou Samuelson|F|4.4|2.1|0.8;Mackenzie Holmes|F|2.8|2.9|0.6`,
 TOR:`Kiki Rice|G|13.4|3.7|3.5;Laura Juskaite|F|11.3|4.2|1.8;Marina Mabrey|G|20.8|3.3|3.7;Teonni Key|F|2.2|2.1|0.5;Nyara Sabally|C|12.3|5.3|1.7;Maria Conde|F|8.5|4.5|2.5;Kia Nurse|G|5.5|1.2|1.0;Temi Fagbenle|C|5.9|3.4|1.0;Brittney Sykes|G|18.6|3.5|3.4;Isabelle Harrison|F|12.8|6.9|1.5;Julie Allemand|G|6.0|3.2|5.5;Aneesah Morrow|F|11.0|8.3|1.4`,
 WAS:`Shakira Austin|C|17.0|9.5|2.6;Alicia Florez|G|3.5|1.4|1.9;Rori Harmon|G|0.8|0.5|0.9;Georgia Amoore|G|7.0|1.4|3.4;Michaela Onyenwere|F|9.0|2.6|1.7;Cassandre Prosper|F|2.1|1.0|0.4;Sonia Citron|G|16.8|3.8|4.4;Cotie McMahon|F|6.6|2.9|1.9;Angela Dugalic|F|2.7|2.2|0.6;Lucy Olsen|G|2.5|0.5|0.8;Betnijah Laney-Hamilton|G|4.5|1.9|1.9;Kiki Iriafen|F|15.3|9.6|1.5;Lauren Betts|C|6.4|4.6|1.2`,
};
// Player ID obtained from an individual WNBA player page. Other players get a
// deliberately neutral fallback, never another athlete's photograph.
const PHOTO_IDS = {
 'Rhyne Howard':1631009,'Allisha Gray':1628277,'Angel Reese':1642291,
 'Caitlin Clark':1642286,'Aliyah Boston':1641648,'Paige Bueckers':1642784,'Arike Ogunbowale':1629481,
 'Natisha Hiedeman':1629567,'Olivia Miles':1643426,'Napheesa Collier':1629483,
 'Diamond Miller':1641649,'Brittney Griner':203398,'Marina Mabrey':1629497,'Kiki Rice':1643445,
 'Jackie Young':1629498,"A'ja Wilson":1628932,'Chelsea Gray':203833,'Carla Leite':1642304,'Bridget Carleton':1629524,
 'Satou Sabally':1630149,'Sabrina Ionescu':1629477,'Breanna Stewart':1627668,
 'Shakira Austin':1631022,'Sonia Citron':1642785,'Kelsey Plum':1628276,'Kahleah Copper':1627674,
 'Nneka Ogwumike':203014,'Gabby Williams':1628931,'Veronica Burton':1631007,
 'Skylar Diggins':203400,
};
export const WNBA_PHOTO_IDS = Object.freeze(PHOTO_IDS);
export const wnbaPhotoUrl = (player, size = '260x190') => player?.wnbaId ? `https://cdn.wnba.com/headshots/wnba/latest/${size}/${player.wnbaId}.png` : null;
const clamp=(x,min=25,max=97)=>Math.max(min,Math.min(max,Math.round(x)));
function hash(input){let n=2166136261;for(const c of input){n^=c.codePointAt(0);n=Math.imul(n,16777619);}return n>>>0;}
/** Deterministic WNBA-specific GAME ratings calibrated using listed PPG/RPG/APG.
 * This is intentionally not a claim about official performance or skill assessments. */
export function wnbaAttributes({name,position,ppg,rpg,apg}) {
 const seed=hash(name),off=clamp(50+ppg*1.55,44,96),reb=clamp(43+rpg*3.6,40,92),pass=clamp(45+apg*4.6,41,95);
 const guard=position==='G',big=position==='C';
 const baseline=clamp(52+ppg*1.05+rpg*0.6+apg*0.8,49,86);
 const a=Object.fromEntries(ATTRIBUTE_KEYS.map((k,i)=>[k,clamp(baseline+((seed>>> (i%16))&7)-3)]));
 const put=(keys,value)=>keys.forEach((k)=>a[k]=clamp(value));
 put(['layup','rimFinishing','shotCreation','midRange','pullUp','offBallMovement'],off);
 put(['threePoint','catchAndShoot'],clamp(off+(guard?2:-4)));
 put(['passing','passingVision','decisionMaking','pickAndRoll','offensiveIQ'],pass);
 put(['defensiveRebounding','offensiveRebounding','interiorDefense','strength','postScoring'],reb);
 put(['ballHandling','speed','agility','acceleration','perimeterDefense'],guard?clamp(63+apg*2.1):big?clamp(47+ppg*.5):clamp(59+ppg*.5));
 put(['blocks','helpDefense'],big?clamp(52+rpg*3):clamp(44+rpg*1.5));
 put(['vertical','stamina','focus','leadership','consistency'],baseline);
 a.dunk=clamp(big?35+rpg*.5:25,18,46); // avoid transplanting NBA dunk assumptions
 return a;
}
function newPlayer(s,team,index){
 const [name,role,ppg,rpg,apg]=s.split('|');
 if(!name||!['G','F','C'].includes(role))throw Error(`Registro WNBA inválido: ${s}`);
 const position=role==='G'?(index%2?'SG':'PG'):role==='F'?(index%2?'PF':'SF'):'C';
 const stats={ppg:Number(ppg),rpg:Number(rpg),apg:Number(apg)};
 const id=PHOTO_IDS[name]??(900_000_000+(hash(`${team.shortId}:${name}`)%90_000_000));
 const attributes=wnbaAttributes({name,position:role,...stats});
 const ovr=clamp(54+(stats.ppg*1.05)+(stats.rpg*.65)+(stats.apg*.85),50,96);
 const tends={threePointFreq:role==='G'?52:role==='F'?36:11,rimAttackFreq:role==='C'?75:48,
 passFirst:clamp(20+stats.apg*8),pnrHandlerFreq:role==='G'?55:15,pnrRollFreq:role==='C'?72:35,
 crashOffensiveGlass:role==='C'?75:role==='F'?58:25,driveFreq:role==='G'?65:35,
 catchShootFreq:role==='G'?60:43,contestShots:65,pushPace:role==='G'?60:45};
 return {id,name,lastName:name.split(' ').slice(-1)[0],teamId:team.id,positions:[position],role,
 heightIn:role==='C'?77:role==='F'?73:69,weight:role==='C'?185:role==='F'?165:148,
 age:null,wnbaId:PHOTO_IDS[name]??null,photoSource:PHOTO_IDS[name]?'official':'unverified',
 attributes,tendencies:tends,ovr,position,stats2026:stats,ratingSource:'simulated-WNBA-v1',league:'WNBA'};
}
export const WNBA_PLAYERS=WNBA_TEAMS.flatMap(team=>rows[team.shortId].split(';').map((entry,index)=>newPlayer(entry,team,index)));
export const wnbaRoster=(teamId)=>WNBA_PLAYERS.filter(p=>p.teamId===teamId).sort((a,b)=>b.ovr-a.ovr);
export const WNBA_BY_ID=new Map(WNBA_TEAMS.map(t=>[t.id,t]));
export const WNBA_ROSTER_SOURCES=WNBA_TEAMS.map(t=>t.rosterSource);
