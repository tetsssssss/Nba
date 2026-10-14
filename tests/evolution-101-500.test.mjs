import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRng } from '../src/core/rng.js';
import { blankRoster, defaultRoster, addPlayer, removePlayer, validateRoster, readRoster, writeRoster, rosterTeams, ARCADE_STORAGE_KEY } from '../src/arcade/rosters.js';
import { allStarSelections, allStarTeam, captainsDraft, threePointRound, threePointContest, dunkContest } from '../src/arcade/all-star.js';
import { newStreetGame, streetPossession, simulateStreet } from '../src/arcade/street.js';
import { createTournament, runTournament } from '../src/arcade/tournament.js';
import { ATTRIBUTE_KEYS } from '../src/players/attributes.js';
import { buildPlayers, buildTeams } from '../src/core/universe.js';
const attrs = Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 76]));
const players = Array.from({ length: 64 }, (_, i) => ({ id: i+1, name:`Atleta ${i+1}`, teamId:`T${Math.floor(i/8)}`, positions:['PG'], ovr:98-i,
  attributes:{...attrs, threePoint:50+i%40,dunk:60+i%35,vertical:72}, injury:null }));
const teams = Array.from({length:8},(_,i)=>({id:`T${i}`,name:`Clube ${i}`,fullName:`Clube ${i}`,conference:i<4?'East':'West',colors:['#123456','#ffffff']}));
const squads = teams.map(t=>({...t,roster:players.filter(p=>p.teamId===t.id)}));
const streetTeams = [0,1].map((side)=>({...squads[side],roster:squads[side].roster.slice(0,3)}));
const clone = (o) => structuredClone(o);
const local = () => {const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)};};

