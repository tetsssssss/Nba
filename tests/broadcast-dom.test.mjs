import test from 'node:test';
import assert from 'node:assert/strict';
class FakeNode {
  constructor(tag='#text',value='') {
    this.tagName=tag;this._value=value;this.children=[];this.attrs={};this.listeners={};this.dataset={};this.style={setProperty(){}};
    this.classList={add(){},remove(){},toggle(){}};
  }
  append(...nodes){this.children.push(...nodes)}
  replaceChildren(...nodes){this.children=[...nodes]}
  setAttribute(name,val){this.attrs[name]=String(val)}
  addEventListener(name,fn){this.listeners[name]=fn}
  get textContent(){return this._value+this.children.map(n=>n.textContent??'').join('')}
  set textContent(value){this._value=String(value);this.children=[]}
}
globalThis.Node=FakeNode;
globalThis.document={createElement:(tag)=>new FakeNode(tag), createTextNode:(value)=>new FakeNode('#text',String(value)),createElementNS:(_,tag)=>new FakeNode(tag)};
const {createBroadcastStudio,buildLeadGraph}=await import('../src/ui/components/broadcast-studio.js');
function sim(){return {teams:[{name:'Azuis'},{name:'Vermelhos'}],score:[2,0],quarter:1,clock:234,shotClock:17,offense:1,events:[{q:1,clock:234,team:0,text:'Azuis faz cesta',major:true}],scoreLog:[{team:0,pts:2,t:1,q:1}],over:false}}
const walk=(n,p,out=[])=>{if(p(n))out.push(n);for(const c of n.children??[])walk(c,p,out);return out};
test('central de transmissão renderiza gráfico SVG acessível com placar real',()=>{
  const {root}=createBroadcastStudio(sim());
  assert.match(root.textContent,/Azuis lidera por 2 pontos/);
  assert.match(root.textContent,/Posse: Vermelhos/);
  assert.ok(walk(root,n=>n.tagName==='svg'&&n.attrs.role==='img').length);
  assert.ok(walk(root,n=>n.tagName==='polyline'&&n.attrs.points).length);
});
test('atualização da central usa novos eventos oficiais',()=>{
  const state=sim(), studio=createBroadcastStudio(state);
  state.score=[2,3];state.scoreLog.push({team:1,pts:3,q:1,t:2});
  state.events.push({team:1,q:1,clock:100,text:'Bola de três',major:true});
  studio.refresh();
  assert.match(studio.root.textContent,/Vermelhos lidera por 1 ponto/);
  assert.match(studio.root.textContent,/Bola de três/);
});
test('histórico parcial não exibe gráfico enganoso',()=>{
  const s=sim();s.score=[44,39];
  const {root}=createBroadcastStudio(s);
  assert.match(root.textContent,/Histórico de pontuação incompleto/);
  assert.equal(walk(root,n=>n.tagName==='polyline').length,0);
});
test('gráfico vazio não desenha linha imaginária',()=>assert.equal(buildLeadGraph({points:[{lead:0}],lead:0}),null));
test('placar é construído como texto, sem injeção de HTML',()=>{
  const s=sim();s.teams[0].name='<script>alert(1)</script>';
  const {root}=createBroadcastStudio(s);
  assert.equal(walk(root,n=>n.tagName==='script').length,0);
  assert.match(root.textContent,/script/);
});
