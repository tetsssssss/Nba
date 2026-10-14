// Legalidade de trocas (regras da NBA aplicáveis à temporada simulada). Não decide se a troca é JUSTA
// (valuation) nem se as diretorias QUEREM fazê-la (IA): só se ela pode ser registrada pela liga.
//
// Ativos de uma proposta (todos têm `from` e `to`, o que permite trocas com três ou mais franquias):
//   { kind: 'player', playerId, from, to }
//   { kind: 'pick', pickId, from, to, protection?: { top, fallback, endSeason? } }
//   { kind: 'swap', pickId, ownPickId, from, to }   // `to` ganha o direito de trocar sua pick `ownPickId` pela pick `pickId` de `from`
//   { kind: 'cash', amount, from, to }
//
// Cada falha traz a regra, a franquia e uma mensagem específica (nunca "troca inválida").
import { capHitIn, capLines, capSituation, CAP_STATUS_LABEL, luxuryTaxBill } from './cap.js';
import { capSeason, tradeDeadline, tradeRules } from './rules-config.js';
import { firstRoundSeasonsOwned, nextDraftSeason, pickLabel } from './picks.js';
import { futurePickYears } from './market-state.js';
import { rosterOf } from '../gm/team-context.js';
import { date as fmtDate, money } from '../ui/format.js';

export const RULE_LABEL = {
  window: 'Período de trocas',
  empty: 'Proposta vazia',
  ownership: 'Propriedade do ativo',
  duplicate: 'Ativo repetido',
  status: 'Situação do atleta',
  restricted: 'Contratação recente',
  expansion: 'Franquia de expansão',
  'roster-max': 'Limite de elenco',
  'roster-min': 'Mínimo de elenco',
  'salary-matching': 'Equiparação salarial',
  'second-apron-aggregation': 'Agregação no 2º apron',
  'cash-limit': 'Limite de dinheiro',
  'cash-apron': 'Dinheiro no 2º apron',
  'pick-window': 'Horizonte de picks futuras',
  'pick-stepien': 'Regra Stepien',
  'pick-frozen': 'Pick congelada (2º apron)',
  'pick-protection': 'Proteção da pick',
  'pick-exercised': 'Pick já exercida',
  swap: 'Swap de picks',
};

const issue = (rule, teamId, message, extra = {}) => ({ rule, label: RULE_LABEL[rule], teamId, message, ...extra });
const teamName = (world, id) => world.teams.get(id)?.fullName ?? id;

export const assetKey = (a) => (a.kind === 'player' ? `p:${a.playerId}` : a.kind === 'pick' ? `k:${a.pickId}` : a.kind === 'swap' ? `s:${a.pickId}:${a.ownPickId}` : `c:${a.from}:${a.to}`);

/** Valida a estrutura do payload e devolve os ativos normalizados e as franquias envolvidas. */
export function normalizeProposal(raw) {
  const assets = (raw?.assets ?? []).map((a) => ({ ...a })).filter((a) => a && a.kind);
  const teams = [...new Set(assets.flatMap((a) => [a.from, a.to]).filter(Boolean))];
  return { ...raw, assets, teams };
}

/** Salário que conta (para equiparação) de um atleta na temporada de cap. Two-way não conta. */
export function matchingSalary(world, playerId, season) {
  const contract = world.contracts.get(playerId);
  if (!contract || contract.twoWay) return 0;
  return capHitIn(contract, season);
}

const maxRosterFor = (world) => {
  const { standardMax, offseasonMax } = world.league.roster;
  return ['regular', 'playoffs'].includes(world.calendar.phase) ? standardMax : offseasonMax;
};

