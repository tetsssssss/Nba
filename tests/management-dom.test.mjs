// Fumaça das telas de gestão (Trade Machine, Draft, Finanças, Offseason, Comissário) com DOM falso.
// Cada tela é montada contra uma carreira real (IndexedDB em memória) e os botões são acionados pelos
// mesmos callbacks que o navegador usaria.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newCareer, closeAll } from './helpers/career.js';

class FakeNode {
  constructor(tag = '#text', text = '') {
    this.tagName = tag;
    this._text = text;
    this.value = '';
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.attrs = {};
    this.className = '';
    this.style = { setProperty(k, v) { this[k] = v; } };
    const classes = new Set();
    this.classList = { add: (...c) => c.forEach((x) => classes.add(x)), remove: (...c) => c.forEach((x) => classes.delete(x)), toggle: (c) => (classes.has(c) ? classes.delete(c) : classes.add(c)), contains: (c) => classes.has(c) };
    this.hidden = false;
  }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.children.push(node); return node; }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  remove() {}
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(name, fn) { (this.listeners[name] ??= []).push(fn); }
  removeEventListener() {}
  focus() {}
  scrollIntoView() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  get textContent() { return this._text + this.children.map((n) => n.textContent ?? '').join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
}
globalThis.Node = FakeNode;
const body = new FakeNode('body');
globalThis.document = {
  body,
  createElement: (t) => new FakeNode(t),
  createElementNS: (_ns, t) => new FakeNode(t),
  createTextNode: (t) => new FakeNode('#text', String(t)),
  createDocumentFragment: () => new FakeNode('#fragment'),
  getElementById: () => null,
  addEventListener() {},
  removeEventListener() {},
};
globalThis.window = { addEventListener() {}, removeEventListener() {}, confirm: () => true, matchMedia: () => ({ matches: false, addEventListener() {} }) };
globalThis.window.dispatchEvent = () => true;
globalThis.history = { replaceState() {}, pushState() {} };
globalThis.location = { hash: '' };

const walk = (root, pick, out = []) => {
  if (pick(root)) out.push(root);
  for (const c of root.children ?? []) walk(c, pick, out);
  return out;
};
const buttons = (root) => walk(root, (n) => n.tagName === 'button');
const button = (root, label) => buttons(root).find((b) => b.textContent.trim() === label);
const click = (node) => { for (const fn of node.listeners.click ?? []) fn({ preventDefault() {}, stopPropagation() {} }); };

const { tradeMachineView } = await import('../src/ui/views/trade-machine.js');
const { draftView } = await import('../src/ui/views/draft.js');
const { financeView } = await import('../src/ui/views/finance.js');
const { offseasonView } = await import('../src/ui/views/offseason.js');
const { commissionerView } = await import('../src/ui/views/commissioner.js');

test('Trade Machine monta os dois painéis e verifica uma troca montada pelos botões de adicionar', async () => {
  await newCareer({ teamId: 'BOS' });
  const page = tradeMachineView();
  assert.match(page.textContent, /Trade Machine/);
  const panels = walk(page, (n) => n.tagName === 'section' && n.dataset.team);
  assert.equal(panels.length, 2, 'dois painéis de franquia');
  const adders = (panel) => walk(panel, (n) => n.tagName === 'button' && /^Adicionar /.test(n.attrs['aria-label'] ?? ''));
  assert.ok(adders(panels[0]).length >= 10 && adders(panels[1]).length >= 10, 'um botão de adicionar por jogador');
  click(adders(panels[0])[0]);
  click(adders(panels[1])[0]);
  const verify = buttons(page).find((b) => /VERIFICAR TROCA/i.test(b.textContent));
  assert.ok(verify, 'botão VERIFICAR TROCA');
  click(verify);
  await new Promise((r) => setTimeout(r, 20));
  for (const label of ['PROPOR TROCA', 'LIMPAR TROCA']) assert.ok(buttons(page).some((b) => b.textContent.toUpperCase().includes(label)), `botão ${label}`);
  assert.match(page.textContent, /Legalidade|legal/i);
  await closeAll();
});

test('Draft Night expõe as seis abas e o estado do Draft', async () => {
  await newCareer({ teamId: 'BOS' });
  const page = draftView();
  const text = page.textContent;
  for (const tab of ['Draft ao vivo', 'Prospectos', 'Trade de picks', 'Big board', 'Análise ao vivo', 'Histórico']) assert.match(text, new RegExp(tab), `aba ${tab}`);
  await closeAll();
});

test('Finanças mostra a folha oficial e a central de contratos', async () => {
  await newCareer({ teamId: 'BOS' });
  const page = financeView();
  assert.match(page.textContent, /Finanças|Folha|Cap/);
  const tab = buttons(page).find((b) => b.textContent.trim() === 'Contratos');
  assert.ok(tab, 'aba Contratos');
  click(tab);
  assert.match(page.textContent, /Contratos|vencendo|Bird|opção/i);
  await closeAll();
});

test('Offseason lista as 11 fases e continua montando sem erro', async () => {
  const world = await newCareer({ teamId: 'BOS' });
  const { OFFSEASON_STEPS, ensureOffseason } = await import('../src/season/offseason.js');
  assert.equal(OFFSEASON_STEPS.length, 11);
  world.calendar.phase = 'offseason';
  ensureOffseason(world);
  const page = offseasonView();
  assert.ok(page.textContent.length > 100);
  await closeAll();
});

test('Painel do Comissário abre com o God Mode ativo e bloqueia sem ele', async () => {
  await newCareer({ teamId: 'BOS', godMode: true });
  const open = commissionerView();
  assert.ok(open.textContent.length > 50);
  await closeAll();
  await newCareer({ teamId: 'BOS', godMode: false });
  const closed = commissionerView();
  assert.match(closed.textContent, /God Mode|Comiss/i);
  await closeAll();
});
