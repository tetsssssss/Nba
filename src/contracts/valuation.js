// Valuation de ativos de trade (jogadores, picks, swaps, dinheiro) em "pontos de valor" (TVP).
//
// Não usa só diferença de Overall. Considera: Overall atual, potencial (visível ou verdadeiro conforme quem
// avalia), idade e curva de evolução, produção recente por minuto, durabilidade/lesões, contrato (salário
// versus valor de mercado), anos de vínculo, valor das picks (posição projetada, proteção, swaps),
// contexto competitivo, necessidades e profundidade do elenco, pressão salarial e o perfil do GM.
//
// Duas visões: `internal` (a diretoria que avalia enxerga o potencial verdadeiro com a margem de erro do seu
// "aiGmSharpness") e `public` (o que o usuário pode saber: faixa estimada de potencial; God Mode vê o exato).
import { createRng } from '../core/rng.js';
import { COL } from '../players/statline.js';
import { potentialEstimate } from '../players/potential.js';
import { NEUTRAL_PROFILE, horizonWeights, profileOf } from '../gm/personality.js';
import { ageOf, leagueTable, projectedPickSlot, teamNeeds } from '../gm/team-context.js';
import { nextDraftSeason } from './picks.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerpTable = (table, x) => {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) {
      const [x0, y0] = table[i - 1];
      const [x1, y1] = table[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  const [xa, ya] = table.at(-2);
  const [xb, yb] = table.at(-1);
  return yb + ((yb - ya) * (x - xb)) / (xb - xa);
};

/** Valor de produção por temporada de um jogador de Overall `x` (escala do universo: titulares ~75, estrelas 85+). */
const OVR_VALUE = [[55, 0], [60, 0.8], [65, 4], [70, 11], [75, 25], [80, 48], [85, 82], [90, 128], [95, 185], [99, 235]];
export const ovrValue = (ovr) => Math.max(0, lerpTable(OVR_VALUE, ovr));

/** Salário de mercado (US$) para um jogador de Overall `x`, na escala do salary cap atual. */
const MARKET_SALARY_M = [[55, 1.2], [60, 1.6], [65, 2.5], [70, 4.5], [75, 10], [80, 21], [85, 39], [90, 50], [95, 57], [99, 60]];
export function marketSalary(ovr, cap) {
  const scale = cap.salaryCap / 164961000;
  const maxSalary = cap.maxSalary?.years10plus ?? cap.salaryCap * 0.35;
  return clamp(lerpTable(MARKET_SALARY_M, ovr) * 1e6 * scale, cap.minimumSalaryScale?.byYearsOfService?.[0] ?? 1e6, maxSalary);
}
const dollarsPerPoint = (cap) => 0.4e6 * (cap.salaryCap / 164961000);

/** Evolução esperada do Overall por ano, conforme a idade ao iniciar o ano. */
const AGE_DELTA = [[19, 2.6], [20, 2.2], [21, 1.8], [22, 1.4], [23, 1], [24, 0.7], [25, 0.4], [26, 0.2], [27, 0], [28, -0.1], [29, -0.3], [30, -0.55], [31, -0.8], [32, -1.1], [33, -1.4], [34, -1.8], [36, -2.3]];
export const expectedAgeDelta = (age) => lerpTable(AGE_DELTA, clamp(age, 19, 36));

export function projectOvr(ovr, potential, age, years) {
  let value = ovr;
  for (let y = 0; y < years; y++) {
    const delta = expectedAgeDelta(age + y);
    value += delta > 0 ? Math.min(delta, Math.max(0, potential - value) * 0.55 + 0.15) : delta;
  }
  return value;
}

// ------------------------------------------------------------------ produção recente
function productionIndex36(min, pts, reb, ast, stl, blk, tov, fgMiss, ftMiss) {
  if (!min) return null;
  return ((pts + 0.9 * reb + 1.5 * ast + 2 * stl + 2 * blk - 1.5 * tov - 0.7 * fgMiss - 0.3 * ftMiss) / min) * 36;
}

