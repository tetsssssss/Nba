// Offseason completa: onze fases persistentes (world.offseason / meta.offseason), cada uma com requisitos
// obrigatórios, ações e a transição para a próxima. Substitui a virada simplificada de temporada sem apagar
// o calendário, o play-in e os playoffs (season.js continua dono deles).
//
// Ordem (respeita o calendário modelado): finais → premiações → aposentadorias → loteria → scouting → Draft →
// decisões contratuais (início do ano de liga) → free agency → renovações/movimentações → ajuste de elenco →
// preparação da próxima temporada (desenvolvimento, contas, novo cap, nova temporada).
import { addNews, bumpRosters, getWorld, markDirty, setCalendarDate } from '../core/world.js';
import { emit } from '../core/events.js';
import { godModeAllowed } from '../core/godmode-permissions.js';
import { addDays } from '../ui/format.js';
import { COL } from '../players/statline.js';
import { applyOffseasonDevelopment } from '../players/offseason-integration.js';
import { decideRetirements, retirePlayer } from '../players/retirement.js';
import { closeSeasonBooks } from '../contracts/finance.js';
import { advanceLeagueCap } from '../contracts/cap-growth.js';
import { aiOptionDecision, capHoldFor, decideOption, ensureRights, pendingOptions, rightsOf } from '../contracts/contracts-engine.js';
import { capSeason } from '../contracts/rules-config.js';
import { assignGmProfiles } from '../gm/personality.js';
import { aiFreeAgencyDay, aiReSign, aiRosterAdjust, resolveOptions } from '../gm/ai-offseason.js';
import { rosterOf } from '../gm/team-context.js';
import { runAiMarketTick } from '../gm/ai-gm.js';
import { ensureDraft, lotteryReady, runLottery, simAll, startDraft } from '../draft/draft-engine.js';
import { ensureWorldSystems } from '../core/bootstrap.js';

export const OFFSEASON_STEPS = [
  { id: 'finals', label: 'Encerramento das finais', mandatory: true, description: 'A temporada termina: estatísticas arquivadas e contas do ano fechadas.' },
  { id: 'awards', label: 'Campeão e premiações', mandatory: true, description: 'Registro do campeão e dos destaques estatísticos da temporada.' },
  { id: 'retirements', label: 'Decisões de jogadores e aposentadorias', mandatory: true, description: 'Veteranos decidem se continuam; contratos remanescentes saem da folha.' },
  { id: 'lottery', label: 'Draft Lottery', mandatory: true, description: 'Sorteio das quatro primeiras escolhas e definição da ordem das duas rodadas.' },
  { id: 'scouting', label: 'Scouting e preparação', mandatory: false, description: 'Treinos individuais, big board e rankings próprios antes do Draft.' },
  { id: 'draft', label: 'Draft Night', mandatory: true, description: 'Noite do Draft: escolhas, trocas de picks e análise ao vivo.' },
  { id: 'contracts', label: 'Decisões contratuais', mandatory: true, description: 'Opções de contrato e início do novo ano de liga (cap holds, direitos de renovação).' },
  { id: 'free-agency', label: 'Free Agency', mandatory: false, description: 'Mercado aberto por 30 dias: ofertas, agentes, exceções e concorrência.' },
  { id: 'renewals', label: 'Renovações e movimentações', mandatory: false, description: 'Extensões de contrato e trocas de offseason.' },
  { id: 'roster', label: 'Ajustes de elenco', mandatory: true, description: 'Limites de elenco, convidados de training camp e contratos two-way.' },
  { id: 'next-season', label: 'Preparação da próxima temporada', mandatory: true, description: 'Desenvolvimento dos jogadores, novo salary cap e abertura do calendário.' },
];
const STEP_BY_ID = Object.fromEntries(OFFSEASON_STEPS.map((s) => [s.id, s]));
const FA_DAYS = 30;

const say = (off, text) => { off.log.unshift({ at: off.date, text }); if (off.log.length > 80) off.log.length = 80; };
const save = () => markDirty('meta', 'offseason');

// ------------------------------------------------------------------ criação / consulta
export function offseasonActive(world = getWorld()) {
  return Boolean(world?.offseason) && world.calendar.phase === 'offseason';
}

