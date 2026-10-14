// Contratos e free agency: pedido do agente, resposta à oferta, rotas de assinatura (espaço no cap, exceções,
// Bird rights, mínimo), opções, renovações, extensões, dispensas com dead money e contratos de novato.
//
// Convenção: `capSeason(world)` é a temporada cujo cap vale agora. Valores oficiais (cap, exceções, salário
// máximo) vêm de league.json; escala de mínimos e de novatos estão marcadas como needsValidation lá.
import { markDirty, addNews, addTransaction, bumpRosters } from '../core/world.js';
import { createRng } from '../core/rng.js';
import { capLines, capHitIn, capSituation, luxuryTaxBill } from './cap.js';
import { capSeason } from './rules-config.js';
import { godModeAllowed, overrideActive } from '../core/godmode-permissions.js';
import { modeShows } from '../core/modes.js';
import { marketSalary, playerValue } from './valuation.js';
import { ownerBudget, payrollSnapshot } from './finance.js';
import { ageOf, leagueTable, projectedPickSlot, rosterOf } from '../gm/team-context.js';
import { money, addDays } from '../ui/format.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round = (v, step = 1000) => Math.round(v / step) * step;

export const ROUTE_LABEL = {
  cap: 'Espaço no salary cap',
  minimum: 'Contrato mínimo de veterano',
  nonTaxMle: 'Mid-level exception (abaixo do 1º apron)',
  taxMle: 'Mid-level exception de contribuinte',
  room: 'Room exception',
  biAnnual: 'Bi-annual exception',
  bird: 'Bird rights (renovação)',
};

// ------------------------------------------------------------------ limites de salário
export function minSalaryFor(world, player) {
  const scale = world.league.cap.minimumSalaryScale?.byYearsOfService;
  return scale?.[Math.min(scale.length - 1, player.exp ?? 0)] ?? 1000000;
}
export function maxSalaryFor(world, player) {
  const cap = world.league.cap;
  const m = cap.maxSalary ?? {};
  const fallback = cap.salaryCap * 0.25;
  const exp = player.exp ?? 0;
  return (exp >= 10 ? m.years10plus : exp >= 7 ? m.years7to9 : m.years0to6) ?? fallback;
}

// ------------------------------------------------------------------ free agents e direitos
export const freeAgents = (world) => [...world.players.values()].filter((p) => !p.teamId && !p.retired);

/** Direitos de renovação (Bird) e cap holds de um time na janela da free agency. */
export function ensureRights(world) {
  const off = world.offseason;
  if (!off) return null;
  off.rights ??= {};
  return off.rights;
}
export function rightsOf(world, teamId) {
  return (world.offseason?.rights?.[teamId] ?? []).filter((id) => {
    const p = world.players.get(id);
    return p && !p.teamId && !p.retired;
  });
}
export function capHoldFor(world, player, lastSalary) {
  const hold = Math.max(lastSalary * 1.5, minSalaryFor(world, player));
  return Math.min(hold, maxSalaryFor(world, player));
}
export function capHolds(world, teamId) {
  if (!capLines(world.career.capMode).aprons) return 0; // holds só existem nos modos Avançado/NBA completo
  const rights = world.offseason?.rightsInfo ?? {};
  return rightsOf(world, teamId).reduce((a, id) => a + (rights[id]?.hold ?? 0), 0);
}

// ------------------------------------------------------------------ exceções
export function exceptionsFor(world, teamId) {
  const team = world.teams.get(teamId);
  const season = capSeason(world);
  const base = world.league.cap.exceptions ?? {};
  if (!team.exceptions || team.exceptions.season !== season) {
    const prev = team.exceptions;
    const payroll = payrollSnapshot(world, teamId, season);
    team.exceptions = {
      season,
      nonTaxMle: base.nonTaxpayerMLE ?? 0,
      taxMle: base.taxpayerMLE ?? 0,
      room: payroll.total < world.league.cap.salaryCap ? base.roomException ?? 0 : 0,
      biAnnual: prev?.biAnnualUsedSeason === season - 1 ? 0 : base.biAnnual ?? 0,
      biAnnualUsedSeason: prev?.biAnnualUsedSeason ?? null,
    };
    markDirty('teams', teamId);
  }
  return team.exceptions;
}