/** Produção por 36 minutos: temporada atual (se houver amostra) senão a última da carreira. */
function recentProduction(world, player) {
  const cur = world.seasonStats?.get(player.id);
  if (cur && cur.gp >= 12 && cur.min >= 250) {
    return { index: productionIndex36(cur.min, cur.pts, cur.orb + cur.drb, cur.ast, cur.stl, cur.blk, cur.tov, cur.fga - cur.fgm, cur.fta - cur.ftm), minutes: cur.min, source: 'current' };
  }
  const rows = world.careerStats?.get(player.id)?.rows;
  if (!rows?.length) return null;
  const season = Math.max(...rows.map((r) => r[COL.season]));
  const last = rows.filter((r) => r[COL.season] === season);
  const gp = last.reduce((a, r) => a + r[COL.gp], 0);
  if (!gp) return null;
  const avg = (c) => last.reduce((a, r) => a + r[c] * r[COL.gp], 0) / gp;
  const min = avg(COL.min);
  const totalMinutes = min * gp;
  if (totalMinutes < 400) return null;
  return { index: productionIndex36(min, avg(COL.pts), avg(COL.orb) + avg(COL.drb), avg(COL.ast), avg(COL.stl), avg(COL.blk), avg(COL.tov), avg(COL.fga) - avg(COL.fgm), avg(COL.fta) - avg(COL.ftm)), minutes: totalMinutes, source: 'last' };
}

/** Regressão linear (produção ~ Overall) da liga, para medir quem produz acima ou abaixo do esperado. */
function productionModel(world) {
  const key = `${world.calendar.season}|${world.seasonStats?.size ?? 0}|${world.players.size}`;
  if (world.__prodModel?.key === key) return world.__prodModel;
  const xs = [];
  const ys = [];
  for (const p of world.players.values()) {
    const prod = recentProduction(world, p);
    if (prod?.index != null && prod.minutes >= 500) { xs.push(p.ovr); ys.push(prod.index); }
  }
  let model = { key, a: 0, b: 0, sd: 1, n: xs.length };
  if (xs.length >= 30) {
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    const sxy = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0);
    const b = sxx ? sxy / sxx : 0;
    const a = my - b * mx;
    const sd = Math.sqrt(xs.reduce((s, x, i) => s + (ys[i] - (a + b * x)) ** 2, 0) / xs.length) || 1;
    model = { key, a, b, sd, n: xs.length };
  }
  world.__prodModel = model;
  return model;
}

/** Fator multiplicativo (~0,93–1,07): quem rende mais do que o Overall indica vale um pouco mais. */
export function productionFactor(world, player) {
  const model = productionModel(world);
  const prod = recentProduction(world, player);
  if (!model.n || !prod || prod.index == null) return { factor: 1, z: 0, note: null };
  const z = clamp((prod.index - (model.a + model.b * player.ovr)) / model.sd, -2, 2);
  const reliability = clamp(prod.minutes / 1500, 0.3, 1);
  return { factor: 1 + 0.035 * z * reliability, z, note: z > 0.7 ? 'Produz acima do Overall' : z < -0.7 ? 'Produz abaixo do Overall' : null };
}

// ------------------------------------------------------------------ jogadores
function potentialSeenBy(world, player, view, viewerTeamId) {
  const age = ageOf(world, player);
  if (view === 'god') return player.potential;
  if (view === 'public') {
    const est = potentialEstimate(player, age);
    return Math.round((est.low + est.high) / 2);
  }
  // visão interna: a diretoria vê o verdadeiro potencial de quem é seu e tem ruído nos demais
  const own = player.teamId === viewerTeamId;
  const sharp = world.career?.modifiers?.aiGmSharpness ?? 1;
  const sd = (own ? 1 : 2.6) / Math.max(0.5, sharp);
  const noise = (createRng(`${world.saveId}:pot:${viewerTeamId}:${player.id}:${world.calendar.season}`).normal()) * sd;
  return clamp(Math.round(player.potential + noise), player.ovr, 99);
}

