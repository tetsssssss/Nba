// Central financeira (#/finance): resumo, central de contratos, free agency, negociação visual com o agente,
// projeções e histórico. Reaproveita cap.js (folha, linhas, imposto) e separa números oficiais, estimados e projetados.
import { h, icon, mount } from '../dom.js';
import { money, date as fmtDate } from '../format.js';
import { navigate, parseHash, setQuery } from '../router.js';
import { card, chip, emptyState, kpi, ovrBadge, pageHeader, playerCell, posLabel, segmented, stat } from '../components/widgets.js';
import { confirmDialog, tabView, toast } from '../components/feedback.js';
import { capChip, infoDialog, kindChip, moneyDelta, pct } from '../components/mgmt.js';
import { capBar } from './team.js';
import { getWorld, playerAge, saveWorld } from '../../core/world.js';
import { modeShows } from '../../core/modes.js';
import { godModeAllowed } from '../../core/godmode-permissions.js';
import { CAP_STATUS_LABEL, CONTRACT_TYPE_LABEL, capLines, contractSummary, seasonLabel } from '../../contracts/cap.js';
import { capSeason } from '../../contracts/rules-config.js';
import { financeHistory, financeOverview, projectFinances } from '../../contracts/finance.js';
import { ROUTE_LABEL, agentResponse, capHolds, checkSigning, exceptionsFor, extendContract, freeAgents, marketAsk, minSalaryFor, maxSalaryFor, pendingOptions, reSignPlayer, rightsOf, signFreeAgentOffer, signingRoutes, waivePlayer } from '../../contracts/contracts-engine.js';
import { decideUserOption } from '../../season/offseason.js';
import { rosterOf } from '../../gm/team-context.js';
import { potentialText } from '../components/player-quick.js';

