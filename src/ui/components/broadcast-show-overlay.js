// Broadcast show em camada DOM; nunca interfere com jogabilidade, eventos ou saves.
import { h, mount } from '../dom.js';
import { createBroadcastShowTracker } from '../../match/broadcast-show-state.js';

export function createBroadcastShowOverlay(sim, { context = {}, now = () => performance.now() } = {}) {
  const tracker = createBroadcastShowTracker(sim, { now, context });
  const root = h('section', { class: 'nuv-show hidden', 'aria-label': 'Vinheta de transmissão', 'aria-hidden': 'true' });
  let lastKey = '', disposed = false;
  const render = (card) => {
    if (!card) {
      root.classList.add('hidden'); root.setAttribute('aria-hidden', 'true'); lastKey = '';
      return;
    }
    const key = JSON.stringify(card);
    if (lastKey === key) return;
    lastKey = key;
    const score = h('div', { class: 'nuv-show-score' },
      h('span', { class: 'nuv-show-team' }, card.names[0]),
      h('strong', null, `${card.score[0]} : ${card.score[1]}`),
      h('span', { class: 'nuv-show-team' }, card.names[1]));
    const rows = (card.stats ?? []).length ? h('div', { class: 'nuv-show-stats' },
      card.stats.map(r => h('div', { class: 'nuv-show-stat' }, h('strong', null, r.values[0]), h('span', null, r.label), h('strong', null, r.values[1])))) : null;
    const players = card.players?.length ? h('div', { class: 'nuv-show-players' },
      card.players.slice(0, 10).map(p => h('span', { class: 'nuv-show-player' },
        `${p.player} · ${p.team}${p.starter ? ' · titular' : ` · ${p.pts} PTS · ${p.reb} REB · ${p.ast} AST`}`))) : null;
    mount(root,
      h('div', { class: 'nuv-show-inner' },
        h('span', { class: 'nuv-show-brand' }, card.competition),
        h('h2', null, card.heading),
        score,
        h('p', { class: 'nuv-show-desc' }, card.description),
        rows, players,
        h('small', { class: 'nuv-show-foot' }, 'Dados da simulação · vinheta ilustrativa')),
    );
    root.classList.remove('hidden'); root.setAttribute('aria-hidden', 'false');
  };
  const refresh = () => { if (!disposed) render(tracker.refresh()); };
  refresh();
  return {
    root, refresh,
    show(kind) { if (!disposed) render(tracker.show(kind)); },
    setEnabled(value) { const active = tracker.setEnabled(value); if (!active) render(null); return active; },
    get enabled() { return tracker.enabled; },
    dispose() { disposed = true; render(null); },
  };
}
