// Contratos puros para o placar e as vinhetas da transmissão.
// Não importam motor de partida nem persistência; o estado observado nunca é mutado.
import { classifyBroadcastEvent, BROADCAST_EVENT_LABELS } from './broadcast-bridge.js';

export function broadcastPeriodLabel(quarter, over = false) {
  const q = Math.max(1, Math.trunc(Number(quarter) || 1));
  const name = q > 4 ? `${q - 4}ª PRORROGAÇÃO` : `${q}º QUARTO`;
  return over ? `FINAL · ${name}` : name;
}

export function broadcastClockText(value) {
  const input = Number(value);
  const total = Number.isFinite(input) ? Math.floor(Math.max(0, input)) : 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function broadcastOverlayState(snapshot, { mode = 'quick' } = {}) {
  const safe = snapshot || {};
  const names = Array.isArray(safe.teams) ? safe.teams : [];
  const score = Array.isArray(safe.score) ? safe.score : [];
  const possession = safe.possession === 0 || safe.possession === 1 ? safe.possession : null;
  const official = mode === 'official';
  return {
    names: [String(names[0] ?? 'Casa'), String(names[1] ?? 'Fora')],
    score: [0, 1].map(i => String(Number.isFinite(Number(score[i])) ? Math.max(0, Number(score[i])) : 0)),
    period: broadcastPeriodLabel(safe.quarter, safe.over),
    clock: broadcastClockText(safe.clock),
    shotClock: safe.over ? '—' : `${Number.isFinite(Number(safe.shotClock)) ? Math.max(0, Math.ceil(Number(safe.shotClock))) : 0}s`,
    possession,
    mode: official ? 'JOGO OFICIAL' : mode === 'spectator' ? 'ESPECTADOR' : mode === 'sandbox' ? 'SANDBOX' : 'EXIBIÇÃO',
  };
}

const CUE_TYPES = new Set(['shot', 'block', 'steal', 'timeout', 'substitution', 'period']);

export function broadcastCueFromEvent(event, teams = ['Casa', 'Fora']) {
  if (!event || typeof event !== 'object') return null;
  const type = classifyBroadcastEvent(event);
  if (!CUE_TYPES.has(type)) return null;
  const side = event.team === 0 || event.team === 1 ? event.team : null;
  const text = String(event.text ?? '').trim();
  if (!text) return null;
  return {
    type,
    major: Boolean(event.major),
    label: BROADCAST_EVENT_LABELS[type],
    text,
    teamName: side === null ? '' : String(teams?.[side] ?? (side ? 'Fora' : 'Casa')),
    quarter: Number(event.q) || 1,
    clock: broadcastClockText(event.clock),
  };
}

/**
 * Observa eventos novos somente pela identidade dos objetos; não toca no MatchSim.
 * Novas listas truncadas/rotacionadas mostram no máximo o último lance relevante,
 * evitando uma sequência de overlays obsoletos em simulação acelerada.
 */
export function createBroadcastCueTracker(initialEvents = []) {
  let previous = Array.isArray(initialEvents) ? initialEvents.at(-1) : undefined;
  let primed = Boolean(Array.isArray(initialEvents) && initialEvents.length);
  return {
    observe(events, teams) {
      if (!Array.isArray(events) || !events.length) {
        previous = undefined;
        primed = false;
        return null;
      }
      const latest = events.at(-1);
      if (primed && latest === previous) return null;
      let unseen;
      if (primed) {
        const found = events.lastIndexOf(previous);
        unseen = found >= 0 ? events.slice(found + 1) : events.slice(-1);
      } else unseen = events;
      previous = latest;
      primed = true;
      for (let i = unseen.length - 1; i >= 0; i--) {
        const cue = broadcastCueFromEvent(unseen[i], teams);
        if (cue) return cue;
      }
      return null;
    },
  };
}
