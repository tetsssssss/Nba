// Transmissão visual opcional: apenas lê MatchSim. Nenhum save/configuração é gravado.
import { h } from '../dom.js';
import { broadcastSnapshot } from '../../match/broadcast-bridge.js';
import { broadcastOverlayState, createBroadcastCueTracker } from '../../match/broadcast-overlay-state.js';

export function createLiveBroadcastOverlay(sim, { mode = 'quick', now = () => performance.now(), cueDuration = 5700, onCue = null } = {}) {
  const tracker = createBroadcastCueTracker(sim?.events);
  let visible = true;
  let lastFrame = '';
  let cueUntil = -Infinity;
  let disposed = false;

  const brand = h('span', { class: 'nuv-tv-brand' }, 'NBA UNIVERSE TV');
  const competition = h('span', { class: 'nuv-tv-competition' });
  const homeName = h('span', { class: 'nuv-tv-name' });
  const awayName = h('span', { class: 'nuv-tv-name' });
  const homeScore = h('strong', { class: 'nuv-tv-points' });
  const awayScore = h('strong', { class: 'nuv-tv-points' });
  const period = h('span', { class: 'nuv-tv-period' });
  const clock = h('strong', { class: 'nuv-tv-clock' });
  const shot = h('span', { class: 'nuv-tv-shot' });
  const possession = [h('span', { class: 'nuv-tv-possession', 'aria-label': 'Posse da equipe mandante' }, '●'), h('span', { class: 'nuv-tv-possession', 'aria-label': 'Posse da equipe visitante' }, '●')];
  const cueLabel = h('strong', { class: 'nuv-tv-cue-label' });
  const cueTeam = h('span', { class: 'nuv-tv-cue-team' });
  const cueText = h('span', { class: 'nuv-tv-cue-text' });
  const cueTime = h('span', { class: 'nuv-tv-cue-time' });
  const cue = h('div', { class: 'nuv-tv-cue hidden', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true', 'aria-hidden': 'true' },
    h('div', { class: 'nuv-tv-cue-top' }, cueLabel, cueTime), cueTeam, cueText);
  const root = h('section', { class: 'nuv-tv-overlay', 'aria-label': 'Placar e destaques da transmissão', 'aria-hidden': 'false' },
    h('div', { class: 'nuv-tv-header' }, brand, competition),
    h('div', { class: 'nuv-tv-scorebug' },
      h('div', { class: 'nuv-tv-side nuv-tv-home' }, homeName, homeScore, possession[0]),
      h('div', { class: 'nuv-tv-center' }, period, clock, h('span', { class: 'nuv-tv-shot-wrap' }, 'POSSE ', shot)),
      h('div', { class: 'nuv-tv-side nuv-tv-away' }, possession[1], awayScore, awayName)),
    cue);

  function setVisible(value) {
    visible = Boolean(value);
    root.classList.toggle('nuv-tv-hidden', !visible);
    root.setAttribute('aria-hidden', String(!visible));
    if (!visible) { cue.classList.add('hidden'); cue.setAttribute('aria-hidden', 'true'); }
    return visible;
  }
  function refresh(force = false) {
    if (disposed) return;
    if (!visible) { tracker.observe(sim?.events, sim?.teams?.map(team => team.name)); return; }
    const snapshot = broadcastSnapshot(sim, { eventLimit: 1 });
    const state = broadcastOverlayState(snapshot, { mode });
    const values = [...state.names, ...state.score, state.period, state.clock, state.shotClock, state.possession, state.mode];
    const key = values.join('\u0001');
    if (force || key !== lastFrame) {
      lastFrame = key;
      [homeName.textContent, awayName.textContent] = state.names;
      [homeScore.textContent, awayScore.textContent] = state.score;
      period.textContent = state.period;
      clock.textContent = state.clock;
      shot.textContent = state.shotClock;
      competition.textContent = state.mode;
      for (let i = 0; i < 2; i++) possession[i].classList.toggle('hidden', state.possession !== i);
    }
    const incoming = tracker.observe(sim?.events, snapshot.teams);
    if (incoming) {
      cueLabel.textContent = incoming.label;
      cueTeam.textContent = incoming.teamName;
      cueText.textContent = incoming.text;
      cueTime.textContent = `${incoming.quarter}º · ${incoming.clock}`;
      cue.dataset.kind = incoming.type;
      onCue?.(incoming);
      cueUntil = now() + cueDuration;
      cue.classList.remove('hidden');
      cue.setAttribute('aria-hidden', 'false');
    } else if (now() >= cueUntil) {
      cue.classList.add('hidden');
      cue.setAttribute('aria-hidden', 'true');
    }
  }
  refresh(true);
  return { root, refresh, setVisible, get visible() { return visible; }, dispose() { disposed = true; } };
}