/** Resumo financeiro e de elenco de cada franquia antes e depois da troca. */
export function teamSummaries(world, proposal) {
  const season = capSeason(world);
  const cap = world.league.cap;
  const capMode = world.career.capMode;
  const out = {};
  for (const teamId of proposal.teams) {
    const team = world.teams.get(teamId);
    if (!team) continue;
    const roster = rosterOf(world, teamId);
    const sent = proposal.assets.filter((a) => a.kind === 'player' && a.from === teamId).map((a) => world.players.get(a.playerId)).filter(Boolean);
    const received = proposal.assets.filter((a) => a.kind === 'player' && a.to === teamId).map((a) => world.players.get(a.playerId)).filter(Boolean);
    let live = 0;
    for (const p of roster) live += matchingSalary(world, p.id, season);
    const dead = (team.deadMoney ?? []).reduce((a, d) => a + (d.years.find((y) => y.season === season)?.amount ?? 0), 0);
    const before = live + dead;
    const outgoing = sent.reduce((a, p) => a + matchingSalary(world, p.id, season), 0);
    const incoming = received.reduce((a, p) => a + matchingSalary(world, p.id, season), 0);
    const cashIn = proposal.assets.filter((a) => a.kind === 'cash' && a.to === teamId).reduce((a, c) => a + c.amount, 0);
    const cashOut = proposal.assets.filter((a) => a.kind === 'cash' && a.from === teamId).reduce((a, c) => a + c.amount, 0);
    const after = before - outgoing + incoming;
    const count = (list) => list.filter((p) => p.rosterStatus !== 'two-way').length;
    const twoWay = (list) => list.filter((p) => p.rosterStatus === 'two-way').length;
    const standardBefore = count(roster);
    const standardAfter = standardBefore - count(sent) + count(received);
    const twoWayBefore = twoWay(roster);
    const twoWayAfter = twoWayBefore - twoWay(sent) + twoWay(received);
    const taxBefore = luxuryTaxBill(before, cap, { repeater: Boolean(team.taxHistory?.repeater), capMode });
    const taxAfter = luxuryTaxBill(after, cap, { repeater: Boolean(team.taxHistory?.repeater), capMode });
    out[teamId] = {
      teamId, season, before, after, outgoing, incoming, cashIn, cashOut, sent, received,
      statusBefore: capSituation(before, cap, capMode), statusAfter: capSituation(after, cap, capMode),
      capSpaceBefore: cap.salaryCap - before, capSpaceAfter: cap.salaryCap - after,
      standardBefore, standardAfter, twoWayBefore, twoWayAfter, taxBefore, taxAfter,
      sentMax: Math.max(0, ...sent.map((p) => matchingSalary(world, p.id, season))),
      receivedMax: Math.max(0, ...received.map((p) => matchingSalary(world, p.id, season))),
      sentCount: sent.length,
    };
  }
  return out;
}

const matchingLimit = (rule, outgoing) => Math.round(outgoing * rule.pct + rule.plus);

/** Exceção de troca (TPE) que cobre o excesso recebido, se houver (e se a franquia puder usá-la). */
export function usableTradeException(world, teamId, excess) {
  const rules = tradeRules(world);
  const today = world.calendar.date;
  return (world.teams.get(teamId)?.tradeExceptions ?? []).find((e) => e.expiresOn >= today && !e.usedOn && excess <= e.amount + rules.tradeExceptionAllowance) ?? null;
}

/**
 * @param opts.override  null | 'total' — Override Total (God Mode) converte bloqueios em avisos "ignorados"
 * @returns { ok, blocked: [issue], warnings: [issue], ignored: [issue], teams }
 */
