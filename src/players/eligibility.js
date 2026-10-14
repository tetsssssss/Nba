// Invariantes compartilhadas por simulações rápidas e partidas oficiais.
export const COURT_PLAYERS = 5;
export function playableRoster(roster) {
  return (roster ?? []).filter((p) => p && p.injury?.status !== 'Out' && p.rosterStatus !== 'inactive');
}
export function assertPlayableRoster(team, { min = COURT_PLAYERS } = {}) {
  const players = playableRoster(team?.roster);
  if (players.length < min) {
    const err = new Error(`Elenco de ${team?.id ?? 'equipe'} tem ${players.length} atleta(s) disponíveis; são necessários ${min}.`);
    err.code = 'INSUFFICIENT_ROSTER';
    throw err;
  }
  if (new Set(players.map((p) => p.id)).size !== players.length) throw new Error('Elenco contém atletas repetidos.');
  return players;
}