test('E101: roster padrão possui versão conhecida',()=>assert.equal(blankRoster().version,1));
test('E102: roster padrão forma dez atletas em cada equipe',()=>assert.deepEqual(defaultRoster(players).teams.map(t=>t.playerIds.length),[10,10]));
test('E103: roster deve ter exatamente dois times',()=>assert.throws(()=>validateRoster({version:1,teams:[]},players),/formato/));
test('E104: versão desconhecida é rejeitada',()=>assert.throws(()=>validateRoster({...blankRoster(),version:2},players),/versão/));
test('E105: nome malicioso não passa validação',()=>{const r=blankRoster();r.teams[0].name='<img onerror=alert(1)>';assert.throws(()=>validateRoster(r,players),/nome/);});
test('E106: cor CSS maliciosa não passa',()=>{const r=blankRoster();r.teams[0].colors[0]='red;display:none';assert.throws(()=>validateRoster(r,players),/cores/);});
test('E107: ID de atleta desconhecido é rejeitado',()=>{const r=blankRoster();r.teams[0].playerIds=['999999'];assert.throws(()=>validateRoster(r,players),/desconhecido/);});
test('E108: mesmo jogador não pode jogar pelos dois times',()=>{const r=blankRoster();r.teams[0].playerIds=['1'];r.teams[1].playerIds=['1'];assert.throws(()=>validateRoster(r,players),/duplicado/);});
test('E109: cada elenco tem limite de 15',()=>{const r=blankRoster();r.teams[0].playerIds=players.slice(0,16).map(p=>String(p.id));assert.throws(()=>validateRoster(r,players),/quantidade/);});
test('E110: adiciona atleta sem mutar input',()=>{const r=blankRoster();const n=addPlayer(r,0,2,players);assert.equal(r.teams[0].playerIds.length,0);assert.deepEqual(n.teams[0].playerIds,['2']);});
test('E111: mover jogador entre os times remove origem',()=>{const r=addPlayer(blankRoster(),0,2,players);const n=addPlayer(r,1,2,players);assert.deepEqual(n.teams[0].playerIds,[]);assert.deepEqual(n.teams[1].playerIds,['2']);});
test('E112: remove atleta de todos os times',()=>{const r=addPlayer(blankRoster(),1,3,players);assert.deepEqual(removePlayer(r,3,players).teams[1].playerIds,[]);});
test('E113: elenco inválido não pode iniciar partida 5x5',()=>assert.throws(()=>rosterTeams(blankRoster(),players),/cinco/));
test('E114: elenco válido gera dois times jogáveis e pessoas existentes',()=>{const rs=rosterTeams(defaultRoster(players),players);assert.equal(rs[0].roster.length,10);assert.equal(rs[0].roster[0].name,players[0].name);});
test('E115: armazenamento usa namespace independente do save',()=>assert.match(ARCADE_STORAGE_KEY,/arcade/));
test('E116: grava e recupera roster',()=>{const st=local();const r=defaultRoster(players);writeRoster(st,r,players);assert.deepEqual(readRoster(st,players),validateRoster(r,players));});
test('E117: JSON inválido recupera preset sem sobrescrever',()=>{const st=local();st.setItem(ARCADE_STORAGE_KEY,'not-json');assert.equal(readRoster(st,players).teams[0].playerIds.length,10);});
test('E118: nem um campo é escrito em storage ao validar',()=>{let writes=0;const st={getItem:()=>null,setItem:()=>writes++};readRoster(st,players);assert.equal(writes,0);});
test('E119: seleção Leste e Oeste tem 12 atletas cada',()=>assert.deepEqual(allStarSelections(players,teams).map(p=>p.length),[12,12]));
test('E120: atletas do Leste pertencem à conferência Leste',()=>assert.ok(allStarSelections(players,teams)[0].every(p=>teams.find(t=>t.id===p.teamId).conference==='East')));
test('E121: seleções não repetem atleta',()=>assert.equal(new Set(allStarSelections(players,teams).flat().map(p=>p.id)).size,24));
test('E122: seleção não modifica jogadores',()=>{const p=clone(players);allStarSelections(players,teams);assert.deepEqual(players,p);});
test('E123: identidades All-Star distintas',()=>{const [east,west]=allStarSelections(players,teams);assert.notEqual(allStarTeam(east,'East').id,allStarTeam(west,'West',1).id);});
test('E124: draft de capitães tem 12 jogadores por time',()=>assert.deepEqual(captainsDraft(players).map(p=>p.length),[12,12]));
test('E125: draft de capitães não repete nomes',()=>assert.equal(new Set(captainsDraft(players).flat().map(p=>p.id)).size,24));
test('E126: draft de capitães rejeita elenco curto',()=>assert.throws(()=>captainsDraft(players.slice(0,10)),/insuficientes/));
test('E127: concurso de três tem 5 racks de 5 bolas',()=>assert.deepEqual(threePointRound(players[0],'x').racks.map(r=>r.length),[5,5,5,5,5]));
test('E128: concurso de três nunca pontua mais que 30',()=>assert.ok(threePointContest(players,'x').every(r=>r.points<=30 && r.points>=0)));
test('E129: concurso de três é reprodutível',()=>assert.deepEqual(threePointContest(players,'abc'),threePointContest(players,'abc')));
test('E130: concurso de enterradas tem duas tentativas',()=>assert.ok(dunkContest(players).every(r=>r.attempts.length===2)));
test('E131: nota de enterrada respeita 25 a 50',()=>assert.ok(dunkContest(players).every(r=>r.attempts.every(v=>v>=25&&v<=50))));
test('E132: contest não modifica banco de atletas',()=>{const p=clone(players);threePointContest(players);dunkContest(players);assert.deepEqual(p,players);});
test('E133: Street 3x3 inicializa com placar zerado',()=>assert.deepEqual(newStreetGame(streetTeams).score,[0,0]));
test('E134: Street 1x1 é permitido',()=>assert.equal(newStreetGame(streetTeams.map(t=>({...t,roster:t.roster.slice(0,1)})),{squadSize:1}).squadSize,1));
test('E135: Street 2x2 é permitido',()=>assert.equal(newStreetGame(streetTeams.map(t=>({...t,roster:t.roster.slice(0,2)})),{squadSize:2}).squadSize,2));
test('E136: Street rejeita jogadores repetidos',()=>assert.throws(()=>newStreetGame([streetTeams[0],{...streetTeams[1],roster:[...streetTeams[1].roster.slice(0,2),streetTeams[0].roster[0]]}]),/repetido/));
test('E137: Street rejeita formato inválido',()=>assert.throws(()=>newStreetGame(streetTeams,{squadSize:4}),/formato/));
test('E138: Street rejeita alvo inválido',()=>assert.throws(()=>newStreetGame(streetTeams,{target:9}),/meta/));
test('E139: Street avança posse sem alterar estado original',()=>{const a=newStreetGame(streetTeams);const b=streetPossession(a);assert.equal(a.possessions,0);assert.equal(b.possessions,1);});
test('E140: Street contém eventos com placar',()=>{const b=streetPossession(newStreetGame(streetTeams));assert.equal(b.events[0].score.length,2);});
test('E141: Street sempre se encerra e declara vencedor',()=>{const b=simulateStreet(newStreetGame(streetTeams,{seed:'case',target:11}));assert.equal(b.over,true);assert.ok([0,1].includes(b.winner));});
test('E142: Street não termina com placar menor que a meta',()=>{const b=simulateStreet(newStreetGame(streetTeams,{seed:'case'}));assert.ok(b.score[b.winner]>=21);});
test('E143: Street vence por dois ou ao alcançar teto de 25',()=>{const b=simulateStreet(newStreetGame(streetTeams,{seed:'case'}));assert.ok(b.score[b.winner]-b.score[1-b.winner]>=2 || b.score[b.winner]>=25);});
test('E144: Street a mesma semente produz mesmo placar e ações',()=>{const a=simulateStreet(newStreetGame(streetTeams,{seed:'fixed'}));const b=simulateStreet(newStreetGame(streetTeams,{seed:'fixed'}));assert.deepEqual(a.score,b.score);assert.deepEqual(a.events,b.events);});
test('E145: Street estatísticas fecham com placar',()=>{const b=simulateStreet(newStreetGame(streetTeams,{seed:'box'}));for(const i of [0,1])assert.equal(Object.values(b.box[i]).reduce((s,r)=>s+r.pts,0),b.score[i]);});
test('E146: Street posse após final não altera estado',()=>{const b=simulateStreet(newStreetGame(streetTeams,{seed:'final'}));assert.equal(streetPossession(b),b);});
test('E147: Street mesmo com tática externa pontua até o fim',()=>assert.equal(simulateStreet(newStreetGame(streetTeams,{seed:'long'}),{tactic:'outside'}).over,true));
test('E148: copa aceita 4 franquias',()=>assert.equal(createTournament(squads.slice(0,4)).teamIds.length,4));
test('E149: copa aceita 8 franquias',()=>assert.equal(createTournament(squads).teamIds.length,8));
test('E150: copa rejeita 3 franquias',()=>assert.throws(()=>createTournament(squads.slice(0,3)),/4 ou 8/));
test('E151: copa rejeita franquias duplicadas',()=>assert.throws(()=>createTournament([squads[0],squads[0],squads[1],squads[2]]),/repita/));
test('E152: copa rejeita elenco curto',()=>assert.throws(()=>createTournament([{...squads[0],roster:squads[0].roster.slice(0,3)},...squads.slice(1,4)]),/cinco/));
test('E153: copa de 4 gera duas rodadas e campeão',()=>{const t=runTournament(squads.slice(0,4),{seed:'g1'});assert.equal(t.rounds.length,2);assert.equal(t.rounds[0].length,2);assert.equal(t.rounds[1].length,1);assert.ok(t.teamIds.includes(t.champion));});
test('E154: copa de 8 gera 4/2/1 partidas',()=>assert.deepEqual(runTournament(squads,{seed:'g1'}).rounds.map(r=>r.length),[4,2,1]));
test('E155: copa é determinística para mesma semente',()=>assert.deepEqual(runTournament(squads,{seed:'fixed'}),runTournament(squads,{seed:'fixed'})));
test('E156: copa não modifica elencos de origem',()=>{const before=clone(squads);runTournament(squads.slice(0,4),{seed:'x'});assert.deepEqual(squads,before);});
test('E157: copa sempre declara vencedor existente em cada confronto',()=>{const t=runTournament(squads,{seed:'z'});assert.ok(t.rounds.every(round=>round.every(g=>[g.home,g.away].includes(g.winner))));});
test('E158: copa não termina empatada',()=>{const t=runTournament(squads,{seed:'z'});assert.ok(t.rounds.every(round=>round.every(g=>g.score[0]!==g.score[1])));});
test('E159: partida com seed numérica é aceita pelo gerador',()=>assert.ok(createRng(12).next()>=0));