export function financeView() {
  const world = getWorld();
  if (!modeShows(world.career, 'cap')) return h('div', { class: 'page' }, emptyState('Finanças indisponíveis', 'No Coach Mode, contratos, cap e finanças ficam com a diretoria.'));
  const teamId = world.career.teamId;
  const team = world.teams.get(teamId);
  const season = capSeason(world);
  const lines = capLines(world.career.capMode);
  const query = parseHash().query;
  const root = h('div', { class: 'page fin' });
  const state = { negotiate: query.get('jogador') ? Number(query.get('jogador')) : null, salary: null, years: null, option: false, route: 'auto', faFilter: '' };
  let tabsApi = null;

  // ------------------------------------------------------------------ resumo
  function summaryTab() {
    const o = financeOverview(world, teamId);
    const exceptions = lines.aprons ? exceptionsFor(world, teamId) : null;
    const holds = capHolds(world, teamId);
    return h('div', { class: 'stack' },
      h('div', { class: 'grid cols-4' },
        kpi('Folha', money(o.payroll.total), { sub: CAP_STATUS_LABEL[o.payroll.status], tone: o.payroll.status === 'second-apron' ? 'bad' : o.payroll.status === 'under-cap' ? 'good' : 'warn' }),
        kpi(o.payroll.capSpace >= 0 ? 'Espaço no cap' : 'Acima do cap', money(Math.abs(o.payroll.capSpace)), { sub: `cap ${money(o.official.salaryCap)}` }),
        kpi('Luxury tax estimada', money(o.tax), { sub: lines.luxuryTax ? `linha ${money(o.official.luxuryTax)}${o.repeater ? ' · repeater' : ''}` : 'modo de cap sem imposto', tone: o.tax > 0 ? 'bad' : 'good' }),
        kpi('Resultado estimado', money(o.profit), { sub: `${o.profit >= 0 ? 'lucro' : 'prejuízo'} sobre receita de ${money(o.revenue.total)}`, tone: o.profit >= 0 ? 'good' : 'bad' })),
      card(h('span', null, 'Cap, imposto e aprons ', kindChip('official')), h('div', { class: 'stack' }, capBar(o.payroll, world.league.cap, world.career.capMode),
        h('div', { class: 'stats-row' }, stat('Salary cap', money(o.official.salaryCap)), lines.luxuryTax ? stat('Luxury tax', money(o.official.luxuryTax)) : null, lines.aprons ? stat('1º apron', money(o.official.firstApron)) : null, lines.aprons ? stat('2º apron', money(o.official.secondApron)) : null, stat('Folha mínima', money(o.official.minimumTeamSalary), o.belowMinimum ? `faltam ${money(o.minimumPenalty)}` : 'cumprida')),
        world.league.cap.projected ? h('p', { class: 'muted small' }, world.league.cap.projectionNote) : h('p', { class: 'muted small' }, `Números oficiais de ${world.league.cap.season} (fonte: ${world.league.cap.source}).`))),
      h('div', { class: 'grid cols-2' },
        card(h('span', null, 'Receitas ', kindChip('estimated')), h('table', { class: 'data fin-table' }, h('tbody', null, o.revenue.items.map((i) => h('tr', null, h('td', null, i.label), h('td', { class: 'num' }, money(i.amount)))), h('tr', { class: 'group' }, h('td', null, 'Total'), h('td', { class: 'num' }, money(o.revenue.total)))))),
        card(h('span', null, 'Despesas ', kindChip('estimated')), h('table', { class: 'data fin-table' }, h('tbody', null, h('tr', null, h('td', null, 'Folha salarial'), h('td', { class: 'num' }, money(o.payroll.total))), o.payroll.dead > 0 ? h('tr', null, h('td', { class: 'muted' }, '↳ dead money'), h('td', { class: 'num muted' }, money(o.payroll.dead))) : null, h('tr', null, h('td', null, 'Luxury tax'), h('td', { class: 'num' }, money(o.tax))), o.expenses.items.map((i) => h('tr', null, h('td', null, i.label), h('td', { class: 'num' }, money(i.amount)))), h('tr', { class: 'group' }, h('td', null, 'Total'), h('td', { class: 'num' }, money(o.payroll.total + o.tax + o.expenses.total))))))),
      card(h('span', null, 'Proprietário e orçamento ', kindChip('estimated')), h('div', { class: 'stack' },
        h('dl', { class: 'facts' }, h('dt', null, 'Perfil'), h('dd', null, `${o.owner.label}${o.owner.enforced ? '' : ' (finanças desligadas nesta carreira)'}`), h('dt', null, 'Teto de folha aceito'), h('dd', null, `${money(o.owner.ceiling)} (${o.owner.ceilingKey === 'secondApron' ? '2º apron' : o.owner.ceilingKey === 'firstApron' ? '1º apron' : 'linha do imposto'})`), h('dt', null, 'Disponibilidade orçamentária'), h('dd', { class: o.budget.room >= 0 ? 'good' : 'bad' }, o.budget.room >= 0 ? `${money(o.budget.room)} até o teto` : `${money(-o.budget.room)} acima do teto`), h('dt', null, 'Cap holds'), h('dd', null, holds ? money(holds) : lines.aprons ? 'nenhum' : 'não se aplica ao modo de cap'),
          exceptions ? [h('dt', null, 'Exceções disponíveis'), h('dd', null, `MLE ${money(exceptions.nonTaxMle)} · MLE contribuinte ${money(exceptions.taxMle)} · room ${money(exceptions.room)} · bi-annual ${money(exceptions.biAnnual)}`)] : null),
        !o.budget.withinBudget ? h('div', { class: 'note warn' }, 'A folha está acima do que o proprietário aceita. Nas dificuldades Realista e Hardcore, novas contratações que ultrapassem o teto são bloqueadas.') : null)));
  }

  // ------------------------------------------------------------------ central de contratos
  function contractsTab() {
    const roster = rosterOf(world, teamId);
    const seasons = Array.from({ length: 5 }, (_, i) => season + i);
    const offseason = world.offseason && !world.offseason.leagueYearStarted ? world.offseason : null;
    const decisions = offseason ? pendingOptions(world, offseason.season + 1).filter((o) => o.teamId === teamId && o.kind === 'team') : [];
    const expiring = roster.filter((p) => contractSummary(world.contracts.get(p.id), season)?.expiring && p.rosterStatus !== 'camp');
    const rows = [...roster].sort((a, b) => (world.contracts.get(b.id)?.years.find((y) => y.season === season)?.salary ?? 0) - (world.contracts.get(a.id)?.years.find((y) => y.season === season)?.salary ?? 0));
    const rights = rightsOf(world, teamId).map((id) => world.players.get(id));
    const cell = (c, s) => { const y = c?.years.find((x) => x.season === s); return y ? h('span', null, money(y.salary), y.option ? chip(y.option === 'player' ? 'PO' : 'TO', 'info') : null, y.guaranteed === false ? chip('NG', 'warn', 'Não garantido') : null) : h('span', { class: 'faint' }, '—'); };
    return h('div', { class: 'stack' },
      decisions.length ? card('Decisões de opção de time (obrigatórias)', h('div', { class: 'stack' }, decisions.map((d) => { const p = world.players.get(d.playerId); return h('div', { class: 'row wrap' }, playerCell(p, { size: 'xs' }), h('span', { class: 'grow' }, `Team option de ${money(d.salary)} em ${seasonLabel(d.season)}`), h('button', { class: 'btn small primary', onclick: () => { decideUserOption(world, d.playerId, true); toast(`Opção de ${p.name} exercida.`); refresh(); } }, 'Exercer'), h('button', { class: 'btn small', onclick: () => { decideUserOption(world, d.playerId, false); toast(`Opção de ${p.name} recusada: ele vai ao mercado.`); refresh(); } }, 'Recusar')); }))) : null,
      rights.length ? card(h('span', null, 'Direitos de renovação (Bird rights) ', chip(`${rights.length}`)), h('div', { class: 'stack' }, h('p', { class: 'muted small' }, lines.aprons ? 'Cap holds contam na folha até você renovar ou deixar o jogador ir.' : 'Direitos de renovação simplificados neste modo de cap.'), rights.map((p) => { const info = world.offseason.rightsInfo[p.id]; return h('div', { class: 'row wrap' }, playerCell(p, { size: 'xs', sub: `${p.positions[0]} · ${playerAge(p)} anos · ${p.ovr} OVR` }), h('span', { class: 'grow muted small' }, `Último salário ${money(info?.lastSalary)} · cap hold ${money(info?.hold)}`), h('button', { class: 'btn small primary', onclick: () => { state.negotiate = p.id; tabsApi.select('negociacao'); } }, 'Renovar')); }))) : null,
      card('Contratos vigentes', h('div', { class: 'table-wrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, h('th', null, 'Jogador'), h('th', null, 'Tipo'), seasons.map((s) => h('th', { class: 'num' }, seasonLabel(s))), h('th', null, ''))),
        h('tbody', null, rows.map((p) => { const c = world.contracts.get(p.id); const sm = contractSummary(c, season); return h('tr', null, h('td', null, playerCell(p, { size: 'xs', sub: `${p.positions[0]} · ${playerAge(p)} anos · ${p.ovr} OVR` })), h('td', null, CONTRACT_TYPE_LABEL[c?.type] ?? '—', sm?.expiring ? chip('último ano', 'warn') : null), seasons.map((s) => h('td', { class: 'num' }, cell(c, s))),
          h('td', null, h('div', { class: 'row', style: { gap: '4px' } }, h('button', { class: 'btn small', disabled: !sm || sm.yearsLeft > 2, tip: sm && sm.yearsLeft > 2 ? 'Extensão só nos dois últimos anos' : 'Negociar extensão', onclick: () => { state.negotiate = p.id; tabsApi.select('negociacao'); } }, 'Estender'), h('button', { class: 'btn small ghost', onclick: () => waive(p), 'aria-label': `Dispensar ${p.name}` }, 'Dispensar')))); }))))),
      expiring.length ? card('Contratos vencendo', h('div', { class: 'row wrap' }, expiring.map((p) => chip(`${p.name} · ${money(contractSummary(world.contracts.get(p.id), season).salary)}`, 'warn')))) : null,
      team.deadMoney?.length ? card('Dead money', h('table', { class: 'data' }, h('tbody', null, team.deadMoney.map((d) => h('tr', null, h('td', null, d.name, d.stretched ? chip('esticado', 'info') : null, d.retirement ? chip('aposentadoria', 'info') : null), seasons.map((s) => h('td', { class: 'num' }, money(d.years.find((y) => y.season === s)?.amount ?? null)))))))) : null);
  }

  async function waive(p) {
    const c = world.contracts.get(p.id);
    const remaining = (c?.years ?? []).filter((y) => y.season >= season && y.guaranteed !== false);
    const total = remaining.reduce((a, y) => a + y.salary, 0);
    const stretch = remaining.length > 1;
    const ok = await confirmDialog({ title: `Dispensar ${p.name}?`, message: total && c?.type !== 'camp' ? `O restante garantido do contrato (${money(total)}) permanece na folha como dead money.${stretch ? ' Você poderá esticar o valor depois, pela folha.' : ''}` : 'O contrato não é garantido: sem dead money.', confirmLabel: 'Dispensar', danger: true });
    if (!ok) return;
    try { waivePlayer(world, { teamId, playerId: p.id }); toast(`${p.name} foi dispensado.`); await saveWorld(); refresh(); } catch (err) { toast(err.message, 'error'); }
  }

  // ------------------------------------------------------------------ free agency
  function faTab() {
    const pool = freeAgents(world).sort((a, b) => b.ovr - a.ovr);
    const q = state.faFilter.toLowerCase();
    const list = pool.filter((p) => !q || p.name.toLowerCase().includes(q) || p.positions.includes(state.faFilter.toUpperCase())).slice(0, 60);
    const phaseNote = world.calendar.phase === 'offseason' && world.offseason?.leagueYearStarted ? `Free agency aberta: dia ${world.offseason.faDay} de ${world.offseason.faDays}. Os pedidos caem aos poucos conforme o mercado esfria.` : world.calendar.phase === 'offseason' ? 'A free agency abre depois das decisões contratuais.' : 'Agentes livres disponíveis durante a temporada (pedidos reduzidos).';
    const host = h('div', null);
    const draw = () => mount(host, list.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, ['Jogador', 'Pos', 'Idade', 'OVR', 'POT', 'Pedido', 'Anos', 'Rotas', ''].map((t) => h('th', null, t)))),
      h('tbody', null, list.map((p) => { const ask = marketAsk(world, p, { teamId }); const routes = signingRoutes(world, { teamId, playerId: p.id, salary: ask.salary, years: ask.years }).filter((r) => r.ok); return h('tr', null, h('td', null, playerCell(p, { size: 'xs', sub: p.rookie ? 'novato' : `${p.exp ?? 0} ano(s) de NBA` })), h('td', null, posLabel(p.positions)), h('td', { class: 'num' }, playerAge(p)), h('td', null, ovrBadge(p.ovr)), h('td', null, potentialText(p, playerAge(p), godModeAllowed(world.career))), h('td', { class: 'num' }, money(ask.salary)), h('td', { class: 'num' }, ask.years), h('td', { class: 'small' }, routes.length ? routes.slice(0, 2).map((r) => ROUTE_LABEL[r.id].split(' (')[0]).join(', ') : h('span', { class: 'bad' }, 'sem rota')), h('td', null, h('button', { class: 'btn small primary', onclick: () => { state.negotiate = p.id; state.salary = null; state.years = null; tabsApi.select('negociacao'); } }, 'Negociar'))); })))) : emptyState('Nenhum agente livre encontrado'));
    draw();
    return h('div', { class: 'stack' }, h('div', { class: 'note' }, phaseNote), h('div', { class: 'toolbar' }, h('input', { type: 'search', placeholder: 'Buscar por nome ou posição', 'aria-label': 'Buscar agente livre', value: state.faFilter, oninput: (e) => { state.faFilter = e.target.value; tabsApi.select('free-agency'); } }), h('span', { class: 'grow' }), h('span', { class: 'muted small' }, `${pool.length} agentes livres`)), host);
  }

  // ------------------------------------------------------------------ negociação visual
  function negotiationTab() {
    const candidates = [...freeAgents(world).sort((a, b) => b.ovr - a.ovr).slice(0, 120), ...rosterOf(world, teamId).filter((p) => contractSummary(world.contracts.get(p.id), season)?.yearsLeft <= 2), ...rightsOf(world, teamId).map((id) => world.players.get(id))];
    const unique = [...new Map(candidates.map((p) => [p.id, p])).values()];
    const player = state.negotiate ? world.players.get(state.negotiate) : null;
    const host = h('div', { class: 'stack' });
    const select = h('select', { 'aria-label': 'Jogador', onchange: (e) => { state.negotiate = Number(e.target.value) || null; state.salary = null; state.years = null; tabsApi.select('negociacao'); } }, h('option', { value: '' }, 'Escolha um jogador…'), unique.map((p) => h('option', { value: p.id, selected: p.id === state.negotiate }, `${p.name} · ${p.positions[0]} · ${p.ovr} OVR · ${p.teamId === teamId ? 'seu elenco' : p.teamId ? p.teamId : 'livre'}`)));
    if (!player) return h('div', { class: 'stack' }, h('label', { class: 'field' }, 'Jogador', select), emptyState('Escolha um jogador', 'Selecione um agente livre, um jogador com direitos de renovação ou alguém do seu elenco em fim de contrato.'));
    const mine = player.teamId === teamId;
    const ask = marketAsk(world, player, { teamId });
    state.salary ??= ask.salary;
    state.years ??= ask.years;
    const response = h('div', { class: 'fin-agent', 'aria-live': 'polite' });
    const routeSel = h('select', { 'aria-label': 'Rota de contratação', onchange: (e) => { state.route = e.target.value; paint(); } });
    const salaryInput = h('input', { type: 'number', min: ask.minSalary, max: ask.maxSalary, step: 10000, value: state.salary, 'aria-label': 'Salário do primeiro ano', oninput: (e) => { state.salary = Number(e.target.value); paint(); } });
    const range = h('input', { type: 'range', min: ask.minSalary, max: ask.maxSalary, step: 50000, value: state.salary, 'aria-label': 'Ajuste do salário', oninput: (e) => { state.salary = Number(e.target.value); salaryInput.value = state.salary; paint(); } });
    const yearsSel = h('select', { 'aria-label': 'Duração', onchange: (e) => { state.years = Number(e.target.value); paint(); } }, [1, 2, 3, 4, 5].map((n) => h('option', { value: n, selected: n === state.years }, `${n} ano(s)`)));
    const option = h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: state.option, onchange: (e) => { state.option = e.target.checked; paint(); } }), 'Player option no último ano (≥ 3 anos)');
    const send = h('button', { class: 'btn primary', type: 'button', onclick: submit }, mine ? 'Enviar extensão' : 'Enviar oferta');
    function paint() {
      const base = { teamId, playerId: player.id, salary: state.salary, years: state.years, playerOption: state.option && state.years >= 3 };
      const r = agentResponse(world, base);
      if (mine) {
        mount(routeSel, h('option', null, 'Extensão contratual'));
        routeSel.disabled = true;
      } else {
        const routes = signingRoutes(world, base);
        mount(routeSel, h('option', { value: 'auto', selected: state.route === 'auto' }, 'Automática (melhor rota válida)'), routes.map((x) => h('option', { value: x.id, disabled: !x.ok, selected: state.route === x.id }, `${x.label}${x.ok ? '' : ' — indisponível'}`)));
      }
      const check = mine ? null : checkSigning(world, { ...base, route: state.route });
      const reasons = check && !check.ok ? check.blocked : [];
      mount(response, h('div', { class: ['fin-agent-card', r.accepted ? 'ok' : 'no'] }, h('strong', null, r.accepted ? 'O agente aceitaria esta oferta' : 'O agente quer mais'), h('p', null, r.message),
        r.counter ? h('div', { class: 'row wrap small' }, h('span', null, `Contraproposta: ${money(r.counter.salary)} por ${r.counter.years} ano(s).`), h('button', { class: 'btn small', type: 'button', onclick: () => { state.salary = r.counter.salary; state.years = r.counter.years; salaryInput.value = state.salary; range.value = state.salary; yearsSel.value = state.years; paint(); } }, 'Usar a contraproposta')) : null,
        h('div', { class: 'row wrap small' }, r.factors.map((f) => chip(`${f.label} ${f.value >= 0 ? '+' : ''}${Math.round(f.value * 100)}%`, f.value > 0 ? 'good' : f.value < 0 ? 'bad' : ''))),
        reasons.length ? h('ul', { class: 'tm-reasons bad' }, reasons.map((t) => h('li', null, t))) : null,
        check?.warnings?.length ? h('ul', { class: 'tm-reasons warn' }, check.warnings.map((t) => h('li', null, t))) : null));
      send.disabled = Boolean(check && !check.ok);
    }
    async function submit() {
      try {
        const args = { teamId, playerId: player.id, salary: state.salary, years: state.years, playerOption: state.option && state.years >= 3 };
        if (mine) extendContract(world, { ...args, by: 'user' });
        else if (rightsOf(world, teamId).includes(player.id) && state.route === 'auto') reSignPlayer(world, args);
        else signFreeAgentOffer(world, { ...args, route: state.route });
        toast(mine ? `Extensão de ${player.name} assinada.` : `${player.name} assinou com ${team.name}.`);
        await saveWorld();
        state.negotiate = null; state.salary = null; state.years = null; state.route = 'auto';
        refresh();
      } catch (err) { toast(err.message, 'error'); paint(); }
    }
    mount(host,
      h('label', { class: 'field' }, 'Jogador', select),
      h('div', { class: 'fin-player' }, playerCell(player, { size: 'lg', sub: `${player.positions.join('/')} · ${playerAge(player)} anos · ${player.ovr} OVR` }), h('div', { class: 'stats-row' }, stat('Pedido do agente', money(ask.salary), `${ask.years} ano(s)`), stat('Mínimo da liga', money(ask.minSalary)), stat('Máximo', money(ask.maxSalary)), stat('Valor de mercado', money(ask.marketValue)))),
      h('div', { class: 'grid cols-2' }, h('div', { class: 'stack' }, h('label', { class: 'field' }, 'Salário no primeiro ano (US$)', salaryInput), range, h('div', { class: 'row wrap' }, h('label', { class: 'field' }, 'Duração', yearsSel), h('label', { class: 'field' }, 'Rota', routeSel)), option, h('div', { class: 'row' }, send, h('button', { class: 'btn', type: 'button', onclick: () => { state.salary = ask.salary; state.years = ask.years; salaryInput.value = state.salary; range.value = state.salary; yearsSel.value = state.years; paint(); } }, 'Usar a referência de mercado'))), response));
    paint();
    return host;
  }

  // ------------------------------------------------------------------ projeções e histórico
  function projectionTab() {
    const proj = projectFinances(world, teamId, 4);
    const max = Math.max(...proj.map((p) => Math.max(p.payroll, world.league.cap.secondApron)));
    return h('div', { class: 'stack' }, h('div', { class: 'note' }, 'Projeção a partir dos contratos vigentes, sem renovações nem novas contratações: por isso a folha cai com o tempo. Receitas crescem ~7% ao ano. ', kindChip('projected')),
      h('div', { class: 'fin-bars' }, proj.map((p) => h('div', { class: 'fin-bar' }, h('div', { class: 'fin-bar-col' }, h('i', { style: { height: `${(p.payroll / max) * 100}%` }, tip: `Folha ${money(p.payroll)}` }), lines.luxuryTax ? h('b', { style: { bottom: `${(world.league.cap.luxuryTax / max) * 100}%` }, tip: 'Linha da luxury tax' }) : null), h('strong', null, seasonLabel(p.season)), h('small', null, money(p.payroll))))),
      h('table', { class: 'data' }, h('thead', null, h('tr', null, ['Temporada', 'Folha comprometida', 'Contratos', 'Situação', 'Imposto', 'Receita', 'Resultado'].map((t) => h('th', null, t)))), h('tbody', null, proj.map((p) => h('tr', null, h('td', null, seasonLabel(p.season)), h('td', { class: 'num' }, money(p.payroll)), h('td', { class: 'num' }, p.committed), h('td', null, capChip(p.status)), h('td', { class: 'num' }, money(p.tax)), h('td', { class: 'num' }, money(p.revenue)), h('td', { class: ['num', p.profit >= 0 ? 'good' : 'bad'] }, money(p.profit)))))));
  }
  function historyTab() {
    const hist = financeHistory(world, teamId);
    if (!hist.length) return emptyState('Sem temporadas fechadas', 'As contas são fechadas ao fim de cada temporada (primeira etapa da offseason).');
    return h('table', { class: 'data' }, h('thead', null, h('tr', null, ['Temporada', 'Campanha', 'Receita', 'Folha', 'Imposto', 'Despesas', 'Resultado'].map((t) => h('th', null, t)))), h('tbody', null, hist.map((f) => h('tr', null, h('td', null, seasonLabel(f.season)), h('td', null, `${f.wins}-${f.losses}`), h('td', { class: 'num' }, money(f.revenue)), h('td', { class: 'num' }, money(f.payroll)), h('td', { class: 'num' }, money(f.tax)), h('td', { class: 'num' }, money(f.expenses)), h('td', { class: ['num', f.profit >= 0 ? 'good' : 'bad'] }, money(f.profit))))));
  }

  const tabDefs = [
    { id: 'resumo', label: 'Resumo', render: summaryTab },
    { id: 'contratos', label: 'Contratos', render: contractsTab },
    { id: 'free-agency', label: 'Free agency', render: faTab },
    { id: 'negociacao', label: 'Negociação', render: negotiationTab },
    { id: 'projecoes', label: 'Projeções', render: projectionTab },
    { id: 'historico', label: 'Histórico', render: historyTab },
  ];
  const tabsHost = h('div', null);
  let active = query.get('tab') ?? (state.negotiate ? 'negociacao' : 'resumo');
  function renderTabs() {
    tabsApi = tabView(tabDefs, { active, onChange: (id) => { active = id; setQuery({ tab: id === 'resumo' ? null : id, jogador: null }); } });
    tabsApi.select = (id) => { active = id; setQuery({ tab: id === 'resumo' ? null : id, jogador: null }); renderTabs(); };
    mount(tabsHost, tabsApi);
  }
  function refresh() { renderTabs(); }
  mount(root, pageHeader('Finanças e contratos', { sub: `${team.fullName} · temporada ${seasonLabel(season)} · modo de cap ${world.league.capModes.find((m) => m.id === world.career.capMode)?.label}`, actions: [h('a', { class: 'btn', href: `#/team/${teamId}?tab=folha` }, icon('cap'), 'Folha salarial'), h('a', { class: 'btn', href: '#/market' }, icon('trade'), 'Trade Machine')] }), tabsHost);
  renderTabs();
  return root;
}
