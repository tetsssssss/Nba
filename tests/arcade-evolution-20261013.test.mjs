import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blankRoster, defaultRoster, streetTeamsFromRoster } from '../src/arcade/rosters.js';
import { newStreetGame, streetPossession, simulateStreet } from '../src/arcade/street.js';

const pool = Array.from({ length: 24 }, (_, i) => ({ id:i + 1, name:`Atleta ${i + 1}`, ovr:90 - i,
  attributes:{ballHandling:70,shotCreation:70,threePoint:70,catchAndShoot:70,steals:70,rimFinishing:70,layup:70,perimeterDefense:70,interiorDefense:70} }));
const base = defaultRoster(pool);
const picks = base.teams.map(t => t.playerIds.slice(0,3));

test('Street 1x1, 2x2 e 3x3 aceitam escolhas reais do Roster Studio e jogam uma posse', () => {
  for (const size of [1,2,3]) {
    const teams = streetTeamsFromRoster(base,pool,picks,size);
    const game = newStreetGame(teams,{squadSize:size,seed:`size-${size}`});
    const next = streetPossession(game);
    assert.equal(next.possessions,1);
    assert.equal(game.possessions,0);
    assert.deepEqual(teams.map(t=>t.roster.length),[size,size]);
  }
});
test('Street recusa atleta repetido e atleta fora do elenco antes de iniciar', () => {
  const bad = picks.map(a=>[...a]);bad[0][1]=bad[0][0];
  assert.throws(()=>streetTeamsFromRoster(base,pool,bad,3),/duas posições/);
  const other = picks.map(a=>[...a]);other[1][0]=base.teams[0].playerIds[0];
  assert.throws(()=>streetTeamsFromRoster(base,pool,other,3),/não pertence/);
});
test('Street rejeita escolhas incompletas e formatos inválidos', () => {
  assert.throws(()=>streetTeamsFromRoster(base,pool,[picks[0].slice(0,1),picks[1]],3),/selecione 3/);
  assert.throws(()=>streetTeamsFromRoster(base,pool,picks,4),/escolha/);
  assert.throws(()=>streetTeamsFromRoster(base,pool,[],2),/escolhas/);
});
test('Street não altera roster de origem nem atributos dos atletas', () => {
  const before = structuredClone({base,pool,picks});
  const game = newStreetGame(streetTeamsFromRoster(base,pool,picks,3));
  simulateStreet(game);
  assert.deepEqual({base,pool,picks},before);
});
test('Street recusa atleta nulo ou sem atributos com erro legível', () => {
  const teams=streetTeamsFromRoster(base,pool,picks,3);
  teams[0].roster[0]=undefined;
  assert.throws(()=>newStreetGame(teams),/atleta inválido/);
  teams[0].roster[0]={id:999,name:'Sem atributos'};
  assert.throws(()=>newStreetGame(teams),/atleta inválido/);
});

// DOM simulado: testa os handlers reais do Arcade sem afirmar homologação visual.
class FakeNode {
  constructor(tag='#text',text='') {this.tagName=tag;this._text=text;this.value='';this.children=[];this.listeners={};this.dataset={};this.attrs={};
    this.style={setProperty(k,v){this[k]=v;}};this.classList={add(){}};this.hidden=false;}
  append(...nodes){this.children.push(...nodes);} replaceChildren(...nodes){this.children=[...nodes];}
  setAttribute(k,v){this.attrs[k]=String(v);} addEventListener(name,fn){this.listeners[name]=fn;}
  get textContent(){return this._text+this.children.map(n=>n.textContent??'').join('');}
  set textContent(v){this._text=String(v);this.children=[];}
}
globalThis.Node=FakeNode;
globalThis.document={createElement:t=>new FakeNode(t),createElementNS:(_ns,t)=>new FakeNode(t),createTextNode:t=>new FakeNode('#text',String(t))};
const mem=new Map();
globalThis.window={addEventListener(){},confirm(){return true;},localStorage:{getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,String(v))}};
globalThis.location={hash:'#/arcade/street'};
globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(readFileSync(new URL(`../${url}`,import.meta.url),'utf8'))});
const { arcadeView }=await import('../src/ui/views/arcade.js');
const walk=(node,fn,out=[])=>{if(fn(node))out.push(node);for(const child of node.children??[])walk(child,fn,out);return out;};
const button=(root,label)=>walk(root,x=>x.tagName==='button'&&x.textContent===label)[0];
const labelSelect=(root,label)=>walk(root,x=>x.tagName==='label'&&x.textContent.startsWith(label)&&x.children.some(c=>c.tagName==='select'))[0]?.children.find(c=>c.tagName==='select');

