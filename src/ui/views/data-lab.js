/** Sala de Análise, evolutions 11–100. Interface estritamente de consulta do universo. */
import { h, mount } from '../dom.js';
import { getWorld, playerAge } from '../../core/world.js';
import { pageHeader } from '../components/widgets.js';
import { playerAvatar, teamLogo } from '../../media/photos.js';
import { parseHash } from '../router.js';
import { duelRadar } from '../components/visuals.js';
import {
  athleteRows, filterAthletes, franchiseRows, filterFranchiseLab,
  gameRows, filterGames, gameSummary, headToHead, statisticRows,
  statLeaders, STAT_FIELDS, toCsv, LAB_STAGES, compareAthletes,
} from '../lab-insights.js';

const TABS = [
  ['painel', 'Painel geral', 'Atividade e números da liga'],
  ['scout', 'Scouting', 'Descoberta de talentos'],
  ['dna', 'DNA vs DNA', 'Comparação técnica de atletas'],
  ['equipes', 'Franquias', 'Diagnóstico de elencos'],
  ['jogos', 'Partidas', 'Explorador de resultados'],
  ['duelos', 'Confrontos', 'Histórico entre franquias'],
  ['lideres', 'Líderes', 'Desempenho nesta temporada'],
];
const number = (value, decimals = 0) => value == null || !Number.isFinite(value) ? '—' : Number(value).toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const teamName = (teams, id) => teams.get(id)?.name ?? id ?? '—';
const teamOptions = (teams) => [['all', 'Toda a liga'], ...[...teams.values()].sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR')).map((t) => [t.id, t.fullName])];
const opt = (value, label) => h('option', { value }, label);
const select = (label, values, value, onchange) => {
  const element = h('select', { onchange: (e) => onchange(e.target.value), 'aria-label': label }, values.map(([v, l]) => opt(v, l)));
  element.value = String(value ?? '');
  return h('label', { class: 'lab-filter' }, h('span', null, label), element);
};
const input = (label, type, value, onchange, opts = {}) => h('label', { class: 'lab-filter' }, h('span', null, label), h('input', { type, value, placeholder: opts.placeholder, min: opts.min, max: opts.max, step: opts.step, oninput: (e) => onchange(e.target.value), 'aria-label': label }));
const button = (text, onclick, style = '') => h('button', { type: 'button', class: `btn ${style}`, onclick }, text);
const metric = (label, value, detail = '') => h('div', { class: 'lab-metric' }, h('span', null, label), h('strong', null, value), detail ? h('small', null, detail) : null);
const note = (message) => h('p', { class: 'lab-note' }, message);
const empty = (message) => h('div', { class: 'lab-empty', role: 'status' }, h('strong', null, 'Nenhum dado neste recorte'), h('p', null, message));
const section = (title, subtitle, child) => h('section', { class: 'lab-section' }, h('div', { class: 'lab-section-title' }, h('h2', null, title), subtitle ? h('p', null, subtitle) : null), child);
const bar = (value, max = 100, title = '') => h('div', { class: 'lab-bar', role: 'meter', 'aria-label': title || 'Indicador', 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': Math.max(0, Math.min(max, value ?? 0)) }, h('i', { style: { width: `${Math.max(0, Math.min(100, 100 * (value ?? 0) / Math.max(max, 1)))}%` } }));

// Exportação é um arquivo externo de análise; não modifica saves, career nem IndexedDB.
function downloadRows(rows, keys, filename) {
  if (!rows.length) return;
  const blob = new Blob([toCsv(rows, keys)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `${filename.replace(/[^a-z0-9-]/gi, '-')}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function dataLabView() {
  const world = getWorld();
  const teams = world.teams;
  const athletes = athleteRows(world.players.values(), teams, playerAge, { godMode: Boolean(world.career.godMode) });
  const franchises = franchiseRows(teams.values(), world.players.values(), playerAge);
  const matches = gameRows(world.games.values(), world.calendar.season);
  const stats = statisticRows(world.seasonStats.values(), world.players);
  const panes = new Map();
  const currentTab = parseHash().query.get('tab');
  const state = { tab: TABS.some(([id]) => id === currentTab) ? currentTab : 'painel' };
  const menu = h('div', { class: 'lab-tabs', role: 'tablist', 'aria-label': 'Áreas da Sala de Análise' });
  const content = h('div', { class: 'lab-content', id: 'lab-panel', role: 'tabpanel' });

  const overview = () => {
    const s = gameSummary(matches);
    const total = matches.length;
    const top = [...franchises].filter((t) => t.core !== null).sort((a, b) => b.core - a.core).slice(0, 5);
    const recent = matches.filter((g) => g.status === 'final').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
    const remaining = matches.filter((g) => g.status !== 'final').sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
    return h('div', { class: 'lab-stack' },
      h('div', { class: 'lab-metrics' },
        metric('Franquias', franchises.length), metric('Atletas', athletes.length),
        metric('Partidas cadastradas', total), metric('Jogos finalizados', s.played),
        metric('Pendentes', s.pending), metric('Pontos por jogo', number(s.points, 1), 'Soma das duas equipes')),
      h('div', { class: 'lab-split' },
        section('Núcleos mais fortes', 'Média dos cinco melhores overalls disponíveis. Não é uma previsão de vitórias.',
          h('div', { class: 'lab-list' }, top.map((r, i) => h('a', { class: 'lab-row', href: `#/team/${r.id}` },
            h('span', { class: 'lab-rank' }, String(i + 1).padStart(2, '0')),
            teamLogo(r.team, { size: 'sm' }), h('span', { class: 'lab-grow' }, h('strong', null, r.name), h('small', null, `${r.players} atletas`)),
            h('span', { class: 'lab-value' }, number(r.core, 1)), bar(r.core, 100, `Força do núcleo ${r.name}`))))),
        section('Retrato das partidas', 'Indicadores calculados apenas nos jogos com resultado válido.',
          h('div', { class: 'lab-compact-metrics' }, metric('Margem média', number(s.margin, 1)),
            metric('Jogos até 5 pontos', s.close), metric('Prorrogações', s.overtime), metric('Vitórias por 20+', s.blowouts)))) ,
      h('div', { class: 'lab-split' },
        section('Últimos resultados', 'Atalhos para fichas oficiais dos jogos', recent.length ? h('div', { class: 'lab-list' }, recent.map((g) => gameRow(g, teams))) : empty('Nenhum resultado disponível.')),
        section('Próximos confrontos', 'Extraídos do calendário existente', remaining.length ? h('div', { class: 'lab-list' }, remaining.map((g) => gameRow(g, teams))) : empty('Não há partidas pendentes nesta temporada.'))),
      note('Sala de Análise é somente leitura. Índices de atributos e força de núcleo são descrições da base atual, não previsões de resultados.'));
  };

  const scout = () => {
    const st = { search: '', conference: 'all', team: 'all', position: 'all', country: 'all', minAge: 0, maxAge: 60, minOvr: 0, maxOvr: 100, minPotential: 0, sort: 'ovr', direction: 'desc' };
    let viewRows = [];
    const controls = h('div', { class: 'lab-controls' });
    const count = h('span', { class: 'lab-count', role: 'status', 'aria-live': 'polite' });
    const results = h('div', { class: 'lab-results' });
    const countries = [...new Set(athletes.map((p) => p.country))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    function update() {
      viewRows = filterAthletes(athletes, st);
      count.textContent = `${viewRows.length} jogadores encontrados · primeiros 60 exibidos`;
      mount(results, viewRows.length ? h('div', { class: 'lab-list' }, viewRows.slice(0, 60).map((r) => h('a', {
        class: 'lab-player-row', href: `#/player/${r.id}` },
        playerAvatar(r.source, { size: 'sm' }),
        h('div', { class: 'lab-grow' }, h('strong', null, r.name), h('small', null, `${r.team} · ${r.positions.join('/') || '—'} · ${r.age ?? '—'} anos · ${r.country}`)),
        h('div', { class: 'lab-player-numbers' },
          h('span', null, h('small', null, 'OVR'), h('strong', null, number(r.ovr))),
          h('span', null, h('small', null, world.career.godMode ? 'POT' : 'POT EST'), h('strong', null, r.potentialLabel)),
          h('span', null, h('small', null, 'Percentil OVR'), h('strong', null, r.percentile == null ? '—' : `${r.percentile}º`)))))) : empty('Ajuste posição, idade, overall ou outros filtros.'));
    }
    function sync(key, value) { st[key] = value; update(); }
    mount(controls,
      input('Buscar atleta / país / franquia', 'search', st.search, (v) => sync('search', v), { placeholder: 'Nome ou franquia...' }),
      select('Conferência', [['all', 'Toda a liga'], ['East', 'Leste'], ['West', 'Oeste']], st.conference, (v) => sync('conference', v)),
      select('Franquia', teamOptions(teams), st.team, (v) => sync('team', v)),
      select('Posição', [['all', 'Todas'], ...['PG','SG','SF','PF','C'].map((v) => [v, v])], st.position, (v) => sync('position', v)),
      select('País', [['all', 'Todos'], ...countries.map((c) => [c, c])], st.country, (v) => sync('country', v)),
      input('Idade mínima', 'number', st.minAge, (v) => sync('minAge', Number(v) || 0), { min: 0, max: 65 }),
      input('Idade máxima', 'number', st.maxAge, (v) => sync('maxAge', Number(v) || 60), { min: 0, max: 65 }),
      input('Overall mínimo', 'number', st.minOvr, (v) => sync('minOvr', Number(v) || 0), { min: 0, max: 100 }),
      input('Overall máximo', 'number', st.maxOvr, (v) => sync('maxOvr', Number(v) || 100), { min: 0, max: 100 }),
      input('Teto potencial estimado mínimo', 'number', st.minPotential, (v) => sync('minPotential', Number(v) || 0), { min: 0, max: 100 }),
      select('Ordenar por', [['ovr','Overall'],['potential','Teto estimado do potencial'],['gap','Teto estimado menos OVR'],['age','Idade'],['percentile','Percentil OVR'],['name','Nome']], st.sort, (v) => sync('sort', v)),
      select('Ordem', [['desc','Maior primeiro / Z→A'],['asc','Menor primeiro / A→Z']], st.direction, (v) => sync('direction', v)));
    update();
    return h('div', { class: 'lab-stack' }, section('Scouting avançado', 'Filtros combináveis e percentil de OVR. Potencial em faixa estimada, valor exato apenas no God Mode.', controls),
      h('div', { class: 'lab-toolbar' }, count, button('Exportar seleção CSV', () => downloadRows(viewRows,
        [{key:'id',label:'ID'},{key:'name',label:'Jogador'},{key:'team',label:'Franquia'}, {key:'ovr',label:'OVR'}, {key:'potentialLabel',label:'Potencial exibido'}, {key:'age',label:'Idade'}, {key:'percentile',label:'Percentil'}], 'nba-scouting'))), results);
  };

  const dnaTab = () => {
    const rated = athletes.filter((r) => r.ovr != null).sort((a,b) => b.ovr - a.ovr);
    const st = { a: rated[0]?.id, b: rated[1]?.id };
    const choices = rated.map((p) => [String(p.id), `${p.name} · ${p.team}`]);
    const result = h('div', { class: 'lab-stack' });
    function update() {
      const a = rated.find((p) => String(p.id) === String(st.a));
      const b = rated.find((p) => String(p.id) === String(st.b));
      const duel = compareAthletes(a,b);
      const radar = duel.valid ? duelRadar(a.groups,b.groups,{firstName:a.name,secondName:b.name}) : null;
      if (!duel.valid) {
        mount(result, empty('Selecione dois atletas diferentes.'));
        return;
      }
      const comparisonLines = duel.groups.map((g) => h('div', { class:'lab-dna-line' },
        h('strong', { class:g.advantage === 'left' ? 'lab-highlight' : '' }, number(g.left,1)),
        h('div', null, h('small', null, g.label), bar(g.left)),
        h('strong', { class:g.advantage === 'right' ? 'lab-highlight' : '' }, number(g.right,1))));
      const statsView = h('div', { class:'lab-stack' },
        h('div', { class:'lab-compact-metrics' },
          metric(`Eixos para ${a.name}`,duel.leftAdvantage), metric(`Eixos para ${b.name}`,duel.rightAdvantage),
          metric('Equilibrados',duel.ties), metric('Diferença média',number(duel.meanGap,1))), ...comparisonLines);
      const graph = section('Radar técnico comparado', 'Mesmos cinco grupos de atributos e mesma escala de 0 a 100.',
        h('div', { class:'lab-radar' }, radar || empty('Não há eixos suficientes para comparar.')));
      const numbers = section('Vantagens por grupo', 'Comparação descritiva dos atributos, sem previsão de resultado.', statsView);
      mount(result, h('div', { class:'lab-stack' }, h('div', { class:'lab-split' }, graph, numbers)));

    }
    const left = select('Atleta A',choices,String(st.a ?? ''),(v)=>{st.a=v;update();});
    const right = select('Atleta B',choices,String(st.b ?? ''),(v)=>{st.b=v;update();});
    update();
    return h('div',{class:'lab-stack'},section('Laboratório de DNA','Dois perfis, cinco grupos de atributos e comparação transparente, sem tocar no rendimento simulado.',
      h('div',{class:'lab-controls'},left,right,button('Inverter atletas',()=>{
        const temp=st.a;st.a=st.b;st.b=temp;left.querySelector('select').value=st.a;right.querySelector('select').value=st.b;update();
      }))),result);
  };

  const teamsTab = () => {
    const st = { search: '', conference: 'all', sort: 'core', direction: 'desc' };
    const controls = h('div', { class: 'lab-controls' });
    const results = h('div');
    let rows = [];
    function update() {
      rows = filterFranchiseLab(franchises, st);
      mount(results, rows.length ? h('div', { class: 'lab-team-grid' }, rows.map((r) => h('a', { href: `#/team/${r.id}`, class: 'lab-team-card', style: { '--lab-accent': r.team.colors?.[0] ?? 'var(--team)' } },
        h('div', { class: 'lab-team-top' }, teamLogo(r.team, { size: 'sm' }), h('strong', null, r.name)),
        h('div', { class: 'lab-team-numbers' }, metric('Núcleo (5)', number(r.core, 1)), metric('Rotação (8)', number(r.rotation, 1)), metric('Banco (6–10)', number(r.bench, 1))),
        bar(r.core, 100, `Overall médio dos cinco líderes ${r.name}`),
        h('p', { class: 'lab-team-meta' }, `${r.players} atletas · ${number(r.age, 1)} anos em média · ${r.youth} com menos de 25`),
        h('div', { class: 'lab-team-stars' }, r.topFive.map((p) => h('span', null, `${p.name} · ${p.ovr}`)))))) : empty('Nenhuma franquia encontrada.'));
    }
    function sync(key, v) { st[key] = v; update(); }
    mount(controls,
      input('Buscar franquia', 'search', st.search, (v) => sync('search', v)),
      select('Conferência', [['all','Toda a liga'],['East','Leste'],['West','Oeste']], st.conference, (v) => sync('conference', v)),
      select('Ordenar por', [['core','Força do núcleo'],['rotation','Rotação'],['bench','Banco'],['age','Idade média'],['youth','Jovens'],['players','Tamanho do elenco'],['name','Nome']], st.sort, (v) => sync('sort', v)),
      select('Ordem', [['desc','Maior primeiro'],['asc','Menor primeiro']], st.direction, (v) => sync('direction', v)));
    update();
    return h('div', { class: 'lab-stack' }, section('Laboratório de franquias', 'Comparação visual e transparente do elenco. Profundidade de banco é média dos atletas 6–10 por overall.', controls),
      h('div', { class: 'lab-toolbar' }, h('span', { class: 'muted' }, `${franchises.length} franquias no universo`), button('Exportar franquias CSV', () => downloadRows(rows,
        [{key:'id',label:'Sigla'},{key:'name',label:'Franquia'},{key:'players',label:'Elenco'},{key:'core',label:'Núcleo'}, {key:'rotation',label:'Rotação'}, {key:'bench',label:'Banco'}, {key:'age',label:'Idade média'}, {key:'youth',label:'Jovens'}], 'nba-franquias'))), results);
  };

  const gamesTab = () => {
    const st = { team: 'all', opponent: 'all', status: 'all', type: 'all', minTotal: 0, maxMargin: Infinity, from: '', to: '', sort: 'date', direction: 'desc', search: '' };
    const controls = h('div', { class: 'lab-controls' });
    const results = h('div');
    const tally = h('div', { class: 'lab-compact-metrics' });
    let rows = [];
    function update() {
      rows = filterGames(matches, st);
      const s = gameSummary(rows);
      mount(tally, metric('No recorte', s.total), metric('Finalizadas', s.played), metric('Margem média', number(s.margin, 1)), metric('Prorrogações', s.overtime));
      mount(results, rows.length ? h('div', { class: 'lab-list' }, rows.slice(0, 100).map((g) => gameRow(g, teams))) : empty('Não há jogos com esta combinação de filtros.'));
    }
    function sync(key, value) { st[key] = value; update(); }
    mount(controls,
      input('Buscar partida ou data', 'search', st.search, (v) => sync('search', v)),
      select('Equipe', teamOptions(teams), st.team, (v) => sync('team', v)),
      select('Adversário', teamOptions(teams), st.opponent, (v) => sync('opponent', v)),
      select('Situação', [['all','Todas'],['final','Finalizadas'],['scheduled','Não disputadas']], st.status, (v) => sync('status', v)),
      select('Fase', [['all','Todas'], ...[...new Set(matches.map((g) => g.type))].map((t) => [t, t])], st.type, (v) => sync('type', v)),
      select('Mínimo de pontos somados', [[0,'Qualquer'],[180,'180+'],[200,'200+'],[220,'220+'],[250,'250+']], st.minTotal, (v) => sync('minTotal', Number(v))),
      select('Margem máxima', [['Infinity','Qualquer'],[3,'Até 3'],[5,'Até 5'],[10,'Até 10'],[20,'Até 20']], st.maxMargin, (v) => sync('maxMargin', v === 'Infinity' ? Infinity : Number(v))),
      input('De', 'date', st.from, (v) => sync('from', v)), input('Até', 'date', st.to, (v) => sync('to', v)),
      select('Ordenar por', [['date','Data'],['total','Pontos somados'],['margin','Margem'],['overtimes','Prorrogações']], st.sort, (v) => sync('sort', v)),
      select('Ordem', [['desc','Recentes / maiores'],['asc','Antigos / menores']], st.direction, (v) => sync('direction', v)));
    update();
    return h('div', { class: 'lab-stack' }, section('Arquivo de partidas', 'Filtros históricos somente sobre jogos carregados da temporada atual. Sem adulterar calendário ou placar.', controls), tally,
      h('div', { class: 'lab-toolbar' }, h('span', { class: 'muted' }, 'Até 100 jogos por página visual, exportação com todos os encontrados.'), button('Exportar jogos CSV', () => downloadRows(rows,
        [{key:'date',label:'Data'},{key:'home',label:'Mandante'},{key:'away',label:'Visitante'},{key:'homeScore',label:'Pontos mandante'},{key:'awayScore',label:'Pontos visitante'}, {key:'margin',label:'Margem'}, {key:'overtimes',label:'Prorrogações'}, {key:'type',label:'Fase'}], 'nba-jogos'))), results);
  };

  const duelTab = () => {
    const ids = [...teams.keys()];
    const st = { a: ids[0], b: ids[1] };
    const aSelect = select('Franquia A', teamOptions(teams).slice(1), st.a, (v) => { st.a = v; update(); });
    const bSelect = select('Franquia B', teamOptions(teams).slice(1), st.b, (v) => { st.b = v; update(); });
    const result = h('div', { class: 'lab-stack' });
    function update() {
      const h2h = headToHead(matches, st.a, st.b);
      mount(result, st.a === st.b ? empty('Selecione duas franquias diferentes.') : h('div', { class: 'lab-stack' },
        h('div', { class: 'lab-duel-score' }, h('div', null, teamLogo(teams.get(st.a), { size: 'lg' }), h('strong', null, teamName(teams, st.a)), h('b', null, h2h.winsA)), h('span', null, 'VITÓRIAS'), h('div', null, teamLogo(teams.get(st.b), { size: 'lg' }), h('strong', null, teamName(teams, st.b)), h('b', null, h2h.winsB))),
        h('div', { class: 'lab-compact-metrics' }, metric('Encontros', h2h.meetings), metric('Jogos apertados', h2h.close), metric('Prorrogações', h2h.ot), metric('Vitórias mandante', h2h.homeWins), metric('Margem média', number(h2h.margin, 1)), metric('Pontos médios A/B', `${number(h2h.pointsA, 1)} / ${number(h2h.pointsB, 1)}`)),
        section('Confrontos registrados', 'Partidas carregadas da temporada atual, da mais recente à mais antiga.',
          h2h.recent.length ? h('div', { class: 'lab-list' }, h2h.recent.map((g) => gameRow(g, teams))) : empty('Ainda não existem partidas concluídas entre estas franquias.'))));
    }
    update();
    return h('div', { class: 'lab-stack' }, section('Confronto direto', 'Sem previsões ou probabilidades inventadas. Os indicadores vêm de jogos finalizados.', h('div', { class: 'lab-controls' }, aSelect, bSelect,
      button('Inverter lados', () => { const t = st.a; st.a = st.b; st.b = t; aSelect.querySelector('select').value = st.a; bSelect.querySelector('select').value = st.b; update(); }))), result);
  };

  const leaderTab = () => {
    const most = Math.max(0, ...stats.map((r) => r.gp));
    const st = { metric: 'pts', minGames: Math.max(1, Math.floor(most * .6)), team: 'all' };
    const results = h('div');
    const controls = h('div', { class: 'lab-controls' });
    let rows = [];
    function update() {
      rows = statLeaders(stats, st.metric, { minGames: st.minGames, team: st.team, limit: 100 });
      const label = STAT_FIELDS.find(([k]) => k === st.metric)?.[2] ?? st.metric;
      mount(results, rows.length ? h('div', { class: 'lab-list' }, rows.slice(0, 40).map((r) => h('a', { class: 'lab-row', href: `#/player/${r.id}` },
        h('span', { class: 'lab-rank' }, String(r.rank).padStart(2, '0')),
        h('span', { class: 'lab-grow' }, h('strong', null, r.name), h('small', null, `${teamName(teams, r.teamId)} · ${r.gp} jogos`)),
        bar(r[st.metric], rows[0][st.metric], `Comparação de ${label}`), h('strong', { class: 'lab-value' }, number(r[st.metric], 1)), h('small', null, label)))) : empty('Ainda não existem estatísticas suficientes para este filtro.'));
    }
    function sync(key, v) { st[key] = v; update(); }
    mount(controls,
      select('Indicador', STAT_FIELDS.map(([key, label, unit]) => [key, `${label} · ${unit}`]), st.metric, (v) => sync('metric', v)),
      select('Franquia', teamOptions(teams), st.team, (v) => sync('team', v)),
      select('Amostra mínima', [[1,'1 jogo'],[3,'3 jogos'],[5,'5 jogos'],[10,'10 jogos'],[20,'20 jogos'],[Math.max(1, Math.floor(most*.6)), '60% do maior número de jogos']]
        .filter(([v], i, arr) => arr.findIndex(([a]) => a === v) === i).map(([v,l]) => [String(v),l]), String(st.minGames), (v) => sync('minGames', Number(v))));
    update();
    return h('div', { class: 'lab-stack' }, section('Líderes estatísticos', 'Dez indicadores calculados da temporada carregada. A amostra mínima evita líderes com pouquíssimos jogos.', controls),
      h('div', { class: 'lab-toolbar' }, h('span', { class: 'muted' }, `${stats.length} atletas com jogos registrados`), button('Exportar líderes CSV', () => downloadRows(rows,
        [{key:'rank',label:'Posição'},{key:'name',label:'Jogador'},{key:'teamId',label:'Time'},{key:'gp',label:'Jogos'},{key:st.metric,label:st.metric.toUpperCase()}], 'nba-lideres'))), results);
  };

  const renderTab = () => {
    mount(menu, TABS.map(([id, title, sub]) => button(title, () => { if (state.tab !== id) { state.tab = id; renderTab(); } }, `lab-tab ${state.tab === id ? 'lab-active' : ''}`)));
    [...menu.children].forEach((b, i) => { b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(TABS[i][0] === state.tab)); b.setAttribute('aria-controls', 'lab-panel'); b.tabIndex = TABS[i][0] === state.tab ? 0 : -1; });
    if (!panes.has(state.tab)) panes.set(state.tab, ({ painel: overview, scout, dna: dnaTab, equipes: teamsTab, jogos: gamesTab, duelos: duelTab, lideres: leaderTab })[state.tab]());
    mount(content, panes.get(state.tab));
  };
  menu.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const cur = TABS.findIndex(([id]) => id === state.tab);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (cur + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
    state.tab = TABS[next][0]; renderTab(); menu.children[next].focus();
  });
  renderTab();
  return h('div', { class: 'page lab-page' },
    pageHeader('NBA Data Studio', { sub: 'Evolution 11–100 · análise avançada e exploração visual dos dados existentes. Modo somente leitura.' }),
    h('section', { class: 'lab-hero' }, h('p', { class: 'lab-kicker' }, 'THE LEAGUE / INTELLIGENCE CENTER'),
      h('h2', null, 'Encontre padrões. Conheça a liga.'),
      h('p', null, 'Scouting, franquias, resultados, confrontos e estatísticas em um centro de análise que não altera a simulação.'),
      h('div', { class: 'lab-hero-figures' }, metric('Jogadores', athletes.length), metric('Franquias', franchises.length), metric('Jogos no recorte', matches.length))),
    menu, content,
    h('footer', { class: 'lab-footer' }, h('strong', null, 'Plano Evolution 11–100'),
      h('p', null, 'Nove frentes de evolução com testes, filtros, métricas, exportação e visualização; cada etapa não implica a criação de um sistema de gestão.'),
      h('div', { class: 'lab-milestones' }, LAB_STAGES.map(([id, title, detail]) => h('div', null, h('strong', null, `E${id}: ${title}`), h('small', null, detail))))));
}

function gameRow(g, teams) {
  return h('a', { class: 'lab-game-row', href: `#/game/${g.id}` },
    h('span', { class: 'lab-date' }, g.date),
    h('span', { class: 'lab-grow' }, `${teamName(teams, g.away)} @ ${teamName(teams, g.home)}`),
    h('strong', { class: 'lab-score' }, g.status === 'final' ? `${g.awayScore} : ${g.homeScore}` : 'A disputar'),
    g.overtimes > 0 ? h('span', { class: 'lab-ot' }, `${g.overtimes} OT`) : null,
    h('small', { class: 'lab-tag' }, g.type === 'regular' ? 'Temporada' : g.type));
}
