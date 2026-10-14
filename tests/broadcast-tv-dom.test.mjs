import test from 'node:test';
import assert from 'node:assert/strict';
class FakeNode {
  constructor(tag='#text', value='') {
    this.tagName=tag;
    this._value=String(value);
    this.children=[];
    this.attrs={};
    this.listeners={};
    this.dataset={};
    this.style={setProperty(){}};
    this._classes=new Set();
    this.classList={
      add:(...names)=>names.forEach(name=>this._classes.add(name)),
      remove:(...names)=>names.forEach(name=>this._classes.delete(name)),
      contains:(name)=>this._classes.has(name),
      toggle:(name,force)=>{
        const add=force===undefined?!this._classes.has(name):Boolean(force);
        add?this._classes.add(name):this._classes.delete(name);
        return add;
      }
    };
  }
  append(...nodes){this.children.push(...nodes)}
  replaceChildren(...nodes){this.children=[...nodes]}
  setAttribute(name,value){this.attrs[name]=String(value)}
  addEventListener(name,fn){this.listeners[name]=fn}
  set className(value){this._classes=new Set(String(value).split(/\s+/).filter(Boolean))}
  get className(){return [...this._classes].join(' ')}
  set textContent(value){this._value=String(value);this.children=[]}
  get textContent(){return this._value+this.children.map(node=>node.textContent??'').join('')}
}
globalThis.Node=FakeNode;
globalThis.document={createElement:tag=>new FakeNode(tag),createTextNode:value=>new FakeNode('#text',value),createElementNS:(_,tag)=>new FakeNode(tag)};
const {createLiveBroadcastOverlay}=await import('../src/ui/components/broadcast-live-overlay.js');
const descend=(node,test,out=[])=>{if(test(node))out.push(node);for(const child of node.children||[])descend(child,test,out);return out};
const sim=()=>({teams:[{name:'Casa'},{name:'Fora'}],score:[25,21],quarter:2,clock:151,shotClock:14,offense:1,events:[],over:false,scoreLog:[]});

test('placar renderiza dados oficiais, botão de posse e sem HTML não confiável',()=>{
  const s=sim();s.teams[0].name='<script>fake</script>';
  const ui=createLiveBroadcastOverlay(s,{now:()=>0});
  assert.match(ui.root.textContent,/25/);
  assert.match(ui.root.textContent,/21/);
  assert.match(ui.root.textContent,/2º QUARTO/);
  assert.match(ui.root.textContent,/2:31/);
  assert.equal(descend(ui.root,n=>n.tagName==='script').length,0);
  assert.match(ui.root.textContent,/<script>fake<\/script>/);
  const possession=descend(ui.root,n=>n.className?.includes('nuv-tv-possession'));
  assert.equal(possession.length,2);
  assert.equal(possession[0].classList.contains('hidden'),true);
  assert.equal(possession[1].classList.contains('hidden'),false);
});

test('evento novo exibe vinheta, expira e não duplica',()=>{
  const s=sim();let ms=0;
  const ui=createLiveBroadcastOverlay(s,{now:()=>ms,cueDuration:500});
  const cue=descend(ui.root,n=>n.className?.includes('nuv-tv-cue')&&!n.className.includes('top'))[0];
  assert.equal(cue.attrs['aria-hidden'],'true');
  s.events.push({team:0,text:'Casa faz uma enterrada',clock:143,q:2,major:true});
  ui.refresh();
  assert.equal(cue.attrs['aria-hidden'],'false');
  assert.match(cue.textContent,/Casa faz uma enterrada/);
  assert.equal(cue.dataset.kind,'shot');
  ms=250;ui.refresh();assert.equal(cue.attrs['aria-hidden'],'false');
  ms=600;ui.refresh();assert.equal(cue.attrs['aria-hidden'],'true');
  assert.equal(cue.classList.contains('hidden'),true);
});

test('ocultar transmissão mantém motor intacto e não gera vinhetas antigas na volta',()=>{
  const s=sim();const original=structuredClone(s);
  const ui=createLiveBroadcastOverlay(s,{now:()=>0});
  assert.equal(ui.setVisible(false),false);
  assert.equal(ui.root.attrs['aria-hidden'],'true');
  s.events.push({team:1,text:'Fora pede tempo',clock:110,q:2});
  ui.refresh();
  ui.setVisible(true);ui.refresh();
  const cue=descend(ui.root,n=>n.className?.includes('nuv-tv-cue')&&!n.className.includes('top'))[0];
  assert.equal(cue.attrs['aria-hidden'],'true');
  assert.deepEqual(s.events,[{team:1,text:'Fora pede tempo',clock:110,q:2}]);
  assert.deepEqual({...s,events:[]},original);
  ui.dispose();
  s.score=[28,21];ui.refresh(true);
  assert.equal(descend(ui.root,n=>n.className?.includes('nuv-tv-points'))[0].textContent,'25');
});
