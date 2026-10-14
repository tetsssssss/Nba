// Central do GM: responde "o que está acontecendo com meu time?" em três níveis —
// decisão imediata (alertas), informação operacional (quinteto, folha, médico) e contexto (divisão, notícias).
import { h, icon } from '../dom.js';
import { CONFERENCE_LABEL, PHASE_LABEL, date as fmtDate, money, number, record } from '../format.js';
import { capBar } from './team.js';
import { bigStat, card, chip, emptyState, injuryChip, kpi, ovrBadge, playerCard, playerCell, teamCell } from '../components/widgets.js';
import { toast } from '../components/feedback.js';
import { playerAvatar, preloadPlayers } from '../../media/photos.js';
import { watchedIds } from '../../core/watchlist.js';
import { lastSeasonLine } from '../../players/statline.js';
import { topScorers } from '../../match/bridge.js';
import { modeShows } from '../../core/modes.js';
import { gameCard as gameTile } from '../components/game.js';
import { conferenceTable } from './standings.js';
import { lastGameOf, nextGameOf, seasonGames, seasonLine, standings, userGameToday } from '../../season/season.js';
import { openPlayerQuick } from '../components/player-quick.js';
import { teamLogo } from '../../media/photos.js';
import { careerStatsOf, getWorld, payrollOf, playerAge, recentGames, recentNews, saveWorld, teamRoster, userTeam } from '../../core/world.js';
import { userTasks } from '../../core/tasks.js';
import { CAP_STATUS_LABEL, seasonLabel } from '../../contracts/cap.js';
import { autoDepthChart } from '../../players/depth.js';
import { POSITIONS } from '../../players/attributes.js';
import { franchisePulse, seasonSnapshot } from '../../season/world-pulse.js';

/** Categorias fixas de notícia: [rótulo, variante do chip]. */
const NEWS_KIND = { liga: ['Liga', ''], franquia: ['Franquia', 'info'], trade: ['Trade', 'warn'], lesao: ['Lesão', 'bad'], draft: ['Draft', 'good'], contrato: ['Contrato', 'info'] };
const ZONE_LABEL = { playoff: 'zona de playoffs', playin: 'zona de play-in', out: 'fora da classificação' };
const CAP_TONE = { 'under-cap': 'good', tax: 'warn', 'first-apron': 'warn', 'second-apron': 'bad' };
const SOON = [['Moral do elenco', 7], ['Objetivos do proprietário', 8]];

