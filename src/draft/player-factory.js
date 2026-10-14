// Conversão de prospecto em jogador profissional (mesmo formato dos jogadores do seed).
import { markDirty, bumpRosters } from '../core/world.js';

/** ID numérico estável: 9.000.000 + (ano − 2000) × 1000 + posição na turma. Não colide com IDs reais da NBA. */
export function prospectPlayerId(prospect) {
  const rank = Number(prospect.id.split('-').at(-1));
  return 9000000 + (prospect.draftYear - 2000) * 1000 + rank;
}

function freeJersey(world, teamId) {
  const used = new Set([...world.players.values()].filter((p) => p.teamId === teamId).map((p) => String(p.jersey)));
  for (let n = 1; n < 100; n++) if (!used.has(String(n))) return String(n);
  return '0';
}

export function prospectToPlayer(world, prospect, { teamId, round, number, season }) {
  const id = prospectPlayerId(prospect);
  if (world.players.has(id)) throw new Error(`Jogador ${id} já existe (prospecto convertido duas vezes).`);
  const [by, bm, bd] = prospect.birthDate.split('-').map(Number);
  const age = season - by - (bm > 6 ? 1 : 0);
  return {
    id, espnId: null, name: prospect.name, firstName: prospect.firstName, lastName: prospect.lastName, teamId,
    jersey: teamId ? freeJersey(world, teamId) : null, positionLabel: prospect.positions[0], heightIn: prospect.heightIn, weight: prospect.weight,
    birthDate: prospect.birthDate, age, country: prospect.country, birthPlace: prospect.country, college: prospect.school,
    draft: round ? { year: season, round, pick: number, team: teamId } : { year: null, round: null, pick: null, team: null, undraftedIn: season },
    exp: 0, rookie: true, injury: null, combine: null, positions: [...prospect.positions], attributes: { ...prospect.attributes }, tendencies: { ...prospect.tendencies },
    potential: prospect.potential, ovr: prospect.ovr, ratingConfidence: 'none', sampleMinutes: 0,
    rosterStatus: round === 1 ? 'standard' : round === 2 ? 'camp' : 'standard',
    fictional: Boolean(prospect.fictional), photoSource: 'none', prospectId: prospect.id,
  };
}

/** Prospecto sem escolha: vira agente livre, com direito a contrato mínimo. */
export function createUndraftedPlayer(world, prospect) {
  const player = prospectToPlayer(world, prospect, { teamId: null, round: null, number: null, season: prospect.draftYear });
  world.players.set(player.id, player);
  world.careerStats.set(player.id, { playerId: player.id, rows: [], advanced: null });
  prospect.playerId = player.id;
  markDirty('players', player.id);
  markDirty('careerStats', player.id);
  markDirty('prospects', prospect.id);
  bumpRosters();
  return player;
}
