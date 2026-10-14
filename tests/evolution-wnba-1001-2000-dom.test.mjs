import test from 'node:test';
import assert from 'node:assert/strict';
class FakeNode {
  constructor(tag='#text', text='') {
    this.tagName=tag;this._text=text;this.value='';this.children=[];this.listeners={};this.dataset={};this.attrs={};this.style={setProperty(k,v){this[k]=v;}};
    this.classList={add(){}};this.hidden=false;
  }
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=[...nodes];}
  setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(name,fn){this.listeners[name]=fn;}
  get textContent(){return this._text+this.children.map(n=>n.textContent??'').join('');}
  set textContent(value){this._text=String(value);this.children=[];}
}
globalThis.Node=FakeNode;
globalThis.document={createElement:t=>new FakeNode(t),createElementNS:(_ns,t)=>new FakeNode(t),createTextNode:t=>new FakeNode('#text',String(t))};
globalThis.window={addEventListener(){},confirm(){return true;}};
globalThis.location={hash:''};
const mem=new Map();
globalThis.localStorage={getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,String(v))};
const {wnbaView}=await import('../src/ui/views/wnba.js');
const walk=(root,fn,out=[])=>{if(fn(root))out.push(root);for(const c of root.children??[])walk(c,fn,out);return out;};
const button=(root,label)=>walk(root,x=>x.tagName==='button'&&x.textContent===label)[0];

test('WNBA Arcade league renders without browser and completes via button action',()=>{
 location.hash='#/wnba/arcade-league';const page=wnbaView({mode:'arcade-league'});
 assert.match(page.textContent,/Liga Arcade/);
 const run=button(page,'Disputar Liga Arcade');assert.ok(run);
 run.listeners.click();
 assert.match(page.textContent,/Classificação Arcade/);
 assert.match(page.textContent,/Campeã Arcade:/);
 assert.equal(walk(page,x=>x.tagName==='tr').length,9);
});
test('WNBA Street Laboratory renders and executes a user action',()=>{
 location.hash='#/wnba/street-lab';const page=wnbaView({mode:'street-lab'});
 const run=button(page,'Comparar quatro estratégias');assert.ok(run);
 run.listeners.click();
 assert.match(page.textContent,/Resultado das estratégias/);
 assert.equal(walk(page,x=>x.className==='w-tactic-card').length,4);
});
test('WNBA Roster Library can be duplicated through actual UI callback',()=>{
 location.hash='#/wnba/studio';const page=wnbaView({mode:'studio'});
 const run=button(page,'Duplicar roster');assert.ok(run);
 run.listeners.click();
 assert.equal(walk(page,x=>x.tagName==='option'&&x.value?.startsWith('wslot-')).length,2);
 assert.match(mem.get('wnba-arcade-roster-library-v1'),/wslot-2/);
});
test('WNBA independent view does not read/write NBA save namespace',()=>{
 assert.ok([...mem.keys()].every(k=>k.startsWith('wnba-')));
});

test('WNBA Street simulates and renders replay and schematic chart without ReferenceError',()=>{
 location.hash='#/wnba/street';const page=wnbaView({mode:'street'});
 const run=button(page,'Simular partida');assert.ok(run);run.listeners.click();
 assert.match(page.textContent,/STREET · MEIA QUADRA|FIM · STREET FEMININO/);
 assert.ok(walk(page,n=>n.tagName==='svg').length>=1);
 const replay=button(page,'Assistir replay das posses');assert.ok(replay);replay.listeners.click();
 assert.match(page.textContent,/Replay Street/);
 assert.ok(button(page,'Próxima ▶'));
});
