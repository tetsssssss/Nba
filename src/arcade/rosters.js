// Evolution 101–500: rosters de amistosos completamente isolados de World/IndexedDB.
import { buildPlayers, buildTeams, loadSeed } from '../core/universe.js';
import { createRng } from '../core/rng.js';

export const ARCADE_STORAGE_KEY = 'nba-arcade-rosters-v1';
export const ARCADE_SCHEMA = 1;
const ALLOWED = /^[\p{L}\p{N} .,'!&()_-]{1,42}$/u;
export const blankRoster = () => ({ version: ARCADE_SCHEMA, name: 'Meu universo alternativo',
  teams: [
    { id: 'CUSTOM_A', name: 'Time A', colors: ['#1a75ed','#f4f8ff'], playerIds: [] },
    { id: 'CUSTOM_B', name: 'Time B', colors: ['#ef4b70','#f4f8ff'], playerIds: [] },
  ] });
export function validateRoster(input, pool, { playable = false } = {}) {
  const ids = new Set(pool.map((p) => String(p.id)));
  if (!input || input.version !== 1 || !Array.isArray(input.teams) || input.teams.length !== 2) throw Error('Arquivo de rosters: formato ou versão inválida.');
  const seen = new Set();
  const teams = input.teams.map((t, i) => {
    if (!t || !Array.isArray(t.playerIds) || t.playerIds.length > 15 || !ALLOWED.test(t.name ?? '')) throw Error(`Time ${i + 1}: nome ou quantidade de atletas inválida.`);
    if (!Array.isArray(t.colors) || t.colors.length !== 2 || t.colors.some((c) => !/^#[0-9a-f]{6}$/i.test(c))) throw Error(`Time ${i + 1}: cores inválidas.`);
    if (playable && t.playerIds.length < 5) throw Error('Cada time precisa de cinco atletas para uma partida 5x5.');
    const cleanIds = t.playerIds.map((id) => String(id));
    for (const id of cleanIds) {
      if (!ids.has(id)) throw Error(`Jogador desconhecido: ${id}`);
      if (seen.has(id)) throw Error(`Jogador duplicado entre os times: ${id}`);
      seen.add(id);
    }
    return { id: i === 0 ? 'CUSTOM_A' : 'CUSTOM_B', name: t.name.trim(), colors: [...t.colors], playerIds: cleanIds };
  });
  return { version: 1, name: String(input.name ?? 'Meu universo alternativo').slice(0, 60), teams };
}
export function addPlayer(roster, side, playerId, pool) {
  if (![0, 1].includes(side)) throw Error('Time inválido.');
  const draft = structuredClone(roster);
  const id = String(playerId);
  for (const t of draft.teams) t.playerIds = t.playerIds.filter((p) => String(p) !== id);
  if (draft.teams[side].playerIds.length >= 15) throw Error('Limite de 15 atletas por time.');
  draft.teams[side].playerIds.push(id);
  return validateRoster(draft, pool);
}
export function removePlayer(roster, playerId, pool) {
  const draft = structuredClone(roster);
  for (const team of draft.teams) team.playerIds = team.playerIds.filter((id) => String(id) !== String(playerId));
  return validateRoster(draft, pool);
}
export function rosterTeams(roster, pool) {
  const clean = validateRoster(roster, pool, { playable: true });
  const byId = new Map(pool.map((p) => [String(p.id), p]));
  return clean.teams.map((t) => {
    const team = { id: t.id, name: t.name, fullName: t.name, colors: t.colors };
    return { ...team, team, roster: t.playerIds.map((id) => byId.get(id)), aiCoach: true };
  });
}
/** Converte escolhas de Street em elencos válidos, sem alterar o Roster Studio ou a carreira. */
export function streetTeamsFromRoster(roster, pool, picks, squadSize = 3) {
  if (![1, 2, 3].includes(squadSize)) throw Error('Street: escolha 1×1, 2×2 ou 3×3.');
  const clean = validateRoster(roster, pool);
  if (!Array.isArray(picks) || picks.length !== 2) throw Error('Street: escolhas das equipes inválidas.');
  const players = new Map(pool.map(p => [String(p.id), p]));
  const selected = new Set();
  return clean.teams.map((team, side) => {
    const ids = picks[side];
    if (!Array.isArray(ids) || ids.length < squadSize) throw Error(`Street: selecione ${squadSize} atleta(s) no time ${side + 1}.`);
    const roster = ids.slice(0, squadSize).map(id => {
      const key = String(id);
      if (!team.playerIds.includes(key) || !players.has(key)) throw Error(`Street: atleta ${key} não pertence ao time ${side + 1}.`);
      if (selected.has(key)) throw Error('Street: um atleta não pode ocupar duas posições.');
      selected.add(key);
      return players.get(key);
    });
    return { id: team.id, name: team.name, colors: [...team.colors], roster };
  });
}

export function defaultRoster(pool) {
  const draft = blankRoster();
  const sorted = [...pool].filter((p) => Number.isFinite(p.ovr)).sort((a, b) => b.ovr - a.ovr);
  // draft alternado sem duplicar jogadores
  for (let i = 0; i < Math.min(20, sorted.length); i++) draft.teams[i % 2].playerIds.push(String(sorted[i].id));
  return draft;
}
export function readRoster(storage, pool) {
  try { const value = storage?.getItem(ARCADE_STORAGE_KEY); if (value) return validateRoster(JSON.parse(value), pool); } catch { /* armazenamento bloqueado ou legado */ }
  return defaultRoster(pool);
}
export function writeRoster(storage, roster, pool) {
  const clean = validateRoster(roster, pool);
  storage.setItem(ARCADE_STORAGE_KEY, JSON.stringify(clean));
  return clean;
}
export async function loadArcadeUniverse() {
  const seed = await loadSeed();
  return { players: buildPlayers(seed), teams: buildTeams(seed) };
}

/** Cria um fantasy draft reproduzível, com 10 jogadores diferentes em cada equipe. */
export function fantasyDraft(pool, seed = 'dream-roster') {
  const base = blankRoster();
  const eligible = pool.filter((p) => Number.isFinite(p.ovr));
  // O hash da semente é estável e mantém a ordem independente do navegador.
  const { shuffle } = createRngForFantasy(seed);
  const chosen = shuffle(eligible).slice(0, 20);
  if (chosen.length < 10) throw Error('O fantasy draft exige ao menos 10 atletas disponíveis.');
  chosen.forEach((p, i) => base.teams[i % 2].playerIds.push(String(p.id)));
  return validateRoster(base, pool);
}
function createRngForFantasy(seed) { return createRng(`fantasy:${seed}`); }
