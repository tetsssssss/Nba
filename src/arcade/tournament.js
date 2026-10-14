// Copa avulsa de eliminação simples, com o motor rápido existente e sem persistência na carreira.
import { createRng } from '../core/rng.js';
import { simulateQuickGame } from '../season/quick-game.js';
export function createTournament(teams, { seed = 'copa' } = {}) {
  if (![4, 8].includes(teams.length)) throw Error('A copa exige 4 ou 8 franquias.');
  if (new Set(teams.map((t) => t.id)).size !== teams.length) throw Error('Não repita franquias.');
  if (teams.some((t) => t.roster?.filter((p) => p.injury?.status !== 'Out').length < 5)) throw Error('Franquia sem cinco atletas disponíveis.');
  return { seed: String(seed), teamIds: teams.map((t) => t.id), rounds: [], champion: null };
}
export function runTournament(teams, { seed = 'copa' } = {}) {
  const tournament = createTournament(teams, { seed });
  let current = [...teams];
  for (let round = 1; current.length > 1; round++) {
    const games = [];
    const advancing = [];
    for (let i = 0; i < current.length; i += 2) {
      const home = current[i]; const away = current[i + 1];
      const rng = createRng(`arcade-cup:${seed}:r${round}:g${i/2}`);
      const outcome = simulateQuickGame(home, away, rng, { type: 'exhibition' });
      const winner = outcome.score[0] > outcome.score[1] ? home : away;
      games.push({ home: home.id, away: away.id, score: outcome.score, winner: winner.id, periods: outcome.periods });
      advancing.push(winner);
    }
    tournament.rounds.push(games);
    current = advancing;
  }
  tournament.champion = current[0].id;
  return tournament;
}
