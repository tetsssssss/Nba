// NBA Universe Manager · competições FIBA avulsas
// Nenhuma importação de dados/saves da Carreira NBA.
import { h, mount } from '../dom.js';
import { MatchSim } from '../../match/sim.js';
import { renderLive } from './match-live.js';
import { INT_TEAMS, INT_PLAYERS, INT_TEAM_MAP, LEAGUE_INFO, leagueTeams, playableTeams, rosterOf, teamSpec } from '../../international/catalog.js';
import { simulateInternational, knockout, euroBasketTournament } from '../../international/engine.js';
import { photoKey, photoRecord, photoStats, photoSearchUrl, readCustomPhotos, writeCustomPhotos, importPhotoOverrides, exportPhotoOverrides, validateImageUrl } from '../../international/photos.js';

const ROUTES={nbb:'NBB',euroleague:'EUROLEAGUE',eurobasket:'EUROBASKET'};
const LABEL={NBB:'NBB',EUROLEAGUE:'EuroLeague',EUROBASKET:'EuroBasket'};
const tabs=[['home','Visão geral'],['teams','Equipes'],['players','Atletas'],['play','Jogo rápido / 2D'],['cup','Torneios'],['photos','Fotos']];
const btn=(text,fn,extra='')=>h('button',{type:'button',class:`int-btn ${extra}`,onclick:fn},text);
const field=(title,node)=>h('label',{class:'int-field'},h('span',null,title),node);
const sel=(options,value,change)=>h('select',{onchange:e=>change(e.target.value)},options.map(([key,label])=>h('option',{value:key,selected:key===value},label)));
const section=(title,sub,...children)=>h('section',{class:'int-panel'},h('div',{class:'int-panel-head'},h('h2',null,title),sub?h('p',null,sub):null),...children);
const meter=(name,value)=>h('div',{class:'int-meter-row'},h('span',null,name),h('div',{class:'int-meter-track'},h('div',{class:'int-meter-fill',style:{width:`${value}%`}})),h('strong',null,value));
const msg='Modos avulsos de exibição. Não modificam elencos, resultados ou saves da Carreira NBA.';
const stats=p=>[['Overall',p.ovr],['3 pontos',p.attributes.threePoint],['Passe',p.attributes.passing],['Defesa',p.attributes.perimeterDefense],['Rebote',p.attributes.defensiveRebounding],['Velocidade',p.attributes.speed]];
function badge(team){return h('div',{class:'int-team-badge',style:{'--int-color':team.colors[0]}},team.shortId);}
function portrait(p){const wrap=h('span',{class:'int-portrait','aria-label':`Retrato de ${p.name}`});const imageInfo=photoRecord(p);if(imageInfo.url){const image=h('img',{src:imageInfo.url,alt:p.name,loading:'lazy',referrerPolicy:'no-referrer',onerror:()=>{mount(wrap,h('span',{class:'int-photo-fallback'},p.name.split(' ').map(w=>w[0]).slice(0,2).join('')));}});wrap.append(image);}else wrap.append(h('span',{class:'int-photo-fallback'},p.name.split(' ').map(w=>w[0]).slice(0,2).join('')));return wrap;}
export function internationalView({league='nbb'}={}){
 const key=ROUTES[String(league).toLowerCase()]??'NBB',meta=LEAGUE_INFO[key],teams=leagueTeams(key),playables=playableTeams(key),players=INT_PLAYERS.filter(p=>p.league===key);
 const root=h('div',{class:'page int-page',style:{'--int-accent':meta.accent}}),view=h('div',{class:'int-content'}),notice=h('p',{class:'int-notice'},msg);
 let active='home',cleanup=null,selectedPlayer=null;
 const state={a:playables[0]?.id,b:playables[1]?.id,seed:`${key.toLowerCase()}-2025`,control:'-1',search:'',teamFilter:'all',count:8};
 function release(){cleanup?.();cleanup=null;}
 window.addEventListener('hashchange',release,{once:true});
 function goto(tab){release();active=tab;paint();}
 function makeProfile(p){return section('Ficha de atleta',`Fonte nominal: ${INT_TEAM_MAP.get(p.teamId).name} · ${meta.snapshot}`,
  h('div',{class:'int-profile-top'},portrait(p),h('div',null,h('h3',null,p.name),h('p',null,`${INT_TEAM_MAP.get(p.teamId).name} · ${p.positions.join('/')} · ${p.ovr} OVR (estimado)`),
  h('p',{class:'int-muted'},photoRecord(p).url?`Origem da foto: ${photoRecord(p).credit}.`:'Foto individual pendente de confirmação. Use a aba Fotos para cadastrar um retrato verdadeiro.'),h('a',{href:INT_TEAM_MAP.get(p.teamId).source,target:'_blank',rel:'noopener noreferrer'},'Conferir fonte do elenco ↗'),photoRecord(p).sourceUrl?h('a',{href:photoRecord(p).sourceUrl,target:'_blank',rel:'noopener noreferrer'},'Fonte da fotografia ↗'):null)),
  h('div',{class:'int-rating-grid'},stats(p).map(([name,value])=>meter(name,value))),
  h('p',{class:'int-muted'},'Todos os atributos desta ficha são estimativas do simulador, não ratings oficiais. A posição é uma aproximação de gameplay quando não confirmada na fonte.'),
  btn('Voltar aos jogadores',()=>{selectedPlayer=null;paint();}));}
 function teamCard(t){const n=rosterOf(t.id).length;return h('button',{class:'int-team-card',type:'button',style:{'--int-color':t.colors[0]},onclick:()=>{state.teamFilter=t.id;active='teams';paint();}},badge(t),h('div',null,h('strong',null,t.name),h('small',null,`${key==='EUROBASKET'?'Grupo '+t.group:t.region||meta.snapshot} · ${n} nomes registrados`)),h('span',{class:n>=5?'int-ready':'int-wait'},n>=5?'JOGÁVEL':'ELENCO PENDENTE'));}
 function playerCard(p){return h('button',{class:'int-player',type:'button',onclick:()=>{selectedPlayer=p;paint();}},portrait(p),h('span',null,h('strong',null,p.name),h('small',null,`${INT_TEAM_MAP.get(p.teamId)?.name} · ${p.positions[0]}`)),h('strong',{class:'int-ovr'},p.ovr));}
 function home(){return h('div',{class:'int-stack'},section(`${meta.name} · ${meta.snapshot}`,`${meta.competition} · quadra FIBA: 4 períodos de 10 minutos`,
  h('div',{class:'int-metrics'},...[[`${teams.length}`,'Equipes'],[`${playables.length}`,'Prontas para jogar'],[`${players.length}`,'Atletas reais'],[`${players.filter(p=>p.photoUrl).length}`,'Retratos com ID NBA']].map(([value,label])=>h('div',{class:'int-kpi'},h('strong',null,value),h('span',null,label)))),
  h('div',{class:'int-actions'},btn('Disputar amistoso',()=>goto('play'),'primary'),btn(key==='EUROBASKET'?'Simular EuroBasket completo':'Disputar copa',()=>goto('cup'))),
  h('p',{class:'int-muted'},`Fonte dos participantes: ${meta.name}. As temporadas são uma fotografia histórica de ${meta.snapshot}; não representam elencos atualizados ao vivo.`)),
  section('Destaques dos elencos','Escolha uma equipe para visualizar os atletas registrados.',h('div',{class:'int-team-grid'},...teams.slice(0,12).map(teamCard)),
  h('div',{class:'int-actions'},btn('Todas as equipes',()=>goto('teams')),btn('Pesquisar atletas',()=>goto('players')))),
  section('Fotos com procedência',`Retratos oficiais NBA e fotografias identificadas por pesquisa. A aba Fotos permite localizar e cadastrar as imagens que faltam.`,
  h('div',{class:'int-players-grid'},...players.filter(p=>photoRecord(p).url).slice(0,10).map(playerCard))));}
 function teamScreen(){const results=state.teamFilter==='all'?teams:teams.filter(t=>t.id===state.teamFilter);
  return h('div',{class:'int-stack'},section('Franquias e seleções',`${teams.length} participantes reais · ${playables.length} têm 5 ou mais atletas registrados`,
   h('div',{class:'int-toolbar'},field('Equipe',sel([['all','Todas'],...teams.map(t=>[t.id,t.name])],state.teamFilter,v=>{state.teamFilter=v;paint();}))),
   h('div',{class:'int-team-grid'},...results.map(teamCard))),
   ...(state.teamFilter!=='all'?results.map(t=>section(`Elenco · ${t.name}`,`${rosterOf(t.id).length} jogadores listados nas fontes · ${rosterOf(t.id).length>=5?'Disponível para amistosos':'Aguardando validação de elenco'}`,
   h('div',{class:'int-players-grid'},...rosterOf(t.id).map(playerCard)),h('a',{href:t.source,target:'_blank',rel:'noopener noreferrer'},'Fonte nominal do elenco ↗'))):[]));
 }
 function playersScreen(){const results=players.filter(p=>(state.teamFilter==='all'||p.teamId===state.teamFilter)&&p.name.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(state.search.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,''))).sort((a,b)=>b.ovr-a.ovr);
  return section('Explorador de atletas',`${results.length} atletas encontrados · foto quando vinculada a ID verdadeiro`,
   h('div',{class:'int-toolbar'},field('Buscar nome',h('input',{type:'search',value:state.search,placeholder:'Pesquisar atleta...',oninput:e=>{state.search=e.target.value;paint();}})),
    field('Franquia / seleção',sel([['all','Todas'],...teams.map(t=>[t.id,t.name])],state.teamFilter,v=>{state.teamFilter=v;paint();}))),
   h('div',{class:'int-players-grid'},...results.slice(0,150).map(playerCard)),results.length>150?h('p',null,'Exibindo 150 resultados. Refine a busca para ver outros atletas.'):null);
 }
 function scoreboard(result){
  const boxNodes=result.box.map((list,i)=>{
   const heading=h('h3',null,result.teams[i].name);
   const head=h('thead',null,h('tr',null,...['Atleta','PTS','REB','AST'].map(x=>h('th',null,x))));
   const rows=list.map(x=>h('tr',null,h('td',null,x.name),h('td',null,x.pts),h('td',null,x.orb+x.drb),h('td',null,x.ast)));
   return h('div',null,heading,h('table',null,head,h('tbody',null,...rows)));
  });
  return section('Resultado · jogo de exibição',`${meta.short} · resultado não gravado`,
   h('div',{class:'int-final'},h('strong',null,result.teams[0].name),h('span',{class:'int-score'},`${result.score[0]} : ${result.score[1]}`),h('strong',null,result.teams[1].name)),
   h('div',{class:'int-quarter-grid'},...result.quarters[0].map((n,i)=>h('div',null,h('small',null,i<4?`Q${i+1}`:`OT${i-3}`),h('strong',null,`${n}–${result.quarters[1][i]}`)))),
   h('div',{class:'int-boxes'},...boxNodes),h('p',{class:'int-muted'},msg));
 }
 function play(){const host=h('div',{class:'int-result','aria-live':'polite'});
  const choose=()=>h('div',{class:'int-toolbar'},
   field('Mandante',sel(playables.map(t=>[t.id,t.name]),state.a,v=>state.a=v)),
   field('Visitante',sel(playables.map(t=>[t.id,t.name]),state.b,v=>state.b=v)),
   field('Semente da simulação',h('input',{value:state.seed,onchange:e=>state.seed=e.target.value.slice(0,64)})),
   field('Controle no 2D',sel([['-1','Espectador'],['0','Mandante'],['1','Visitante']],state.control,v=>state.control=v)));
  const quick=()=>{try{mount(host,scoreboard(simulateInternational(state.a,state.b,{seed:state.seed})));}catch(error){mount(host,h('p',{class:'int-error'},error.message));}};
  const live=()=>{try{
   if(state.a===state.b)throw Error('Selecione equipes diferentes.');
   const ids=[state.a,state.b],specs=ids.map((id,i)=>({...teamSpec(id),aiCoach:state.control!==String(i)}));
   const sim=new MatchSim(specs,{seed:state.seed,quarterSeconds:600,recordReplay:true});
   release();const liveHost=h('div',{class:'int-live-host'});
   mount(view,h('div',{class:'int-game-bar'},btn('← Voltar ao jogo rápido',()=>{release();goto('play');}),h('strong',null,`${meta.name} · 4×10 minutos · Jogo 2D`)),liveHost,h('p',{class:'int-muted'},msg));
   cleanup=renderLive(liveHost,sim,specs,{control:state.control==='-1'?null:Number(state.control),mode:'quick',isolated:true,onArcadeFinish:()=>{},onNew:()=>{release();goto('play');},onRestart:()=>{release();live();}});
  }catch(error){mount(host,h('p',{class:'int-error'},error.message));}};
  return section('Partidas avulsas','Jogue ou assista no Canvas 2D. Motor rápido FIBA com box score completo.',choose(),h('div',{class:'int-actions'},btn('Simular jogo rápido',quick,'primary'),btn('Jogar ou assistir em 2D',live)),host,h('p',{class:'int-muted'},msg));
 }
 function cups(){
  const host=h('div',{class:'int-result','aria-live':'polite'});
  const selection=new Set(playables.slice(0,8).map(t=>t.id));
  const check=h('div',{class:'int-team-grid'},...playables.map(t=>h('label',{class:'int-check-team'},
   h('input',{type:'checkbox',checked:selection.has(t.id),onchange:e=>{if(e.target.checked)selection.add(t.id);else selection.delete(t.id);}}),badge(t),t.name)));
  function present(rounds){
   return h('div',{class:'int-bracket'},...rounds.map((round,i)=>{
    const games=round.map(g=>h('div',{class:'int-round-game'},h('span',null,g.teams[0].name),h('strong',null,g.score.join(' – ')),h('span',null,g.teams[1].name)));
    return section(`Rodada ${i+1}`,null,h('div',{class:'int-round'},...games));
   }));
  }
  function runCup(){
   try{
    const ids=[...selection];if(![4,8,16].includes(ids.length))throw Error('Selecione exatamente 4, 8 ou 16 equipes.');
    const cup=knockout(ids,{seed:state.seed});
    mount(host,section('CAMPEÃO',`Copa avulsa de ${ids.length} equipes`,h('strong',{class:'int-champion'},INT_TEAM_MAP.get(cup.champion).name)),present(cup.rounds));
   }catch(e){mount(host,h('p',{class:'int-error'},e.message));}
  }
  function runEuro(){
   try{
    const cup=euroBasketTournament({seed:state.seed});
    const groupNodes=Object.entries(cup.groups).map(([group,data])=>{
     const places=data.standings.map((s,i)=>h('li',null,`${INT_TEAM_MAP.get(s.id).name} · ${s.wins}-${s.losses} · saldo ${s.diff>=0?'+':''}${s.diff}${i<4?' · classificado':''}`));
     return section(`Grupo ${group}`,null,h('ol',null,...places));
    });
    mount(host,section('EuroBasket completo · edição alternativa','24 países · 4 grupos de 6 · oitavas até a final',h('strong',{class:'int-champion'},`CAMPEÃO: ${INT_TEAM_MAP.get(cup.champion).name}`)),h('div',{class:'int-groups'},...groupNodes),present(cup.rounds));
   }catch(e){mount(host,h('p',{class:'int-error'},e.message));}
  }
  const full=key==='EUROBASKET'?section('Campeonato completo','Chaves oficiais de 2025, resultados alternativos simulados e sem efeito no histórico real.',
    h('div',{class:'int-actions'},btn('Simular fase de grupos + mata-mata',runEuro,'primary'))):null;
  return h('div',{class:'int-stack'},full,section('Copa personalizada','Selecione exatamente 4, 8 ou 16 equipes com elencos verificados.',
   check,h('div',{class:'int-actions'},btn('Disputar copa',runCup,'primary')),h('p',{class:'int-muted'},msg)),host);
 }
 function photoScreen(){
  const overrides=readCustomPhotos(),coverage=photoStats(players,overrides),host=h('div',{class:'int-stack'});
  const status=h('p',{class:'int-muted'},`${coverage.total-coverage.pending}/${coverage.total} retratos mapeados (${coverage.curated} pesquisados, ${coverage['nba-headshot']} NBA e ${coverage.custom} personalizados). Ainda faltam ${coverage.pending}. A URL precisa apontar diretamente para a imagem. Links de resultado do Google não funcionam como retrato.`);
  const query=h('input',{type:'search',placeholder:'Pesquisar atleta para revisar foto...',value:state.photoQuery||''});
  const filter=sel([['missing','Sem foto'],['all','Todos'],['mapped','Com foto']],state.photoFilter||'missing',v=>{state.photoFilter=v;paint();});
  const list=h('div',{class:'int-photo-list'});
  const allKeys=new Set(INT_PLAYERS.map(photoKey));
  const show=()=>{
   state.photoQuery=query.value||'';const q=state.photoQuery.toLocaleLowerCase('pt-BR');
   const matching=players.filter(p=>p.name.toLocaleLowerCase('pt-BR').includes(q)&&(filter.value==='all'||(filter.value==='missing'?!photoRecord(p).url:!!photoRecord(p).url)));
   mount(list,...matching.slice(0,70).map(p=>{
    const current=photoRecord(p),input=h('input',{type:'url',placeholder:'https://site.com/foto-do-jogador.jpg',value:overrides[photoKey(p)]||''});
    const message=h('span',{class:'int-photo-status'},current.source==='pending'?'Pendente':current.source==='custom'?'Personalizada':current.source==='curated'?'Fonte identificada':'NBA');
    const apply=()=>{
     const url=validateImageUrl(input.value);
     if(!url){message.textContent='Insira URL HTTPS válida';return;}
     try{overrides[photoKey(p)]=url;writeCustomPhotos(overrides);paint();}catch{message.textContent='Não foi possível salvar no navegador';}
    };
    const remove=()=>{delete overrides[photoKey(p)];try{writeCustomPhotos(overrides);paint();}catch{message.textContent='Erro no armazenamento';}};
    const image=portrait(p);
    return h('article',{class:'int-photo-review'},image,h('div',{class:'int-photo-description'},h('strong',null,p.name),h('small',null,`${INT_TEAM_MAP.get(p.teamId)?.name} · ${p.league}`),message),
      h('a',{class:'int-photo-google',href:photoSearchUrl({...p,teamName:INT_TEAM_MAP.get(p.teamId)?.name}),target:'_blank',rel:'noopener noreferrer'},'Google Imagens ↗'),
      h('div',{class:'int-photo-edit'},input,btn('Aplicar foto',apply),...(overrides[photoKey(p)]?[btn('Remover',remove)]:[])));
   }),matching.length>70?h('p',{class:'int-muted'},`Mostrando 70 dos ${matching.length} atletas. Refine a busca.`):null);
  };
  query.addEventListener('input',show);filter.addEventListener('change',show);
  const io=h('textarea',{class:'int-photo-json',rows:5,placeholder:'Cole aqui o JSON exportado do seu catálogo.'});
  const ioNotice=h('span',{class:'int-muted'},'As fotos personalizadas ficam apenas neste navegador, fora dos saves da Carreira.');
  const exportIt=()=>{io.value=exportPhotoOverrides(readCustomPhotos());ioNotice.textContent='JSON de fotos gerado. Copie e guarde para importar em outro computador.';};
  const importIt=()=>{try{const data=importPhotoOverrides(io.value,allKeys);writeCustomPhotos({...readCustomPhotos(),...data});paint();}catch(e){ioNotice.textContent=e.message;}};
  host.append(section('Central de fotografias',`NBB / EuroLeague · ${players.length} atletas cadastrados`,status,
   h('p',{class:'int-muted'},'Use o Google Imagens para encontrar fotos reais; confira o nome e a equipe antes de cadastrar. Fotografias remotas dependem da disponibilidade e das condições dos sites de origem.'),
   h('div',{class:'int-toolbar'},field('Buscar',query),field('Cobertura',filter)),list),
   section('Importar / exportar fotos','Ferramenta para transferir o catálogo de fotos sem alterar sua Carreira NBA.',io,
    h('div',{class:'int-actions'},btn('Exportar catálogo JSON',exportIt),btn('Importar catálogo JSON',importIt)),ioNotice));
  show();return host;
 }
 function paint(){if(selectedPlayer){mount(view,makeProfile(selectedPlayer));return;}mount(view,active==='home'?home():active==='teams'?teamScreen():active==='players'?playersScreen():active==='play'?play():active==='photos'?photoScreen():cups());for(const link of nav.querySelectorAll('button'))link.classList.toggle('active',link.dataset.tab===active);}
 const nav=h('nav',{class:'int-tabs','aria-label':'Navegação da competição'},...tabs.map(([id,name])=>h('button',{type:'button',dataset:{tab:id},onclick:()=>{selectedPlayer=null;if(id==='players')state.teamFilter='all';goto(id);}},name)));
 root.append(h('header',{class:'int-hero'},h('span',{class:'int-kicker'},'ARENA INTERNACIONAL · SEM MODO CARREIRA'),h('h1',null,meta.name),h('p',null,`${meta.competition} · elencos ${meta.snapshot} · fotos e atributos individuais · partidas FIBA 2D`),
  h('div',{class:'int-league-nav'},...Object.entries(ROUTES).map(([slug,id])=>h('a',{class:id===key?'int-active':'',href:`#/international/${slug}`},LABEL[id])))),nav,view,notice);
 paint();return root;
}
