// Roteiro do projeto: o que já existe e o que cada fase vai entregar.
import { h } from '../dom.js';
import { parseHash } from '../router.js';
import { chip } from '../components/widgets.js';
import { PHASES, PHASE_STATUS_LABEL } from '../../core/roadmap.js';

const KIND = { done: 'good', partial: 'warn', todo: '' };

export function roadmapView() {
  const focus = Number(parseHash().query.get('fase')) || null;
  const cards = PHASES.map((p) =>
    h(
      'section',
      { class: 'card', id: `fase-${p.id}`, style: focus === p.id ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 1px var(--accent)' } : null },
      h('div', { class: 'card-head' }, h('h2', null, `Fase ${p.id} — ${p.title}`), chip(PHASE_STATUS_LABEL[p.status], KIND[p.status])),
      h('ul', { style: { margin: 0, paddingLeft: '18px', color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: '4px' } }, p.items.map((item) => h('li', null, item))),
    ),
  );
  const root = h(
    'div',
    { class: 'page' },
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Roteiro do projeto'), h('p', { class: 'sub' }, 'O jogo cresce em módulos. Itens marcados com "Fase N" na interface ainda não existem — nenhum botão finge funcionar.'))),
    focus ? h('div', { class: 'note', style: { marginBottom: '16px' } }, `A área que você abriu faz parte da Fase ${focus}, destacada abaixo.`) : null,
    h('div', { class: 'grid cols-2' }, cards),
  );
  if (focus) requestAnimationFrame(() => root.querySelector(`#fase-${focus}`)?.scrollIntoView({ block: 'center' }));
  return root;
}