// ------------------------------------------------------------------ pedido do agente
const BASE_YEARS = (age) => (age <= 24 ? 4 : age <= 29 ? 4 : age <= 33 ? 3 : 2);

export function marketAsk(world, player, { teamId = null } = {}) {
  const age = ageOf(world, player);
  const cap = world.league.cap;
  const demand = world.career.modifiers?.contractDemands ?? 1;
  const value = playerValue(world, player, { view: 'god' });
  const ageMult = age >= 34 ? 0.82 : age >= 32 ? 0.9 : age <= 23 ? 1.05 : 1;
  const formMult = 1 + clamp((value.production.factor - 1) * 3, -0.1, 0.1);
  let salary = marketSalary(player.ovr, cap) * ageMult * formMult * (teamId && teamId === world.career.teamId ? 1 + (demand - 1) * 0.12 : 1);
  salary = clamp(salary, minSalaryFor(world, player), maxSalaryFor(world, player));
  return { salary: round(salary, 10000), years: BASE_YEARS(age), minSalary: minSalaryFor(world, player), maxSalary: maxSalaryFor(world, player), age, marketValue: marketSalary(player.ovr, cap) };
}

/** Quantas franquias da IA conseguiriam pagar o pedido (concorrência do mercado). */
export function marketHeat(world, player, askSalary) {
  const cap = world.league.cap.salaryCap;
  let teams = 0;
  for (const team of world.teams.values()) {
    if (team.id === world.career.teamId) continue;
    const payroll = payrollSnapshot(world, team.id);
    if (cap - payroll.total >= askSalary * 0.9) teams++;
  }
  return teams;
}

/**
 * Resposta do agente a uma oferta. Considera salário, duração, interesse do jogador na franquia
 * (campanha, mercado, minutos, vínculo), concorrência e a atração de free agents configurada na carreira.
 */
export function agentResponse(world, { teamId, playerId, salary, years, playerOption = false }) {
  const player = world.players.get(playerId);
  const team = world.teams.get(teamId);
  const ask = marketAsk(world, player, { teamId });
  const table = leagueTable(world);
  const rank = table.rows.get(teamId)?.rank ?? 16;
  const roster = rosterOf(world, teamId).filter((p) => p.id !== playerId);
  const better = roster.filter((p) => p.ovr > player.ovr).length;
  const factors = [];
  let interest = 0.5;
  const add = (label, value) => { interest += value; factors.push({ label, value }); };
  add('Campanha e ambição do time', ((16.5 - rank) / 16) * 0.2);
  add('Tamanho do mercado', ((team.market - 60) / 40) * 0.12);
  add(better <= 2 ? 'Papel de destaque no elenco' : better >= 8 ? 'Poucos minutos previstos' : 'Papel de rotação', better <= 2 ? 0.1 : better >= 8 ? -0.12 : 0);
  const rights = world.offseason?.rights?.[teamId]?.includes(playerId);
  if (rights) add('Vínculo com a franquia', 0.1);
  const age = ask.age;
  if (age >= 31) add('Veterano: valoriza elenco competitivo', ((16.5 - rank) / 16) * 0.12);
  const reluctance = teamId === world.career.teamId ? world.career.modifiers?.freeAgentReluctance ?? 1 : 1;
  const heat = marketHeat(world, player, ask.salary);
  const heatMult = 1 + Math.min(6, heat) * 0.008;
  interest = clamp(interest, 0, 1);
  let required = ask.salary * (1.1 - 0.2 * interest) * heatMult * (1 + (reluctance - 1) * 0.08);
  const yearDiff = Math.abs(years - ask.years);
  required *= 1 + Math.max(0, yearDiff - 1) * 0.02;
  if (playerOption) required *= 0.96;
  required = clamp(round(required, 10000), ask.minSalary, ask.maxSalary);
  const accepted = salary >= required - 1;
  const counter = accepted ? null : { salary: required, years: ask.years };
  const mood = interest > 0.65 ? 'animado' : interest > 0.4 ? 'neutro' : 'reticente';
  const lines = [
    `Agente de ${player.name}: pede ${money(ask.salary)} por ${ask.years} ano(s) como referência de mercado.`,
    accepted ? `Com ${money(salary)} por ${years} ano(s) o acordo está dentro do que o jogador aceita.` : `Com ${money(salary)} por ${years} ano(s), falta ${money(required - salary)} para o jogador aceitar.`,
    `Clima: ${mood}${heat > 8 ? '; há muita concorrência por ele no mercado' : heat < 3 ? '; poucas franquias têm espaço para cobrir a oferta' : ''}.`,
  ];
  return { accepted, ask, required, counter, interest, mood, heat, factors, message: lines.join(' ') };
}

