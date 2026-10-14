import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WNBA_TEAMS, WNBA_PLAYERS, WNBA_BY_ID, WNBA_SNAPSHOT, WNBA_PHOTO_IDS, wnbaRoster, wnbaAttributes, wnbaPhotoUrl } from '../src/wnba/catalog.js';
import { wnbaMatchTeams, simulateWnbaExhibition, wnbaAllStars, wnbaCup } from '../src/wnba/engine.js';
import { resolvePlayerImage } from '../src/media/photos.js';
import { ATTRIBUTE_KEYS } from '../src/players/attributes.js';
import { MatchSim } from '../src/match/sim.js';
import { newStreetGame, streetPossession, simulateStreet } from '../src/arcade/street.js';

const names = new Set(WNBA_PLAYERS.map(p=>p.name));
const get = name => WNBA_PLAYERS.find(p=>p.name===name);
const team = code => WNBA_BY_ID.get(`W${code}`);
const quick = (a='WIND',b='WLVA',seed='test-26')=>simulateWnbaExhibition(a,b,{seed});
const streetTeams = (size=3) => ['WIND','WLVA'].map(id=>({id,name:WNBA_BY_ID.get(id).fullName,roster:wnbaRoster(id).slice(0,size)}));
const matchTeams = (a='WIND',b='WLVA')=>[a,b].map(id=>({...WNBA_BY_ID.get(id),roster:wnbaRoster(id)}));

// Core catalog and provenance
for(const [title,run] of [
 ['15 WNBA franchises',()=>assert.equal(WNBA_TEAMS.length,15)],
 ['2026 has seven East and eight West',()=>assert.deepEqual([WNBA_TEAMS.filter(t=>t.conference==='East').length,WNBA_TEAMS.filter(t=>t.conference==='West').length],[7,8])],
 ['Toronto Tempo and Portland Fire are present',()=>assert.ok(team('TOR')&&team('POR'))],
 ['182 documented WNBA athletes',()=>assert.equal(WNBA_PLAYERS.length,182)],
 ['unique franchise identifiers',()=>assert.equal(new Set(WNBA_TEAMS.map(t=>t.id)).size,WNBA_TEAMS.length)],
 ['unique player identifiers',()=>assert.equal(new Set(WNBA_PLAYERS.map(p=>p.id)).size,WNBA_PLAYERS.length)],
 ['no duplicate player names',()=>assert.equal(names.size,WNBA_PLAYERS.length)],
 ['each franchise has >= 5 women',()=>assert.ok(WNBA_TEAMS.every(t=>wnbaRoster(t.id).length>=5))],
 ['each athlete references a real WNBA team',()=>assert.ok(WNBA_PLAYERS.every(p=>WNBA_BY_ID.has(p.teamId)))],
 ['every player is marked WNBA',()=>assert.ok(WNBA_PLAYERS.every(p=>p.league==='WNBA'))],
 ['snapshot version recorded',()=>assert.match(WNBA_SNAPSHOT,/2026-/)],
 ['every franchise has an official source',()=>assert.ok(WNBA_TEAMS.every(t=>/^https:\/\/[a-z]+\.wnba\.com\/roster$/.test(t.rosterSource)))],
 ['stable WNBA names',()=>assert.ok(names.has("A'ja Wilson")&&names.has('Caitlin Clark')&&names.has('Paige Bueckers'))],
 ['known source mapping for signature players',()=>assert.equal(get("A'ja Wilson").teamId,'WLVA')],
 ['Fever star Caitlin Clark',()=>assert.equal(get('Caitlin Clark').teamId,'WIND')],
 ['Paige Bueckers with Wings',()=>assert.equal(get('Paige Bueckers').teamId,'WDAL')],
 ['Breanna Stewart with Liberty',()=>assert.equal(get('Breanna Stewart').teamId,'WNYL')],
 ['WNBA game ratings are not official',()=>assert.ok(WNBA_PLAYERS.every(p=>p.ratingSource==='simulated-WNBA-v1'))],
 ['valid positions for all WNBA players',()=>assert.ok(WNBA_PLAYERS.every(p=>['PG','SG','SF','PF','C'].includes(p.positions[0])))],
 ['attributes are finite and bounded',()=>assert.ok(WNBA_PLAYERS.every(p=>ATTRIBUTE_KEYS.every(k=>Number.isFinite(p.attributes[k])&&p.attributes[k]>=18&&p.attributes[k]<=97)))],
 ['all women have nonnegative reference stats',()=>assert.ok(WNBA_PLAYERS.every(p=>Object.values(p.stats2026).every(x=>Number.isFinite(x)&&x>=0)))],
 ['attributes repeat deterministically',()=>{const p=get('Caitlin Clark');assert.deepEqual(wnbaAttributes({name:p.name,position:p.role,...p.stats2026}),p.attributes)}],
 ['attributes have role differentiation',()=>assert.notDeepEqual(get('Caitlin Clark').attributes,get('A\'ja Wilson').attributes)],
 ['OVR bounded for all',()=>assert.ok(WNBA_PLAYERS.every(p=>p.ovr>=50&&p.ovr<=96))],
 ['official photo map includes >= 25',()=>assert.ok(Object.keys(WNBA_PHOTO_IDS).length>=25)],
 ['WNBA headshots use WNBA not NBA server',()=>{const p=get('Caitlin Clark');assert.match(wnbaPhotoUrl(p),/^https:\/\/cdn\.wnba\.com\/headshots\/wnba\/latest\/260x190\/\d+\.png$/);assert.ok(!resolvePlayerImage(p)[0].includes('nba.com/headshots/nba/latest/'))}],
 ['unidentified photo safely uses neutral placeholder',()=>{const p=WNBA_PLAYERS.find(p=>!p.wnbaId);assert.ok(p);assert.ok(resolvePlayerImage(p)[0].startsWith('data:image/svg+xml'))}],
 ['no WNBA photos for unverified players',()=>assert.ok(WNBA_PLAYERS.filter(p=>!p.wnbaId).every(p=>wnbaPhotoUrl(p)===null))],
 ['photo IDs match WNBA athlete name map',()=>assert.ok(WNBA_PLAYERS.every(p=>p.wnbaId=== (WNBA_PHOTO_IDS[p.name]??null)))],
 ])test(title,run);

