// Explorador visual da liga: dados apenas de leitura, sem tocar na gestão de carreira.
import { h, mount } from '../dom.js';
import { CONFERENCE_LABEL, money, record } from '../format.js';
import { card, chip, ovrBadge, playerCell, teamCell } from '../components/widgets.js';
import { dataTable } from '../components/table.js';
import { teamLogo } from '../../media/photos.js';
import { getWorld, payrollOf, playerAge, teamRoster } from '../../core/world.js';
import { CAP_STATUS_LABEL } from '../../contracts/cap.js';
import { filterFranchises, franchiseSnapshot } from '../presentation-insights.js';

const STATUS_KIND = { 'under-cap': 'good', 'over-cap': '', tax: 'warn', 'first-apron': 'warn', 'second-apron': 'bad' };
const DIVISION_ORDER = ['Atlantic', 'Mid-Atlantic', 'Central', 'Southeast', 'Northwest', 'Mountain', 'Pacific', 'Southwest'];
const OPTIONS = [['strength', 'Força do núcleo'], ['name', 'Nome'], ['wins', 'Vitórias'], ['age', 'Idade média'], ['payroll', 'Folha salarial']];

export function leagueView() {
  const world = getWorld();
  const teams = [...world.teams.values()];
  const snapshot = franchiseSnapshot(teams, teamRoster, payrollOf, playerAge);
  const info = new Map(snapshot.rows.map((r) => [r.team.id, r]));

  const comparison = dataTable(
    [
      { key: 'team', label: 'Franquia', sort: (t) => t.fullName, defaultDir: 'asc', render: (t) => teamCell(t, { sub: `${CONFERENCE_LABEL[t.conference]} · ${t.division}` }) },
      { key: 'strength', label: 'Núcleo', align: 'center', tip: 'Média ponderada dos 8 melhores jogadores.', sort: (t) => info.get(t.id).strength, render: (t) => info.get(t.id).strength != null ? ovrBadge(Math.round(info.get(t.id).strength)) : '—' },
      { key: 'star', label: 'Principal jogador', render: (t) => info.get(t.id).roster[0] ? playerCell(info.get(t.id).roster[0], { size: 'xs', sub: `${info.get(t.id).roster[0].positions[0]} · ${info.get(t.id).roster[0].ovr} OVR` }) : h('span', { class: 'muted' }, '—') },
      { key: 'last', label: '2025-26', align: 'num', sort: (t) => t.lastSeason?.wins, render: (t) => t.lastSeason ? record(t.lastSeason) : '—' },
      { key: 'roster', label: 'Elenco', align: 'num', sort: (t) => info.get(t.id).roster.length, render: (t) => info.get(t.id).roster.length },
      { key: 'age', label: 'Idade média', align: 'num', sort: (t) => info.get(t.id).avgAge, render: (t) => info.get(t.id).avgAge != null ? info.get(t.id).avgAge.toFixed(1) : '—' },
      { key: 'payroll', label: 'Folha', align: 'num', sort: (t) => info.get(t.id).payroll.total, render: (t) => money(info.get(t.id).payroll.total) },
      { key: 'cap', label: 'Situação', sort: (t) => info.get(t.id).payroll.total, render: (t) => chip(CAP_STATUS_LABEL[info.get(t.id).payroll.status], STATUS_KIND[info.get(t.id).payroll.status]) },
      { key: 'titles', label: 'Títulos', align: 'num', sort: (t) => t.championships.length, render: (t) => t.championships.length },
      { key: 'market', label: 'Mercado', align: 'num', tip: 'Índice do jogo (0-100).', sort: (t) => t.market, render: (t) => t.market },
    ],
    { rows: teams, sortKey: 'strength', onRowClick: (t) => (location.hash = `#/team/${t.id}`) },
  );

  const conference = (name) => {
    const divisions = [...new Set(teams.filter((t) => t.conference === name).map((t) => t.division))]
      .sort((a, b) => DIVISION_ORDER.indexOf(a) - DIVISION_ORDER.indexOf(b));
    const sections = divisions.map((division) => {
      const links = teams.filter((t) => t.conference === name && t.division === division)
        .sort((a, b) => (info.get(b.id).strength ?? 0) - (info.get(a.id).strength ?? 0))
        .map((t) => h('a', { class: ['team-tile', t.id === world.career.teamId && 'selected'], href: `#/team/${t.id}`, style: { '--c1': t.colors[0] } },
          teamLogo(t, { size: 'md' }),
          h('span', { class: 'grow' }, h('span', { class: 'name' }, t.fullName),
            h('small', null, t.lastSeason ? `${record(t.lastSeason)} em 2025-26 · ${t.lastSeason.playoffs}` : 'Franquia de expansão')),
          info.get(t.id).strength != null ? ovrBadge(Math.round(info.get(t.id).strength)) : chip('Sem elenco', 'info')));
      return card(division, h('div', { class: 'stack', style: { gap: '6px' } }, links));
    });
    return h('div', { class: 'stack' }, h('h2', null, `Conferência ${CONFERENCE_LABEL[name]}`), sections);
  };

  const filters = { search: '', conference: 'all', order: 'strength' };
  const gallery = h('div', { class: 'league-gallery', role: 'list', 'aria-label': 'Franquias filtradas' });
  const count = h('span', { class: 'league-filter-count', 'aria-live': 'polite' });
  const buttons = ['all', 'East', 'West'].map((value) => h('button', {
    type: 'button', class: 'league-filter-btn', 'aria-pressed': value === filters.conference ? 'true' : 'false',
    onclick: () => { filters.conference = value; update(); },
  }, value === 'all' ? 'Toda a liga' : `Conferência ${CONFERENCE_LABEL[value]}`));

  function tile(row) {
    const { team, roster, strength, avgAge } = row;
    const selected = team.id === world.career.teamId;
    return h('a', { class: ['league-card', selected && 'is-selected'], href: `#/team/${team.id}`,
      role: 'listitem', style: { '--club-color': team.colors[0] }, 'aria-label': `Abrir ${team.fullName}` },
      h('div', { class: 'league-card-top' },
        h('div', { class: 'league-logo' }, teamLogo(team, { size: 'lg' })),
        h('span', { class: 'league-card-conference' }, `${CONFERENCE_LABEL[team.conference]} · ${team.division}`)),
      h('strong', { class: 'league-card-name' }, team.fullName),
      h('div', { class: 'league-card-foot' },
        h('span', null, h('small', null, 'NÚCLEO'), h('strong', null, strength != null ? String(Math.round(strength)) : '—')),
        h('span', null, h('small', null, 'ATLETAS'), h('strong', null, String(roster.length))),
        h('span', null, h('small', null, 'IDADE MÉDIA'), h('strong', null, avgAge != null ? avgAge.toFixed(1) : '—'))),
      h('div', { class: 'league-strength-track', role: 'img', 'aria-label': strength != null ? `Força do núcleo: ${Math.round(strength)} de 100` : 'Força indisponível' },
        h('span', { style: { width: `${Math.max(0, Math.min(100, strength ?? 0))}%` } })),
      selected ? h('span', { class: 'league-card-you' }, 'Sua franquia') : null,
    );
  }
  function update() {
    buttons.forEach((b, i) => { const yes = ['all', 'East', 'West'][i] === filters.conference; b.setAttribute('aria-pressed', String(yes)); });
    const rows = filterFranchises(snapshot.rows, filters);
    count.textContent = `${rows.length} de ${snapshot.teams} franquias`;
    mount(gallery, rows.length ? rows.map(tile) : h('div', { class: 'league-empty', role: 'status' }, 'Nenhuma franquia corresponde à busca. Experimente outro nome ou conferência.'));
  }
  const search = h('input', { type: 'search', class: 'league-search', placeholder: 'Buscar franquia ou divisão',
    'aria-label': 'Buscar franquia ou divisão', oninput: (e) => { filters.search = e.target.value; update(); } });
  const order = h('select', { class: 'league-sort', 'aria-label': 'Ordenar franquias', onchange: (e) => { filters.order = e.target.value; update(); } }, OPTIONS.map(([value, label]) => h('option', { value }, label)));

  const explorer = h('section', { class: 'league-explorer', 'aria-label': 'Explorador da liga' },
    h('div', { class: 'league-intro' },
      h('div', null, h('span', { class: 'league-eyebrow' }, 'GUIA DE FRANQUIAS'), h('h2', null, 'Uma liga. 32 histórias.'),
        h('p', null, 'Explore os elencos, compare a força atual dos núcleos e encontre rapidamente uma equipe.')),
      h('div', { class: 'league-quick-stats' },
        h('span', null, h('strong', null, snapshot.teams), h('small', null, 'FRANQUIAS')),
        h('span', null, h('strong', null, snapshot.athletes), h('small', null, 'ATLETAS')))),
    h('div', { class: 'league-filterbar' },
      h('div', { class: 'league-filter-tabs', role: 'group', 'aria-label': 'Filtrar conferência' }, buttons),
      h('div', { class: 'league-filter-tools' }, search, order)),
    count, gallery,
    h('p', { class: 'league-caption' }, 'Força do núcleo: média ponderada dos oito jogadores de maior overall. Indicador de elenco, não previsão de vitórias.'),
  );
  update();

  return h('div', { class: 'page league-page' },
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Franquias'),
      h('p', { class: 'sub' }, 'Panorama visual de todas as equipes, com elenco, núcleo e dados comparativos.'))),
    explorer,
    h('details', { class: 'league-divisions' }, h('summary', null, 'Explorar por divisão', h('span', null, 'As oito divisões organizadas por conferência')),
      h('div', { class: 'grid cols-2' }, conference('East'), conference('West'))),
    h('div', { class: 'league-table-head' }, h('h2', null, 'Comparativo completo'), h('p', null, 'Clique nos cabeçalhos para ordenar. Selecione uma equipe para abrir sua ficha.')),
    h('section', { class: 'card flush league-comparison' }, comparison.el),
  );
}
