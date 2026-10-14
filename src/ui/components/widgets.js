// Pequenos blocos visuais compartilhados pelas telas.
import { h, icon } from '../dom.js';
import { isWatched, toggleWatched } from '../../core/watchlist.js';
import { tier } from '../format.js';
import { playerAvatar, teamLogo } from '../../media/photos.js';
import { getWorld } from '../../core/world.js';

export const ovrBadge = (value, { big = false, ghost = false, tip = null } = {}) =>
  h('span', { class: ['ovr', tier(value), big && 'big', ghost && 'ghost'], tip }, value ?? '—');

export function posLabel(positions) {
  const [main, ...rest] = positions ?? [];
  return h('span', { class: 'pos' }, main ?? '—', rest.length ? h('span', { class: 'alt' }, ` / ${rest.join(' / ')}`) : null);
}

export const chip = (text, kind = '', tip = null) => h('span', { class: ['chip', kind], tip }, text);

export const bar = (value, { thick = false } = {}) => h('div', { class: ['bar', thick && 'thick'] }, h('i', { class: tier(value), style: { width: `${Math.max(2, Math.min(100, value))}%` } }));

export const attrRow = (label, value, tip) => h('div', { class: 'attr-row' }, h('span', { tip }, label), h('span', { class: 'val' }, value), bar(value));

export const stat = (k, v, s = null) => h('div', { class: 'stat' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v), s ? h('span', { class: 's' }, s) : null);

/** Foto + nome + linha secundária, com link para o perfil. */
export function playerCell(player, { sub = null, size = 'sm' } = {}) {
  const team = getWorld()?.teams.get(player.teamId);
  return h(
    'a',
    { class: 'person', href: `#/player/${player.id}` },
    playerAvatar(player, { size, color: team?.colors?.[0] }),
    h('span', { class: 'grow' }, h('span', { class: 'name link' }, player.name), sub ? h('small', null, sub) : null),
  );
}

export function teamCell(team, { sub = null, size = 'sm', full = true } = {}) {
  if (!team) return h('span', { class: 'muted' }, 'Sem time');
  return h(
    'a',
    { class: 'person', href: `#/team/${team.id}` },
    teamLogo(team, { size }),
    h('span', { class: 'grow' }, h('span', { class: 'name link' }, full ? team.fullName : team.id), sub ? h('small', null, sub) : null),
  );
}

/** Aviso explícito de funcionalidade ainda não implementada. */
export const futureBox = (title, text, phase) =>
  h('div', { class: 'future-box' }, h('strong', null, title, ' ', h('span', { class: 'chip future' }, `Fase ${phase}`)), text);

export const card = (title, body, { more = null, flush = false } = {}) =>
  h('section', { class: ['card', flush && 'flush'] }, title ? h('div', { class: 'card-head' }, h('h3', null, title), more) : null, body);

export const injuryChip = (injury) => {
  if (!injury) return null;
  const out = injury.status === 'Out';
  return chip(out ? 'Fora' : 'Dúvida', out ? 'bad' : 'warn', `Status: ${injury.status}${injury.since ? ` (desde ${injury.since})` : ''}`);
};

// ------------------------------------------------------------------ blocos do Design System

/** Cabeçalho de tela: onde estou (título), contexto (sub) e a ação primária à direita. */
export const pageHeader = (title, { sub = null, actions = null, crumbs = null } = {}) =>
  h(
    'header',
    { class: 'page-head' },
    h('div', { class: 'grow' }, crumbs ? breadcrumbs(crumbs) : null, h('h1', null, title), sub ? h('p', { class: 'sub' }, sub) : null),
    actions ? h('div', { class: 'row' }, actions) : null,
  );

/** Só para áreas profundas: [['Jogadores', '/players'], ['Nome']] */
export const breadcrumbs = (items) =>
  h('nav', { class: 'crumbs', 'aria-label': 'Caminho' }, items.map(([label, path], i) => [i ? h('span', { class: 'sep' }, '›') : null, path ? h('a', { href: `#${path}` }, label) : h('span', null, label)]));

/** Número esportivo: o valor domina, a sigla é secundária. */
export const bigStat = (value, label, { tip = null, tone = null } = {}) =>
  h('div', { class: ['bigstat', tone], tip }, h('span', { class: 'bigstat-v' }, value ?? '—'), h('span', { class: 'bigstat-k' }, label));

/** Indicador de painel: rótulo, valor grande e uma linha de contexto. */
export const kpi = (label, value, { sub = null, tone = null, href = null, tip = null } = {}) =>
  h(href ? 'a' : 'div', { class: ['kpi', tone, href && 'clickable'], href: href ? `#${href}` : null, tip }, h('span', { class: 'kpi-k' }, label), h('span', { class: 'kpi-v' }, value), sub ? h('span', { class: 'kpi-s' }, sub) : null);

