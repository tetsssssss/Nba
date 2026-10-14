// Offseason (#/offseason): progresso visual das 11 fases, pendências obrigatórias, próximas ações e atalhos
// para Draft, Finanças e Trade Machine. Cada fase é persistente: fechar o navegador não perde o andamento.
import { h, icon, mount } from '../dom.js';
import { date as fmtDate, money } from '../format.js';
import { card, chip, emptyState, pageHeader, playerCell } from '../components/widgets.js';
import { confirmDialog, toast } from '../components/feedback.js';
import { infoDialog, stepper } from '../components/mgmt.js';
import { getWorld, playerAge, saveWorld } from '../../core/world.js';
import { godModeAllowed } from '../../core/godmode-permissions.js';
import { adminRetirement } from '../../core/godmode.js';
import { OFFSEASON_STEPS, autoCompleteOffseason, completeStep, ensureOffseason, offseasonStatus, simulateFreeAgencyDay } from '../../season/offseason.js';
import { beginNextSeason } from '../../season/season.js';
import { aiRosterAdjust } from '../../gm/ai-offseason.js';
import { freeAgents, rightsOf } from '../../contracts/contracts-engine.js';
import { simAll, startDraft, runLottery } from '../../draft/draft-engine.js';
import { seasonLabel } from '../../contracts/cap.js';