// Isolated WNBA game
for(const [title,run] of [
 ['WNBA game has 40-minute regulation',()=>assert.deepEqual(quick().rules,{periods:4,periodMinutes:10,shotClock:24})],
 ['WNBA game has four regulation period scores',()=>assert.equal(quick().quarters[0].length>=4,true)],
 ['WNBA game has stable seed',()=>assert.deepEqual(quick(),quick())],
 ['WNBA different seed produces different events',()=>assert.notDeepEqual(quick('WIND','WLVA','A').score.concat(quick('WIND','WLVA','A').events),quick('WIND','WLVA','B').score.concat(quick('WIND','WLVA','B').events))],
 ['quarter totals match team points',()=>assert.deepEqual(quick().quarters.map(q=>q.reduce((a,b)=>a+b,0)),quick().score)],
 ['all player box points sum to scoreboard',()=>assert.deepEqual(quick().box.map(rows=>rows.reduce((s,p)=>s+p.pts,0)),quick().score)],
 ['all player lines have legal shooting columns',()=>assert.ok(quick().box.flat().every(p=>p.fgm<=p.fga&&p.tpm<=p.tpa&&p.tpm<=p.fgm&&p.ftm<=p.fta))],
 ['draw resolved by OT',()=>assert.notEqual(quick().score[0],quick().score[1])],
 ['winner consistent with score',()=>{const g=quick();assert.equal(g.winner,g.teams[g.score[0]>g.score[1]?0:1].id)}],
 ['WNBA results explicitly not persisted',()=>assert.equal(quick().persisted,false)],
 ['WNBA game rejects duplicate franchise',()=>assert.throws(()=>quick('WIND','WIND'))],
 ['WNBA game rejects nonexistent franchise',()=>assert.throws(()=>quick('WXXX','WLVA'))],
 ['WNBA game rejects absurd pace',()=>assert.throws(()=>simulateWnbaExhibition('WIND','WLVA',{possessionsPerTeam:200}))],
 ['WNBA game handles low allowed pace',()=>assert.ok(simulateWnbaExhibition('WIND','WLVA',{possessionsPerTeam:32}).score[0]>=0)],
 ['WNBA roster match resolves 2 valid teams',()=>assert.equal(wnbaMatchTeams('WIND','WLVA').length,2)],
 ['WNBA All-Stars each conference 10 unique',()=>{const east=wnbaAllStars('East'),west=wnbaAllStars('West');assert.equal(east.length,10);assert.equal(west.length,10);assert.equal(new Set([...east,...west].map(p=>p.id)).size,20)}],
 ['WNBA All-Stars sorted by estimated OVR',()=>assert.ok(wnbaAllStars('East').every((p,i,a)=>i===0||a[i-1].ovr>=p.ovr))],
 ['WNBA All-Stars reject unknown conference',()=>assert.throws(()=>wnbaAllStars('South'))],
 ['4-team WNBA Cup advances correct rounds',()=>{const c=wnbaCup(WNBA_TEAMS.slice(0,4).map(t=>t.id));assert.equal(c.rounds.length,2);assert.deepEqual(c.rounds.map(r=>r.length),[2,1]);assert.ok(WNBA_BY_ID.has(c.champion))}],
 ['8-team WNBA Cup advances correct rounds',()=>{const c=wnbaCup(WNBA_TEAMS.slice(0,8).map(t=>t.id));assert.deepEqual(c.rounds.map(r=>r.length),[4,2,1])}],
 ['WNBA Cup rejects duplicate franchises',()=>assert.throws(()=>wnbaCup(['WIND','WLVA','WIND','WNYL']))],
 ['WNBA Cup reproducible',()=>assert.deepEqual(wnbaCup(WNBA_TEAMS.slice(0,8).map(t=>t.id)),wnbaCup(WNBA_TEAMS.slice(0,8).map(t=>t.id)))],
 ['WNBA Cup does not save anything',()=>assert.equal(wnbaCup(WNBA_TEAMS.slice(0,4).map(t=>t.id)).persisted,false)],
 ['2D WNBA MatchSim has five players per side',()=>{const sim=new MatchSim(matchTeams(),{seed:'wnba2d',quarterSeconds:600});assert.deepEqual(sim.teams.map(t=>t.lineup.length),[5,5]);assert.equal(sim.quarterSeconds,600)}],
 ['2D WNBA MatchSim updates without exceptions',()=>{const sim=new MatchSim(matchTeams(),{seed:'wnba2d',quarterSeconds:600});for(let i=0;i<30;i++)sim.step();assert.ok(sim.t>0)}],
 ['2D WNBA Allstar 10 versus 10 initializes',()=>{const east=wnbaAllStars('East'),west=wnbaAllStars('West');const sim=new MatchSim([{id:'east',name:'East',colors:['#ab7cce','#fff'],roster:east},{id:'west',name:'West',colors:['#ecbcb5','#fff'],roster:west}],{seed:'all-star-wnba',quarterSeconds:600});assert.deepEqual(sim.teams.map(t=>t.lineup.length),[5,5])}],
 ])test(title,run);

