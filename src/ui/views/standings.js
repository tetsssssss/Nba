// Classificação por conferência, com as zonas de playoff e play-in marcadas em texto, e líderes da temporada.
import { h } from '../dom.js';
import { CONFERENCE_LABEL, number } from '../format.js';
import { parseHash, setQuery } from '../router.js';
import { card, emptyState, pageHeader, teamCell } from '../components/widgets.js';
import { tabView } from '../components/feedback.js';
import { openPlayerQuick } from '../components/player-quick.js';
import { playerAvatar } from '../../media/photos.js';
import { getWorld } from '../../core/world.js';
import { seasonLabel } from '../../contracts/cap.js';
import { leaders, seasonGames, standings } from '../../season/season.js';

const ZONE = { playoff: 'Playoffs — 1º ao 6º', playin: 'Play-in — 7º ao 10º', out: 'Fora da zona de classificação' };
const pair = ([w, l]) => `${w}-${l}`;

export function conferenceTable(rows, userTeamId, { compact = false } = {}) {
  const world = getWorld();
  const cols = compact ? ['#', 'Time', 'V', 'D', '%', 'GB'] : ['#', 'Time', 'V', 'D', '%', 'GB', 'Casa', 'Fora', 'Conf', 'L10', 'Seq', 'Saldo'];
  const body = [];
  let zone = null;
  for (const r of rows) {
    if (r.zone !== zone && !compact) {
      zone = r.zone;
      body.push(h('tr', { class: 'group' }, h('td', { colSpan: cols.length }, ZONE[zone])));
    }
    const streak = r.streak === 0 ? '—' : `${r.streak > 0 ? 'V' : 'D'}${Math.abs(r.streak)}`;
    body.push(
      h(
        'tr',
        { class: [r.id === userTeamId && 'selected', compact && r.seed === 6 && 'cut', compact && r.seed === 10 && 'cut'] },
        h('td', { class: 'num faint' }, r.seed),
        h('td', null, teamCell(world.teams.get(r.id), { size: 'xs', full: !compact })),
        h('td', { class: 'num strong' }, r.w),
        h('td', { class: 'num' }, r.l),
        h('td', { class: 'num' }, r.gp ? r.pct.toFixed(3).replace('0.', '.') : '—'),
        h('td', { class: 'num muted' }, r.gb ? number(r.gb, r.gb % 1 ? 1 : 0) : '—'),
        compact ? null : [h('td', { class: 'num col-secondary' }, pair(r.home)), h('td', { class: 'num col-secondary' }, pair(r.away)), h('td', { class: 'num col-secondary' }, pair(r.conf)), h('td', { class: 'num' }, pair(r.l10)), h('td', { class: ['num', r.streak >= 3 && 'good', r.streak <= -3 && 'bad'] }, streak), h('td', { class: 'num muted' }, r.gp ? `${r.diff > 0 ? '+' : ''}${number(r.diff)}` : '—')],
      ),
    );
  }
  return h('div', { class: 'table-wrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, cols.map((c, i) => h('th', { class: [i !== 1 && 'num', i > 5 && i < 9 && 'col-secondary'] }, c)))), h('tbody', null, body)));
}

const LEADER_STATS = [['pts', 'Pontos', 'PPG'], ['reb', 'Rebotes', 'RPG'], ['ast', 'Assistências', 'APG'], ['stl', 'Roubos', 'SPG'], ['blk', 'Tocos', 'BPG'], ['tpm', 'Bolas de 3', '3PM']];

function leadersTab() {
  const world = getWorld();
  if (!world.seasonStats.size) return card(null, emptyState('Ainda não há estatísticas', 'Os líderes aparecem depois dos primeiros jogos da temporada regular.'));
  return h(
    'div',
    { class: 'grid cols-3' },
    LEADER_STATS.map(([key, label, abbr]) =>
      card(
        label,
        h(
          'div',
          { class: 'leader-list' },
          leaders(key, 5).map((l, i) =>
            h(
              'button',
              { type: 'button', class: ['leader-row', i === 0 && 'first'], onclick: () => openPlayerQuick(l.player) },
              h('span', { class: 'num faint' }, i + 1),
              playerAvatar(l.player, { size: i === 0 ? 'md' : 'sm', color: world.teams.get(l.player.teamId)?.colors[0] }),
              h('span', { class: 'grow' }, h('strong', null, l.player.name), h('small', { class: 'muted' }, `${world.teams.get(l.player.teamId)?.id ?? '—'} · ${l.stats.gp} jogos`)),
              h('span', { class: 'leader-value' }, number(l.value), h('small', null, abbr)),
            ),
          ),
        ),
      ),
    ),
  );
}

export function standingsView() {
  const world = getWorld();
  const table = standings();
  const played = seasonGames().filter((g) => g.status === 'final').length;
  const total = seasonGames().length;
  const userConf = world.teams.get(world.career.teamId).conference;
  const order = userConf === 'West' ? ['West', 'East'] : ['East', 'West'];
  const tabs = [
    { id: 'conferencias', label: 'Conferências', render: () => h('div', { class: 'grid cols-2' }, order.map((c) => card(`Conferência ${CONFERENCE_LABEL[c]}`, conferenceTable(table.conferences[c], world.career.teamId), { flush: true }))) },
    { id: 'lideres', label: 'Líderes', render: leadersTab },
  ];
  return h(
    'div',
    { class: 'page' },
    pageHeader('Classificação', { sub: played ? `Temporada ${seasonLabel(world.calendar.season)} · ${played} de ${total} jogos disputados. Seis primeiros de cada conferência vão aos playoffs; do 7º ao 10º, ao play-in.` : `Temporada ${seasonLabel(world.calendar.season)} · a temporada regular começa em ${world.league.calendar.regularSeasonStart.split('-').reverse().join('/')}.` }),
    tabView(tabs, { active: parseHash().query.get('tab') ?? 'conferencias', onChange: (tab) => setQuery({ tab: tab === 'conferencias' ? null : tab }) }),
  );
}
