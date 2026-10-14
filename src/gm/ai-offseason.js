// Decisões da IA na offseason: opções contratuais, renovações (Bird rights), free agency dia a dia e ajuste
// de elenco (cortes, conversões para two-way e preenchimento até o mínimo). A franquia do usuário nunca é
// tocada aqui; as decisões automáticas do usuário vivem em season/offseason.js (autoCompleteOffseason).
import { createRng } from '../core/rng.js';
import { markDirty } from '../core/world.js';
import { aiOptionDecision, buildContract, checkSigning, decideOption, freeAgents, marketAsk, minSalaryFor, pendingOptions, rightsOf, signFreeAgentOffer, waivePlayer } from '../contracts/contracts-engine.js';
import { capSeason } from '../contracts/rules-config.js';
import { ownerBudget, payrollSnapshot } from '../contracts/finance.js';
import { playerValue } from '../contracts/valuation.js';
import { profileOf } from './personality.js';
import { ageOf, rosterOf, teamNeeds } from './team-context.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dollarsPerPoint = (cap) => 0.4e6 * (cap.salaryCap / 164961000);

const standardCount = (world, teamId) => rosterOf(world, teamId).filter((p) => p.rosterStatus !== 'two-way').length;
const aiTeams = (world, includeUser = false) => [...world.teams.values()].filter((t) => includeUser || t.id !== world.career.teamId);

// ------------------------------------------------------------------ opções
/** Decide todas as opções do ano de cap atual. O usuário decide as team options do seu time (passe `skipTeamId`). */
export function resolveOptions(world, { skipTeamId = null } = {}) {
  const decided = [];
  for (const option of pendingOptions(world)) {
    if (option.kind === 'team' && option.teamId === skipTeamId) continue;
    const exercise = aiOptionDecision(world, option);
    decideOption(world, { playerId: option.playerId, exercise });
    decided.push({ ...option, exercise });
  }
  return decided;
}

// ------------------------------------------------------------------ renovações
export function aiReSign(world, teamId) {
  const team = world.teams.get(teamId);
  const profile = profileOf(team);
  const budget = ownerBudget(world, teamId);
  const signed = [];
  const rng = createRng(`${world.saveId}:resign:${world.calendar.season}:${teamId}`);
  const $pp = dollarsPerPoint(world.league.cap);
  const rights = rightsOf(world, teamId).map((id) => world.players.get(id)).sort((a, b) => b.ovr - a.ovr);
  for (const player of rights) {
    const ask = marketAsk(world, player);
    const value = playerValue(world, player, { teamId, view: 'internal' });
    const surplus = value.base - (ask.salary / $pp) * 0.45;
    const roster = standardCount(world, teamId);
    const payroll = payrollSnapshot(world, teamId).total;
    const need = roster < 12 ? 0.25 : 0;
    const keepable = value.base >= 7 && surplus > -9 * (profile.salary ?? 1);
    const starBonus = player.ovr >= 82 ? 0.35 : 0;
    const budgetOk = !budget.enforced || payroll + ask.salary <= budget.ceiling * 1.02 || player.ovr >= 86;
    const chance = clamp(0.4 + starBonus + need + surplus / 80, 0.05, 0.95);
    if (!(keepable || need) || !budgetOk || !rng.chance(chance)) continue;
    try {
      signFreeAgentOffer(world, { teamId, playerId: player.id, salary: Math.round(ask.salary * rng.float(0.97, 1.03)), years: ask.years, route: 'bird', bypassAgent: true, by: 'ai' });
      signed.push(player.id);
    } catch { /* inviável (cap/roster): o jogador vai ao mercado */ }
  }
  return signed;
}

// ------------------------------------------------------------------ free agency
/** Um dia de free agency: as franquias da IA fazem ofertas aos melhores agentes livres. */
export function aiFreeAgencyDay(world, { day = 0 } = {}) {
  const rng = createRng(`${world.saveId}:fa:${world.calendar.season}:${day}`);
  const pool = freeAgents(world)
    .map((p) => ({ p, v: playerValue(world, p, { view: 'god' }).base }))
    .filter((x) => x.v > 1.5)
    .sort((a, b) => b.v - a.v)
    .slice(0, 45);
  const signings = [];
  const teams = rng.shuffle(aiTeams(world));
  for (const { p } of pool) {
    if (p.teamId) continue;
    const ask = marketAsk(world, p);
    const tries = rng.shuffle(teams).slice(0, 7);
    let best = null;
    for (const team of tries) {
      if (standardCount(world, team.id) >= 15) continue;
      const check = checkSigning(world, { teamId: team.id, playerId: p.id, salary: ask.salary, years: ask.years });
      if (!check.ok) continue;
      const needs = teamNeeds(world, team.id);
      const need = Math.max(needs.byPosition[p.positions[0]] ?? 0, 0);
      const rank = playerValue(world, p, { teamId: team.id, view: 'internal' });
      const score = rank.value + need * 6 + rng.next() * 4 + (profileOf(team).now ?? 1) * 1.5;
      if (rank.value < 2 && standardCount(world, team.id) >= 13) continue;
      if (!best || score > best.score) best = { team, score, route: check.route };
    }
    if (!best) continue;
    const chance = p.ovr >= 80 ? 0.5 : p.ovr >= 72 ? 0.42 : 0.32;
    if (!rng.chance(chance)) continue;
    try {
      signFreeAgentOffer(world, { teamId: best.team.id, playerId: p.id, salary: Math.round(ask.salary * rng.float(0.99, 1.04)), years: ask.years, route: best.route?.id ?? 'auto', bypassAgent: true, by: 'ai' });
      signings.push({ playerId: p.id, teamId: best.team.id });
    } catch { /* outro time fechou antes ou regra mudou */ }
  }
  return signings;
}

