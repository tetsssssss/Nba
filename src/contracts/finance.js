// Finanças da franquia. Reaproveita cap.js (folha, linhas de cap, luxury tax) e acrescenta receita,
// despesas, resultado, projeções e a tolerância do proprietário.
//
// Classificação dos números (exigida pelo prompt): cada valor é
//   official  — vem de data/static/league.json (cap, tax, aprons, exceções, salário máximo);
//   estimated — modelo do jogo (receitas, despesas operacionais, tabela de mínimos, escala de novatos);
//   projected — extrapolação a partir dos contratos e do desempenho atuais.
import { capLines, capHitIn, luxuryTaxBill, teamPayroll } from './cap.js';
import { capSeason } from './rules-config.js';
import { hashString } from '../core/rng.js';
import { markDirty } from '../core/world.js';
import { leagueTable, rosterOf } from '../gm/team-context.js';

export const FIGURE_KIND = { official: 'Oficial', estimated: 'Estimado', projected: 'Projetado' };
export const OWNER_PROFILE_LABEL = { gastador: 'Gastador', pragmatico: 'Pragmático', economico: 'Econômico', impaciente: 'Impaciente' };
const OWNER_CEILING = { gastador: 'secondApron', pragmatico: 'firstApron', economico: 'luxuryTax', impaciente: 'luxuryTax' };
const OWNER_LOSS_TOLERANCE = { gastador: 0.12, pragmatico: 0.02, economico: -0.06, impaciente: 0 }; // fração da receita aceita como prejuízo (negativo = exige lucro)

/** Perfil do proprietário: o gravado ou um derivado (mercado grande tende a gastar) — fixo por franquia. */
export function ownerProfile(world, team) {
  const owner = world.owners.get(team.ownerId);
  if (owner?.profile && OWNER_PROFILE_LABEL[owner.profile]) return owner.profile;
  const roll = (hashString(`${world.saveId}:owner:${team.id}`) % 100) / 100;
  const bias = (team.market - 70) / 100; // -0.28 .. +0.30
  const x = roll + bias * 0.8;
  const derived = x > 0.78 ? 'gastador' : x > 0.42 ? 'pragmatico' : x > 0.2 ? 'economico' : 'impaciente';
  if (owner) { owner.profile = derived; owner.profileDerived = true; markDirty('owners', owner.id); }
  return derived;
}

/** Teto de folha+imposto que o proprietário aceita. `enforced` = o sistema de finanças está ligado na carreira. */
export function ownerBudget(world, teamId) {
  const team = world.teams.get(teamId);
  const profile = ownerProfile(world, team);
  const cap = world.league.cap;
  const pressure = world.career.modifiers?.budgetPressure ?? 1;
  const key = OWNER_CEILING[profile];
  // maior pressão financeira = proprietário mais apertado (reduz o teto em até ~6%)
  const ceiling = cap[key] * (1 - Math.max(0, pressure - 1) * 0.14);
  return { profile, label: OWNER_PROFILE_LABEL[profile], ceilingKey: key, ceiling, lossTolerance: OWNER_LOSS_TOLERANCE[profile], enforced: world.career.systems?.finances !== false };
}

// ------------------------------------------------------------------ modelo de receita e despesa (ESTIMADO)
function winPctOf(world, teamId) {
  return leagueTable(world).rows.get(teamId)?.winPct ?? 0.5;
}

