// God Mode / Commissioner: ações administrativas sobre o universo. É a EXPANSÃO do sistema existente
// (career.godMode + modo Commissioner) — não há um segundo God Mode. Toda função exige poderes de comissário
// (godModeAllowed: Franchise e Coach continuam sem acesso) e registra a intervenção em market.adminLog.
//
// Dois comandos distintos para trocas:
//   FORÇAR ACEITAÇÃO — ignora a vontade da IA, mantém a legalidade (CBA);
//   OVERRIDE TOTAL   — autoriza operações fora das regras; exige ativação explícita e lista as regras ignoradas.
import { addNews, bumpRosters, markDirty, refreshPlayer } from './world.js';
import { emit } from './events.js';
import { godModeAllowed, overrideActive } from './godmode-permissions.js';
import { logAdmin, ensureMarket } from '../contracts/market-state.js';
import { executeProposal } from '../contracts/trade-engine.js';
import { transferPick, validateProtection } from '../contracts/picks.js';
import { ATTRIBUTE_KEYS } from '../players/attributes.js';
import { retirePlayer, unretirePlayer } from '../players/retirement.js';
import { setRetirementOverride } from '../season/offseason.js';
import { approveReview, rejectReview } from '../gm/ai-gm.js';
import { ensureDraft } from '../draft/draft-engine.js';
import { minSalaryFor } from '../contracts/contracts-engine.js';
import { capSeason } from '../contracts/rules-config.js';

export function requireGod(world) {
  if (!godModeAllowed(world.career)) throw new Error('Esta ação exige God Mode (modo Commissioner). Os modos Franchise e Coach não têm acesso.');
}
const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v))));

// ------------------------------------------------------------------ Override Total
/** Ativa o Override Total. Exige digitar a confirmação para evitar ativação acidental. */
export function activateOverride(world, confirmation) {
  requireGod(world);
  if (confirmation !== 'OVERRIDE TOTAL') throw new Error('Digite OVERRIDE TOTAL para confirmar a ativação.');
  world.career.godOverride = { active: true, since: world.calendar.date, activatedAt: world.calendar.date };
  markDirty('meta', 'career');
  logAdmin(world, 'override-on', { text: 'Override Total ativado: operações podem ignorar as regras tradicionais da liga.' });
  emit('career:changed');
}
export function deactivateOverride(world) {
  requireGod(world);
  world.career.godOverride = { active: false, since: null, deactivatedAt: world.calendar.date };
  markDirty('meta', 'career');
  logAdmin(world, 'override-off', { text: 'Override Total desativado.' });
  emit('career:changed');
}

// ------------------------------------------------------------------ franquias
export function takeControl(world, teamId) {
  requireGod(world);
  if (!world.teams.has(teamId)) throw new Error('Franquia inexistente.');
  const from = world.career.teamId;
  world.career.teamId = teamId;
  markDirty('meta', 'career');
  logAdmin(world, 'switch-team', { from, to: teamId, text: `Assumiu o controle de ${world.teams.get(teamId).fullName}.` });
  emit('career:changed');
}

// ------------------------------------------------------------------ trocas
/**
 * Executa uma troca como comissário.
 * @param mode 'approve' (precisa de aceitação e legalidade) | 'force' (ignora a IA) | 'override' (ignora a IA e as regras)
 */
export function adminTrade(world, proposal, mode = 'force') {
  requireGod(world);
  if (mode === 'override' && !overrideActive(world.career)) throw new Error('Ative o Override Total antes de autorizar uma troca fora das regras.');
  const result = executeProposal(world, proposal, { by: 'commissioner', force: mode !== 'approve', override: mode === 'override' ? 'total' : null, label: mode === 'override' ? 'Override Total' : mode === 'force' ? 'aceitação forçada' : 'aprovada' });
  return { ...result, ignored: result.legality.ignored };
}

export function adminApproveReview(world, id) {
  requireGod(world);
  const out = approveReview(world, id);
  logAdmin(world, 'review-approve', { tradeId: out.tradeId, text: 'Trade da IA aprovada pelo comissário.' });
  return out;
}
export function adminRejectReview(world, id) {
  requireGod(world);
  rejectReview(world, id);
  logAdmin(world, 'review-reject', { reviewId: id, text: 'Trade da IA vetada pelo comissário.' });
}

