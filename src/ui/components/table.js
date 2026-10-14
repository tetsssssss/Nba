// Tabela ordenável e paginada. Só as linhas da página atual vão para o DOM.
import { h, mount } from '../dom.js';
import { getSetting, setSetting } from '../../core/settings.js';

/**
 * @param columns [{ key, label, tip?, align?: 'num'|'center', sort?: (row) => valor, render: (row, index) => Node|string, width? }]
 * @param opts.rows       linhas
 * @param opts.sortKey    coluna inicial
 * @param opts.sortDir    'asc' | 'desc'
 * @param opts.pageSize   0 = sem paginação
 * @param opts.onRowClick (row) => void
 * @param opts.footer     () => <tr> opcional
 * @param opts.stateKey   se informado, a ordenação é lembrada entre visitas (e a página, durante a sessão)
 * @param opts.rowClass   (row) => classe extra da linha
 * @param opts.pinFirst   número de colunas iniciais fixas na rolagem horizontal
 */
const sessionPages = new Map();

export function dataTable(columns, { rows, sortKey = null, sortDir = 'desc', pageSize = 0, onRowClick = null, footer = null, emptyText = 'Nada para mostrar.', stateKey = null, rowClass = null, pinFirst = 0 }) {
  const saved = stateKey ? getSetting('tableState')[stateKey] : null;
  const state = { sortKey, sortDir, page: (stateKey && sessionPages.get(stateKey)) || 0, rows };
  if (saved && columns.some((c) => c.key === saved.sortKey && c.sort)) Object.assign(state, saved);
  const remember = () => {
    if (!stateKey) return;
    sessionPages.set(stateKey, state.page);
    setSetting('tableState', { ...getSetting('tableState'), [stateKey]: { sortKey: state.sortKey, sortDir: state.sortDir } });
  };
  const root = h('div', null);
  const wrap = h('div', { class: 'table-wrap' });
  const pager = h('div', { class: 'pager' });
  root.append(wrap);

  function sorted() {
    const col = columns.find((c) => c.key === state.sortKey);
    if (!col?.sort) return state.rows;
    const dir = state.sortDir === 'asc' ? 1 : -1;
    return [...state.rows].sort((a, b) => {
      const va = col.sort(a);
      const vb = col.sort(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (typeof va === 'string' ? va.localeCompare(vb, 'pt-BR') : va - vb) * dir;
    });
  }

  function render() {
    const all = sorted();
    const pages = pageSize ? Math.max(1, Math.ceil(all.length / pageSize)) : 1;
    state.page = Math.min(state.page, pages - 1);
    const start = pageSize ? state.page * pageSize : 0;
    const visible = pageSize ? all.slice(start, start + pageSize) : all;

    const head = h(
      'tr',
      null,
      columns.map((c, ci) =>
        h(
          'th',
          {
            class: [c.align, c.sort && 'sortable', state.sortKey === c.key && 'sorted', ci < pinFirst && 'pinned'],
            tip: c.tip,
            scope: 'col',
            'aria-sort': state.sortKey === c.key ? (state.sortDir === 'asc' ? 'ascending' : 'descending') : null,
            style: c.width ? { width: c.width } : null,
            onclick: c.sort
              ? () => {
                  if (state.sortKey === c.key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
                  else {
                    state.sortKey = c.key;
                    state.sortDir = c.defaultDir ?? 'desc';
                  }
                  state.page = 0;
                  remember();
                  render();
                }
              : null,
          },
          c.label,
          state.sortKey === c.key ? h('span', { class: ['sort-arrow', state.sortDir] }) : null,
        ),
      ),
    );
    const body = visible.length
      ? visible.map((row, i) =>
          h(
            'tr',
            { class: [onRowClick && 'clickable', rowClass?.(row)], onclick: onRowClick ? (e) => !e.target.closest('a,button,input,select,label') && onRowClick(row) : null },
            columns.map((c, ci) => h('td', { class: [c.align, ci < pinFirst && 'pinned'] }, c.render(row, start + i))),
          ),
        )
      : [h('tr', null, h('td', { colSpan: columns.length, class: 'empty' }, emptyText))];
    mount(wrap, h('table', { class: 'data' }, h('thead', null, head), h('tbody', null, body), footer ? h('tfoot', null, footer(all)) : null));

    if (pageSize && all.length > pageSize) {
      mount(pager, 
        h('span', null, `${start + 1}–${Math.min(all.length, start + pageSize)} de ${all.length}`),
        h(
          'span',
          { class: 'row' },
          h('button', { class: 'btn small', disabled: state.page === 0, onclick: () => (state.page--, remember(), render()) }, 'Anterior'),
          h('span', null, `Página ${state.page + 1} de ${pages}`),
          h('button', { class: 'btn small', disabled: state.page >= pages - 1, onclick: () => (state.page++, remember(), render()) }, 'Próxima'),
        ),
      );
      if (!pager.isConnected) root.append(pager);
    } else {
      pager.remove();
    }
  }

  render();
  return {
    el: root,
    /** keepPage: mantém a página (ex.: primeira carga com filtros restaurados). */
    setRows(next, { keepPage = false } = {}) {
      state.rows = next;
      if (!keepPage) state.page = 0;
      remember();
      render();
    },
    refresh: render,
    get state() {
      return state;
    },
  };
}
