// Fachada de compatibilidade do mercado. O motor real está em trade-engine.js (trocas multi-franquia, picks,
// swaps, dinheiro, CBA) e contracts-engine.js (free agency e contratos). As funções abaixo mantêm a API
// antiga (troca 1×1 e contratação direta) mas passam pelo MESMO motor — não há mais salary matching provisório.
import { getWorld } from '../core/world.js';
import { checkTrade, executeProposal, playerAsset } from './trade-engine.js';
import { signFreeAgentOffer } from './contracts-engine.js';

const FAIL = (reason) => ({ ok: false, reason });

const oneForOne = ({ fromTeamId, toTeamId, sendId, receiveId }) => ({ assets: [playerAsset(sendId, fromTeamId, toTeamId), playerAsset(receiveId, toTeamId, fromTeamId)] });

export function evaluateTrade(world, trade) {
  const { fromTeamId, toTeamId, sendId, receiveId } = trade;
  if (!fromTeamId || !toTeamId || fromTeamId === toTeamId) return FAIL('Franquias distintas são obrigatórias.');
  const send = world.players.get(sendId);
  const receive = world.players.get(receiveId);
  if (!world.teams.has(fromTeamId) || !world.teams.has(toTeamId) || !send || !receive || send.teamId !== fromTeamId || receive.teamId !== toTeamId) return FAIL('Franquia ou atleta inválido.');
  const proposal = oneForOne(trade);
  let check;
  try {
    check = checkTrade(world, proposal);
  } catch (err) {
    return FAIL(`Não foi possível avaliar a troca: ${err.message}`);
  }
  if (!check.legality.ok) return FAIL(check.legality.blocked[0].message);
  const decision = check.acceptance.decisions[toTeamId];
  if (decision && !decision.accept) return FAIL(decision.cons[0] ?? 'A outra diretoria recusou a proposta.');
  const sums = check.legality.teams;
  return { ok: true, reason: 'Proposta legal e aceitável para a outra diretoria.', deltaAI: decision ? decision.net - decision.required : 0, salary: [sums[fromTeamId].outgoing, sums[toTeamId].outgoing] };
}

export function executeTrade(trade, world = getWorld()) {
  if (!world) throw new Error('Abra uma carreira para negociar.');
  const decision = evaluateTrade(world, trade);
  if (!decision.ok) throw new Error(decision.reason);
  executeProposal(world, oneForOne(trade), { by: 'user' });
  return decision;
}

/** Contratação direta de free agent (mesmas regras do centro de contratos). */
export function signFreeAgent({ teamId, playerId, salary, years = 1 }, world = getWorld()) {
  return signFreeAgentOffer(world, { teamId, playerId, salary, years });
}
