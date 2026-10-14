import test from 'node:test';
import assert from 'node:assert/strict';
class FakeNode{
 constructor(tag='#text',text=''){this.tagName=tag;this._text=text;this.value='';this.children=[];this.listeners={};this.dataset={};this.attrs={};this.style={setProperty(k,v){this[k]=v;}};this.classList={add(){}};this.hidden=false;}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=[...nodes];}
 setAttribute(k,v){this.attrs[k]=v;}addEventListener(n,fn){this.listeners[n]=fn;}
 get textContent(){return this._text+this.children.map(n=>n.textContent??'').join('');}
 set textContent(value){this._text=String(value);this.children=[];}
}
globalThis.Node=FakeNode;
globalThis.document={createElement:t=>new FakeNode(t),createElementNS:(_ns,t)=>new FakeNode(t),createTextNode:t=>new FakeNode('#text',String(t))};
globalThis.window={addEventListener(){},confirm(){return true;}};
globalThis.location={hash:''};
const mem=new Map();globalThis.localStorage={getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,String(v))};
const {wnbaView}=await import('../src/ui/views/wnba.js');
const walk=(root,fn,out=[])=>{if(fn(root))out.push(root);for(const c of root.children??[])walk(c,fn,out);return out;};
const button=(root,label)=>walk(root,x=>x.tagName==='button'&&x.textContent===label)[0];

test('WNBA custom creator is reachable via route and initial form renders',()=>{
 const page=wnbaView({mode:'creator'});assert.match(page.textContent,/Criador de Jogadoras WNBA/);assert.ok(button(page,'Criar jogadora'));
});
test('WNBA custom creator generates demo rosters through real DOM button',()=>{
 const page=wnbaView({mode:'creator'});button(page,'Gerar 10 fictícias de exemplo').listeners.click();
 assert.match(page.textContent,/Atleta Fictícia 1/);assert.equal(JSON.parse(mem.get('wnba-arcade-created-players-v1')).players.length,10);
});
test('WNBA custom creator simulates actual game through button callback',()=>{
 const page=wnbaView({mode:'creator'});button(page,'Simular amistoso').listeners.click();
 assert.match(page.textContent,/Amistoso entre atletas fictícias/);assert.match(page.textContent,/PTS/);
});
test('WNBA custom creator runs actual Street from browser control',()=>{
 const page=wnbaView({mode:'creator'});button(page,'Street 3x3').listeners.click();
 assert.match(page.textContent,/Street 3x3 · Atletas criadas/);
});
test('WNBA creator can display editable skills in response to real button',()=>{
 const page=wnbaView({mode:'creator'});button(page,'Atributos').listeners.click();
 assert.match(page.textContent,/Editar Atleta Fictícia/);assert.ok(button(page,'Fechar editor'));
});
test('WNBA skills academy renders and completes via actual button',()=>{
 const page=wnbaView({mode:'academy'});button(page,'Iniciar desafios').listeners.click();assert.match(page.textContent,/Resultado da Academia/);assert.match(page.textContent,/Vencedora:/);
});
test('WNBA duel tournament renders championship via actual button',()=>{
 const page=wnbaView({mode:'duels'});button(page,'Disputar duelos').listeners.click();assert.match(page.textContent,/Campeã:/);assert.match(page.textContent,/FINAL/);
});
test('independent created player UI never writes NBA career keys',()=>assert.deepEqual([...mem.keys()],['wnba-arcade-created-players-v1']));