export function checkLegality(world, rawProposal, { override = null } = {}) {
  const proposal = normalizeProposal(rawProposal);
  const rules = tradeRules(world);
  const blocked = [];
  const warnings = [];
  const phase = world.calendar.phase;
  const today = world.calendar.date;
  const season = capSeason(world);
  const cap = world.league.cap;
  const capMode = world.career.capMode;
  const lines = capLines(capMode);

  // ---- estrutura
  if (!proposal.assets.length || proposal.teams.length < 2) blocked.push(issue('empty', null, 'Uma troca precisa envolver ao menos duas franquias e algum ativo.'));
  for (const a of proposal.assets) {
    if (a.from === a.to) blocked.push(issue('ownership', a.from, 'Um ativo não pode ser enviado para a própria franquia.'));
    for (const id of [a.from, a.to]) if (!world.teams.has(id)) blocked.push(issue('ownership', id, `Franquia inexistente: ${id}.`));
  }
  const seen = new Set();
  for (const a of proposal.assets) {
    const key = assetKey(a);
    if (a.kind !== 'cash' && seen.has(key)) blocked.push(issue('duplicate', a.from, 'O mesmo ativo aparece mais de uma vez na proposta.'));
    seen.add(key);
  }

  // ---- período de trocas
  const deadline = tradeDeadline(world);
  if (phase === 'playoffs') blocked.push(issue('window', null, 'Trocas suspensas durante o play-in e os playoffs. Elas voltam após as Finais.'));
  else if (phase === 'complete') blocked.push(issue('window', null, 'A carreira foi concluída: não há mais trocas.'));
  else if (phase === 'regular' && deadline && today > deadline) blocked.push(issue('window', null, `O prazo de trocas encerrou em ${fmtDate(deadline)}. Novas trocas só após as Finais.`));

  // ---- propriedade e elegibilidade de cada ativo
  const draftSeason = nextDraftSeason(world);
  const horizon = futurePickYears(world);
  const expansionIds = new Set(world.league.expansion?.teams ?? []);
  const expansionPending = (teamId) => expansionIds.has(teamId) && !world.career.expansionDraft?.picks;
  for (const a of proposal.assets) {
    if (a.kind === 'player') {
      const p = world.players.get(a.playerId);
      if (!p) { blocked.push(issue('ownership', a.from, `Atleta inexistente (${a.playerId}).`)); continue; }
      if (p.retired) { blocked.push(issue('status', a.from, `${p.name} está aposentado.`)); continue; }
      if (p.teamId !== a.from) { blocked.push(issue('ownership', a.from, `${p.name} não pertence a ${teamName(world, a.from)}.`, { playerId: p.id })); continue; }
      const contract = world.contracts.get(p.id);
      if (!contract || !contract.years.some((y) => y.season >= season)) blocked.push(issue('status', a.from, `${p.name} não tem contrato vigente.`, { playerId: p.id }));
      if (contract?.tradeLockedUntil && contract.tradeLockedUntil > today) blocked.push(issue('restricted', a.from, `${p.name} assinou há pouco: só pode ser trocado a partir de ${fmtDate(contract.tradeLockedUntil)}.`, { playerId: p.id }));
      for (const id of [a.from, a.to]) {
        if (expansionPending(id)) blocked.push(issue('expansion', id, `${teamName(world, id)} só negocia jogadores depois do Expansion Draft (no início da temporada regular). Trocas apenas de picks são permitidas.`, { playerId: p.id }));
      }
    } else if (a.kind === 'pick' || a.kind === 'swap') {
      const pick = world.draftPicks.get(a.pickId);
      if (!pick) { blocked.push(issue('ownership', a.from, `Pick inexistente (${a.pickId}).`)); continue; }
      if (pick.status === 'exercised') { blocked.push(issue('pick-exercised', a.from, `A pick ${pickLabel(pick)} já foi exercida no Draft.`)); continue; }
      if (a.kind === 'pick' && pick.ownerTeamId !== a.from) blocked.push(issue('ownership', a.from, `${teamName(world, a.from)} não possui a pick ${pickLabel(pick)} (dono atual: ${teamName(world, pick.ownerTeamId)}).`, { pickId: pick.id }));
      if (a.kind === 'swap') {
        const own = world.draftPicks.get(a.ownPickId);
        if (pick.ownerTeamId !== a.from) blocked.push(issue('ownership', a.from, `${teamName(world, a.from)} não possui a pick ${pickLabel(pick)} do swap.`));
        if (!own || own.ownerTeamId !== a.to) blocked.push(issue('swap', a.to, `${teamName(world, a.to)} precisa possuir a própria pick do swap (${a.ownPickId}).`));
        else if (own.season !== pick.season || own.round !== pick.round) blocked.push(issue('swap', a.to, 'Um swap exige picks da mesma temporada e rodada.'));
      }
      if (pick.season > draftSeason + horizon) {
        blocked.push(issue('pick-window', a.from, `A liga limita trocas de picks a ${horizon} ano(s) à frente do próximo Draft (${draftSeason + horizon}); a pick ${pickLabel(pick)} é de ${pick.season}. É uma decisão de design configurável, não a regra definitiva da NBA — ajuste em Trade Machine › Regras.`, { pickId: pick.id }));
      }
      if (a.kind === 'pick' && a.protection) {
        const verdict = pick.round !== 1 ? { ok: false, reason: 'Apenas escolhas de 1ª rodada podem ter proteção.' } : a.protection.top >= 1 && a.protection.top <= 20 && ['rollover', 'second-round', 'void'].includes(a.protection.fallback) ? { ok: true } : { ok: false, reason: 'Proteção inválida (top 1–20 com conversão rollover, 2ª rodada ou cancelada).' };
        if (!verdict.ok) blocked.push(issue('pick-protection', a.from, verdict.reason, { pickId: pick.id }));
      }
    } else if (a.kind === 'cash') {
      if (!(a.amount > 0)) blocked.push(issue('cash-limit', a.from, 'O valor em dinheiro precisa ser positivo.'));
    }
  }

  // ---- finanças, elenco e dinheiro por franquia
  const sums = teamSummaries(world, proposal);
  const roster = world.league.roster;
  const maxStandard = maxRosterFor(world);
  const minStandard = roster.regularSeasonMin;
  for (const teamId of proposal.teams) {
    const s = sums[teamId];
    if (!s) continue;
    const name = teamName(world, teamId);

    // elenco: a troca não pode piorar uma situação já irregular nem criá-la
    if (s.standardAfter > maxStandard && s.standardAfter > s.standardBefore) blocked.push(issue('roster-max', teamId, `${name} ficaria com ${s.standardAfter} contratos padrão; o limite nesta fase é ${maxStandard}. Inclua jogadores no envio ou dispense atletas antes.`));
    if (s.twoWayAfter > roster.twoWayMax && s.twoWayAfter > s.twoWayBefore) blocked.push(issue('roster-max', teamId, `${name} ficaria com ${s.twoWayAfter} contratos two-way; o máximo é ${roster.twoWayMax}.`));
    if (phase === 'regular' && s.standardAfter < minStandard && s.standardAfter < s.standardBefore) blocked.push(issue('roster-min', teamId, `${name} ficaria com ${s.standardAfter} jogadores; durante a temporada o mínimo é ${minStandard}. Peça mais atletas em troca.`));
    if (!['regular', 'playoffs'].includes(phase) && s.standardAfter < 5 && s.standardAfter < s.standardBefore) blocked.push(issue('roster-min', teamId, `${name} ficaria sem elenco mínimo para a pré-temporada (${s.standardAfter} jogadores).`));

    // salary matching
    const diff = s.incoming - s.outgoing;
    if (diff > 0 && s.after > cap.salaryCap) {
      const base = lines.aprons && s.statusAfter === 'second-apron' ? rules.secondApronMatching : lines.aprons && s.statusAfter === 'first-apron' ? rules.firstApronMatching : rules.matching[capMode] ?? rules.matching.full;
      const limit = matchingLimit(base, s.outgoing);
      if (s.incoming > limit) {
        const exception = lines.aprons && s.after <= cap.firstApron ? usableTradeException(world, teamId, s.incoming - limit) : null;
        if (exception) warnings.push(issue('salary-matching', teamId, `${name} usará uma exceção de troca de ${money(exception.amount)} para absorver o excesso salarial.`, { exceptionId: exception.id, info: true }));
        else {
          const where = s.statusAfter === 'second-apron' ? 'acima do 2º apron' : s.statusAfter === 'first-apron' ? 'acima do 1º apron' : s.statusAfter === 'tax' ? 'acima da luxury tax' : 'acima do salary cap';
          const rule = base.plus ? `${Math.round(base.pct * 100)}% do salário enviado + ${money(base.plus)}` : `${Math.round(base.pct * 100)}% do salário enviado`;
          blocked.push(issue('salary-matching', teamId, `Negociação bloqueada: ${name} ficaria com folha de ${money(s.after)} (${where}). Nesse enquadramento só pode receber até ${rule} = ${money(limit)}, mas a troca traz ${money(s.incoming)} (envia ${money(s.outgoing)}). Reduza o salário recebido em ${money(s.incoming - limit)}, envie mais salário ou abra espaço no cap.`, { limit, incoming: s.incoming, outgoing: s.outgoing, status: s.statusAfter }));
        }
      }
    }
    if (lines.aprons && rules.secondApronNoAggregation && s.statusAfter === 'second-apron' && s.sentCount > 1 && s.receivedMax > s.sentMax && diff > 0) {
      blocked.push(issue('second-apron-aggregation', teamId, `Negociação bloqueada: ${name} ficaria acima do 2º apron e não pode agregar salários (enviar vários contratos para receber um maior).`));
    }
    if (diff > 0 && s.statusAfter !== s.statusBefore && ['first-apron', 'second-apron'].includes(s.statusAfter)) {
      warnings.push(issue('salary-matching', teamId, `${name} passaria para "${CAP_STATUS_LABEL[s.statusAfter]}": imposto estimado de ${money(s.taxAfter)}.`, { info: true }));
    } else if (s.taxAfter > s.taxBefore) warnings.push(issue('salary-matching', teamId, `${name} aumentaria a conta de luxury tax em ${money(s.taxAfter - s.taxBefore)} (total estimado ${money(s.taxAfter)}).`, { info: true }));

    // dinheiro
    const limit = cap.tradeCashLimit ?? 0;
    const used = world.market?.cash?.[`${teamId}:${season}`] ?? { sent: 0, received: 0 };
    if (lines.aprons && rules.secondApronNoCash && (s.cashIn || s.cashOut) && (s.statusAfter === 'second-apron' || s.statusBefore === 'second-apron')) blocked.push(issue('cash-apron', teamId, `${name} está no 2º apron e não pode enviar nem receber dinheiro em trocas.`));
    if (s.cashOut && used.sent + s.cashOut > limit) blocked.push(issue('cash-limit', teamId, `${name} só pode enviar ${money(limit)} em dinheiro por temporada (já usou ${money(used.sent)}).`));
    if (s.cashIn && used.received + s.cashIn > limit) blocked.push(issue('cash-limit', teamId, `${name} só pode receber ${money(limit)} em dinheiro por temporada (já recebeu ${money(used.received)}).`));
  }

  // ---- picks: Stepien e congelamento no 2º apron
  const pickAssets = proposal.assets.filter((a) => a.kind === 'pick');
  if (pickAssets.length) {
    const lastSeason = draftSeason + 6;
    for (const teamId of proposal.teams) {
      const given = pickAssets.filter((a) => a.from === teamId);
      if (!given.length) continue;
      if (rules.stepien) {
        const owned = firstRoundSeasonsOwned(world, teamId);
        for (const a of given) { const pick = world.draftPicks.get(a.pickId); if (pick?.round === 1) owned.delete(pick.season); }
        for (const a of pickAssets.filter((x) => x.to === teamId)) { const pick = world.draftPicks.get(a.pickId); if (pick?.round === 1) owned.add(pick.season); }
        for (let s = draftSeason; s < lastSeason; s++) {
          if (!owned.has(s) && !owned.has(s + 1)) {
            blocked.push(issue('pick-stepien', teamId, `Regra Stepien: ${teamName(world, teamId)} ficaria sem escolha de 1ª rodada em ${s} e ${s + 1} (anos consecutivos).`));
            break;
          }
        }
      }
      const s = sums[teamId];
      if (lines.aprons && s?.statusAfter === 'second-apron') {
        for (const a of given) {
          const pick = world.draftPicks.get(a.pickId);
          if (pick && pick.round === 1 && pick.originalTeamId === teamId && pick.season >= draftSeason + rules.frozenPickSeasonsOut) blocked.push(issue('pick-frozen', teamId, `${teamName(world, teamId)} está no 2º apron: a pick de 1ª rodada de ${pick.season} fica congelada e não pode ser trocada.`));
        }
      }
    }
  }

  const ignored = [];
  if (override === 'total') ignored.push(...blocked.splice(0, blocked.length));
  return { ok: blocked.length === 0, blocked, warnings, ignored, teams: sums, override: override === 'total' };
}