// ------------------------------------------------------------------ rotas de assinatura
function rosterMax(world) {
  const { standardMax = 15, offseasonMax = 21 } = world.league.roster ?? {};
  return ['regular', 'playoffs'].includes(world.calendar.phase) ? standardMax : offseasonMax;
}

/**
 * Rotas válidas (e inválidas, com o motivo) para contratar `player` por `salary` × `years`.
 * @returns [{ id, label, ok, reason }]
 */
export function signingRoutes(world, { teamId, playerId, salary, years }) {
  const player = world.players.get(playerId);
  const cap = world.league.cap;
  const capMode = world.career.capMode;
  const lines = capLines(capMode);
  const advanced = lines.aprons;
  const season = capSeason(world);
  const payroll = payrollSnapshot(world, teamId, season);
  const holds = capHolds(world, teamId);
  const ex = advanced ? exceptionsFor(world, teamId) : null;
  const after = payroll.total + salary;
  const routes = [];
  const add = (id, ok, reason = null) => routes.push({ id, label: ROUTE_LABEL[id], ok, reason: ok ? null : reason });
  const space = cap.salaryCap - payroll.total - holds;
  add('cap', salary <= space, `Espaço no cap: ${money(Math.max(0, space))}${holds ? ` (inclui ${money(holds)} de cap holds)` : ''}; a oferta é ${money(salary)}.`);
  add('minimum', salary <= minSalaryFor(world, player) * 1.0001 && years <= 2, salary > minSalaryFor(world, player) * 1.0001 ? `O mínimo para ${player.exp ?? 0} ano(s) de experiência é ${money(minSalaryFor(world, player))}.` : 'O contrato mínimo vai até 2 anos.');
  if (advanced) {
    add('nonTaxMle', salary <= ex.nonTaxMle && years <= 4 && after <= cap.firstApron, years > 4 ? 'A MLE vai até 4 anos.' : after > cap.firstApron ? `A MLE exige folha final até o 1º apron (${money(cap.firstApron)}); ficaria em ${money(after)}.` : `Restam ${money(ex.nonTaxMle)} da MLE nesta temporada.`);
    add('taxMle', salary <= ex.taxMle && years <= 2 && after <= cap.secondApron, years > 2 ? 'A MLE de contribuinte vai até 2 anos.' : after > cap.secondApron ? 'Acima do 2º apron não há exceções, só contrato mínimo.' : `Restam ${money(ex.taxMle)} da MLE de contribuinte.`);
    add('room', salary <= ex.room && years <= 3 && after <= cap.firstApron, ex.room <= 0 ? 'A room exception só existe para quem começou a free agency abaixo do cap.' : `Restam ${money(ex.room)} da room exception (até 3 anos).`);
    add('biAnnual', salary <= ex.biAnnual && years <= 2 && after <= cap.luxuryTax, after > cap.luxuryTax ? 'A bi-annual exception não vale para quem ultrapassa a luxury tax.' : ex.biAnnual <= 0 ? 'A bi-annual só pode ser usada em anos alternados.' : `Restam ${money(ex.biAnnual)} da bi-annual (até 2 anos).`);
  } else {
    for (const id of ['nonTaxMle', 'taxMle', 'room', 'biAnnual']) add(id, false, 'Exceções existem apenas nos modos de cap Avançado e NBA completo.');
  }
  const rights = world.offseason?.rights?.[teamId]?.includes(playerId);
  add('bird', Boolean(rights) && years <= 5, rights ? 'A renovação pelos Bird rights vai até 5 anos.' : `${world.teams.get(teamId).name} não detém os direitos de renovação de ${player.name}.`);
  return routes;
}