/** Cria o ciclo ao entrar na offseason (idempotente) e roda as fases automáticas. */
export function ensureOffseason(world = getWorld()) {
  if (world.calendar.phase !== 'offseason') return null;
  if (world.offseason && world.offseason.season === world.calendar.season) return world.offseason;
  const finalsEnd = world.career.completedSeasons?.at(-1)?.completedAt ?? world.calendar.date;
  world.offseason = {
    season: world.calendar.season, startedOn: world.calendar.date, finalsEnd, date: world.calendar.date, current: 'finals',
    steps: OFFSEASON_STEPS.map((s) => ({ id: s.id, status: s.id === 'finals' ? 'active' : 'pending', doneOn: null })),
    leagueYearStarted: false, rights: {}, rightsInfo: {}, faDay: 0, faDays: FA_DAYS, retirements: null, awards: null, log: [], applied: {},
  };
  save();
  enterStep(world, 'finals');
  autoAdvance(world);
  return world.offseason;
}

const stepOf = (off, id) => off.steps.find((s) => s.id === id);

/** Fases com seu estado, descrição e pendências obrigatórias (para a tela /offseason). */
export function offseasonStatus(world = getWorld()) {
  const off = ensureOffseason(world);
  if (!off) return null;
  const steps = OFFSEASON_STEPS.map((def) => {
    const st = stepOf(off, def.id);
    return { ...def, status: st.status, doneOn: st.doneOn, requirements: st.status === 'active' ? requirements(world, def.id) : [] };
  });
  const current = steps.find((s) => s.status === 'active') ?? null;
  const done = steps.filter((s) => s.status === 'done').length;
  return { off, steps, current, progress: done / steps.length, complete: steps.every((s) => s.status === 'done'), blocked: current ? current.requirements.filter((r) => r.blocking) : [] };
}

// ------------------------------------------------------------------ requisitos
function userRosterIssues(world) {
  const teamId = world.career.teamId;
  const roster = rosterOf(world, teamId);
  const standard = roster.filter((p) => p.rosterStatus !== 'two-way');
  const camp = roster.filter((p) => p.rosterStatus === 'camp');
  const two = roster.filter((p) => p.rosterStatus === 'two-way');
  const { standardMax, twoWayMax, regularSeasonMin } = world.league.roster;
  const issues = [];
  if (camp.length) issues.push({ id: 'camp', blocking: true, level: 'warn', text: `${camp.length} convidado(s)/novato(s) de contrato não garantido (${camp.map((p) => p.lastName).join(', ')}): corte, promova ou converta em two-way.`, link: `/team/${teamId}?tab=folha` });
  if (standard.length - camp.length > standardMax) issues.push({ id: 'max', blocking: true, level: 'bad', text: `Elenco com ${standard.length - camp.length} contratos padrão; o limite é ${standardMax}. Dispense ou troque ${standard.length - camp.length - standardMax}.`, link: `/team/${teamId}` });
  if (two.length > twoWayMax) issues.push({ id: 'two', blocking: true, level: 'bad', text: `${two.length} contratos two-way; o máximo é ${twoWayMax}.`, link: `/team/${teamId}` });
  if (standard.length < regularSeasonMin) issues.push({ id: 'min', blocking: true, level: 'bad', text: `Elenco com ${standard.length} jogadores; a liga exige ao menos ${regularSeasonMin} na temporada. Contrate agentes livres.`, link: '/finance?tab=free-agency' });
  return issues;
}

export function requirements(world, stepId) {
  const off = world.offseason;
  const teamId = world.career.teamId;
  switch (stepId) {
    case 'retirements': return [{ id: 'info', blocking: false, level: 'info', text: `${(off.retirements?.list ?? []).filter((r) => r.retires).length} aposentadoria(s) prevista(s). ${godModeAllowed(world.career) ? 'Como comissário você pode forçar ou impedir.' : 'As decisões são dos jogadores.'}` }];
    case 'lottery': return lotteryReady(world) ? [] : [{ id: 'lottery', blocking: true, level: 'warn', text: 'A loteria só acontece depois das Finais.' }];
    case 'draft': {
      const draft = world.draft;
      if (draft?.status === 'complete' && draft.season === off.season) return [];
      return [{ id: 'draft', blocking: true, level: 'warn', text: draft?.status === 'live' ? `Draft em andamento: escolha ${draft.cursor + 1} de ${draft.order.length}.` : 'Realize o Draft (ao vivo ou simulado) para avançar.', link: '/draft' }];
    }
    case 'contracts': {
      const list = [];
      const mine = off.leagueYearStarted ? [] : pendingOptions(world, off.season + 1).filter((o) => o.teamId === teamId && o.kind === 'team');
      for (const o of mine) list.push({ id: `opt-${o.playerId}`, blocking: true, level: 'warn', text: `Team option de ${world.players.get(o.playerId).name} (${o.salary.toLocaleString('pt-BR')} dólares): exercer ou recusar.`, link: '/finance?tab=contratos' });
      if (!off.leagueYearStarted) list.push({ id: 'year', blocking: false, level: 'info', text: 'Ao concluir, o novo ano de liga começa: contratos vencidos viram agentes livres com direitos de renovação para o time de origem.' });
      return list;
    }
    case 'free-agency': return [{ id: 'fa', blocking: false, level: 'info', text: `Dia ${off.faDay} de ${off.faDays}. ${rightsOf(world, teamId).length} direito(s) de renovação seu(s) ainda abertos.`, link: '/finance?tab=free-agency' }];
    case 'roster': return userRosterIssues(world);
    default: return [];
  }
}