export function offseasonView() {
  const world = getWorld();
  const root = h('div', { class: 'page off' });
  if (world.calendar.phase !== 'offseason') {
    return h('div', { class: 'page' }, pageHeader('Offseason', { sub: 'Disponível depois das Finais.' }), emptyState(world.calendar.phase === 'complete' ? 'Carreira concluída' : 'A temporada ainda está em andamento', 'A offseason começa quando o campeão é definido: aposentadorias, loteria, Draft, decisões de contrato, free agency e ajuste de elenco.', h('a', { class: 'btn', href: '#/calendar' }, 'Ir ao calendário')));
  }
  const god = godModeAllowed(world.career);
  let selected = null;

  async function run(label, fn) {
    try { const out = await fn(); await saveWorld(); render(); return out; } catch (err) { toast(`${label}: ${err.message}`, 'error'); render(); return null; }
  }

  function stepPanel(status) {
    const step = selected ?? status.current?.id ?? 'next-season';
    const def = OFFSEASON_STEPS.find((s) => s.id === step);
    const info = status.steps.find((s) => s.id === step);
    const off = world.offseason;
    const isCurrent = status.current?.id === step;
    const reqs = isCurrent ? info.requirements : [];
    const blocking = reqs.filter((r) => r.blocking);
    const body = [];
    body.push(h('p', { class: 'muted' }, def.description));
    if (info.status === 'done') body.push(h('div', { class: 'note' }, `Concluída em ${fmtDate(info.doneOn)}.`));
    if (reqs.length) body.push(h('ul', { class: 'off-reqs' }, reqs.map((r) => h('li', { class: [r.level, r.blocking && 'blocking'] }, chip(r.blocking ? 'Obrigatório' : 'Informação', r.blocking ? 'warn' : 'info'), ' ', r.link ? h('a', { href: `#${r.link}` }, r.text) : r.text))));
    const actions = [];
    const next = () => run('Avançar', () => { completeStep(world, step); });

    if (step === 'awards' || step === 'finals') body.push(awardsCard());
    if (step === 'retirements') body.push(retirementsCard(off, info.status !== 'done' && isCurrent));
    if (step === 'lottery' && world.draft?.lottery) body.push(lotteryCard());
    if (step === 'lottery' && isCurrent) actions.push(h('button', { class: 'btn primary', type: 'button', onclick: next }, 'Realizar loteria e avançar'));
    if (step === 'scouting' && isCurrent) actions.push(h('a', { class: 'btn', href: '#/draft?aba=big-board' }, icon('eye'), 'Abrir big board e scouting'), h('button', { class: 'btn primary', type: 'button', onclick: next }, 'Concluir preparação'));
    if (step === 'draft' && isCurrent) actions.push(h('a', { class: 'btn primary', href: '#/draft' }, icon('draft'), 'Abrir a Draft Night'), h('button', { class: 'btn', type: 'button', onclick: () => run('Draft', () => { runLottery(world); startDraft(world); simAll(world); toast('Draft simulado por completo.'); }) }, 'Simular o Draft inteiro'), h('button', { class: 'btn primary', type: 'button', disabled: blocking.length > 0, onclick: next }, 'Concluir Draft e avançar'));
    if (step === 'retirements' && isCurrent) actions.push(h('button', { class: 'btn primary', type: 'button', onclick: next }, 'Aplicar aposentadorias e avançar'));
    if (step === 'contracts' && isCurrent) actions.push(h('a', { class: 'btn', href: '#/finance?tab=contratos' }, icon('finance'), 'Decidir opções'), h('button', { class: 'btn primary', type: 'button', disabled: blocking.length > 0, onclick: next }, 'Iniciar o novo ano de liga'));
    if (step === 'free-agency' && isCurrent) {
      body.push(h('div', { class: 'stats-row' }, h('div', { class: 'stat' }, h('span', { class: 'k' }, 'Dia'), h('span', { class: 'v' }, `${off.faDay}/${off.faDays}`)), h('div', { class: 'stat' }, h('span', { class: 'k' }, 'Agentes livres'), h('span', { class: 'v' }, freeAgents(world).length)), h('div', { class: 'stat' }, h('span', { class: 'k' }, 'Seus direitos abertos'), h('span', { class: 'v' }, rightsOf(world, world.career.teamId).length))));
      actions.push(h('a', { class: 'btn', href: '#/finance?tab=free-agency' }, icon('market'), 'Mercado de free agents'), h('button', { class: 'btn', type: 'button', disabled: off.faDay >= off.faDays, onclick: () => run('Free agency', () => { simulateFreeAgencyDay(world); }) }, '+1 dia'), h('button', { class: 'btn', type: 'button', disabled: off.faDay >= off.faDays, onclick: () => run('Free agency', () => { for (let i = 0; i < 7 && off.faDay < off.faDays; i++) simulateFreeAgencyDay(world); }) }, '+7 dias'), h('button', { class: 'btn primary', type: 'button', onclick: next }, 'Encerrar a free agency'));
    }
    if (step === 'renewals' && isCurrent) actions.push(h('a', { class: 'btn', href: '#/finance?tab=contratos' }, 'Extensões'), h('a', { class: 'btn', href: '#/market' }, icon('trade'), 'Trade Machine'), h('button', { class: 'btn primary', type: 'button', onclick: next }, 'Concluir'));
    if (step === 'roster' && isCurrent) actions.push(h('a', { class: 'btn', href: `#/team/${world.career.teamId}` }, icon('roster'), 'Abrir elenco'), h('button', { class: 'btn', type: 'button', onclick: () => run('Elenco', () => { const a = aiRosterAdjust(world, world.career.teamId, { minimum: world.league.roster.regularSeasonMin }); toast(`Elenco ajustado automaticamente (${a.length} ações).`); }) }, 'Ajustar automaticamente'), h('button', { class: 'btn primary', type: 'button', disabled: blocking.length > 0, onclick: next }, 'Concluir ajustes'));
    if (step === 'next-season' && isCurrent) {
      body.push(h('ul', { class: 'off-reqs' }, h('li', null, 'O desenvolvimento dos jogadores é aplicado uma única vez (marcador na carreira).'), h('li', null, `O salary cap ${world.league.cap.projected ? 'já foi' : 'será'} projetado para a nova temporada; valores oficiais de 2026-27 ficam no histórico.`), h('li', null, 'Estratégia das 31 diretorias reavaliada pelos resultados.')));
      actions.push(h('button', { class: 'btn primary large', type: 'button', onclick: () => run('Nova temporada', async () => { completeStep(world, 'next-season'); const ok = beginNextSeason(); toast(ok ? `Temporada ${seasonLabel(world.calendar.season)} aberta.` : 'Carreira concluída.'); location.hash = '#/home'; }) }, 'Concluir e abrir a próxima temporada'));
    }
    if (isCurrent && !actions.length && step !== 'next-season') actions.push(h('button', { class: 'btn primary', type: 'button', onclick: next }, 'Concluir etapa'));
    if (info.status === 'pending') body.push(h('div', { class: 'note' }, 'Esta etapa ainda não começou.'));
    return card(h('span', null, def.label, ' ', chip(info.status === 'done' ? 'Concluída' : info.status === 'active' ? 'Em andamento' : 'Pendente', info.status === 'done' ? 'good' : info.status === 'active' ? 'warn' : '')), h('div', { class: 'stack' }, body, actions.length ? h('div', { class: 'row wrap off-actions' }, actions) : null));
  }

  function awardsCard() {
    const a = world.offseason.awards;
    if (!a) return h('p', { class: 'muted' }, 'Premiações ainda não calculadas.');
    const name = (x) => (x ? `${world.players.get(x.playerId)?.name} (${world.teams.get(x.teamId)?.id}) — ${x.value}` : '—');
    return h('div', { class: 'stack' }, h('div', { class: 'stats-row' }, h('div', { class: 'stat' }, h('span', { class: 'k' }, 'Campeão'), h('span', { class: 'v' }, world.teams.get(a.champion)?.fullName ?? '—')), h('div', { class: 'stat' }, h('span', { class: 'k' }, 'Vice'), h('span', { class: 'v' }, world.teams.get(a.runnerUp)?.fullName ?? '—'))),
      h('dl', { class: 'facts' }, h('dt', null, 'Destaque estatístico'), h('dd', null, name(a.bestStatisticalSeason)), h('dt', null, 'Destaque das Finais'), h('dd', null, name(a.finalsStandout)), h('dt', null, 'Novato'), h('dd', null, name(a.rookie)), h('dt', null, 'Cestinha'), h('dd', null, name(a.scoring)), h('dt', null, 'Rebotes'), h('dd', null, name(a.rebounds)), h('dt', null, 'Assistências'), h('dd', null, name(a.assists))), h('p', { class: 'faint small' }, a.note));
  }

  function retirementsCard(off, editable) {
    const list = off.retirements?.list ?? [];
    const shown = list.filter((r) => r.retires || r.probability >= 0.25).slice(0, 40);
    if (!shown.length) return h('p', { class: 'muted' }, 'Nenhum jogador em idade de decisão.');
    const kept = new Set(off.retirements.kept);
    const forced = new Set(off.retirements.forced);
    return h('div', { class: 'table-wrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, ['Jogador', 'Franquia', 'Idade', 'OVR', 'Chance', 'Decisão', 'Motivos', god && editable ? 'Comissário' : ''].map((t) => h('th', null, t)))),
      h('tbody', null, shown.map((r) => { const p = world.players.get(r.playerId); const retires = forced.has(r.playerId) || (r.retires && !kept.has(r.playerId)); return h('tr', null, h('td', null, playerCell(p, { size: 'xs' })), h('td', null, r.teamId ?? 'livre'), h('td', { class: 'num' }, r.age), h('td', { class: 'num' }, r.ovr), h('td', { class: 'num' }, `${Math.round(r.probability * 100)}%`), h('td', null, off.retirements.applied ? (off.retirements.retired?.includes(r.playerId) ? chip('Aposentado', 'bad') : chip('Continua', 'good')) : retires ? chip('Vai se aposentar', 'bad') : chip('Continua', 'good')), h('td', { class: 'small muted' }, r.reasons.join('; ') || '—'),
        god && editable ? h('td', null, h('button', { class: 'btn small', onclick: () => run('Aposentadoria', () => adminRetirement(world, r.playerId, 'force')) }, 'Forçar'), h('button', { class: 'btn small ghost', onclick: () => run('Aposentadoria', () => adminRetirement(world, r.playerId, 'keep')) }, 'Manter')) : null); }))));
  }

  function lotteryCard() {
    const l = world.draft.lottery;
    const order = world.draft.order.slice(0, 14);
    return h('div', { class: 'stack' }, h('p', null, `Sorteados: ${l.drawn.map((id, i) => `${i + 1}º ${world.teams.get(id).name}`).join(' · ')}`), h('table', { class: 'data' }, h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Franquia'), h('th', null, 'Observação'))), h('tbody', null, order.map((o) => { const k = world.draftPicks.get(o.pickId); return h('tr', null, h('td', null, o.number), h('td', null, world.teams.get(k.ownerTeamId).fullName), h('td', { class: 'small muted' }, [k.kind === 'expansion-reserved' ? 'pick reservada da expansão' : '', k.ownerTeamId !== k.originalTeamId ? `via ${k.originalTeamId}` : ''].filter(Boolean).join(' · '))); }))));
  }

  async function auto() {
    const ok = await confirmDialog({ title: 'Concluir a offseason automaticamente?', message: 'Todas as etapas restantes serão resolvidas com decisões padrão — inclusive as da sua franquia (draft pelo ranking da diretoria, opções pelo valor, renovações conservadoras e ajuste de elenco). Você não poderá escolher no Draft nem na free agency.', confirmLabel: 'Concluir tudo' });
    if (!ok) return;
    await run('Offseason automática', async () => { autoCompleteOffseason(world); const started = beginNextSeason(); toast(started ? `Temporada ${seasonLabel(world.calendar.season)} aberta.` : 'Carreira concluída.'); location.hash = '#/home'; });
  }

  function render() {
    if (world.calendar.phase !== 'offseason' || !world.offseason) return; // a offseason acabou (nova temporada aberta)
    const status = offseasonStatus(world);
    const off = world.offseason;
    const retired = [...world.players.values()].filter((p) => p.retired?.season === off.season);
    mount(root,
      pageHeader(`Offseason ${seasonLabel(off.season)}`, { sub: `${fmtDate(world.calendar.date)} · ${status.steps.filter((s) => s.status === 'done').length} de ${status.steps.length} etapas concluídas`, actions: [h('button', { class: 'btn', type: 'button', onclick: auto }, icon('forward'), 'Concluir automaticamente'), h('a', { class: 'btn', href: '#/draft' }, icon('draft'), 'Draft'), h('a', { class: 'btn', href: '#/finance' }, icon('finance'), 'Finanças')] }),
      h('div', { class: 'off-progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(status.progress * 100)) }, h('i', { style: { width: `${status.progress * 100}%` } })),
      stepper(status.steps, { onSelect: (s) => { selected = s.id; render(); } }),
      h('div', { class: 'grid cols-2 off-grid' },
        stepPanel(status),
        h('div', { class: 'stack' },
          card('Pendências', status.blocked.length ? h('ul', { class: 'off-reqs' }, status.blocked.map((b) => h('li', { class: 'blocking' }, b.link ? h('a', { href: `#${b.link}` }, b.text) : b.text))) : h('p', { class: 'good' }, 'Nenhuma pendência obrigatória agora.')),
          retired.length ? card(`Aposentados em ${off.season}`, h('div', { class: 'row wrap' }, retired.slice(0, 30).map((p) => h('a', { class: 'chip', href: `#/player/${p.id}` }, `${p.name} · ${p.retired.age}a`)))) : null,
          card('Diário da offseason', off.log.length ? h('ul', { class: 'drf-ticker' }, off.log.slice(0, 10).map((l) => h('li', null, h('small', { class: 'faint' }, fmtDate(l.at)), ' ', l.text))) : h('p', { class: 'muted' }, 'Sem registros ainda.')))));
  }

  ensureOffseason(world);
  render();
  return root;
}