/** Valida a oferta e devolve { ok, route, blocked[], warnings[] } sem mudar nada. */
export function checkSigning(world, { teamId, playerId, salary, years, route = 'auto', playerOption = false }, { override = false } = {}) {
  const blocked = [];
  const warnings = [];
  const player = world.players.get(playerId);
  const team = world.teams.get(teamId);
  if (!team) return { ok: false, blocked: ['Franquia inválida.'], warnings, routes: [] };
  if (!player || player.teamId || player.retired) return { ok: false, blocked: ['O jogador não está livre no mercado.'], warnings, routes: [] };
  if (!Number.isInteger(years) || years < 1 || years > 5 || !Number.isFinite(salary)) return { ok: false, blocked: ['Contrato inválido: informe o salário e de 1 a 5 anos.'], warnings, routes: [] };
  const min = minSalaryFor(world, player);
  const max = maxSalaryFor(world, player);
  if (salary < min) blocked.push(`Salário inferior ao mínimo da liga para ${player.exp ?? 0} ano(s) de experiência (${money(min)}).`);
  if (salary > max) blocked.push(`Salário acima do máximo permitido (${money(max)}).`);
  if (blocked.length && !override) return { ok: false, blocked, warnings, routes: [] };
  const standard = rosterOf(world, teamId).filter((p) => p.rosterStatus !== 'two-way').length;
  if (standard >= rosterMax(world)) blocked.push(`Limite de elenco atingido: ${standard} contratos padrão (máximo ${rosterMax(world)} nesta fase).`);
  const routes = signingRoutes(world, { teamId, playerId, salary, years });
  let chosen = null;
  if (route === 'auto') chosen = routes.find((r) => r.ok && r.id !== 'bird') ?? routes.find((r) => r.ok) ?? null;
  else chosen = routes.find((r) => r.id === route && r.ok) ?? null;
  if (!chosen && !blocked.length) {
    const reasons = routes.filter((r) => route === 'auto' || r.id === route).map((r) => `${r.label}: ${r.reason}`);
    blocked.push(`Contratação financeiramente inválida. ${reasons.join(' · ')}`);
  }
  // teto do proprietário: bloqueia nas dificuldades Realista/Hardcore, avisa nas demais
  const owner = ownerBudget(world, teamId);
  const after = payrollSnapshot(world, teamId).total + salary;
  if (owner.enforced && after > owner.ceiling) {
    const strict = ['realistic', 'hardcore'].includes(world.career.difficulty) && teamId === world.career.teamId;
    const msg = `O proprietário (${owner.label}) não autoriza folha acima de ${money(owner.ceiling)}; esta contratação levaria a ${money(after)}.`;
    if (strict) blocked.push(msg); else warnings.push(msg);
  }
  if (override) return { ok: true, route: chosen, blocked: [], warnings: [...warnings, ...blocked.map((b) => `Ignorado (Override Total): ${b}`)], routes, ignored: blocked };
  return { ok: blocked.length === 0, route: chosen, blocked, warnings, routes };
}

// ------------------------------------------------------------------ construção de contratos
export function buildContract({ playerId, teamId, season, salary, years, option = null, raise = 0.05, type = 'standard', source = 'universe-free-agency', guaranteed = true }) {
  return {
    playerId, teamId, yearsWithTeam: 0, twoWay: type === 'two-way', source, type,
    years: Array.from({ length: years }, (_, i) => ({ season: season + i, salary: round(salary * Math.pow(1 + raise, i), 1), option: option && i === years - 1 ? option : null, ...(guaranteed ? {} : { guaranteed: false }) })),
    qualifyingOffer: null, signedOn: null,
  };
}

function lockUntil(world) {
  const rules = world.league.trade?.rules ?? {};
  const days = rules.recentSigningLockDays ?? 90;
  const earliest = rules.recentSigningEarliest ?? '12-15';
  const byDays = addDays(world.calendar.date, days);
  const season = world.calendar.season;
  const christmas = `${season - 1}-${earliest}`;
  return byDays > christmas ? byDays : christmas;
}

/**
 * Contrata um free agent. Valida antes de qualquer mutação; consome a exceção usada; respeita o cargo/modo.
 * @param opts.by 'user' | 'ai' | 'commissioner'
 */
