// Página de um jogo: apresentação estilo transmissão, parciais e box score.
// Somente leitura: nenhum registro de resultado, calendário ou carreira é alterado.
import { h } from '../dom.js';
import { date as fmtDate, record } from '../format.js';
import { card, chip, emptyState, pageHeader, teamCell } from '../components/widgets.js';
import { teamLogo } from '../../media/photos.js';
import { getWorld } from '../../core/world.js';
import { boxScoreOf, userGameToday } from '../../season/season.js';
import { gamePresentation } from '../presentation-insights.js';
import { boxTeamMetrics, gameFlow } from '../experience-insights.js';
import { multiLineChart } from '../components/visuals.js';

const COLS = ['Jogador', 'MIN', 'PTS', 'REB', 'AST', 'ROB', 'TOC', 'FG', '3P', 'LL', 'ERR', 'F'];
const cells = (r) => [r.min != null ? Math.round(r.min) : '', r.pts, (r.orb ?? 0) + (r.drb ?? 0), r.ast, r.stl, r.blk, `${r.fgm}/${r.fga}`, `${r.tpm}/${r.tpa}`, `${r.ftm}/${r.fta}`, r.tov, r.pf];

function boxTable(team, side) {
  const world = getWorld();
  const rows = [...side.players].sort((a, b) => Number(b.starter) - Number(a.starter) || b.min - a.min);
  return card(teamCell(team, { size: 'xs' }),
    h('div', { class: 'table-wrap' },
      h('table', { class: 'data' },
        h('thead', null, h('tr', null, COLS.map((c, i) => h('th', { class: i ? 'num' : '' }, c)))),
        h('tbody', null, rows.map((r, i) => [
          i > 0 && rows[i - 1].starter && !r.starter ? h('tr', { class: 'group' }, h('td', { colSpan: COLS.length }, 'Banco')) : null,
          h('tr', null, h('td', null, world.players.has(r.id) ? h('a', { class: 'link', href: `#/player/${r.id}` }, r.name) : r.name),
            cells(r).map((v, j) => h('td', { class: ['num', j === 1 && 'strong'] }, v))),
        ])),
        h('tfoot', null, h('tr', null, h('td', null, 'Total'), cells({ ...side.total, min: null }).map((v) => h('td', { class: 'num' }, v)))),
      )), { flush: true });
}

function periodComparison(periods) {
  return h('div', { class: 'game-periods', 'aria-label': 'Comparação por período' },
    periods.map((p) => {
      const sum = p.home + p.away;
      const width = sum ? Math.round(100 * p.away / sum) : 50;
      return h('div', { class: 'game-period' },
        h('div', { class: 'game-period-top' },
          h('span', { class: 'game-period-label' }, p.label),
          h('span', { class: 'game-period-numbers' }, `${p.away} × ${p.home}`)),
        h('div', { class: 'game-period-track', role: 'img', 'aria-label': `${p.label}: visitante ${p.away}, mandante ${p.home}` },
          h('span', { class: 'away', style: { width: `${width}%` } }),
          h('span', { class: 'home', style: { width: `${100 - width}%` } })));
    }));
}

function tacticalBreakdown(data, periods, home, away) {
  const sides = [boxTeamMetrics(data?.box?.[0]), boxTeamMetrics(data?.box?.[1])];
  const flow = gameFlow(periods);
  if (!flow.steps.length && sides.every((x) => !x)) return null;
  const metrics = [
    ['Aproveitamento de quadra', 'fg', '%'],
    ['Aproveitamento de 3', 'three', '%'],
    ['eFG% (arremessos ponderados)', 'efg', '%'],
    ['Assistências', 'ast', ''],
    ['Rebotes', 'rebounds', ''],
    ['Desperdícios', 'tov', ''],
  ];
  const fmt = (value, suffix) => value == null ? '—' : `${Number(value).toFixed(suffix ? 1 : 0)}${suffix}`;
  return h('div', { class: 'evo-game-tactics' },
    flow.steps.length ? card('Trajetória do placar', h('div', { class: 'evo-score-flow' },
      multiLineChart(flow.steps.map((step, i) => ({ season: i + 1, home: step.home, away: step.away })), [
        { key: 'home', label: home.name, color: 'var(--evo-chart-primary)' },
        { key: 'away', label: away.name, color: 'var(--evo-chart-secondary)' },
      ], { title: 'Placar acumulado por período' }),
      h('div', { class: 'evo-game-kpis' },
        h('div', null, h('strong', null, `+${flow.biggestHome ?? 0}`), h('span', null, `Maior vantagem · ${home.name}`)),
        h('div', null, h('strong', null, `+${flow.biggestAway ?? 0}`), h('span', null, `Maior vantagem · ${away.name}`))),
      h('p', { class: 'small muted' }, 'Vantagens medidas no encerramento de cada período, não durante os lances.'))) : null,
    sides.every(Boolean) ? card('Raio-X estatístico', h('div', { class: 'evo-box-facts' },
      h('div', { class: 'evo-duel-header' }, h('strong', null, away.name), h('span', null, 'INDICADOR'), h('strong', null, home.name)),
      metrics.map(([label, key, suffix]) => {
        const a = sides[1][key], b = sides[0][key];
        return h('div', { class: 'evo-duel-line' },
          h('strong', { class: a != null && a > b ? 'evo-winner' : '' }, fmt(a, suffix)),
          h('span', null, label),
          h('strong', { class: b != null && b > a ? 'evo-winner' : '' }, fmt(b, suffix)));
      }))) : null);
}

