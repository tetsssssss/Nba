// Camadas flutuantes: painel lateral (drawer), menu de contexto e paleta de comandos.
import { h, clear, icon, mount } from '../dom.js';
import { navigate } from '../router.js';
import { normalizeSearch } from '../search.js';
import { kbd } from './widgets.js';
import { playerAvatar, teamLogo } from '../../media/photos.js';
import { getWorld } from '../../core/world.js';

const isTyping = (target) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
export { isTyping };

// ------------------------------------------------------------------ drawer
let closeCurrentDrawer = null;

/**
 * Painel lateral para inspeção rápida sem sair da tela.
 * `build(close)` devolve o conteúdo (Node, lista ou Promise).
 */
export function openDrawer(build, { title = '', wide = false } = {}) {
  closeCurrentDrawer?.();
  const body = h('div', { class: 'drawer-body' }, h('div', { class: 'skeleton-stack' }, h('div', { class: 'skeleton', style: { height: '96px' } }), h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' })));
  const panel = h('aside', { class: ['drawer', wide && 'wide'], role: 'dialog', 'aria-label': title }, h('header', { class: 'drawer-head' }, h('h2', null, title), h('button', { class: 'btn icon ghost', 'aria-label': 'Fechar', onclick: () => close() }, icon('close'))), body);
  const backdrop = h('div', { class: 'drawer-backdrop', onmousedown: (e) => e.target === backdrop && close() }, panel);
  const previous = document.activeElement;
  let open = true;
  function close() {
    if (!open) return;
    open = false;
    closeCurrentDrawer = null;
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('hashchange', close);
    backdrop.classList.remove('open');
    setTimeout(() => backdrop.remove(), 200);
    previous?.focus?.();
  }
  const onKey = (e) => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', close);
  document.body.append(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('open'));
  panel.querySelector('button').focus();
  closeCurrentDrawer = close;
  Promise.resolve(build(close))
    .then((content) => open && mount(body, content))
    .catch((err) => {
      console.error(err);
      if (open) mount(body, h('div', { class: 'note warn' }, `Não foi possível carregar: ${err.message}`));
    });
  return close;
}

// ------------------------------------------------------------------ menu de contexto
let closeCurrentMenu = null;

/**
 * Botão que abre um menu. items: [{ label, icon?, onClick?, href?, danger?, checked?, disabled?, tip?, keepOpen? } | 'sep' | { heading }]
 * `items` pode ser uma função, para refletir o estado no momento da abertura.
 */
export function menuButton(items, { label = null, iconName = 'more', title = 'Mais ações', cls = 'btn icon ghost', align = 'right' } = {}) {
  const button = h('button', { type: 'button', class: cls, 'aria-haspopup': 'menu', 'aria-label': label ? null : title, tip: label ? null : title, onclick: toggle }, iconName ? icon(iconName) : null, label);
  const wrap = h('span', { class: 'menu-wrap' }, button);
  let pop = null;

  function close() {
    pop?.remove();
    pop = null;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', onAway, true);
    document.removeEventListener('keydown', onKey);
    if (closeCurrentMenu === close) closeCurrentMenu = null;
  }
  const onAway = (e) => !wrap.contains(e.target) && close();
  const onKey = (e) => {
    if (e.key === 'Escape') return close(), button.focus();
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const options = [...pop.querySelectorAll('[role^="menuitem"]:not([disabled])')];
    const i = options.indexOf(document.activeElement);
    options[(i + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length]?.focus();
  };
  function build() {
    const list = typeof items === 'function' ? items() : items;
    return list.map((item) => {
      if (item === 'sep') return h('div', { class: 'menu-sep' });
      if (item.heading) return h('div', { class: 'menu-heading' }, item.heading);
      const checkable = item.checked != null;
      return h(
        item.href ? 'a' : 'button',
        {
          type: item.href ? null : 'button', href: item.href ? `#${item.href}` : null, role: checkable ? 'menuitemcheckbox' : 'menuitem', 'aria-checked': checkable ? String(item.checked) : null,
          class: ['menu-item', item.danger && 'danger'], disabled: item.disabled, title: item.tip,
          onclick: () => {
            item.onClick?.();
            if (item.keepOpen) mount(pop, build());
            else close();
          },
        },
        checkable ? h('span', { class: ['menu-check', item.checked && 'on'] }, item.checked ? icon('check') : null) : item.icon ? icon(item.icon) : null,
        item.dot ? h('span', { class: ['menu-dot', item.dot] }) : null,
        h('span', { class: 'grow' }, item.label, item.sub ? h('small', null, item.sub) : null),
        item.hint ? h('span', { class: 'faint' }, item.hint) : null,
      );
    });
  }
  function toggle() {
    if (pop) return close();
    closeCurrentMenu?.();
    pop = h('div', { class: ['menu', `align-${align}`], role: 'menu' }, build());
    wrap.append(pop);
    button.setAttribute('aria-expanded', 'true');
    document.addEventListener('mousedown', onAway, true);
    document.addEventListener('keydown', onKey);
    closeCurrentMenu = close;
  }
  return wrap;
}

// ------------------------------------------------------------------ paleta de comandos (Ctrl+K)
let paletteOpen = false;
let commandSource = () => [];

/** O shell registra páginas e ações: () => [{ label, sub?, icon, path? | run?, keys? }] */
export const setCommandSource = (fn) => (commandSource = fn);

export function openPalette() {
  if (paletteOpen || !getWorld()) return;
  paletteOpen = true;
  const world = getWorld();
  const players = [...world.players.values()].map((p) => ({ p, key: normalizeSearch(p.name) }));
  const teams = [...world.teams.values()].map((t) => ({ t, key: normalizeSearch(`${t.fullName} ${t.id}`) }));
  const coaches = [...world.coaches.values()].map((c) => ({ c, key: normalizeSearch(c.name) }));
  const commands = commandSource().map((c) => ({ ...c, key: normalizeSearch(`${c.label} ${c.sub ?? ''} ${c.alias ?? ''}`) }));

  const input = h('input', { type: 'text', placeholder: 'Buscar jogador, franquia, técnico, página ou ação…', autocomplete: 'off', spellcheck: false, 'aria-label': 'Busca global' });
  const results = h('div', { class: 'palette-results', role: 'listbox' });
  const box = h(
    'div',
    { class: 'palette', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Busca e comandos' },
    h('div', { class: 'palette-input' }, icon('search'), input, kbd('Esc')),
    results,
    h('footer', { class: 'palette-foot' }, h('span', null, kbd('↑'), kbd('↓'), ' navegar'), h('span', null, kbd('Enter'), ' abrir'), h('span', null, kbd('?'), ' atalhos')),
  );
  const backdrop = h('div', { class: 'palette-backdrop', onmousedown: (e) => e.target === backdrop && close() }, box);
  let hits = [];
  let active = 0;

  function close() {
    paletteOpen = false;
    backdrop.remove();
    window.removeEventListener('hashchange', close);
  }
  function run(hit) {
    close();
    if (hit.run) hit.run();
    else navigate(hit.path);
  }
  function section(title, rows) {
    if (!rows.length) return;
    results.append(h('div', { class: 'palette-section' }, title));
    for (const hit of rows) {
      const index = hits.push(hit) - 1;
      results.append(h('div', { class: 'palette-item', role: 'option', dataset: { index }, onmousemove: () => setActive(index), onmousedown: (e) => (e.preventDefault(), run(hit)) }, h('span', { class: 'palette-icon' }, hit.node), h('span', { class: 'grow' }, h('span', { class: 'name' }, hit.label), hit.sub ? h('small', null, hit.sub) : null), hit.keys ? kbd(hit.keys) : null));
    }
  }
  function setActive(i) {
    active = i;
    for (const el of results.querySelectorAll('.palette-item')) el.classList.toggle('active', Number(el.dataset.index) === active);
  }
  function update() {
    const q = normalizeSearch(input.value);
    hits = [];
    clear(results);
    const cmd = (c) => ({ ...c, node: icon(c.icon ?? 'roadmap') });
    if (!q) {
      section('Ir para', commands.filter((c) => c.path).slice(0, 9).map(cmd));
      section('Ações', commands.filter((c) => c.run).map(cmd));
    } else {
      const starts = (key) => (key.startsWith(q) || key.includes(` ${q}`) ? 1 : 0);
      section('Jogadores', players.filter((x) => x.key.includes(q)).sort((a, b) => starts(b.key) - starts(a.key) || b.p.ovr - a.p.ovr).slice(0, 7).map(({ p }) => ({ path: `/player/${p.id}`, node: playerAvatar(p, { size: 'xs' }), label: p.name, sub: `${p.positions.join('/')} · ${world.teams.get(p.teamId)?.fullName ?? 'Sem time'} · ${p.ovr} OVR` })));
      section('Franquias', teams.filter((x) => x.key.includes(q)).slice(0, 4).map(({ t }) => ({ path: `/team/${t.id}`, node: teamLogo(t, { size: 'xs' }), label: t.fullName, sub: `Conferência ${t.conference === 'East' ? 'Leste' : 'Oeste'} · ${t.division}` })));
      section('Técnicos', coaches.filter((x) => x.key.includes(q)).slice(0, 3).map(({ c }) => ({ path: `/team/${c.teamId}?tab=franquia`, node: icon('roster'), label: c.name, sub: `Técnico · ${world.teams.get(c.teamId)?.fullName ?? 'Sem time'}` })));
      section('Páginas e ações', commands.filter((c) => c.key.includes(q)).slice(0, 6).map(cmd));
      if (!hits.length) results.append(h('div', { class: 'empty-state' }, h('strong', null, 'Nada encontrado'), h('p', null, `Nenhum jogador, franquia, técnico ou página corresponde a "${input.value}".`)));
    }
    setActive(0);
  }
  input.addEventListener('input', update);
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return close();
    if (e.key === 'Enter' && hits[active]) return run(hits[active]);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!hits.length) return;
      setActive((active + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length);
      results.querySelector('.palette-item.active')?.scrollIntoView({ block: 'nearest' });
    }
  });
  window.addEventListener('hashchange', close);
  document.body.append(backdrop);
  update();
  input.focus();
}
