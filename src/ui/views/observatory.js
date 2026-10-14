// Evolution 06: centro de dados do universo, estritamente de leitura.
import { h, mount } from '../dom.js';
import { getWorld, playerAge } from '../../core/world.js';
import { teamLogo, playerAvatar } from '../../media/photos.js';
import { leagueLeaders, teamLandscape } from '../experience-insights.js';
import { pageHeader, card } from '../components/widgets.js';

const MODES = [
  ['ovr', 'Melhores agora', 'OVR'],
  ['potential', 'Maior potencial', 'POT'],
];

function playerGrid(people, teams) {
  return h('div', { class: 'evo-ranking', role: 'list' }, people.map((row) => {
    const team = teams.get(row.teamId);
    return h('a', { href: `#/player/${row.id}`, class: 'evo-ranking-row', role: 'listitem', style: { '--evo-accent': team?.colors?.[0] ?? 'var(--team)' } },
      h('span', { class: 'evo-rank-num' }, String(row.rank).padStart(2, '0')),
      h('span', { class: 'evo-rank-photo' }, playerAvatar({ id: row.id, name: row.name, teamId: row.teamId }, { size: 'sm' })),
      h('span', { class: 'evo-rank-identity' }, h('strong', null, row.name), h('small', null, team?.fullName ?? 'Sem franquia')),
      h('span', { class: 'evo-rank-value' }, row.value),
    );
  }));
}

export function observatoryView() {
  const world = getWorld();
  const allPlayers = [...world.players.values()];
  const teams = [...world.teams.values()];
  const landscape = teamLandscape(teams, allPlayers);
  const state = { mode: 'ovr', conference: 'all', search: '' };
  const controls = h('div', { class: 'evo-lab-controls' });
  const ranking = h('div', { class: 'evo-lab-results' });
  const count = h('p', { class: 'muted small', 'aria-live': 'polite' });
  const search = h('input', { type: 'search', class: 'league-search', placeholder: 'Filtrar atletas ou equipes…', 'aria-label': 'Filtrar jogadores do observatório', oninput: (e) => { state.search = e.target.value; render(); } });
  const conference = h('select', { class: 'league-sort', 'aria-label': 'Conferência no observatório', onchange: (e) => { state.conference = e.target.value; render(); } },
    [['all', 'Toda a liga'], ['East', 'Leste'], ['West', 'Oeste']].map(([key, label]) => h('option', { value: key }, label)));
  const options = MODES.map(([key, label]) => h('button', { type: 'button', class: 'league-filter-btn', 'aria-pressed': String(key === state.mode), onclick: () => { state.mode = key; render(); } }, label));
  mount(controls, h('div', { class: 'league-filter-tabs' }, options), h('div', { class: 'league-filter-tools' }, search, conference));

  function render() {
    const needle = state.search.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const matches = allPlayers.filter((p) => {
      const team = world.teams.get(p.teamId);
      if (state.conference !== 'all' && team?.conference !== state.conference) return false;
      return !needle || `${p.name} ${team?.fullName ?? ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(needle);
    });
    const leaders = leagueLeaders(matches, state.mode, 30);
    count.textContent = `${matches.length} atletas no recorte · mostrando até ${leaders.length}`;
    options.forEach((button, i) => button.setAttribute('aria-pressed', String(MODES[i][0] === state.mode)));
    mount(ranking, leaders.length ? playerGrid(leaders, world.teams) : h('p', { class: 'muted' }, 'Nenhum atleta corresponde aos filtros.'));
  }
  render();

  const leaders = landscape.filter((row) => row.strength != null).slice(0, 8);
  const topTeams = h('div', { class: 'evo-team-grid' }, leaders.map((row, i) => h('a', { class: 'evo-team-card', href: `#/team/${row.id}`, style: { '--evo-accent': row.team.colors[0] } },
    h('div', { class: 'evo-team-head' }, h('span', { class: 'micro faint' }, `#${i + 1} · NÚCLEO`), teamLogo(row.team, { size: 'sm' })),
    h('strong', null, row.team.fullName),
    h('div', { class: 'evo-team-strength' }, h('strong', null, Math.round(row.strength)), h('span', null, 'OVR médio dos 5 líderes')),
    h('div', { class: 'evo-team-track' }, h('i', { style: { width: `${row.strength}%` } })),
    h('small', null, `${row.athletes} jogadores no elenco`),
  )));

  return h('div', { class: 'page evo-lab' },
    pageHeader('Observatório da Liga', { sub: 'Explore talentos e núcleos de franquias com dados reais do universo. Somente leitura.' }),
    h('section', { class: 'evo-lab-hero' },
      h('span', { class: 'evo-kicker' }, 'NBA / DATA DESK'),
      h('h2', null, 'A liga em perspectiva.'),
      h('p', null, 'Rankings de atributos e força de elenco, sem previsões fabricadas nem alterações na carreira.'),
      h('div', { class: 'evo-lab-metrics' },
        h('span', null, h('strong', null, teams.length), h('small', null, 'Franquias')),
        h('span', null, h('strong', null, allPlayers.length), h('small', null, 'Atletas')),
        h('span', null, h('strong', null, allPlayers.filter((p) => playerAge(p) < 25).length), h('small', null, 'Com menos de 25 anos')))),
    h('section', { class: 'stack' }, h('div', { class: 'evo-section-heading' }, h('h2', null, 'Núcleos mais fortes'), h('small', null, 'Média aritmética dos cinco atletas com maior OVR de cada franquia.')), topTeams),
    card('Radar de talentos', h('div', { class: 'stack' }, controls, count, ranking)));
}
