// Blocos visuais compartilhados pelas telas de gestão (Trade Machine, Draft, Finanças, Offseason, Comissário).
import { h, icon, mount } from '../dom.js';
import { money } from '../format.js';
import { modal } from './feedback.js';
import { chip } from './widgets.js';
import { playerAvatar, teamLogo } from '../../media/photos.js';
import { CAP_STATUS_LABEL } from '../../contracts/cap.js';
import { pickLabel } from '../../contracts/picks.js';

export const STATUS_KIND = { 'under-cap': 'good', 'over-cap': '', tax: 'warn', 'first-apron': 'warn', 'second-apron': 'bad' };
export const capChip = (status) => chip(CAP_STATUS_LABEL[status] ?? status, STATUS_KIND[status]);

/** Origem do número: oficial (league.json), estimado (modelo do jogo) ou projetado (extrapolação). */
const KIND = { official: ['Oficial', 'good', 'Valor oficial da NBA registrado em data/static/league.json.'], estimated: ['Estimado', 'warn', 'Estimativa do jogo (modelo ou tabela derivada); precisa de validação.'], projected: ['Projetado', 'info', 'Projeção a partir dos contratos e do desempenho atuais.'] };
export const kindChip = (kind) => chip(KIND[kind][0], KIND[kind][1], KIND[kind][2]);

export const signed = (v, digits = 0) => `${v > 0 ? '+' : ''}${v.toFixed(digits).replace('.', ',')}`;
export const moneyDelta = (v) => (Math.abs(v) < 1 ? '—' : `${v > 0 ? '+' : '−'}${money(Math.abs(v))}`);
export const pct = (v) => `${Math.round(v * 100)}%`;

/** Cabeçalho compacto de franquia. */
export function teamTitle(team, sub = null, { size = 'md' } = {}) {
  return h('div', { class: 'mg-team', style: { '--c1': team.colors[0] } }, teamLogo(team, { size }), h('div', { class: 'grow' }, h('strong', null, team.fullName), sub ? h('small', null, sub) : null));
}

/** Foto + nome em uma linha, sem link (usado em listas arrastáveis). */
export function playerLine(player, { sub = null, size = 'sm' } = {}) {
  return h('span', { class: 'person' }, playerAvatar(player, { size }), h('span', { class: 'grow' }, h('span', { class: 'name' }, player.name), sub ? h('small', null, sub) : null));
}

export function pickText(pick) {
  return pickLabel(pick);
}

// ------------------------------------------------------------------ diálogos
/** Pergunta um texto/valor ao usuário. Resolve null se cancelar. */
export function promptDialog({ title, label, value = '', placeholder = '', confirmLabel = 'Confirmar', type = 'text', hint = null }) {
  return new Promise((resolve) => {
    let result = null;
    modal(
      (close) => {
        const input = h('input', { type, value, placeholder, 'aria-label': label, autofocus: true, onkeydown: (e) => { if (e.key === 'Enter') { result = input.value; close(); } } });
        setTimeout(() => input.focus(), 30);
        return [
          h('h2', null, title),
          h('label', { class: 'field' }, label, input, hint ? h('span', { class: 'hint' }, hint) : null),
          h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: close }, 'Cancelar'), h('button', { class: 'btn primary', onclick: () => { result = input.value; close(); } }, confirmLabel)),
        ];
      },
      { onClose: () => resolve(result) },
    );
  });
}

/** Diálogo informativo com conteúdo arbitrário e botões. actions: [{ label, primary?, danger?, onClick }] */
export function infoDialog(title, body, actions = [], { wide = false } = {}) {
  return modal(
    (close) => [
      h('h2', null, title),
      body,
      h('div', { class: 'actions' }, ...(actions.length ? actions : [{ label: 'Fechar' }]).map((a) => h('button', { class: ['btn', a.primary && 'primary', a.danger && 'danger'], onclick: async () => { const keep = await a.onClick?.(close); if (keep !== false) close(); } }, a.label))),
    ],
    { wide },
  );
}

/** Indicador de equilíbrio: barra de -1 a +1 com o ponteiro. */
export function balanceMeter(index, { leftLabel, rightLabel }) {
  const pos = Math.max(0, Math.min(100, 50 + index * 50));
  return h('div', { class: 'mg-meter', role: 'img', 'aria-label': `Equilíbrio: ${index > 0.12 ? `favorece ${leftLabel}` : index < -0.12 ? `favorece ${rightLabel}` : 'equilibrado'}` },
    h('div', { class: 'mg-meter-track' }, h('i', { class: 'mid' }), h('i', { class: 'pointer', style: { left: `${pos}%` } })),
    h('div', { class: 'mg-meter-labels' }, h('span', null, leftLabel), h('span', null, 'Equilibrada'), h('span', null, rightLabel)));
}

export function loading(text = 'Carregando…') {
  return h('div', { class: 'skeleton-stack', 'aria-busy': 'true', 'aria-label': text }, h('div', { class: 'skeleton', style: { height: '90px' } }), h('div', { class: 'skeleton' }));
}

/** Passo a passo horizontal (offseason). */
export function stepper(steps, { onSelect = null } = {}) {
  return h('ol', { class: 'mg-stepper', 'aria-label': 'Etapas' },
    steps.map((s, i) => h('li', { class: ['mg-step', s.status], 'aria-current': s.status === 'active' ? 'step' : null },
      h(onSelect ? 'button' : 'div', { type: onSelect ? 'button' : null, class: 'mg-step-body', onclick: onSelect ? () => onSelect(s) : null },
        h('span', { class: 'mg-step-dot' }, s.status === 'done' ? icon('check') : String(i + 1)),
        h('span', { class: 'mg-step-label' }, s.label, s.mandatory ? null : h('small', null, 'opcional')))),
    ));
}

export { mount };
