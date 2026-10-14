// Expansion Draft AUTOMÁTICO: a versão mínima que permite a temporada começar com 32 elencos.
// Regras do universo (data/static/league.json → expansion): cada franquia protege 7 jogadores e
// perde no máximo 2; as duas novas franquias escolhem alternadamente entre os desprotegidos.
// A versão interativa (o usuário escolhe os protegidos e as picks) continua prevista para a Fase 3.
// Função pura: recebe jogadores e devolve o plano; quem aplica é season.js.

const age = (p, date) => {
  if (!p.birthDate) return p.age ?? 27;
  return Number(date.slice(0, 4)) - Number(p.birthDate.slice(0, 4)) - (date.slice(5) < p.birthDate.slice(5) ? 1 : 0);
};

/** Valor de um jogador para protegê-lo ou escolhê-lo: nível atual, margem de evolução e idade. */
export function expansionValue(player, date) {
  const a = age(player, date);
  return player.ovr + 0.45 * Math.max(0, player.potential - player.ovr) - Math.max(0, a - 30) * 1.3 + Math.max(0, 25 - a) * 0.25;
}

/**
 * @param players   todos os jogadores do universo
 * @param opts      { existing: [ids das franquias que cedem], expansion: [ids das novas], protectedPerTeam, maxLostPerTeam, rosterTarget, date, rng, salaryOf }
 * @returns { protectedIds: { time: [ids] }, picks: [{ pick, teamId, fromTeamId, playerId }], order: [ids] }
 */
export function planExpansionDraft(players, { existing, expansion, protectedPerTeam = 7, maxLostPerTeam = 2, rosterTarget = 14, date, rng, salaryOf = () => 0, protectedOverrides = {}, preferredPicks = {} }) {
  const eligible = (p) => p.rosterStatus === 'standard' && p.injury?.status !== 'Out';
  const protectedIds = {};
  const pool = [];
  for (const teamId of existing) {
    const roster = players.filter((p) => p.teamId === teamId).sort((a, b) => expansionValue(b, date) - expansionValue(a, date));
    const override = protectedOverrides[teamId];
    const selected = Array.isArray(override) && override.length === Math.min(protectedPerTeam, roster.length) &&
      new Set(override).size === override.length && override.every((id) => roster.some((p) => p.id === id))
      ? override : roster.slice(0, protectedPerTeam).map((p) => p.id);
    protectedIds[teamId] = selected;
    for (const p of roster) if (!selected.includes(p.id) && eligible(p)) pool.push(p);
  }
  const lost = new Map(existing.map((id) => [id, 0]));
  const order = rng.shuffle(expansion); // sorteio de quem escolhe primeiro
  const rosters = new Map(expansion.map((id) => [id, []]));
  const picks = [];
  const need = (teamId, pos) => rosters.get(teamId).filter((p) => p.positions[0] === pos).length;
  for (let round = 0; round < rosterTarget; round++) {
    for (const teamId of order) {
      let best = null;
      let bestScore = -Infinity;
      for (const p of pool) {
        if (lost.get(p.teamId) >= maxLostPerTeam) continue;
        // equilíbrio de posições e algum cuidado com contratos caros de veteranos
        const priority = preferredPicks[teamId]?.indexOf(p.id) ?? -1;
        const score = expansionValue(p, date) - need(teamId, p.positions[0]) * 2.2 - Math.max(0, salaryOf(p) / 1e6 - 25) * 0.35 + (priority >= 0 ? 100 - priority : 0) + rng.next() * 0.5;
        if (score > bestScore) {
          bestScore = score;
          best = p;
        }
      }
      if (!best) continue;
      pool.splice(pool.indexOf(best), 1);
      lost.set(best.teamId, lost.get(best.teamId) + 1);
      rosters.get(teamId).push(best);
      picks.push({ pick: picks.length + 1, teamId, fromTeamId: best.teamId, playerId: best.id });
    }
  }
  return { protectedIds, picks, order };
}
