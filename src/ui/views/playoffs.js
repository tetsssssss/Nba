// Exibição de play-in, séries e campeões. Lê somente os dados da carreira.
import { h } from '../dom.js';
import { card, emptyState, pageHeader, teamCell } from '../components/widgets.js';
import { getWorld } from '../../core/world.js';
import { playoffGames, standings } from '../../season/season.js';
import { ROUND_NAMES } from '../../season/postseason.js';

const gameLine = (g, w) => h('a', { href: `#/game/${g.id}`, class: 'lineup-row', style: { display:'flex', justifyContent:'space-between', gap:'12px', padding:'8px' } },
  h('span', { class: 'grow' }, `${g.date} · ${w.teams.get(g.away)?.name ?? g.away} @ ${w.teams.get(g.home)?.name ?? g.home}`),
  h('strong', null, g.status === 'final' ? `${g.score[1]}–${g.score[0]}` : 'A disputar'));

export function playoffsView() {
  const w = getWorld();
  const post = w.calendar.postseason;
  const root = h('div', { class: 'page' }, pageHeader('Play-in e Playoffs', { sub:'Disputa real da carreira: conferências, séries melhor de sete e campeão. Os resultados não alteram a campanha da temporada regular.' }));
  if (!post) {
    root.append(card(null, emptyState('Aguardando os playoffs', 'Os confrontos são gerados depois que as 82 partidas de cada equipe terminarem.')));
    root.append(card('Classificação atual', h('p', { class:'muted' }, Object.entries(standings().conferences).map(([c, rows]) => `${c}: ${rows.slice(0, 4).map((r) => w.teams.get(r.id)?.name).join(', ')}`).join(' · '))));
    return root;
  }
  const games = playoffGames();
  root.append(card('Situação da pós-temporada',
    h('div', { class:'stack' },
      h('strong', null, post.champion ? `Campeão: ${w.teams.get(post.champion)?.fullName ?? post.champion}` : ROUND_NAMES[post.stage] ?? post.stage),
      post.champion ? h('p', { class:'muted' }, `Vice: ${w.teams.get(post.runnerUp)?.fullName ?? post.runnerUp}. A offseason está liberada.`) : h('p', { class:'muted' }, 'Avance o calendário para disputar as próximas partidas, ou jogue a partida do seu time no 2D.'),
      h('span', { class:'muted small' }, `${games.filter((g) => g.status === 'final').length} de ${games.length} confrontos agendados concluídos`))));
  root.append(card('Play-in', h('div', { class:'stack' }, games.filter((g) => g.type === 'playin').map((g) => gameLine(g, w)))));
  for (const round of post.rounds) {
    root.append(h('h2', null, ROUND_NAMES[round.stage] ?? round.stage));
    root.append(h('div', { class:'grid cols-2' }, round.series.map((s) => card(`${s.conf === 'Finals' ? 'NBA' : s.conf} · ${s.wins.join('–')}`,
      h('div', { class:'stack' },
        h('div', { class:'row between' }, teamCell(w.teams.get(s.teams[0]), { size:'xs' }), h('strong', null, s.wins[0])),
        h('div', { class:'row between' }, teamCell(w.teams.get(s.teams[1]), { size:'xs' }), h('strong', null, s.wins[1])),
        s.winner ? h('p', { class:'small good' }, `Classificado: ${w.teams.get(s.winner)?.fullName}`) : null,
        ...s.games.map((id) => games.find((g) => g.id === id)).filter(Boolean).map((g) => gameLine(g, w)))))));
  }
  return root;
}