export function contractView(world, player) {
  const contract = world.contracts.get(player.id);
  const season = world.calendar.season;
  const remaining = contract?.years.filter((y) => y.season >= season) ?? [];
  return { contract, remaining, years: remaining.length };
}

/**
 * Valor de um jogador para `teamId` (ou neutro, sem time). Devolve o total e a decomposição.
 * @param opts.view 'internal' | 'public' | 'god'
 * @param opts.profile pesos do GM (padrão: o perfil da franquia; sem franquia, neutro)
 */
export function playerValue(world, player, { teamId = null, view = 'public', profile = null, partial = false } = {}) {
  const team = teamId ? world.teams.get(teamId) : null;
  const prof = profile ?? (team ? profileOf(team) : NEUTRAL_PROFILE);
  const cap = world.league.cap;
  const age = ageOf(world, player);
  const potential = potentialSeenBy(world, player, view, teamId ?? player.teamId);
  const { contract, remaining, years } = contractView(world, player);
  const weights = horizonWeights(prof);
  const baseSum = 1 + 0.78 + 0.6 + 0.46 + 0.35;
  const durability = clamp((player.attributes?.durability ?? 60) / 100, 0.3, 1);
  const availability = 0.8 + 0.2 * durability;
  const out = player.injury?.status === 'Out';
  const prod = productionFactor(world, player);

  let core = 0;
  let surplus = 0;
  const $pp = dollarsPerPoint(cap);
  for (let y = 0; y < weights.length; y++) {
    const ovr = projectOvr(player.ovr, potential, age, y);
    let production = ovrValue(ovr) * availability * (y === 0 ? prod.factor : 1 + (prod.factor - 1) * 0.5);
    if (out && y === 0) production *= 0.5;
    // Jovens de alto potencial valem mais para quem aposta no futuro; veteranos de elite, para quem quer vencer.
    if (age <= 23 && potential - player.ovr >= 6) production *= 1 + 0.07 * (prof.youth - 1) * Math.min(1, (potential - player.ovr) / 12);
    if (age >= 30 && player.ovr >= 78) production *= 1 + 0.06 * (prof.vets - 1);
    const controlled = y < years ? 1 : 0.5; // além do contrato conta o direito de renovar (Bird rights), com risco
    core += weights[y] * production * controlled;
    if (y < years) {
      const salary = remaining[y].capHit ?? remaining[y].salary;
      const optionDiscount = remaining[y].option ? 0.75 : 1; // opção reduz o compromisso (de qualquer lado)
      surplus += weights[y] * ((marketSalary(ovr, cap) - salary) / $pp) * optionDiscount;
    }
  }
  const contractPart = clamp(surplus * 0.45 * (prof.salary ?? 1), -core * 0.9 - 6, core * 0.8 + 6) / baseSum;
  const base = core / baseSum;
  const value = base + contractPart;
  return {
    value: Math.max(value, -40),
    base,
    contract: contractPart,
    age,
    potential,
    projected: Math.round(projectOvr(player.ovr, potential, age, 2)),
    yearsLeft: years,
    production: prod,
    marketSalary: marketSalary(player.ovr, cap),
    salary: contract ? contract.years.find((y) => y.season === world.calendar.season)?.salary ?? 0 : 0,
    injured: out,
  };
}

// ------------------------------------------------------------------ picks
const NORMAL_GRID = [-1.6, -1.2, -0.8, -0.4, 0, 0.4, 0.8, 1.2, 1.6].map((z) => [z, Math.exp(-0.5 * z * z)]);

export const firstRoundSlotValue = (slot) => 100 * Math.exp(-0.115 * (slot - 1)) + 3;
export const secondRoundSlotValue = (slot, firstRoundSize = 32) => Math.max(0.6, 5 * Math.exp(-0.05 * (slot - firstRoundSize - 1)));
const slotValue = (slot, round, size) => (round === 1 ? firstRoundSlotValue(slot) : secondRoundSlotValue(slot, size));

