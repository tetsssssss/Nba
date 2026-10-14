// Trade Machine 3.0 (#/market): mesa de negociação com dois painéis de franquia, drag-and-drop no desktop,
// seleção por toque/teclado (botões adicionar/remover), avaliação ao vivo (legalidade · equilíbrio · aceitação),
// propostas, contrapropostas, rascunhos, propostas travadas, histórico, ofertas da IA e ferramentas do comissário.
import { h, icon, mount } from '../dom.js';
import { money, date as fmtDate } from '../format.js';
import { parseHash, setQuery } from '../router.js';
import { card, chip, emptyState, injuryChip, ovrBadge, pageHeader, posLabel, segmented } from '../components/widgets.js';
import { confirmDialog, tabView, toast } from '../components/feedback.js';
import { openPlayerQuick, potentialText } from '../components/player-quick.js';
import { balanceMeter, capChip, infoDialog, kindChip, moneyDelta, pct, promptDialog, signed, teamTitle } from '../components/mgmt.js';
import { capBar } from './team.js';
import { playerAvatar, teamLogo } from '../../media/photos.js';
import { getWorld, playerAge, saveWorld } from '../../core/world.js';
import { modeShows } from '../../core/modes.js';
import { godModeAllowed, overrideActive } from '../../core/godmode-permissions.js';
import { adminTrade } from '../../core/godmode.js';
import { assetKey, RULE_LABEL } from '../../contracts/trade-rules.js';
import { acceptOffer, canNegotiateFor, cashAsset, checkTrade, declineOffer, deleteDraft, describeAsset, lockProposal, pickAsset, playerAsset, saveDraft, swapAsset, unlockProposal } from '../../contracts/trade-engine.js';
import { proposeToAi, approveReview, rejectReview } from '../../gm/ai-gm.js';
import { contractSummary, seasonLabel } from '../../contracts/cap.js';
import { capSeason, tradeDeadline } from '../../contracts/rules-config.js';
import { futurePickYears } from '../../contracts/market-state.js';
import { nextDraftSeason, pickLabel, picksOwnedBy, protectionLabel } from '../../contracts/picks.js';
import { pickValue, playerValue } from '../../contracts/valuation.js';
import { ARCHETYPES } from '../../gm/personality.js';
import { teamNeeds, rosterOf } from '../../gm/team-context.js';
import { payrollOf } from '../../core/world.js';

const MIME = 'application/x-nuv-asset';
const PROTECTIONS = [['', 'Sem proteção'], ['3:rollover', 'Top 3 · rola'], ['5:rollover', 'Top 5 · rola'], ['5:second-round', 'Top 5 · vira 2ª rodada'], ['10:rollover', 'Top 10 · rola'], ['10:void', 'Top 10 · cancela']];
const HISTORY_FILTERS = [['', 'Tudo'], ['executed', 'Concluídas'], ['rejected', 'Recusadas'], ['countered', 'Contrapropostas'], ['blocked', 'Bloqueadas'], ['expired', 'Expiradas']];
const HISTORY_LABEL = { executed: 'Concluída', rejected: 'Recusada', countered: 'Contraproposta', blocked: 'Bloqueada', expired: 'Expirada', declined: 'Recusada por você', 'review-rejected': 'Vetada' };
const HISTORY_KIND = { executed: 'good', rejected: 'bad', countered: 'warn', blocked: 'bad', expired: '', declined: '', 'review-rejected': 'bad' };

