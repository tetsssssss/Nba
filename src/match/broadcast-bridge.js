// Camada de leitura para a transmissão. Não importa nem modifica o motor, saves ou carreira.
// Eventos e pontos abaixo são exclusivamente observações de MatchSim.
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const safeTeam = (value) => value === 0 || value === 1 ? value : null;

export function classifyBroadcastEvent(event) {
  const text = String(event?.text ?? '').toLocaleLowerCase('pt-BR');
  if (/fim do|encerra|termina|prorroga|intervalo/.test(text)) return 'period';
  if (/três|3 pontos|triplo|enterr|bandeja|cesta|arremesso|lance livre|floater|gancho/.test(text)) return 'shot';
  if (/toco|bloqueio/.test(text)) return 'block';
  if (/roub|intercept/.test(text)) return 'steal';
  if (/rebote/.test(text)) return 'rebound';
  if (/falta/.test(text)) return 'foul';
  if (/tempo pedido|pede tempo|tempo técnico|timeout/.test(text)) return 'timeout';
  if (/substitui|entra em quadra|sai de quadra/.test(text)) return 'substitution';
  if (/passe|assistência/.test(text)) return 'pass';
  return 'other';
}

export const BROADCAST_EVENT_LABELS = Object.freeze({
  period: 'Fim de período', shot: 'Finalização', block: 'Toco', steal: 'Roubo de bola',
  rebound: 'Rebote', foul: 'Falta', timeout: 'Pedido de tempo',
  substitution: 'Substituição', pass: 'Passe', other: 'Lance registrado',
});

const safeScore = (values) => [number(values?.[0]), number(values?.[1])];
export function scoreProgression(scoreLog = [], score = null) {
  // Pode haver registros de placar antigos sem t ou q; mantemos a ordem original.
  const points = [{ home: 0, away: 0, lead: 0, q: 1, t: 0 }];
  let home = 0, away = 0;
  for (const entry of scoreLog) {
    const team = safeTeam(entry?.team), pts = number(entry?.pts);
    if (team === null || !Number.isInteger(pts) || pts <= 0 || pts > 4) continue;
    if (team === 0) home += pts;
    else away += pts;
    points.push({ home, away, lead: home - away, q: number(entry.q, 1), t: number(entry.t) });
  }
  const official = score == null ? null : safeScore(score);
  return {
    points,
    lead: official ? official[0] - official[1] : home - away,
    verified: !official || (official[0] === home && official[1] === away),
    totals: [home, away],
  };
}

export function broadcastSnapshot(sim, { eventLimit = 8 } = {}) {
  const score = safeScore(sim?.score);
  const teams = [0, 1].map(i => String(sim?.teams?.[i]?.name ?? (i === 0 ? 'Casa' : 'Fora')));
  const clock = Math.max(0, number(sim?.clock));
  const shotClock = Math.max(0, number(sim?.shotClock));
  const possession = sim?.over ? null : safeTeam(sim?.offense);
  const events = (Array.isArray(sim?.events) ? sim.events : []).slice(-Math.max(0, Math.min(50, eventLimit))).reverse().map((e) => ({
    team: safeTeam(e.team), text: String(e.text ?? ''), clock: Math.max(0, number(e.clock)),
    quarter: number(e.q, 1), major: Boolean(e.major), type: classifyBroadcastEvent(e),
  }));
  const progress = scoreProgression(sim?.scoreLog, score);
  const leader = score[0] === score[1] ? null : score[0] > score[1] ? 0 : 1;
  const margin = Math.abs(score[0] - score[1]);
  let headline = score[0] === score[1] ? 'Placar empatado' : `${teams[leader]} lidera por ${margin} ${margin === 1 ? 'ponto' : 'pontos'}`;
  if (sim?.over) headline = score[0] === score[1] ? 'Partida encerrada em empate' : `${teams[leader]} venceu por ${margin} ${margin === 1 ? 'ponto' : 'pontos'}`;
  const lastScoring = Array.isArray(sim?.scoreLog) ? sim.scoreLog.at(-1) : null;
  const lastScoringTeam = safeTeam(lastScoring?.team);
  return {
    score, teams, clock, shotClock, possession, leader, margin, headline, events,
    quarter: number(sim?.quarter, 1), over: Boolean(sim?.over),
    lastScoringTeam, lastScoringPoints: lastScoringTeam === null ? null : number(lastScoring.pts),
    progress,
    disclaimer: 'Dados oficiais do motor. A animação 3D é uma representação visual, não rastreamento real de atletas.',
  };
}

// Gerente opcional de câmera. Apenas escolhe um enquadramento; não executa uma jogada.
export function recommendBroadcastCamera(snapshot, { previous = 'broadcast', previousChange = -Infinity, time = 0, minInterval = 4 } = {}) {
  if (!snapshot || time - previousChange < minInterval) return previous;
  if (snapshot.over) return 'diagonal';
  const last = snapshot.events[0];
  if (last?.type === 'shot' && last.major) return 'basket';
  if (last?.type === 'block' || last?.type === 'steal') return 'follow';
  return 'broadcast';
}