// ------------------------------------------------------------------ entrada em cada fase
function enterStep(world, id) {
  const off = world.offseason;
  const st = stepOf(off, id);
  st.status = 'active';
  off.current = id;
  switch (id) {
    case 'finals': {
      archiveSeasonStats(world, off.season);
      const closed = closeSeasonBooks(world, off.season);
      say(off, `Contas de ${off.season} fechadas para ${closed.length} franquias.`);
      break;
    }
    case 'awards': computeAwards(world); break;
    case 'retirements': off.retirements = { list: decideRetirements(world, off.season), forced: [], kept: [], applied: false }; break;
    case 'lottery': setCalendarDate(addDays(off.finalsEnd, 14)); ensureDraft(world); break;
    case 'scouting': setCalendarDate(addDays(world.calendar.date, 10)); break;
    case 'draft': setCalendarDate(addDays(off.finalsEnd, 30)); break;
    case 'contracts': setCalendarDate(addDays(world.calendar.date, 5)); break;
    case 'free-agency': off.faDay = 0; break;
    case 'roster': {
      for (const team of world.teams.values()) if (team.id !== world.career.teamId) aiRosterAdjust(world, team.id, { minimum: world.league.roster.regularSeasonMin });
      say(off, 'Franquias da IA ajustaram seus elencos.');
      break;
    }
    default: break;
  }
  save();
}

/** Fases que se concluem sozinhas ao serem alcançadas. */
function autoAdvance(world) {
  const off = world.offseason;
  let guard = 0;
  while (guard++ < 5 && ['finals', 'awards'].includes(off.current) && stepOf(off, off.current).status === 'active') completeStep(world, off.current);
}

// ------------------------------------------------------------------ conclusão de cada fase
/** Conclui a fase `id` (a ativa) se os requisitos obrigatórios estiverem atendidos e ativa a seguinte. */
export function completeStep(world, id = world.offseason?.current) {
  const off = ensureOffseason(world);
  if (!off || off.current !== id) throw new Error('Esta não é a fase ativa da offseason.');
  const blocking = requirements(world, id).filter((r) => r.blocking);
  if (blocking.length && !(godModeAllowed(world.career) && world.career.godOverride?.active)) {
    const err = new Error(blocking[0].text);
    err.details = blocking;
    throw err;
  }
  switch (id) {
    case 'retirements': applyRetirements(world); break;
    case 'lottery': if (!world.draft?.lottery) runLottery(world); break;
    case 'contracts': if (!off.leagueYearStarted) startLeagueYear(world); break;
    case 'free-agency': while (off.faDay < off.faDays) simulateFreeAgencyDay(world); break;
    case 'next-season': finishOffseason(world); return;
    default: break;
  }
  const st = stepOf(off, id);
  st.status = 'done';
  st.doneOn = world.calendar.date;
  const index = OFFSEASON_STEPS.findIndex((s) => s.id === id);
  const next = OFFSEASON_STEPS[index + 1];
  say(off, `${STEP_BY_ID[id].label}: concluída.`);
  if (next) enterStep(world, next.id);
  save();
  emit('offseason:step', { done: id, next: next?.id ?? null });
  return next?.id ?? null;
}