export function signFreeAgentOffer(world, { teamId, playerId, salary, years = 1, route = 'auto', playerOption = false, bypassAgent = false, by = 'user' }, { override = false } = {}) {
  if (!world || !world.teams.has(teamId)) throw new Error('Franquia inválida.');
  if (by === 'user') {
    if (!modeShows(world.career, 'market') || (!world.career.godMode && teamId !== world.career.teamId) || (teamId !== world.career.teamId && !godModeAllowed(world.career))) throw new Error('Seu cargo não pode contratar jogadores por esta franquia.');
  }
  if (override && !overrideActive(world.career)) throw new Error('Override Total exige God Mode com ativação explícita.');
  const check = checkSigning(world, { teamId, playerId, salary, years, route, playerOption }, { override });
  if (!check.ok) throw new Error(check.blocked[0]);
  const player = world.players.get(playerId);
  if (!bypassAgent && !override) {
    const response = agentResponse(world, { teamId, playerId, salary, years, playerOption });
    if (!response.accepted) throw new Error(`O agente de ${player.name} recusou a proposta. ${response.message}`);
  }
  const season = capSeason(world);
  const contract = buildContract({ playerId, teamId, season, salary, years, option: playerOption && years >= 3 ? 'player' : null, raise: check.route?.id === 'bird' ? 0.08 : 0.05 });
  contract.signedOn = world.calendar.date;
  contract.tradeLockedUntil = lockUntil(world);
  contract.route = check.route?.id ?? 'override';
  world.contracts.set(playerId, contract);
  player.teamId = teamId;
  player.rosterStatus = 'standard';
  player.injury = player.injury ?? null;
  delete player.retired;
  bumpRosters();
  markDirty('players', playerId);
  markDirty('contracts', playerId);
  const id = check.route?.id;
  if (id && ['nonTaxMle', 'taxMle', 'room', 'biAnnual'].includes(id)) {
    const ex = exceptionsFor(world, teamId);
    ex[id] = Math.max(0, ex[id] - salary);
    if (id === 'biAnnual') ex.biAnnualUsedSeason = season;
    markDirty('teams', teamId);
  }
  if (world.offseason?.rights?.[teamId]) {
    for (const t of Object.keys(world.offseason.rights)) world.offseason.rights[t] = world.offseason.rights[t].filter((x) => x !== playerId);
    markDirty('meta', 'offseason');
  }
  addTransaction({ type: 'signing', playerIds: [playerId], toTeamId: teamId, fromTeamId: null, note: `${years} ano(s), ${money(salary)}${id ? ` · ${ROUTE_LABEL[id]}` : ''}` });
  addNews({ category: 'mercado', title: `${world.teams.get(teamId).fullName} contrata ${player.name}`, body: `Contrato de ${years} temporada(s) com salário inicial de ${money(salary)}.${override ? ' Operação aprovada pelo comissário fora das regras tradicionais.' : ''}`, teamIds: [teamId], playerIds: [playerId] });
  return contract;
}

// ------------------------------------------------------------------ renovação e extensão
/** Renova um jogador cujo contrato está acabando (ou está livre com direitos). Exige Bird rights ou espaço. */
export function reSignPlayer(world, { teamId, playerId, salary, years, playerOption = false, by = 'user' }) {
  const player = world.players.get(playerId);
  if (!player) throw new Error('Jogador inexistente.');
  if (player.teamId && player.teamId !== teamId) throw new Error('O jogador pertence a outra franquia.');
  if (!player.teamId) return signFreeAgentOffer(world, { teamId, playerId, salary, years, route: 'bird', playerOption, by });
  return extendContract(world, { teamId, playerId, salary, years, playerOption, by });
}

