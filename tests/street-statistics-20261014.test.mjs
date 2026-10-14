import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newStreetGame, streetPossession, simulateStreet } from '../src/arcade/street.js';
import { streetStatistics, streetPlayFocus } from '../src/arcade/street-statistics.js';

const athlete = (id, name) => ({ id, name, ovr:75, attributes:{ballHandling:70,shotCreation:70,threePoint:70,catchAndShoot:70,steals:70,rimFinishing:70,layup:70,perimeterDefense:70,interiorDefense:70} });
const teams = [{id:'A',name:'Aurora',colors:['#223344','#ffffff'],roster:[athlete(1,'Ana'),athlete(2,'Bia'),athlete(3,'Cris')]},
 {id:'B',name:'Cometas',colors:['#aa7733','#ffffff'],roster:[athlete(4,'Dora'),athlete(5,'Eva'),athlete(6,'Fabi')]}];
const fresh = () => newStreetGame(teams,{seed:'statistics-20261014'});

test('Street: box score inicial tem zeros e FG% não inventa aproveitamento',()=>{
 const stats=streetStatistics(fresh());
 assert.equal(stats.length,2);assert.equal(stats[0].players.length,3);
 assert.equal(stats[0].totals.fgPct,'—');assert.equal(stats[0].totals.pts,0);
 assert.equal(stats[1].totals.twoAtt,0);
});
test('Street: pontos do box score reconciliam exatamente com o placar e não alteram o estado',()=>{
 const game=simulateStreet(fresh());const before=structuredClone(game);
 const stats=streetStatistics(game);
 assert.deepEqual(stats.map(t=>t.totals.pts),game.score);
 for(const team of stats){
  assert.equal(team.totals.fga,team.totals.oneAtt+team.totals.twoAtt);
  assert.equal(team.totals.fgm,team.totals.oneMade+team.totals.twoMade);
  assert.equal(team.totals.pts,team.totals.oneMade+2*team.totals.twoMade);
  assert.equal(team.totals.steals,team.players.reduce((s,p)=>s+p.steals,0));
 }
 assert.deepEqual(game,before);
});
test('Street: os três formatos exibem quantidade correta de atletas',()=>{
 for(const size of [1,2,3]){
  const game=newStreetGame(teams.map(t=>({...t,roster:t.roster.slice(0,size)})),{squadSize:size});
  assert.deepEqual(streetStatistics(game).map(t=>t.players.length),[size,size]);
 }
});
test('Street: foco visual de roubo pertence ao defensor, não à vítima',()=>{
 const g=fresh();g.events=[{kind:'steal',playerId:1,defenderId:5}];
 assert.deepEqual(streetPlayFocus(g),{playerId:'5',kind:'steal',label:'Roubo de bola'});
 g.events=[{kind:'long',playerId:2}];
 assert.equal(streetPlayFocus(g).playerId,'2');
 g.events=[];assert.equal(streetPlayFocus(g),null);
});
test('Street: cada roubo registrado guarda a identidade do defensor',()=>{
 let game=fresh();for(let i=0;i<180&&!game.over;i++)game=streetPossession(game);
 const steals=game.events.filter(e=>e.kind==='steal');assert.ok(steals.length>0);
 for(const e of steals)assert.ok(game.teams[1-e.offense].roster.some(p=>p.id===e.defenderId));
});
test('Street: rejeita estatísticas de partidas inexistentes',()=>{
 assert.throws(()=>streetStatistics(null),/sem estatísticas/);
 assert.throws(()=>streetStatistics({teams:[],box:[]}),/sem estatísticas/);
});

// DOM simulado verifica os handlers reais, não constitui teste visual em navegador.
class FakeNode {
 constructor(tag='#text',text='') {this.tagName=tag;this._text=text;this.value='';this.children=[];this.listeners={};this.dataset={};this.attrs={};this.style={setProperty(k,v){this[k]=v;}};this.classList={add(){}};this.hidden=false;}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=[...nodes];}
 setAttribute(k,v){this.attrs[k]=String(v);}addEventListener(n,fn){this.listeners[n]=fn;}
 get textContent(){return this._text+this.children.map(n=>n.textContent??'').join('');}
 set textContent(v){this._text=String(v);this.children=[];}
}
globalThis.Node=FakeNode;
globalThis.document={createElement:t=>new FakeNode(t),createElementNS:(_ns,t)=>new FakeNode(t),createTextNode:t=>new FakeNode('#text',String(t))};
globalThis.window={addEventListener(){},confirm(){return true;},localStorage:{getItem(){return null;},setItem(){}}};
globalThis.location={hash:'#/arcade/street'};
globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(readFileSync(new URL(`../${url}`,import.meta.url),'utf8'))});
const { arcadeView } = await import('../src/ui/views/arcade.js');
const { wnbaView } = await import('../src/ui/views/wnba.js');
const walk=(node,fn,out=[])=>{if(fn(node))out.push(node);for(const child of node.children??[])walk(child,fn,out);return out;};
const button=(root,label)=>walk(root,x=>x.tagName==='button'&&x.textContent===label)[0];
const select=(root,label)=>walk(root,x=>x.tagName==='label'&&x.textContent.startsWith(label)&&x.children.some(c=>c.tagName==='select'))[0]?.children.find(c=>c.tagName==='select');

