import test from 'node:test';
import assert from 'node:assert/strict';
class FakeNode{
 constructor(tag='#text',text=''){this.tagName=tag;this._text=text;this.value='';this.children=[];this.listeners={};this.dataset={};this.attrs={};this.style={setProperty(k,v){this[k]=v;}};this.classList={add(){},toggle(){}};this.hidden=false;}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=[...nodes];}
 setAttribute(k,v){this.attrs[k]=v;}addEventListener(n,fn){this.listeners[n]=fn;}
 get textContent(){return this._text+this.children.map(n=>n.textContent??'').join('');}
 set textContent(value){this._text=String(value);this.children=[];}
 querySelectorAll(selector){if(selector==='button')return walk(this,n=>n.tagName==='button');return [];}
}
const walk=(root,fn,out=[])=>{if(fn(root))out.push(root);for(const c of root.children??[])walk(c,fn,out);return out;};
globalThis.Node=FakeNode;
globalThis.document={createElement:t=>new FakeNode(t),createElementNS:(_ns,t)=>new FakeNode(t),createTextNode:t=>new FakeNode('#text',String(t))};
globalThis.window={addEventListener(){}};
globalThis.location={hash:'#/international/nbb'};
const {internationalView}=await import('../src/ui/views/international.js');
const button=(root,label)=>walk(root,n=>n.tagName==='button'&&n.textContent===label)[0];
for(const league of ['nbb','euroleague','eurobasket']){
 test(`${league}: tela abre com rotas e times reais`,()=>{
  const page=internationalView({league});
  assert.match(page.textContent,/ARENA INTERNACIONAL/);
  assert.ok(button(page,'Visão geral'));assert.ok(button(page,'Equipes'));
  assert.match(page.textContent,/Atletas reais/);
 });
 test(`${league}: botão de jogo rápido gera placar na interface`,()=>{
  const page=internationalView({league});button(page,'Disputar amistoso').listeners.click();
  assert.ok(button(page,'Simular jogo rápido'));button(page,'Simular jogo rápido').listeners.click();
  assert.match(page.textContent,/Resultado · jogo de exibição/);
  assert.match(page.textContent,/PTS/);
 });
 test(`${league}: copa via clique de usuário gera campeão`,()=>{
  const page=internationalView({league});button(page,league==='eurobasket'?'Simular EuroBasket completo':'Disputar copa').listeners.click();
  if(league==='eurobasket'){const control=button(page,'Simular fase de grupos + mata-mata');assert.ok(control);control.listeners.click();assert.match(page.textContent,/CAMPEÃO:/);}
  else{const control=button(page,'Disputar copa');assert.ok(control);control.listeners.click();assert.match(page.textContent,/CAMPEÃO/);}
 });
}
for(const league of ['nbb','euroleague']){
 test(`${league}: Central de fotos abre e mostra o total e pesquisa`,()=>{
  const page=internationalView({league});
  assert.ok(button(page,'Fotos'));
  button(page,'Fotos').listeners.click();
  assert.match(page.textContent,/Central de fotografias/);
  assert.match(page.textContent,/Google Imagens/);
  assert.ok(button(page,'Exportar catálogo JSON'));
  assert.ok(button(page,'Importar catálogo JSON'));
 });
}