/** Extensão: acrescenta anos depois do último ano do contrato vigente. O agente precisa aceitar. */
export function extendContract(world, { teamId, playerId, salary, years, playerOption = false, by = 'user', bypassAgent = false }) {
  const player = world.players.get(playerId);
  const contract = world.contracts.get(playerId);
  if (!player || player.teamId !== teamId || !contract) throw new Error('Só é possível estender o contrato de um jogador da própria franquia.');
  if (by === 'user' && teamId !== world.career.teamId && !godModeAllowed(world.career)) throw new Error('Você só negocia extensões pela sua franquia.');
  if (!Number.isInteger(years) || years < 1 || years > 4) throw new Error('Extensões têm de 1 a 4 anos.');
  const remaining = contract.years.filter((y) => y.season >= capSeason(world));
  if (remaining.length > 2 && !godModeAllowed(world.career)) throw new Error('A extensão só é aberta quando restam até 2 anos de contrato.');
  const min = minSalaryFor(world, player);
  const max = maxSalaryFor(world, player);
  if (salary < min || salary > max) throw new Error(`O salário precisa ficar entre ${money(min)} e ${money(max)}.`);
  if (!bypassAgent) {
    const response = agentResponse(world, { teamId, playerId, salary, years, playerOption });
    if (!response.accepted) throw new Error(`O agente de ${player.name} recusou a extensão. ${response.message}`);
  }
  const last = contract.years.at(-1);
  if (last.option) last.option = null; // a extensão consolida a opção do último ano
  for (let i = 0; i < years; i++) contract.years.push({ season: last.season + 1 + i, salary: round(salary * Math.pow(1.06, i), 1), option: playerOption && i === years - 1 ? 'player' : null });
  contract.extendedOn = world.calendar.date;
  contract.qualifyingOffer = null;
  markDirty('contracts', playerId);
  addNews({ category: 'mercado', title: `${world.teams.get(teamId).name} estende ${player.name}`, body: `Mais ${years} temporada(s) até ${contract.years.at(-1).season}, com salário inicial de ${money(salary)} na extensão.`, teamIds: [teamId], playerIds: [playerId] });
  return contract;
}

// ------------------------------------------------------------------ dispensa com dead money
/** Dispensa. Salário garantido restante vira dead money (opcionalmente esticado). Contratos não garantidos somem. */
export function waivePlayer(world, { teamId, playerId, stretch = false, by = 'user' }) {
  const player = world.players.get(playerId);
  const contract = world.contracts.get(playerId);
  if (!player || player.teamId !== teamId) throw new Error('O jogador não pertence a esta franquia.');
  if (by === 'user' && teamId !== world.career.teamId && !godModeAllowed(world.career)) throw new Error('Você só dispensa jogadores da sua franquia.');
  const team = world.teams.get(teamId);
  const season = capSeason(world);
  const remaining = (contract?.years ?? []).filter((y) => y.season >= season && y.guaranteed !== false);
  const guaranteed = contract?.type === 'camp' && ['preseason', 'offseason'].includes(world.calendar.phase) ? [] : remaining;
  let years = guaranteed.map((y) => ({ season: y.season, amount: capHitIn({ years: [y] }, y.season) || y.salary }));
  if (stretch && years.length) {
    const total = years.reduce((a, y) => a + y.amount, 0);
    const span = years.length * 2 + 1;
    years = Array.from({ length: span }, (_, i) => ({ season: years[0].season + i, amount: Math.round(total / span) }));
  }
  if (years.length) team.deadMoney = [...(team.deadMoney ?? []), { name: player.name, playerId, years, stretched: stretch, waivedOn: world.calendar.date }];
  player.teamId = null;
  if (contract) { contract.lastTeamId = teamId; contract.teamId = null; contract.waivedOn = world.calendar.date; }
  bumpRosters();
  markDirty('teams', teamId);
  markDirty('players', playerId);
  if (contract) markDirty('contracts', playerId);
  addTransaction({ type: 'waive', playerIds: [playerId], fromTeamId: teamId, toTeamId: null, note: years.length ? `Dead money de ${money(years.reduce((a, y) => a + y.amount, 0))}` : 'Sem dead money' });
  addNews({ category: 'mercado', title: `${team.name} dispensa ${player.name}`, body: years.length ? `O restante garantido do contrato (${money(years.reduce((a, y) => a + y.amount, 0))}) continua na folha como dead money.` : 'Contrato sem garantia: nenhuma obrigação restante.', teamIds: [teamId], playerIds: [playerId] });
  return { deadMoney: years };
}

