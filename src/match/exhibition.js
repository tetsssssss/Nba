// De onde vêm os times e elencos de uma partida avulsa: da carreira aberta (elencos como
// estão no universo do usuário) ou, sem carreira, direto do banco de dados inicial.
import { getWorld, teamRoster } from '../core/world.js';
import { buildPlayers, buildTeams, loadSeed } from '../core/universe.js';

const ROSTER_SIZE = 13;
const available = (players) => players.filter((p) => p.injury?.status !== 'Out').sort((a, b) => b.ovr - a.ovr).slice(0, ROSTER_SIZE);

/** @returns { source: 'career'|'seed', teams: [franquias com elenco], team(id), rosterOf(id), userTeamId } */
export async function matchUniverse() {
  const world = getWorld();
  let teams;
  let rosterOf;
  if (world) {
    teams = [...world.teams.values()];
    rosterOf = (id) => available(teamRoster(id));
  } else {
    const seed = await loadSeed();
    const players = buildPlayers(seed);
    teams = buildTeams(seed);
    rosterOf = (id) => available(players.filter((p) => p.teamId === id));
  }
  const cache = new Map();
  const roster = (id) => cache.get(id) ?? (cache.set(id, rosterOf(id)), cache.get(id));
  const playable = teams.filter((t) => roster(t.id).length >= 5).sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR'));
  const byId = new Map(teams.map((t) => [t.id, t]));
  return { source: world ? 'career' : 'seed', teams: playable, team: (id) => byId.get(id), rosterOf: roster, userTeamId: world?.career.teamId ?? null };
}
