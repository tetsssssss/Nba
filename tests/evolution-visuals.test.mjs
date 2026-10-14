import test from 'node:test';
import assert from 'node:assert/strict';
import { duelRadar, fingerprintRadar, multiLineChart } from '../src/ui/components/visuals.js';

const prior = globalThis.document;
class SvgNode {
  constructor(name) { this.name = name; this.attrs = {}; this.children = []; }
  setAttribute(key, value) { this.attrs[key] = value; }
  append(...nodes) { this.children.push(...nodes); }
}
globalThis.document = { createElementNS: (_, name) => new SvgNode(name) };
const values = [
  { label: 'Ataque', value: 80 },
  { label: 'Criação', value: 60 },
  { label: 'Defesa', value: 75 },
  { label: 'Físico', value: 88 },
  { label: 'Mental', value: 70 },
];

test('E03 SVG tem ARIA e não precisa de biblioteca externa', () => {
  const svg = fingerprintRadar(values);
  assert.equal(svg.name, 'svg');
  assert.equal(svg.attrs.role, 'img');
  assert.match(svg.attrs['aria-label'], /Ataque: 80/);
  assert.equal(svg.children.filter((e) => e.name === 'polygon').length, 5);
});
test('E04 gráfico histórico utiliza pontos e escalas válidas', () => {
  const svg = multiLineChart([{ season: 2025, pts: 22 }, { season: 2026, pts: 27 }], [{ key: 'pts', label: 'Pontos' }]);
  assert.equal(svg.attrs.role, 'img');
  assert.ok(svg.children.some((e) => e.name === 'path'));
  assert.equal(svg.children.filter((e) => e.name === 'circle').length, 2);
});
test('E09 comparação recusa dados sem eixos suficientes', () => {
  assert.equal(duelRadar(values.slice(0, 2), values.slice(0, 2)), null);
  assert.equal(duelRadar(values, values.slice(0, 4)), null);
});
test('E09 comparação tem dois polígonos independentes identificados', () => {
  const svg = duelRadar(values, values.map((v) => ({ ...v, value: v.value - 10 })), { firstName: 'João', secondName: 'Maria' });
  assert.match(svg.attrs['aria-label'], /João contra Maria/);
  assert.equal(svg.children.filter((e) => e.name === 'polygon').length, 6);
  assert.ok(svg.children.some((e) => e.attrs.class === 'evo-radar-area evo-radar-second'));
});