// ------------------------------------------------------------------ novatos
const RATIO_TAIL = 0.97;
/** Salário do primeiro ano pela escala de novatos (needsValidation em league.json). */
export function rookieScaleSalary(world, pickNumber) {
  const scale = world.league.cap.rookieScale;
  const ratios = scale.ratioByPick;
  const ratio = pickNumber <= ratios.length ? ratios[pickNumber - 1] : ratios.at(-1) * Math.pow(RATIO_TAIL, pickNumber - ratios.length);
  return Math.round((scale.firstYearPick1 * ratio) / 10) * 10; // firstYearPick1 acompanha o cap quando o ano de liga avança
}

/** Contrato de 1ª rodada: 4 anos (2 garantidos + 2 opções do time), +5% ao ano. */
export function rookieContract(world, { playerId, teamId, pickNumber, season }) {
  const first = rookieScaleSalary(world, pickNumber);
  const raise = world.league.cap.rookieScale.annualRaise ?? 0.05;
  const draft = world.league.draft ?? {};
  const years = draft.rookieScaleYears ?? 4;
  const guaranteed = draft.rookieGuaranteedYears ?? 2;
  return {
    playerId, teamId, yearsWithTeam: 0, twoWay: false, type: 'rookie-scale', source: 'draft', signedOn: world.calendar.date,
    years: Array.from({ length: years }, (_, i) => ({ season: season + i, salary: Math.round(first * Math.pow(1 + raise, i)), option: i >= guaranteed ? 'team' : null })),
    qualifyingOffer: null, pickNumber,
  };
}

export function secondRoundContract(world, { playerId, teamId, season, twoWay = false }) {
  const min = world.league.cap.minimumSalaryScale.byYearsOfService[0];
  if (twoWay) return { playerId, teamId, yearsWithTeam: 0, twoWay: true, type: 'two-way', source: 'draft', signedOn: world.calendar.date, years: [{ season, salary: world.league.cap.twoWaySalary, option: null }, { season: season + 1, salary: Math.round(world.league.cap.twoWaySalary * 1.05), option: null }], qualifyingOffer: null };
  return { playerId, teamId, yearsWithTeam: 0, twoWay: false, type: 'standard', source: 'draft', signedOn: world.calendar.date, years: [{ season, salary: min, option: null, guaranteed: false }, { season: season + 1, salary: Math.round(min * 1.05), option: null }], qualifyingOffer: null };
}

// ------------------------------------------------------------------ opções contratuais
/** Opções que vencem na virada para `season` (ano de cap): pendentes de decisão do time ou do jogador. */
export function pendingOptions(world, season = capSeason(world)) {
  const out = [];
  for (const contract of world.contracts.values()) {
    const player = world.players.get(contract.playerId);
    if (!player?.teamId) continue;
    const year = contract.years.find((y) => y.season === season);
    if (year?.option && !year.optionDecided) out.push({ playerId: contract.playerId, teamId: player.teamId, kind: year.option, season, salary: year.salary });
  }
  return out;
}

/** Decide uma opção. Opção recusada remove o ano (e os seguintes); sem anos restantes, o contrato expira. */
export function decideOption(world, { playerId, exercise }) {
  const contract = world.contracts.get(playerId);
  const season = capSeason(world);
  const idx = contract?.years.findIndex((y) => y.season === season && y.option);
  if (idx == null || idx < 0) throw new Error('Não há opção pendente para este jogador.');
  const year = contract.years[idx];
  const kind = year.option;
  if (exercise) { year.optionDecided = true; year.option = null; year.optionExercised = kind; }
  else contract.years = contract.years.slice(0, idx);
  markDirty('contracts', playerId);
  return { kind, exercised: exercise };
}

/** IA decide: o jogador exerce a player option se o mercado não paga mais; o time exerce a team option se o jogador vale o salário. */
export function aiOptionDecision(world, option) {
  const player = world.players.get(option.playerId);
  const ask = marketAsk(world, player);
  if (option.kind === 'player') return option.salary >= ask.salary * 0.92;
  const value = playerValue(world, player, { teamId: option.teamId, view: 'internal' });
  return value.contract + value.base * 0.25 >= -2 || option.salary <= ask.salary * 1.15;
}

export { capSituation, luxuryTaxBill, projectedPickSlot };
export { createRng };