function standout(leaders, home, away) {
  if (!leaders.some(Boolean)) return null;
  return h('div', { class: 'game-highlights' }, [
    [leaders[1], away], [leaders[0], home],
  ].filter(([leader]) => leader).map(([leader, team]) => h('a', {
    class: 'game-highlight', href: leader.id ? `#/player/${leader.id}` : `#/team/${team.id}`,
    style: { '--club-color': team.colors[0] },
  },
    h('div', { class: 'game-highlight-title' }, teamLogo(team, { size: 'sm' }), h('span', null, 'CESTINHA DA EQUIPE')),
    h('strong', null, leader.name),
    h('span', null, `${leader.points} pontos`))));
}

export async function gameView({ id }) {
  const world = getWorld();
  const game = world.games.get(id);
  if (!game) return h('div', { class: 'page' }, emptyState('Jogo não encontrado', 'Este jogo não existe no calendário desta carreira.', h('a', { class: 'btn', href: '#/calendar' }, 'Abrir o calendário')));
  const home = world.teams.get(game.home);
  const away = world.teams.get(game.away);
  const final = game.status === 'final';
  const data = final ? (game.box ? game : await boxScoreOf(game.id)) : null;
  const presentation = gamePresentation(game, data);
  const side = (team, score, win, label) => h('div', { class: ['final-side', win && 'win'], style: { '--c1': team.colors[0] } },
    teamLogo(team, { size: 'lg' }),
    h('div', null, h('span', { class: 'micro faint' }, label), h('a', { class: 'link final-name', href: `#/team/${team.id}` }, team.fullName), h('div', { class: 'muted small' }, record(team.record))),
    final ? h('span', { class: 'display' }, score ?? '—') : null);

  const head = h('div', { class: 'game-head game-head-broadcast' },
    side(away, game.score?.[1], presentation.result === 'away', 'Visitante'),
    h('div', { class: 'game-mid' },
      h('span', { class: 'game-live-label' }, final ? `FINAL${game.overtimes ? ` · ${game.overtimes} PRORROGAÇÃO(ÕES)` : ''}` : 'PRÓXIMO JOGO'),
      h('strong', null, fmtDate(game.date, { weekday: true })),
      final ? chip(game.quick ? 'Simulação rápida' : 'Jogado no 2D', game.quick ? '' : 'info', game.quick ? 'Resolvido pelo modelo estatístico da liga.' : 'Disputado no motor de partida 2D.') : null,
      presentation.complete && presentation.difference != null ? h('span', { class: 'game-margin' }, presentation.result === 'tied' ? 'Empate registrado' : `Diferença final: ${presentation.difference} ${presentation.difference === 1 ? 'ponto' : 'pontos'}`) : null),
    side(home, game.score?.[0], presentation.result === 'home', 'Mandante'));

  let body;
  if (!final) {
    const mine = userGameToday()?.id === game.id;
    body = card(null, emptyState(mine ? 'É hoje' : 'Jogo ainda não disputado',
      mine ? 'Você pode jogar no motor 2D ou deixar a simulação rápida resolver ao avançar o dia.' : `Será disputado em ${fmtDate(game.date)}.`,
      mine ? h('a', { class: 'btn primary', href: `#/match?jogo=${game.id}` }, 'Jogar no 2D') : null));
  } else if (!data) {
    body = card(null, emptyState('Box score indisponível', 'O placar foi registrado, mas o detalhamento deste jogo não está no save.'));
  } else {
    const periods = presentation.periods;
    body = h('div', { class: 'stack' },
      standout(presentation.leaders, home, away),
      tacticalBreakdown(data, presentation.periods, home, away),
      periods.length ? card('Ritmo do placar', periodComparison(periods)) : null,
      periods.length ? card('Parciais',
        h('div', { class: 'table-wrap' },
          h('table', { class: 'data' },
            h('thead', null, h('tr', null, h('th', null, 'Time'), periods.map((p) => h('th', { class: 'num' }, p.number <= 4 ? `${p.number}º` : `P${p.number - 4}`)), h('th', { class: 'num' }, 'Total'))),
            h('tbody', null, [[away, 'away', 1], [home, 'home', 0]].map(([t, key, i]) => h('tr', null, h('td', null, t.fullName), periods.map((p) => h('td', { class: 'num' }, p[key])), h('td', { class: 'num strong' }, game.score[i])))))),
        { flush: true }) : card(null, emptyState('Parciais indisponíveis', 'O resultado existe, mas os pontos por período não estão neste registro.')),
      Array.isArray(data.box) && data.box[0]?.players && data.box[1]?.players
        ? h('div', { class: 'grid cols-2 game-boxes' }, boxTable(away, data.box[1]), boxTable(home, data.box[0]))
        : card(null, emptyState('Estatísticas individuais indisponíveis', 'Este resultado não contém o box score completo.')),
    );
  }
  return h('div', { class: 'page game-detail-page' },
    pageHeader('Jogo', { crumbs: [['Calendário', '/calendar'], [`${away.id} @ ${home.id}`]] }), head, body);
}