// ------------------------------------------------------------------ jogadores e contratos
/** Move qualquer jogador (inclusive agente livre ou aposentado) para qualquer franquia, mantendo um único contrato. */
export function adminMovePlayer(world, playerId, toTeamId) {
  requireGod(world);
  const player = world.players.get(playerId);
  if (!player) throw new Error('Jogador inexistente.');
  if (toTeamId && !world.teams.has(toTeamId)) throw new Error('Franquia inexistente.');
  const from = player.teamId;
  if (player.retired) unretirePlayer(world, playerId);
  player.teamId = toTeamId || null;
  let contract = world.contracts.get(playerId);
  if (toTeamId && (!contract || !contract.years.some((y) => y.season >= capSeason(world)))) {
    const salary = minSalaryFor(world, player);
    contract = { playerId, teamId: toTeamId, yearsWithTeam: 0, twoWay: false, type: 'standard', source: 'commissioner', years: [{ season: capSeason(world), salary, option: null }, { season: capSeason(world) + 1, salary: Math.round(salary * 1.05), option: null }], qualifyingOffer: null };
    world.contracts.set(playerId, contract);
  } else if (contract) {
    contract.teamId = toTeamId || null;
    contract.yearsWithTeam = 0;
    delete contract.status;
  }
  player.rosterStatus = contract?.twoWay ? 'two-way' : contract?.type === 'camp' ? 'camp' : 'standard';
  markDirty('players', playerId);
  if (contract) markDirty('contracts', playerId);
  bumpRosters();
  logAdmin(world, 'move-player', { playerId, from, to: toTeamId, text: `${player.name}: ${from ?? 'sem time'} → ${toTeamId ?? 'agente livre'}.` });
  addNews({ category: 'trade', title: `${player.name} agora é ${toTeamId ? `do ${world.teams.get(toTeamId).name}` : 'agente livre'}`, body: 'Movimentação administrativa do comissário.', teamIds: [from, toTeamId].filter(Boolean), playerIds: [playerId] });
  emit('roster:changed', { teamIds: [from, toTeamId].filter(Boolean) });
  return player;
}

/** Edita os anos de um contrato. `years`: [{ season, salary, option? }] — consecutivos, salário positivo. */
export function adminEditContract(world, playerId, { years, type }) {
  requireGod(world);
  const contract = world.contracts.get(playerId);
  if (!contract) throw new Error('Jogador sem contrato.');
  if (!Array.isArray(years) || !years.length) throw new Error('Informe ao menos um ano de contrato.');
  const sorted = [...years].sort((a, b) => a.season - b.season);
  sorted.forEach((y, i) => {
    if (!Number.isInteger(y.season)) throw new Error('Temporada inválida.');
    if (!(y.salary > 0)) throw new Error(`Salário inválido em ${y.season}.`);
    if (i && y.season !== sorted[i - 1].season + 1) throw new Error('Os anos do contrato precisam ser consecutivos.');
    if (y.option && !['player', 'team'].includes(y.option)) throw new Error('Opção inválida (player ou team).');
  });
  const before = JSON.stringify(contract.years.map((y) => [y.season, y.salary, y.option]));
  contract.years = sorted.map((y) => ({ season: y.season, salary: Math.round(y.salary), option: y.option ?? null }));
  if (type) { contract.type = type; contract.twoWay = type === 'two-way'; }
  contract.source = 'commissioner';
  markDirty('contracts', playerId);
  bumpRosters();
  logAdmin(world, 'edit-contract', { playerId, before, after: JSON.stringify(contract.years.map((y) => [y.season, y.salary, y.option])), text: `Contrato de ${world.players.get(playerId).name} editado.` });
  return contract;
}
export function adminCorrectSalary(world, playerId, season, salary) {
  requireGod(world);
  const contract = world.contracts.get(playerId);
  const year = contract?.years.find((y) => y.season === season);
  if (!year) throw new Error('Esse jogador não tem contrato nessa temporada.');
  if (!(salary > 0)) throw new Error('Salário inválido.');
  const before = year.salary;
  year.salary = Math.round(salary);
  delete year.capHit;
  year.estimated = false;
  markDirty('contracts', playerId);
  logAdmin(world, 'correct-salary', { playerId, season, before, after: year.salary, text: `Salário de ${world.players.get(playerId).name} em ${season}: ${before} → ${year.salary}.` });
}