test('Street: trocar 3x3 por 1x1 e 2x2 recria seletores sem ReferenceError',async()=>{
  const page=await arcadeView({mode:'street'});
  const format=labelSelect(page,'Formato');assert.ok(format);
  assert.equal(walk(page,n=>n.tagName==='label'&&/^Jogador [1-3]/.test(n.textContent)).length,6);
  format.listeners.change({target:{value:'1'}});
  assert.equal(walk(page,n=>n.tagName==='label'&&/^Jogador [1-3]/.test(n.textContent)).length,2);
  button(page,'Iniciar Street').listeners.click();
  assert.ok(button(page,'Próxima posse'));
  button(page,'Próxima posse').listeners.click();
  assert.match(page.textContent,/Posse 2/);
  format.listeners.change({target:{value:'2'}});
  assert.equal(walk(page,n=>n.tagName==='label'&&/^Jogador [1-3]/.test(n.textContent)).length,4);
  button(page,'Iniciar Street').listeners.click();
  assert.ok(button(page,'Próxima posse'));
});
test('Street: escolhas repetidas exibem erro e não iniciam partida inválida',async()=>{
  const page=await arcadeView({mode:'street'});
  const selects=walk(page,n=>n.tagName==='label'&&/^Jogador [1-3]/.test(n.textContent)).map(l=>l.children.find(c=>c.tagName==='select'));
  const first=selects[0].value;
  selects[1].listeners.change({target:{value:first}});
  button(page,'Iniciar Street').listeners.click();
  assert.match(page.textContent,/duas posições/);
  assert.equal(button(page,'Próxima posse'),undefined);
});
test('Roster Studio: fantasy draft reproduzível, desfazer/refazer e isolamento de storage',async()=>{
  const page=await arcadeView({mode:'roster'});
  assert.ok(button(page,'Desfazer'));
  button(page,'Fantasy draft (semente)').listeners.click();
  const first=mem.get('nba-arcade-rosters-v1');assert.ok(first);
  button(page,'Desfazer').listeners.click();
  const original=mem.get('nba-arcade-rosters-v1');assert.notEqual(first,original);
  button(page,'Refazer').listeners.click();assert.equal(mem.get('nba-arcade-rosters-v1'),first);
  button(page,'Fantasy draft (semente)').listeners.click();assert.equal(mem.get('nba-arcade-rosters-v1'),first);
  assert.deepEqual([...mem.keys()],['nba-arcade-rosters-v1']);
});
test('WNBA Street 2D: resumo de eficiência e leitor de tela na interface',async()=>{
  const {wnbaView}=await import('../src/ui/views/wnba.js');
  const page=wnbaView({mode:'street-2d'});
  button(page,'Nova partida Street 2D').listeners.click();
  button(page,'Próxima posse 2D').listeners.click();
  assert.match(page.textContent,/Aproveitamento/);
  assert.match(page.textContent,/roubos/);
  assert.ok(walk(page,n=>n.attrs.role==='status'&&n.attrs['aria-live']==='polite').length);
});
test('All-Star: o controle de equipes acompanha o formato capitães, sem rotular como Leste/Oeste',async()=>{
  const page=await arcadeView({mode:'allstar'});
  const format=labelSelect(page,'Formato de seleção');assert.ok(format);
  format.listeners.change({target:{value:'captains'}});
  const control=labelSelect(page,'Controle');assert.ok(control);
  const labels=control.children.map(x=>x.textContent);
  assert.ok(labels.includes('Time 1'));
  assert.ok(labels.includes('Time 2'));
  assert.ok(!labels.includes('Leste'));
});
test('Street: ao finalizar, esconde ações inertes e anuncia vencedor',async()=>{
  const page=await arcadeView({mode:'street'});
  button(page,'Iniciar Street').listeners.click();
  button(page,'Simular até o final').listeners.click();
  assert.match(page.textContent,/Fim de jogo/);
  assert.equal(button(page,'Próxima posse'),undefined);
  assert.equal(button(page,'Simular até o final'),undefined);
  assert.ok(button(page,'Recomeçar'));
});
test('Roster Studio: restauração confirmada preserva a opção desfazer',async()=>{
  const page=await arcadeView({mode:'roster'});
  button(page,'Fantasy draft (semente)').listeners.click();
  const fantasy=mem.get('nba-arcade-rosters-v1');
  button(page,'Restaurar escalações').listeners.click();
  const restored=mem.get('nba-arcade-rosters-v1');assert.notEqual(fantasy,restored);
  button(page,'Desfazer').listeners.click();
  assert.equal(mem.get('nba-arcade-rosters-v1'),fantasy);
});