test('E160: seed original gera convocações All-Star sem IDs repetidos',()=>{
  const cwd=new URL('../data/seed/',import.meta.url);
  const seed={players:JSON.parse(readFileSync(new URL('players.json',cwd))),ratings:JSON.parse(readFileSync(new URL('ratings.json',cwd))),contracts:JSON.parse(readFileSync(new URL('contracts.json',cwd))),
    teams:JSON.parse(readFileSync(new URL('teams.json',cwd))),franchises:JSON.parse(readFileSync(new URL('../static/franchises.json',cwd))),history:{}};
  const pool=buildPlayers(seed);const t=buildTeams(seed);const picks=allStarSelections(pool,t);
  assert.equal(picks[0].length,12); assert.equal(picks[1].length,12); assert.equal(new Set(picks.flat().map(p=>p.id)).size,24);
});

test('E161: fantasy draft forma duas equipes diferentes',async()=>{
  const { fantasyDraft }=await import('../src/arcade/rosters.js');const r=fantasyDraft(players,'seed');
  assert.deepEqual(r.teams.map(t=>t.playerIds.length),[10,10]);
  assert.equal(new Set(r.teams.flatMap(t=>t.playerIds)).size,20);
});
test('E162: fantasy draft respeita semente',async()=>{
  const { fantasyDraft }=await import('../src/arcade/rosters.js');
  assert.deepEqual(fantasyDraft(players,'seed'),fantasyDraft(players,'seed'));
});
test('E163: fantasy draft não modifica banco',async()=>{
  const { fantasyDraft }=await import('../src/arcade/rosters.js');const orig=clone(players);fantasyDraft(players,'seed');assert.deepEqual(players,orig);
});