export function adminEditAttributes(world, playerId, patch, { potential = null } = {}) {
  requireGod(world);
  const player = world.players.get(playerId);
  if (!player) throw new Error('Jogador inexistente.');
  const before = player.ovr;
  const next = { ...player.attributes };
  for (const [key, value] of Object.entries(patch)) {
    if (!ATTRIBUTE_KEYS.includes(key)) throw new Error(`Atributo desconhecido: ${key}.`);
    next[key] = clampInt(value, 0, 100);
  }
  player.attributes = next;
  if (potential != null) player.potential = clampInt(potential, 40, 99);
  refreshPlayer(player);
  bumpRosters();
  logAdmin(world, 'edit-attributes', { playerId, patch, overall: [before, player.ovr], text: `${player.name}: ${Object.keys(patch).join(', ')} alterados (Overall ${before} → ${player.ovr}).` });
  return player;
}

// ------------------------------------------------------------------ picks e Draft
export function adminSetPickOwner(world, pickId, teamId, { protection } = {}) {
  requireGod(world);
  const pick = world.draftPicks.get(pickId);
  if (!pick) throw new Error('Pick inexistente.');
  if (pick.status === 'exercised') throw new Error('Esta pick já foi exercida no Draft.');
  if (protection !== undefined && protection !== null) {
    const v = validateProtection(protection, pick);
    if (!v.ok) throw new Error(v.reason);
  }
  const from = pick.ownerTeamId;
  transferPick(world, pickId, teamId, { via: 'commissioner', note: 'Alteração administrativa', protection });
  logAdmin(world, 'set-pick-owner', { pickId, from, to: teamId, protection: protection ?? null, text: `Pick ${pickId}: ${from} → ${teamId}.` });
  return world.draftPicks.get(pickId);
}

/** Define quem a escolha #n vai selecionar (a IA obedece quando a hora chegar). */
export function adminForceDraftPick(world, number, prospectId) {
  requireGod(world);
  const draft = ensureDraft(world);
  const prospect = world.prospects.get(prospectId);
  if (!prospect || prospect.draftYear !== draft.season) throw new Error('Prospecto inexistente neste Draft.');
  if (prospect.status !== 'available') throw new Error('Esse prospecto já foi selecionado.');
  draft.forced ??= {};
  if (Object.entries(draft.forced).some(([n, id]) => id === prospectId && Number(n) !== number)) throw new Error('Esse prospecto já está reservado para outra escolha.');
  draft.forced[number] = prospectId;
  markDirty('meta', 'draft');
  logAdmin(world, 'force-draft-pick', { number, prospectId, text: `Escolha #${number} definida: ${prospect.name}.` });
}

// ------------------------------------------------------------------ aposentadorias
export function adminRetirement(world, playerId, mode) {
  requireGod(world);
  const player = world.players.get(playerId);
  if (!player) throw new Error('Jogador inexistente.');
  if (mode === 'unretire') { unretirePlayer(world, playerId); }
  else if (world.offseason?.retirements && !world.offseason.retirements.applied && ['force', 'keep'].includes(mode)) setRetirementOverride(world, playerId, mode);
  else if (mode === 'force') retirePlayer(world, playerId, { reason: 'Decisão do comissário' });
  else throw new Error('Modo de aposentadoria inválido ou fora da janela de decisão.');
  logAdmin(world, `retirement-${mode}`, { playerId, text: `${player.name}: aposentadoria (${mode}).` });
}

