// Painel do Universo: observação do mundo simulado, sem writes ou eventos fabricados.
import { h, icon } from '../dom.js';
import { pageHeader, teamCell, chip, emptyState } from '../components/widgets.js';
import { teamLogo } from '../../media/photos.js';
import { date as fmtDate, PHASE_LABEL } from '../format.js';
import { getWorld, recentNews } from '../../core/world.js';
import { seasonSnapshot } from '../../season/world-pulse.js';

const pct = (n) => `${(n * 100).toFixed(1).replace('.', ',')}%`;
const txt = (value) => value == null ? '—' : String(value);

export async function worldView() {
  const world = getWorld();
  const snapshot = seasonSnapshot(world.teams.values(), world.games.values(), world.calendar.season);
  const news = await recentNews(24);
  const page = h('div', { class: 'page universe-page' });
  const overview = h('div', { class: 'world-layout' });
  let conference = 'all';

  const filterBar = h('div', { class: 'world-tabs', role: 'group', 'aria-label': 'Filtrar ranking por conferência' });
  const rankingList = h('div', { class: 'world-rankings', 'aria-live': 'polite' });
  const paintRankings = () => {
    filterBar.replaceChildren(...[['all', 'Toda a liga'], ['East', 'Leste'], ['West', 'Oeste']].map(([id, label]) => h('button', {
      type: 'button', class: ['world-tab', id === conference && 'active'], 'aria-pressed': id === conference ? 'true' : 'false',
      onclick: () => { conference = id; paintRankings(); },
    }, label)));
    const filtered = snapshot.rankings.filter((r) => (conference === 'all' || r.conference === conference) && r.gp).slice(0, 10);
    rankingList.replaceChildren(...(filtered.length ? filtered.map((r, i) => h('div', { class: ['world-rank', r.id === world.career.teamId && 'is-mine'] },
      h('span', { class: 'world-rank-number' }, String(i + 1).padStart(2, '0')),
      teamCell(r.team, { size: 'xs', full: false }),
      h('div', { class: 'world-rank-stats' }, h('strong', null, `${r.w}-${r.l}`), h('small', null, `${pct(r.pct)} · saldo ${r.diff > 0 ? '+' : ''}${r.diff.toFixed(1)}`)),
      h('span', { class: ['world-rank-streak', r.streak > 0 ? 'positive' : r.streak < 0 ? 'negative' : ''] }, r.streak > 0 ? `${r.streak}V` : r.streak < 0 ? `${-r.streak}D` : '—'),
    )) : [emptyState('A temporada ainda vai começar', 'O ranking de momento é calculado apenas com partidas oficiais disputadas.') ]));
  };
  paintRankings();

  page.append(
    pageHeader('O Universo', { sub: 'Um panorama vivo da liga. Classificações, séries e manchetes nascem dos resultados da sua carreira.', actions: h('a', { class: 'btn', href: '#/standings' }, icon('standings'), 'Classificação oficial') }),
    h('section', { class: 'world-hero' },
      h('div', { class: 'world-hero-copy' },
        h('span', { class: 'world-eyebrow' }, h('i', { class: 'live-dot', 'aria-hidden': 'true' }), 'NBA UNIVERSE · BOLETIM DA LIGA'),
        h('h2', null, 'A liga não para.', h('span', null, 'Cada resultado muda a história.')),
        h('p', null, `Temporada ${world.calendar.season} · ${PHASE_LABEL[world.calendar.phase] ?? world.calendar.phase} · ${fmtDate(world.calendar.date)}`),
      ),
      h('div', { class: 'world-hero-counts' },
        h('div', null, h('strong', null, snapshot.played.toLocaleString('pt-BR')), h('span', null, 'partidas disputadas')),
        h('div', null, h('strong', null, snapshot.totalStreaks), h('span', null, 'sequências de 3+ jogos')),
      ),
    ),
  );

  const power = h('section', { class: 'world-panel' },
    h('div', { class: 'world-panel-head' }, h('div', null, h('span', { class: 'eyebrow' }, 'TERMÔMETRO DA TEMPORADA'), h('h3', null, 'Ranking da temporada regular')), h('span', { class: 'micro faint' }, 'Índice indicativo, não classificação oficial')),
    filterBar, rankingList,
    h('p', { class: 'world-explainer' }, 'Índice baseado em aproveitamento, últimos 10 jogos e saldo médio. Apenas equipes com jogos disputados aparecem.'),
  );

  const streaks = h('section', { class: 'world-panel' },
    h('div', { class: 'world-panel-head' }, h('div', null, h('span', { class: 'eyebrow' }, 'MOMENTO'), h('h3', null, 'Em sequência'))),
    snapshot.streaks.length ? h('div', { class: 'world-streaks' }, snapshot.streaks.map((r) => h('div', { class: 'world-streak' }, teamLogo(r.team, { size: 'sm' }), h('div', null, h('strong', null, r.team.fullName), h('small', null, r.streak > 0 ? 'Vitórias consecutivas' : 'Derrotas consecutivas')), h('span', { class: ['world-streak-score', r.streak > 0 ? 'positive' : 'negative'] }, r.streak > 0 ? `${r.streak}V` : `${-r.streak}D`)))) : emptyState('Nenhuma sequência longa ainda', 'Três vitórias ou derrotas consecutivas colocam uma franquia neste painel.'),
  );

  const duels = h('section', { class: 'world-panel' },
    h('div', { class: 'world-panel-head' }, h('div', null, h('span', { class: 'eyebrow' }, 'ENCONTROS'), h('h3', null, 'Duelos para acompanhar'))),
    snapshot.duels.length ? h('div', { class: 'world-duels' }, snapshot.duels.slice(0, 5).map((d) => {
      const [a, b] = d.teamIds.map((id) => world.teams.get(id));
      return h('div', { class: 'world-duel' }, h('div', { class: 'world-duel-teams' }, teamCell(a, { size: 'xs', full: false }), h('span', { class: 'faint' }, '×'), teamCell(b, { size: 'xs', full: false })), h('small', null, `${d.meetings} jogo(s) · ${d.close} decisão(ões) por até 5 pontos · ${d.overtimes} OT`), h('strong', null, `${d.wins[a.id]} – ${d.wins[b.id]}`));
    })) : emptyState('Os confrontos ainda estão se formando', 'Duelos com partidas apertadas ou encontros repetidos aparecerão aqui.'),
  );

  overview.append(power, h('div', { class: 'stack' }, streaks, duels));
  const stories = h('section', { class: 'world-panel world-stories' },
    h('div', { class: 'world-panel-head' }, h('div', null, h('span', { class: 'eyebrow' }, 'ACONTECIMENTOS REAIS'), h('h3', null, 'No radar da liga')), chip('Atualizado com a carreira', 'info')),
    snapshot.highlights.length ? h('div', { class: 'world-story-grid' }, snapshot.highlights.slice(0, 6).map((item) => h('a', { class: 'world-story', href: `#/game/${item.id}` }, h('span', { class: 'world-story-date' }, fmtDate(item.date)), h('h4', null, item.title), h('p', null, item.text), h('span', { class: 'world-story-more' }, 'Ver partida →')))) : emptyState('Primeiras manchetes à espera', 'Prorrogações e finais com diferença de até três pontos aparecem aqui automaticamente.'),
  );
  const feed = h('section', { class: 'world-panel world-feed' },
    h('div', { class: 'world-panel-head' }, h('div', null, h('span', { class: 'eyebrow' }, 'ARQUIVO DA CARREIRA'), h('h3', null, 'Noticiário'))),
    news.length ? h('div', { class: 'world-news-list' }, news.map((n) => h('article', { class: 'world-news' }, h('div', { class: 'row wrap' }, chip(n.category ?? 'Liga'), h('span', { class: 'small faint' }, `${fmtDate(n.date)} · ${n.source ?? 'NBA Universe'}`)), h('h4', null, n.title), h('p', null, n.body)))) : emptyState('Sem notícias registradas', 'O arquivo exibirá os acontecimentos salvos na carreira.'),
  );

  page.append(overview, stories, feed);
  return page;
}
