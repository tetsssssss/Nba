// Loteria e ordem do Draft. Funções puras: recebem campanhas, picks e um gerador pseudoaleatório.
//
// Regras (decisão de design, configurável em league.draft quando existir):
//  - As 14 piores franquias que NÃO foram aos playoffs disputam a loteria; as quatro primeiras
//    escolhas são sorteadas com as probabilidades de 2019 da NBA (14/14/14/12,5/10,5/9/7,5/6/4,5/3/2/1,5/1/0,5 %).
//  - Quem não é sorteado ocupa as posições seguintes por campanha (pior primeiro), sem cair mais de 4 posições.
//  - Demais não classificados e depois os classificados aos playoffs seguem a ordem inversa da campanha.
//  - Picks de número FIXO (as reservadas das franquias de expansão no Draft inicial) saem da loteria e da
//    ordem natural: ocupam exatamente as posições reservadas, e as demais franquias preenchem as livres.
//  - A 2ª rodada segue a campanha inversa de todas as franquias, sem loteria.

export const DEFAULT_LOTTERY_ODDS = [140, 140, 140, 125, 105, 90, 75, 60, 45, 30, 20, 15, 10, 5]; // por mil

const pickId = (season, round, teamId) => `${season}-R${round}-${teamId}`;

/**
 * Sorteio das primeiras escolhas. `pool` já vem do pior para o melhor.
 * @returns { drawn: [teamId...], order: [teamId...] } order = ordem final dos participantes da loteria
 */
export function drawLottery(pool, { rng, odds = DEFAULT_LOTTERY_ODDS, drawn = 4 } = {}) {
  const weights = new Map(pool.map((id, i) => [id, odds[i] ?? 0]));
  const remaining = [...pool];
  const winners = [];
  for (let n = 0; n < Math.min(drawn, pool.length); n++) {
    const candidates = remaining.filter((id) => weights.get(id) > 0);
    if (!candidates.length) break;
    const total = candidates.reduce((a, id) => a + weights.get(id), 0);
    let roll = rng.next() * total;
    let chosen = candidates.at(-1);
    for (const id of candidates) {
      roll -= weights.get(id);
      if (roll < 0) { chosen = id; break; }
    }
    winners.push(chosen);
    remaining.splice(remaining.indexOf(chosen), 1);
  }
  return { drawn: winners, order: [...winners, ...remaining] };
}

const pct = (r) => (r.wins + r.losses ? r.wins / (r.wins + r.losses) : 0.5);

/**
 * @param standings [{ teamId, wins, losses, playoffs: boolean }]
 * @param picks     picks do Draft (todas as rodadas) — só id, round, originalTeamId, number/slotLocked são lidas
 * @returns { numbers: Map(pickId → número), lottery: { pool, odds, drawn, order }, round1Size, round2Size }
 */
export function planDraftOrder({ season, standings, picks, rng, odds = DEFAULT_LOTTERY_ODDS, lotteryTeams = 14, drawn = 4 }) {
  const tiebreak = new Map(standings.map((r) => [r.teamId, rng.next()]));
  const worstFirst = (a, b) => pct(a) - pct(b) || tiebreak.get(a.teamId) - tiebreak.get(b.teamId);
  const reservedFirst = picks.filter((p) => p.round === 1 && p.slotLocked && p.number != null);
  const reservedTeams = new Set(reservedFirst.map((p) => p.originalTeamId));
  const eligible = standings.filter((r) => !reservedTeams.has(r.teamId));

  const nonPlayoff = eligible.filter((r) => !r.playoffs).sort(worstFirst);
  const pool = nonPlayoff.slice(0, lotteryTeams).map((r) => r.teamId);
  const usedOdds = odds.slice(0, pool.length);
  const lottery = pool.length ? drawLottery(pool, { rng, odds: usedOdds, drawn }) : { drawn: [], order: [] };
  const rest = nonPlayoff.slice(lotteryTeams).map((r) => r.teamId);
  const playoff = eligible.filter((r) => r.playoffs).sort(worstFirst).map((r) => r.teamId);
  const sequence = [...lottery.order, ...rest, ...playoff];

  const round1Size = sequence.length + reservedFirst.length;
  const reservedSlots = new Map(reservedFirst.map((p) => [p.number, p.id]));
  const numbers = new Map(reservedFirst.map((p) => [p.id, p.number]));
  const queue = [...sequence];
  for (let slot = 1; slot <= round1Size; slot++) {
    if (reservedSlots.has(slot)) continue;
    const teamId = queue.shift();
    numbers.set(pickId(season, 1, teamId), slot);
  }

  const second = [...standings].sort(worstFirst).map((r) => r.teamId);
  second.forEach((teamId, i) => numbers.set(pickId(season, 2, teamId), round1Size + 1 + i));
  return { numbers, lottery: { pool, odds: usedOdds, drawn: lottery.drawn, order: lottery.order }, round1Size, round2Size: second.length, sequence };
}
