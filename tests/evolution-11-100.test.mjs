import test from 'node:test';
import assert from 'node:assert/strict';
import { ATTRIBUTE_KEYS } from '../src/players/attributes.js';
import { athleteRows, filterAthletes, franchiseRows, filterFranchiseLab,
  gameRows, filterGames, gameSummary, headToHead, statisticRows, statLeaders,
  STAT_FIELDS, toCsv, LAB_STAGES, compareAthletes } from '../src/ui/lab-insights.js';
const attrs = Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 80]));
const teams = new Map([
  ['A', { id:'A', name:'A', fullName:'Águias Alpha', conference:'East', division:'Atlantic', colors:['#246'] }],
  ['B', { id:'B', name:'B', fullName:'Beta Bulls', conference:'West', division:'Pacific', colors:['#888'] }],
  ['C', { id:'C', name:'C', fullName:'C Zero', conference:'East', division:'Atlantic', colors:['#999'] }],
]);
const players = [
  {id:1,name:'Álvaro',teamId:'A',positions:['PG'],age:22,ovr:90,potential:96,country:'Brazil',attributes:{...attrs}},
  {id:2,name:'Beto',teamId:'A',positions:['C'],age:31,ovr:80,potential:85,country:'USA',attributes:{...attrs}},
  {id:3,name:'Caio',teamId:'B',positions:['SF'],age:25,ovr:70,potential:88,country:'Brazil',attributes:{...attrs}},
  {id:4,name:'Dina',teamId:null,positions:[],age:null,ovr:null,potential:null,country:'USA',attributes:{}},
];
const games = [
  {id:'g1',date:'2026-10-11',season:2026,type:'regular',home:'A',away:'B',status:'final',score:[102,101],overtimes:1},
  {id:'g2',date:'2026-10-12',season:2026,type:'regular',home:'B',away:'A',status:'final',score:[120,85],overtimes:0},
  {id:'g3',date:'2026-10-13',season:2026,type:'regular',home:'A',away:'B',status:'scheduled'},
  {id:'g4',date:'2026-10-14',season:2027,type:'regular',home:'A',away:'C',status:'final',score:[111,101]},
  {id:'g5',date:'2026-10-15',season:2026,type:'playoff',home:'A',away:'C',status:'final',score:[110,100]},
];
const playerMap = new Map(players.map((p) => [p.id,p]));
const seasonStats = [
  {playerId:1,gp:10,pts:260,ast:120,orb:10,drb:50,stl:10,blk:5,tpm:40,min:320,tov:20,fgm:100,fga:200,tpa:90},
  {playerId:2,gp:2,pts:60,ast:8,orb:3,drb:20,stl:2,blk:4,tpm:0,min:50,tov:2,fgm:25,fga:40,tpa:0},
  {playerId:99,gp:10,pts:999},
];