export function tradeMachineView() {
  const world = getWorld();
  if (!modeShows(world.career, 'market')) return h('div', { class: 'page' }, emptyState('Mercado indisponível', 'Seu cargo ou modo de jogo não conduz negociações — a diretoria cuida disso.'));

  const god = godModeAllowed(world.career);
  const query = parseHash().query;
  const userId = world.career.teamId;
  const teamsSorted = [...world.teams.values()].sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR'));
  const requestedLeft = world.teams.has(query.get('team')) && (god || query.get('team') === userId) ? query.get('team') : userId;
  const requestedRight = world.teams.has(query.get('with')) && query.get('with') !== requestedLeft ? query.get('with') : teamsSorted.find((t) => t.id !== requestedLeft && !(t.expansion && !world.career.expansionDraft))?.id ?? teamsSorted.find((t) => t.id !== requestedLeft).id;

  const state = {
    teams: [requestedLeft, requestedRight], left: requestedLeft, right: requestedRight,
    assets: [], counter: null, check: null, showReport: false, tabs: { left: 'players', right: 'players' }, mobile: 'table', highlight: new Set(), forceMode: 'none',
  };
  if (query.get('offer') && world.draftPicks.has(query.get('offer'))) {
    const pick = world.draftPicks.get(query.get('offer'));
    if (pick.ownerTeamId === state.left) state.assets.push(pickAsset(pick.id, state.left, state.right));
  }

  const root = h('div', { class: 'page tm' });
  const dragging = { asset: null };

  // ------------------------------------------------------------------ operações sobre a mesa
  const proposal = () => ({ assets: state.assets });
  const inTrade = (kind, id) => state.assets.some((a) => (kind === 'player' ? a.kind === 'player' && a.playerId === id : a.kind === 'pick' && a.pickId === id));
  const otherTeam = (from) => (state.teams.length === 2 ? state.teams.find((t) => t !== from) : from === state.left ? state.right : state.left);
  function addAsset(asset) {
    if (asset.kind === 'player' && inTrade('player', asset.playerId)) return;
    if (asset.kind === 'pick' && inTrade('pick', asset.pickId)) return;
    if (asset.from === asset.to) return;
    state.assets.push(asset);
    state.counter = state.counter && !state.highlight.size ? state.counter : state.counter;
    refresh();
  }
  const removeAsset = (index) => { state.assets.splice(index, 1); state.highlight.clear(); refresh(); };
  function clearAll() { state.assets = []; state.counter = null; state.showReport = false; state.highlight.clear(); refresh(); }
  function addTeam(id) {
    if (!id || state.teams.includes(id) || state.teams.length >= 4) return;
    state.teams.push(id);
    state.right = id;
    refresh();
  }
  function removeTeam(id) {
    if (state.teams.length <= 2 || id === state.left) return;
    state.teams = state.teams.filter((t) => t !== id);
    state.assets = state.assets.filter((a) => a.from !== id && a.to !== id);
    if (state.right === id) state.right = state.teams.find((t) => t !== state.left);
    refresh();
  }
  function setSides(left, right) {
    state.left = left;
    state.right = right;
    state.teams = [...new Set([left, right, ...state.teams.filter((t) => t !== left && t !== right && state.teams.length > 2)])].slice(0, 4);
    state.assets = state.assets.filter((a) => state.teams.includes(a.from) && state.teams.includes(a.to));
    refresh();
  }

  const evaluate = () => {
    if (!state.assets.length) return null;
    try { return checkTrade(world, proposal(), { override: state.forceMode === 'override' ? 'total' : null }); } catch (err) { console.error(err); return { error: err.message }; }
  };

  // ------------------------------------------------------------------ drag and drop
  const readDrag = (e) => { try { return JSON.parse(e.dataTransfer.getData(MIME)); } catch { return dragging.asset; } };
  function dropTarget(el, { accepts, onDrop }) {
    el.addEventListener('dragover', (e) => { if (dragging.asset && accepts(dragging.asset)) { e.preventDefault(); el.classList.add('over'); } });
    el.addEventListener('dragleave', () => el.classList.remove('over'));
    el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('over'); const a = readDrag(e); if (a && accepts(a)) onDrop(a); });
  }
  const dragProps = (asset) => ({
    draggable: true,
    ondragstart: (e) => { dragging.asset = asset; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData(MIME, JSON.stringify(asset)); e.currentTarget.classList.add('dragging'); },
    ondragend: (e) => { dragging.asset = null; e.currentTarget.classList.remove('dragging'); },
  });
  const toAsset = (d, to) => (d.kind === 'player' ? playerAsset(d.id, d.from, to) : pickAsset(d.id, d.from, to));

  // ------------------------------------------------------------------ painéis das franquias
  function panel(side) {
    const teamId = side === 'left' ? state.left : state.right;
    const team = world.teams.get(teamId);
    const opposite = side === 'left' ? state.right : state.left;
    const payroll = payrollOf(teamId, capSeason(world));
    const needs = teamNeeds(world, teamId);
    const profile = ARCHETYPES[team.gm?.archetype];
    const roster = rosterOf(world, teamId);
    const picks = picksOwnedBy(world, teamId);
    const draftSeason = nextDraftSeason(world);
    const horizon = futurePickYears(world);
    const tab = state.tabs[side];

    const rows = tab === 'players'
      ? roster.map((p) => playerRow(p, teamId, opposite))
      : picks.map((k) => pickRow(k, teamId, opposite, draftSeason, horizon));

    const el = h('section', { class: ['tm-panel', `tm-${side}`, state.mobile === side && 'mobile-active'], 'aria-label': `Painel ${team.fullName}`, dataset: { team: teamId } },
      h('header', { class: 'tm-panel-head' },
        teamTitle(team, `${team.record ? `${team.record.wins}-${team.record.losses}` : ''} · ${profile?.label ?? 'Diretoria'}${teamId === userId ? ' · sua franquia' : ''}`, { size: 'md' }),
        h('div', { class: 'row wrap tm-statuses' }, capChip(payroll.status), chip(`${payroll.standardCount}+${payroll.twoWayCount} jogadores`), team.expansion && !world.career.expansionDraft ? chip('Aguardando Expansion Draft', 'info') : null)),
      h('div', { class: 'tm-panel-meta' },
        capBar(payroll, world.league.cap, world.career.capMode),
        h('div', { class: 'row wrap small' }, h('span', { class: 'muted' }, `Folha ${money(payroll.total)}`), payroll.capSpace >= 0 ? h('span', { class: 'good' }, `${money(payroll.capSpace)} de espaço`) : h('span', { class: 'warn' }, `${money(-payroll.capSpace)} acima do cap`)),
        h('div', { class: 'row wrap small' }, h('span', { class: 'muted' }, 'Necessidades:'), needs.top.length ? needs.top.map((p) => chip(p, 'warn', 'Posição com carência de elenco')) : chip('equilibrado', 'good'), needs.depth > 0.4 ? chip('profundidade', 'warn') : null)),
      segmented([['players', `Elenco (${roster.length})`], ['picks', `Picks (${picks.length})`]], tab, (v) => { state.tabs[side] = v; renderPanels(); }, { label: 'Ativos da franquia' }),
      h('div', { class: 'tm-list', role: 'list', 'aria-label': tab === 'players' ? 'Jogadores' : 'Escolhas de Draft' }, rows.length ? rows : h('p', { class: 'muted pad' }, tab === 'players' ? 'Sem jogadores.' : 'Nenhuma escolha de Draft em posse desta franquia.')));
    dropTarget(el, { accepts: (a) => a.from !== teamId && state.teams.includes(teamId), onDrop: (a) => addAsset(toAsset(a, teamId)) });
    return el;
  }

  function playerRow(p, teamId, opposite) {
    const contract = world.contracts.get(p.id);
    const summary = contractSummary(contract, capSeason(world));
    const used = inTrade('player', p.id);
    const locked = contract?.tradeLockedUntil && contract.tradeLockedUntil > world.calendar.date;
    const value = playerValue(world, p, { view: god ? 'god' : 'public' }).value;
    const asset = { kind: 'player', id: p.id, from: teamId };
    return h('div', { class: ['tm-asset', 'player', used && 'in-trade', locked && 'locked'], role: 'listitem', tabindex: 0, ...dragProps(asset), 'aria-label': `${p.name}, ${p.positions[0]}, Overall ${p.ovr}${used ? ', na mesa de negociação' : ''}`,
      onkeydown: (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); used ? null : addAsset(playerAsset(p.id, teamId, state.teams.length === 2 ? otherTeam(teamId) : teamId === state.left ? state.right : state.left)); } } },
      h('button', { type: 'button', class: 'tm-avatar', 'aria-label': `Abrir ficha de ${p.name}`, onclick: () => openPlayerQuick(p) }, playerAvatar(p, { size: 'sm', color: world.teams.get(teamId)?.colors?.[0] })),
      h('div', { class: 'tm-asset-main' },
        h('strong', { class: 'tm-name' }, p.name),
        h('small', { class: 'muted' }, `${p.positions.join('/')} · ${playerAge(p) ?? '?'} anos`),
        h('small', { class: 'tm-money' }, `${money(summary?.salary)}${summary?.yearsLeft ? ` · ${summary.yearsLeft} ano(s)` : ''}`)),
      h('div', { class: 'tm-asset-nums' }, ovrBadge(p.ovr), h('span', { class: 'ovr ghost', tip: 'Potencial (estimado)' }, potentialText(p, playerAge(p), god)), h('small', { class: 'faint', tip: 'Valor de troca (visão pública)' }, `v${Math.round(value)}`)),
      h('div', { class: 'tm-asset-flags' }, p.injury ? injuryChip(p.injury) : null, locked ? chip('Trava', 'warn', `Assinou há pouco: só pode ser trocado a partir de ${fmtDate(contract.tradeLockedUntil)}.`) : null, p.rosterStatus === 'two-way' ? chip('2-way', 'info') : p.rosterStatus === 'camp' ? chip('Camp', 'warn') : null),
      used ? h('button', { type: 'button', class: 'btn small ghost', onclick: () => removeAsset(state.assets.findIndex((a) => a.playerId === p.id)), 'aria-label': `Remover ${p.name} da mesa` }, icon('close'))
        : h('button', { type: 'button', class: 'btn small', 'aria-label': `Adicionar ${p.name} à mesa`, tip: 'Adicionar à mesa (ou arraste)', onclick: () => addAsset(playerAsset(p.id, teamId, otherTeam(teamId))) }, icon('plus')));
  }

  function pickRow(k, teamId, opposite, draftSeason, horizon) {
    const used = inTrade('pick', k.id);
    const far = k.season > draftSeason + horizon;
    const value = pickValue(world, k, {}).value;
    const asset = { kind: 'pick', id: k.id, from: teamId };
    return h('div', { class: ['tm-asset', 'pick', used && 'in-trade', far && 'far'], role: 'listitem', tabindex: 0, ...dragProps(asset), 'aria-label': `${pickLabel(k)}${used ? ', na mesa' : ''}`,
      onkeydown: (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); if (!used) addAsset(pickAsset(k.id, teamId, otherTeam(teamId))); } } },
      h('span', { class: 'tm-pick-icon', 'aria-hidden': 'true' }, icon('draft')),
      h('div', { class: 'tm-asset-main' }, h('strong', { class: 'tm-name' }, `${k.season} · ${k.round}ª rodada${k.number ? ` · #${k.number}` : ''}`), h('small', { class: 'muted' }, `${k.originalTeamId !== k.ownerTeamId ? `de ${k.originalTeamId}` : 'própria'}${k.kind === 'expansion-reserved' ? ' · reservada da expansão' : ''}${k.protection ? ` · ${protectionLabel(k.protection)}` : ''}`)),
      h('div', { class: 'tm-asset-nums' }, h('small', { class: 'faint', tip: 'Valor esperado da escolha' }, `v${Math.round(value)}`)),
      h('div', { class: 'tm-asset-flags' }, far ? chip(`+${k.season - draftSeason}a`, 'warn', `Fora do horizonte de ${horizon} ano(s) — ajuste em Regras`) : null, k.status === 'negotiated' ? chip('negociada', 'info') : null),
      used ? h('button', { type: 'button', class: 'btn small ghost', onclick: () => removeAsset(state.assets.findIndex((a) => a.pickId === k.id)), 'aria-label': 'Remover da mesa' }, icon('close'))
        : h('button', { type: 'button', class: 'btn small', 'aria-label': `Adicionar ${pickLabel(k)} à mesa`, tip: 'Adicionar à mesa (ou arraste)', onclick: () => addAsset(pickAsset(k.id, teamId, otherTeam(teamId))) }, icon('plus')));
  }

  // ------------------------------------------------------------------ mesa central
  function tableCenter() {
    const wrap = h('section', { class: ['tm-table', state.mobile === 'table' && 'mobile-active'], 'aria-label': 'Mesa de negociação' },
      h('header', { class: 'tm-table-head' }, h('h2', null, 'Mesa de negociação'), h('span', { class: 'muted small' }, 'Arraste ativos dos painéis ou use o botão +. Funciona por toque e teclado.')));
    const sides = h('div', { class: 'tm-sides' });
    for (const teamId of state.teams) {
      const team = world.teams.get(teamId);
      const mine = state.assets.map((a, i) => ({ a, i })).filter(({ a }) => a.from === teamId);
      const zone = h('div', { class: 'tm-zone', role: 'group', 'aria-label': `${team.name} envia`, dataset: { team: teamId } },
        h('div', { class: 'tm-zone-head' }, teamLogo(team, { size: 'xs' }), h('strong', null, `${team.name.toUpperCase()} ENVIA`), state.teams.length > 2 && teamId !== state.left ? h('button', { class: 'btn small ghost', type: 'button', 'aria-label': `Remover ${team.name} da troca`, onclick: () => removeTeam(teamId) }, icon('close')) : null),
        mine.length ? h('div', { class: 'tm-zone-list' }, mine.map(({ a, i }) => assetCard(a, i))) : h('p', { class: 'tm-zone-empty' }, 'Arraste jogadores ou picks para cá'),
        h('div', { class: 'tm-zone-tools' }, cashTool(teamId), swapTool(teamId)));
      dropTarget(zone, { accepts: (d) => d.from === teamId, onDrop: (d) => addAsset(toAsset(d, state.teams.length === 2 ? otherTeam(teamId) : teamId === state.left ? state.right : state.left)) });
      sides.append(zone);
    }
    wrap.append(sides);
    return wrap;
  }

  function assetCard(a, index) {
    const flag = state.highlight.has(assetKey(a));
    let label = describeAsset(world, a);
    const meta = [];
    if (a.kind === 'player') {
      const p = world.players.get(a.playerId);
      const v = playerValue(world, p, { view: god ? 'god' : 'public' });
      meta.push(`valor ${Math.round(v.value)}`, `${money(v.salary)} · ${v.yearsLeft} ano(s)`);
    } else if (a.kind === 'pick') {
      const pick = world.draftPicks.get(a.pickId);
      meta.push(`valor ${Math.round(pickValue(world, { ...pick, ownerTeamId: a.to, protection: a.protection ?? pick.protection }, {}).value)}`);
    }
    const extras = [];
    if (a.kind === 'pick') {
      const pick = world.draftPicks.get(a.pickId);
      if (pick.round === 1) {
        const current = a.protection ? `${a.protection.top}:${a.protection.fallback}` : '';
        extras.push(h('label', { class: 'tm-protect' }, h('span', { class: 'micro faint' }, 'Proteção'), h('select', { 'aria-label': 'Proteção da escolha', onchange: (e) => { const [top, fallback] = e.target.value.split(':'); if (e.target.value) a.protection = { top: Number(top), fallback, endSeason: fallback === 'rollover' ? pick.season + 2 : pick.season }; else delete a.protection; refresh(); } }, PROTECTIONS.map(([v, l]) => h('option', { value: v, selected: v === current }, l)))));
      }
    }
    if (state.teams.length > 2 && a.kind !== 'cash') {
      extras.push(h('label', { class: 'tm-protect' }, h('span', { class: 'micro faint' }, 'Destino'), h('select', { 'aria-label': 'Destino do ativo', onchange: (e) => { a.to = e.target.value; refresh(); } }, state.teams.filter((t) => t !== a.from).map((t) => h('option', { value: t, selected: t === a.to }, world.teams.get(t).name)))));
    }
    return h('div', { class: ['tm-card', flag && 'new', a.kind] }, h('div', { class: 'grow' }, h('strong', null, label), meta.length ? h('small', { class: 'muted' }, meta.join(' · ')) : null, extras.length ? h('div', { class: 'row wrap' }, extras) : null),
      h('button', { type: 'button', class: 'btn small ghost', 'aria-label': `Remover ${label} da mesa`, onclick: () => removeAsset(index) }, icon('close')));
  }

  function cashTool(teamId) {
    const limit = world.league.cap.tradeCashLimit ?? 0;
    const input = h('input', { type: 'number', min: 0, step: 100000, placeholder: 'Dinheiro (US$)', 'aria-label': 'Valor em dinheiro', style: { width: '120px' } });
    return h('div', { class: 'row tm-tool' }, input, h('button', { class: 'btn small', type: 'button', tip: `Até ${money(limit)} por temporada`, onclick: () => { const v = Number(input.value); if (!(v > 0)) return toast('Informe um valor positivo.', 'warn'); addAsset(cashAsset(v, teamId, state.teams.length === 2 ? otherTeam(teamId) : teamId === state.left ? state.right : state.left)); } }, '+ Dinheiro'));
  }

  function swapTool(teamId) {
    const dest = state.teams.length === 2 ? otherTeam(teamId) : teamId === state.left ? state.right : state.left;
    return h('button', { class: 'btn small', type: 'button', tip: 'Direito de trocar uma pick própria do destinatário por uma sua', onclick: () => swapDialog(teamId, dest) }, '+ Swap');
  }

  function swapDialog(from, to) {
    const mine = picksOwnedBy(world, from).filter((k) => k.season <= nextDraftSeason(world) + futurePickYears(world));
    const theirs = picksOwnedBy(world, to).filter((k) => k.season <= nextDraftSeason(world) + futurePickYears(world));
    const a = h('select', { 'aria-label': 'Pick cedida' }, mine.map((k) => h('option', { value: k.id }, pickLabel(k))));
    const b = h('select', { 'aria-label': 'Pick do destinatário' }, theirs.map((k) => h('option', { value: k.id }, pickLabel(k))));
    infoDialog('Swap de picks', h('div', { class: 'stack' }, h('p', { class: 'muted small' }, `${world.teams.get(to).name} ganha o direito de trocar a pick abaixo pela que escolher da lista de ${world.teams.get(from).name}, se a sua for pior (mesma temporada e rodada).`), h('label', { class: 'field' }, `Pick de ${world.teams.get(to).name}`, b), h('label', { class: 'field' }, `Pick de ${world.teams.get(from).name} (cedida)`, a)),
      [{ label: 'Cancelar' }, { label: 'Adicionar swap', primary: true, onClick: () => { if (!a.value || !b.value) return false; addAsset(swapAsset(a.value, b.value, from, to)); } }]);
  }

  // ------------------------------------------------------------------ avaliação ao vivo e relatório
  function liveBar() {
    const c = state.check;
    if (!c) return h('div', { class: 'tm-live empty', role: 'status' }, h('span', { class: 'muted' }, 'Monte uma proposta para ver a legalidade, o equilíbrio e a chance de aceitação em tempo real.'));
    if (c.error) return h('div', { class: 'tm-live bad', role: 'status' }, `Não foi possível avaliar: ${c.error}`);
    const { legality: lg, balance, acceptance } = c;
    const aiDecisions = Object.values(acceptance.decisions).filter((d) => !d.human);
    const left = world.teams.get(state.left);
    const right = world.teams.get(state.right);
    const sides = state.teams.length === 2 ? balanceMeter(balance.verdict.index ?? 0, { leftLabel: left.name, rightLabel: right.name }) : h('span', { class: 'muted' }, balance.verdict.label);
    return h('div', { class: ['tm-live', lg.ok ? 'ok' : 'bad'], role: 'status', 'aria-live': 'polite' },
      h('div', { class: 'tm-live-block' }, h('span', { class: 'micro faint' }, 'LEGALIDADE'), h('strong', { class: lg.ok ? 'good' : 'bad' }, lg.ok ? (lg.override ? 'PERMITIDA (OVERRIDE)' : 'PERMITIDA') : 'BLOQUEADA'), lg.ok ? null : h('small', { class: 'bad' }, lg.blocked[0].message)),
      h('div', { class: 'tm-live-block wide' }, h('span', { class: 'micro faint' }, 'EQUILÍBRIO ESPORTIVO'), sides),
      h('div', { class: 'tm-live-block' }, h('span', { class: 'micro faint' }, 'ACEITAÇÃO'), aiDecisions.length ? aiDecisions.map((d) => h('span', { class: d.accept ? 'good' : 'warn' }, `${world.teams.get(d.teamId).name}: ${pct(d.probability)}${d.accept ? ' ✓' : ''}`)) : h('span', { class: 'muted' }, '—')),
      h('div', { class: 'tm-live-block' }, h('span', { class: 'micro faint' }, 'FOLHA'), state.teams.map((id) => { const s = lg.teams[id]; return h('span', { class: 'small' }, `${world.teams.get(id).id} ${moneyDelta(s.after - s.before)}`); })),
      h('button', { class: 'btn small', type: 'button', onclick: () => { state.showReport = true; renderReport(); document.getElementById('tm-report')?.scrollIntoView({ block: 'nearest' }); } }, 'Detalhes'));
  }

  function renderReport() {
    const host = root.querySelector('#tm-report');
    if (!host) return;
    if (!state.showReport || !state.check || state.check.error) { mount(host); return; }
    const { legality: lg, balance, acceptance, reasons } = state.check;
    const perTeam = (id) => balance.perTeam[id];
    mount(host, card('Resultado da verificação', h('div', { class: 'stack tm-report' },
      h('div', { class: ['tm-verdict', lg.ok ? 'ok' : 'bad'] }, h('strong', null, lg.ok ? 'PERMITIDA' : 'BLOQUEADA'), h('span', null, lg.ok ? 'A liga consegue registrar esta troca.' : 'A liga não consegue registrar esta troca como está.')),
      lg.blocked.length ? h('ul', { class: 'tm-reasons bad' }, lg.blocked.map((b) => h('li', null, chip(b.label, 'bad'), ' ', b.message))) : null,
      lg.ignored.length ? h('div', { class: 'note warn' }, h('strong', null, 'Override Total — regras ignoradas: '), h('ul', null, lg.ignored.map((b) => h('li', null, `${b.label}: ${b.message}`)))) : null,
      lg.warnings.length ? h('ul', { class: 'tm-reasons warn' }, lg.warnings.map((w) => h('li', null, chip(w.label, 'warn'), ' ', w.message))) : null,
      h('div', { class: 'grid cols-2' },
        card('Folha salarial e enquadramento', h('table', { class: 'data tm-mini' }, h('thead', null, h('tr', null, h('th', null, 'Franquia'), h('th', { class: 'num' }, 'Antes'), h('th', { class: 'num' }, 'Depois'), h('th', null, 'Situação'))),
          h('tbody', null, state.teams.map((id) => { const s = lg.teams[id]; return h('tr', null, h('td', null, world.teams.get(id).name), h('td', { class: 'num' }, money(s.before)), h('td', { class: 'num' }, money(s.after)), h('td', null, capChip(s.statusBefore), ' → ', capChip(s.statusAfter), s.taxAfter > 0 ? h('div', { class: 'small warn' }, `imposto estimado ${money(s.taxAfter)}`) : null)); })))),
        card('Valor das picks e dos jogadores', h('table', { class: 'data tm-mini' }, h('thead', null, h('tr', null, h('th', null, 'Franquia'), h('th', { class: 'num' }, 'Recebe'), h('th', { class: 'num' }, 'Cede'), h('th', { class: 'num' }, 'Saldo'))),
          h('tbody', null, state.teams.map((id) => { const t = perTeam(id); const picks = t.incoming.filter((x) => x.asset.kind === 'pick').reduce((a, x) => a + x.value, 0); return h('tr', null, h('td', null, world.teams.get(id).name), h('td', { class: 'num' }, `${Math.round(t.receives)}${picks ? ` (picks ${Math.round(picks)})` : ''}`), h('td', { class: 'num' }, Math.round(t.gives)), h('td', { class: ['num', t.net >= 0 ? 'good' : 'bad'] }, signed(t.net))); }))))),
      card('Impacto no elenco', h('div', { class: 'grid cols-2' }, state.teams.map((id) => { const i = perTeam(id).impact; return h('div', { class: 'stack small' }, h('strong', null, world.teams.get(id).fullName), h('span', null, `Força: ${i.ratingBefore.toFixed(1)} → ${i.ratingAfter.toFixed(1)} (${signed(i.ratingAfter - i.ratingBefore, 1)}) · ranking ${i.rankBefore}º → ${i.rankAfter}º`), h('span', null, `Vitórias projetadas: ${signed(i.winsDelta, 1)}`), h('span', null, `Idade média: ${i.ageBefore.toFixed(1)} → ${i.ageAfter.toFixed(1)} · elenco ${i.sizeBefore} → ${i.sizeAfter}`), h('span', null, `Carências: ${i.needsBefore.join(', ') || '—'} → ${i.needsAfter.join(', ') || '—'}`)); }))),
      h('div', { class: 'grid cols-2' }, Object.values(acceptance.decisions).filter((d) => !d.human).map((d) => card(`${world.teams.get(d.teamId).fullName}: ${d.accept ? 'aceitaria' : 'recusaria'} · ${pct(d.probability)}`, h('div', { class: 'stack small' },
        d.pros.length ? h('ul', { class: 'tm-reasons good' }, d.pros.map((t) => h('li', null, t))) : null,
        d.cons.length ? h('ul', { class: 'tm-reasons bad' }, d.cons.map((t) => h('li', null, t))) : null,
        h('span', { class: 'faint' }, `Saldo para eles: ${signed(d.net - d.required, 1)} pontos de valor (exigência ${d.required.toFixed(1)}).`))))),
      h('div', { class: 'note' }, h('strong', null, 'Justificativa. '), reasons.join(' ')),
      h('p', { class: 'faint small' }, 'Legal ≠ justa ≠ aceita: a liga permite, o equilíbrio compara o valor esportivo e cada diretoria decide pelo seu perfil, contexto e dificuldade da carreira.'))));
  }

  // ------------------------------------------------------------------ ações
  function actions() {
    const bar = h('div', { class: 'tm-actions', role: 'toolbar', 'aria-label': 'Ações da negociação' },
      h('button', { class: 'btn', type: 'button', onclick: verify }, icon('check'), 'Verificar troca'),
      h('button', { class: 'btn primary', type: 'button', onclick: propose }, icon('trade'), 'Propor troca'),
      h('button', { class: 'btn', type: 'button', disabled: !state.counter, tip: state.counter ? state.counter.message : 'Disponível depois que uma diretoria devolver uma contraproposta.', onclick: loadCounter }, 'Contraproposta'),
      h('button', { class: 'btn', type: 'button', onclick: lock }, 'Travar proposta'),
      h('button', { class: 'btn', type: 'button', onclick: clearAll }, icon('trash'), 'Limpar troca'),
      h('button', { class: 'btn', type: 'button', onclick: draft }, icon('save'), 'Salvar rascunho'),
      h('button', { class: 'btn', type: 'button', onclick: () => { focusTab('historico'); } }, icon('history'), 'Histórico'));
    if (god) {
      bar.append(h('span', { class: 'tm-god' }, h('span', { class: 'micro' }, 'COMISSÁRIO'),
        h('button', { class: 'btn small', type: 'button', tip: 'Ignora a vontade da IA, mas mantém a legalidade da NBA.', onclick: () => godExecute('force') }, 'Forçar aceitação'),
        h('button', { class: ['btn small', overrideActive(world.career) ? 'danger' : ''], type: 'button', tip: 'Autoriza operações fora das regras. Exige ativação explícita e registra as regras ignoradas.', onclick: () => godExecute('override') }, 'Override total')));
    }
    return bar;
  }

  function verify() {
    if (!state.assets.length) return toast('Adicione ativos à mesa para verificar.', 'warn');
    state.showReport = true;
    refresh();
    document.getElementById('tm-report')?.scrollIntoView({ block: 'nearest' });
  }

  async function propose() {
    if (!state.assets.length) return toast('Adicione ativos à mesa para propor.', 'warn');
    const perm = canNegotiateFor(world, userId);
    if (!perm.ok) return toast(perm.reason, 'warn');
    if (!state.teams.includes(userId) && !god) return toast('Sua franquia precisa participar da troca.', 'warn');
    const c = checkTrade(world, proposal());
    if (!c.legality.ok) { state.showReport = true; refresh(); return toast(`Negociação bloqueada: ${c.legality.blocked[0].message}`, 'error'); }
    if (c.acceptance.accepted) {
      const names = state.teams.filter((t) => t !== userId).map((t) => world.teams.get(t).fullName).join(' e ');
      const ok = await confirmDialog({ title: 'Fechar o negócio?', message: `${names} ${state.teams.length > 2 ? 'aceitam' : 'aceita'} a proposta (${pct(c.acceptance.probability)} de chance estimada). Ao confirmar, a troca é registrada imediatamente.`, confirmLabel: 'Confirmar troca' });
      if (!ok) return;
    }
    const result = proposeToAi(world, proposal());
    if (result.status === 'accepted') {
      toast('Troca registrada.');
      await saveWorld();
      state.assets = []; state.counter = null; state.showReport = false;
      refresh();
    } else if (result.status === 'countered') {
      state.counter = result.counter;
      refresh();
      infoDialog('Contraproposta', h('div', { class: 'stack' }, h('p', null, result.counter.message), h('p', { class: 'muted small' }, `A diretoria recusou a proposta original (${pct(result.acceptance.probability)} de chance). Carregue a contraproposta na mesa para ajustar ou enviá-la.`)),
        [{ label: 'Manter minha proposta' }, { label: 'Carregar na mesa', primary: true, onClick: () => loadCounter() }]);
    } else if (result.status === 'rejected') {
      state.showReport = true;
      refresh();
      toast(`${world.teams.get(result.refuse.teamId).fullName} recusou. ${result.refuse.cons[0] ?? ''}`, 'warn');
    } else {
      state.showReport = true;
      refresh();
      toast(`Bloqueada: ${result.legality.blocked[0]?.message}`, 'error');
    }
    renderTabsContent();
  }

  function loadCounter() {
    if (!state.counter) return;
    const before = new Set(state.assets.map(assetKey));
    state.assets = state.counter.assets.map((a) => ({ ...a }));
    state.highlight = new Set(state.assets.map(assetKey).filter((k) => !before.has(k)));
    state.showReport = true;
    refresh();
    toast('Contraproposta carregada: os ativos novos estão destacados.');
  }

  async function lock() {
    if (!state.assets.length) return toast('Nada para travar.', 'warn');
    const name = await promptDialog({ title: 'Travar proposta', label: 'Nome para comparação', value: `Opção ${world.market.locked.length + 1}`, confirmLabel: 'Travar' });
    if (name == null) return;
    lockProposal(world, name, proposal());
    toast('Proposta travada. Compare na aba "Travadas".');
    renderTabsContent();
  }
  async function draft() {
    if (!state.assets.length) return toast('Nada para salvar.', 'warn');
    const name = await promptDialog({ title: 'Salvar rascunho', label: 'Nome do rascunho', value: `Rascunho ${world.market.drafts.length + 1}`, confirmLabel: 'Salvar' });
    if (name == null) return;
    saveDraft(world, name, proposal());
    toast('Rascunho salvo na carreira.');
    renderTabsContent();
  }
  async function godExecute(mode) {
    if (!state.assets.length) return toast('Adicione ativos à mesa.', 'warn');
    try {
      if (mode === 'override' && !overrideActive(world.career)) {
        const text = await promptDialog({ title: 'Ativar Override Total', label: 'Digite OVERRIDE TOTAL para confirmar', placeholder: 'OVERRIDE TOTAL', hint: 'Permite autorizar trocas fora das regras da NBA neste universo. Cada regra ignorada ficará registrada no histórico do comissário.', confirmLabel: 'Ativar' });
        if (text == null) return;
        const { activateOverride } = await import('../../core/godmode.js');
        activateOverride(world, text.trim());
      }
      const preview = checkTrade(world, proposal(), { override: mode === 'override' ? 'total' : null });
      const ignored = preview.legality.ignored;
      const ok = await confirmDialog({ title: mode === 'override' ? 'Executar com Override Total?' : 'Forçar aceitação?', message: mode === 'override' ? (ignored.length ? `Regras que serão ignoradas: ${[...new Set(ignored.map((i) => i.label))].join(', ')}.` : 'Nenhuma regra será violada: a troca já é legal.') : 'A IA não precisa aceitar, mas a troca continua sujeita à legalidade da NBA.', confirmLabel: 'Executar', danger: mode === 'override' });
      if (!ok) return;
      adminTrade(world, proposal(), mode);
      toast(mode === 'override' ? 'Troca executada fora das regras e registrada.' : 'Troca executada com aceitação forçada.');
      await saveWorld();
      state.assets = []; state.counter = null; state.showReport = false;
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ------------------------------------------------------------------ regras e cabeçalho
  function rulesDialog() {
    const horizon = futurePickYears(world);
    const input = h('input', { type: 'number', min: 0, max: 6, value: horizon, 'aria-label': 'Anos à frente', style: { width: '90px' } });
    const deadline = tradeDeadline(world);
    infoDialog('Regras de troca desta carreira', h('div', { class: 'stack' },
      h('dl', { class: 'facts' },
        h('dt', null, 'Prazo de trocas'), h('dd', null, deadline ? fmtDate(deadline) : '—'),
        h('dt', null, 'Picks futuras'), h('dd', null, `até ${horizon} ano(s) à frente do próximo Draft`),
        h('dt', null, 'Dinheiro por temporada'), h('dd', null, money(world.league.cap.tradeCashLimit)),
        h('dt', null, 'Equiparação salarial'), h('dd', null, 'Depende do modo de cap e do enquadramento (cap, 1º e 2º apron)')),
      h('p', { class: 'muted small' }, 'O limite de picks futuras é uma decisão de design da liga (league.json), não a regra definitiva da NBA. Você pode ampliá-lo para esta carreira; a mudança fica registrada e vale para você e para a IA.'),
      h('label', { class: 'field' }, 'Anos à frente permitidos para picks', input),
      h('p', { class: 'faint small' }, 'Valores de salary matching, aprons e exceções de troca estão marcados como "precisam de validação" em league.json.')),
    [{ label: 'Fechar' }, { label: 'Aplicar', primary: true, onClick: () => { const v = Math.max(0, Math.min(6, Math.round(Number(input.value)))); world.market.prefs.futurePickYearsAhead = v; import('../../core/world.js').then((w) => w.markDirty('meta', 'market')); toast(`Horizonte de picks: ${v} ano(s).`); refresh(); } }]);
  }

  function header() {
    const leftSel = h('select', { 'aria-label': 'Franquia da esquerda', disabled: !god, onchange: (e) => setSides(e.target.value, state.right === e.target.value ? state.left : state.right) }, teamsSorted.map((t) => h('option', { value: t.id, selected: t.id === state.left }, t.fullName)));
    const rightSel = h('select', { 'aria-label': 'Franquia adversária', onchange: (e) => setSides(state.left, e.target.value) }, teamsSorted.filter((t) => t.id !== state.left).map((t) => h('option', { value: t.id, selected: t.id === state.right }, t.fullName)));
    const extra = h('select', { 'aria-label': 'Adicionar terceira franquia', onchange: (e) => { addTeam(e.target.value); e.target.value = ''; } }, h('option', { value: '' }, '+ Franquia (3-way)'), teamsSorted.filter((t) => !state.teams.includes(t.id)).map((t) => h('option', { value: t.id }, t.fullName)));
    return h('div', { class: 'toolbar tm-bar' }, leftSel, h('button', { class: 'btn small', type: 'button', tip: 'Inverter os lados', 'aria-label': 'Inverter os lados', disabled: !god && state.right !== state.left, onclick: () => god && setSides(state.right, state.left) }, icon('compare')), rightSel,
      state.teams.length < 4 ? extra : null,
      state.teams.length > 2 ? h('span', { class: 'row wrap' }, state.teams.slice(2).map((t) => h('button', { class: ['chip', state.right === t && 'good'], type: 'button', onclick: () => { state.right = t; refresh(); } }, world.teams.get(t).name))) : null,
      h('span', { class: 'grow' }), h('button', { class: 'btn small', type: 'button', onclick: rulesDialog }, 'Regras'),
      segmented([['left', 'Minha franquia'], ['table', 'Mesa'], ['right', 'Adversário']], state.mobile, (v) => { state.mobile = v; renderPanels(); }, { label: 'Painel visível no celular' }));
  }

  // ------------------------------------------------------------------ abas inferiores
  let tabsApi = null;
  function inboxTab() {
    const offers = world.market.proposals.filter((o) => o.status === 'pending');
    if (!offers.length) return emptyState('Nenhuma oferta recebida', 'As diretorias da IA enviam propostas ao longo da temporada, de tempos em tempos. Ofertas vencem em poucos dias.');
    return h('div', { class: 'stack' }, offers.map((o) => card(`${world.teams.get(o.fromTeamId).fullName} · expira em ${fmtDate(o.expiresOn)}`, h('div', { class: 'stack' }, h('p', null, o.message),
      h('ul', { class: 'tm-offer' }, o.assets.map((a) => h('li', null, h('strong', null, `${world.teams.get(a.from).id} → ${world.teams.get(a.to).id}`), ' ', describeAsset(world, a)))),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn small', onclick: () => { state.teams = [...new Set(o.assets.flatMap((a) => [a.from, a.to]))]; state.left = state.teams.includes(userId) ? userId : state.teams[0]; state.right = state.teams.find((t) => t !== state.left); state.assets = o.assets.map((a) => ({ ...a })); state.showReport = true; refresh(); } }, 'Ver na mesa'),
        h('button', { class: 'btn small primary', onclick: async () => { try { acceptOffer(world, o.id); toast('Oferta aceita.'); await saveWorld(); refresh(); } catch (err) { toast(err.message, 'error'); } } }, 'Aceitar'),
        h('button', { class: 'btn small', onclick: () => { declineOffer(world, o.id); refresh(); } }, 'Recusar'))))));
  }
  function draftsTab() {
    const list = world.market.drafts;
    if (!list.length) return emptyState('Nenhum rascunho', 'Use "Salvar rascunho" para guardar propostas incompletas nesta carreira.');
    return h('div', { class: 'stack' }, list.map((d) => card(`${d.name} · ${fmtDate(d.savedOn)}`, h('div', { class: 'stack' }, h('ul', { class: 'tm-offer' }, d.assets.map((a) => h('li', null, `${a.from} → ${a.to}: ${describeAsset(world, a)}`))),
      h('div', { class: 'row' }, h('button', { class: 'btn small primary', onclick: () => { state.teams = [...d.teams]; state.left = d.teams.includes(userId) ? userId : d.teams[0]; state.right = d.teams.find((t) => t !== state.left); state.assets = d.assets.map((a) => ({ ...a })); refresh(); } }, 'Carregar'), h('button', { class: 'btn small', onclick: () => { deleteDraft(world, d.id); renderTabsContent(); } }, 'Excluir'))))));
  }
  function lockedTab() {
    const list = world.market.locked;
    if (!list.length) return emptyState('Nenhuma proposta travada', 'Trave combinações de ativos para compará-las lado a lado. Travar não impede a IA de fazer outros negócios.');
    const rows = list.map((l) => { let c = null; try { c = checkTrade(world, { assets: l.assets }); } catch { c = null; } return { l, c }; });
    return h('div', { class: 'stack' },
      h('table', { class: 'data' }, h('thead', null, h('tr', null, ['Proposta', 'Legalidade', 'Equilíbrio', 'Aceitação', 'Folha da sua franquia', ''].map((t) => h('th', null, t)))),
        h('tbody', null, rows.map(({ l, c }) => { const mine = c?.legality?.teams?.[userId]; return h('tr', null, h('td', null, h('strong', null, l.name), h('div', { class: 'small muted' }, l.assets.map((a) => describeAsset(world, a)).join(' · '))), h('td', null, c ? chip(c.legality.ok ? 'Permitida' : 'Bloqueada', c.legality.ok ? 'good' : 'bad') : '—'), h('td', null, c ? c.balance.verdict.label : '—'), h('td', null, c ? pct(c.acceptance.probability) : '—'), h('td', { class: 'num' }, mine ? moneyDelta(mine.after - mine.before) : '—'),
          h('td', null, h('button', { class: 'btn small', onclick: () => { state.teams = [...l.teams]; state.left = l.teams.includes(userId) ? userId : l.teams[0]; state.right = l.teams.find((t) => t !== state.left); state.assets = l.assets.map((a) => ({ ...a })); refresh(); } }, 'Carregar'), h('button', { class: 'btn small ghost', 'aria-label': 'Remover', onclick: () => { unlockProposal(world, l.id); renderTabsContent(); } }, icon('close')))); }))));
  }
  function historyTab() {
    let filter = '';
    const host = h('div', null);
    const draw = () => {
      const pending = world.market.proposals.filter((o) => o.status === 'pending');
      const rows = world.market.history.filter((e) => !filter || e.type === filter);
      mount(host,
        pending.length && !filter ? h('div', { class: 'note' }, `${pending.length} oferta(s) pendente(s) — veja a aba "Ofertas".`) : null,
        rows.length ? h('table', { class: 'data' }, h('thead', null, h('tr', null, ['Data', 'Resultado', 'Franquias', 'Ativos', 'Motivo'].map((t) => h('th', null, t)))),
          h('tbody', null, rows.slice(0, 80).map((e) => h('tr', null, h('td', null, fmtDate(e.date)), h('td', null, chip(HISTORY_LABEL[e.type] ?? e.type, HISTORY_KIND[e.type]), e.forced ? chip('forçada', 'warn') : null, e.override?.length ? chip('override', 'bad') : null), h('td', null, e.teams?.join(' · ')), h('td', { class: 'small' }, (e.assets ?? []).map((a) => `${a.from}→${a.to}: ${a.label}`).join(' · ')), h('td', { class: 'small muted' }, (e.reasons ?? []).slice(0, 2).join(' ') || (e.counter ? e.counter.message : e.by === 'ai' ? 'Entre franquias da IA' : '')))))) : emptyState('Sem registros', 'As negociações concluídas, recusadas e contrapropostas aparecem aqui.'));
    };
    draw();
    return h('div', { class: 'stack' }, segmented(HISTORY_FILTERS, filter, (v) => { filter = v; draw(); }, { label: 'Filtrar histórico' }), host);
  }
  function reviewTab() {
    const list = world.market.review;
    return h('div', { class: 'stack' },
      h('p', { class: 'muted small' }, world.career.autoApproveAiTrades ? 'A aprovação automática das trocas da IA está ligada: esta fila só recebe trocas se você desligá-la em Configurações › Carreira.' : 'Trocas válidas entre franquias da IA aguardam a sua decisão como comissário.'),
      list.length ? list.map((r) => card(`${r.summary} · ${fmtDate(r.createdOn)}`, h('div', { class: 'stack' }, h('ul', { class: 'tm-offer' }, r.assets.map((a) => h('li', null, `${a.from} → ${a.to}: ${describeAsset(world, a)}`))),
        h('div', { class: 'row' }, h('button', { class: 'btn small primary', onclick: async () => { try { const { adminApproveReview } = await import('../../core/godmode.js'); adminApproveReview(world, r.id); toast('Trade aprovada.'); await saveWorld(); renderTabsContent(); } catch (err) { toast(err.message, 'error'); } } }, 'Aprovar'), h('button', { class: 'btn small', onclick: async () => { const { adminRejectReview } = await import('../../core/godmode.js'); adminRejectReview(world, r.id); renderTabsContent(); } }, 'Vetar'))))) : emptyState('Fila vazia', 'Nenhuma trade da IA aguardando revisão.'));
  }

  const tabDefs = () => {
    const offers = world.market.proposals.filter((o) => o.status === 'pending').length;
    return [
      { id: 'ofertas', label: `Ofertas recebidas${offers ? ` (${offers})` : ''}`, render: inboxTab },
      { id: 'rascunhos', label: `Rascunhos (${world.market.drafts.length})`, render: draftsTab },
      { id: 'travadas', label: `Travadas (${world.market.locked.length})`, render: lockedTab },
      { id: 'historico', label: 'Histórico', render: historyTab },
      ...(god ? [{ id: 'revisao', label: `Revisão da liga (${world.market.review.length})`, render: reviewTab }] : []),
    ];
  };
  const tabsHost = h('div', { class: 'tm-tabs' });
  let activeTab = query.get('aba') ?? 'ofertas';
  function renderTabsContent() {
    tabsApi = tabView(tabDefs(), { active: activeTab, onChange: (id) => { activeTab = id; setQuery({ aba: id === 'ofertas' ? null : id }); } });
    mount(tabsHost, tabsApi);
  }
  function focusTab(id) { activeTab = id; renderTabsContent(); tabsHost.scrollIntoView({ block: 'nearest' }); }

  // ------------------------------------------------------------------ composição
  const barHost = h('div', null);
  const gridHost = h('div', { class: 'tm-grid', dataset: { mobile: state.mobile } });
  const liveHost = h('div', null);
  const actionsHost = h('div', null);
  const reportHost = h('div', { id: 'tm-report' });
  function renderPanels() {
    gridHost.dataset.mobile = state.mobile;
    mount(gridHost, panel('left'), tableCenter(), panel('right'));
  }
  function refresh() {
    state.check = evaluate();
    mount(barHost, header());
    renderPanels();
    mount(liveHost, liveBar());
    mount(actionsHost, actions());
    renderReport();
    if (state.highlight.size && !state.assets.some((a) => state.highlight.has(assetKey(a)))) state.highlight.clear();
  }
  mount(root,
    pageHeader('Trade Machine', { sub: `Trocas multi-franquia com jogadores, picks, swaps e dinheiro · temporada ${seasonLabel(capSeason(world))}`, actions: [kindChip('estimated'), h('a', { class: 'btn', href: `#/finance` }, icon('finance'), 'Finanças')] }),
    barHost, gridHost, liveHost, actionsHost, reportHost, tabsHost);
  refresh();
  renderTabsContent();
  return root;
}

export { RULE_LABEL, approveReview, rejectReview };