// ------------------------------------------------------------------ ações das fases
function archiveSeasonStats(world, season) {
  if (world.offseason.applied.statsArchived) return;
  for (const s of world.seasonStats.values()) {
    if (!s.gp) continue;
    let record = world.careerStats.get(s.playerId);
    if (!record) { record = { playerId: s.playerId, rows: [], advanced: null }; world.careerStats.set(s.playerId, record); }
    if (record.rows.some((r) => r[COL.season] === season)) continue;
    const avg = (v) => Math.round((v / s.gp) * 10) / 10;
    record.rows.push([season, s.teamId, s.gp, s.gs, avg(s.min), avg(s.fgm), avg(s.fga), avg(s.tpm), avg(s.tpa), avg(s.ftm), avg(s.fta), avg(s.orb), avg(s.drb), avg(s.ast), avg(s.stl), avg(s.blk), avg(s.tov), avg(s.pf), avg(s.pts)]);
    markDirty('careerStats', s.playerId);
  }
  world.offseason.applied.statsArchived = true;
}

const STATS_INDEX = (s) => (s.pts + 0.9 * (s.orb + s.drb) + 1.5 * s.ast + 2 * (s.stl + s.blk) - 1.5 * s.tov) / Math.max(1, s.gp);
function computeAwards(world) {
  const off = world.offseason;
  const post = world.calendar.postseason;
  const stats = [...world.seasonStats.values()].filter((s) => s.gp >= 25 && world.players.has(s.playerId));
  const top = (key, fn) => { const best = [...stats].sort((a, b) => fn(b) - fn(a))[0]; return best ? { playerId: best.playerId, teamId: best.teamId, value: Math.round(fn(best) * 10) / 10 } : null; };
  const per = (k) => (s) => s[k] / s.gp;
  const rookies = stats.filter((s) => world.players.get(s.playerId).rookie || (world.players.get(s.playerId).exp ?? 9) <= 1);
  const rookie = [...rookies].sort((a, b) => STATS_INDEX(b) - STATS_INDEX(a))[0];
  const champStats = stats.filter((s) => s.teamId === post?.champion);
  const fm = [...champStats].sort((a, b) => STATS_INDEX(b) - STATS_INDEX(a))[0];
  const best = [...stats].sort((a, b) => STATS_INDEX(b) - STATS_INDEX(a))[0];
  off.awards = {
    note: 'Destaques estatísticos calculados pelo jogo; não são prêmios oficiais.',
    champion: post?.champion ?? null, runnerUp: post?.runnerUp ?? null,
    bestStatisticalSeason: best ? { playerId: best.playerId, teamId: best.teamId, value: Math.round(STATS_INDEX(best) * 10) / 10 } : null,
    finalsStandout: fm ? { playerId: fm.playerId, teamId: fm.teamId, value: Math.round(STATS_INDEX(fm) * 10) / 10 } : null,
    rookie: rookie ? { playerId: rookie.playerId, teamId: rookie.teamId, value: Math.round(STATS_INDEX(rookie) * 10) / 10 } : null,
    scoring: top('pts', per('pts')), rebounds: top('reb', (s) => (s.orb + s.drb) / s.gp), assists: top('ast', per('ast')), steals: top('stl', per('stl')), blocks: top('blk', per('blk')),
  };
  const completed = world.career.completedSeasons?.find((c) => c.season === off.season);
  if (completed) { completed.awards = off.awards; markDirty('meta', 'career'); }
  const p = (a) => (a ? world.players.get(a.playerId)?.name : '—');
  if (best) addNews({ category: 'liga', title: `Destaque estatístico da temporada: ${p(off.awards.bestStatisticalSeason)}`, body: `Líderes: pontos ${p(off.awards.scoring)} (${off.awards.scoring?.value}), rebotes ${p(off.awards.rebounds)} (${off.awards.rebounds?.value}), assistências ${p(off.awards.assists)} (${off.awards.assists?.value}). Índice estatístico do jogo, não um prêmio oficial.`, teamIds: [], playerIds: [off.awards.bestStatisticalSeason.playerId] });
}

export function applyRetirements(world) {
  const off = world.offseason;
  if (off.retirements.applied) return [];
  const forced = new Set(off.retirements.forced);
  const kept = new Set(off.retirements.kept);
  const retired = [];
  for (const r of off.retirements.list) {
    const retires = forced.has(r.playerId) || (r.retires && !kept.has(r.playerId));
    if (!retires) continue;
    const reason = r.reasons.length ? `Aposentadoria: ${r.reasons.join('; ')}` : 'Aposentadoria no fim da carreira';
    retirePlayer(world, r.playerId, { season: off.season, reason, deadMoney: off.retirementDeadMoney === true });
    retired.push(r.playerId);
  }
  // quem fica mais uma temporada sem time envelhece na fila de free agents
  off.retirements.applied = true;
  off.retirements.retired = retired;
  say(off, `${retired.length} jogador(es) se aposentaram.`);
  save();
  return retired;
}