const row = () => athleteRows(players, teams, (p) => p.age, { godMode: true });
const game = () => gameRows(games, 2026);
test('E11: gera dados de scouting sem alterar os atletas', () => {
  const before = structuredClone(players);
  assert.equal(row().length,4);
  assert.deepEqual(players,before);
});
test('E12: busca tolera acentos e nomes compostos', () => assert.deepEqual(filterAthletes(row(),{search:'alvaro'}).map((r)=>r.id),[1]));
test('E13: filtro por conferência', () => assert.deepEqual(filterAthletes(row(),{conference:'West'}).map((r)=>r.id),[3]));
test('E14: filtro por franquia', () => assert.deepEqual(filterAthletes(row(),{team:'A'}).map((r)=>r.id),[1,2]));
test('E15: filtro por posição', () => assert.deepEqual(filterAthletes(row(),{position:'C'}).map((r)=>r.id),[2]));
test('E16: idade máxima exclui veterano', () => assert.deepEqual(filterAthletes(row(),{maxAge:25}).map((r)=>r.id),[1,3]));
test('E17: piso de overall', () => assert.deepEqual(filterAthletes(row(),{minOvr:85}).map((r)=>r.id),[1]));
test('E18: teto de overall', () => assert.deepEqual(filterAthletes(row(),{maxOvr:80}).map((r)=>r.id),[2,3]));
test('E19: potencial mínimo', () => assert.deepEqual(filterAthletes(row(),{minPotential:90}).map((r)=>r.id),[1]));
test('E20: filtro por país com string exata', () => assert.deepEqual(filterAthletes(row(),{country:'Brazil'}).map((r)=>r.id),[1,3]));
test('E21: DNA de cinco grupos não inventa atributos ausentes', () => {
  assert.equal(row()[0].groups.length,5);assert.ok(row()[0].groups.every((g)=>g.value===80));assert.ok(row()[3].groups.every((g)=>g.value===null));
});
test('E22: percentil baseado no OVR dos atletas avaliados', () => {
  assert.equal(row()[0].percentile,100);assert.equal(row()[2].percentile,0);assert.equal(row()[3].percentile,null);
});
test('E23: gap de potencial correto', () => assert.deepEqual(row().slice(0,3).map((r)=>r.gap),[6,5,18]));
test('E24: gap ausente permanece desconhecido', () => assert.equal(row()[3].gap,null));
test('E25: ordenação por potencial', () => assert.deepEqual(filterAthletes(row(),{sort:'potential'}).map((r)=>r.id),[1,3,2]));
test('E26: ordenação crescente por overall', () => assert.deepEqual(filterAthletes(row(),{sort:'ovr',direction:'asc'}).map((r)=>r.id),[3,2,1]));
test('E27: combinação de filtros resulta em interseção', () => assert.deepEqual(filterAthletes(row(),{country:'Brazil',conference:'West',minPotential:85}).map((r)=>r.id),[3]));
test('E28: campo desconhecido é preservado sem contaminar classificação', () => assert.equal(row()[3].team,'Sem franquia'));
test('E29: classificações não mutam Maps fornecidos', () => { const names=[...teams.values()].map((t)=>t.name);row();assert.deepEqual([...teams.values()].map((t)=>t.name),names);});
test('E30: scouting não inclui jogador com overall ausente no filtro', () => assert.equal(filterAthletes(row()).length,3));
const teamsRow = () => franchiseRows(teams.values(),players);
test('E31: cria três franquias mesmo com elenco vazio', () => assert.equal(teamsRow().length,3));
test('E32: núcleo é média dos cinco maiores atletas disponíveis', () => assert.equal(teamsRow()[0].core,85));
test('E33: banco desconhecido permanece nulo sem banco', () => assert.equal(teamsRow()[0].bench,null));
test('E34: franquia sem elenco não recebe força fabricada', () => { assert.equal(teamsRow()[2].core,null);assert.equal(teamsRow()[2].players,0);});
test('E35: idade média usa apenas idades válidas', () => assert.equal(teamsRow()[0].age,26.5));
test('E35b: franquias não passam o índice do array como data ao calcular idade', () => {
  const rows = franchiseRows(teams.values(), players, (player, date = '2026-10-05') => {
    assert.equal(date, '2026-10-05');
    return player.age;
  });
  assert.equal(rows[0].age, 26.5);
});
test('E36: detecta jovens com menos de 25', () => assert.equal(teamsRow()[0].youth,1));
test('E37: identifica líder de franquia', () => assert.equal(teamsRow()[0].leader.id,1));
test('E38: equipes ordenadas por núcleo', () => assert.deepEqual(filterFranchiseLab(teamsRow()).map((r)=>r.id),['A','B','C']));
test('E39: filtro textual ignora acentos', () => assert.deepEqual(filterFranchiseLab(teamsRow(),{search:'aguias'}).map((r)=>r.id),['A']));
test('E40: filtro de conferência de franquias', () => assert.deepEqual(filterFranchiseLab(teamsRow(),{conference:'West'}).map((r)=>r.id),['B']));
test('E41: isola temporada especificada', () => assert.equal(game().length,4));
test('E42: partidas sem score são agendadas', () => assert.equal(game().find((g)=>g.id==='g3').status,'scheduled'));
test('E43: placar é mandante na posição zero', () => assert.equal(game()[0].winner,'A'));
test('E44: total de pontos e margem corretos', () => { assert.equal(game()[0].total,203);assert.equal(game()[0].margin,1); });
test('E45: filtra resultados de uma franquia', () => assert.equal(filterGames(game(),{team:'C'}).length,1));
test('E46: jogos por equipe e adversário', () => assert.equal(filterGames(game(),{team:'A',opponent:'B'}).length,3));
test('E47: condição finalizada', () => assert.equal(filterGames(game(),{status:'final'}).length,3));
test('E48: fase play-in ou playoffs não altera temporada regular', () => assert.equal(filterGames(game(),{type:'playoff'}).length,1));
test('E49: seleciona jogos apertados', () => assert.deepEqual(filterGames(game(),{maxMargin:5}).map((g)=>g.id),['g1']));
test('E50: pontuação mínima respeitada', () => assert.deepEqual(filterGames(game(),{minTotal:220}).map((g)=>g.id),[]));
test('E51: margem média exclui jogos pendentes', () => assert.equal(gameSummary(game()).margin,(1+35+10)/3));
test('E52: overtime real é contado uma vez', () => assert.equal(gameSummary(game()).overtime,1));
test('E53: clássicos encerrados por até cinco pontos', () => assert.equal(gameSummary(game()).close,1));
test('E54: nenhuma partida retorna média nula', () => assert.equal(gameSummary([]).points,null));
test('E55: maior pontuação respeita total real', () => assert.equal(gameSummary(game()).high.id,'g5'));
test('E56: filtro por data inicial e final', () => assert.deepEqual(filterGames(game(),{from:'2026-10-12',to:'2026-10-13'}).map((g)=>g.id),['g3','g2']));
test('E57: busca textual por id', () => assert.deepEqual(filterGames(game(),{search:'g1'}).map((g)=>g.id),['g1']));
test('E58: ordenação de pontos somados', () => assert.deepEqual(filterGames(game(),{sort:'total',status:'final'}).map((g)=>g.id),['g5','g2','g1']));
test('E59: filtro de jogos é puro', () => { const before=structuredClone(games);filterGames(game(),{team:'A'});assert.deepEqual(games,before); });
test('E60: temporada vazia tem zero jogos', () => assert.deepEqual(gameRows([],2026),[]));
test('E61: confrontos diretos contam jogos finalizados', () => assert.equal(headToHead(game(),'A','B').meetings,2));
test('E62: vitórias da franquia A', () => assert.equal(headToHead(game(),'A','B').winsA,1));
test('E63: vitórias da franquia B', () => assert.equal(headToHead(game(),'A','B').winsB,1));
test('E64: confronto com troca de mando', () => {const d=headToHead(game(),'A','B');assert.equal(d.homeWins,2);assert.equal(d.awayWins,0);});
test('E65: margem média dos dois encontros', () => assert.equal(headToHead(game(),'A','B').margin,18));
test('E66: prorrogação no confronto', () => assert.equal(headToHead(game(),'A','B').ot,1));
test('E67: pontos médios por equipe corretos', () => {const d=headToHead(game(),'A','B');assert.equal(d.pointsA,93.5);assert.equal(d.pointsB,110.5);});
test('E68: histórico em ordem reversa por data', () => assert.deepEqual(headToHead(game(),'A','B').recent.map((g)=>g.id),['g2','g1']));
test('E69: confronto repetido não cria histórico', () => assert.equal(headToHead(game(),'A','A').meetings,0));
test('E70: confrontos ainda não ocorridos zerados', () => assert.equal(headToHead(game(),'B','C').margin,null));
const stats = () => statisticRows(seasonStats,playerMap);
test('E71: estatísticas removem IDs sem jogador e gp inválido', () => assert.equal(stats().length,2));
test('E72: médias de pontos por jogo', () => assert.equal(stats()[0].pts,26));
test('E73: médias de rebotes ofensivos e defensivos', () => assert.equal(stats()[0].reb,6));
test('E74: líderes por assistência', () => assert.equal(statLeaders(stats(),'ast')[0].id,1));
test('E75: percentual de arremesso correto', () => assert.equal(stats()[0].fg,50));
test('E76: percentual de três nulo sem tentativa', () => assert.equal(stats()[1].three,null));
test('E77: mínimo de jogos retira pequena amostra', () => assert.equal(statLeaders(stats(),'pts',{minGames:6}).length,1));
test('E78: filtro por franquia em líderes', () => assert.deepEqual(statLeaders(stats(),'pts',{team:'A'}).map((r)=>r.id),[2,1]));
test('E79: indicador inválido gera lista vazia', () => assert.deepEqual(statLeaders(stats(),'abc'),[]));
test('E80: dez indicadores oficiais', () => assert.equal(STAT_FIELDS.length,10));
test('E81: CSV possui cabeçalho e linha em português', () => assert.ok(toCsv([{name:'Álvaro'}],[{key:'name',label:'Nome'}]).includes('"Álvaro"')));
test('E82: CSV remove risco de fórmula iniciada por igual', () => assert.ok(toCsv([{name:'=evil()'}],[{key:'name',label:'Nome'}]).includes('"\'=evil()"')));
test('E83: CSV escapa aspas internas', () => assert.ok(toCsv([{name:'A"B'}],[{key:'name',label:'Nome'}]).includes('"A""B"')));
test('E84: CSV usa CRLF', () => assert.ok(toCsv([{name:'A'}],[{key:'name',label:'Nome'}]).includes('\r\n')));
test('E85: CSV não altera linha original', () => {const a=[{name:'=A'}];toCsv(a,[{key:'name',label:'Nome'}]);assert.equal(a[0].name,'=A');});
test('E86: estágio 11–100 contém nove blocos únicos', () => assert.equal(LAB_STAGES.length,9));
test('E87: nomes de frentes do plano não se repetem', () => assert.equal(new Set(LAB_STAGES.map((r)=>r[1])).size,9));
test('E88: filtros de dados faltantes não lançam exceção', () => {assert.deepEqual(filterAthletes([],{}),[]); assert.deepEqual(filterGames([]),[]);});
test('E89: jogador sem franquia ou OVR não contamina núcleo', () => assert.equal(teamsRow()[2].leader,null));
test('E90: rankings preservam estruturas originais', () => {const before=structuredClone(seasonStats);statLeaders(stats(),'pts');assert.deepEqual(seasonStats,before);});
test('E91: comparação rejeita o mesmo atleta', () => assert.equal(compareAthletes(row()[0],row()[0]).valid,false));
test('E92: comparação rejeita ID ausente', () => assert.equal(compareAthletes(undefined,row()[0]).valid,false));
test('E93: comparação gera cinco eixos de atributos', () => assert.equal(compareAthletes(row()[0],row()[1]).groups.length,5));
test('E94: diferenças nulas são tratadas como equilíbrio', () => assert.equal(compareAthletes(row()[0],row()[1]).ties,5));
test('E95: igualdade tem média zero', () => assert.equal(compareAthletes(row()[0],row()[1]).meanGap,0));
test('E96: comparação aponta vantagem da esquerda', () => {
  const [a,b]=row(); a.groups[0].value=95;b.groups[0].value=80;assert.equal(compareAthletes(a,b).leftAdvantage,1);
});
test('E97: comparação aponta vantagem da direita', () => {
  const [a,b]=row(); b.groups[0].value=90;a.groups[0].value=50;assert.equal(compareAthletes(a,b).rightAdvantage,1);
});
test('E98: dados ausentes não são convertidos em empate inventado', () => {
  const [a]=row(); const b=row()[3]; assert.equal(compareAthletes(a,b).ties,0);assert.equal(compareAthletes(a,b).meanGap,null);
});
test('E99: comparação mantém ordem dos rótulos do radar', () => assert.deepEqual(compareAthletes(row()[0],row()[1]).groups.map((g)=>g.label),row()[0].groups.map((g)=>g.label)));
test('E100: comparação não altera dados originais', () => {
  const before=structuredClone(players);compareAthletes(row()[0],row()[1]);assert.deepEqual(players,before);
});

test('potencial exato não é revelado no scouting fora do God Mode', () => { const visible = athleteRows(players,teams); assert.equal(visible[0].potential,null); assert.ok(visible[0].potentialLabel.includes('–')); assert.ok(visible[0].potentialSort >= visible[0].ovr); });