export function revenueModel(world, teamId, { season = capSeason(world), playoffHomeGames = null } = {}) {
  const team = world.teams.get(teamId);
  const cap = world.league.cap;
  const arena = world.arenas.get(team.arenaId);
  const winPct = winPctOf(world, teamId);
  const stars = rosterOf(world, teamId).slice(0, 2).reduce((a, p) => a + Math.max(0, p.ovr - 80), 0);
  const capacity = arena?.capacity ?? 18000;
  const fill = Math.min(1, 0.78 + (team.fans.passion / 100) * 0.12 + (winPct - 0.5) * 0.35);
  const avgTicket = (8.5e-7 + (team.market / 100) * 5.5e-7 + stars * 1e-8) * cap.salaryCap; // US$ por ingresso (~US$ 150 a 230 com o cap de 2026-27)
  const gate = capacity * fill * avgTicket * 41;
  const media = cap.salaryCap * 1.06; // divisão igualitária de TV nacional
  const sponsors = cap.salaryCap * (0.22 + (team.market / 100) * 0.62);
  const merchandise = cap.salaryCap * (0.045 + (team.fans.passion / 100) * 0.09 + stars * 0.004);
  const post = playoffHomeGames ?? (winPct >= 0.62 ? 10 : winPct >= 0.52 ? 4 : winPct >= 0.46 ? 1 : 0);
  const playoffs = post * cap.salaryCap * 0.026 * (0.6 + team.market / 140);
  const items = [
    { key: 'gate', label: 'Bilheteria', amount: gate },
    { key: 'media', label: 'TV e direitos nacionais', amount: media },
    { key: 'sponsors', label: 'Patrocínios locais', amount: sponsors },
    { key: 'merchandise', label: 'Produtos e licenciamento', amount: merchandise },
    { key: 'playoffs', label: 'Receita de playoffs', amount: playoffs },
  ].map((i) => ({ ...i, kind: 'estimated', amount: Math.round(i.amount) }));
  return { season, items, total: items.reduce((a, i) => a + i.amount, 0) };
}

export function operatingExpenses(world, teamId, { revenue = null } = {}) {
  const team = world.teams.get(teamId);
  const cap = world.league.cap;
  const items = [
    { key: 'arena', label: 'Operação da arena', amount: cap.salaryCap * (0.22 + (team.market / 100) * 0.08) },
    { key: 'staff', label: 'Comissão técnica, scouts e saúde', amount: cap.salaryCap * 0.18 },
    { key: 'gleague', label: 'G League e desenvolvimento', amount: cap.salaryCap * 0.06 },
    { key: 'admin', label: 'Administração e marketing', amount: cap.salaryCap * (0.12 + (team.market / 100) * 0.06) },
    { key: 'travel', label: 'Viagens, benefícios e seguros', amount: cap.salaryCap * 0.45 },
    { key: 'league', label: 'Contribuição à liga (revenue sharing)', amount: (revenue ?? revenueModel(world, teamId).total) * 0.04 },
  ].map((i) => ({ ...i, kind: 'estimated', amount: Math.round(i.amount) }));
  return { items, total: items.reduce((a, i) => a + i.amount, 0) };
}

/** Folha (com dead money) de uma franquia em `season`. */
export function payrollSnapshot(world, teamId, season = capSeason(world)) {
  return teamPayroll(rosterOf(world, teamId), world.contracts, world.teams.get(teamId), world.league.cap, season, world.career.capMode);
}

/**
 * Painel financeiro de uma franquia (temporada de cap atual): números oficiais, estimados e projetados.
 */
export function financeOverview(world, teamId) {
  const season = capSeason(world);
  const cap = world.league.cap;
  const team = world.teams.get(teamId);
  const payroll = payrollSnapshot(world, teamId, season);
  const repeater = Boolean(team.taxHistory?.repeater);
  const tax = luxuryTaxBill(payroll.total, cap, { repeater, capMode: world.career.capMode });
  const revenue = revenueModel(world, teamId, { season });
  const expenses = operatingExpenses(world, teamId, { revenue: revenue.total });
  const profit = revenue.total - payroll.total - tax - expenses.total;
  const owner = ownerBudget(world, teamId);
  const lines = capLines(world.career.capMode);
  const budgetRoom = owner.ceiling - payroll.total;
  const allowedLoss = -owner.lossTolerance * revenue.total; // positivo: tolera perder; negativo: exige lucro
  const ceilingByResult = revenue.total - expenses.total - tax - (-allowedLoss); // folha máxima para respeitar o resultado exigido
  return {
    season, payroll, tax, repeater, revenue, expenses, profit, owner,
    official: { salaryCap: cap.salaryCap, luxuryTax: lines.luxuryTax ? cap.luxuryTax : null, firstApron: lines.aprons ? cap.firstApron : null, secondApron: lines.aprons ? cap.secondApron : null, minimumTeamSalary: cap.minimumTeamSalary, exceptions: cap.exceptions, maxSalary: cap.maxSalary, tradeCashLimit: cap.tradeCashLimit },
    budget: { ceiling: owner.ceiling, room: budgetRoom, byResult: ceilingByResult, withinBudget: payroll.total <= owner.ceiling },
    belowMinimum: payroll.total < cap.minimumTeamSalary,
    minimumPenalty: Math.max(0, cap.minimumTeamSalary - payroll.total),
  };
}