/** Controle do comissário sobre as aposentadorias antes de serem aplicadas. */
export function setRetirementOverride(world, playerId, mode) {
  if (!godModeAllowed(world.career)) throw new Error('Somente o comissário controla aposentadorias.');
  const r = world.offseason?.retirements;
  if (!r || r.applied) throw new Error('As aposentadorias já foram aplicadas.');
  r.forced = r.forced.filter((id) => id !== playerId);
  r.kept = r.kept.filter((id) => id !== playerId);
  if (mode === 'force') { r.forced.push(playerId); if (!r.list.some((x) => x.playerId === playerId)) r.list.push({ playerId, teamId: world.players.get(playerId)?.teamId ?? null, age: 0, ovr: world.players.get(playerId)?.ovr, probability: 1, reasons: ['decisão do comissário'], retires: true }); }
  if (mode === 'keep') r.kept.push(playerId);
  save();
}

/** Decide uma team option do usuário (antes do início do ano de liga). */
export function decideUserOption(world, playerId, exercise) {
  const off = world.offseason;
  if (off.leagueYearStarted) throw new Error('O ano de liga já começou: as opções foram decididas.');
  const contract = world.contracts.get(playerId);
  const year = contract?.years.find((y) => y.season === off.season + 1 && y.option === 'team');
  if (!year) throw new Error('Não há team option pendente para este jogador.');
  if (world.players.get(playerId).teamId !== world.career.teamId && !godModeAllowed(world.career)) throw new Error('Você só decide opções da sua franquia.');
  // a decisão é gravada no contrato; o efeito (virar free agent ou ficar) ocorre no início do ano de liga
  if (exercise) { year.optionDecided = true; year.optionExercised = 'team'; year.option = null; }
  else contract.years = contract.years.filter((y) => y.season <= off.season);
  markDirty('contracts', playerId);
  return { exercise };
}

/** 30 de junho/1º de julho: opções, vencimentos, direitos de renovação, novo cap e renovações da IA. */
export function startLeagueYear(world) {
  const off = world.offseason;
  if (off.leagueYearStarted) return off;
  const next = off.season + 1;
  const userPending = pendingOptions(world, next).filter((o) => o.teamId === world.career.teamId && o.kind === 'team');
  for (const o of userPending) decideUserOption(world, o.playerId, true); // conservador: quem esqueceu mantém (só chega aqui com Override)
  advanceLeagueCap(world, next);
  off.leagueYearStarted = true; // a partir daqui capSeason(world) = próxima temporada
  const decided = resolveOptions(world, { skipTeamId: null });
  ensureRights(world);
  let expired = 0;
  for (const player of world.players.values()) {
    if (player.retired) {
      continue;
    }
    player.exp = (player.exp ?? 0) + 1;
    markDirty('players', player.id);
    if (!player.teamId) { player.freeSeasons = (player.freeSeasons ?? 0) + 1; continue; }
    const contract = world.contracts.get(player.id);
    if (!contract) continue;
    const hasFuture = contract.years.some((y) => y.season >= next);
    if (hasFuture) continue;
    const teamId = player.teamId;
    const last = contract.years.at(-1);
    contract.lastTeamId = teamId;
    contract.teamId = null;
    contract.expiredOn = world.calendar.date;
    player.teamId = null;
    if (contract.type !== 'camp' && !contract.twoWay) {
      (off.rights[teamId] ??= []).push(player.id);
      off.rightsInfo[player.id] = { teamId, lastSalary: last.salary, hold: capHoldFor(world, player, last.salary) };
    }
    player.rosterStatus = 'standard';
    markDirty('players', player.id);
    markDirty('contracts', player.id);
    expired++;
  }
  bumpRosters();
  const reSigned = [];
  for (const team of world.teams.values()) if (team.id !== world.career.teamId) reSigned.push(...aiReSign(world, team.id));
  say(off, `Novo ano de liga: ${decided.length} opções decididas, ${expired} contratos venceram, ${reSigned.length} renovações da IA.`);
  addNews({ category: 'mercado', title: 'Começa a free agency', body: `${expired} contratos venceram. Franquias da IA renovaram ${reSigned.length} jogadores com Bird rights; o restante está no mercado.` });
  save();
  markDirty('meta', 'league');
  return off;
}

