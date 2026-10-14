// Escolhas de Draft (store `draftPicks`): criação, propriedade, proteções, swaps e conversões.
//
// Convenção de temporada do jogo: o ANO FINAL (2027 = temporada 2026-27). O "Draft 2027" acontece
// no fim da temporada 2026-27. O Draft 2026 pertence ao histórico e NUNCA é recriado.
//
// Registro de uma pick (id estável: `${season}-R${round}-${originalTeamId}` + sufixo `-X<n>` nas extras):
//   { id, season, round, originalTeamId, ownerTeamId, number|null, kind: 'natural'|'expansion-reserved',
//     slotLocked, protection|null, swapRights[], status, transfers[], prospectId|null, conversion|null }
//
// Status: available (disponível) · negotiated (negociada: está com quem não a originou) ·
//         exercised (exercida no Draft) · converted (proteção acionada: convertida em outra obrigação).
import { markDirty } from '../core/world.js';

export const PICK_STATUS_LABEL = { available: 'Disponível', negotiated: 'Negociada', exercised: 'Exercida', converted: 'Convertida' };
export const ROUND_LABEL = { 1: '1ª rodada', 2: '2ª rodada' };
export const PICK_HORIZON = 7; // quantos Drafts à frente existem como registros (a negociação é limitada por outra regra)
export const PROTECTION_FALLBACK_LABEL = { rollover: 'rola para o ano seguinte', 'second-round': 'vira 2ª rodada', void: 'é cancelada' };

export const pickId = (season, round, teamId, extra = null) => `${season}-R${round}-${teamId}${extra ? `-${extra}` : ''}`;

/** Temporada do próximo Draft ainda não concluído. */
export function nextDraftSeason(world) {
  const season = world.calendar.season;
  return world.draft?.season === season && world.draft.status === 'complete' ? season + 1 : season;
}

export const picksOfSeason = (world, season) => [...world.draftPicks.values()].filter((p) => p.season === season);
export const picksOwnedBy = (world, teamId) => [...world.draftPicks.values()].filter((p) => p.ownerTeamId === teamId && p.status !== 'exercised')
  .sort((a, b) => a.season - b.season || a.round - b.round || a.originalTeamId.localeCompare(b.originalTeamId));

/** Rótulo curto: "2028 · 1ª rodada (BOS)" ou "2027 · pick #10". */
export function pickLabel(pick, { owner = false } = {}) {
  const base = pick.number ? `${pick.season} · ${ROUND_LABEL[pick.round]} #${pick.number}` : `${pick.season} · ${ROUND_LABEL[pick.round]}`;
  const origin = pick.originalTeamId ? ` (${pick.originalTeamId}${pick.kind === 'expansion-reserved' && !pick.number ? ' extra' : ''})` : '';
  const prot = pick.protection ? ` · ${protectionLabel(pick.protection)}` : '';
  return `${base}${origin}${prot}${owner ? ` — de ${pick.ownerTeamId}` : ''}`;
}

export function protectionLabel(protection) {
  if (!protection) return 'Sem proteção';
  return `Protegida top ${protection.top}${protection.endSeason ? ` até ${protection.endSeason}` : ''} (${PROTECTION_FALLBACK_LABEL[protection.fallback] ?? 'cancelada'})`;
}

/** Valida uma proteção antes de gravá-la. */
export function validateProtection(protection, pick, { minSeason = pick.season } = {}) {
  if (protection == null) return { ok: true };
  if (pick.round !== 1) return { ok: false, reason: 'Apenas escolhas de 1ª rodada podem ter proteção.' };
  if (!Number.isInteger(protection.top) || protection.top < 1 || protection.top > 20) return { ok: false, reason: 'A proteção precisa ser um top N entre 1 e 20.' };
  if (!['rollover', 'second-round', 'void'].includes(protection.fallback)) return { ok: false, reason: 'Condição de conversão inválida.' };
  if (protection.endSeason != null && protection.endSeason < minSeason) return { ok: false, reason: 'A proteção termina antes do Draft da escolha.' };
  return { ok: true };
}

