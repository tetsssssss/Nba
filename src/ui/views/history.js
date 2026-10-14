// História da liga: campeões, a temporada anterior ao universo e os últimos drafts.
import { h } from '../dom.js';
import { parseHash, setQuery } from '../router.js';
import { card, futureBox, ovrBadge, playerCell, teamCell } from '../components/widgets.js';
import { tabView } from '../components/feedback.js';
import { teamLogo } from '../../media/photos.js';
import { getWorld } from '../../core/world.js';
import { seasonLabel } from '../../contracts/cap.js';

function championsTab(world) {
  const { champions } = world.history;
  const count = new Map();
  for (const c of champions) count.set(c.teamId, (count.get(c.teamId) ?? 0) + 1);
  const ranking = [...count.entries()].sort((a, b) => b[1] - a[1]);
  return h(
    'div',
    { class: 'grid cols-2' },
    card(
      'Campeões por temporada',
      h(
        'div',
        { class: 'list', style: { maxHeight: '640px', overflowY: 'auto' } },
        [...champions].reverse().map((c) => h('div', { class: 'item', style: { padding: '6px 0' } }, h('strong', { class: 'num', style: { minWidth: '70px' } }, seasonLabel(c.year)), h('div', { class: 'grow' }, teamCell(world.teams.get(c.teamId), { size: 'xs' })), c.opponent ? h('span', { class: 'faint', style: { fontSize: '12px' } }, `vs ${c.opponent}`) : null)),
      ),
    ),
    h(
      'div',
      { class: 'stack' },
      card('Títulos por franquia', h('div', { class: 'list' }, ranking.map(([id, n]) => h('div', { class: 'item', style: { padding: '6px 0' } }, h('div', { class: 'grow' }, teamCell(world.teams.get(id), { size: 'xs' })), h('strong', { class: 'num' }, n))))),
      h('div', { class: 'note' }, 'Títulos conquistados pelas franquias atuais, segundo o cadastro oficial da NBA. O título de 1979 pertence ao Seattle SuperSonics, que recuperou sua história ao retornar à liga; o Thunder conserva apenas o que conquistou em Oklahoma City.'),
    ),
  );
}

function lastSeasonTab(world) {
  const last = world.history.lastSeason;
  const team = (abbr) => world.teams.get(abbr);
  const rounds = [...new Set(last.playoffSeries.map((s) => s.round))].reverse();
  const standings = [...world.teams.values()].filter((t) => t.lastSeason).sort((a, b) => b.lastSeason.wins - a.lastSeason.wins);
  return h(
    'div',
    { class: 'grid cols-2' },
    h(
      'div',
      { class: 'stack' },
      last.champion
        ? h(
            'div',
            { class: 'hero-card', style: { '--c1': team(last.champion).colors[0], '--c2': team(last.champion).colors[1], marginBottom: 0 } },
            teamLogo(team(last.champion), { size: 'lg' }),
            h('div', null, h('div', { class: 'title' }, `${team(last.champion).fullName}`), h('div', { class: 'subtitle' }, `Campeão da NBA ${last.label} · ${last.finalsScore} sobre o ${team(last.runnerUp)?.fullName ?? last.runnerUp}`)),
          )
        : null,
      rounds.map((round) =>
        card(
          round,
          h(
            'div',
            { class: 'list' },
            last.playoffSeries.filter((s) => s.round === round).map((s) => h('div', { class: 'item', style: { padding: '7px 0' } }, h('div', { class: 'grow' }, teamCell(team(s.winner), { size: 'xs' })), h('strong', { class: 'num' }, s.score), h('div', { class: 'grow', style: { opacity: 0.6 } }, teamCell(team(s.loser), { size: 'xs' })))),
          ),
        ),
      ),
    ),
    card(
      `Temporada regular ${last.label}`,
      h(
        'table',
        { class: 'data' },
        h('thead', null, h('tr', null, h('th', { class: 'num' }, '#'), h('th', null, 'Franquia'), h('th', { class: 'num' }, 'V'), h('th', { class: 'num' }, 'D'), h('th', { class: 'num' }, 'Pts'), h('th', { class: 'num' }, 'Sofridos'), h('th', null, 'Playoffs'))),
        h(
          'tbody',
          null,
          standings.map((t, i) =>
            h('tr', null, h('td', { class: 'num faint' }, i + 1), h('td', null, teamCell(t, { size: 'xs' })), h('td', { class: 'num' }, t.lastSeason.wins), h('td', { class: 'num' }, t.lastSeason.losses), h('td', { class: 'num' }, t.lastSeason.ppg?.toFixed(1)), h('td', { class: 'num' }, t.lastSeason.oppPpg?.toFixed(1)), h('td', { class: 'muted' }, t.lastSeason.playoffs)),
          ),
        ),
      ),
      { flush: true },
    ),
  );
}

function draftTab(world, year) {
  const picks = world.history.drafts[year] ?? [];
  return card(
    `Draft ${year} — resultado oficial`,
    h(
      'table',
      { class: 'data' },
      h('thead', null, h('tr', null, h('th', { class: 'num' }, 'Pick'), h('th', null, 'Jogador'), h('th', null, 'Escolhido por'), h('th', null, 'Origem'), h('th', null, 'Hoje'), h('th', { class: 'center' }, 'OVR'), h('th', { class: 'center' }, 'POT'))),
      h(
        'tbody',
        null,
        picks.map((d) => {
          const p = world.players.get(d.playerId);
          return h(
            'tr',
            null,
            h('td', { class: 'num' }, h('strong', null, d.pick), h('span', { class: 'faint' }, ` · R${d.round}`)),
            h('td', null, p ? playerCell(p, { size: 'xs' }) : h('span', { class: 'muted' }, d.name)),
            h('td', { class: 'muted' }, d.team),
            h('td', { class: 'muted' }, d.from ?? '—'),
            h('td', null, p ? teamCell(world.teams.get(p.teamId), { size: 'xs', full: false }) : h('span', { class: 'faint' }, 'Fora da liga')),
            h('td', { class: 'center' }, p ? ovrBadge(p.ovr) : '—'),
            h('td', { class: 'center' }, p ? ovrBadge(p.potential, { ghost: true }) : '—'),
          );
        }),
      ),
    ),
    { flush: true },
  );
}

export function historyView() {
  const world = getWorld();
  const tabs = [
    { id: 'campeoes', label: 'Campeões', render: () => championsTab(world) },
    { id: 'temporada', label: `Temporada ${world.history.lastSeason.label}`, render: () => lastSeasonTab(world) },
    { id: 'draft2026', label: 'Draft 2026', render: () => draftTab(world, 2026) },
    { id: 'draft2025', label: 'Draft 2025', render: () => draftTab(world, 2025) },
    { id: 'universo', label: 'Seu universo', render: () => futureBox('História gerada pela carreira', 'Campeões, finais, MVPs, All-NBA, drafts, trades, recordes, aposentadorias e a trajetória de cada franquia — tudo o que acontecer nas suas temporadas ficará registrado e navegável aqui.', 8) },
  ];
  const active = parseHash().query.get('tab') ?? 'campeoes';
  return h(
    'div',
    { class: 'page' },
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'História'), h('p', { class: 'sub' }, 'O passado real da liga até o início da sua carreira.'))),
    tabView(tabs, { active, onChange: (tab) => setQuery({ tab: tab === 'campeoes' ? null : tab }) }),
  );
}
