// Abas, modais e avisos.
import { h, mount } from '../dom.js';

/**
 * @param tabs [{ id, label, render: () => Node | Promise<Node> }]
 * @param opts.active   aba inicial
 * @param opts.onChange (id) => void
 */
export function tabView(tabs, { active = tabs[0].id, onChange = null } = {}) {
  const bar = h('div', { class: 'tabs', role: 'tablist' });
  const panel = h('div', { role: 'tabpanel' });
  let current = null;

  async function select(id, notify = true) {
    const tab = tabs.find((t) => t.id === id) ?? tabs[0];
    current = tab.id;
    for (const btn of bar.children) btn.classList.toggle('active', btn.dataset.id === tab.id);
    mount(panel, h('div', { class: 'skeleton-stack', 'aria-busy': 'true' }, h('div', { class: 'skeleton', style: { height: '120px' } }), h('div', { class: 'skeleton' }), h('div', { class: 'skeleton', style: { width: '60%' } })));
    try {
      const content = await tab.render();
      if (current === tab.id) mount(panel, content);
    } catch (err) {
      console.error(err);
      if (current === tab.id) mount(panel, h('div', { class: 'note warn' }, `Não foi possível abrir esta aba: ${err.message}`));
    }
    if (notify) onChange?.(tab.id);
  }

  for (const t of tabs) bar.append(h('button', { class: 'tab', role: 'tab', dataset: { id: t.id }, onclick: () => select(t.id) }, t.label));
  // setas trocam de aba, como em qualquer tablist
  bar.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = tabs.findIndex((t) => t.id === current);
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    select(next.id);
    bar.querySelector(`[data-id="${next.id}"]`)?.focus();
  });
  select(active, false);
  return h('div', null, bar, panel);
}

export function toast(message, kind = '') {
  let host = document.getElementById('toasts');
  if (!host) {
    host = h('div', { id: 'toasts' });
    document.body.append(host);
  }
  const el = h('div', { class: ['toast', kind], role: kind === 'error' ? 'alert' : 'status' }, message);
  host.append(el);
  setTimeout(() => el.remove(), kind === 'error' ? 7000 : 3500);
}

/** Modal genérico. `build(close)` devolve o conteúdo; `onClose` roda uma vez, seja qual for a forma de fechar. */
export function modal(build, { onClose = null, wide = false } = {}) {
  const backdrop = h('div', { class: 'modal-backdrop' });
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  backdrop.addEventListener('mousedown', (e) => e.target === backdrop && close());
  document.addEventListener('keydown', onKey);
  backdrop.append(h('div', { class: ['modal', wide && 'wide'], role: 'dialog', 'aria-modal': 'true' }, build(close)));
  document.body.append(backdrop);
  return close;
}

/** Confirmação para ações destrutivas. Resolve true/false (Esc ou clique fora = cancelado). */
export function confirmDialog({ title, message, confirmLabel = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    let confirmed = false;
    modal(
      (close) => [
        h('h2', null, title),
        h('p', { class: 'muted' }, message),
        h(
          'div',
          { class: 'actions' },
          h('button', { class: 'btn', onclick: close }, 'Cancelar'),
          h('button', { class: ['btn', danger ? 'danger' : 'primary'], onclick: () => ((confirmed = true), close()) }, confirmLabel),
        ),
      ],
      { onClose: () => resolve(confirmed) },
    );
  });
}