// ------------------------------------------------------------------ condições da liga
const LEAGUE_FIELDS = {
  salaryCap: (cap, v) => { cap.salaryCap = v; },
  luxuryTax: (cap, v) => { cap.luxuryTax = v; },
  firstApron: (cap, v) => { cap.firstApron = v; },
  secondApron: (cap, v) => { cap.secondApron = v; },
  tradeCashLimit: (cap, v) => { cap.tradeCashLimit = v; },
  annualGrowth: (cap, v) => { cap.annualGrowth = v; },
};
export function adminLeagueConditions(world, patch) {
  requireGod(world);
  const cap = world.league.cap;
  const before = {};
  const next = { ...cap };
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'futurePickYearsAhead') continue;
    if (!LEAGUE_FIELDS[key]) throw new Error(`Condição desconhecida: ${key}.`);
    if (!(Number(value) > 0)) throw new Error(`Valor inválido para ${key}.`);
    next[key] = Number(value);
  }
  if (!(next.salaryCap < next.luxuryTax && next.luxuryTax <= next.firstApron && next.firstApron < next.secondApron)) throw new Error('A ordem precisa ser: salary cap < luxury tax ≤ 1º apron < 2º apron.');
  for (const key of Object.keys(patch)) if (LEAGUE_FIELDS[key]) { before[key] = cap[key]; LEAGUE_FIELDS[key](cap, Number(patch[key])); }
  if (patch.futurePickYearsAhead != null) {
    const market = ensureMarket(world);
    before.futurePickYearsAhead = market.prefs.futurePickYearsAhead ?? world.league.trade.futurePickYearsAhead;
    market.prefs.futurePickYearsAhead = clampInt(patch.futurePickYearsAhead, 0, 6);
    markDirty('meta', 'market');
  }
  world.rosterVersion = (world.rosterVersion ?? 0) + 1;
  markDirty('meta', 'league');
  logAdmin(world, 'league-conditions', { before, after: patch, text: `Condições da liga alteradas: ${Object.keys(patch).join(', ')}.` });
}

// ------------------------------------------------------------------ acontecimentos alternativos
export const EVENT_TYPES = {
  injury: 'Lesão grave de um jogador',
  'trade-request': 'Pedido de troca de um astro',
  'sudden-retirement': 'Aposentadoria antecipada',
  'owner-shift': 'Mudança de perfil do proprietário',
};
export function adminEvent(world, type, { playerId = null, teamId = null, profile = 'economico' } = {}) {
  requireGod(world);
  if (!EVENT_TYPES[type]) throw new Error('Evento desconhecido.');
  const player = playerId != null ? world.players.get(playerId) : null;
  if (type !== 'owner-shift' && !player) throw new Error('Escolha um jogador.');
  if (type === 'injury') {
    player.injury = { status: 'Out', since: world.calendar.date, forced: true, event: 'lesão grave' };
    markDirty('players', playerId);
    bumpRosters();
    addNews({ category: 'franquia', title: `${player.name} sofre lesão grave`, body: 'Ficará fora por tempo indeterminado, segundo o departamento médico.', teamIds: [player.teamId].filter(Boolean), playerIds: [playerId] });
  } else if (type === 'trade-request') {
    player.tradeRequest = { since: world.calendar.date };
    markDirty('players', playerId);
    addNews({ category: 'mercado', title: `${player.name} pede para ser trocado`, body: 'O agente comunicou à diretoria o desejo de deixar a franquia.', teamIds: [player.teamId].filter(Boolean), playerIds: [playerId] });
  } else if (type === 'sudden-retirement') {
    retirePlayer(world, playerId, { reason: 'Aposentadoria antecipada (evento do comissário)' });
  } else if (type === 'owner-shift') {
    const team = world.teams.get(teamId);
    const owner = team && world.owners.get(team.ownerId);
    if (!owner) throw new Error('Franquia inexistente.');
    owner.profile = profile;
    markDirty('owners', owner.id);
    addNews({ category: 'franquia', title: `${team.name}: proprietário muda de postura`, body: `Novo perfil de gastos: ${profile}.`, teamIds: [teamId] });
  }
  logAdmin(world, `event-${type}`, { playerId, teamId, text: `${EVENT_TYPES[type]}.` });
}
