// Cartão de jogo: o mesmo em Central, calendário e classificação.
import { h } from '../dom.js';
import { date as fmtDate, record } from '../format.js';
import { teamLogo } from '../../media/photos.js';
import { getWorld } from '../../core/world.js';

/**
 * @param game  registro da store games
 * @param opts  { showDate, perspective: id do time para destacar vitória/derrota }
 */
export function gameCard(game, { showDate = true, perspective = null } = {}) {
  const world = getWorld();
  const final = game.status === 'final';
  const sides = [game.away, game.home].map((id) => world.teams.get(id));
  const scores = final ? [game.score[1], game.score[0]] : [null, null];
  const won = final && perspective ? (perspective === game.home ? game.score[0] > game.score[1] : game.score[1] > game.score[0]) : null;
  const row = (team, score, other, home) =>
    h('div', { class: ['gc-side', final && score > other && 'win', team.id === world.career.teamId && 'mine'] }, teamLogo(team, { size: 'sm' }), h('span', { class: 'grow gc-name' }, team.id, h('small', null, home ? 'casa' : 'fora', ` · ${record(team.record)}`)), final ? h('strong', { class: 'gc-score num' }, score) : null);
  return h(
    'a',
    { class: ['game-tile', won === true && 'won', won === false && 'lost'], href: `#/game/${game.id}` },
    h('div', { class: 'gc-top' }, h('span', { class: 'micro' }, final ? `Final${game.overtimes ? ` · ${game.overtimes}P` : ''}` : 'Agendado'), showDate ? h('span', { class: 'faint small' }, fmtDate(game.date)) : null, won === null ? null : h('span', { class: ['chip', won ? 'good' : 'bad'] }, won ? 'V' : 'D')),
    row(sides[0], scores[0], scores[1], false),
    row(sides[1], scores[1], scores[0], true),
  );
}