// ------------------------------------------------------------------ elenco
function worstTo(world, teamId, filter) {
  return rosterOf(world, teamId).filter(filter).map((p) => ({ p, v: playerValue(world, p, { teamId, view: 'internal' }).value + (world.contracts.get(p.id)?.type === 'camp' ? -5 : 0) })).sort((a, b) => a.v - b.v)[0]?.p ?? null;
}

/** Contrata o melhor agente livre acessível (mínimo ou exceção) até `target` jogadores padrão. */
export function fillRoster(world, teamId, target = 13) {
  const signed = [];
  let guard = 0;
  while (standardCount(world, teamId) < target && guard++ < 12) {
    const needs = teamNeeds(world, teamId);
    const options = freeAgents(world).map((p) => ({ p, v: playerValue(world, p, { teamId, view: 'internal' }).value + (needs.byPosition[p.positions[0]] ?? 0) * 3 })).sort((a, b) => b.v - a.v).slice(0, 25);
    let done = false;
    for (const { p } of options) {
      const salary = Math.max(minSalaryFor(world, p), Math.min(marketAsk(world, p).salary, minSalaryFor(world, p) * 1.0));
      try {
        signFreeAgentOffer(world, { teamId, playerId: p.id, salary, years: 1, route: 'auto', bypassAgent: true, by: 'ai' });
        signed.push(p.id);
        done = true;
        break;
      } catch { /* tenta o próximo */ }
    }
    if (!done) break;
  }
  return signed;
}

/** Cortes e conversões até ficar dentro dos limites do início da temporada, depois preenche até o mínimo. */
export function aiRosterAdjust(world, teamId, { minimum = 13 } = {}) {
  const { standardMax, twoWayMax } = world.league.roster;
  const actions = [];
  // 1) convidados de training camp: viram two-way (se houver vaga e potencial), são promovidos (se faltar gente) ou cortados
  for (const p of rosterOf(world, teamId).filter((x) => x.rosterStatus === 'camp').sort((a, b) => b.ovr - a.ovr)) {
    const two = rosterOf(world, teamId).filter((x) => x.rosterStatus === 'two-way').length;
    const std = standardCount(world, teamId) - rosterOf(world, teamId).filter((x) => x.rosterStatus === 'camp').length;
    const contract = world.contracts.get(p.id);
    if (two < twoWayMax && p.potential - p.ovr >= 4 && ageOf(world, p) <= 24) {
      convertToTwoWay(world, p, contract);
      actions.push({ type: 'two-way', playerId: p.id });
    } else if (std < minimum || (p.ovr >= 68 && std < standardMax - 1)) {
      promoteCamp(world, p, contract);
      actions.push({ type: 'promote', playerId: p.id });
    } else {
      waivePlayer(world, { teamId, playerId: p.id, by: 'ai' });
      actions.push({ type: 'waive', playerId: p.id });
    }
  }
  // 2) acima do limite
  let guard = 0;
  while (standardCount(world, teamId) > standardMax && guard++ < 12) {
    const cut = worstTo(world, teamId, (p) => p.rosterStatus !== 'two-way');
    if (!cut) break;
    waivePlayer(world, { teamId, playerId: cut.id, by: 'ai' });
    actions.push({ type: 'waive', playerId: cut.id });
  }
  guard = 0;
  while (rosterOf(world, teamId).filter((p) => p.rosterStatus === 'two-way').length > twoWayMax && guard++ < 6) {
    const cut = worstTo(world, teamId, (p) => p.rosterStatus === 'two-way');
    waivePlayer(world, { teamId, playerId: cut.id, by: 'ai' });
    actions.push({ type: 'waive', playerId: cut.id });
  }
  // 3) abaixo do mínimo
  for (const id of fillRoster(world, teamId, minimum)) actions.push({ type: 'sign', playerId: id });
  return actions;
}

export function convertToTwoWay(world, player, contract = world.contracts.get(player.id)) {
  const season = capSeason(world);
  const sal = world.league.cap.twoWaySalary;
  const next = buildContract({ playerId: player.id, teamId: player.teamId, season, salary: sal, years: 2, type: 'two-way', source: 'conversion' });
  next.twoWay = true;
  next.type = 'two-way';
  world.contracts.set(player.id, { ...next, signedOn: world.calendar.date });
  player.rosterStatus = 'two-way';
  markDirty('players', player.id);
  markDirty('contracts', player.id);
  void contract;
}

export function promoteCamp(world, player, contract = world.contracts.get(player.id)) {
  contract.type = 'standard';
  contract.years = contract.years.map((y) => ({ ...y, guaranteed: undefined }));
  contract.years.forEach((y) => { if (y.guaranteed === undefined) delete y.guaranteed; });
  player.rosterStatus = 'standard';
  markDirty('players', player.id);
  markDirty('contracts', player.id);
}