export async function homeView() {
  const world = getWorld();
  const team = userTeam();
  const roster = teamRoster(team.id);
  const { calendar, league } = world;
  const coach = world.coaches.get(team.headCoachId);
  const news = await recentNews(6);
  const payroll = payrollOf(team.id);
  const showCap = modeShows(world.career, 'cap');
  const today = userGameToday();
  const nextGame = nextGameOf(team.id);
  const table = standings();
  const myRow = table.rows.get(team.id);
  const gamesThisSeason = seasonGames();
  const started = gamesThisSeason.some((g) => g.status === 'final');
  const pulse = franchisePulse(seasonSnapshot(world.teams.values(), gamesThisSeason, calendar.season), team.id, gamesThisSeason);
  // no Coach Mode a diretoria (IA) cuida de contratos e folha: essas pendências não são suas
  const tasks = userTasks().filter((t) => showCap || !/folha|contrato|tax|apron|cap/i.test(`${t.title} ${t.link ?? ''}`));
  preloadPlayers(roster); // fotos do elenco prontas para as próximas telas
  const urgent = tasks.filter((t) => t.level === 'bad' || t.level === 'warn');
  const other = tasks.filter((t) => t.level !== 'bad' && t.level !== 'warn');
  const injured = roster.filter((p) => p.injury);
  const avgAge = roster.length ? roster.reduce((a, p) => a + (playerAge(p) ?? 26), 0) / roster.length : null;

  // ---- faixa da franquia + ações rápidas (no máximo quatro; a primária é jogar)
  const banner = h(
    'div',
    { class: 'hero-card home-banner', dataset: { team: team.id }, style: { '--c1': team.colors[0], '--c2': team.colors[1] } },
    teamLogo(team, { size: 'lg' }),
    h(
      'div',
      { class: 'grow' },
      h('div', { class: 'micro', style: { color: 'var(--text-secondary)' } }, `${PHASE_LABEL[calendar.phase]} ${seasonLabel(calendar.season)} · ${fmtDate(calendar.date, { weekday: true })}`),
      h('div', { class: 'title' }, team.fullName),
      h('div', { class: 'subtitle' }, h('span', null, `Conferência ${CONFERENCE_LABEL[team.conference]} · ${team.division}`), h('span', null, coach ? `Técnico: ${coach.name}` : 'Sem técnico')),
    ),
    h(
      'div',
      { class: 'quick-actions' },
      today
        ? h('a', { class: 'btn primary large', href: `#/match?jogo=${today.id}`, tip: 'Jogo oficial de hoje, no motor 2D.' }, icon('court'), `Jogar ${today.home === team.id ? 'vs' : '@'} ${world.teams.get(today.home === team.id ? today.away : today.home).name}`)
        : h('a', { class: 'btn primary large', href: '#/match', tip: 'Amistoso no motor 2D (atalho: G). Não altera a campanha.' }, icon('court'), 'Jogar amistoso 2D'),
      h('div', { class: 'row' }, h('a', { class: 'btn', href: `#/team/${team.id}`, tip: 'Atalho: R' }, icon('roster'), 'Elenco'), h('a', { class: 'btn', href: `#/team/${team.id}?tab=depth`, tip: 'Atalho: D' }, icon('depth'), 'Rotação'), h('button', { class: 'btn', type: 'button', tip: 'Atalho: S', onclick: async () => (await saveWorld(), toast('Carreira salva.')) }, icon('save'), 'Salvar')),
    ),
  );

  // ---- indicadores
  const kpis = h(
    'div',
    { class: 'grid cols-4' },
    kpi('Campanha', record(team.record), { sub: calendar.phase === 'preseason' ? `Estreia em ${fmtDate(nextGame?.date ?? league.calendar.regularSeasonStart)}` : `${myRow.seed}º do ${CONFERENCE_LABEL[team.conference]} · ${ZONE_LABEL[myRow.zone]}`, href: '/standings', tone: calendar.phase === 'preseason' ? null : myRow.zone === 'playoff' ? 'good' : myRow.zone === 'playin' ? 'warn' : null }),
    team.lastSeason
      ? kpi('Temporada passada', record(team.lastSeason), { sub: `${team.lastSeason.conferenceRank}º do ${CONFERENCE_LABEL[team.lastSeason.conference]} · ${team.lastSeason.playoffs}` })
      : kpi('Franquia', team.identity?.returning ? 'Retorno' : 'Estreia', { sub: team.identity?.returning ? 'De volta à NBA' : 'Primeira temporada da história' }),
    showCap
      ? kpi(payroll.capSpace >= 0 ? 'Espaço no cap' : 'Acima do cap', money(Math.abs(payroll.capSpace)), { sub: `Folha ${money(payroll.total)} · ${CAP_STATUS_LABEL[payroll.status]}`, tone: CAP_TONE[payroll.status], href: `/team/${team.id}?tab=folha` })
      : kpi('Disponíveis', `${roster.length - injured.filter((p) => p.injury.status === 'Out').length}/${roster.length}`, { sub: injured.length ? `${injured.length} no departamento médico` : 'Elenco completo', tone: injured.length ? 'warn' : 'good' }),
    kpi('Elenco', `${payroll.standardCount}/${league.roster.standardMax}`, { sub: `${payroll.twoWayCount} two-way${avgAge ? ` · média ${number(avgAge)} anos` : ''}`, tone: payroll.standardCount > league.roster.standardMax ? 'warn' : null, href: `/team/${team.id}` }),
  );

  // ---- trajetória da carreira: métricas derivadas do calendário real, sem novos dados persistidos
  const arc = h('section', { class: 'career-arc', 'aria-label': 'Trajetória da carreira' },
    h('div', { class: 'career-arc-heading' },
      h('div', null, h('span', { class: 'eyebrow' }, 'JORNADA DA FRANQUIA'), h('h2', null, 'Sua temporada, em movimento'),
        h('p', null, pulse?.played ? `${pulse.played} partidas concluídas · ${pulse.total - pulse.completed} restantes na temporada regular` : 'A história começa no primeiro salto inicial.')),
      h('a', { class: 'btn', href: '#/world' }, icon('news'), 'Explorar o universo')),
    h('div', { class: 'career-arc-grid' },
      h('div', { class: 'career-arc-progress' }, h('span', { class: 'career-arc-label' }, 'TEMPORADA REGULAR'),
        h('div', { class: 'career-arc-numbers' }, h('strong', null, `${pulse?.percent ?? 0}%`), h('span', null, `${pulse?.completed ?? 0} de ${pulse?.total ?? 0} jogos`)),
        h('div', { class: 'career-meter', role: 'progressbar', 'aria-label': 'Progresso da temporada', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pulse?.percent ?? 0) }, h('i', { style: { width: `${pulse?.percent ?? 0}%` } }))),
      h('div', { class: 'career-arc-metric' }, h('span', { class: 'career-arc-label' }, 'POSIÇÃO NA CONFERÊNCIA'), h('strong', null, pulse?.played ? `${pulse.seed}º` : '—'), h('small', null, pulse?.zone === 'playoff' ? 'Vaga direta no momento' : pulse?.zone === 'playin' ? 'Na zona de play-in' : pulse?.played ? 'Fora da zona de classificação' : 'Ainda sem classificação')),
      h('div', { class: 'career-arc-metric' }, h('span', { class: 'career-arc-label' }, 'MOMENTO'), h('strong', null, pulse?.streak > 0 ? `${pulse.streak}V` : pulse?.streak < 0 ? `${-pulse.streak}D` : '—'), h('small', null, pulse?.played ? `Últimos 10: ${pulse.lastTen[0]}V / ${pulse.lastTen[1]}D` : 'Aguardando primeiros jogos')),
      h('div', { class: 'career-arc-metric' }, h('span', { class: 'career-arc-label' }, 'PROJEÇÃO NO RITMO ATUAL'), h('strong', null, pulse?.projectedWins == null ? '—' : `${pulse.projectedWins}V`), h('small', null, pulse?.played ? 'Projeção matemática, não previsão' : 'Disponível após a estreia')),
    ));

  // ---- nível 1: o que exige decisão
  const alerts = urgent.length
    ? h(
        'div',
        { class: ['grid', urgent.length > 1 ? 'cols-2' : null] },
        urgent.map((t) => h(t.link ? 'a' : 'div', { class: ['alert', t.level === 'bad' && 'bad'], href: t.link ? `#${t.link}` : null }, icon('alert'), h('div', null, h('strong', null, t.title), h('span', null, t.text)))),
      )
    : null;

  // ---- nível 2: quinteto provável
  let lineupCard;
  if (roster.length) {
    const { chart } = autoDepthChart(roster, 1);
    lineupCard = card(
      'Quinteto provável',
      h('div', { class: 'lineup' }, POSITIONS.map((pos) => (chart[pos][0] ? playerCard(chart[pos][0].player, { label: pos, onClick: openPlayerQuick }) : h('div', { class: 'player-card empty' }, h('span', { class: 'player-card-label' }, pos), h('span', { class: 'muted' }, 'Sem opção'))))),
      { more: h('a', { class: 'more', href: `#/team/${team.id}?tab=depth` }, 'Depth chart completo →') },
    );
  } else {
    lineupCard = card('Elenco', emptyState('A franquia ainda não tem jogadores', `${team.identity?.summary ?? ''} O primeiro elenco será montado no Expansion Draft (Fase 3).`, h('a', { class: 'btn', href: '#/players' }, 'Estudar os elencos da liga')));
  }

  const newsCard = card(
    'Notícias',
    news.length
      ? h(
          'div',
          { class: 'news-feed' },
          news.map((n) => {
            const [label, kind] = NEWS_KIND[n.category] ?? [n.category, ''];
            return h('article', { class: 'news-item' }, h('div', { class: 'row', style: { gap: '8px' } }, chip(label, kind), h('span', { class: 'faint small' }, `${fmtDate(n.date)} · ${n.source}`)), h('h4', null, n.title), h('p', null, n.body));
          }),
        )
      : emptyState('Sem notícias por enquanto', 'As manchetes aparecem aqui conforme o universo avança.'),
  );

  // ---- coluna lateral
  const tasksCard = card(
    'Pendências',
    other.length
      ? h('div', null, other.map((t) => {
          const inner = [h('span', { class: 'dot' }), h('div', null, h('strong', null, t.title), h('span', null, t.text))];
          return t.link ? h('a', { class: ['task', t.level], href: `#${t.link}` }, inner) : h('div', { class: ['task', t.level] }, inner);
        }))
      : emptyState('Tudo em dia', 'Nenhuma pendência informativa no momento.'),
  );

  const medicalCard = card(
    'Departamento médico',
    injured.length
      ? h('div', { class: 'list' }, injured.map((p) => h('div', { class: 'item' }, h('div', { class: 'grow' }, playerCell(p, { sub: `${p.positions.join('/')} · desde ${fmtDate(p.injury.since)}` })), injuryChip(p.injury))))
      : emptyState(roster.length ? 'Elenco 100% disponível' : 'Sem elenco', roster.length ? 'Nenhum jogador lesionado.' : null),
    { more: injured.length ? h('span', { class: 'more' }, `${injured.length} jogador(es)`) : null },
  );

  const financeCard = card('Folha salarial', capBar(payroll, league.cap, world.career.capMode), { more: h('a', { class: 'more', href: `#/team/${team.id}?tab=folha` }, 'Detalhar →') });

  // ---- líderes do elenco: temporada em curso quando já há jogos; antes disso, a última disputada
  const current = roster.map((p) => [p, seasonLine(p.id)]).filter(([, l]) => l && l.gp >= 3);
  const lines = current.length >= 5 ? current : (await Promise.all(roster.map(async (p) => [p, lastSeasonLine(await careerStatsOf(p.id))]))).filter(([, l]) => l && l.gp >= 10);
  const leader = (key, label, digits = 1) => {
    const best = lines.slice().sort((a, b) => b[1][key] - a[1][key])[0];
    if (!best) return null;
    const [p, l] = best;
    return h('button', { type: 'button', class: 'leader', onclick: () => openPlayerQuick(p) }, playerAvatar(p, { size: 'md', color: team.colors[0] }), h('span', { class: 'grow' }, h('span', { class: 'micro faint' }, label), h('strong', null, p.name)), bigStat(l[key].toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits }), ''));
  };
  const leadersCard = lines.length ? card('Líderes do elenco', h('div', { class: 'leaders' }, leader('pts', 'Pontos'), leader('reb', 'Rebotes'), leader('ast', 'Assistências'), leader('stl', 'Roubos'), leader('blk', 'Tocos')), { more: h('span', { class: 'more', tip: 'Médias por jogo.' }, current.length >= 5 ? `Temporada ${seasonLabel(calendar.season)}` : 'Temporada passada') }) : null;

  // ---- próximo jogo e último jogo oficial
  const lastOfficial = lastGameOf(team.id);
  const scheduleCard = nextGame || lastOfficial
    ? card(
        today ? 'Jogo de hoje' : 'Próximo jogo',
        h('div', { class: 'stack', style: { gap: '10px' } }, nextGame ? gameTile(nextGame, { perspective: team.id }) : h('p', { class: 'muted' }, 'Aguardando próximo jogo.'), lastOfficial ? [h('span', { class: 'micro faint' }, 'Último resultado'), gameTile(lastOfficial, { perspective: team.id })] : null),
        { more: h('a', { class: 'more', href: '#/calendar' }, 'Calendário →') },
      )
    : null;

  // ---- último amistoso (só aparece enquanto não há jogo oficial disputado)
  const [lastGame] = lastOfficial ? [] : await recentGames(1);
  let gameCard = null;
  if (lastGame) {
    const sides = [world.teams.get(lastGame.home), world.teams.get(lastGame.away)];
    const tops = topScorers(lastGame);
    gameCard = card(
      'Último jogo',
      h(
        'div',
        { class: 'game-card' },
        sides.map((t, i) => h('div', { class: ['game-side', lastGame.score[i] > lastGame.score[1 - i] && 'win'] }, teamCell(t, { size: 'sm', full: false }), h('strong', { class: 'display' }, lastGame.score[i]))),
        h('div', { class: 'muted small' }, `Final${lastGame.overtimes ? ` · ${lastGame.overtimes} prorrogação(ões)` : ''} · amistoso · ${fmtDate(lastGame.date)}`),
        h('div', { class: 'faint small' }, tops.filter(Boolean).map((p) => `${p.name} ${p.pts} pts`).join(' · ')),
      ),
      { more: h('a', { class: 'more', href: '#/match' }, 'Jogar outro →') },
    );
  }

  // ---- observados
  const watched = watchedIds().map((id) => world.players.get(id)).filter(Boolean).slice(0, 4);
  const watchCard = watched.length
    ? card('Observados', h('div', { class: 'list' }, watched.map((p) => h('div', { class: 'item' }, h('div', { class: 'grow' }, playerCell(p, { sub: `${p.positions.join('/')} · ${world.teams.get(p.teamId)?.name ?? 'Sem time'}` })), ovrBadge(p.ovr)))), { more: h('a', { class: 'more', href: '#/watchlist' }, 'Ver todos →') })
    : null;

  // ---- nível 3: contexto
  const standingsCard = card(`Conferência ${CONFERENCE_LABEL[team.conference]}`, conferenceTable(table.conferences[team.conference], team.id, { compact: true }), { flush: true, more: h('a', { class: 'more', href: '#/standings' }, 'Classificação completa →') });
  const division = [...world.teams.values()].filter((t) => t.division === team.division).sort((a, b) => (b.lastSeason?.wins ?? -1) - (a.lastSeason?.wins ?? -1));
  const divisionCard = card(
    `Divisão ${team.division}`,
    h(
      'div',
      { class: 'list' },
      division.map((t) => h('div', { class: ['item', t.id === team.id && 'me'] }, h('div', { class: 'grow' }, teamCell(t, { size: 'xs' })), h('span', { class: 'num muted', tip: 'Campanha de 2025-26 (a classificação da temporada chega na Fase 4).' }, t.lastSeason ? record(t.lastSeason) : 'Estreante'))),
    ),
    { more: h('a', { class: 'more', href: '#/league' }, 'Todas as franquias →') },
  );

  const soon = h('div', { class: 'soon-line' }, h('span', { class: 'micro faint' }, 'Em breve nesta tela'), SOON.map(([label, phase]) => h('a', { class: 'chip future', href: `#/roadmap?fase=${phase}`, tip: `Previsto para a Fase ${phase}.` }, label)));

  return h('div', { class: 'page home' }, banner, h('div', { class: 'stack' }, kpis, arc, alerts, h('div', { class: 'grid main-side' }, h('div', { class: 'stack' }, lineupCard, leadersCard, newsCard), h('div', { class: 'stack' }, scheduleCard, gameCard, started ? standingsCard : null, tasksCard, medicalCard, showCap ? financeCard : null, watchCard, started ? null : divisionCard)), soon));
}