// ------------------------------------------------------------------ criação
/**
 * Registros de um Draft. Cada franquia tem uma pick por rodada. No Draft inicial da expansão
 * (league.expansion.initialDraftSeason) as franquias novas ganham as escolhas RESERVADAS
 * (league.expansion.initialDraftPicks): a primeira da lista é a pick natural da 1ª rodada e as
 * demais são picks extras, de número fixo — nenhuma franquia estabelecida perde a sua.
 */
export function buildPickSet(league, teamIds, season, { date }) {
  const picks = [];
  const reserved = league.expansion?.initialDraftSeason === season ? league.expansion.initialDraftPicks ?? {} : {};
  for (const teamId of teamIds) {
    for (const round of [1, 2]) {
      const slots = round === 1 ? reserved[teamId] ?? [] : [];
      const base = { season, round, originalTeamId: teamId, ownerTeamId: teamId, number: null, kind: 'natural', slotLocked: false, protection: null, swapRights: [], status: 'available', transfers: [], prospectId: null, conversion: null, createdOn: date };
      if (slots.length) {
        slots.forEach((slot, i) => picks.push({ ...base, id: pickId(season, round, teamId, i ? `X${i + 1}` : null), number: slot, kind: 'expansion-reserved', slotLocked: true }));
      } else picks.push({ ...base, id: pickId(season, round, teamId) });
    }
  }
  return picks;
}

/** Garante os registros dos próximos `PICK_HORIZON` Drafts. Idempotente; nunca recria um Draft já existente. */
export function ensureDraftPicks(world) {
  const first = nextDraftSeason(world);
  const teamIds = [...world.teams.keys()].sort();
  let created = 0;
  for (let season = first; season < first + PICK_HORIZON; season++) {
    if (picksOfSeason(world, season).length) continue;
    for (const pick of buildPickSet(world.league, teamIds, season, { date: world.calendar.date })) {
      world.draftPicks.set(pick.id, pick);
      markDirty('draftPicks', pick.id);
      created++;
    }
  }
  return created;
}

// ------------------------------------------------------------------ propriedade
export function ownsPick(world, teamId, id) {
  const pick = world.draftPicks.get(id);
  return Boolean(pick && pick.ownerTeamId === teamId && pick.status !== 'exercised');
}

/** Transfere a propriedade. Uma pick tem sempre UM dono; o histórico guarda toda a cadeia. */
export function transferPick(world, id, toTeamId, { via = null, note = null, protection = undefined } = {}) {
  const pick = world.draftPicks.get(id);
  if (!pick) throw new Error(`Pick inexistente: ${id}.`);
  if (pick.status === 'exercised') throw new Error('Esta escolha já foi exercida no Draft.');
  if (!world.teams.has(toTeamId)) throw new Error('Franquia destinatária inválida.');
  const fromTeamId = pick.ownerTeamId;
  pick.transfers.push({ date: world.calendar.date, fromTeamId, toTeamId, via, note });
  pick.ownerTeamId = toTeamId;
  if (protection !== undefined) pick.protection = protection;
  if (pick.status === 'available' || pick.status === 'negotiated') pick.status = toTeamId === pick.originalTeamId ? 'available' : 'negotiated';
  markDirty('draftPicks', id);
  return pick;
}

/**
 * Concede a `holderTeamId` o direito de trocar sua pick (`withPickId`) por `id` caso a sua seja pior.
 * O direito fica registrado na pick cedida (a de `ownerTeamId`) e é resolvido junto com a ordem final.
 */
export function addSwapRight(world, id, { holderTeamId, withPickId }) {
  const pick = world.draftPicks.get(id);
  const own = world.draftPicks.get(withPickId);
  if (!pick || !own) throw new Error('Pick inexistente para o swap.');
  if (pick.season !== own.season || pick.round !== own.round) throw new Error('Swaps exigem picks da mesma temporada e rodada.');
  if (pick.id === own.id) throw new Error('Uma pick não pode ser trocada por ela mesma.');
  if (pick.swapRights.some((s) => s.holderTeamId === holderTeamId && s.withPickId === withPickId)) return pick;
  pick.swapRights.push({ holderTeamId, withPickId, resolved: false });
  markDirty('draftPicks', id);
  return pick;
}

