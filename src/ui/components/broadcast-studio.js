// Painel isolado: apresenta eventos e placar lidos do MatchSim sem criar fatos novos.
import { h, mount } from '../dom.js';
import { broadcastSnapshot, BROADCAST_EVENT_LABELS } from '../../match/broadcast-bridge.js';

const readableClock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export function buildLeadGraph(progression) {
  const points = progression?.points ?? [];
  if (points.length < 2) return null;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 320 96');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Evolução da vantagem: ${points.length - 1} registros de pontuação; diferença atual de ${progression.lead} pontos para a equipe da casa.`);
  svg.classList.add('broadcast-lead-chart');
  const range = Math.max(6, ...points.map((p) => Math.abs(p.lead)));
  const mid = 48, extent = 39;
  const segment = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  for (const [a, value] of [['x1', '0'], ['x2', '320'], ['y1', String(mid)], ['y2', String(mid)], ['stroke', 'currentColor'], ['stroke-opacity', '.25']]) segment.setAttribute(a, value);
  svg.append(segment);
  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('stroke', 'currentColor');
  polyline.setAttribute('stroke-width', '2.8');
  polyline.setAttribute('stroke-linecap', 'round');
  polyline.setAttribute('stroke-linejoin', 'round');
  polyline.setAttribute('points', points.map((p, i) => `${(i / (points.length - 1) * 320).toFixed(2)},${(mid - p.lead / range * extent).toFixed(2)}`).join(' '));
  svg.append(polyline);
  return svg;
}

export function createBroadcastStudio(sim) {
  const root = h('section', { class: 'broadcast-studio', 'aria-label': 'Central da transmissão' });
  let lastKey = '';
  function refresh(force = false) {
    const key = [sim.events?.length, sim.score?.join(','), sim.scoreLog?.length, sim.quarter, sim.over, Math.floor(sim.clock)].join('|');
    if (!force && key === lastKey) return;
    lastKey = key;
    const snap = broadcastSnapshot(sim);
    const progress = snap.progress;
    const focus = snap.possession === null ? 'Bola parada ou jogo encerrado' : `Posse: ${snap.teams[snap.possession]}`;
    const latest = snap.events[0];
    mount(root,
      h('div', { class: 'broadcast-studio-kicker' }, 'NBA UNIVERSE TV · CENTRAL AO VIVO'),
      h('h3', null, snap.headline),
      h('p', { class: 'broadcast-studio-meta' }, `${snap.quarter}º período · ${readableClock(snap.clock)} · ${focus} · relógio de posse ${Math.ceil(snap.shotClock)}s`),
      latest ? h('p', { class: 'broadcast-studio-callout' }, h('strong', null, 'Último lance registrado: '), latest.text) : h('p', null, 'Aguardando o primeiro lance da partida.'),
      h('h4', null, 'Evolução da vantagem'),
      progress.verified ? buildLeadGraph(progress) ?? h('p', { class: 'muted small' }, 'O gráfico aparecerá após os primeiros pontos.') : h('p', { class: 'muted small' }, 'Histórico de pontuação incompleto. Não exibimos gráfico impreciso.'),
      h('p', { class: 'muted small' }, `${snap.teams[0]}: ${snap.score[0]} · ${snap.teams[1]}: ${snap.score[1]}`),
      h('h4', null, 'Entenda os acontecimentos'),
      h('ol', { class: 'broadcast-event-list' }, snap.events.map(e => h('li', null,
        h('span', { class: 'broadcast-event-kind' }, BROADCAST_EVENT_LABELS[e.type]),
        h('span', { class: 'broadcast-event-time' }, `${e.quarter}º · ${readableClock(e.clock)}`),
        h('span', null, e.team == null ? e.text : `${snap.teams[e.team]}: ${e.text}`),
      ))),
      h('p', { class: 'muted small broadcast-disclaimer' }, snap.disclaimer),
    );
  }
  refresh(true);
  return { root, refresh };
}