test('E164: MVP fictício exige box score',async()=>{
  const {exhibitionMvp}=await import('../src/arcade/all-star.js');assert.equal(exhibitionMvp(null),null);
});
test('E165: MVP de amistoso usa pontos, rebotes e assistências',async()=>{
  const {exhibitionMvp}=await import('../src/arcade/all-star.js');
  const record={box:[{players:[{id:1,name:'A',pts:22,orb:2,drb:5,ast:3},{id:2,name:'B',pts:18,orb:5,drb:8,ast:12}]},{players:[]}]};
  assert.equal(exhibitionMvp(record).name,'B');
});

test('E166: elencos All-Star reais inicializam no motor 2D',async()=>{
  const {MatchSim}=await import('../src/match/sim.js');
  const cwd=new URL('../data/seed/',import.meta.url);
  const seed={players:JSON.parse(readFileSync(new URL('players.json',cwd))),ratings:JSON.parse(readFileSync(new URL('ratings.json',cwd))),contracts:JSON.parse(readFileSync(new URL('contracts.json',cwd))),
    teams:JSON.parse(readFileSync(new URL('teams.json',cwd))),franchises:JSON.parse(readFileSync(new URL('../static/franchises.json',cwd))),history:{}};
  const pool=buildPlayers(seed),t=buildTeams(seed);
  const sim=new MatchSim(allStarSelections(pool,t).map((arr,i)=>allStarTeam(arr,i===0?'East':'West',i)),{seed:'allstar-e2e',quiet:true,quarterSeconds:180});
  sim.advance(3);
  assert.deepEqual(sim.teams.map(x=>x.lineup.length),[5,5]);assert.ok(sim.clock<180);
});
test('E167: elenco do editor inicializa no motor 2D',async()=>{
  const {MatchSim}=await import('../src/match/sim.js');
  const sim=new MatchSim(rosterTeams(defaultRoster(players),players),{seed:'roster-e2e',quiet:true,quarterSeconds:180});
  sim.advance(3);
  assert.deepEqual(sim.teams.map(x=>x.lineup.length),[5,5]);
});

test('E168: Circuito Street 4 trios gera duas rodadas',async()=>{
  const {runStreetCircuit}=await import('../src/arcade/street.js');
  const squads=Array.from({length:4},(_,i)=>({id:`S${i}`,roster:players.slice(i*3,i*3+3)}));
  const t=runStreetCircuit(squads,{seed:'test'});assert.deepEqual(t.rounds.map(r=>r.length),[2,1]);
});
test('E169: Circuito Street 8 trios gera três rodadas',async()=>{
  const {runStreetCircuit}=await import('../src/arcade/street.js');
  const squads=Array.from({length:8},(_,i)=>({id:`S${i}`,roster:players.slice(i*3,i*3+3)}));
  const t=runStreetCircuit(squads,{seed:'test'});assert.deepEqual(t.rounds.map(r=>r.length),[4,2,1]);
});
test('E170: Circuito Street rejeita mesmo atleta em dois trios',async()=>{
  const {runStreetCircuit}=await import('../src/arcade/street.js');
  const squads=Array.from({length:4},(_,i)=>({id:`S${i}`,roster:players.slice(i*3,i*3+3)}));squads[3].roster[0]=players[0];
  assert.throws(()=>runStreetCircuit(squads),/atletas repetidos/);
});
test('E171: Circuito Street vencedor sempre é um trio original',async()=>{
  const {runStreetCircuit}=await import('../src/arcade/street.js');
  const squads=Array.from({length:4},(_,i)=>({id:`S${i}`,roster:players.slice(i*3,i*3+3)}));
  const t=runStreetCircuit(squads,{seed:'x'});assert.ok(squads.some(x=>x.id===t.champion));
});
test('E172: Circuito Street é determinístico',async()=>{
  const {runStreetCircuit}=await import('../src/arcade/street.js');
  const squads=Array.from({length:4},(_,i)=>({id:`S${i}`,roster:players.slice(i*3,i*3+3)}));
  assert.deepEqual(runStreetCircuit(squads,{seed:'stable'}),runStreetCircuit(squads,{seed:'stable'}));
});
