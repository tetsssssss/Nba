// Observados: jogadores que o usuário marcou com a estrela.
import { h, icon } from '../dom.js';
import { money } from '../format.js';
import { navigate } from '../router.js';
import { emptyState, favStar, ovrBadge, pageHeader, playerCell, posLabel, statusBadge, teamCell } from '../components/widgets.js';
import { dataTable } from '../components/table.js';
import { openPlayerQuick } from '../components/player-quick.js';
import { getWorld, playerAge } from '../../core/world.js';
import { watchedIds } from '../../core/watchlist.js';
import { contractSummary, salaryIn, seasonLabel } from '../../contracts/cap.js';
import { POSITIONS } from '../../players/attributes.js';

export function watchlistView() {
  const { players, teams, contracts, calendar } = getWorld();
  const rows = watchedIds().map((id) => players.get(id)).filter(Boolean);
  if (!rows.length) {
    return h('div', { class: 'page' }, pageHeader('Observados'), h('section', { class: 'card' }, emptyState('Nenhum jogador observado', 'Marque a estrela ao lado de um jogador — no elenco, na lista da liga ou no perfil — para acompanhá-lo aqui.', h('a', { class: 'btn primary', href: '#/players' }, 'Procurar jogadores'))));
  }
  const table = dataTable(
    [
      { key: 'name', label: 'Jogador', sort: (p) => p.lastName, defaultDir: 'asc', render: (p) => playerCell(p) },
      { key: 'team', label: 'Time', sort: (p) => teams.get(p.teamId)?.fullName ?? 'zzz', defaultDir: 'asc', render: (p) => teamCell(teams.get(p.teamId), { size: 'xs', full: false }) },
      { key: 'pos', label: 'Pos', sort: (p) => POSITIONS.indexOf(p.positions[0]), defaultDir: 'asc', render: (p) => posLabel(p.positions) },
      { key: 'age', label: 'Idade', align: 'num', sort: (p) => playerAge(p), render: (p) => playerAge(p) ?? '—' },
      { key: 'ovr', label: 'OVR', align: 'center', sort: (p) => p.ovr, render: (p) => ovrBadge(p.ovr) },
      { key: 'pot', label: 'POT', align: 'center', sort: (p) => p.potential, render: (p) => ovrBadge(p.potential, { ghost: true }) },
      { key: 'salary', label: 'Salário', align: 'num', sort: (p) => salaryIn(contracts.get(p.id), calendar.season), render: (p) => money(salaryIn(contracts.get(p.id), calendar.season)) },
      { key: 'until', label: 'Contrato', align: 'num', sort: (p) => contractSummary(contracts.get(p.id), calendar.season)?.endSeason, render: (p) => { const s = contractSummary(contracts.get(p.id), calendar.season); return s?.endSeason ? seasonLabel(s.endSeason) : '—'; } },
      { key: 'status', label: 'Condição', render: (p) => statusBadge(p) ?? h('span', { class: 'good small' }, 'Disponível') },
      { key: 'fav', label: '', width: '34px', render: (p) => favStar(p) },
    ],
    { rows, sortKey: 'ovr', stateKey: 'watchlist', pinFirst: 1, onRowClick: openPlayerQuick },
  );
  const compare = rows.length >= 2 ? h('button', { class: 'btn', type: 'button', onclick: () => navigate(`/compare?ids=${rows.slice(0, 4).map((p) => p.id).join(',')}`) }, icon('compare'), rows.length > 4 ? 'Comparar os 4 primeiros' : 'Comparar todos') : null;
  return h('div', { class: 'page' }, pageHeader('Observados', { sub: `${rows.length} jogador(es) acompanhados nesta carreira.`, actions: compare }), h('section', { class: 'card flush' }, table.el));
}
