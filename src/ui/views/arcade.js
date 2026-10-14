// Evolution 101–500: novos modos avulsos. NENHUMA escrita em world/season/IndexedDB.
import { h, icon, mount } from '../dom.js';
import { toast } from '../components/feedback.js';
import { playerAvatar, teamLogo } from '../../media/photos.js';
import { loadArcadeUniverse, readRoster, writeRoster, defaultRoster, addPlayer, removePlayer, rosterTeams, validateRoster, fantasyDraft, streetTeamsFromRoster } from '../../arcade/rosters.js';
import { allStarSelections, allStarTeam, captainsDraft, threePointContest, dunkContest, exhibitionMvp } from '../../arcade/all-star.js';
import { newStreetGame, streetPossession, simulateStreet, runStreetCircuit } from '../../arcade/street.js';
import { streetStatistics, streetPlayFocus } from '../../arcade/street-statistics.js';
import { runTournament } from '../../arcade/tournament.js';
import { MatchSim } from '../../match/sim.js';
import { renderLive } from './match-live.js';
import { createRng } from '../../core/rng.js';

const TABS = [
  ['hub','Arena','Novos modos sem alterar a carreira'],
  ['allstar','All-Star','Leste × Oeste, concursos e seleção'],
  ['roster','Roster Studio','Dois elencos personalizados, até 15 jogadores'],
  ['street','Street 1–3×3','Meia quadra: 1×1, 2×2 e 3×3'],
  ['circuit','Circuito Street','Torneio 3×3 de quadras de rua'],
  ['cup','Copa Rápida','Chave eliminatória com 4 ou 8 franquias'],
];
const control = (label, child) => h('label', { class: 'arc-field' }, h('span', null, label), child);
const btn = (label, onClick, cls = '') => h('button', { type: 'button', class: `arc-btn ${cls}`, onclick: onClick }, label);
const box = (title, desc, ...content) => h('section', { class: 'arc-card' }, h('div', { class: 'arc-card-heading' }, h('h3', null, title), desc ? h('p', null, desc) : null), ...content);
const option = (value, label, selected) => h('option', { value: String(value), selected: String(value) === String(selected) }, label);
const selector = (items, selected, onChange) => h('select', { value: String(selected), onchange: (e) => onChange(e.target.value) }, items.map(([v,l]) => option(v,l,selected)));
const empty = (text) => h('p', { class: 'arc-empty' }, text);
const scoreFmt = (a) => a.map((x) => String(x)).join(' : ');
const announce = (text) => toast(text);

