/** SVGs de dados acessíveis, sem innerHTML e sem dependências externas. */
import { bounded } from '../experience-insights.js';
const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}, text) => {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) if (value != null) node.setAttribute(key, String(value));
  if (text != null) node.textContent = String(text);
  return node;
};
const coord = (radius, angle, cx, cy) => [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];

export function fingerprintRadar(groups = [], { title = 'Perfil de atributos do atleta' } = {}) {
  const source = groups.filter((g) => g.value != null);
  if (source.length < 3) return null;
  const cx = 180, cy = 155, radius = 108, n = source.length;
  const svg = el('svg', { viewBox: '0 0 360 320', role: 'img', 'aria-label': `${title}. ${source.map((g) => `${g.label}: ${Math.round(g.value)}`).join('; ')}`, class: 'evo-radar' });
  const angle = (i) => -Math.PI / 2 + i * Math.PI * 2 / n;
  const points = (amounts) => amounts.map((v, i) => coord(radius * v, angle(i), cx, cy).map((x) => x.toFixed(2)).join(',')).join(' ');
  for (let level = 1; level <= 4; level++) svg.append(el('polygon', { points: points(source.map(() => level / 4)), class: 'evo-radar-ring' }));
  for (let i = 0; i < n; i++) {
    const [x, y] = coord(radius, angle(i), cx, cy);
    svg.append(el('line', { x1: cx, y1: cy, x2: x, y2: y, class: 'evo-radar-axis' }));
  }
  svg.append(el('polygon', { points: points(source.map((g) => bounded(g.value) / 100)), class: 'evo-radar-area' }));
  source.forEach((g, i) => {
    const [x, y] = coord(radius * 1.19, angle(i), cx, cy);
    svg.append(el('text', { x, y, 'text-anchor': Math.abs(x - cx) < 8 ? 'middle' : x > cx ? 'start' : 'end', class: 'evo-radar-label' }, g.label.length > 14 ? `${g.label.slice(0, 13)}…` : g.label));
  });
  return svg;
}

export function multiLineChart(rows = [], fields = [{ key: 'pts', label: 'PTS', color: 'var(--evo-chart-primary)' }], { title = 'Evolução por temporada', height = 235 } = {}) {
  if (!rows.length) return null;
  const width = 620, left = 45, right = 15, top = 20, bottom = 42;
  const high = Math.max(5, ...rows.flatMap((r) => fields.map((f) => Number(r[f.key]) || 0))) * 1.12;
  const px = (i) => left + (rows.length === 1 ? (width - left - right) / 2 : i * (width - left - right) / (rows.length - 1));
  const py = (v) => height - bottom - bounded(Number(v) / high, 0, 1) * (height - top - bottom);
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', class: 'evo-line-chart', 'aria-label': `${title}. ${rows.map((r) => `${r.season}: ${fields.map((f) => `${f.label} ${(Number(r[f.key]) || 0).toFixed(1)}`).join(', ')}`).join('; ')}` });
  for (let i = 0; i <= 4; i++) {
    const v = high * i / 4, y = py(v);
    svg.append(el('line', { x1: left, x2: width - right, y1: y, y2: y, class: 'evo-grid-line' }));
    svg.append(el('text', { x: left - 9, y: y + 4, 'text-anchor': 'end', class: 'evo-axis-label' }, v.toFixed(0)));
  }
  fields.forEach((field, j) => {
    const path = rows.map((r, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)} ${py(r[field.key]).toFixed(1)}`).join(' ');
    svg.append(el('path', { d: path, fill: 'none', stroke: field.color ?? 'var(--evo-chart-primary)', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: `evo-line evo-series-${j}` }));
    rows.forEach((r, i) => svg.append(el('circle', { cx: px(i), cy: py(r[field.key]), r: 4, fill: field.color ?? 'var(--evo-chart-primary)' })));
  });
  rows.forEach((r, i) => svg.append(el('text', { x: px(i), y: height - 14, 'text-anchor': 'middle', class: 'evo-axis-label' }, String(r.season).slice(-2))));
  return svg;
}

/** Comparação visual de dois atletas. Cada polígono conserva o mesmo eixo e escala. */
export function duelRadar(a, b, { firstName = 'Jogador A', secondName = 'Jogador B' } = {}) {
  const left = (a ?? []).filter((g) => g.value != null);
  const right = (b ?? []).filter((g) => g.value != null);
  if (left.length < 3 || left.length !== right.length) return null;
  const cx = 180, cy = 160, radius = 110, n = left.length;
  const svg = el('svg', { viewBox: '0 0 360 330', role: 'img', class: 'evo-radar evo-duel-radar',
    'aria-label': `Comparativo ${firstName} contra ${secondName}. ${left.map((g, i) => `${g.label}: ${Math.round(g.value)} contra ${Math.round(right[i].value)}`).join('; ')}` });
  const point = (val, i) => coord(radius * val, -Math.PI / 2 + i * Math.PI * 2 / n, cx, cy);
  const points = (values) => values.map((v, i) => point(v, i).map((p) => p.toFixed(2)).join(',')).join(' ');
  for (let level = 1; level <= 4; level++) svg.append(el('polygon', { points: points(left.map(() => level / 4)), class: 'evo-radar-ring' }));
  for (let i = 0; i < n; i++) {
    const [x, y] = point(1, i);
    svg.append(el('line', { x1: cx, y1: cy, x2: x, y2: y, class: 'evo-radar-axis' }));
    const [lx, ly] = point(1.19, i);
    svg.append(el('text', { x: lx, y: ly, 'text-anchor': Math.abs(lx - cx) < 8 ? 'middle' : lx > cx ? 'start' : 'end', class: 'evo-radar-label' }, left[i].label));
  }
  svg.append(el('polygon', { points: points(left.map((g) => bounded(g.value) / 100)), class: 'evo-radar-area evo-radar-first' }));
  svg.append(el('polygon', { points: points(right.map((g) => bounded(g.value) / 100)), class: 'evo-radar-area evo-radar-second' }));
  return svg;
}