function slotDistribution(world, pick) {
  const draftSeason = nextDraftSeason(world);
  const ahead = Math.max(0, pick.season - draftSeason);
  const size = world.teams.size + (world.league.expansion?.initialDraftSeason === pick.season ? Object.values(world.league.expansion.initialDraftPicks ?? {}).reduce((a, l) => a + Math.max(0, l.length - 1), 0) : 0);
  if (pick.number != null) return { slots: [[pick.number, 1]], size, ahead, mean: pick.number };
  const mean0 = projectedPickSlot(world, pick.originalTeamId, ahead);
  const sigma = clamp(3 + 2.6 * ahead, 3, 9);
  const raw = NORMAL_GRID.map(([z, w]) => [clamp(Math.round(mean0 + z * sigma), 1, world.teams.size), w]);
  const total = raw.reduce((a, [, w]) => a + w, 0);
  const slots = raw.map(([s, w]) => [pick.round === 1 ? s : size + s, w / total]);
  return { slots, size, ahead, mean: pick.round === 1 ? mean0 : size + mean0 };
}

/** Valor esperado de uma pick (probabilidade de posição × valor da posição, com proteção e conversão). */
export function pickValue(world, pick, { teamId = null, profile = null } = {}) {
  const team = teamId ? world.teams.get(teamId) : null;
  const prof = profile ?? (team ? profileOf(team) : NEUTRAL_PROFILE);
  const { slots, size, ahead, mean } = slotDistribution(world, pick);
  let value = 0;
  const prot = pick.protection && !pick.protection.resolved ? pick.protection : null;
  let probConvey = 1;
  for (const [slot, p] of slots) {
    let v = slotValue(slot, pick.round, size);
    if (prot && pick.round === 1 && pick.ownerTeamId !== pick.originalTeamId && slot <= prot.top) {
      probConvey -= p;
      const fallback = prot.fallback === 'second-round' ? secondRoundSlotValue(size + 16, size) * 1.1 : prot.fallback === 'rollover' ? firstRoundSlotValue(clamp(slot + 3, 1, 30)) * 0.78 * Math.pow(0.97, ahead) : 0;
      v = fallback;
    }
    value += p * v;
  }
  const discount = Math.pow(0.95, ahead); // risco e espera
  return { value: value * discount * prof.picks, mean, probConvey: Math.max(0, probConvey), slotKnown: pick.number != null, ahead };
}

/** Valor de um direito de swap: ganho esperado de trocar a pick própria pela do outro quando esta for melhor. */
export function swapValue(world, ownPick, otherPick) {
  const a = slotDistribution(world, ownPick);
  const b = slotDistribution(world, otherPick);
  let gain = 0;
  for (const [sa, pa] of a.slots) {
    for (const [sb, pb] of b.slots) {
      gain += pa * pb * Math.max(0, slotValue(sa, ownPick.round, a.size) - slotValue(sb, otherPick.round, b.size));
    }
  }
  return gain * Math.pow(0.95, Math.max(a.ahead, b.ahead));
}

// ------------------------------------------------------------------ agregação
/** Utilidade não linear: dois jogadores de 40 valem menos que um de 80 (consolidação) e vice-versa para estrelas. */
export function utility(values, exponent = 1.3) {
  return values.reduce((sum, v) => sum + Math.sign(v) * 50 * Math.pow(Math.abs(v) / 50, exponent), 0);
}

export const tradeMargin = (difficulty = 1) => clamp(0.05 + (difficulty - 1) * 0.35, -0.12, 0.28);

/**
 * Necessidade/fit: multiplicador (~0,9–1,12) do valor de um jogador para a franquia que o recebe.
 */
export function fitFactor(world, teamId, player) {
  const needs = teamNeeds(world, teamId);
  const need = Math.max(needs.byPosition[player.positions[0]] ?? 0, (needs.byPosition[player.positions[1]] ?? 0) * 0.7);
  return clamp(0.96 + need * 0.12, 0.92, 1.12);
}

export { leagueTable };
