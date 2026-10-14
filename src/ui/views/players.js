// Banco de jogadores da liga: busca, filtros, ordenação e paginação.
import { h } from '../dom.js';
import { height, money } from '../format.js';
import { parseHash, setQuery } from '../router.js';
import { favStar, ovrBadge, pageHeader, playerCell, posLabel, segmented, statusBadge, teamCell } from '../components/widgets.js';
import { openPlayerQuick } from '../components/player-quick.js';
import { dataTable } from '../components/table.js';
import { normalizeSearch } from '../search.js';
import { getWorld, playerAge } from '../../core/world.js';
import { getSetting } from '../../core/settings.js';
import { contractSummary, salaryIn, seasonLabel } from '../../contracts/cap.js';
import { POSITIONS } from '../../players/attributes.js';

const STATUS = [
  ['', 'Todos os vínculos'],
  ['standard', 'Contrato padrão'],
  ['two-way', 'Two-way'],
  ['camp', 'Training camp'],
  ['injured', 'Lesionados'],
  ['rookie', 'Novatos'],
  ['expiring', 'Último ano de contrato'],
];

export function playersView() {
  const world = getWorld();
  const { contracts, calendar, teams } = world;
  const all = [...world.players.values()];
  const q = parseHash().query;
  const filters = { text: q.get('q') ?? '', team: q.get('time') ?? '', pos: q.get('pos') ?? '', status: q.get('status') ?? '', maxAge: q.get('idade') ?? '' };
  const summary = h('span', { class: 'muted' });

  const table = dataTable(
    [
      { key: 'rank', label: '#', align: 'num', width: '44px', render: (_, i) => h('span', { class: 'faint' }, i + 1) },
      {
        key: 'name', label: 'Jogador', sort: (p) => p.lastName, defaultDir: 'asc',
        render: (p) => h('div', { class: 'row' }, playerCell(p, { sub: p.country }), statusBadge(p)),
      },
      { key: 'team', label: 'Time', sort: (p) => teams.get(p.teamId)?.fullName ?? 'zzz', defaultDir: 'asc', render: (p) => teamCell(teams.get(p.teamId), { size: 'xs', full: false }) },
      { key: 'pos', label: 'Pos', sort: (p) => POSITIONS.indexOf(p.positions[0]), defaultDir: 'asc', render: (p) => posLabel(p.positions) },
      { key: 'age', label: 'Idade', align: 'num', sort: (p) => playerAge(p), render: (p) => playerAge(p) ?? '—' },
      { key: 'height', label: 'Altura', align: 'num col-secondary', sort: (p) => p.heightIn, render: (p) => height(p.heightIn) },
      { key: 'ovr', label: 'OVR', align: 'center', tip: 'Overall na posição natural principal.', sort: (p) => p.ovr, render: (p) => ovrBadge(p.ovr) },
      { key: 'pot', label: 'POT', align: 'center', tip: 'Potencial estimado (dinâmico).', sort: (p) => p.potential, render: (p) => ovrBadge(p.potential, { ghost: true }) },
      { key: 'salary', label: 'Salário', align: 'num', sort: (p) => salaryIn(contracts.get(p.id), calendar.season), render: (p) => money(salaryIn(contracts.get(p.id), calendar.season)) },
      {
        key: 'until', label: 'Contrato até', align: 'num', sort: (p) => contractSummary(contracts.get(p.id), calendar.season)?.endSeason,
        render: (p) => {
          const s = contractSummary(contracts.get(p.id), calendar.season);
          return s?.endSeason ? seasonLabel(s.endSeason) : '—';
        },
      },
      { key: 'fav', label: '', width: '34px', render: (p) => favStar(p) },
    ],
    { rows: [], sortKey: 'ovr', pageSize: getSetting('playersPageSize'), stateKey: 'players', pinFirst: 2, onRowClick: openPlayerQuick, emptyText: 'Nenhum jogador corresponde a esses filtros. Ajuste ou limpe os filtros acima.' },
  );

  let first = true;
  function apply() {
    const text = normalizeSearch(filters.text);
    const maxAge = Number(filters.maxAge) || null;
    const rows = all.filter((p) => {
      if (text && !normalizeSearch(p.name).includes(text)) return false;
      if (filters.team && p.teamId !== filters.team) return false;
      if (filters.pos && !p.positions.includes(filters.pos)) return false;
      if (maxAge && (playerAge(p) ?? 99) > maxAge) return false;
      switch (filters.status) {
        case 'injured': return Boolean(p.injury);
        case 'rookie': return p.rookie;
        case 'expiring': return Boolean(contractSummary(contracts.get(p.id), calendar.season)?.expiring);
        case '': return true;
        default: return p.rosterStatus === filters.status;
      }
    });
    table.setRows(rows, { keepPage: first }); // ao voltar para a lista, a página é preservada
    first = false;
    summary.textContent = `${rows.length} de ${all.length} jogadores`;
    setQuery({ q: filters.text, time: filters.team, pos: filters.pos, status: filters.status, idade: filters.maxAge });
  }

  const select = (key, options) => h('select', { onchange: (e) => ((filters[key] = e.target.value), apply()) }, options.map(([value, label]) => h('option', { value, selected: filters[key] === value }, label)));
  const teamOptions = [['', 'Todas as franquias'], ...[...teams.values()].sort((a, b) => a.fullName.localeCompare(b.fullName)).map((t) => [t.id, t.fullName])];
  let debounce = null;

  const toolbar = h(
    'div',
    { class: 'toolbar' },
    h('input', { type: 'search', placeholder: 'Buscar por nome…', 'aria-label': 'Buscar jogador por nome', value: filters.text, style: { width: '240px' }, oninput: (e) => ((filters.text = e.target.value), clearTimeout(debounce), (debounce = setTimeout(apply, 140))) }),
    select('team', teamOptions),
    segmented([['', 'Todas'], ...POSITIONS.map((p) => [p, p])], filters.pos, (v) => ((filters.pos = v), apply()), { label: 'Filtrar por posição' }),
    select('status', STATUS),
    h('input', { type: 'number', min: 18, max: 45, placeholder: 'Idade máx.', 'aria-label': 'Idade máxima', value: filters.maxAge, style: { width: '110px' }, oninput: (e) => ((filters.maxAge = e.target.value), apply()) }),
    h('button', { class: 'btn ghost', onclick: () => (Object.assign(filters, { text: '', team: '', pos: '', status: '', maxAge: '' }), (location.hash = '#/players')) }, 'Limpar'),
    h('span', { class: 'grow' }),
    summary,
  );

  apply();
  return h(
    'div',
    { class: 'page' },
    pageHeader('Jogadores', { sub: 'Todos os jogadores do universo. Clique em uma linha para a ficha rápida; a estrela adiciona aos observados.' }),
    toolbar,
    h('section', { class: 'card flush' }, table.el),
  );
}
