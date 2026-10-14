// Depth chart automático: distribui o elenco pelas cinco posições, sem repetir
// jogador, priorizando o Overall de cada um NA posição em que será usado.
import { POSITIONS } from './attributes.js';
import { positionOverall } from './overall.js';

const PRIMARY_BONUS = 1.5; // pequena preferência pela posição natural principal

/**
 * @param roster jogadores (com attributes, positions, injury)
 * @param depth  quantas linhas montar (1 = titulares)
 * @returns { PG: [{ player, ovr }], SG: [...], ... } — índice 0 = titular
 */
export function autoDepthChart(roster, depth = 3) {
  const chart = Object.fromEntries(POSITIONS.map((p) => [p, []]));
  const used = new Set();
  const available = roster.filter((p) => p.injury?.status !== 'Out');
  const options = [];
  for (const player of available) {
    player.positions.forEach((pos, i) => {
      const ovr = positionOverall(player.attributes, pos);
      options.push({ player, pos, ovr, score: ovr + (i === 0 ? PRIMARY_BONUS : 0) });
    });
  }
  options.sort((a, b) => b.score - a.score);
  for (let line = 0; line < depth; line++) {
    for (const opt of options) {
      if (used.has(opt.player.id) || chart[opt.pos].length !== line) continue;
      chart[opt.pos].push({ player: opt.player, ovr: opt.ovr });
      used.add(opt.player.id);
    }
    // posição sem especialista: completa com o melhor jogador restante de posição vizinha
    for (const pos of POSITIONS) {
      if (chart[pos].length > line) continue;
      const idx = POSITIONS.indexOf(pos);
      const fill = available
        .filter((p) => !used.has(p.id) && p.positions.some((q) => Math.abs(POSITIONS.indexOf(q) - idx) === 1))
        .map((p) => ({ player: p, ovr: positionOverall(p.attributes, pos), outOfPosition: true }))
        .sort((a, b) => b.ovr - a.ovr)[0];
      if (fill) {
        chart[pos].push(fill);
        used.add(fill.player.id);
      }
    }
  }
  return { chart, unused: roster.filter((p) => !used.has(p.id)) };
}
