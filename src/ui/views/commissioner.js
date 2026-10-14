// Painel do Comissário (#/commissioner): expansão do God Mode existente. Controlar franquias, forçar
// trocas (aceitação ou Override Total), mover jogadores, editar contratos/atributos/picks, definir escolhas do
// Draft, controlar aposentadorias, alterar condições da liga, simular acontecimentos e ler o registro de intervenções.
import { h, icon, mount } from '../dom.js';
import { date as fmtDate, money } from '../format.js';
import { card, chip, emptyState, pageHeader, segmented } from '../components/widgets.js';
import { confirmDialog, tabView, toast } from '../components/feedback.js';
import { promptDialog } from '../components/mgmt.js';
import { normalizeSearch } from '../search.js';
import { getWorld, saveWorld } from '../../core/world.js';
import { godModeAllowed, overrideActive } from '../../core/godmode-permissions.js';
import { EVENT_TYPES, activateOverride, adminCorrectSalary, adminEditAttributes, adminEditContract, adminEvent, adminForceDraftPick, adminLeagueConditions, adminMovePlayer, adminRetirement, adminSetPickOwner, deactivateOverride, takeControl } from '../../core/godmode.js';
import { ATTRIBUTES } from '../../players/attributes.js';
import { futurePickYears } from '../../contracts/market-state.js';
import { availableProspects, classOf, ensureDraft } from '../../draft/draft-engine.js';
import { nextDraftSeason, pickLabel } from '../../contracts/picks.js';
import { seasonLabel } from '../../contracts/cap.js';
import { capSeason } from '../../contracts/rules-config.js';

