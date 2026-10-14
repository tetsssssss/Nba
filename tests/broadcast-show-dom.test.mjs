import test from 'node:test';
import assert from 'node:assert/strict';
class NodeStub {
  constructor(tag='#text',text='') { this.tagName=tag; this._text=String(text);this.children=[];this.attrs={};this.listeners={};this.dataset={};this.style={setProperty(){}};this.classes=new Set();
    this.classList={add:(...v)=>v.forEach(x=>this.classes.add(x)),remove:(...v)=>v.forEach(x=>this.classes.delete(x)),contains:x=>this.classes.has(x),toggle:(x,force)=>{const add=force===undefined?!this.classes.has(x):Boolean(force); add?this.classes.add(x):this.classes.delete(x);return add;}}; }
  append(...v){this.children.push(...v)}
  replaceChildren(...v){this.children=[...v]}
  addEventListener(n,fn){this.listeners[n]=fn}
  setAttribute(k,v){this.attrs[k]=String(v)}
  set className(v){this.classes=new Set(String(v).split(/\s+/).filter(Boolean))}
  get className(){return [...this.classes].join(' ')}
  set textContent(v){this._text=String(v);this.children=[]}
  get textContent(){return this._text+this.children.map(v=>v.textContent??'').join('')}
}
globalThis.Node=NodeStub;
globalThis.document={createElement:t=>new NodeStub(t),createTextNode:t=>new NodeStub('#text',t)};
const {createBroadcastShowOverlay}=await import('../src/ui/components/broadcast-show-overlay.js');
const mock=()=>({teams:[{name:'<X>',lineup:[{short:'Lia'}],all:[]},{name:'Fora',lineup:[{short:'Bia'}],all:[]}],score:[0,0],quarter:1,clock:350,shotClock:22,t:0,over:false,timeout:null,scoreLog:[],events:[]});
test('vinheta DOM não injeta HTML vindo das equipes e expira sem timers',()=>{
 const sim=mock();let at=0;const before=JSON.stringify(sim);
 const ui=createBroadcastShowOverlay(sim,{now:()=>at,context:{presentationTitle:'WNBA'}});
 assert.match(ui.root.textContent,/NOITE DE JOGO/);
 assert.match(ui.root.textContent,/<X>/);
 assert.equal(ui.root.children[0].children.filter(c=>c.tagName==='X').length,0);
 assert.equal(ui.root.attrs['aria-hidden'],'false');
 assert.equal(JSON.stringify(sim),before);
 at=5700;ui.refresh();assert.equal(ui.root.attrs['aria-hidden'],'true');
});
test('vinheta de período, ocultação e descarte não manipulam simulação',()=>{
 const s=mock();let at=0;const ui=createBroadcastShowOverlay(s,{now:()=>at});
 s.quarter=2;s.score=[22,18];s.scoreLog=[{q:1,team:0,pts:2}];
 ui.refresh();assert.match(ui.root.textContent,/FIM DO 1º QUARTO/);
 assert.equal(ui.setEnabled(false),false);
 assert.equal(ui.root.attrs['aria-hidden'],'true');
 s.over=true;ui.refresh();
 assert.equal(ui.setEnabled(true),true);ui.refresh();assert.equal(ui.root.attrs['aria-hidden'],'true');
 ui.show('final');assert.match(ui.root.textContent,/FIM DE JOGO/);
 ui.dispose();assert.equal(ui.root.attrs['aria-hidden'],'true');
});
