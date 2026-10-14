import test from 'node:test';
import assert from 'node:assert/strict';
class FakeNode{
 constructor(tag='#text',text=''){this.tagName=tag;this._text=text;this.value='';this.children=[];this.listeners={};this.attrs={};this.style={setProperty(k,v){this[k]=v;}};this.classList={add(){}};this.hidden=false;}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=[...nodes];}
 setAttribute(k,v){this.attrs[k]=String(v);}addEventListener(n,fn){this.listeners[n]=fn;}
 get textContent(){return this._text+this.children.map(n=>n.textContent??'').join('');}
 set textContent(value){this._text=String(value);this.children=[];}
}
globalThis.Node=FakeNode;
globalThis.document={createElement:t=>new FakeNode(t),createElementNS:(_ns,t)=>new FakeNode(t),createTextNode:t=>new FakeNode('#text',String(t))};
globalThis.window={addEventListener(){},confirm(){return true;},matchMedia(){return {matches:true}}};
globalThis.location={hash:''};
globalThis.localStorage={getItem(){return null},setItem(){throw Error('Street 2D não deve salvar.')}};
const {wnbaView}=await import('../src/ui/views/wnba.js');
const walk=(root,fn,out=[])=>{if(fn(root))out.push(root);for(const c of root.children??[])walk(c,fn,out);return out;};
const button=(root,label)=>walk(root,x=>x.tagName==='button'&&x.textContent===label)[0];
test('Street 2D route renders in independent WNBA menu',()=>{
 const page=wnbaView({mode:'street-2d'});
 assert.match(page.textContent,/Street WNBA 2D/);assert.ok(button(page,'Nova partida Street 2D'));
});
test('Street 2D starts a real match from DOM controls',()=>{
 const page=wnbaView({mode:'street-2d'});button(page,'Nova partida Street 2D').listeners.click();
 assert.match(page.textContent,/Partida independente/);assert.ok(button(page,'Próxima posse 2D'));
 assert.ok(walk(page,n=>n.tagName==='svg'&&n.attrs['aria-label']?.includes('Quadra Street')).length);
});
test('Street 2D advances a real possession and updates replay',()=>{
 const page=wnbaView({mode:'street-2d'});button(page,'Nova partida Street 2D').listeners.click();
 button(page,'Próxima posse 2D').listeners.click();
 assert.match(page.textContent,/1 posses|1 posse/);assert.match(page.textContent,/Posse 1/);
 assert.ok(button(page,'Quadro +1'));button(page,'Quadro +1').listeners.click();
 assert.match(page.textContent,/Quadro 2\/\d+/);
});
test('Street 2D can simulate full match via DOM button',()=>{
 const page=wnbaView({mode:'street-2d'});button(page,'Nova partida Street 2D').listeners.click();
 button(page,'Simular até o final').listeners.click();
 assert.match(page.textContent,/Finalizada/);assert.match(page.textContent,/Vitória:/);
});
test('Street 2D mode never writes any user storage',()=>{
 const page=wnbaView({mode:'street-2d'});
 button(page,'Nova partida Street 2D').listeners.click();button(page,'Próxima posse 2D').listeners.click();
 assert.match(page.textContent,/Nenhuma partida, estatística ou alteração será gravada/);
});
