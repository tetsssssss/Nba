// Evolution WNBA 501+: entirely standalone exhibition league, no career/save imports.
import { h, mount } from '../dom.js';
import { playerAvatar, teamLogo } from '../../media/photos.js';
import { WNBA_TEAMS, WNBA_PLAYERS, WNBA_BY_ID, WNBA_SNAPSHOT, wnbaRoster, WNBA_PHOTO_IDS } from '../../wnba/catalog.js';
import { simulateWnbaExhibition, simulateWnbaCustom, wnbaExhibitionSeries, wnbaCup, wnbaAllStars } from '../../wnba/engine.js';
import { MatchSim } from '../../match/sim.js';
import { renderLive } from './match-live.js';
import { newStreetGame, streetPossession, simulateStreet } from '../../arcade/street.js';
import { streetStatistics } from '../../arcade/street-statistics.js';
import { newSpatialStreetGame, spatialStreetPossession, simulateSpatialStreet, spatialStreetSummary } from '../../arcade/street-spatial.js';
import { createStreetSpatialViewer } from '../components/street-spatial.js';
import { threePointContest } from '../../arcade/all-star.js';
import { defaultWnbaStudio, validateWnbaStudio, wnbaStudioTeams, setWnbaStudioPlayer, wnbaFantasyDraft, exportWnbaStudio, importWnbaStudio } from '../../wnba/roster-studio.js';
import { wnbaLeagueSnapshot, searchWnbaPlayers, wnbaComparePlayers, wnbaCsv } from '../../wnba/analytics.js';
import { wnbaCaptainsDraft, wnbaSkillsChallenge, wnbaStreetCircuit } from '../../wnba/showcase.js';
import { wnbaStreetShotZones } from '../../wnba/court.js';
import { runWnbaArcadeLeague } from '../../wnba/arcade-league.js';
import { compareWnbaStreetTactics } from '../../wnba/street-lab.js';
import { wnbaStreetReplay } from '../../wnba/replay.js';
import { defaultWnbaCreator, createWnbaPlayer, updateWnbaCreatedPlayer, removeWnbaCreatedPlayer, renameWnbaCreatorTeam, wnbaCreatorTeams, validateWnbaCreator, readWnbaCreator, writeWnbaCreator, exportWnbaCreator, importWnbaCreator, creatorPlayerProfile, CREATOR_SKILLS } from '../../wnba/player-creator.js';
import { runWnbaSkillAcademy } from '../../wnba/skills-academy.js';
import { runWnbaDuelTournament } from '../../wnba/duel-tournament.js';
import { readWnbaLibrary, writeWnbaLibrary, activeWnbaStudio, updateWnbaRosterSlot, switchWnbaRosterSlot, addWnbaRosterSlot, renameWnbaRosterSlot, removeWnbaRosterSlot, exportWnbaLibrary, importWnbaLibrary } from '../../wnba/roster-library.js';

