// Mercado mínimo: troca 1 por 1 em uma operação validada antes de qualquer mutação.
// NÃO é uma implementação integral do CBA: restrições de picks, exceções, Bird rights e aprons
// precisam de um simulador financeiro completo antes de trades complexos.
import { salaryIn, teamPayroll } from './cap.js';
import { addNews, getWorld, movePlayer, markDirty } from '../core/world.js';
import { modeShows } from '../core/modes.js';
const FAIL = (reason) => ({ ok: false, reason });
export function evaluateTrade(world, { fromTeamId, toTeamId, sendId, receiveId }) {
  if (!fromTeamId || !toTeamId || fromTeamId === toTeamId) return FAIL('Franquias distintas são obrigatórias.');
  const a = world.teams.get(fromTeamId), b = world.teams.get(toTeamId);
  const send = world.players.get(sendId), receive = world.players.get(receiveId);
  if (!a || !b || !send || !receive || send.teamId !== fromTeamId || receive.teamId !== toTeamId) return FAIL('Franquia ou atleta inválido.');
  if (send.rosterStatus !== 'standard' || receive.rosterStatus !== 'standard') return FAIL('Trocas simples exigem dois contratos padrão.');
  if ((send.injury?.status === 'Out') || (receive.injury?.status === 'Out')) return FAIL('Atleta lesionado não está elegível para esta modalidade simplificada.');
  const season = world.calendar.season;
  const sa = salaryIn(world.contracts.get(sendId), season), sb = salaryIn(world.contracts.get(receiveId), season);
  if (!sa || !sb) return FAIL('Ambos os atletas precisam de contrato vigente.');
  const rosterA = teamRosterFrom(world, fromTeamId), rosterB = teamRosterFrom(world, toTeamId);
  // Critério provisório explícito: sem exceções ou salário fictício.
  const payA = teamPayroll(rosterA, world.contracts, a, world.league.cap, season, world.career.capMode);
  const payB = teamPayroll(rosterB, world.contracts, b, world.league.cap, season, world.career.capMode);
  const cap = world.league.cap.salaryCap;
  const afterA = payA.total - sa + sb, afterB = payB.total - sb + sa;
  if ((afterA > cap && afterA > payA.total * 1.25) || (afterB > cap && afterB > payB.total * 1.25)) return FAIL('Troca recusada pelas restrições financeiras simplificadas.');
  const avaliacao = (p, salary) => (p.ovr ?? 70) + 0.3 * Math.max(0, (p.potential ?? p.ovr ?? 70) - (p.ovr ?? 70)) - Math.max(0, salary / 1e6 - 20) * 0.14;
  const deltaAI = avaliacao(send, sa) - avaliacao(receive, sb);
  if (deltaAI < -3) return FAIL('A outra diretoria considera a proposta desfavorável.');
  return { ok: true, reason: 'Proposta elegível na regra simplificada.', deltaAI, salary: [sa, sb] };
}
const teamRosterFrom = (world, id) => [...world.players.values()].filter((p) => p.teamId === id);
export function executeTrade({ fromTeamId, toTeamId, sendId, receiveId }, world = getWorld()) {
  if (!world) throw new Error('Abra uma carreira para negociar.');
  if (!modeShows(world.career, 'market') || (!world.career.godMode && fromTeamId !== world.career.teamId)) throw new Error('Seu cargo não permite conduzir esta negociação.');
  const proposal = { fromTeamId, toTeamId, sendId, receiveId };
  const decision = evaluateTrade(world, proposal);
  if (!decision.ok) throw new Error(decision.reason);
  const first = world.players.get(sendId), second = world.players.get(receiveId);
  // Toda validação é anterior à aplicação; ambas as movimentações são executadas sem await.
  movePlayer(first, toTeamId, { type: 'trade', note: `Troca por ${second.name}` });
  movePlayer(second, fromTeamId, { type: 'trade', note: `Troca por ${first.name}` });
  addNews({ category: 'mercado', title: `${world.teams.get(fromTeamId).name} e ${world.teams.get(toTeamId).name} realizam troca`, body: `${first.name} vai para ${world.teams.get(toTeamId).name}; ${second.name} reforça ${world.teams.get(fromTeamId).name}.`, teamIds: [fromTeamId, toTeamId], playerIds: [sendId, receiveId] });
  return decision;
}

/** Contratação simples: só um atleta livre, espaço integral no cap e contrato sem exceções. */
export function signFreeAgent({ teamId, playerId, salary, years = 1 }, world = getWorld()) {
  if (!world || !world.teams.has(teamId)) throw new Error('Franquia inválida.');
  if (!modeShows(world.career, 'market') || (!world.career.godMode && teamId !== world.career.teamId)) throw new Error('Seu cargo não pode contratar jogadores.');
  const athlete = world.players.get(playerId), now = world.calendar.season;
  if (!athlete || athlete.teamId) throw new Error('Jogador não está livre no mercado.');
  if (!Number.isInteger(years) || years < 1 || years > 4 || !Number.isFinite(salary)) throw new Error('Contrato inválido.');
  const minimum = world.league.cap.minimumSalaryScale?.byYearsOfService?.[Math.min(10,athlete.exp ?? 0)] ?? 1000000;
  if (salary < minimum) throw new Error('Salário inferior ao mínimo da liga.');
  const max = world.league.cap.maxSalary?.years0to6 ?? world.league.cap.salaryCap * .25;
  if (salary > max) throw new Error('Oferta acima do salário máximo simplificado.');
  const team = world.teams.get(teamId);
  const roster = teamRosterFrom(world,teamId).filter(p=>p.rosterStatus !== 'two-way');
  if (roster.length >= (world.league.roster?.standardMax ?? 15)) throw new Error('Limite de elenco padrão atingido.');
  const payroll = teamPayroll(roster,world.contracts,team,world.league.cap,now,world.career.capMode);
  if (payroll.total + salary > world.league.cap.salaryCap) throw new Error('Sem espaço livre no salary cap; exceções ainda não estão implementadas.');
  // IA simplificada: estrelas exigem propostas coerentes com o rating, sem dependência aleatória.
  const expectation = Math.min(max,minimum + Math.pow(Math.max(0,(athlete.ovr ?? 65)-65),2)*50000);
  if (salary < expectation) throw new Error('O agente do atleta recusou a proposta pelo valor oferecido.');
  const contract = { playerId, teamId, yearsWithTeam: 0, years: Array.from({length:years},(_,i)=>({season:now+i,salary:Math.round(salary*Math.pow(1.05,i)),option:null})), twoWay:false, source:'universe-free-agency', type:'standard' };
  world.contracts.set(playerId,contract);
  athlete.rosterStatus = 'standard';
  athlete.teamId = teamId;
  markDirty('players',playerId);
  markDirty('contracts',playerId);
  addNews({category:'mercado',title:`${team.fullName} contrata ${athlete.name}`,body:`Contrato de ${years} temporada(s) com salário inicial de ${salary.toLocaleString('pt-BR')} dólares.`, teamIds:[teamId],playerIds:[playerId]});
  return contract;
}