export async function arcadeView({ mode = 'hub' } = {}) {
  const { players, teams } = await loadArcadeUniverse();
  const pool = [...players].filter((p) => Number.isFinite(p.ovr)).sort((a, b) => b.ovr - a.ovr);
  const poolById = new Map(pool.map((p) => [String(p.id), p]));
  let storage = null;
  try { storage = window.localStorage; } catch { /* ambiente privado sem armazenamento */ }
  let rosters = readRoster(storage, pool);
  const root = h('div', { class: 'page arc-page' });
  const view = h('div', { class: 'arc-view' });
  const modes = h('nav', { class: 'arc-tabs', 'aria-label': 'Modos de jogo independentes' });
  let cleanup = null;
  let activeMode = TABS.some(([id]) => id === mode) ? mode : 'hub';
  const go = (name) => { if (cleanup) { cleanup(); cleanup = null; } location.hash = `#/arcade/${name}`; };
  // Liberar canvas, listeners e requestAnimationFrame ao sair para outra rota.
  const abort = () => { cleanup?.(); cleanup = null; };
  window.addEventListener('hashchange', abort, { once: true });
  const persist = () => { try { rosters = writeRoster(storage, rosters, pool); return true; } catch (err) { announce(`Roster em memória apenas: ${err.message}`); return false; } };
  const playerLine = (p, suffix = null) => h('div', { class: 'arc-player' }, playerAvatar(p, { size: 'sm' }), h('div', { class: 'arc-player-name' }, h('strong', null, p.name), h('span', null, `${p.positions?.join(' / ') || '—'} · ${p.teamId || 'Livre'}`)), h('strong', { class: 'arc-rating' }, p.ovr), suffix);
  const duelTeam = (t, roster) => h('div', { class: 'arc-match-team', style: { '--arc-color': t.colors[0] } }, teamLogo(t, { size: 'md' }), h('div', null, h('strong', null, t.name), h('small', null, `${roster.length} atletas · ${Math.round(roster.reduce((s, p) => s + p.ovr, 0) / Math.max(1, roster.length))} OVR médio`)));
  const startFive = (teamsInfo, { label = 'Partida avulsa', seed = 'arena', controlIndex = null, back = 'hub' } = {}) => {
    if (teamsInfo.some((t) => t.roster.length < 5)) return announce('São necessários pelo menos cinco atletas por equipe.');
    const prepared = teamsInfo.map((t, i) => ({ ...t, aiCoach: i !== controlIndex }));
    const sim = new MatchSim(prepared, { seed, quarterSeconds: 180, recordReplay: true });
    cleanup?.();
    mount(view, h('div', { class: 'arc-playing-label' }, btn('← Voltar para os modos', () => { cleanup?.(); cleanup = null; show(); }), h('strong', null, label), h('span', null, 'Amistoso avulso · sem efeito na carreira')));
    const liveHost = h('div', { class: 'arc-live-host' });
    view.append(liveHost);
    cleanup = renderLive(liveHost, sim, prepared, {
      control: controlIndex, mode: 'quick', isolated: true, presentationTitle: label,
      onArcadeFinish: (record) => { if (label === 'All-Star Game') { const mvp=exhibitionMvp(record); if(mvp) announce(`MVP do All-Star: ${mvp.name} · ${mvp.pts} pts, ${mvp.reb} reb, ${mvp.ast} ast`); } },
      onRestart: () => startFive(teamsInfo, { label, seed, controlIndex, back }),
      onNew: () => { cleanup?.(); cleanup = null; show(); },
    });
  };

  const allStarState = { seed: `festival-${new Date().getFullYear()}`, controlling: '-1', format: 'conferences' };
  function allStar() {
    const state = allStarState;
    const picks = state.format === 'captains' ? captainsDraft(pool, { seed: state.seed }) : allStarSelections(players, teams);
    const result = h('div', { class: 'arc-result', 'aria-live': 'polite' });
    const rosterCards = picks.map((group, i) => box(state.format === 'captains' ? `TIME ${i+1} · ${group[0]?.name ?? 'Capitão'}` : i ? 'CONFERÊNCIA OESTE' : 'CONFERÊNCIA LESTE', 'Seleção por Overall: não representa uma votação oficial.',
      h('div', { class: 'arc-list' }, group.map((p, j) => playerLine(p, j < 5 ? h('span', { class:'arc-flag' }, 'Titular') : null)))));
    return h('div', { class: 'arc-stack' },
      h('div', { class: 'arc-split' }, ...rosterCards),
      box('All-Star Game 5×5', 'Jogo completo no motor 2D existente, sem registrar amistoso na carreira.',
        h('div', { class: 'arc-controls' },
          control('Formato de seleção', selector([['conferences','Leste × Oeste'],['captains','Draft de capitães']],state.format,v=>{state.format=v;mount(view,allStar());})),
          control('Semente', h('input', { type: 'text', maxLength: 44, value: state.seed, oninput: (e) => state.seed = e.target.value })),
          control('Controle', selector([['-1','Espectador (IA × IA)'],['0',state.format === 'captains' ? 'Time 1' : 'Leste'],['1',state.format === 'captains' ? 'Time 2' : 'Oeste']], state.controlling, (v) => state.controlling = v)),
          btn('Jogar All-Star 5×5', () => startFive(picks.map((p,i) => { const t=allStarTeam(p, i === 0 ? 'East' : 'West', i); if(state.format==='captains'){t.name=`Time ${p[0]?.name.split(' ').at(-1)}`;t.fullName=t.name;t.team={...t.team,name:t.name,fullName:t.fullName};} return t; }), { label: 'All-Star Game', seed: state.seed, controlIndex: state.controlling === '-1' ? null : Number(state.controlling), back: 'allstar' }), 'arc-primary'),
        )),
      box('Sábado das estrelas', 'Concursos simulados de forma reprodutível pelos atributos dos jogadores. São modos avulsos, não resultados oficiais.',
        h('div', { class: 'arc-actions' },
          btn('Disputar torneio de 3 pontos', () => showContest('3pt')),
          btn('Disputar concurso de enterradas', () => showContest('dunk'))), result));
    function showContest(kind) {
      const entrants = pool;
      const resultRows = kind === '3pt' ? threePointContest(entrants, state.seed) : dunkContest(entrants, state.seed);
      mount(result, h('h3', null, kind === '3pt' ? 'Concurso de 3 pontos' : 'Concurso de enterradas'), h('div', { class: 'arc-list' }, resultRows.map((r,i) => h('div', { class: ['arc-contest', i === 0 && 'arc-winner'] },
        h('span', null, `#${i+1}`), h('strong', null, r.name), h('span', { class: 'arc-racks' }, kind === '3pt' ? `${r.racks.map((rack) => rack.reduce((s, x)=> s+x, 0)).join(' · ')} · ${r.made}/25 bolas (${r.accuracy})` : r.attempts.join(' + ')), h('strong', null, `${r.points} ${kind==='3pt' ? '/ 30' : '/ 100'}`)))));
    }
  }

  function rosterStudio() {
    let term = '';
    let draftSeed = 'meu-draft';
    const undo = [], redo = [];
    const field = h('input', { type: 'search', placeholder: 'Buscar jogador por nome ou franquia...', 'aria-label': 'Buscar jogador', oninput: (e) => { term = e.target.value; updatePool(); } });
    const list = h('div', { class: 'arc-search-results' });
    const teamsHost = h('div', { class: 'arc-split' });
    const error = h('p', { class: 'arc-note', role: 'status', 'aria-live': 'polite' });
    const repaint = () => { updateTeams(); updatePool(); };
    const guard = (act) => {
      try {
        const next = validateRoster(act(), pool);
        if (JSON.stringify(next) === JSON.stringify(rosters)) return;
        undo.push(structuredClone(rosters));
        if (undo.length > 30) undo.shift();
        redo.length = 0;
        rosters = next;
        const saved = persist();
        repaint();
        error.textContent = saved ? 'Alteração registrada. É possível desfazer nesta sessão.' : 'Alteração em memória. Exporte o JSON para não perder.';
      } catch (err) { error.textContent = err.message; }
    };
    const travel = (from, to) => {
      if (!from.length) { error.textContent = 'Não há alterações para recuperar.'; return; }
      to.push(structuredClone(rosters));
      rosters = from.pop();
      const saved = persist();
      repaint();
      error.textContent = saved ? 'Roster restaurado.' : 'Roster restaurado apenas em memória. Exporte o JSON.';
    };
    const names = () => rosters.teams.map((t) => t.name);
    function updateTeams() {
      mount(teamsHost, rosters.teams.map((t, side) => box(t.name, `${t.playerIds.length}/15 atletas · mínimo 5 para partidas 5×5`,
        control('Nome do time', h('input', { type: 'text', maxLength: 42, value: t.name, onchange: (e) => guard(() => {
          const next = structuredClone(rosters); next.teams[side].name = e.target.value; return validateRoster(next, pool); }) })),
        control('Cor da equipe', h('input', { type:'color', value:t.colors[0], onchange:(e)=>guard(()=>{
          const next=structuredClone(rosters);next.teams[side].colors[0]=e.target.value;return validateRoster(next,pool);}) })),
        h('div', { class: 'arc-list' }, t.playerIds.map((id) => { const p = poolById.get(id); return p ? playerLine(p, btn('Remover', () => guard(() => removePlayer(rosters, id, pool)), 'arc-small')) : null; })))));
    }
    function updatePool() {
      const q = term.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
      const filtered = pool.filter((p) => !q || `${p.name} ${p.teamId}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q)).slice(0, 45);
      mount(list, filtered.map((p) => playerLine(p, h('div', { class: 'arc-actions' },
        btn(`→ ${names()[0]}`, () => guard(() => addPlayer(rosters, 0, p.id, pool)), 'arc-small'),
        btn(`→ ${names()[1]}`, () => guard(() => addPlayer(rosters, 1, p.id, pool)), 'arc-small')))));
    }
    const importFile = h('input', { type: 'file', accept: '.json,application/json', 'aria-label':'Importar roster JSON', onchange: async (e) => {
      const file = e.target.files?.[0]; if (!file) return;
      if (file.size > 100000) { error.textContent = 'Arquivo maior que 100 KB.'; return; }
      try { const json = JSON.parse(await file.text()); guard(() => validateRoster(json, pool)); error.textContent = 'Importação validada. Você pode desfazer nesta sessão.'; }
      catch(err) { error.textContent = `Importação rejeitada: ${err.message}`; } finally { e.target.value = ''; }
    } });
    function exportJson() {
      const blob = new Blob([JSON.stringify(validateRoster(rosters, pool), null, 2)], { type:'application/json' });
      const url = URL.createObjectURL(blob);
      const a = h('a', { href:url, download:'nba-arcade-rosters.json' }); a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    function play() { try { const t = rosterTeams(rosters, pool); startFive(t, { label: `${t[0].name} × ${t[1].name}`, seed:'custom-rosters', controlIndex:0, back:'roster' }); } catch (err) { error.textContent = err.message; } }
    updateTeams(); updatePool();
    return h('div', { class:'arc-stack' },
      h('div', { class:'arc-toolbar' }, btn('Jogar com meus rosters', play, 'arc-primary'),
        btn('Restaurar escalações', () => { if (window.confirm('Restaurar os dois elencos do amistoso? Você poderá desfazer nesta sessão.')) guard(() => defaultRoster(pool)); }),
        control('Semente do fantasy draft', h('input', { type:'text', maxLength:48, value:draftSeed, oninput:e=>draftSeed=e.target.value })),
        btn('Fantasy draft (semente)', () => guard(() => fantasyDraft(pool, draftSeed))),
        btn('Desfazer', () => travel(undo, redo)), btn('Refazer', () => travel(redo, undo)),
        btn('Exportar JSON', exportJson), control('Importar JSON', importFile)),
      error, teamsHost,
      box('Mercado de jogadores para o amistoso', 'Transferir aqui não modifica contratos, elencos ou saves de qualquer carreira. Um atleta só pode estar em um dos dois times.', field, list));
  }

  function street() {
    const state = { target: 21, squadSize: 3, seed: 'quadra-do-bairro', tactic: 'balanced', picks: rosters.teams.map((t) => t.playerIds.slice(0,3)) };
    const host = h('div', { class:'arc-street-host' });
    const selectors = h('div', { class: 'arc-split' });
    const status = h('p', { class: 'arc-note', role: 'status', 'aria-live': 'polite' });
    let game = null;
    const invalidate = () => {
      if (game) { game = null; mount(host); status.textContent = 'Configuração alterada. Inicie uma nova partida para aplicar as escolhas.'; }
    };
    const picker = (side, slot) => {
      const ids = rosters.teams[side].playerIds;
      return selector(ids.map((id) => [id, `${poolById.get(id)?.name ?? 'Desconhecido'} · ${poolById.get(id)?.ovr ?? '?'}`]), state.picks[side][slot] ?? '', (v) => { state.picks[side][slot] = v; invalidate(); });
    };
    function updateStreetSlots() {
      mount(selectors, rosters.teams.map((t, side) => box(t.name,
        `Escolha ${state.squadSize} atleta(s) distintos do seu roster.`,
        ...Array.from({ length: state.squadSize }, (_, slot) => control(`Jogador ${slot + 1}`, picker(side, slot))))));
      status.textContent = '';
    }
    updateStreetSlots();
    function fresh() {
      try {
        const specs = streetTeamsFromRoster(rosters, pool, state.picks, state.squadSize);
        game = newStreetGame(specs, { seed:state.seed, target:state.target, squadSize:state.squadSize });
        status.textContent = '';
        paint();
      } catch (err) { status.textContent = err.message; }
    }
    function paint() {
      if (!game) return;
      const focus = streetPlayFocus(game);
      const stats = streetStatistics(game);
      const players = game.teams.flatMap((t,side) => t.roster.map((p,i) => h('div', {
        class:['arc-court-player',side === game.offense && 'arc-ball-team',focus?.playerId === String(p.id) && 'arc-event-focus'],
        style:{ '--px': `${side === 0 ? (18 + 10 * i) : (54 + 10 * i)}%`, '--py': `${20 + i*24}%`, '--arc-color':t.colors[0] }
      }, h('span', null, p.name.split(' ').at(-1).slice(0,10)), h('small',null,p.ovr))));
      const statCards = stats.map(team => h('section',{class:'arc-stat-card'},
        h('h4',null,team.name),h('div',{class:'arc-table-scroll'},h('table',{class:'arc-stat-table'},
          h('caption',null,`Estatísticas Street de ${team.name}: cestas de 1 e 2 pontos`),
          h('thead',null,h('tr',null,...['Atleta','PTS','1PT','2PT','FG%','ROB','PER'].map(label=>h('th',{scope:'col'},label)))),
          h('tbody',null,team.players.map(p=>h('tr',null,
            h('th',{scope:'row'},p.name),h('td',null,p.pts),h('td',null,`${p.oneMade}/${p.oneAtt}`),
            h('td',null,`${p.twoMade}/${p.twoAtt}`),h('td',null,p.fgPct),h('td',null,p.steals),h('td',null,p.turnovers)))),
          h('tfoot',null,h('tr',null,h('th',{scope:'row'},'Total'),h('td',null,team.totals.pts),
            h('td',null,`${team.totals.oneMade}/${team.totals.oneAtt}`),
            h('td',null,`${team.totals.twoMade}/${team.totals.twoAtt}`),h('td',null,team.totals.fgPct),
            h('td',null,team.totals.steals),h('td',null,team.totals.turnovers)))))));
      mount(host, h('div', { class: 'arc-street-scores' },
        ...game.teams.map((t,i) => h('div', { class: [i === game.offense && 'arc-attacking'] }, h('small', null,t.name), h('strong', { class: 'arc-number' }, game.score[i]))),
        h('span', null, game.over ? 'FINAL' : `Posse ${game.possessions + 1}`)),
        h('div', { class:'arc-court', role:'img', 'aria-label': `Quadra esquemática ${game.squadSize} contra ${game.squadSize}. Placar ${scoreFmt(game.score)}. Posições ilustrativas.` }, h('div',{class:'arc-court-paint'}),h('div',{class:'arc-court-arc'}),h('div',{class:'arc-hoop'},'◯'),...players),
        h('p', { class: 'arc-street-update', role: 'status', 'aria-live': 'polite' },
          game.over ? `Fim de jogo. ${game.teams[game.winner].name} venceu por ${scoreFmt(game.score)}.` :
          game.events[0] ? `Placar ${scoreFmt(game.score)}. ${game.events[0].text}` : `Partida ${state.squadSize}×${state.squadSize} pronta.`),
        focus ? h('p',{class:'arc-street-focus'},`Destaque da última posse: ${focus.label}.`) : null,
        h('div', { class: 'arc-actions' },
          game.over ? null : btn('Próxima posse', () => { game = streetPossession(game,state.tactic); paint(); }, 'arc-primary'),
          game.over ? null : btn('Simular até o final', () => { game = simulateStreet(game, { tactic: state.tactic }); paint(); }),
          btn('Recomeçar', fresh)),
        game.over ? h('h3',{class:'arc-winner-banner'},`Vencedor: ${game.teams[game.winner].name}!`) : null,
        h('div', { class:'arc-stat-grid' }, ...statCards),
        h('div', { class:'arc-playlog', 'aria-label':'Histórico de posses' }, game.events.slice(0,12).map((ev) => h('div',{class:'arc-playlog-row'}, h('strong',null,`#${ev.n} · ${scoreFmt(ev.score)}`), h('span',null,ev.text)))));
    }
    return h('div',{class:'arc-stack'},
      box('Street Basketball', 'Desafios 1×1, 2×2 ou 3×3 em meia quadra. Cestas de dentro valem 1 e de fora 2. Vitória por dois, teto de 25.',
        selectors, status,
        h('div',{class:'arc-controls'},
          control('Formato',selector([[1,'1 × 1'],[2,'2 × 2'],[3,'3 × 3']],state.squadSize,v=>{state.squadSize=Number(v); state.picks=rosters.teams.map(t=>t.playerIds.slice(0,state.squadSize)); updateStreetSlots(); invalidate();})),
          control('Meta',selector([[11,'11 pontos'],[21,'21 pontos']],state.target, v => {state.target=Number(v);invalidate();})),
          control('Estilo',selector([['balanced','Equilibrado'],['outside','Arremessar de fora'],['drive','Atacar o aro'],['pass','Circular a bola']],state.tactic,v=>state.tactic=v)),
          control('Semente',h('input',{type:'text',maxLength:48,value:state.seed,oninput:e=>{state.seed=e.target.value;invalidate();}})),
          btn('Iniciar Street',fresh,'arc-primary'))),host);
  }

  function circuit() {
    const settings={size:8,seed:'circuito-rua',target:11};
    const result=h('div',{class:'arc-stack'});
    const names=new Map();
    function play(){
      try {
        const rng=createRng(`circuit:${settings.seed}`);
        const chosen=rng.shuffle(pool.slice(0,Math.min(pool.length,150))).slice(0,settings.size*3);
        const squads=Array.from({length:settings.size},(_,i)=>{
          const id=`ST${i+1}`; const name=`Trio ${String(i+1).padStart(2,'0')}`;names.set(id,name);
          return {id,name,colors:[['#ffbd52','#ffffff'],['#68aaff','#ffffff'],['#eb6b91','#ffffff'],['#aa84fd','#ffffff']][i%4],roster:chosen.slice(i*3,i*3+3)};
        });
        const cup=runStreetCircuit(squads,{seed:settings.seed,target:settings.target});
        mount(result,h('div',{class:'arc-bracket'},cup.rounds.map((round,i)=>box(i===cup.rounds.length-1?'FINAL STREET':i===0?'PRIMEIRA RODADA':'SEMIFINAL',null,
          ...round.map(g=>h('div',{class:'arc-bracket-game'},h('div',{class:g.winner===g.home?'arc-won':''},names.get(g.home),h('strong',null,g.score[0])),
            h('div',{class:g.winner===g.away?'arc-won':''},names.get(g.away),h('strong',null,g.score[1])))))),
          h('div',{class:'arc-winner-banner'},`Reis da quadra: ${names.get(cup.champion)}!`)));
      } catch(err){mount(result,empty(err.message));}
    }
    return h('div',{class:'arc-stack'},box('Circuito Street 3×3','Draft aleatório de trios, chaves e partidas até 11 ou 21. Todas as posses passam pelo motor Street, sem resultados fictícios inseridos em saves.',
      h('div',{class:'arc-controls'},
        control('Número de trios',selector([[4,'4 trios'],[8,'8 trios']],settings.size,v=>settings.size=Number(v))),
        control('Placar final',selector([[11,'11 pontos'],[21,'21 pontos']],settings.target,v=>settings.target=Number(v))),
        control('Semente',h('input',{type:'text',maxLength:44,value:settings.seed,oninput:e=>settings.seed=e.target.value})),
        btn('Disputar Circuito Street',play,'arc-primary'))),result);
  }

  function cup() {
    const playable = teams.filter((t) => pool.filter((p) => p.teamId === t.id).length >= 5);
    const state = { count: 8, seed:'copa-de-outubro', ids: playable.slice(0,8).map((t)=>t.id) };
    const controls = h('div',{class:'arc-split'});
    const results = h('div',{class:'arc-stack'});
    const options = playable.map((t)=>[t.id,t.fullName]);
    function paintControls() {
      mount(controls, Array.from({length:state.count},(_,i)=>control(`Franquia ${i+1}`,
        selector(options,state.ids[i],v=>state.ids[i]=v))));
    }
    paintControls();
    function play() {
      try {
        const specs = state.ids.slice(0,state.count).map((id)=>{
          const t = playable.find((x)=>x.id===id);
          if (!t) throw Error('Franquia não encontrada.');
          return {...t,roster:pool.filter((p)=>p.teamId===t.id).slice(0,13)};
        });
        const data = runTournament(specs,{seed:state.seed});
        const names = new Map(teams.map((t)=>[t.id,t.name]));
        mount(results,h('div',{class:'arc-bracket'},
          data.rounds.map((round,i)=>box(i===data.rounds.length-1?'FINAL':i===0?'PRIMEIRA RODADA':'SEMIFINAL',null,
            h('div',{class:'arc-list'},round.map((g)=>h('div',{class:'arc-bracket-game'},
              h('div',{class:g.winner===g.home?'arc-won':''},names.get(g.home),h('strong',null,g.score[0])),
              h('div',{class:g.winner===g.away?'arc-won':''},names.get(g.away),h('strong',null,g.score[1])))))))),
          h('div',{class:'arc-winner-banner'},`Campeão: ${names.get(data.champion)}!`));
      } catch(err) { mount(results,empty(err.message)); }
    }
    return h('div',{class:'arc-stack'},box('Copa Relâmpago', 'Mata-mata avulso com o motor estatístico. Todos os confrontos são simulados rapidamente, sem atualizar uma temporada.',
      h('div',{class:'arc-controls'},control('Participantes',selector([[4,'4 equipes'],[8,'8 equipes']],state.count, v=>{
        state.count=Number(v); state.ids=playable.slice(0,state.count).map(t=>t.id); paintControls(); })),
        control('Semente',h('input',{type:'text',maxLength:48,value:state.seed,oninput:e=>state.seed=e.target.value})),
        btn('Simular copa',play,'arc-primary')),controls),results);
  }
  function hub() { return h('div',{class:'arc-hub-grid'},...TABS.filter(([id])=>id!=='hub').map(([id,name,desc],i)=>h('a',{class:'arc-mode',href:`#/arcade/${id}`,style:{'--arc-color':['#ffb357','#66a1fa','#ff567e','#9b83ff','#56cfae'][i]}},
    h('span',{class:'arc-mode-no'},String(i+1).padStart(2,'0')),h('strong',null,name),h('p',null,desc),h('span',{class:'arc-link'},'ABRIR MODO →')))); }
  function show() {
    mount(modes,TABS.map(([id,name])=>h('a',{href:`#/arcade/${id}`,class:['arc-tab',activeMode===id&&'active'],'aria-current':activeMode===id?'page':null},name)));
    const content = activeMode==='allstar'?allStar():activeMode==='roster'?rosterStudio():activeMode==='street'?street():activeMode==='circuit'?circuit():activeMode==='cup'?cup():hub();
    mount(view,content);
  }
  mount(root,h('header',{class:'arc-hero'},h('span',{class:'arc-eyebrow'},'EVOLUTION 101–500 · NBA ARCADE'),h('h1',null,'A NBA além da ',h('em',null,'temporada.')),
    h('p',null,'All-Star, rosters, Street e copas independentes. Nenhum resultado ou alteração entra em uma carreira salva.'),
    h('div',{class:'arc-hero-tags'},...['NOVOS MODOS','ROSTERS PERSONALIZADOS','STREET 3×3','PARTIDAS 2D'].map(x=>h('span',null,x)))),modes,view);
  show();
  return root;
}