test('Arcade Street: box score real aparece após posse e identifica o formato 1x1',async()=>{
 const page=await arcadeView({mode:'street'});
 select(page,'Formato').listeners.change({target:{value:'1'}});
 button(page,'Iniciar Street').listeners.click();
 const courts=walk(page,n=>n.attrs.role==='img'&&String(n.attrs['aria-label']).includes('Quadra esquemática'));
 assert.equal(courts.length,1);assert.match(courts[0].attrs['aria-label'],/1 contra 1/);
 button(page,'Próxima posse').listeners.click();
 assert.ok(walk(page,n=>n.tagName==='table'&&n.className==='arc-stat-table').length===2);
 assert.match(page.textContent,/Destaque da última posse/);
 assert.match(page.textContent,/FG%/);
});
test('Arcade Street: mudar escalação invalida partida antiga antes de iniciar outra',async()=>{
 const page=await arcadeView({mode:'street'});
 button(page,'Iniciar Street').listeners.click();assert.ok(button(page,'Próxima posse'));
 const picks=walk(page,n=>n.tagName==='label'&&n.textContent.startsWith('Jogador '));
 const first=picks[0].children.find(c=>c.tagName==='select');
 const second=first.children.find(x=>x.tagName==='option'&&x.value!==first.value);
 assert.ok(second);
 first.listeners.change({target:{value:second.value}});
 assert.equal(button(page,'Próxima posse'),undefined);
 assert.match(page.textContent,/Configuração alterada/);
});
test('Arcade Street: trocar formato remove placar anterior e repõe picks válidos',async()=>{
 const page=await arcadeView({mode:'street'});
 button(page,'Iniciar Street').listeners.click();
 select(page,'Formato').listeners.change({target:{value:'2'}});
 assert.equal(button(page,'Próxima posse'),undefined);
 button(page,'Iniciar Street').listeners.click();
 assert.ok(button(page,'Próxima posse'));
 assert.match(walk(page,n=>n.attrs.role==='img')[0].attrs['aria-label'],/2 contra 2/);
});
test('WNBA Street: relatório usa o mesmo box score de 1 e 2 pontos, sem escrever na carreira',()=>{
 const page=wnbaView({mode:'street'});
 button(page,'Jogar posse a posse').listeners.click();
 button(page,'Próxima posse').listeners.click();
 assert.equal(walk(page,n=>n.tagName==='table'&&n.className==='w-data').length,2);
 assert.match(page.textContent,/Estatísticas Street/);
 assert.match(page.textContent,/FG%/);
});

test('WNBA Street: mudar formato descarta partida anterior e não deixa botão antigo ativo',()=>{
 const page=wnbaView({mode:'street'});
 button(page,'Jogar posse a posse').listeners.click();assert.ok(button(page,'Próxima posse'));
 select(page,'Formato').listeners.change({target:{value:'1'}});
 assert.equal(button(page,'Próxima posse'),undefined);
 button(page,'Jogar posse a posse').listeners.click();
 assert.ok(button(page,'Próxima posse'));
 assert.match(page.textContent,/1x1/);
});
test('WNBA Street: trocar franquia também limpa replay e placar obsoletos',()=>{
 const page=wnbaView({mode:'street'});
 button(page,'Jogar posse a posse').listeners.click();
 button(page,'Próxima posse').listeners.click();
 select(page,'Equipe A').listeners.change({target:{value:'WIND'}});
 assert.equal(button(page,'Próxima posse'),undefined);
 assert.equal(walk(page,n=>n.tagName==='table'&&n.className==='w-data').length,0);
});

test('All-Star: concurso de 3 pontos diferencia atributo zero de 100 e calcula bolas certas',async()=>{
 const { threePointRound } = await import('../src/arcade/all-star.js');
 const low={id:10,name:'Baixa',attributes:{threePoint:0,catchAndShoot:0}};
 const high={...low,attributes:{threePoint:100,catchAndShoot:100}};
 const a=Array.from({length:25},(_,i)=>threePointRound(low,`rating-${i}`));
 const b=Array.from({length:25},(_,i)=>threePointRound(high,`rating-${i}`));
 assert.ok(b.reduce((s,x)=>s+x.made,0)>a.reduce((s,x)=>s+x.made,0));
 for(const row of [...a,...b]){
  assert.equal(row.attempts,25);
  assert.equal(row.made,row.racks.flat().filter(x=>x>0).length);
  assert.equal(row.points,row.racks.flat().reduce((s,x)=>s+x,0));
  assert.match(row.accuracy,/^\d+\.\d%$/);
 }
});
test('All-Star: resultado do concurso mostra aproveitamento de bolas reais',async()=>{
 const page=await arcadeView({mode:'allstar'});
 button(page,'Disputar torneio de 3 pontos').listeners.click();
 assert.match(page.textContent,/bolas \(\d+\.\d%\)/);
});
