// Apresentação SVG de posições REAIS da nova simulação Street espacial.
// Somente visualização: não resolve resultados nem altera o estado de jogo.
import { h, mount } from '../dom.js';
import { gameSound } from '../../audio/soundscape.js';
const NS='http://www.w3.org/2000/svg';
function svg(tag,attrs={},text=''){
  const el=document.createElementNS(NS,tag);
  for(const [name,value] of Object.entries(attrs))el.setAttribute(name,String(value));
  if(text)el.textContent=text;
  return el;
}
const nameOf=(game,side,id)=>game.teams[side].roster.find(p=>String(p.id)===String(id))?.name??`#${id}`;

export function createStreetSpatialViewer(game){
  if(game?.engine!=='spatial-street-v1')throw Error('Street 2D requer partida espacial.');
  const events=[...game.events].reverse();
  let eventIndex=Math.max(0,events.length-1),frameIndex=0,playing=false,last=0,animation=null;
  const media=typeof window!=='undefined'&&typeof window.matchMedia==='function'?window.matchMedia('(prefers-reduced-motion: reduce)'):null;
  const reducedMotion=!!media?.matches;
  const schedule=cb=>typeof window?.requestAnimationFrame==='function'?window.requestAnimationFrame(cb):null;
  const cancel=id=>{if(id!=null&&typeof window?.cancelAnimationFrame==='function')window.cancelAnimationFrame(id);};
  const court=svg('svg',{viewBox:'0 0 420 240',class:'w-spatial-court',role:'img','aria-label':'Quadra Street 2D, posições das atletas e trajetória da bola'});
  court.append(svg('rect',{x:0,y:0,width:420,height:240,rx:10,fill:'#153b44'}),
    svg('rect',{x:8,y:8,width:404,height:224,rx:6,fill:'none',stroke:'#afd4ca','stroke-width':2}),
    svg('path',{d:'M 420 40 L 344 40 L 344 200 L 420 200',fill:'none',stroke:'#aed4ca','stroke-width':2}),
    svg('circle',{cx:369,cy:120,r:5,fill:'none',stroke:'#ffdfb6','stroke-width':3}),
    svg('path',{d:'M 195 12 A 185 185 0 0 1 195 228',fill:'none',stroke:'#aed4ca','stroke-width':2,'stroke-dasharray':'4 5'}));
  const tokenGroups=[0,1].map((side)=>game.teams[side].roster.map((p,i)=>{
    const group=svg('g');
    const c=svg('circle',{cx:0,cy:0,r:10,stroke:side===0?'#f3e2f7':'#d4f3ec','stroke-width':2,fill:game.teams[side].colors?.[0]??(side===0?'#b45fba':'#2b8c85')});
    const text=svg('text',{x:0,y:0,'font-size':9,'font-weight':700,'text-anchor':'middle','dominant-baseline':'central',fill:'#fff'},String(i+1));
    const title=svg('title',{},p.name);
    group.append(c,text,title);court.append(group);return group;
  }));
  const ball=svg('circle',{cx:78,cy:120,r:5,fill:'#ffb56c',stroke:'#171f26','stroke-width':1.5});court.append(ball);
  const message=h('p',{class:'w-spatial-announcer','aria-live':'polite'});
  const info=h('p',{class:'w-disclaimer'});
  const current=h('span',{class:'w-disclaimer'});
  const frameLabel=h('span',{class:'w-disclaimer'});
  let streetSound = false, lastShot = '';
  const soundButton=h('button',{type:'button',class:'w-btn','aria-label':'Ativar efeitos Street',onclick:async()=>{
    streetSound = !streetSound;
    if(streetSound){ streetSound = await gameSound.unlock(); gameSound.setActive(streetSound); }
    else gameSound.setActive(false);
    soundButton.textContent=streetSound?'Som ligado':'Ativar som';
  }},'Ativar som');
  const playButton=h('button',{type:'button',class:'w-btn'});
  const prev=h('button',{type:'button',class:'w-btn',onclick:()=>pick(eventIndex-1)},'◀ Posse anterior');
  const next=h('button',{type:'button',class:'w-btn',onclick:()=>pick(eventIndex+1)},'Próxima posse ▶');
  const advance=h('button',{type:'button',class:'w-btn',onclick:()=>{pause();frameIndex=Math.min(frameIndex+1,(events[eventIndex]?.frames.length??1)-1);draw();}},'Quadro +1');
  const root=h('section',{class:'w-spatial-shell'},
    h('div',{class:'w-spatial-top'},h('strong',null,'Street 2D · replay das posições simuladas'),current),
    court,h('div',{class:'w-spatial-controls'},prev,playButton,advance,next,soundButton,frameLabel),
    message,info,h('p',{class:'w-disclaimer'},'Movimento e arremessos calculados pelo motor Street 2D experimental; a marcação influencia as chances. Sem dados de rastreamento real.'));
  function draw(){
    const event=events[eventIndex];
    if(!event){mount(message,'Comece uma posse para ver a quadra.');mount(info,'');mount(current,'0 posses');mount(frameLabel,'');return;}
    const frames=event.frames;frameIndex=Math.max(0,Math.min(frameIndex,frames.length-1));
    const frame=frames[frameIndex];
    if(streetSound && playing && frame.phase==='shot' && lastShot !== `${event.n}:${eventIndex}`){
      lastShot=`${event.n}:${eventIndex}`;
      gameSound.play(event.kind==='steal'?'steal':event.kind==='miss'?'rim':'swish');
    }
    if(streetSound && playing && frame.phase==='movement' && frameIndex%8===0) gameSound.play('bounce',{intensity:0.35});
    for(let side=0;side<2;side++)for(let i=0;i<tokenGroups[side].length;i++){
      const pos=frame.teams[side][i];tokenGroups[side][i].setAttribute('transform',`translate(${pos.x.toFixed(1)} ${pos.y.toFixed(1)})`);
    }
    ball.setAttribute('cx',frame.ball.x.toFixed(1));ball.setAttribute('cy',frame.ball.y.toFixed(1));
    message.textContent=event.text;
    info.textContent=`${nameOf(game,event.offense,event.shooterId)} · ${event.kind==='steal'?'Roubada de bola':event.isLong?'Arremesso de 2 pontos':'Finalização de 1 ponto'} · Distância defensiva ${event.defenderDistance} · ${event.tactic}`;
    current.textContent=`Posse ${event.n} · ${event.score.join(' : ')}`;
    frameLabel.textContent=`Quadro ${frameIndex+1}/${frames.length} · ${frame.phase==='shot'?'Bola no ar':'Movimentação'}`;
    prev.disabled=eventIndex===0;next.disabled=eventIndex===events.length-1;
    advance.disabled=frameIndex===frames.length-1;playButton.textContent=playing?'Pausar':'Reproduzir';
  }
  function pause(){playing=false;cancel(animation);animation=null;draw();}
  function tick(time){
    if(!playing)return;
    if(!last||time-last>=58){last=time;
      const event=events[eventIndex];if(frameIndex<event.frames.length-1)frameIndex++;
      else {pause();return;}
      draw();
    }
    animation=schedule(tick);
    if(animation==null)pause();
  }
  function play(){if(!events.length||reducedMotion||typeof window?.requestAnimationFrame!=='function')return;
    cancel(animation);playing=true;last=0;
    if(frameIndex===(events[eventIndex].frames.length-1))frameIndex=0;
    draw();animation=schedule(tick);
  }
  function pick(index){pause();lastShot='';eventIndex=Math.max(0,Math.min(index,events.length-1));frameIndex=0;draw();}
  playButton.addEventListener('click',()=>playing?pause():play());
  if(reducedMotion)playButton.disabled=true;
  draw();
  return {element:root,stop:()=>{playing=false;cancel(animation);animation=null;gameSound.setActive(false);},select:pick};
}
