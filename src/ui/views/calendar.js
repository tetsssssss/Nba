// Calendário: os 82 jogos do time do usuário (lista por mês) e a rodada da liga dia a dia.
import { h, icon, mount } from '../dom.js';
import { addDays, date as fmtDate } from '../format.js';
import { parseHash, setQuery } from '../router.js';
import { card, emptyState, pageHeader, segmented, teamCell } from '../components/widgets.js';
import { gameCard } from '../components/game.js';
import { getWorld } from '../../core/world.js';
import { gamesOn, officialGames, teamGames } from '../../season/season.js';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const WEEKDAY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const weekday = (iso) => WEEKDAY[new Date(`${iso}T12:00:00Z`).getUTCDay()];

function teamList(teamId) {
  const world = getWorld();
  const games = teamGames(teamId);
  if (!games.length) return card(null, emptyState('Sem calendário', 'O calendário desta temporada ainda não foi gerado.'));
  let w = 0;
  let l = 0;
  const byMonth = new Map();
  for (const g of games) {
    const home = g.home === teamId;
    const final = g.status === 'final';
    const won = final ? (home ? g.score[0] > g.score[1] : g.score[1] > g.score[0]) : null;
    if (won === true) w++;
    if (won === false) l++;
    const key = g.date.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push({ g, home, final, won, after: final ? `${w}-${l}` : '' });
  }
  const today = world.calendar.date;
  return h(
    'div',
    { class: 'grid cols-2' },
    [...byMonth.entries()].map(([key, rows]) =>
      card(
        `${MONTHS[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`,
        h(
          'table',
          { class: 'data' },
          h(
            'tbody',
            null,
            rows.map(({ g, home, final, won, after }) =>
              h(
                'tr',
                { class: ['clickable', g.date === today && 'selected'], onclick: () => (location.hash = `#/game/${g.id}`) },
                h('td', { class: 'num faint', style: { width: '74px' } }, `${weekday(g.date)} ${g.date.slice(8)}`),
                h('td', { class: 'faint', style: { width: '26px' } }, home ? 'vs' : '@'),
                h('td', null, teamCell(world.teams.get(home ? g.away : g.home), { size: 'xs' })),
                h('td', { class: 'num' }, final ? h('span', null, h('span', { class: ['chip', won ? 'good' : 'bad'], style: { marginRight: '8px' } }, won ? 'V' : 'D'), `${home ? g.score[0] : g.score[1]}-${home ? g.score[1] : g.score[0]}`) : h('span', { class: 'faint' }, g.date === today ? 'Hoje' : '—')),
                h('td', { class: 'num muted', style: { width: '58px' } }, after),
              ),
            ),
          ),
        ),
        { flush: true },
      ),
    ),
  );
}

function leagueDay(initial) {
  const host = h('div', null);
  const games = officialGames();
  const first = games[0]?.date;
  const last = games.at(-1)?.date;
  let day = initial;
  const draw = () => {
    const list = gamesOn(day);
    setQuery({ dia: day });
    mount(
      host,
      h(
        'div',
        { class: 'toolbar' },
        h('button', { class: 'btn icon', 'aria-label': 'Dia anterior', disabled: !first || day <= first, onclick: () => ((day = addDays(day, -1)), draw()) }, icon('chevron')),
        h('strong', { class: 'day-label' }, `${weekday(day)}, ${fmtDate(day)}`),
        h('button', { class: 'btn icon flip', 'aria-label': 'Próximo dia', disabled: !last || day >= last, onclick: () => ((day = addDays(day, 1)), draw()) }, icon('chevron')),
        h('button', { class: 'btn ghost', onclick: () => ((day = getWorld().calendar.date), draw()) }, 'Hoje'),
        h('span', { class: 'muted small' }, `${list.length} jogo(s)`),
      ),
      list.length ? h('div', { class: 'game-grid' }, list.map((g) => gameCard(g, { showDate: false }))) : card(null, emptyState('Sem jogos neste dia', first && day < first ? `A temporada regular começa em ${fmtDate(first)}.` : 'Dia de folga na liga.')),
    );
  };
  draw();
  return host;
}

export function calendarView() {
  const world = getWorld();
  const q = parseHash().query;
  const root = h('div', { class: 'page' });
  let mode = q.get('modo') === 'liga' ? 'liga' : 'time';
  const body = h('div', null);
  const draw = () => mount(body, mode === 'time' ? teamList(world.career.teamId) : leagueDay(q.get('dia') ?? world.calendar.date));
  mount(
    root,
    pageHeader('Calendário', {
      sub: 'Temporada regular de 82 jogos por franquia, seguida de play-in e playoffs.',
      actions: segmented([['time', 'Meu time'], ['liga', 'Rodada da liga']], mode, (v) => ((mode = v), setQuery({ modo: v === 'liga' ? 'liga' : null, dia: null }), draw()), { label: 'Visão' }),
    }),
    body,
  );
  draw();
  return root;
}