/** Um dia de free agency: ofertas da IA, mercado de trocas e passagem do calendário. */
export function simulateFreeAgencyDay(world) {
  const off = world.offseason;
  if (!off.leagueYearStarted) throw new Error('A free agency só abre depois das decisões contratuais.');
  if (off.faDay >= off.faDays) return [];
  const signings = aiFreeAgencyDay(world, { day: off.faDay });
  off.faDay += 1;
  setCalendarDate(addDays(world.calendar.date, 1));
  try { runAiMarketTick(world); } catch (err) { console.error('Mercado da IA falhou na free agency', err); }
  save();
  emit('offseason:fa-day', { day: off.faDay, signings });
  return signings;
}

// ------------------------------------------------------------------ virada de temporada
/**
 * Aplica o desenvolvimento (uma vez), cura lesões, reavalia estratégias, avança o calendário e abre a
 * nova temporada. Idempotente por marcador (`development:<ano>`).
 */
export function finishOffseason(world) {
  const off = world.offseason;
  if (!off.leagueYearStarted) throw new Error('O ano de liga ainda não começou.');
  const dev = applyOffseasonDevelopment(world, off.season);
  for (const p of world.players.values()) if (p.injury && !p.injury.forced) { p.injury = null; markDirty('players', p.id); }
  for (const p of world.players.values()) if (p.rookie && (p.exp ?? 0) >= 1) { p.rookie = false; markDirty('players', p.id); }
  assignGmProfiles(world, { markDirty, force: true });
  stepOf(off, 'next-season').status = 'done';
  stepOf(off, 'next-season').doneOn = world.calendar.date;
  off.finished = { developmentApplied: dev.applied, changed: dev.changed };
  world.career.offseasonHistory ??= [];
  world.career.offseasonHistory.push({ season: off.season, finishedOn: world.calendar.date, retired: off.retirements?.retired?.length ?? 0, developed: dev.changed, awards: off.awards?.bestStatisticalSeason ?? null });
  markDirty('meta', 'career');
  save();
  emit('offseason:finished', { season: off.season });
}

/** Marca o ciclo como encerrado e libera `beginNextSeason`. */
export function offseasonFinished(world = getWorld()) {
  return Boolean(world.offseason) && stepOf(world.offseason, 'next-season').status === 'done';
}

// ------------------------------------------------------------------ automático
/** Conclui toda a offseason com decisões padrão também para o usuário. Usado por "Concluir automaticamente" e pelos testes. */
export function autoCompleteOffseason(world, { drafting = 'auto' } = {}) {
  const off = ensureOffseason(world);
  let guard = 0;
  while (off.current && guard++ < 40) {
    const id = off.current;
    if (id === 'draft') {
      ensureDraft(world);
      if (world.draft.status !== 'complete') { if (drafting === 'sim') simAll(world); else { runLottery(world); startDraft(world); simAll(world); } }
    }
    if (id === 'contracts') autoDecideUserOptions(world);
    if (id === 'renewals' || id === 'free-agency') {
      if (id === 'free-agency') { while (off.faDay < off.faDays) simulateFreeAgencyDay(world); autoUserReSign(world); }
    }
    if (id === 'roster') aiRosterAdjust(world, world.career.teamId, { minimum: world.league.roster.regularSeasonMin });
    if (id === 'next-season') { finishOffseason(world); break; }
    completeStep(world, id);
  }
  return off;
}

/** Opções de time do usuário no modo automático: exerce quando o jogador vale o salário (mesmo critério da IA). */
function autoDecideUserOptions(world) {
  const off = world.offseason;
  if (off.leagueYearStarted) return [];
  const decided = [];
  for (const option of pendingOptions(world, off.season + 1).filter((o) => o.teamId === world.career.teamId && o.kind === 'team')) {
    const exercise = aiOptionDecision(world, option);
    decideUserOption(world, option.playerId, exercise);
    decided.push({ ...option, exercise });
  }
  return decided;
}

function autoUserReSign(world) {
  // Renovação automática conservadora: o usuário mantém quem o time reteria (IA com o perfil do usuário).
  aiReSign(world, world.career.teamId);
}

export { decideOption };