export function commissionerView() {
  const world = getWorld();
  if (!godModeAllowed(world.career)) {
    return h('div', { class: 'page' }, pageHeader('Painel do Comissário'), emptyState('God Mode desligado', world.career.godMode ? 'O modo de jogo desta carreira bloqueia o God Mode (Franchise e Coach). Para editar o universo, crie uma carreira Commissioner.' : 'Ative o God Mode em Configurações › Carreira, ou crie uma carreira Commissioner, para usar o painel.', h('a', { class: 'btn', href: '#/settings?tab=carreira' }, 'Abrir configurações')));
  }
  const root = h('div', { class: 'page cm' });
  const teams = [...world.teams.values()].sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR'));
  const teamSelect = (value, onChange, { none = null } = {}) => h('select', { 'aria-label': 'Franquia', onchange: (e) => onChange(e.target.value) }, none ? h('option', { value: '' }, none) : null, teams.map((t) => h('option', { value: t.id, selected: t.id === value }, t.fullName)));
  const act = async (fn, okMessage) => { try { const out = await fn(); if (okMessage) toast(okMessage); await saveWorld(); renderTabs(); return out; } catch (err) { toast(err.message, 'error'); return null; } };

  function playerPicker(onPick) {
    const select = h('select', { 'aria-label': 'Jogador encontrado', style: { minWidth: '280px' } }, h('option', { value: '' }, 'Digite para buscar…'));
    const input = h('input', { type: 'search', placeholder: 'Nome do jogador', 'aria-label': 'Buscar jogador', oninput: () => {
      const q = normalizeSearch(input.value);
      const hits = q.length < 2 ? [] : [...world.players.values()].filter((p) => normalizeSearch(p.name).includes(q)).sort((a, b) => b.ovr - a.ovr).slice(0, 25);
      mount(select, hits.length ? hits.map((p) => h('option', { value: p.id }, `${p.name} — ${p.retired ? 'aposentado' : p.teamId ?? 'livre'} · ${p.positions[0]} · ${p.ovr}`)) : h('option', { value: '' }, q.length < 2 ? 'Digite para buscar…' : 'Nenhum jogador'));
      onPick(hits[0] ?? null);
    } });
    select.addEventListener('change', () => onPick(world.players.get(Number(select.value)) ?? null));
    return h('div', { class: 'row wrap' }, input, select);
  }

  // ------------------------------------------------------------------ geral: franquia e override
  function generalTab() {
    const on = overrideActive(world.career);
    return h('div', { class: 'stack' },
      card('Franquia sob seu controle', h('div', { class: 'row wrap' }, teamSelect(world.career.teamId, (id) => act(() => takeControl(world, id), `Você agora controla ${world.teams.get(id).fullName}.`)), h('span', { class: 'muted small' }, 'Também disponível pelo selo COMMISSIONER MODE na barra superior.'))),
      card(h('span', null, 'Override Total ', chip(on ? 'ATIVO' : 'desligado', on ? 'bad' : '')), h('div', { class: 'stack' },
        h('p', { class: 'muted' }, 'Permite autorizar operações fora das regras da NBA (salary matching, aprons, Stepien, limite de dinheiro, janelas de troca…) neste universo personalizado. Cada regra ignorada é listada e registrada no histórico. "Forçar aceitação" é outra coisa: ignora só a vontade da IA e mantém a legalidade.'),
        on ? h('button', { class: 'btn', type: 'button', onclick: () => act(() => deactivateOverride(world), 'Override Total desativado.') }, 'Desativar Override Total')
          : h('button', { class: 'btn danger', type: 'button', onclick: async () => { const t = await promptDialog({ title: 'Ativar Override Total', label: 'Digite OVERRIDE TOTAL', placeholder: 'OVERRIDE TOTAL', confirmLabel: 'Ativar' }); if (t != null) act(() => activateOverride(world, t.trim()), 'Override Total ativado.'); } }, 'Ativar Override Total'))),
      card('Trocas', h('div', { class: 'row wrap' }, h('a', { class: 'btn', href: '#/market' }, icon('trade'), 'Abrir a Trade Machine (forçar / override)'), h('a', { class: 'btn', href: '#/market?aba=revisao' }, `Revisão de trades da IA (${world.market.review.length})`), h('span', { class: 'muted small' }, world.career.autoApproveAiTrades ? 'Aprovação automática ligada.' : 'Aprovação automática desligada: você revisa cada trade.'))));
  }

  // ------------------------------------------------------------------ jogadores
  function playersTab() {
    let target = null;
    const out = h('div', { class: 'stack' });
    const where = teamSelect(world.career.teamId, () => {}, { none: 'Agente livre' });
    const attr = h('select', { 'aria-label': 'Atributo' }, ATTRIBUTES.map((a) => h('option', { value: a.key }, a.label)));
    const attrVal = h('input', { type: 'number', min: 0, max: 100, value: 80, style: { width: '84px' }, 'aria-label': 'Valor' });
    const pot = h('input', { type: 'number', min: 40, max: 99, placeholder: 'Potencial', style: { width: '100px' }, 'aria-label': 'Potencial' });
    const season = h('select', { 'aria-label': 'Temporada' }, [capSeason(world), capSeason(world) + 1, capSeason(world) + 2].map((s) => h('option', { value: s }, seasonLabel(s))));
    const salary = h('input', { type: 'number', min: 1, step: 10000, placeholder: 'Salário (US$)', style: { width: '150px' }, 'aria-label': 'Salário' });
    const years = h('input', { type: 'number', min: 1, max: 5, value: 2, style: { width: '70px' }, 'aria-label': 'Anos' });
    const info = h('div', { class: 'muted small' }, 'Escolha um jogador.');
    const picker = playerPicker((p) => { target = p; mount(info, p ? `${p.name} · ${p.retired ? 'aposentado' : p.teamId ?? 'livre'} · OVR ${p.ovr} / POT ${p.potential}` : 'Escolha um jogador.'); if (p) attrVal.value = p.attributes[attr.value]; });
    attr.addEventListener('change', () => { if (target) attrVal.value = target.attributes[attr.value]; });
    const need = () => { if (!target) { toast('Escolha um jogador.', 'warn'); return false; } return true; };
    return h('div', { class: 'stack' }, picker, info,
      card('Mover jogador', h('div', { class: 'row wrap' }, where, h('button', { class: 'btn primary', type: 'button', onclick: () => need() && act(() => adminMovePlayer(world, target.id, where.value || null), `${target.name} movido.`) }, 'Mover'), h('span', { class: 'muted small' }, 'Cria um contrato mínimo se o jogador não tiver contrato vigente. Aposentados voltam à ativa.'))),
      card('Editar atributo', h('div', { class: 'row wrap' }, attr, attrVal, pot, h('button', { class: 'btn primary', type: 'button', onclick: () => need() && act(() => adminEditAttributes(world, target.id, { [attr.value]: Number(attrVal.value) }, { potential: pot.value ? Number(pot.value) : null }), 'Atributo alterado; Overall recalculado.') }, 'Aplicar'))),
      card('Corrigir salário / editar contrato', h('div', { class: 'stack' }, h('div', { class: 'row wrap' }, season, salary, h('button', { class: 'btn', type: 'button', onclick: () => need() && act(() => adminCorrectSalary(world, target.id, Number(season.value), Number(salary.value)), 'Salário corrigido.') }, 'Corrigir salário do ano'), years, h('button', { class: 'btn primary', type: 'button', onclick: () => need() && act(() => adminEditContract(world, target.id, { years: Array.from({ length: Number(years.value) }, (_, i) => ({ season: capSeason(world) + i, salary: Number(salary.value) || world.contracts.get(target.id)?.years[0]?.salary || 1e6, option: null })) }), 'Contrato reescrito.') }, 'Reescrever contrato com este salário')), h('p', { class: 'muted small' }, 'Edição fina das opções por ano está disponível pela API `adminEditContract`.'))),
      card('Aposentadoria', h('div', { class: 'row wrap' }, h('button', { class: 'btn', type: 'button', onclick: () => need() && act(() => adminRetirement(world, target.id, 'force'), 'Aposentadoria definida.') }, 'Forçar aposentadoria'), h('button', { class: 'btn', type: 'button', onclick: () => need() && act(() => adminRetirement(world, target.id, 'keep'), 'Jogador mantido.') }, 'Impedir aposentadoria (na janela de decisão)'), h('button', { class: 'btn', type: 'button', onclick: () => need() && act(() => adminRetirement(world, target.id, 'unretire'), 'Aposentadoria revertida.') }, 'Reverter aposentadoria'))));
  }

  // ------------------------------------------------------------------ picks e Draft
  function picksTab() {
    const draft = ensureDraft(world);
    const pickSel = h('select', { 'aria-label': 'Pick' }, [...world.draftPicks.values()].filter((k) => k.status !== 'exercised' && k.season <= nextDraftSeason(world) + 3).sort((a, b) => a.season - b.season || a.round - b.round || a.originalTeamId.localeCompare(b.originalTeamId)).map((k) => h('option', { value: k.id }, `${pickLabel(k)} — dono ${k.ownerTeamId}`)));
    let owner = world.career.teamId;
    const prot = h('select', { 'aria-label': 'Proteção' }, [['', 'Manter proteção atual'], ['none', 'Remover proteção'], ['5:rollover', 'Top 5 · rola'], ['10:rollover', 'Top 10 · rola'], ['5:second-round', 'Top 5 · vira 2ª rodada']].map(([v, l]) => h('option', { value: v }, l)));
    const numberIn = h('input', { type: 'number', min: 1, max: 70, placeholder: 'Escolha nº', style: { width: '100px' }, 'aria-label': 'Número da escolha' });
    const prospectSel = h('select', { 'aria-label': 'Prospecto' }, availableProspects(world).slice(0, 80).map((p) => h('option', { value: p.id }, `${p.name} · ${p.positions[0]} · ${p.school}`)));
    return h('div', { class: 'stack' },
      card('Propriedade de picks', h('div', { class: 'stack' }, h('div', { class: 'row wrap' }, pickSel, teamSelect(owner, (v) => { owner = v; }), prot, h('button', { class: 'btn primary', type: 'button', onclick: () => act(() => { let protection; if (prot.value === 'none') protection = null; else if (prot.value) { const [top, fallback] = prot.value.split(':'); protection = { top: Number(top), fallback, endSeason: world.draftPicks.get(pickSel.value).season + 2 }; } return adminSetPickOwner(world, pickSel.value, owner, { protection }); }, 'Pick atualizada.') }, 'Aplicar')), h('p', { class: 'muted small' }, 'Uma pick sempre tem um único dono; a cadeia de transferências fica no histórico da pick.'))),
      card(`Definir escolhas do Draft ${draft.season}`, h('div', { class: 'stack' }, h('div', { class: 'row wrap' }, numberIn, prospectSel, h('button', { class: 'btn primary', type: 'button', onclick: () => act(() => adminForceDraftPick(world, Number(numberIn.value), prospectSel.value), 'Escolha definida: a diretoria da vez selecionará este prospecto.') }, 'Reservar prospecto para a escolha')), draft.forced && Object.keys(draft.forced).length ? h('div', { class: 'row wrap' }, Object.entries(draft.forced).map(([n, id]) => chip(`#${n} → ${world.prospects.get(id)?.name}`, 'warn'))) : h('span', { class: 'muted small' }, 'Nenhuma escolha reservada.'), h('p', { class: 'muted small' }, 'Como comissário você também pode escolher por qualquer franquia diretamente na Draft Night.'))));
  }

  // ------------------------------------------------------------------ liga e eventos
  function leagueTab() {
    const cap = world.league.cap;
    const fields = { salaryCap: ['Salary cap', cap.salaryCap], luxuryTax: ['Luxury tax', cap.luxuryTax], firstApron: ['1º apron', cap.firstApron], secondApron: ['2º apron', cap.secondApron], tradeCashLimit: ['Limite de dinheiro em trocas', cap.tradeCashLimit] };
    const inputs = Object.fromEntries(Object.entries(fields).map(([k, [label, v]]) => [k, h('input', { type: 'number', value: v, step: 1000, 'aria-label': label })]));
    const horizon = h('input', { type: 'number', min: 0, max: 6, value: futurePickYears(world), style: { width: '80px' }, 'aria-label': 'Anos de picks' });
    return h('div', { class: 'stack' }, card('Condições da liga', h('div', { class: 'stack' }, h('p', { class: 'muted small' }, 'Altera as regras desta carreira. A ordem precisa ser: cap < luxury tax ≤ 1º apron < 2º apron. Os valores oficiais de 2026-27 continuam registrados em data/static/league.json.'),
      Object.entries(fields).map(([k, [label]]) => h('label', { class: 'field' }, label, inputs[k])), h('label', { class: 'field' }, 'Picks futuras negociáveis (anos à frente)', horizon),
      h('button', { class: 'btn primary', type: 'button', onclick: () => act(() => { const patch = {}; for (const [k, [, v]] of Object.entries(fields)) if (Number(inputs[k].value) !== v) patch[k] = Number(inputs[k].value); if (Number(horizon.value) !== futurePickYears(world)) patch.futurePickYearsAhead = Number(horizon.value); if (!Object.keys(patch).length) throw new Error('Nada foi alterado.'); adminLeagueConditions(world, patch); }, 'Condições da liga atualizadas.') }, 'Aplicar alterações'))));
  }
  function eventsTab() {
    let target = null;
    const type = h('select', { 'aria-label': 'Evento' }, Object.entries(EVENT_TYPES).map(([k, l]) => h('option', { value: k }, l)));
    const owner = teamSelect(world.career.teamId, () => {});
    const profile = h('select', { 'aria-label': 'Perfil do proprietário' }, [['gastador', 'Gastador'], ['pragmatico', 'Pragmático'], ['economico', 'Econômico'], ['impaciente', 'Impaciente']].map(([v, l]) => h('option', { value: v }, l)));
    const info = h('span', { class: 'muted small' }, 'Escolha um jogador (exceto para mudança de proprietário).');
    return h('div', { class: 'stack' }, card('Simular acontecimentos alternativos', h('div', { class: 'stack' }, playerPicker((p) => { target = p; mount(info, p ? p.name : 'Escolha um jogador.'); }), info, h('div', { class: 'row wrap' }, type, owner, profile, h('button', { class: 'btn primary', type: 'button', onclick: () => act(() => adminEvent(world, type.value, { playerId: target?.id ?? null, teamId: owner.value, profile: profile.value }), 'Evento aplicado e noticiado.') }, 'Disparar evento')), h('p', { class: 'muted small' }, 'Os eventos geram notícias reais e alteram o estado do universo (lesão, pedido de troca, aposentadoria antecipada, postura do proprietário).'))));
  }

  // ------------------------------------------------------------------ registro
  function logTab() {
    const log = world.market.adminLog;
    if (!log.length) return emptyState('Nenhuma intervenção registrada', 'Toda ação do comissário aparece aqui, com as regras ignoradas quando houver.');
    return h('div', { class: 'table-wrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, ['Data', 'Ação', 'Detalhe', 'Regras ignoradas'].map((t) => h('th', null, t)))), h('tbody', null, log.slice(0, 120).map((e) => h('tr', null, h('td', null, fmtDate(e.date)), h('td', null, chip(e.action, e.action.includes('override') ? 'bad' : e.action.includes('force') ? 'warn' : '')), h('td', { class: 'small' }, e.text ?? ''), h('td', { class: 'small' }, (e.rulesIgnored ?? []).map((r) => `${r.label} (${r.teamId ?? '—'})`).join('; ') || '—'))))));
  }

  const tabs = [
    { id: 'geral', label: 'Geral', render: generalTab }, { id: 'jogadores', label: 'Jogadores e contratos', render: playersTab }, { id: 'picks', label: 'Picks e Draft', render: picksTab },
    { id: 'liga', label: 'Condições da liga', render: leagueTab }, { id: 'eventos', label: 'Acontecimentos', render: eventsTab }, { id: 'registro', label: `Registro (${world.market.adminLog.length})`, render: logTab },
  ];
  const host = h('div', null);
  function renderTabs() { mount(host, tabView(tabs, { active: 'geral' })); }
  mount(root, pageHeader('Painel do Comissário', { sub: `${world.career.mode === 'commissioner' ? 'Modo Commissioner' : 'God Mode'} · ${world.teams.get(world.career.teamId).fullName}`, actions: [chip('Todas as intervenções são registradas', 'warn')] }), host);
  renderTabs();
  return root;
}