/** Área sem conteúdo: explica por quê e, se fizer sentido, oferece o próximo passo. */
export const emptyState = (title, text = null, action = null) =>
  h('div', { class: 'empty-state' }, h('strong', null, title), text ? h('p', null, text) : null, action);

/** Controle segmentado (filtro rápido de uma escolha). options: [[valor, rótulo, dica?]] */
export function segmented(options, value, onChange, { label = null } = {}) {
  const el = h('div', { class: 'segmented', role: 'group', 'aria-label': label });
  const paint = () => {
    for (const btn of el.children) {
      btn.classList.toggle('active', btn.dataset.value === String(value));
      btn.setAttribute('aria-pressed', btn.dataset.value === String(value));
    }
  };
  for (const [v, text, tip] of options) el.append(h('button', { type: 'button', dataset: { value: v }, tip, onclick: () => ((value = v), paint(), onChange(v)) }, text));
  paint();
  return el;
}

const TIER_LABEL = { 't-elite': 'Elite', 't-great': 'Excelente', 't-good': 'Bom', 't-avg': 'Regular', 't-low': 'Fraco' };
export const tierLabel = (value) => TIER_LABEL[tier(value)];

/** Linha de atributo compacta: nome | número | barra discreta. A faixa também vai em texto (dica), não só na cor. */
export const ratingRow = (label, value, tip = null) =>
  h('div', { class: 'attr-row', tip: tip ? `${tip} — ${tierLabel(value)}` : tierLabel(value) }, h('span', { class: 'attr-name' }, label), h('span', { class: ['val', tier(value)] }, value), bar(value));

/** Status padronizados de disponibilidade. */
export function statusBadge(player) {
  if (player.injury) return injuryChip(player.injury);
  if (player.rosterStatus === 'two-way') return chip('Two-way', 'info', 'Contrato two-way: não conta para o cap e alterna com a G League.');
  if (player.rosterStatus === 'camp') return chip('Camp', 'warn', 'Convidado de training camp: contrato mínimo não garantido.');
  return null;
}

export const kbd = (text) => h('kbd', { class: 'kbd' }, text);

/** Estrela de "observado": discreta até ser marcada. */
export function favStar(player) {
  const btn = h('button', { type: 'button', class: 'fav', onclick: (e) => (e.stopPropagation(), toggleWatched(player.id), paint()) });
  const paint = () => {
    const on = isWatched(player.id);
    btn.classList.toggle('on', on);
    btn.replaceChildren(icon('star', { filled: on }));
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? `Deixar de observar ${player.name}` : `Observar ${player.name}`);
    btn.dataset.tip = on ? 'Observado — clique para remover' : 'Adicionar aos observados';
  };
  paint();
  return btn;
}

/** Cartão vertical de jogador: mesma aparência em qualquer tela. */
export function playerCard(player, { label = null, onClick = null } = {}) {
  const team = getWorld()?.teams.get(player.teamId);
  return h(
    onClick ? 'button' : 'a',
    { class: 'player-card', type: onClick ? 'button' : null, href: onClick ? null : `#/player/${player.id}`, onclick: onClick ? () => onClick(player) : null, style: { '--c1': team?.colors?.[0] } },
    label ? h('span', { class: 'player-card-label' }, label) : null,
    playerAvatar(player, { size: 'lg', color: team?.colors?.[0] }),
    h('span', { class: 'player-card-name' }, h('small', null, player.firstName), player.lastName),
    h('span', { class: 'row wrap', style: { gap: '6px', justifyContent: 'center' } }, ovrBadge(player.ovr), posLabel(player.positions.slice(0, 1)), player.injury ? injuryChip(player.injury) : null),
  );
}

/** Tendência = comportamento: nível em palavras + marcadores, não nota. */
const LEVELS = [[80, 'Muito alto'], [60, 'Alto'], [40, 'Médio'], [20, 'Baixo'], [-1, 'Muito baixo']];
export function tendencyRow(label, value, tip = null) {
  const index = LEVELS.findIndex(([min]) => value >= min);
  const filled = 5 - index;
  return h(
    'div',
    { class: 'tend-row', tip: tip ? `${tip} (${value}/100)` : `${value}/100` },
    h('span', { class: 'attr-name' }, label),
    h('span', { class: ['tend-level', `l${filled}`] }, LEVELS[index][1]),
    h('span', { class: 'pips', 'aria-hidden': 'true' }, Array.from({ length: 5 }, (_, i) => h('i', { class: i < filled && 'on' }))),
  );
}
