// Criação de DOM sem framework. Texto sempre entra como nó de texto (nunca innerHTML),
// então nomes vindos de fontes externas não conseguem injetar marcação.

/**
 * h('div', { class: 'card', onclick: fn, dataset: { id: 1 }, style: { color: 'red' } }, filho, 'texto', [lista])
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'class') el.className = Array.isArray(value) ? value.filter(Boolean).join(' ') : value;
      else if (key === 'style' && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
          if (v == null) continue;
          if (k.startsWith('--')) el.style.setProperty(k, v);
          else el.style[k] = v;
        }
      } else if (key === 'dataset') Object.assign(el.dataset, value);
      else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === 'tip') el.dataset.tip = value;
      else if (key in el && key !== 'list' && key !== 'form') el[key] = value;
      else el.setAttribute(key, value === true ? '' : value);
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function clear(el) {
  el.replaceChildren();
  return el;
}

/**
 * Substitui o conteúdo de `el`. Use sempre isto em vez de `el.append(...)` nativo:
 * o nativo escreve "null" e achata arrays em texto.
 */
export const mount = (el, ...children) => append(clear(el), children);

export const fragment = (...children) => append(document.createDocumentFragment(), children);

/** Ícones de traço (SVG estático, sem dados externos). */
const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',
  roster: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  league: 'M12 2 3 7v6c0 5 4 8 9 9 5-1 9-4 9-9V7z',
  players: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1',
  standings: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  calendar: 'M3 9h18M7 3v4M17 3v4M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2',
  trade: 'M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
  market: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  draft: 'M12 2 15 8.5l7 1-5 5 1.2 7L12 18l-6.2 3.5L7 14.5l-5-5 7-1z',
  expansion: 'M12 5v14M5 12h14M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',
  news: 'M4 5h13v14a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2zM17 9h3v10a2 2 0 0 1-2 2M8 9h5M8 13h5M8 17h5',
  history: 'M12 7v5l3 2M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  finance: 'M12 2v20M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.6 7 7s2.2 3.3 5 4 5 1.6 5 4-2.2 3.5-5 3.5-5-1.1-5-3',
  tactics: 'M4 4l6 6M10 4 4 10M14 16a3 3 0 1 0 6 0 3 3 0 0 0-6 0M5 19c5 0 4-9 12-9M15 7l2 3 3-2',
  save: 'M5 3h11l4 4v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2M7 3v6h8V3M7 21v-7h10v7',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 14H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.8 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1',
  dev: 'm8 6-6 6 6 6M16 6l6 6-6 6M14 3l-4 18',
  roadmap: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0',
  panel: 'M3 5h18v14H3zM9 5v14',
  chevron: 'm6 9 6 6 6-6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  star: 'M12 3l2.7 5.9 6.3.8-4.6 4.4 1.2 6.4L12 17.4 6.4 20.5l1.2-6.4L3 9.7l6.3-.8z',
  close: 'M6 6l12 12M18 6 6 18',
  compare: 'M8 21V3M16 3v18M4 7l4-4 4 4M20 17l-4 4-4-4',
  columns: 'M4 4h16v16H4zM10 4v16M15 4v16',
  forward: 'M5 4l10 8-10 8zM19 5v14',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0',
  medical: 'M12 7v10M7 12h10M4 4h16v16H4z',
  cap: 'M3 20h18M6 20v-8M11 20V5M16 20v-6M20 20V9',
  depth: 'M4 5h7v6H4zM13 5h7v6h-7zM4 13h7v6H4zM13 13h7v6h-7z',
  court: 'M3 5h18v14H3zM12 5v14M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M3 9h3v6H3M21 9h-3v6h3',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  check: 'm5 12 5 5 9-10',
  pause: 'M8 5v14M16 5v14',
  play: 'M7 4v16l13-8z',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  download: 'M12 3v12M7 10l5 5 5-5M4 20h16',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  plus: 'M12 5v14M5 12h14',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  exit: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
};

export function icon(name, { filled = false } = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  svg.setAttribute('fill', filled ? 'currentColor' : 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[name] ?? ICONS.roadmap);
  svg.append(path);
  return svg;
}
