// Evolution 1001+: an IN-MEMORY exhibition event, not a WNBA career/season save.
import { WNBA_BY_ID } from './catalog.js';
import { simulateWnbaExhibition } from './engine.js';

const allowedCounts = new Set([4,6,8,10,15]);
function validateTeams(teamIds) {
  if (!Array.isArray(teamIds) || !allowedCounts.has(teamIds.length))
    throw Error('Liga Arcade exige 4, 6, 8, 10 ou 15 franquias.');
  if (new Set(teamIds).size !== teamIds.length || teamIds.some(id => !WNBA_BY_ID.has(id)))
    throw Error('Selecione franquias WNBA válidas e sem repetição.');
  return [...teamIds];
}
/** Circle tournament; handles 15 teams with a bye (null), never fabricating results. */
export function buildWnbaArcadeSchedule(teamIds, { doubleRound = false } = {}) {
  const ids = validateTeams(teamIds);
  if (typeof doubleRound !== 'boolean') throw Error('Formato de ida e volta inválido.');
  let rotation = ids.length % 2 ? [...ids, null] : [...ids];
  const rounds = [];
  for (let round = 0; round < rotation.length - 1; round++) {
    const fixtures = [];
    for (let n = 0; n < rotation.length / 2; n++) {
      const first = rotation[n], second = rotation[rotation.length - 1 - n];
      if (first === null || second === null) continue;
      const flip = (round + n) % 2 === 1;
      fixtures.push({ home: flip ? second : first, away: flip ? first : second, round: round + 1 });
    }
    rounds.push(fixtures);
    rotation = [rotation[0], rotation.at(-1), ...rotation.slice(1, -1)];
  }
  if (doubleRound) {
    const first = rounds.length;
    rounds.push(...rounds.slice(0, first).map((fixtures, offset) => fixtures.map(f => ({ home: f.away, away: f.home, round: first + offset + 1 }))));
  }
  return rounds;
}

export function runWnbaArcadeLeague(teamIds, { seed = 'wnba-league-arcade', doubleRound = false, finals = true } = {}) {
  const ids = validateTeams(teamIds);
  if (typeof seed !== 'string' || seed.length > 80 || typeof finals !== 'boolean') throw Error('Configuração Arcade inválida.');
  const schedule = buildWnbaArcadeSchedule(ids, { doubleRound });
  const byTeam = new Map(ids.map(id => [id, { id, name: WNBA_BY_ID.get(id).fullName, played: 0, wins: 0, losses: 0, pf: 0, pa: 0, diff: 0, pct: 0 }]));
  const rounds = schedule.map((fixtures, round) => fixtures.map((f, index) => {
    const game = simulateWnbaExhibition(f.home, f.away, { seed: `${seed}:round${round + 1}:game${index + 1}` });
    const h = byTeam.get(f.home), a = byTeam.get(f.away);
    for (const row of [h, a]) row.played++;
    h.pf += game.score[0]; h.pa += game.score[1]; a.pf += game.score[1]; a.pa += game.score[0];
    byTeam.get(game.winner).wins++;
    byTeam.get(game.winner === f.home ? f.away : f.home).losses++;
    return { ...f, score: [...game.score], winner: game.winner, ot: game.ot };
  }));
  const standings = [...byTeam.values()].map(row => ({ ...row, diff: row.pf - row.pa, pct: row.played ? row.wins / row.played : 0 }))
    .sort((a, b) => b.wins - a.wins || b.diff - a.diff || b.pf - a.pf || a.name.localeCompare(b.name));
  const bracket = [];
  let champion = standings[0]?.id ?? null;
  if (finals) {
    const ordered = [standings[0].id, standings[3].id, standings[1].id, standings[2].id];
    const semifinals = [];
    for (let i = 0; i < 4; i += 2) {
      const g = simulateWnbaExhibition(ordered[i], ordered[i+1], { seed: `${seed}:semi${i/2}` });
      semifinals.push({ home: ordered[i], away: ordered[i+1], score: g.score, winner: g.winner, ot: g.ot });
    }
    bracket.push(semifinals);
    const finalGame = simulateWnbaExhibition(semifinals[0].winner, semifinals[1].winner, { seed: `${seed}:final` });
    bracket.push([{ home: semifinals[0].winner, away: semifinals[1].winner, score: finalGame.score, winner: finalGame.winner, ot: finalGame.ot }]);
    champion = finalGame.winner;
  }
  return { league:'WNBA', mode:'instant-arcade-league', seed, teamIds:ids, doubleRound, schedule:rounds,
    standings, bracket, champion, games:rounds.reduce((n, r) => n + r.length, 0), persisted:false };
}