// ------------------------------------------------------------------ conversão após a ordem final
/**
 * Aplica proteções e swaps de um Draft cuja ordem (picks com `number`) já está definida.
 * Idempotente: cada proteção e cada swap só é resolvido uma vez.
 * @returns lista de efeitos ({ type: 'protection'|'swap', ... }) para notícias e para o relatório do Draft.
 */
export function resolveConveyance(world, season) {
  const effects = [];
  const all = picksOfSeason(world, season).filter((p) => p.number != null);
  for (const pick of all.filter((p) => p.protection && !p.conversion && p.status !== 'exercised')) {
    const former = pick.ownerTeamId;
    const { top, fallback } = pick.protection;
    if (pick.ownerTeamId === pick.originalTeamId || pick.number > top) {
      pick.conversion = { type: 'conveyed', number: pick.number, resolvedOn: world.calendar.date, resultPickIds: [] };
      markDirty('draftPicks', pick.id);
      effects.push({ type: 'protection', outcome: 'conveyed', pickId: pick.id, teamId: former, number: pick.number });
      continue;
    }
    // A escolha caiu dentro da proteção: volta para a franquia de origem e a obrigação é convertida.
    const result = [];
    transferPick(world, pick.id, pick.originalTeamId, { via: 'protection', note: `Protegida top ${top}: saiu na posição ${pick.number}` });
    if (fallback === 'second-round') {
      const second = world.draftPicks.get(pickId(season, 2, pick.originalTeamId));
      if (second && second.status !== 'exercised' && second.ownerTeamId !== former) {
        transferPick(world, second.id, former, { via: 'protection', note: `Conversão da pick ${pick.id}` });
        result.push(second.id);
      }
    } else if (fallback === 'rollover') {
      const years = pick.protection.endSeason == null ? 1 : pick.protection.endSeason - season;
      const next = world.draftPicks.get(pickId(season + 1, 1, pick.originalTeamId));
      if (years > 0 && next && next.status !== 'exercised') {
        transferPick(world, next.id, former, { via: 'protection', note: `Rola da pick ${pick.id}`, protection: years > 1 ? { top, fallback, endSeason: pick.protection.endSeason } : null });
        result.push(next.id);
      }
    }
    pick.status = 'converted';
    pick.conversion = { type: fallback, number: pick.number, resolvedOn: world.calendar.date, claimTeamId: former, resultPickIds: result };
    pick.protection = { ...pick.protection, resolved: true };
    markDirty('draftPicks', pick.id);
    effects.push({ type: 'protection', outcome: 'protected', pickId: pick.id, teamId: former, originalTeamId: pick.originalTeamId, number: pick.number, top, fallback, resultPickIds: result });
  }
  for (const pick of all) {
    for (const right of pick.swapRights ?? []) {
      if (right.resolved) continue;
      const mine = world.draftPicks.get(right.withPickId);
      if (!mine || mine.number == null) continue;
      right.resolved = true;
      markDirty('draftPicks', pick.id);
      // Quem tem o direito (holder) fica com a melhor das duas (menor número).
      if (mine.number > pick.number && mine.ownerTeamId === right.holderTeamId && pick.ownerTeamId !== right.holderTeamId) {
        const ownerOfBetter = pick.ownerTeamId;
        transferPick(world, pick.id, right.holderTeamId, { via: 'swap', note: `Swap com ${mine.id}` });
        transferPick(world, mine.id, ownerOfBetter, { via: 'swap', note: `Swap com ${pick.id}` });
        effects.push({ type: 'swap', outcome: 'exercised', holderTeamId: right.holderTeamId, otherTeamId: ownerOfBetter, gained: pick.id, given: mine.id });
      } else effects.push({ type: 'swap', outcome: 'not-exercised', holderTeamId: right.holderTeamId, pickId: pick.id });
    }
  }
  return effects;
}

/** Primeira rodada de cada temporada futura em posse da franquia (para a regra Stepien). */
export function firstRoundSeasonsOwned(world, teamId) {
  const out = new Set();
  for (const p of world.draftPicks.values()) if (p.round === 1 && p.ownerTeamId === teamId && p.status !== 'exercised') out.add(p.season);
  return out;
}