const tabs=[['hub','Início'],['teams','Franquias'],['players','Jogadoras'],['play','Jogo rápido'],['street','Street WNBA'],['street-2d','Street 2D'],['allstar','All-Star'],['three','Concurso 3PTS'],['cup','Copa WNBA'],['studio','Roster Studio'],['lab','Observatório'],['series','Séries'],['festival','Festival'],['arcade-league','Liga Arcade'],['street-lab','Laboratório Street'],['photos','Fotos WNBA'],['creator','Criar jogadoras'],['academy','Academia de habilidades'],['duels','Duelos 1x1']];
const button=(text,fn,cls='')=>h('button',{class:`w-btn ${cls}`,type:'button',onclick:fn},text);
const field=(text,element)=>h('label',{class:'w-field'},h('span',null,text),element);
const select=(items,value,fn)=>h('select',{value:String(value),onchange:e=>fn(e.target.value)},items.map(([v,n])=>h('option',{value:v,selected:String(v)===String(value)},n)));
const panel=(title,sub,...children)=>h('section',{class:'w-panel'},h('div',{class:'w-panel-title'},h('h3',null,title),sub?h('p',null,sub):null),...children);
const badge=(t)=>h('span',{class:'w-badge',style:{'--w-primary':t.colors[0],'--w-secondary':t.colors[1]}},t.shortId);
const avatar=p=>playerAvatar(p,{size:'lg',color:WNBA_BY_ID.get(p.teamId)?.colors[0]});
const ratingRow=(key,value)=>h('div',{class:'w-rating-row'},h('span',null,key),h('div',{class:'w-meter'},h('span',{style:{width:`${value}%`}})),h('strong',null,value));
const skills=p=>[['Arremesso',p.attributes.threePoint],['Criação',p.attributes.shotCreation],['Passe',p.attributes.passing],['Rebote',p.attributes.defensiveRebounding],['Defesa',p.attributes.perimeterDefense],['Velocidade',p.attributes.speed]];
const teamOptions=WNBA_TEAMS.map(t=>[t.id,t.fullName]);
const warn='Resultados avulsos. Nenhuma partida, estatística ou alteração será gravada na carreira NBA.';
export function wnbaView({mode='hub'}={}){
 const active=tabs.some(([id])=>id===mode)?mode:'hub';
 const state={a:'WIND',b:'WLVA',seed:'wnba-2026',control:'-1',conference:'All',team:'All',query:'',sort:'ovr',count:8};
 const root=h('div',{class:'page wnba-page'});
 const content=h('div',{class:'w-content'});
 let cleanup=null;
 const logo=t=>h('div',{class:'w-team-icon',style:{'--w-primary':t.colors[0]}},teamLogo(t,{size:'md'}));
 const release=()=>{cleanup?.();cleanup=null;};
 window.addEventListener('hashchange',release,{once:true});
 const navigate=tab=>{release();location.hash=`#/wnba/${tab}`;};
 const personCard=(p,fn)=>h('button',{class:'w-player-card',type:'button',onclick:fn},avatar(p),h('span',{class:'w-person-text'},h('strong',null,p.name),h('small',null,`${WNBA_BY_ID.get(p.teamId)?.name} · ${p.positions[0]}`),h('small',null,`${p.stats2026.ppg.toFixed(1)} PPG · ${p.stats2026.rpg.toFixed(1)} RPG · ${p.stats2026.apg.toFixed(1)} APG`)),h('strong',{class:'w-ovr'},p.ovr));
 const teams=()=>{
  const list=h('div',{class:'w-team-grid'});
  const filter=h('div',{class:'w-toolbar'});
  const paint=()=>mount(list,WNBA_TEAMS.filter(t=>state.conference==='All'||t.conference===state.conference).map(t=>h('button',{class:'w-team-tile',type:'button',style:{'--w-primary':t.colors[0]},onclick:()=>navigate(`teams?team=${t.id}`)},
   logo(t),h('strong',null,t.fullName),h('span',null,`${t.conference==='East'?'Leste':'Oeste'} · ${wnbaRoster(t.id).length} jogadoras`),h('span',{class:'w-team-tile-footer'},'Ver elenco →'))));
  const selection=()=>{
   const p=new URLSearchParams(location.hash.split('?')[1]||'');const t=WNBA_BY_ID.get(p.get('team'));if(!t)return null;
   return panel(t.fullName,`${t.conference==='East'?'Leste':'Oeste'} · Elenco de referência 2026 · atributos estimados`,
    h('div',{class:'w-panel-actions'},button('← Todas as franquias',()=>navigate('teams')),button('Jogar contra outra equipe',()=>navigate(`play?a=${t.id}`))),
    h('div',{class:'w-people-grid'},wnbaRoster(t.id).map(p=>personCard(p,()=>showProfile(p)))));
  };
  const chosen=selection();if(chosen)return chosen;
  mount(filter,field('Conferência',select([['All','Todas'],['East','Leste'],['West','Oeste']],state.conference,v=>{state.conference=v;paint();})));
  paint();return h('div',{class:'w-stack'},panel('As 15 franquias','Identidade, elenco e conferência WNBA em 2026.',filter,list));
 };
 const modal=h('div',{class:'w-person-modal',hidden:true});
 const showProfile=p=>{
  modal.hidden=false;
  const t=WNBA_BY_ID.get(p.teamId);
  mount(modal,h('div',{class:'w-profile-card',style:{'--w-primary':t.colors[0]}},
   button('✕ Fechar',()=>modal.hidden=true,'w-close'),
   h('div',{class:'w-profile-head'},avatar(p),h('div',null,h('span',{class:'w-eyebrow'},t.fullName),h('h2',null,p.name),h('div',null,`${p.positions[0]} · ${p.ovr} OVR [estimado]`),h('small',null,p.wnbaId?'Retrato: WNBA oficial':'Foto ainda não identificada. Silhueta neutra.'))),
   h('div',{class:'w-stat-tiles'},...[['PPG',p.stats2026.ppg],['RPG',p.stats2026.rpg],['APG',p.stats2026.apg]].map(([l,v])=>h('div',null,h('strong',null,v.toFixed(1)),h('span',null,l)))),
   h('h3',null,'Atributos do simulador'),h('div',{class:'w-rating-grid'},skills(p).map(([k,v])=>ratingRow(k,v))),
   h('p',{class:'w-disclaimer'},'Atributos e Overall são estimativas próprias do jogo, calculadas a partir da posição e das médias estatísticas, e não classificações oficiais da liga.')));
 };
 const players=()=>{
  const listing=h('div',{class:'w-people-grid'}),count=h('span',{class:'w-count'});
  const paint=()=>{
   const q=state.query.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
   const values=WNBA_PLAYERS.filter(p=>
     (state.team==='All'||p.teamId===state.team)&&
     (!q||p.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q)));
   const sorted=[...values].sort((a,b)=>state.sort==='ppg'?b.stats2026.ppg-a.stats2026.ppg:state.sort==='rpg'?b.stats2026.rpg-a.stats2026.rpg:state.sort==='apg'?b.stats2026.apg-a.stats2026.apg:b.ovr-a.ovr);
   count.textContent=`${sorted.length} de ${WNBA_PLAYERS.length} jogadoras`;
   mount(listing,sorted.map(p=>personCard(p,()=>showProfile(p))));
  };
  const controls=h('div',{class:'w-toolbar'},
   field('Buscar jogadora',h('input',{placeholder:'Nome da atleta…',type:'search',oninput:e=>{state.query=e.target.value;paint();}})),
   field('Franquia',select([['All','Todas as equipes'],...teamOptions],state.team,v=>{state.team=v;paint();})),
   field('Ordenar por',select([['ovr','Overall estimado'],['ppg','Pontos por jogo'],['rpg','Rebotes por jogo'],['apg','Assistências por jogo']],state.sort,v=>{state.sort=v;paint();})));
  paint();return panel('Explorador de jogadoras','Perfis de 2026, retratos verificáveis e atributos do simulador.',controls,count,listing);
 };
 function presentation(g){
  const t=g.teams;
  return h('section',{class:'w-box-result','aria-live':'polite'},h('span',{class:'w-eyebrow'},'FINAL · WNBA · AMISTOSO'),
   h('div',{class:'w-scoreline'},h('div',null,badge(WNBA_BY_ID.get(t[0].id)??{shortId:t[0].name.slice(0,3),colors:t[0].colors}),h('strong',null,t[0].name)),h('strong',{class:'w-score'},`${g.score[0]} : ${g.score[1]}`),h('div',null,badge(WNBA_BY_ID.get(t[1].id)??{shortId:t[1].name.slice(0,3),colors:t[1].colors}),h('strong',null,t[1].name))),
   h('div',{class:'w-periods'},['Q1','Q2','Q3','Q4',...Array.from({length:g.ot},(_,i)=>`OT${i+1}`)].map((q,i)=>h('div',null,h('small',null,q),h('strong',null,`${g.quarters[0][i]}–${g.quarters[1][i]}`)))),
   h('div',{class:'w-people-grid'},t.map((team,i)=>panel(`Box score · ${team.name}`,'Pontos, rebotes e assistências',h('table',{class:'w-data'},h('thead',null,h('tr',null,...['Jogadora','PTS','REB','AST'].map(x=>h('th',null,x)))),h('tbody',null,g.box[i].map(p=>h('tr',null,h('td',null,p.name),h('td',null,p.pts),h('td',null,p.orb+p.drb),h('td',null,p.ast)))))))),
   h('small',{class:'w-disclaimer'},warn));
 }
 const play=()=>{
  const host=h('div',{class:'w-result-host','aria-live':'polite'});
  let a=new URLSearchParams(location.hash.split('?')[1]||'').get('a')||state.a,b=state.b,seed=state.seed,control=state.control;
  const create=()=>{
   if(a===b){mount(host,h('p',{class:'w-disclaimer'},'Escolha franquias diferentes.'));return;}
   const g=simulateWnbaExhibition(a,b,{seed});mount(host,presentation(g));
  };
  const live=()=>{
   if(a===b){mount(host,h('p',null,'Escolha duas franquias diferentes.'));return;}
   const specs=[a,b].map(id=>{const t=WNBA_BY_ID.get(id);return {...t,team:t,roster:wnbaRoster(id),aiCoach:control!==String([a,b].indexOf(id))};});
   const sim=new MatchSim(specs,{seed,quarterSeconds:600,recordReplay:true});
   release();
   const back=button('← Voltar aos amistosos',()=>{release();show();});
   const label=h('div',{class:'w-2d-label'},back,h('strong',null,'WNBA · Quadra 2D · 4×10 min'),h('span',null,warn));
   const canvasHost=h('div',{class:'w-live-host'});
   mount(content,label,canvasHost);
   cleanup=renderLive(canvasHost,sim,specs,{control:control==='-1'?null:Number(control),mode:'quick',isolated:true,presentationTitle:'WNBA · Partida',onNew:()=>{release();show();},onRestart:()=>{release();live();},onArcadeFinish:()=>{}});
  };
  return panel('Partida WNBA independente','Jogo de 4 períodos de 10 minutos, com motor rápido próprio ou partida 2D.',
   h('div',{class:'w-toolbar'},field('Mandante',select(teamOptions,a,v=>a=v)),field('Visitante',select(teamOptions,b,v=>b=v)),field('Semente',h('input',{value:seed,oninput:e=>seed=e.target.value.slice(0,64)})),
    field('Controle 2D',select([['-1','Espectador (IA x IA)'],['0','Mandante'],['1','Visitante']],control,v=>control=v))),
   h('div',{class:'w-panel-actions'},button('Simulação rápida',create,'w-primary'),button('Jogar / assistir em 2D',live)),host,h('p',{class:'w-disclaimer'},warn));
 };
 const cup=()=>{
  const result=h('div',{class:'w-stack'});let ids=WNBA_TEAMS.slice(0,8).map(t=>t.id),seed='wnba-cup',num=8;
  const slots=h('div',{class:'w-cup-slots'});
  const paint=()=>mount(slots,Array.from({length:num},(_,i)=>field(`Franquia ${i+1}`,select(teamOptions,ids[i],v=>{ids[i]=v;}))));
  paint();
  const run=()=>{try{const out=wnbaCup(ids.slice(0,num),{seed});mount(result,...out.rounds.map((round,i)=>panel(i===out.rounds.length-1?'FINAL':i===0?'PRIMEIRA RODADA':'SEMIFINAL',null,...round.map(g=>h('div',{class:'w-bracket-row'},h('strong',null,WNBA_BY_ID.get(g.teams[0].id).name),h('span',null,`${g.score[0]} : ${g.score[1]}`),h('strong',null,WNBA_BY_ID.get(g.teams[1].id).name))))),h('div',{class:'w-champion'},`Campeã: ${WNBA_BY_ID.get(out.champion).fullName}`));}catch(e){mount(result,h('p',{class:'w-disclaimer'},e.message));}};
  return panel('Copa WNBA independente','Torneio eliminatório avulso com 4 ou 8 franquias, sem alterar a temporada.',
   h('div',{class:'w-toolbar'},field('Formato',select([['4','4 equipes'],['8','8 equipes']],num,v=>{num=Number(v);ids=WNBA_TEAMS.slice(0,num).map(t=>t.id);paint();})),field('Semente',h('input',{value:seed,oninput:e=>{seed=e.target.value.slice(0,64);invalidateStreet();}}))),slots,
   button('Simular Copa',run,'w-primary'),result,h('p',{class:'w-disclaimer'},warn));
 };
 // Schematic shot map from the Street engine's recorded events, not tracking coordinates.
 const streetChart=game=>{
  const ns='http://www.w3.org/2000/svg';
  const add=(parent,tag,attrs={})=>{const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));parent.append(el);return el;};
  const svg=document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox','0 0 420 245');svg.setAttribute('class','w-street-svg');
  svg.setAttribute('role','img');svg.setAttribute('aria-label','Mapa esquemático das últimas tentativas de arremesso Street');
  add(svg,'rect',{x:0,y:0,width:420,height:245,fill:'#172b36'});
  add(svg,'rect',{x:9,y:9,width:402,height:227,rx:5,fill:'none',stroke:'#90a7ad','stroke-width':2});
  add(svg,'line',{x1:210,y1:9,x2:210,y2:236,stroke:'#90a7ad','stroke-width':1,'stroke-dasharray':'5 7'});
  add(svg,'circle',{cx:326,cy:125,r:5,fill:'none',stroke:'#f2d9b8','stroke-width':2});
  add(svg,'rect',{x:280,y:71,width:131,height:108,fill:'none',stroke:'#90a7ad','stroke-width':1.5});
  const shots=wnbaStreetShotZones(game);
  for(const shot of shots){const color=shot.made?'#80e5a9':'#ff919d';
   const circle=add(svg,'circle',{cx:shot.x,cy:shot.y,r:shot.made?5:4,fill:color,opacity:.85,stroke:'#18222e','stroke-width':1});
   const title=add(circle,'title');title.textContent=shot.label;
  }
  return h('figure',{class:'w-street-figure'},svg,h('figcaption',null,
   `${shots.length} tentativas representadas · Verde: cesta · Rosa: erro. Posições ilustrativas, não rastreamento 2D.`));
 };
 const street=()=>{
  const host=h('div',{class:'w-result-host','aria-live':'polite'});
  let a='WATL',b='WLVA',size=3,target=21,seed='wnba-street',tactic='balanced',game=null;
  let picks=[wnbaRoster(a).slice(0,3).map(p=>p.id),wnbaRoster(b).slice(0,3).map(p=>p.id)];
  const rosterIds=(teamId)=>wnbaRoster(teamId).map(p=>[String(p.id),p.name]);
  const slots=h('div',{class:'w-cup-slots'});
  const showSlots=()=>mount(slots,...Array.from({length:2},(_,side)=>h('div',{class:'w-stack'},
   h('strong',null,WNBA_BY_ID.get(side?a:b).fullName),
   ...Array.from({length:size},(_,slot)=>field(`Jogadora ${slot+1}`,select(rosterIds(side?b:a),String(picks[side][slot]),v=>{picks[side][slot]=Number(v);invalidateStreet();}))))));
  const resetSide=(side,id)=>{if(side)a=id;else b=id;picks[side]=wnbaRoster(id).slice(0,size).map(p=>p.id);invalidateStreet();showSlots();};
  const make=()=>{
   if(a===b)throw Error('Escolha equipes diferentes.');
   const teams=[a,b].map((id,side)=>({id,name:WNBA_BY_ID.get(id).fullName,colors:WNBA_BY_ID.get(id).colors,
    roster:picks[side].slice(0,size).map(pid=>WNBA_PLAYERS.find(p=>p.id===pid&&p.teamId===id))}));
   if(teams.some(t=>t.roster.some(p=>!p)))throw Error('Escolha jogadoras válidas.');
   return newStreetGame(teams,{seed,target,squadSize:size});
  };
  const replayHost=h('div',{class:'w-stack'});let replayIndex=0;
  const invalidateStreet=()=>{game=null;mount(host);mount(replayHost);};
  const showReplay=()=>{try{
    const replay=wnbaStreetReplay(game);
    if(!replay.frames.length){mount(replayHost,h('p',null,'Ainda não há posses para reproduzir.'));return;}
    replayIndex=Math.max(0,Math.min(replayIndex,replay.frames.length-1));
    const f=replay.frames[replayIndex];
    mount(replayHost,panel('Replay Street · registro das jogadas',
      `${replay.truncated?'Últimas':'Todas as'} ${replay.retained} posses mantidas no histórico do motor`,
      h('div',{class:'w-replay-frame','aria-live':'polite'},
        h('span',{class:'w-eyebrow'},`POSSE ${f.possession} · ${f.team}`),
        h('strong',{class:'w-replay-score'},f.score.join(' : ')),h('p',null,f.text)),
      h('div',{class:'w-panel-actions'},
        button('◀ Anterior',()=>{replayIndex=Math.max(0,replayIndex-1);showReplay();}),
        h('span',{class:'w-disclaimer'},`${replayIndex+1} / ${replay.frames.length}`),
        button('Próxima ▶',()=>{replayIndex=Math.min(replay.frames.length-1,replayIndex+1);showReplay();})),
      h('p',{class:'w-disclaimer'},'Replay textual de posses reais simuladas. Não há rastreamento espacial nem vídeo gravado.')));
  }catch(e){mount(replayHost,h('p',{class:'w-disclaimer'},e.message));}};
  const report=()=>{if(!game)return;replayIndex=0;mount(replayHost);mount(host,h('section',{class:'w-box-result'},
   h('span',{class:'w-eyebrow'},game.over?'FIM · STREET FEMININO':'STREET · MEIA QUADRA'),
   h('div',{class:'w-scoreline'},h('strong',null,game.teams[0].name),h('strong',{class:'w-score'},`${game.score[0]} : ${game.score[1]}`),h('strong',null,game.teams[1].name)),
   h('p',{class:'w-disclaimer'},`${game.possessions} posses · ${size}x${size} · meta ${target} · resultado avulso`),streetChart(game),
   h('div',{class:'w-street-stats'},...streetStatistics(game).map(team=>panel(`Estatísticas Street · ${team.name}`,'1PT e 2PT: acertos/tentativas; ROB: roubos; PER: perdas',
    h('div',{class:'w-street-table-scroll'},h('table',{class:'w-data'},
     h('caption',null,`Box score Street de ${team.name}`),
     h('thead',null,h('tr',null,...['Jogadora','PTS','1PT','2PT','FG%','ROB','PER'].map(x=>h('th',{scope:'col'},x)))),
     h('tbody',null,team.players.map(p=>h('tr',null,h('th',{scope:'row'},p.name),h('td',null,p.pts),h('td',null,`${p.oneMade}/${p.oneAtt}`),h('td',null,`${p.twoMade}/${p.twoAtt}`),h('td',null,p.fgPct),h('td',null,p.steals),h('td',null,p.turnovers)))),
     h('tfoot',null,h('tr',null,h('th',{scope:'row'},'Total'),h('td',null,team.totals.pts),h('td',null,`${team.totals.oneMade}/${team.totals.oneAtt}`),h('td',null,`${team.totals.twoMade}/${team.totals.twoAtt}`),h('td',null,team.totals.fgPct),h('td',null,team.totals.steals),h('td',null,team.totals.turnovers)))))))),
   game.over?h('div',{class:'w-champion'},`Vitória: ${game.teams[game.winner].name}`):button('Próxima posse',()=>{game=streetPossession(game,tactic);report();}),
   button('Assistir replay das posses',()=>{replayIndex=0;showReplay();}),replayHost,
   h('div',{class:'w-stack'},...game.events.slice(0,12).map(e=>h('div',{class:'w-bracket-row'},h('strong',null,`#${e.n}`),h('span',null,e.text))))));};
  const start=(complete)=>{try{game=make();if(complete)game=simulateStreet(game,{tactic});report();}catch(e){mount(host,h('p',{class:'w-disclaimer'},e.message));}};
  showSlots();
  return panel('Street WNBA · meia quadra','1x1, 2x2 ou 3x3. Pontos de 1 e 2, placares até 11 ou 21. Motor independente.',
   h('div',{class:'w-toolbar'},field('Equipe A',select(teamOptions,a,v=>resetSide(0,v))),field('Equipe B',select(teamOptions,b,v=>resetSide(1,v))),
    field('Formato',select([['1','1x1'],['2','2x2'],['3','3x3']],size,v=>{size=Number(v);picks=[wnbaRoster(a).slice(0,size).map(p=>p.id),wnbaRoster(b).slice(0,size).map(p=>p.id)];invalidateStreet();showSlots();})),
    field('Meta',select([['11','11 pontos'],['21','21 pontos']],target,v=>{target=Number(v);invalidateStreet();})),
    field('Tática',select([['balanced','Equilibrada'],['outside','Arremessos longos'],['drive','Infiltrações'],['pass','Passes']],tactic,v=>tactic=v)),
    field('Semente',h('input',{value:seed,oninput:e=>{seed=e.target.value.slice(0,64);invalidateStreet();}}))),slots,
   h('div',{class:'w-panel-actions'},button('Simular partida',()=>start(true),'w-primary'),button('Jogar posse a posse',()=>start(false))),host,h('p',{class:'w-disclaimer'},warn));
 };
 const spatialStreet=()=>{
  let a='WIND',b='WLVA',size=3,target=11,seed='wnba-spatial-2d',tactic='balanced',game=null,viewer=null;
  // Apenas o resumo curto é anunciado, não a quadra inteira a cada posse.
  const host=h('div',{class:'w-result-host'});
  const shutdown=()=>{viewer?.stop();viewer=null;};
  cleanup=shutdown;
  const make=()=>{
    if(a===b)throw Error('Street 2D: escolha duas franquias diferentes.');
    const teams=[a,b].map(id=>({id,name:WNBA_BY_ID.get(id).fullName,colors:WNBA_BY_ID.get(id).colors,
      roster:wnbaRoster(id).slice(0,size)}));
    return newSpatialStreetGame(teams,{seed,target,squadSize:size});
  };
  const paint=()=>{
    shutdown();
    if(!game){mount(host,h('p',{class:'w-disclaimer'},'Escolha as equipes e inicie a partida experimental.'));return;}
    const summary=spatialStreetSummary(game);
    viewer=createStreetSpatialViewer(game);
    mount(host,panel('Partida independente · Street 2D',`Motor espacial experimental · ${size}x${size}`,
      h('div',{class:'w-scoreline'},h('strong',null,game.teams[0].name),h('strong',{class:'w-score'},game.score.join(' : ')),h('strong',null,game.teams[1].name)),
      h('p',{class:'w-disclaimer'},`${game.possessions} posses · ${game.over?'Finalizada':'Em andamento'} · Meta: ${target} · ${warn}`),
      viewer.element,
      h('div',{class:'w-panel-actions'},
        game.over?null:button('Próxima posse 2D',()=>{game=spatialStreetPossession(game,tactic);paint();},'w-primary'),
        game.over?null:button('Simular até o final',()=>{game=simulateSpatialStreet(game,{tactic});paint();})),
      h('p',{class:'w-disclaimer',role:'status','aria-live':'polite'},
        game.over ? `Fim de jogo: ${game.teams[game.winner].name} venceu por ${game.score.join(' a ')}.` :
        game.events[0] ? `Placar ${game.score.join(' a ')}. ${game.events[0].text}` : 'Partida pronta para começar.'),
      h('div',{class:'w-stat-tiles'},summary.shots.map((v,i)=>h('div',null,
        h('strong',null,`${v.made}/${v.attempts}`),
        h('span',null,`${game.teams[i].name} · Cestas / arremessos`),
        h('small',null,`Aproveitamento ${v.attempts ? (100*v.made/v.attempts).toFixed(1) : '0,0'}% · ${v.steals} roubos`)))),
      game.over?h('strong',{class:'w-champion'},`Vitória: ${game.teams[game.winner].name}`):null,
      h('div',{class:'w-stack'},...game.events.slice(0,8).map(e=>h('div',{class:'w-bracket-row'},h('strong',null,`#${e.n}`),h('span',null,e.text))))));
  };
  const start=()=>{try{game=make();paint();}catch(e){mount(host,h('p',{class:'w-disclaimer'},e.message));}};
  paint();
  return panel('Street WNBA 2D · Experimental','Movimentação contínua por quadros, marcação espacial e arremessos afetados pela distância da defensora.',
    h('div',{class:'w-toolbar'},
      field('Franquia A',select(teamOptions,a,v=>{a=v;game=null;paint();})),
      field('Franquia B',select(teamOptions,b,v=>{b=v;game=null;paint();})),
      field('Formato',select([['1','1x1'],['2','2x2'],['3','3x3']],size,v=>{size=Number(v);game=null;paint();})),
      field('Meta',select([['11','11 pontos'],['21','21 pontos']],target,v=>{target=Number(v);game=null;paint();})),
      field('Tática',select([['balanced','Equilibrada'],['outside','Arremesso externo'],['drive','Infiltração'],['pass','Circulação']],tactic,v=>{tactic=v;})),
      field('Semente',h('input',{value:seed,oninput:e=>{seed=e.target.value.slice(0,64);}}))),
    h('div',{class:'w-panel-actions'},button('Nova partida Street 2D',start,'w-primary')),
    host,h('p',{class:'w-disclaimer'},'Este é um motor experimental avulso. Não substitui Street clássico nem partidas 5x5; decisões utilizam posicionamento espacial simplificado.'));
 };
 const allstar=()=>{
  const left=wnbaAllStars('East'),right=wnbaAllStars('West');
  const go=()=>{
   const infos=[[left,'Leste','#c978b6'],[right,'Oeste','#9771dc']].map(([roster,name,color],i)=>({id:`W-AS-${i}`,name:`Seleção ${name}`,colors:[color,'#111827'],roster,aiCoach:true,team:{id:`W-AS-${i}`,name:`Seleção ${name}`,colors:[color,'#111827']}}));
   const sim=new MatchSim(infos,{seed:'wnba-allstar-2026',quarterSeconds:600,recordReplay:true});
   release();const back=button('← Voltar às estrelas',()=>{release();show();});const holder=h('div',{class:'w-live-host'});
   mount(content,h('div',{class:'w-2d-label'},back,h('strong',null,'WNBA All-Star · Exibição 2D'),h('span',null,warn)),holder);
   cleanup=renderLive(holder,sim,infos,{control:null,mode:'quick',isolated:true,presentationTitle:'WNBA · Partida',onArcadeFinish:()=>{},onNew:()=>{release();show();},onRestart:()=>{release();go();}});
  };
  return panel('WNBA All-Star Showcase','Seleção simulada por Overall estimado. Não representa votação oficial.',
   h('div',{class:'w-people-grid'},...[[left,'Leste'],[right,'Oeste']].map(([players,name])=>panel(`Seleção ${name}`,null,...players.map(p=>personCard(p,()=>showProfile(p)))))),
   h('div',{class:'w-panel-actions'},button('Assistir All-Star 5x5 · 2D',go,'w-primary')),
   h('p',{class:'w-disclaimer'},'Seleções ilustrativas, sem votação oficial, com partida avulsa independente.'));
 };
 const threes=()=>{
  const host=h('div',{class:'w-stack','aria-live':'polite'});let seed='wnba-3pt-2026';
  const paint=()=>{
   const results=threePointContest(WNBA_PLAYERS,seed);
   mount(host,panel('Resultado do concurso','Oito participantes, cinco racks, 30 pontos possíveis. Seleção por arremesso estimado.',
    ...results.map((r,i)=>h('div',{class:'w-bracket-row'},h('strong',null,`${i+1}º · ${r.name}`),h('span',null,r.racks.map(x=>x.reduce((a,b)=>a+b,0)).join(' · ')),h('strong',null,`${r.points} / 30`))),
    h('p',{class:'w-disclaimer'},'Competição simulada, não vinculada ao All-Star oficial.')));
  };
  return panel('Desafio das arremessadoras','Concurso avulso de três pontos com participantes classificadas pelos atributos WNBA.',
   h('div',{class:'w-toolbar'},field('Semente',h('input',{value:seed,oninput:e=>seed=e.target.value.slice(0,64)}))),
   button('Iniciar novo concurso',paint,'w-primary'),host,h('p',{class:'w-disclaimer'},warn));
 };
 const studio=()=>{
  const host=h('div',{class:'w-stack'}),result=h('div',{class:'w-stack','aria-live':'polite'});
  let current,library; let available=true,search='';
  try{library=readWnbaLibrary(localStorage);current=activeWnbaStudio(library);}
  catch{available=false;library=readWnbaLibrary(null);current=activeWnbaStudio(library);}
  const status=h('p',{class:'w-disclaimer','aria-live':'polite'});
  const persist=()=>{try{library=updateWnbaRosterSlot(library,current);writeWnbaLibrary(localStorage,library);status.textContent='Roster salvo na biblioteca WNBA independente.';}
    catch(e){available=false;status.textContent=`Não foi possível gravar. Exporte o JSON. ${e.message}`;}};
  const slotHost=h('div',{class:'w-stack'});
  const showSlotError=e=>{status.textContent=e.message;};
  const renderSlots=()=>{
    const chosen=library.slots.find(s=>s.id===library.activeId);
    mount(slotHost,h('div',{class:'w-toolbar'},
      field('Roster ativo',select(library.slots.map(s=>[s.id,s.name]),library.activeId,id=>{
        try{library=switchWnbaRosterSlot(library,id);current=activeWnbaStudio(library);writeWnbaLibrary(localStorage,library);paint();}
        catch(e){showSlotError(e);}})),
      field('Nome do slot',h('input',{value:chosen.name,maxLength:42,'aria-label':'Renomear slot WNBA',onchange:e=>{
        try{library=renameWnbaRosterSlot(library,library.activeId,e.target.value);writeWnbaLibrary(localStorage,library);renderSlots();}
        catch(error){showSlotError(error);}}}))),
      h('div',{class:'w-panel-actions'},
        button('Duplicar roster',()=>{try{library=addWnbaRosterSlot(library,{name:`Cópia ${library.nextId}`});current=activeWnbaStudio(library);writeWnbaLibrary(localStorage,library);paint();}catch(e){showSlotError(e);}}),
        button('Novo roster vazio',()=>{try{library=addWnbaRosterSlot(library,{name:`Roster ${library.nextId}`,copyActive:false});current=activeWnbaStudio(library);writeWnbaLibrary(localStorage,library);paint();}catch(e){showSlotError(e);}}),
        button('Excluir slot',()=>{if(!window.confirm('Excluir este roster WNBA? Esta operação não pode ser desfeita.'))return;
          try{library=removeWnbaRosterSlot(library,library.activeId);current=activeWnbaStudio(library);writeWnbaLibrary(localStorage,library);paint();}catch(e){showSlotError(e);}})));
  };
  const set=(draft)=>{try{current=validateWnbaStudio(draft);persist();paint();}catch(e){status.textContent=e.message;}};
  const download=()=>{
   const blob=new Blob([exportWnbaStudio(current)],{type:'application/json'});
   const url=URL.createObjectURL(blob);const a=h('a',{href:url,download:'wnba-fantasy-roster.json'});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  };
  const rosterPlayer=pid=>WNBA_PLAYERS.find(p=>String(p.id)===pid);
  const editors=h('div',{class:'w-fantasy-grid'}),pool=h('div',{class:'w-roster-pool'});
  const paint=()=>{
   mount(editors,...current.teams.map((t,side)=>panel(t.name,`${t.playerIds.length}/15 jogadoras`,
    field('Nome da equipe',h('input',{value:t.name,maxLength:42,onchange:e=>{const d=structuredClone(current);d.teams[side].name=e.target.value;set(d);}})),
    field('Cor principal',h('input',{type:'color',value:t.colors[0],onchange:e=>{const d=structuredClone(current);d.teams[side].colors[0]=e.target.value;set(d);}})),
    h('div',{class:'w-mini-list'},...t.playerIds.map(id=>{const p=rosterPlayer(id);return h('div',{class:'w-mini-person'},h('span',null,`${p?.name??'Desconhecida'} · ${p?.ovr??'-'} OVR`),button('Retirar',()=>{try{current=setWnbaStudioPlayer(current,side,id);persist();paint();}catch(e){status.textContent=e.message;}}));})))));
   const q=search.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
   const rows=WNBA_PLAYERS.filter(p=>p.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q)).sort((a,b)=>b.ovr-a.ovr).slice(0,70);
   mount(pool,...rows.map(p=>h('div',{class:'w-pool-row'},h('div',null,h('strong',null,p.name),h('small',null,`${WNBA_BY_ID.get(p.teamId)?.name} · ${p.ovr} OVR · ${p.role}`)),
    ...current.teams.map((t,side)=>button(t.playerIds.includes(String(p.id))?'✓ '+t.name:'→ '+t.name,()=>{
     try{current=setWnbaStudioPlayer(current,side,p.id);persist();paint();}catch(e){status.textContent=e.message;}
    },t.playerIds.includes(String(p.id))?'w-selected':'')))));
    renderSlots();
  };
  const live=()=>{
   try{
    const specs=wnbaStudioTeams(current);
    const sim=new MatchSim(specs,{seed:'wnba-fantasy-2d',quarterSeconds:600,recordReplay:true});
    release();const goBack=button('← Voltar ao Roster Studio',()=>{release();show();});
    const holder=h('div',{class:'w-live-host'});
    mount(content,h('div',{class:'w-2d-label'},goBack,h('strong',null,'WNBA Fantasy · 2D isolado'),h('span',null,warn)),holder);
    cleanup=renderLive(holder,sim,specs,{control:null,mode:'quick',isolated:true,presentationTitle:'WNBA · Partida',onArcadeFinish:()=>{},onNew:()=>{release();show();},onRestart:()=>{release();live();}});
   }catch(e){mount(result,h('p',{class:'w-disclaimer'},e.message));}
  };
  const jsonInput=h('input',{type:'file',accept:'.json,application/json',class:'w-file-input',onchange:async e=>{
   const f=e.target.files?.[0];if(!f)return;
   try{if(f.size>80000)throw Error('O JSON excede o limite de 80 KB.');set(importWnbaStudio(await f.text()));}
   catch(err){status.textContent=err.message;}e.target.value='';
  }});
  const libInput=h('input',{type:'file',accept:'.json,application/json',class:'w-file-input',onchange:async e=>{
    const file=e.target.files?.[0];if(!file)return;
    try{if(file.size>300000)throw Error('Biblioteca excede 300 KB.');library=importWnbaLibrary(await file.text());current=activeWnbaStudio(library);writeWnbaLibrary(localStorage,library);paint();}
    catch(error){showSlotError(error);} e.target.value='';
  }});
  const downloadLibrary=()=>{
    const url=URL.createObjectURL(new Blob([exportWnbaLibrary(library)],{type:'application/json'}));
    const a=h('a',{href:url,download:'wnba-biblioteca-rosters.json'});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  };
  mount(host,
   panel('Biblioteca de rosters · 8 slots','Vários universos fantasy independentes. O roster antigo é carregado automaticamente na primeira abertura.',
    slotHost,h('div',{class:'w-panel-actions'},button('Exportar biblioteca',downloadLibrary),button('Importar biblioteca',()=>libInput.click()),libInput)),
   panel('WNBA Roster Studio','Elencos de fantasy para amistosos isolados. Nenhuma jogadora muda de franquia na base oficial.',
    h('div',{class:'w-toolbar'},field('Nome do universo',h('input',{value:current.name,maxLength:42,onchange:e=>{const d=structuredClone(current);d.name=e.target.value;set(d);}})),
    field('Buscar jogadora',h('input',{type:'search',placeholder:'Filtrar 182 jogadoras',oninput:e=>{search=e.target.value;paint();}}))),
    h('div',{class:'w-panel-actions'},button('Fantasy draft',()=>set(wnbaFantasyDraft()),'w-primary'),button('Restaurar times',()=>set(defaultWnbaStudio())),button('Exportar JSON',download),button('Importar JSON',()=>jsonInput.click()),jsonInput),
    status,h('div',{class:'w-fantasy-grid'},editors),h('h3',null,'Mercado livre de fantasy'),pool),
   panel('Jogar com meus rosters','Cada equipe precisa de pelo menos 5 jogadoras.',
    h('div',{class:'w-panel-actions'},button('Simular amistoso',()=>{
     try{mount(result,presentation(simulateWnbaCustom(wnbaStudioTeams(current),{seed:'wnba-fantasy'})));}
     catch(e){mount(result,h('p',{class:'w-disclaimer'},e.message));}
    },'w-primary'),button('Jogar / assistir em 2D',live)),result,h('p',{class:'w-disclaimer'},warn)));
  if(!available)status.textContent='Armazenamento indisponível. Exporte o JSON para guardar os elencos.';
  paint();return host;
 };
 const lab=()=>{
  const output=h('div',{class:'w-stack'}),filters={q:'',team:'All',role:'All',metric:'ppg'};
  const ranking=()=>{
   const rows=searchWnbaPlayers({query:filters.q,teamId:filters.team,position:filters.role,sort:filters.metric,limit:50});
   const val=p=>filters.metric==='ovr'?p.ovr:p.stats2026[filters.metric];
   const max=Math.max(1,...rows.map(val));
   mount(output,h('div',{class:'w-lab-results'},...rows.map((p,i)=>h('div',{class:'w-lab-row'},
    h('span',{class:'w-lab-rank'},i+1),h('span',null,p.name),h('span',{class:'w-lab-bar'},h('span',{style:{width:`${Math.round(val(p)/max*100)}%`}})),h('strong',null,Number(val(p)).toFixed(filters.metric==='ovr'?0:1))))));
  };
  const snapshots=wnbaLeagueSnapshot();
  const statLabels=[['ppg','Pontos'],['rpg','Rebotes'],['apg','Assistências'],['ovr','Overall estimado']];
  const pa=WNBA_PLAYERS[0],pb=WNBA_PLAYERS[1];let ida=String(pa.id),idb=String(pb.id);
  const compareHost=h('div',{class:'w-stack'});
  const drawCompare=()=>{try{const data=wnbaComparePlayers(ida,idb);
   mount(compareHost,panel(`${data.a.name} × ${data.b.name}`,'Indicadores de referência e notas estimadas',
    ...data.groups.map(x=>h('div',{class:'w-stat-compare'},h('span',null,x.label),h('strong',null,`${x.a.toFixed(1)}  ×  ${x.b.toFixed(1)}`))),
    ...data.ratings.map(x=>h('div',{class:'w-stat-compare'},h('span',null,x.label),h('strong',null,`${x.a}  ×  ${x.b}`)))));
  }catch(e){mount(compareHost,h('p',null,e.message));}};
  const choices=WNBA_PLAYERS.map(p=>[String(p.id),p.name]);
  const table=h('div',{class:'w-team-analytic-grid'},snapshots.map(t=>h('div',{class:'w-league-brief',style:{'--w-primary':t.colors[0]}},
   h('strong',null,t.name),h('span',null,`Top 5: ${t.overallTop5} OVR estimado`),h('small',null,`${t.size} atletas · G ${t.positionCounts.G} F ${t.positionCounts.F} C ${t.positionCounts.C}`))));
  ranking();drawCompare();
  return h('div',{class:'w-stack'},
   panel('Observatório WNBA','Amostra de elenco 2026, não estatísticas de uma carreira simulada.',
    h('div',{class:'w-toolbar'},field('Buscar',h('input',{type:'search',oninput:e=>{filters.q=e.target.value;ranking();}})),
     field('Franquia',select([['All','Todas'],...teamOptions],filters.team,v=>{filters.team=v;ranking();})),
     field('Posição',select([['All','Todas'],['G','Armadoras'],['F','Alas'],['C','Pivôs']],filters.role,v=>{filters.role=v;ranking();})),
     field('Ranking',select(statLabels,filters.metric,v=>{filters.metric=v;ranking();}))),
    button('Exportar ranking CSV',()=>{
     const rows=searchWnbaPlayers({query:filters.q,teamId:filters.team,position:filters.role,sort:filters.metric,limit:200});
     const csv=wnbaCsv(rows,[{label:'Jogadora',value:p=>p.name},{label:'Franquia',value:p=>WNBA_BY_ID.get(p.teamId).fullName},
     {label:'Posição',value:p=>p.position},{label:'PPG',value:p=>p.stats2026.ppg},{label:'RPG',value:p=>p.stats2026.rpg},{label:'APG',value:p=>p.stats2026.apg},{label:'Overall simulado',value:p=>p.ovr}]);
     const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=h('a',{href:url,download:'wnba-observatorio.csv'});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
    }),output),
   panel('Comparar jogadoras','Comparação direta das médias de referência e atributos fictícios.',
    h('div',{class:'w-toolbar'},field('Jogadora A',select(choices,ida,v=>{ida=v;drawCompare();})),field('Jogadora B',select(choices,idb,v=>{idb=v;drawCompare();}))),compareHost),
   panel('Raio-X das franquias','Força do núcleo e distribuição por função (estimativas do jogo).',table));
 };
 const series=()=>{
  const host=h('div',{class:'w-stack','aria-live':'polite'});
  let a='WIND',b='WLVA',bestOf=3,seed='wnba-series-2026';
  const run=()=>{try{const result=wnbaExhibitionSeries(a,b,{seed,bestOf});
   mount(host,h('div',{class:'w-stack'},h('h3',null,`Campeã avulsa: ${WNBA_BY_ID.get(result.champion)?.fullName}`),
    h('p',null,`${result.victories.join(' × ')} vitórias · Melhor de ${bestOf}`),
    ...result.games.map(g=>h('div',{class:'w-bracket-row'},h('strong',null,`Jogo ${g.number}`),h('span',null,`${g.teams[0].name} ${g.score[0]} : ${g.score[1]} ${g.teams[1].name}`),h('span',null,`${g.ot} OT`)))));
   }catch(e){mount(host,h('p',{class:'w-disclaimer'},e.message));}};
  return panel('Séries WNBA · Modo exibição','Melhor de 3, 5 ou 7 sem calendário, classificação ou Carreira.',
   h('div',{class:'w-toolbar'},field('Equipe A',select(teamOptions,a,v=>a=v)),field('Equipe B',select(teamOptions,b,v=>b=v)),field('Formato',select([['3','Melhor de 3'],['5','Melhor de 5'],['7','Melhor de 7']],bestOf,v=>bestOf=Number(v))),field('Semente',h('input',{value:seed,oninput:e=>seed=e.target.value.slice(0,64)}))),
   button('Disputar série',run,'w-primary'),host,h('p',{class:'w-disclaimer'},warn));
 };
 const festival=()=>{
  const challenge=h('div',{class:'w-stack'}),draftBox=h('div',{class:'w-stack'}),circuitBox=h('div',{class:'w-stack'});
  let seed='wnba-festival',num=4;
  let ids=WNBA_TEAMS.slice(0,num).map(x=>x.id);
  const slots=h('div',{class:'w-cup-slots'});
  const paintSlots=()=>mount(slots,...Array.from({length:num},(_,i)=>field(`Trio ${i+1}`,select(teamOptions,ids[i],v=>ids[i]=v))));
  const runCircuit=()=>{try{const out=wnbaStreetCircuit(ids.slice(0,num),{seed});
    mount(circuitBox,...out.rounds.map((round,i)=>panel(i===out.rounds.length-1?'Final do circuito':`Rodada ${i+1}`,null,...round.map(g=>h('div',{class:'w-bracket-row'},h('span',null,WNBA_BY_ID.get(g.home).name),h('strong',null,g.score.join(' × ')),h('span',null,WNBA_BY_ID.get(g.away).name))))),h('strong',{class:'w-champion'},`Trio campeão: ${WNBA_BY_ID.get(out.champion).fullName}`));
   }catch(e){mount(circuitBox,h('p',{class:'w-disclaimer'},e.message));}};
  const runSkills=()=>mount(challenge,...wnbaSkillsChallenge({seed}).map((x,i)=>h('div',{class:'w-bracket-row'},h('strong',null,`${i+1}º ${x.name}`),h('span',null,x.phases.map(p=>p.time.toFixed(1)).join(' / ')),h('strong',null,`${x.total.toFixed(2)} s`))));
  const runDraft=()=>{const out=wnbaCaptainsDraft({seed});
   mount(draftBox,h('div',{class:'w-fantasy-grid'},...out.rosters.map((roster,i)=>panel(`Equipe ${out.captains[i].name}`,null,...roster.map(p=>h('div',{class:'w-mini-person'},p.name))))));};
  paintSlots();
  return h('div',{class:'w-stack'},
   panel('Festival WNBA · Exibição','Competições experimentais separadas do calendário e da Carreira.',
    field('Semente compartilhada',h('input',{value:seed,oninput:e=>seed=e.target.value.slice(0,64)}))),
   panel('Desafio de habilidades','Tempos simulados com controle, passe, velocidade e finalização. Não são tempos oficiais.',button('Disputar desafio',runSkills,'w-primary'),challenge),
   panel('All-Star: draft de capitãs','Duas capitãs selecionadas pelo Overall estimado, com escolhas em ordem serpentina.',button('Realizar draft',runDraft),draftBox),
   panel('Circuito Street WNBA','Quatro ou oito trios disputam torneio em meia quadra. Sem jogadores repetidos.',
    field('Participantes',select([['4','4 trios'],['8','8 trios']],num,v=>{num=Number(v);ids=WNBA_TEAMS.slice(0,num).map(t=>t.id);paintSlots();})),slots,
    button('Iniciar circuito',runCircuit,'w-primary'),circuitBox));
 };
 const arcadeLeague=()=>{
  const host=h('div',{class:'w-stack','aria-live':'polite'});
  let count=8,seed='wnba-arcade-2026',doubleRound=false,finals=true;
  let ids=WNBA_TEAMS.slice(0,count).map(t=>t.id);
  const slots=h('div',{class:'w-league-slot-grid'});
  const renderPicks=()=>mount(slots,...Array.from({length:count},(_,i)=>field(`Franquia ${i+1}`,select(teamOptions,ids[i],v=>ids[i]=v))));
  const run=()=>{try{
    const out=runWnbaArcadeLeague(ids.slice(0,count),{seed,doubleRound,finals});
    mount(host,panel('Classificação Arcade',`${out.games} jogos de exibição · Critérios: vitórias, saldo e pontos marcados`,
      h('div',{class:'w-scroll-table'},h('table',{class:'w-data'},h('thead',null,h('tr',null,...['#','Franquia','J','V','D','PF','PS','Saldo'].map(x=>h('th',null,x)))),
      h('tbody',null,...out.standings.map((row,i)=>h('tr',null,...[i+1,row.name,row.played,row.wins,row.losses,row.pf,row.pa,(row.diff>0?'+':'')+row.diff].map(x=>h('td',null,String(x)))))))),
      h('p',{class:'w-disclaimer'},'Evento único, gerado em memória. Não cria temporada, contrato, save ou Carreira.')),
      panel(finals?'Chave das finais':'Encerramento da fase classificatória',null,...out.bracket.map((round,i)=>h('div',{class:'w-stack'},h('strong',null,i===0?'Semifinais':'Final'),...round.map(g=>h('div',{class:'w-bracket-row'},h('span',null,WNBA_BY_ID.get(g.home).name),h('strong',null,g.score.join(' : ')),h('span',null,WNBA_BY_ID.get(g.away).name))))),
      h('div',{class:'w-champion'},`${finals?'Campeã':'Líder'} Arcade: ${WNBA_BY_ID.get(out.champion).fullName}`)),
      panel('Resultados da fase classificatória',null,...out.schedule.map((round,i)=>h('details',{class:'w-game-round'},h('summary',null,`Rodada ${i+1} · ${round.length} partidas`),...round.map(g=>h('div',{class:'w-bracket-row'},h('span',null,WNBA_BY_ID.get(g.home).name),h('strong',null,`${g.score[0]} : ${g.score[1]}`),h('span',null,WNBA_BY_ID.get(g.away).name)))))));
  }catch(e){mount(host,h('p',{class:'w-disclaimer'},e.message));}};
  renderPicks();
  return panel('WNBA Liga Arcade · competição instantânea','Todas contra todas + finais opcionais. Evento inteiro sem persistência e sem modo Carreira.',
    h('div',{class:'w-toolbar'},field('Franquias',select([4,6,8,10,15].map(n=>[String(n),`${n} equipes`]),count,v=>{count=Number(v);ids=WNBA_TEAMS.slice(0,count).map(t=>t.id);renderPicks();})),
      field('Fase',select([['single','Turno único'],['double','Ida e volta']],doubleRound?'double':'single',v=>doubleRound=v==='double')),
      field('Finais',select([['yes','Semifinais + Final'],['no','Apenas classificação']],finals?'yes':'no',v=>finals=v==='yes')),
      field('Semente',h('input',{value:seed,maxLength:80,oninput:e=>seed=e.target.value.slice(0,80)}))),slots,
    button('Disputar Liga Arcade',run,'w-primary'),host,h('p',{class:'w-disclaimer'},warn));
 };
 const streetLab=()=>{
  let a='WIND',b='WLVA',size=3,target=11,seed='street-estrategias',games=16;
  const host=h('div',{class:'w-stack','aria-live':'polite'});
  const labels={balanced:'Equilibrada',outside:'Arremesso exterior',drive:'Infiltração',pass:'Passes'};
  const run=()=>{try{const result=compareWnbaStreetTactics(a,b,{size,target,seed,games});
   mount(host,panel('Resultado das estratégias',`Equipe A: ${WNBA_BY_ID.get(a).name}. Equipe B permanece equilibrada. ${games} testes por tática, mesmas sementes.`,
     h('div',{class:'w-tactic-grid'},...result.rows.map(row=>h('div',{class:'w-tactic-card'},h('strong',null,labels[row.tactic]),
       h('div',{class:'w-tactic-meter'},h('span',{style:{width:`${Math.round(row.winRate*100)}%`}})),
       h('strong',null,`${Math.round(row.winRate*100)}% de vitórias`),h('small',null,`${row.wins}V / ${row.losses}D · ${row.completed} encerradas`),
       h('small',null,`${row.avgFor} × ${row.avgAgainst} pontos · ${row.avgPossessions} posses`)))),
     h('p',null,`Melhor estratégia nesta amostra: ${labels[result.best]}. Isso não garante vitórias futuras.`),
     h('p',{class:'w-disclaimer'},'Análise por Monte Carlo do motor Street. Não é estatística oficial, nem resultado persistido.')));
  }catch(e){mount(host,h('p',{class:'w-disclaimer'},e.message));}};
  return panel('Laboratório de táticas Street','Teste decisões reais no motor de posses com sementes repetíveis e veja os efeitos antes de jogar.',
    h('div',{class:'w-toolbar'},field('Equipe A · testada',select(teamOptions,a,v=>a=v)),field('Equipe B · padrão',select(teamOptions,b,v=>b=v)),
      field('Formato',select([[1,'1x1'],[2,'2x2'],[3,'3x3']],size,v=>size=Number(v))),
      field('Meta',select([[11,'11 pontos'],[21,'21 pontos']],target,v=>target=Number(v))),
      field('Amostra',select([[8,'8 jogos por tática'],[16,'16 jogos por tática'],[32,'32 jogos por tática'],[64,'64 jogos por tática']],games,v=>games=Number(v))),
      field('Semente',h('input',{value:seed,maxLength:80,oninput:e=>seed=e.target.value.slice(0,80)}))),
    button('Comparar quatro estratégias',run,'w-primary'),host,h('p',{class:'w-disclaimer'},warn));
 };
 const photos=()=>{
  const host=h('div',{class:'w-people-grid'}),notice=h('p',{class:'w-disclaimer'}),total=WNBA_PLAYERS.length,verified=WNBA_PLAYERS.filter(p=>p.wnbaId).length;
  let filter='missing',query='';
  const paint=()=>{
   const q=query.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
   const players=WNBA_PLAYERS.filter(p=>(filter==='all'||(filter==='verified'?!!p.wnbaId:!p.wnbaId))&&p.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q));
   notice.textContent=`${verified} fotos com ID oficial mapeado · ${total-verified} retratos neutros · ${players.length} perfis neste filtro. Imagens exigem conexão à CDN.`;
   mount(host,...players.map(p=>h('div',{class:'w-photo-audit'},avatar(p),h('div',null,h('strong',null,p.name),h('small',null,p.wnbaId?'Retrato oficial identificado':'Foto ainda sem identificação verificada'),h('a',{href:WNBA_BY_ID.get(p.teamId).rosterSource,target:'_blank',rel:'noopener noreferrer'},'Conferir elenco oficial ↗')))));
  };
  paint();
  return panel('Auditoria de fotos WNBA','Sem atribuição de fotos a outra jogadora. Imagens externas dependem de rede e dos direitos de uso.',
   h('div',{class:'w-toolbar'},field('Status',select([['missing','Sem foto mapeada'],['verified','Com foto oficial mapeada'],['all','Todas']],filter,v=>{filter=v;paint();})),
   field('Buscar',h('input',{type:'search',oninput:e=>{query=e.target.value;paint();}}))),notice,host);
 };
 const creator=()=>{
  let data=readWnbaCreator(typeof localStorage!=='undefined'?localStorage:null);
  const note=h('p',{class:'w-disclaimer',role:'status','aria-live':'polite'});
  const host=h('div',{class:'w-stack'});
  const list=h('div',{class:'w-fantasy-grid'});
  const editor=h('div',{class:'w-stack'});
  let editing=null;
  let name='Nova Atleta',role='G',side=0,age=23,skills=Object.fromEntries(CREATOR_SKILLS.map(k=>[k,70]));
  const labels={shooting:'Arremesso',handling:'Drible',passing:'Passe',rebounding:'Rebote',defense:'Defesa',speed:'Velocidade'};
  const save=d=>{try{data=validateWnbaCreator(d);writeWnbaCreator(localStorage,data);note.textContent='Criações salvas apenas no espaço WNBA Arcade.';refresh();}catch(e){note.textContent=e.message;}};
  const make=()=>{try{save(createWnbaPlayer(data,{name,role,side,age,skills}));editing=null;}catch(e){note.textContent=e.message;}};
  const remove=id=>{if(!window.confirm('Excluir esta jogadora fictícia?'))return;try{save(removeWnbaCreatedPlayer(data,id));}catch(e){note.textContent=e.message;}};
  const update=(id,changes)=>{try{save(updateWnbaCreatedPlayer(data,id,changes));}catch(e){note.textContent=e.message;}};
  const paintEditor=()=>{
    const record=data.players.find(p=>p.id===editing);if(!record){mount(editor);return;}
    const inputs=CREATOR_SKILLS.map(k=>field(labels[k],h('input',{type:'range',min:25,max:99,step:1,value:record.skills[k],'aria-label':`${labels[k]} de ${record.name}`,onchange:e=>update(record.id,{skills:{[k]:Number(e.target.value)}})})));
    mount(editor,panel(`Editar ${record.name}`,'Notas são atributos fictícios para o motor Arcade.',h('div',{class:'w-creator-skills'},...inputs),button('Fechar editor',()=>{editing=null;paintEditor();})));
  };
  const refresh=()=>{
    mount(list,...data.teams.map((t,s)=>panel(t.name,`${data.players.filter(p=>p.side===s).length}/15 criadas`,
      field('Nome do time',h('input',{value:t.name,maxLength:42,onchange:e=>{try{save(renameWnbaCreatorTeam(data,s,{name:e.target.value}));}catch(error){note.textContent=error.message;}}})),
      field('Cor da equipe',h('input',{type:'color',value:t.colors[0],onchange:e=>{try{save(renameWnbaCreatorTeam(data,s,{primary:e.target.value}));}catch(error){note.textContent=error.message;}}})),
      ...data.players.filter(p=>p.side===s).map(p=>h('div',{class:'w-created-person'},
        h('div',null,h('strong',null,p.name),h('small',null,`Atleta fictícia · ${p.role} · ${p.age} anos · ${p.id}`)),
        h('div',{class:'w-panel-actions'},button('Atributos',()=>{editing=p.id;paintEditor();}),button('Transferir',()=>update(p.id,{side:1-s})),button('Excluir',()=>remove(p.id))))))));
    paintEditor();
  };
  const fast=()=>{try{const specs=wnbaCreatorTeams(data),game=simulateWnbaCustom(specs,{seed:'creator-'+specs[0].roster.map(p=>p.id).join(':')});
    mount(host,panel('Amistoso entre atletas fictícias','4 períodos de 10 minutos · estatísticas simuladas',
      h('div',{class:'w-bracket-row'},h('strong',null,specs[0].name),h('strong',null,`${game.score[0]} × ${game.score[1]}`),h('strong',null,specs[1].name)),
      ...game.box.map((box,i)=>h('div',{class:'w-mini-list'},h('h4',null,specs[i].name),...box.slice(0,6).map(p=>h('div',{class:'w-bracket-row'},h('span',null,p.name),h('strong',null,`${p.pts} PTS`))))),h('p',{class:'w-disclaimer'},warn)));
    }catch(e){note.textContent=e.message;}};
  const live=()=>{try{const specs=wnbaCreatorTeams(data),sim=new MatchSim(specs,{seed:'creator-wnba-2d',quarterSeconds:600,recordReplay:true});
      release();const holder=h('div',{class:'w-live-host'});mount(content,h('div',{class:'w-2d-label'},button('← Voltar ao Criador',()=>{release();show();}),h('strong',null,'Amistoso fictício 2D'),h('span',null,warn)),holder);
      cleanup=renderLive(holder,sim,specs,{control:null,mode:'quick',isolated:true,presentationTitle:'WNBA · Partida',onArcadeFinish:()=>{},onNew:()=>{release();show();},onRestart:()=>{release();live();}});
    }catch(e){note.textContent=e.message;}};
  const streetCustom=()=>{try{const specs=wnbaCreatorTeams(data).map(t=>({...t,roster:t.roster.slice(0,3)}));
      const game=simulateStreet(newStreetGame(specs,{seed:'creator-street',squadSize:3,target:11}));
      mount(host,panel('Street 3x3 · Atletas criadas','Partida independente; nunca modifica os históricos oficiais.',
        h('div',{class:'w-bracket-row'},h('strong',null,specs[0].name),h('strong',null,game.score.join(' × ')),h('strong',null,specs[1].name)),
        ...game.events.slice(0,8).map(e=>h('p',null,e.text))));
    }catch(e){note.textContent=e.message;}};
  const demo=()=>{if(data.players.length&&!window.confirm('Substituir criações atuais por 10 atletas fictícias de exemplo?'))return;
    let draft=defaultWnbaCreator();for(let i=0;i<10;i++)draft=createWnbaPlayer(draft,{name:`Atleta Fictícia ${i+1}`,role:['G','F','C'][i%3],side:i%2,age:19+i,skills:Object.fromEntries(CREATOR_SKILLS.map((k,j)=>[k,52+((i*7+j*11)%37)]))});save(draft);};
  const importFile=h('input',{type:'file',accept:'.json,application/json','aria-label':'Importar atletas fictícias',onchange:async e=>{
    try{const file=e.target.files?.[0];if(!file)return;if(file.size>160000)throw Error('JSON maior que 160 KB.');save(importWnbaCreator(await file.text()));}
    catch(error){note.textContent=error.message;}e.target.value='';}});
  const download=()=>{try{const url=URL.createObjectURL(new Blob([exportWnbaCreator(data)],{type:'application/json'}));const a=h('a',{href:url,download:'wnba-atletas-criadas.json'});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}catch(error){note.textContent=error.message;}};
  const skillsInput=h('div',{class:'w-creator-skills'},...CREATOR_SKILLS.map(k=>field(labels[k],h('input',{type:'number',min:25,max:99,value:70,'aria-label':labels[k],onchange:e=>skills[k]=Number(e.target.value)}))));
  refresh();
  return h('div',{class:'w-stack'},panel('Criador de Jogadoras WNBA','Atletas inteiramente fictícias, sem fotos de jogadoras reais, sem Carreira e em armazenamento próprio.',
    h('div',{class:'w-toolbar'},field('Nome',h('input',{value:name,maxLength:42,oninput:e=>name=e.target.value})),field('Posição',select([['G','Armadora'],['F','Ala'],['C','Pivô']],role,v=>role=v)),field('Equipe',select([['0','Equipe A'],['1','Equipe B']],side,v=>side=Number(v))),field('Idade',h('input',{type:'number',min:16,max:49,value:23,onchange:e=>age=Number(e.target.value)}))),skillsInput,
    h('div',{class:'w-panel-actions'},button('Criar jogadora',make,'w-primary'),button('Gerar 10 fictícias de exemplo',demo),button('Exportar JSON',download),field('Importar JSON',importFile))),
    note,list,editor,panel('Disputar partidas com suas criações','Necessário ter pelo menos cinco atletas em cada equipe.',
      h('div',{class:'w-panel-actions'},button('Simular amistoso',fast,'w-primary'),button('Jogar / assistir 2D',live),button('Street 3x3',streetCustom)),host,h('p',{class:'w-disclaimer'},warn)));
 };
 const academy=()=>{
   let seed='wnba-skill-lab',rounds=3,group='official';const host=h('div',{class:'w-stack','aria-live':'polite'});
   const run=()=>{try{
     const created=readWnbaCreator(localStorage);const custom=created.players.map(p=>creatorPlayerProfile(p,created.teams[p.side]));
     const athletes=group==='created'?custom:group==='mixed'?[...WNBA_PLAYERS.slice(0,8),...custom].slice(0,30):[...WNBA_PLAYERS].sort((a,b)=>b.ovr-a.ovr).slice(0,12);
     const results=runWnbaSkillAcademy(athletes,{seed,rounds});
     mount(host,panel('Resultado da Academia','Treinos determinísticos de precisão por atributo; sem progresso de Carreira.',
       h('p',{class:'w-disclaimer'},`Vencedora: ${results.leaderboard[0].name} · ${results.leaderboard[0].score}/${results.leaderboard[0].possible}`),
       ...results.leaderboard.map((entry,i)=>h('div',{class:'w-bracket-row'},h('strong',null,`${i+1}º · ${entry.name}`),h('span',null,entry.drills.map(d=>`${d.drill}: ${d.made}`).join(' · ')),h('strong',null,`${entry.score}/${entry.possible}`)))));
   }catch(e){mount(host,h('p',{class:'w-disclaimer'},e.message));}};
   return panel('Academia WNBA','Quatro desafios de fundamentos e placar reproduzível. Não concede evolução aos atributos.',
     h('div',{class:'w-toolbar'},field('Participantes',select([['official','Destaques oficiais (atributos estimados)'],['created','Jogadoras criadas'],['mixed','Destaques + criadas']],group,v=>group=v)),field('Rodadas',select([['1','1'],['3','3'],['5','5'],['10','10']],rounds,v=>rounds=Number(v))),field('Semente',h('input',{value:seed,oninput:e=>seed=e.target.value.slice(0,80)}))),
     button('Iniciar desafios',run,'w-primary'),host,h('p',{class:'w-disclaimer'},warn));
 };
 const duels=()=>{
  let number=8,seed='duelo-de-estrelas',target=11,source='official';const host=h('div',{class:'w-stack','aria-live':'polite'});
  const run=()=>{try{
    const data=readWnbaCreator(localStorage);
    const created=data.players.map(p=>creatorPlayerProfile(p,data.teams[p.side]));
    const pool=source==='created'?created:source==='mixed'?[...created,...WNBA_PLAYERS]:WNBA_PLAYERS;
    const entrants=[...pool].sort((a,b)=>b.ovr-a.ovr||a.name.localeCompare(b.name)).slice(0,number);
    const bracket=runWnbaDuelTournament(entrants,{seed,target});
    mount(host,panel('Campeonato individual · resultados','Eliminatória com partidas reais do motor Street 1x1.',
      h('div',{class:'w-champion'},`Campeã: ${bracket.championName}`),
      ...bracket.rounds.map((games,i)=>panel(i===bracket.rounds.length-1?'FINAL':`RODADA ${i+1}`,null,
        ...games.map(g=>h('div',{class:'w-bracket-row'},h('strong',null,g.nameA),h('span',null,`${g.score[0]} × ${g.score[1]}`),h('strong',null,g.nameB)))))));
  }catch(e){mount(host,h('p',{class:'w-disclaimer'},e.message));}};
  return panel('Duelo de Estrelas WNBA · Street 1x1','Torneio eliminatório de oito ou dezesseis atletas. Não modifica rosters ou resultados oficiais.',
    h('div',{class:'w-toolbar'},field('Chave',select([['8','8 atletas'],['16','16 atletas']],number,v=>number=Number(v))),
      field('Participantes',select([['official','WNBA (atributos estimados)'],['created','Atletas fictícias'],['mixed','Misturar equipes']],source,v=>source=v)),
      field('Meta',select([['11','11 pontos'],['21','21 pontos']],target,v=>target=Number(v))),
      field('Semente',h('input',{value:seed,oninput:e=>seed=e.target.value.slice(0,80)}))),
    button('Disputar duelos',run,'w-primary'),host,h('p',{class:'w-disclaimer'},warn));
 };
 const hub=()=>h('div',{class:'w-hub-grid'},
  ...tabs.filter(([id])=>id!=='hub').map(([id,label],i)=>h('a',{
   class:'w-hub-tile',href:`#/wnba/${id}`,style:{'--w-idx':i}
  },
   h('span',null,`${String(i+1).padStart(2,'0')} · WNBA 2026`),
   h('h2',null,label),
   h('p',null,({teams:'15 franquias e identidades',players:'182 atletas, fotos e atributos',play:'Amistoso e jogo tático 2D',street:'1x1, 2x2, 3x3 em meia quadra','street-2d':'Quadra animada e marcação real do motor Street 2D',creator:'Criar atletas fictícias e jogar amistosos',academy:'Desafios de fundamentos e pontuação',duels:'Chave individual Street 1x1 de 8 ou 16',three:'Torneio de arremesso de 3 pontos',allstar:'Estrelas do Leste e Oeste',cup:'Eliminatórias independentes',studio:'Fantasy rosters e JSON',lab:'Scouting e comparação',series:'Melhor de 3, 5 ou 7',festival:'Habilidades, capitãs e Street','arcade-league':'Fase regular e finais instantâneas','street-lab':'Teste quatro táticas em partidas reais',photos:'Auditoria de retratos e fontes'})[id]),
   h('strong',null,'EXPLORAR ↗')
  ))
 );
 function show(){mount(content,active==='teams'?teams():active==='players'?players():active==='play'?play():active==='street'?street():active==='street-2d'?spatialStreet():active==='allstar'?allstar():active==='three'?threes():active==='cup'?cup():active==='studio'?studio():active==='lab'?lab():active==='series'?series():active==='festival'?festival():active==='arcade-league'?arcadeLeague():active==='street-lab'?streetLab():active==='photos'?photos():active==='creator'?creator():active==='academy'?academy():active==='duels'?duels():hub());}
 mount(root,
  h('header',{class:'w-hero'},h('span',{class:'w-eyebrow'},'EVOLUTION 2001+ · LABORATÓRIO ARCADE'),h('h1',null,'A liga ganha uma ',h('em',null,'nova dimensão.')),
   h('p',null,'15 franquias, elencos de referência de 2026, editor fantasy, observatório e competições sem Carreira.'),
   h('div',{class:'w-hero-metrics'},...[[WNBA_TEAMS.length,'FRANQUIAS'],[WNBA_PLAYERS.length,'JOGADORAS'],[Object.keys(WNBA_PHOTO_IDS).length,'RETRATOS MAPEADOS'],['0','ALTERAÇÕES NA CARREIRA']].map(([v,l])=>h('div',null,h('strong',null,v),h('span',null,l))))),
  h('nav',{class:'w-nav','aria-label':'WNBA: modos independentes'},tabs.map(([id,label])=>h('a',{class:[active===id&&'active'],href:`#/wnba/${id}`},label))),
  content,modal,h('footer',{class:'w-footer'},`Base de elencos WNBA 2026 · referência ${WNBA_SNAPSHOT} · Sem modo Carreira · Fotos oficiais quando identificadas · Atributos fictícios do simulador`));
 show();return root;
}
