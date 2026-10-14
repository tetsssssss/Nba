// Estatísticas derivadas do box score REAL do motor Street (cestas valem 1 ou 2).
// Somente leitura: não modifica eventos, rosters, partidas ou saves de carreira.
const safeCount = value => Number.isFinite(value) && value >= 0 ? value : 0;
const percentage = (made, attempts) => attempts ? `${(100 * made / attempts).toFixed(1)}%` : '—';
const add = (a, b) => ({
  pts: a.pts + b.pts, fgm: a.fgm + b.fgm, fga: a.fga + b.fga,
  oneMade: a.oneMade + b.oneMade, oneAtt: a.oneAtt + b.oneAtt,
  twoMade: a.twoMade + b.twoMade, twoAtt: a.twoAtt + b.twoAtt,
  steals: a.steals + b.steals, turnovers: a.turnovers + b.turnovers,
});
const empty = () => ({ pts: 0, fgm: 0, fga: 0, oneMade: 0, oneAtt: 0,
  twoMade: 0, twoAtt: 0, steals: 0, turnovers: 0 });

export function streetStatistics(game) {
  if (!Array.isArray(game?.teams) || game.teams.length !== 2 || !Array.isArray(game.box) || game.box.length !== 2)
    throw Error('Street: partida sem estatísticas válidas.');
  return game.teams.map((team, side) => {
    const players = (team.roster ?? []).map(player => {
      const raw = game.box[side]?.[String(player.id)] ?? {};
      const fgm = safeCount(raw.fgm), fga = safeCount(raw.fga);
      const twoMade = safeCount(raw.tpm), twoAtt = safeCount(raw.tpa);
      const counts = { pts: safeCount(raw.pts), fgm, fga,
        oneMade: Math.max(0, fgm - twoMade), oneAtt: Math.max(0, fga - twoAtt),
        twoMade, twoAtt, steals: safeCount(raw.stl), turnovers: safeCount(raw.tov) };
      return { id: String(player.id), name: player.name, ...counts,
        fgPct: percentage(fgm, fga) };
    });
    const totals = players.reduce((sum, player) => add(sum, player), empty());
    return { side, name: team.name, players,
      totals: { ...totals, fgPct: percentage(totals.fgm, totals.fga) } };
  });
}

// Identifica o protagonista registrado no evento, sem inventar movimento na quadra.
export function streetPlayFocus(game) {
  const event = game?.events?.[0];
  if (!event) return null;
  const playerId = event.kind === 'steal' ? event.defenderId : event.playerId;
  if (playerId == null) return null;
  return { playerId: String(playerId), kind: event.kind,
    label: event.kind === 'steal' ? 'Roubo de bola' :
      event.kind === 'long' ? 'Cesta de 2 pontos' :
      event.kind === 'drive' ? 'Cesta de 1 ponto' : 'Tentativa de arremesso' };
}