// Reused isolated Street engine
for(const [title,run] of [
 ['WNBA Street 1x1',()=>assert.equal(newStreetGame(streetTeams(1),{squadSize:1}).squadSize,1)],
 ['WNBA Street 2x2',()=>assert.equal(newStreetGame(streetTeams(2),{squadSize:2}).squadSize,2)],
 ['WNBA Street 3x3',()=>assert.equal(newStreetGame(streetTeams(3),{squadSize:3}).squadSize,3)],
 ['WNBA Street possession legal',()=>{const g=newStreetGame(streetTeams());const n=streetPossession(g);assert.equal(n.possessions,1);assert.ok(n.score.every(x=>x>=0))}],
 ['WNBA Street reaches 11',()=>{const g=simulateStreet(newStreetGame(streetTeams(),{target:11}));assert.equal(g.over,true);assert.ok([0,1].includes(g.winner))}],
 ['WNBA Street reaches 21',()=>{const g=simulateStreet(newStreetGame(streetTeams(),{target:21}));assert.equal(g.over,true);assert.ok([0,1].includes(g.winner))}],
 ['WNBA Street deterministic',()=>assert.deepEqual(simulateStreet(newStreetGame(streetTeams(),{seed:'same'})),simulateStreet(newStreetGame(streetTeams(),{seed:'same'})))],
 ['WNBA Street rejects duplicated player',()=>{const t=streetTeams();t[1].roster[1]=t[0].roster[0];assert.throws(()=>newStreetGame(t))}],
 ['WNBA modes do not import world, career or saves',()=>{const source=readFileSync(new URL('../src/ui/views/wnba.js',import.meta.url),'utf8');assert.ok(!/from ['"].*(?:\/core\/world|\/core\/saves|\/season\/season)/.test(source));assert.match(source,/isolated:true/)}],
 ])test(title,run);

// WNBA All-Star weekend shooting exhibition, isolated and reproducible
import { threePointContest } from '../src/arcade/all-star.js';
for (const [title,run] of [
 ['WNBA three-point contest includes 8 shooters',()=>assert.equal(threePointContest(WNBA_PLAYERS,'wnba-2026').length,8)],
 ['WNBA three-point contest points 0..30',()=>assert.ok(threePointContest(WNBA_PLAYERS).every(p=>p.points>=0&&p.points<=30))],
 ['WNBA three-point contest is seeded',()=>assert.deepEqual(threePointContest(WNBA_PLAYERS,'seed1'),threePointContest(WNBA_PLAYERS,'seed1'))],
 ['WNBA three-point results sorted',()=>assert.ok(threePointContest(WNBA_PLAYERS).every((p,i,arr)=>i===0||arr[i-1].points>=p.points))],
 ['WNBA quick engine mean scores plausibility smoke',()=>{let total=0;for(let i=0;i<60;i++){const g=quick('WIND','WLVA',`pace-check-${i}`);total+=g.score[0]+g.score[1]}const mean=total/120;assert.ok(mean>65&&mean<95,`WNBA avg pts/team ${mean}`)}],
])test(title,run);