/** Projeção dos próximos anos a partir dos contratos vigentes (PROJETADO). */
export function projectFinances(world, teamId, years = 4) {
  const base = capSeason(world);
  const team = world.teams.get(teamId);
  const out = [];
  for (let i = 0; i < years; i++) {
    const season = base + i;
    const payroll = payrollSnapshot(world, teamId, season);
    const tax = luxuryTaxBill(payroll.total, world.league.cap, { repeater: Boolean(team.taxHistory?.repeater), capMode: world.career.capMode });
    // receita projetada: cresce com o cap (~7% ao ano) a partir do modelo atual
    const revenue = revenueModel(world, teamId, { season }).total * Math.pow(1.07, i);
    const expenses = operatingExpenses(world, teamId, { revenue }).total * Math.pow(1.05, i);
    out.push({ season, payroll: payroll.total, tax, revenue, expenses, profit: revenue - payroll.total - tax - expenses, status: payroll.status, committed: roster(world, teamId).filter((p) => (world.contracts.get(p.id)?.years.some((y) => y.season === season))).length });
  }
  return out;
}
const roster = rosterOf;

/** Fecha as contas da temporada: grava o resultado, cobra o imposto e atualiza o histórico de "repeater". */
export function closeSeasonBooks(world, season = world.calendar.season) {
  const closed = [];
  for (const team of world.teams.values()) {
    const id = `${team.id}:${season}`;
    if (world.finances.get(id)?.closed) continue;
    const payroll = payrollSnapshot(world, team.id, season);
    const repeater = Boolean(team.taxHistory?.repeater);
    const tax = luxuryTaxBill(payroll.total, world.league.cap, { repeater, capMode: world.career.capMode });
    const rec = team.record ?? { wins: 0, losses: 0 };
    const gp = rec.wins + rec.losses;
    const finalsRun = world.calendar.postseason?.champion === team.id ? 14 : world.calendar.postseason?.runnerUp === team.id ? 11 : world.calendar.postseason?.qualified?.[team.conference]?.includes(team.id) ? 4 : 0;
    const revenue = revenueModel(world, team.id, { season, playoffHomeGames: finalsRun });
    const expenses = operatingExpenses(world, team.id, { revenue: revenue.total });
    const profit = revenue.total - payroll.total - tax - expenses.total;
    const record = { id, teamId: team.id, season, wins: rec.wins, losses: rec.losses, games: gp, payroll: payroll.total, dead: payroll.dead, tax, revenue: revenue.total, revenueItems: revenue.items, expenses: expenses.total, profit, status: payroll.status, closed: true, kind: 'estimated' };
    world.finances.set(id, record);
    markDirty('finances', id);
    // "repeater": pagou imposto em 3 das 4 últimas temporadas
    const paid = { ...(team.taxHistory?.paid ?? {}), [season]: tax };
    const last4 = [season, season - 1, season - 2, season - 3].filter((s) => (paid[s] ?? 0) > 0).length;
    team.taxHistory = { paid, repeater: last4 >= 3 };
    markDirty('teams', team.id);
    closed.push(record);
  }
  return closed;
}

export const financeHistory = (world, teamId) => [...world.finances.values()].filter((f) => f.teamId === teamId).sort((a, b) => b.season - a.season);

/** Salário de um jogador na temporada de cap atual (atalho para as telas). */
export const salaryNow = (world, playerId) => capHitIn(world.contracts.get(playerId), capSeason(world));
