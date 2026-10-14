// Aposentadorias. Decisão plausível por jogador (idade, produção, lesões, longevidade, vínculo, conquistas e
// motivação), com variação entre carreiras (semente = save + temporada + jogador). O jogador sai do elenco
// ativo, mas o registro, as estatísticas e o histórico permanecem. Contrato remanescente: sai da folha
// (regra da NBA) — ou vira dead money se o comissário assim decidir.
import { addNews, addTransaction, bumpRosters, markDirty } from '../core/world.js';
import { createRng } from '../core/rng.js';
import { ageOf } from '../gm/team-context.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const BASE = [[32, 0], [33, 0.012], [34, 0.04], [35, 0.09], [36, 0.17], [37, 0.29], [38, 0.44], [39, 0.6], [41, 0.82], [44, 0.95]];
const lerp = (table, x) => {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) if (x <= table[i][0]) { const [x0, y0] = table[i - 1]; const [x1, y1] = table[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
  return table.at(-1)[1];
};

/**
 * Probabilidade e motivo de aposentadoria ao fim de `season`.
 * @param ctx { champion: boolean, seasonsWithoutContract }
 */
export function retirementOutlook(world, player, { season = world.calendar.season, champion = false } = {}) {
  const age = ageOf(world, player);
  const contract = world.contracts.get(player.id);
  const futureYears = contract && player.teamId ? contract.years.filter((y) => y.season > season).length : 0;
  const reasons = [];
  let p = lerp(BASE, age);
  if (age >= 34) {
    if (player.ovr < 68) { p += 0.14; reasons.push('rendimento em queda'); }
    else if (player.ovr < 74) p += 0.05;
    if (player.ovr >= 86) { p *= 0.45; reasons.push('ainda é estrela'); }
    else if (player.ovr >= 80) p *= 0.7;
  }
  if (player.injury?.status === 'Out' && age >= 32) { p += 0.09; reasons.push('lesão recente'); }
  const exp = player.exp ?? 0;
  if (exp >= 15) { p += 0.05; reasons.push(`${exp} temporadas de carreira`); }
  if (futureYears > 0) p *= futureYears >= 2 ? 0.45 : 0.7; // contrato garantido segura o jogador
  else if (player.teamId) p *= 1.2;
  const freeSeasons = player.freeSeasons ?? 0;
  if (!player.teamId) {
    p += freeSeasons >= 2 ? 0.28 : freeSeasons >= 1 ? 0.1 : 0;
    if (freeSeasons >= 1) reasons.push('sem contrato há temporadas');
    if (player.ovr < 66 && freeSeasons >= 2 && age >= 28) p += 0.2;
  }
  if (champion && age >= 35) { p += 0.06; reasons.push('encerrar no auge, campeão'); }
  const drive = ((player.attributes?.competitiveness ?? 60) + (player.attributes?.workEthic ?? 60)) / 2;
  p *= clamp(1.18 - drive / 220, 0.7, 1.15); // motivação: competitivos jogam por mais tempo
  p = clamp(p, 0, 0.97);
  return { age, probability: p, reasons, futureYears, freeSeasons };
}

/** Decide (de forma determinística) quem se aposenta. Não altera nada. */
export function decideRetirements(world, season = world.calendar.season) {
  const champion = world.calendar.postseason?.champion ?? null;
  const out = [];
  for (const player of world.players.values()) {
    if (player.retired) continue;
    const outlook = retirementOutlook(world, player, { season, champion: player.teamId === champion });
    if (outlook.probability <= 0) continue;
    const roll = createRng(`${world.saveId}:retire:${season}:${player.id}`).next();
    out.push({ playerId: player.id, teamId: player.teamId, age: outlook.age, ovr: player.ovr, probability: outlook.probability, reasons: outlook.reasons, retires: roll < outlook.probability });
  }
  return out.sort((a, b) => b.probability - a.probability);
}

/**
 * Aposenta o jogador. O contrato sai da folha (alívio de cap) ou, com `deadMoney: true`, o restante garantido
 * fica na folha como dead money. Mantém o registro do jogador, as estatísticas e o histórico da franquia.
 */
export function retirePlayer(world, playerId, { season = world.calendar.season, reason = null, deadMoney = false, announce = true } = {}) {
  const player = world.players.get(playerId);
  if (!player || player.retired) return null;
  const teamId = player.teamId;
  const team = teamId ? world.teams.get(teamId) : null;
  const contract = world.contracts.get(playerId);
  const remaining = (contract?.years ?? []).filter((y) => y.season > season);
  const age = ageOf(world, player);
  player.retired = { season, age, ovr: player.ovr, teamId, reason: reason ?? 'Fim de carreira', contractYearsVoided: remaining.length };
  player.teamId = null;
  player.rosterStatus = 'retired';
  player.injury = null;
  if (team) {
    team.retiredPlayers = [...(team.retiredPlayers ?? []), { playerId, name: player.name, season, ovr: player.ovr, age, yearsWithTeam: contract?.yearsWithTeam ?? null }];
    if (deadMoney && remaining.length) team.deadMoney = [...(team.deadMoney ?? []), { name: player.name, playerId, years: remaining.map((y) => ({ season: y.season, amount: y.salary })), retirement: true }];
    markDirty('teams', team.id);
  }
  if (contract) {
    contract.status = 'retired';
    contract.retiredOn = world.calendar.date;
    contract.lastTeamId = teamId;
    contract.teamId = null;
    markDirty('contracts', playerId);
  }
  markDirty('players', playerId);
  bumpRosters();
  addTransaction({ type: 'retirement', playerIds: [playerId], fromTeamId: teamId, toTeamId: null, note: `${player.retired.reason}${remaining.length ? ` · ${remaining.length} ano(s) de contrato ${deadMoney ? 'viram dead money' : 'saem da folha'}` : ''}` });
  if (announce) {
    addNews({ category: 'liga', title: `${player.name} anuncia a aposentadoria`, body: `${age} anos, ${player.exp ?? 0} temporada(s) na NBA${team ? `, últimas pelo ${team.fullName}` : ''}. ${remaining.length ? (deadMoney ? 'O restante do contrato permanece na folha como dead money.' : 'O contrato restante sai da folha da franquia.') : ''}`, teamIds: team ? [team.id] : [], playerIds: [playerId] });
  }
  return player.retired;
}

/** Reverte uma aposentadoria (God Mode). O jogador volta como agente livre. */
export function unretirePlayer(world, playerId) {
  const player = world.players.get(playerId);
  if (!player?.retired) return false;
  delete player.retired;
  player.rosterStatus = 'standard';
  player.freeSeasons = 0;
  markDirty('players', playerId);
  bumpRosters();
  return true;
}
