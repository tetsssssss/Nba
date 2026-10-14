// Ponte entre o motor de partida e a carreira: transforma uma simulação encerrada
// num registro da store `games`. É o formato que o calendário (Fase 4) vai consumir.
//
// O que já funciona: amistosos jogados dentro de uma carreira ficam gravados no save
// (placar, períodos, box score, semente e sliders) e aparecem na Central do GM.
//
// O que a integração completa ainda precisa (e NÃO é feito aqui, porque ainda não há calendário):
//   1. um jogo agendado em `games` (type 'regular' | 'playoff', status 'scheduled') escolhido pelo usuário;
//   2. elencos reais do dia, respeitando lesões e a rotação definida;
//   3. jogar no motor (este arquivo recebe o resultado);
//   4. somar o box score às estatísticas da temporada de cada jogador;
//   5. aplicar fadiga e lesões ocorridas em quadra;
//   6. atualizar campanha (record) das duas franquias e a classificação.
// Amistosos ('exhibition') nunca alteram campanha, estatísticas ou condição física.
import { periodScores } from './highlights.js';

export const GAME_RECORD_VERSION = 1;
const STAT_KEYS = ['pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'orb', 'drb', 'ast', 'stl', 'blk', 'tov', 'pf'];
const pick = (src) => Object.fromEntries(STAT_KEYS.map((k) => [k, src[k] ?? 0]));

/** Registro de jogo a partir de uma simulação encerrada. `userTeam`: índice (0/1) do time comandado, ou null. */
export function buildGameRecord(sim, { type = 'exhibition', userTeam = null } = {}) {
  const box = sim.boxScore();
  return {
    v: GAME_RECORD_VERSION,
    type,
    status: 'final',
    seed: String(sim.seed),
    home: sim.teams[0].id,
    away: sim.teams[1].id,
    score: [...sim.score],
    periods: periodScores(sim),
    overtimes: Math.max(0, sim.quarter - 4),
    quarterSeconds: sim.quarterSeconds,
    userTeamId: userTeam == null ? null : sim.teams[userTeam].id,
    sliders: { ...sim.sl },
    box: box.map((t) => ({ teamId: t.id, total: pick(t.total), players: t.rows.map((r) => ({ id: r.id, name: r.name, starter: r.starter, min: Math.round(r.min * 10) / 10, ...pick(r) })) })),
  };
}

/** Confere a coerência de um registro (usado nos testes e antes de gravar). Devolve a lista de problemas. */
export function validateGameRecord(record) {
  const problems = [];
  if (record?.v !== GAME_RECORD_VERSION) problems.push('versão do registro desconhecida');
  if (!record?.home || !record?.away || record.home === record.away) problems.push('times inválidos');
  if (!Array.isArray(record?.score) || record.score.length !== 2) problems.push('placar ausente');
  if (problems.length) return problems;
  record.box.forEach((t, i) => {
    if (t.total.pts !== record.score[i]) problems.push(`pontos do box score (${t.total.pts}) diferentes do placar (${record.score[i]})`);
    const sum = t.players.reduce((a, p) => a + p.pts, 0);
    if (sum !== t.total.pts) problems.push('soma dos jogadores diferente do total do time');
    const periods = record.periods[i].reduce((a, b) => a + b, 0);
    if (periods !== record.score[i]) problems.push('soma dos períodos diferente do placar');
  });
  if (record.type !== 'exhibition' && record.status === 'final' && record.score[0] === record.score[1]) problems.push('jogo oficial encerrado empatado');
  return problems;
}

/** Cestinha de cada time, para resumos. */
export const topScorers = (record) => record.box.map((t) => t.players.slice().sort((a, b) => b.pts - a.pts)[0] ?? null);
