// Ficha rápida de jogador em painel lateral: inspeciona sem sair da tela atual.
import { h, icon } from '../dom.js';
import { height, money, number } from '../format.js';
import { navigate } from '../router.js';
import { openDrawer } from './overlay.js';
import { bigStat, emptyState, favStar, ovrBadge, posLabel, ratingRow, statusBadge, teamCell } from './widgets.js';
import { playerAvatar } from '../../media/photos.js';
import { careerStatsOf, getWorld, playerAge } from '../../core/world.js';
import { contractSummary, seasonLabel } from '../../contracts/cap.js';
import { ATTRIBUTE_BY_KEY } from '../../players/attributes.js';
import { potentialEstimate } from '../../players/potential.js';
import { lastSeasonLine } from '../../players/statline.js';

export function potentialText(player, age, godMode) {
  const est = potentialEstimate(player, age);
  if (godMode) return `${est.exact}`;
  return est.low === est.high ? `${est.low}` : `${est.low}–${est.high}`;
}

export function openPlayerQuick(player) {
  openDrawer(
    async () => {
      const world = getWorld();
      const team = world.teams.get(player.teamId);
      const age = playerAge(player);
      const line = lastSeasonLine(await careerStatsOf(player.id));
      const summary = contractSummary(world.contracts.get(player.id), world.calendar.season);
      const top = Object.entries(player.attributes).sort((a, b) => b[1] - a[1]).slice(0, 4);
      return [
        h(
          'div',
          { class: 'quick-head', style: { '--c1': team?.colors?.[0] } },
          playerAvatar(player, { size: 'lg', color: team?.colors?.[0] }),
          h('div', { class: 'grow' }, h('strong', { class: 'quick-name' }, player.name), h('div', { class: 'row wrap muted', style: { gap: '4px 10px' } }, posLabel(player.positions), h('span', null, age != null ? `${age} anos` : '—'), h('span', null, height(player.heightIn)), statusBadge(player) ?? h('span', { class: 'good' }, 'Disponível'))),
          favStar(player),
        ),
        h('div', { class: 'row' }, team ? teamCell(team, { size: 'xs' }) : h('span', { class: 'muted' }, 'Sem time'), h('span', { class: 'grow' }), h('div', { class: 'center' }, ovrBadge(player.ovr, { big: true }), h('div', { class: 'micro faint' }, 'OVR')), h('div', { class: 'center' }, h('span', { class: 'ovr big ghost' }, potentialText(player, age, world.career.godMode)), h('div', { class: 'micro faint' }, 'Potencial'))),
        line
          ? h('section', { class: 'card raised' }, h('div', { class: 'card-head' }, h('h3', null, `Temporada ${seasonLabel(line.season)}`), h('span', { class: 'more' }, `${line.gp} jogos · ${number(line.min)} min`)), h('div', { class: 'bigstat-row' }, bigStat(number(line.pts), 'PTS'), bigStat(number(line.reb), 'REB'), bigStat(number(line.ast), 'AST'), bigStat(line.fgPct != null ? number(line.fgPct) : '—', 'FG%')))
          : h('section', { class: 'card raised' }, emptyState(player.rookie ? 'Novato' : 'Sem estatísticas', player.rookie ? 'Ainda não disputou jogos na NBA.' : 'As fontes consultadas não trazem a carreira deste jogador.')),
        h(
          'section',
          { class: 'card raised' },
          h('div', { class: 'card-head' }, h('h3', null, 'Contrato')),
          summary?.endSeason
            ? h('div', { class: 'bigstat-row' }, bigStat(money(summary.salary), seasonLabel(world.calendar.season)), bigStat(`${summary.yearsLeft}`, summary.yearsLeft === 1 ? 'ano restante' : 'anos restantes'), bigStat(seasonLabel(summary.endSeason), 'até'))
            : h('p', { class: 'muted' }, 'Sem contrato.'),
        ),
        h('section', { class: 'card raised' }, h('div', { class: 'card-head' }, h('h3', null, 'Principais forças')), top.map(([k, v]) => ratingRow(ATTRIBUTE_BY_KEY[k].label, v))),
        h(
          'div',
          { class: 'row' },
          h('a', { class: 'btn primary grow', href: `#/player/${player.id}` }, 'Abrir perfil completo'),
          h('button', { class: 'btn', type: 'button', tip: 'Comparar com outro jogador', onclick: () => navigate(`/compare?ids=${player.id}`) }, icon('compare'), 'Comparar'),
        ),
      ];
    },
    { title: 'Ficha rápida' },
  );
}
