// Central do Draft (#/draft): Draft ao vivo, prospectos, trade de picks, big board e scouting,
// análise ao vivo e histórico. O estado do evento é persistente (world.draft): fechar o navegador no meio
// do Draft retoma da próxima escolha.
import { h, icon, mount } from '../dom.js';
import { date as fmtDate, height, money } from '../format.js';
import { navigate, parseHash, setQuery } from '../router.js';
import { card, chip, emptyState, ovrBadge, pageHeader, posLabel, segmented } from '../components/widgets.js';
import { confirmDialog, tabView, toast } from '../components/feedback.js';
import { infoDialog, loading, pct, promptDialog } from '../components/mgmt.js';
import { playerAvatar, teamLogo } from '../../media/photos.js';
import { getWorld, markDirty, saveWorld } from '../../core/world.js';
import { godModeAllowed } from '../../core/godmode-permissions.js';
import { modeShows } from '../../core/modes.js';
import { ensureDraft, availableProspects, autoPick, classOf, currentEntry, liveOrder, lotteryReady, makePick, pauseDraft, resumeDraft, runLottery, simToUserPick, startDraft, userOwnsCurrent, aiChoice } from '../../draft/draft-engine.js';
import { MAX_WORKOUTS, SCOUTS, SIGNAL_LABEL, bigBoard, consensus, scoutReport, setScoutingNote, workoutsDone, workoutsUsed } from '../../draft/scouting.js';
import { classRetrospective, draftYears } from '../../draft/draft-analysis.js';
import { draftRules } from '../../contracts/rules-config.js';
import { nextDraftSeason, pickLabel, picksOwnedBy } from '../../contracts/picks.js';
import { checkTrade, describeAsset, pickAsset, playerAsset } from '../../contracts/trade-engine.js';
import { proposeToAi } from '../../gm/ai-gm.js';
import { rosterOf } from '../../gm/team-context.js';
import { futurePickYears } from '../../contracts/market-state.js';

const STATUS_LABEL = { pending: 'Aguardando as Finais', ready: 'Loteria concluída', live: 'Ao vivo', complete: 'Concluído' };
const RISK_KIND = { baixo: 'good', médio: 'warn', alto: 'bad' };
const GRADE_KIND = (g) => (g.startsWith('A') ? 'good' : g.startsWith('B') ? 'info' : g.startsWith('C') ? 'warn' : 'bad');

export function draftView() {
  const world = getWorld();
  if (!modeShows(world.career, 'talent')) return h('div', { class: 'page' }, emptyState('Draft indisponível', 'No Coach Mode a diretoria cuida do Draft e do scouting.'));
  const draft = ensureDraft(world);
  const god = godModeAllowed(world.career);
  const userId = world.career.teamId;
  const root = h('div', { class: 'page drf' });
  const query = parseHash().query;
  let timerHandle = null;
  let autoRun = false;
  let selectedId = null;
  let analysisIndex = null;
  const compareSet = new Set();
  const filters = { pos: '', q: '', sort: 'rank' };

  const prospectsAll = () => classOf(world, draft.season);
  const board = () => bigBoard(world, availableProspects(world).length ? prospectsAll() : prospectsAll());
  const rowOf = (id) => board().find((r) => r.prospect.id === id);
  const photoOf = (p) => playerAvatar(p, { size: 'lg' });
  const status = () => draft.status;
  const mineNow = () => status() === 'live' && userOwnsCurrent(world);

  // ------------------------------------------------------------------ cabeçalho / controles
  const controls = h('div', { class: 'drf-controls', role: 'toolbar', 'aria-label': 'Controles do Draft' });
  function renderControls() {
    const live = status() === 'live';
    const paused = draft.paused;
    const entry = currentEntry(world);
    mount(controls,
      status() === 'pending' ? h('button', { class: 'btn primary', type: 'button', disabled: !lotteryReady(world), tip: lotteryReady(world) ? 'Sorteia as quatro primeiras escolhas.' : 'A loteria acontece depois das Finais.', onclick: doLottery }, 'Realizar loteria') : null,
      status() === 'ready' ? h('button', { class: 'btn primary', type: 'button', onclick: () => { startDraft(world); autoRun = true; refreshAll(); } }, icon('play'), 'Iniciar o Draft') : null,
      live ? h('button', { class: 'btn primary', type: 'button', disabled: !mineNow() || paused || !selectedId, tip: mineNow() ? 'Seleciona o prospecto marcado para a sua escolha.' : 'Aguarde a sua vez.', onclick: doPick }, icon('check'), 'Fazer escolha') : null,
      live ? h('button', { class: 'btn', type: 'button', disabled: !entry, onclick: () => tradePickDialog(entry ? world.draftPicks.get(entry.pickId) : null) }, icon('trade'), 'Negociar pick') : null,
      live ? h('button', { class: 'btn', type: 'button', disabled: paused, onclick: doSim }, icon('forward'), 'Simular até minha escolha') : null,
      live && !paused ? h('button', { class: 'btn', type: 'button', onclick: () => { pauseDraft(world); autoRun = false; refreshAll(); } }, icon('pause'), 'Pausar Draft') : null,
      live && paused ? h('button', { class: 'btn', type: 'button', onclick: () => { resumeDraft(world); autoRun = true; refreshAll(); } }, icon('play'), 'Continuar') : null,
      live && !paused && !autoRun ? h('button', { class: 'btn ghost', type: 'button', onclick: () => { autoRun = true; refreshAll(); } }, 'Retomar transmissão') : null,
      status() === 'complete' ? h('span', { class: 'chip good' }, 'Draft concluído') : null);
  }

  async function doLottery() {
    try { runLottery(world); await saveWorld(); toast('Loteria realizada.'); refreshAll(); } catch (err) { toast(err.message, 'error'); }
  }
  async function doPick() {
    try {
      const rec = makePick(world, { prospectId: selectedId, by: 'user' });
      toast(`Você selecionou ${world.prospects.get(rec.prospectId).name} (nota ${rec.grade}).`);
      selectedId = null;
      analysisIndex = draft.picks.length - 1;
      await saveWorld();
      autoRun = true;
      refreshAll();
    } catch (err) { toast(err.message, 'error'); }
  }
  async function doSim() {
    try {
      const made = simToUserPick(world);
      autoRun = false;
      await saveWorld();
      toast(made.length ? `${made.length} escolha(s) simulada(s).` : 'Já é a sua vez.');
      refreshAll();
    } catch (err) { toast(err.message, 'error'); }
  }

  // ------------------------------------------------------------------ cronômetro e transmissão
  const clock = { seconds: 0, total: draftRules(world).secondsPerPick, for: null };
  const clockEl = h('div', { class: 'drf-clock', role: 'timer', 'aria-live': 'off' });
  function tick() {
    if (!root.isConnected) { clearInterval(timerHandle); return; }
    if (status() !== 'live' || draft.paused) { paintClock(); return; }
    const entry = currentEntry(world);
    if (!entry) return;
    if (clock.for !== entry.number) { clock.for = entry.number; clock.seconds = clock.total; }
    if (userOwnsCurrent(world)) {
      clock.seconds -= 1;
      if (clock.seconds <= 0) {
        // tempo esgotado: a diretoria escolhe o melhor da sua lista (big board do usuário primeiro)
        try {
          const pickId = firstFromUserBoard() ?? aiChoice(world, userId, entry, availableProspects(world))?.id;
          makePick(world, { prospectId: pickId, by: 'auto' });
          toast('Tempo esgotado: a diretoria fez a escolha automaticamente.', 'warn');
          saveWorld();
        } catch (err) { toast(err.message, 'error'); }
        refreshAll();
        return;
      }
    } else if (autoRun) {
      clock.seconds -= 1;
      if (clock.seconds <= clock.total - 2) {
        try { autoPick(world); saveWorld(); } catch (err) { toast(err.message, 'error'); autoRun = false; }
        clock.for = null;
        refreshAll();
        return;
      }
    }
    paintClock();
  }
  const firstFromUserBoard = () => (draft.userBoard ?? []).find((id) => world.prospects.get(id)?.status === 'available') ?? null;
  function paintClock() {
    const mine = mineNow();
    const secs = Math.max(0, clock.seconds);
    mount(clockEl, h('span', { class: ['drf-clock-time', mine && secs <= 15 && 'urgent'] }, mine ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : status() === 'live' ? (draft.paused ? 'PAUSADO' : autoRun ? 'AO VIVO' : 'EM ESPERA') : '—'), h('small', { class: 'muted' }, mine ? 'tempo para a sua escolha' : status() === 'live' ? 'a diretoria da vez está escolhendo' : STATUS_LABEL[status()]));
  }

  // ------------------------------------------------------------------ aba: ao vivo
  function liveTab() {
    const entry = currentEntry(world);
    const order = liveOrder(world);
    if (status() === 'pending') {
      return h('div', { class: 'stack' }, card(`Draft ${draft.season}`, h('div', { class: 'stack' },
        h('p', null, lotteryReady(world) ? 'As Finais terminaram. Realize a loteria para definir a ordem.' : 'O Draft acontece na offseason, depois das Finais, da loteria e do período de preparação. Enquanto isso você pode explorar os prospectos e montar o seu big board.'),
        h('p', { class: 'muted small' }, `Picks reservadas da expansão (decisão registrada em league.json): ${Object.entries(world.league.expansion?.initialDraftPicks ?? {}).map(([id, slots]) => `${id} #${slots.join('/#')}`).join(' · ')}.`),
        h('div', { class: 'row wrap' }, h('a', { class: 'btn', href: '#/offseason' }, 'Abrir a offseason'), h('button', { class: 'btn', type: 'button', onclick: () => tabsApi.select?.('prospectos') }, 'Ver prospectos')))));
    }
    if (status() === 'ready') {
      const lot = draft.lottery;
      return h('div', { class: 'stack' }, card('Ordem definida pela loteria', h('div', { class: 'stack' }, h('p', null, `Primeiras escolhas sorteadas: ${lot.drawn.map((id) => world.teams.get(id).fullName).join(', ')}.`), orderTable(order.slice(0, 20)))), h('p', { class: 'muted' }, 'Clique em "Iniciar o Draft" para abrir a transmissão.'));
    }
    const current = entry ? world.draftPicks.get(entry.pickId) : null;
    const onClock = current ? world.teams.get(current.ownerTeamId) : null;
    const ranked = bigBoard(world, availableProspects(world));
    const userBoardIds = draft.userBoard ?? [];
    const ordered = [...ranked].sort((a, b) => { const ia = userBoardIds.indexOf(a.prospect.id); const ib = userBoardIds.indexOf(b.prospect.id); if (ia >= 0 || ib >= 0) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib); return a.rank - b.rank; });
    if (!selectedId || world.prospects.get(selectedId)?.status !== 'available') selectedId = ordered[0]?.prospect.id ?? null;
    const sel = selectedId ? world.prospects.get(selectedId) : null;
    const made = [...draft.picks].reverse().slice(0, 10);
    const upcoming = order.filter((o) => o.status === 'upcoming').slice(0, 8);
    return h('div', { class: 'drf-live' },
      h('section', { class: 'card drf-onclock' },
        onClock ? h('div', { class: 'drf-onclock-body', style: { '--c1': onClock.colors[0] } }, teamLogo(onClock, { size: 'xl' }),
          h('div', { class: 'grow' }, h('span', { class: 'eyebrow' }, status() === 'complete' ? 'DRAFT ENCERRADO' : `RODADA ${entry.round} · ESCOLHA #${entry.number}`), h('h2', null, status() === 'complete' ? '—' : onClock.fullName),
            current && current.ownerTeamId !== current.originalTeamId ? h('small', { class: 'muted' }, `Pick de ${world.teams.get(current.originalTeamId).fullName}`) : null,
            userOwnsCurrent(world) ? chip('É a sua vez', 'good') : null),
          clockEl) : h('div', null, h('h2', null, 'Draft encerrado'), h('p', { class: 'muted' }, `${draft.picks.length} escolhas realizadas.`))),
      h('div', { class: 'drf-columns' },
        card('Jogadores disponíveis', h('div', { class: 'stack' },
          h('div', { class: 'drf-avail', role: 'listbox', 'aria-label': 'Prospectos disponíveis' }, ordered.slice(0, 14).map((r, i) => availableRow(r, i))),
          sel ? prospectDetail(sel) : null), { more: h('span', { class: 'muted small' }, `${ordered.length} disponíveis`) }),
        h('div', { class: 'stack' },
          card('Escolhas anteriores', made.length ? h('ol', { class: 'drf-picks' }, made.map((m) => madeRow(m))) : h('p', { class: 'muted' }, 'Nenhuma escolha ainda.')),
          card('Próximas franquias', upcoming.length ? h('ol', { class: 'drf-picks' }, upcoming.map((o) => h('li', null, h('strong', null, `#${o.number}`), teamLogo(world.teams.get(o.ownerTeamId), { size: 'xs' }), h('span', { class: 'grow' }, world.teams.get(o.ownerTeamId).name), o.traded ? chip(`via ${o.originalTeamId}`, 'info') : null, o.ownerTeamId === userId ? chip('sua', 'good') : null))) : h('p', { class: 'muted' }, '—')),
          card('Notícias e comentários', h('ul', { class: 'drf-ticker', 'aria-live': 'polite' }, draft.log.slice(0, 8).map((l) => h('li', null, l.text)))))));
  }

  function availableRow(r, i) {
    const p = r.prospect;
    const c = r.consensus;
    return h('button', { type: 'button', role: 'option', 'aria-selected': String(p.id === selectedId), class: ['drf-avail-row', p.id === selectedId && 'selected'], onclick: () => { selectedId = p.id; analysisIndex = analysisIndex; renderTabs(); renderControls(); }, ondblclick: () => mineNow() && doPick() },
      h('span', { class: 'drf-rank' }, i + 1), playerAvatar(p, { size: 'sm' }), h('span', { class: 'grow' }, h('strong', null, p.name), h('small', { class: 'muted' }, `${p.positions[0]} · ${p.age} anos · ${p.school}`)),
      h('span', { class: 'drf-ovrs' }, ovrBadge(c.ovr), h('span', { class: 'ovr ghost' }, c.exact ? c.potential : `${c.potLow}–${c.potHigh}`)), r.signal ? chip(SIGNAL_LABEL[r.signal], r.signal === 'bust' ? 'bad' : r.signal === 'steal' ? 'good' : 'warn') : null,
      (draft.userBoard ?? []).includes(p.id) ? chip('★ meu ranking', 'info') : null);
  }

  function prospectDetail(p) {
    const c = consensus(world, p);
    return h('div', { class: 'drf-detail' }, photoOf(p), h('div', { class: 'stack' },
      h('strong', null, p.name), h('div', { class: 'row wrap small' }, posLabel(p.positions), chip(p.country), chip(p.school), chip(height(p.heightIn)), chip(`risco ${p.risk}`, RISK_KIND[p.risk]), p.fictional ? chip('Prospecto fictício', 'info', 'Os dados deste jogador são gerados pelo jogo; ele não representa uma pessoa real.') : null),
      h('p', { class: 'small' }, `${p.style.label} — ${p.style.tip}`), h('div', { class: 'small' }, h('span', { class: 'good' }, `Fortes: ${p.strengths.join(', ')}`), h('br'), h('span', { class: 'warn' }, `Deficiências: ${p.weaknesses.join(', ')}`)),
      h('small', { class: 'muted' }, `Avaliação dos scouts: Overall ${c.exact ? c.ovr : `${c.ovrLow}–${c.ovrHigh}`} · Potencial ${c.exact ? c.potential : `${c.potLow}–${c.potHigh}`}${c.exact ? ' (valores exatos — God Mode)' : ''}`)));
  }

  function madeRow(m) {
    const team = world.teams.get(m.teamId);
    const p = world.prospects.get(m.prospectId);
    return h('li', { class: 'drf-made' }, h('strong', null, `#${m.number}`), teamLogo(team, { size: 'xs' }), h('span', { class: 'grow' }, h('strong', null, p.name), h('small', { class: 'muted' }, ` ${p.positions[0]} · ${team.name}`)), chip(m.grade, GRADE_KIND(m.grade)),
      h('button', { class: 'btn small ghost', type: 'button', tip: 'Ver análise', onclick: () => { analysisIndex = draft.picks.indexOf(m); tabsApi.select('analise'); } }, 'Análise'));
  }

  function orderTable(order) {
    return h('table', { class: 'data' }, h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Franquia'), h('th', null, 'Origem'), h('th', null, 'Observação'))),
      h('tbody', null, order.map((o) => h('tr', { class: o.ownerTeamId === userId ? 'selected' : null }, h('td', null, o.number), h('td', null, h('span', { class: 'person' }, teamLogo(world.teams.get(o.ownerTeamId), { size: 'xs' }), h('span', null, world.teams.get(o.ownerTeamId).fullName))), h('td', null, o.originalTeamId === o.ownerTeamId ? 'própria' : world.teams.get(o.originalTeamId).name), h('td', { class: 'small muted' }, o.kind === 'expansion-reserved' ? 'pick reservada da expansão' : o.protection ? `protegida top ${o.protection.top}` : '')))));
  }

  // ------------------------------------------------------------------ aba: prospectos
  function prospectCard(row) {
    const p = row.prospect;
    const c = row.consensus;
    const compared = compareSet.has(p.id);
    return h('article', { class: ['drf-card', p.status !== 'available' && 'gone'], 'aria-label': p.name },
      h('header', null, playerAvatar(p, { size: 'lg' }), h('div', { class: 'grow' }, h('strong', null, p.name), h('small', { class: 'muted' }, `${p.firstName ? '' : ''}${p.country} · ${p.age} anos · ${height(p.heightIn)}`), h('small', { class: 'muted' }, p.school)), posLabel(p.positions)),
      h('div', { class: 'row wrap small' }, chip(`OVR ${c.exact ? c.ovr : `${c.ovrLow}–${c.ovrHigh}`}`), chip(`POT ${c.exact ? c.potential : `${c.potLow}–${c.potHigh}`}`, 'info'), chip(`risco ${p.risk}`, RISK_KIND[p.risk]), chip(`projeção #${row.mockRank}`), p.status !== 'available' ? chip(p.status === 'drafted' ? `Escolhido #${p.draft.pick}` : 'Sem escolha', 'warn') : null, p.fictional ? chip('fictício', 'info', 'Dados gerados pelo jogo; não é um jogador real.') : null),
      h('p', { class: 'small' }, h('strong', null, p.style.label), ` — ${p.style.tip}`),
      h('div', { class: 'small' }, h('div', { class: 'good' }, `+ ${p.strengths.join(' · ')}`), h('div', { class: 'warn' }, `− ${p.weaknesses.join(' · ')}`)),
      h('div', { class: 'drf-scouts small' }, SCOUTS.map((s) => { const r = scoutReport(world, p, s); return h('span', { tip: `${s.name} · ${s.focus}` }, `${s.name.split(' ')[0]}: ${r.ovr}/${r.potential}`); }), h('span', { class: 'faint' }, `treinos ${workoutsDone(world, p.id)}/3`)),
      row.signal ? h('div', { class: ['note', row.signal === 'bust' ? 'warn' : ''] }, SIGNAL_LABEL[row.signal]) : null,
      p.scouting?.notes ? h('p', { class: 'small muted' }, `Anotação: ${p.scouting.notes}`) : null,
      h('footer', { class: 'row wrap' },
        h('button', { class: ['btn small', p.scouting?.favorite && 'primary'], type: 'button', 'aria-pressed': String(Boolean(p.scouting?.favorite)), onclick: () => { setScoutingNote(p, { favorite: !p.scouting?.favorite }); markDirty('prospects', p.id); renderTabs(); } }, icon('star', { filled: Boolean(p.scouting?.favorite) }), 'Favorito'),
        h('button', { class: 'btn small', type: 'button', disabled: p.status !== 'available' || workoutsDone(world, p.id) >= 3 || workoutsUsed(world) >= MAX_WORKOUTS, tip: `Treino individual reduz a incerteza (${workoutsUsed(world)}/${MAX_WORKOUTS} usados)`, onclick: () => workout(p) }, 'Treino'),
        h('button', { class: 'btn small', type: 'button', onclick: () => note(p) }, 'Anotar'),
        h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: compared, onchange: (e) => { if (e.target.checked && compareSet.size >= 4) { e.target.checked = false; return toast('Compare no máximo 4 prospectos.', 'warn'); } e.target.checked ? compareSet.add(p.id) : compareSet.delete(p.id); renderTabs(); } }), 'Comparar')));
  }
  async function workout(p) {
    if (workoutsUsed(world) >= MAX_WORKOUTS) return toast('Limite de treinos individuais atingido.', 'warn');
    draft.workouts[p.id] = workoutsDone(world, p.id) + 1;
    markDirty('meta', 'draft');
    toast(`Treino com ${p.name}: a avaliação dos scouts ficou mais precisa.`);
    renderTabs();
  }
  async function note(p) {
    const text = await promptDialog({ title: `Anotação sobre ${p.name}`, label: 'Observações do scouting', value: p.scouting?.notes ?? '', confirmLabel: 'Salvar' });
    if (text == null) return;
    setScoutingNote(p, { notes: text.trim() });
    markDirty('prospects', p.id);
    renderTabs();
  }

  function prospectsTab() {
    const rows = bigBoard(world, prospectsAll());
    const host = h('div', { class: 'drf-grid', 'aria-live': 'polite' });
    const bar = h('div', { class: 'toolbar' },
      segmented([['', 'Todos'], ['PG', 'PG'], ['SG', 'SG'], ['SF', 'SF'], ['PF', 'PF'], ['C', 'C'], ['fav', '★']], filters.pos, (v) => { filters.pos = v; draw(); }, { label: 'Filtrar por posição' }),
      h('input', { type: 'search', placeholder: 'Buscar nome, país ou universidade', 'aria-label': 'Buscar prospecto', value: filters.q, oninput: (e) => { filters.q = e.target.value; draw(); } }),
      h('select', { 'aria-label': 'Ordenar', onchange: (e) => { filters.sort = e.target.value; draw(); } }, [['rank', 'Ranking dos scouts'], ['potential', 'Potencial'], ['ovr', 'Overall projetado'], ['age', 'Idade']].map(([v, l]) => h('option', { value: v, selected: filters.sort === v }, l))),
      h('span', { class: 'grow' }), h('button', { class: 'btn', type: 'button', disabled: compareSet.size < 2, onclick: openCompare }, icon('compare'), `Comparar (${compareSet.size})`));
    const draw = () => {
      const q = filters.q.trim().toLowerCase();
      let list = rows.filter((r) => (!filters.pos || (filters.pos === 'fav' ? r.prospect.scouting?.favorite : r.prospect.positions.includes(filters.pos))) && (!q || `${r.prospect.name} ${r.prospect.country} ${r.prospect.school}`.toLowerCase().includes(q)));
      const key = { rank: (r) => r.rank, potential: (r) => -r.consensus.potential, ovr: (r) => -r.consensus.ovr, age: (r) => r.prospect.age }[filters.sort];
      list = [...list].sort((a, b) => key(a) - key(b) || a.rank - b.rank);
      mount(host, list.length ? list.slice(0, 48).map(prospectCard) : emptyState('Nenhum prospecto encontrado', 'Ajuste os filtros.'));
    };
    draw();
    return h('div', { class: 'stack' }, h('div', { class: 'note' }, `Turma ${draft.season}: ${prospectsAll().length} prospectos. A turma é FICTÍCIA (gerada pelo jogo, sem fotos): o projeto não tem dados verificados de classes futuras. Avaliações incertas: a margem de erro segue a dificuldade "Imprecisão do scouting" (${(world.career.modifiers?.scoutingNoise ?? 1).toString().replace('.', ',')}×).`), bar, host);
  }
  function openCompare() {
    const picks = [...compareSet].map((id) => ({ p: world.prospects.get(id), c: consensus(world, world.prospects.get(id)) }));
    const rows = [['Posição', (x) => x.p.positions.join('/')], ['Idade', (x) => x.p.age], ['Altura', (x) => height(x.p.heightIn)], ['País', (x) => x.p.country], ['Universidade/clube', (x) => x.p.school], ['Overall (scouts)', (x) => (x.c.exact ? x.c.ovr : `${x.c.ovrLow}–${x.c.ovrHigh}`)], ['Potencial (scouts)', (x) => (x.c.exact ? x.c.potential : `${x.c.potLow}–${x.c.potHigh}`)], ['Estilo', (x) => x.p.style.label], ['Fortes', (x) => x.p.strengths.join(', ')], ['Deficiências', (x) => x.p.weaknesses.join(', ')], ['Risco', (x) => x.p.risk], ['Projeção nos mocks', (x) => `#${rowOf(x.p.id)?.mockRank ?? '—'}`]];
    infoDialog('Comparar prospectos', h('div', { class: 'table-wrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, h('th', null, ''), picks.map((x) => h('th', null, x.p.name)))), h('tbody', null, rows.map(([label, fn]) => h('tr', null, h('th', { scope: 'row' }, label), picks.map((x) => h('td', null, fn(x)))))))), [{ label: 'Fechar', primary: true }], { wide: true });
  }

  // ------------------------------------------------------------------ aba: trade de picks
  function tradePickDialog(preselect = null) {
    const mine = picksOwnedBy(world, userId).filter((k) => k.season <= nextDraftSeason(world) + futurePickYears(world));
    if (!mine.length) return toast('Você não possui picks negociáveis.', 'warn');
    const teams = [...world.teams.values()].filter((t) => t.id !== userId).sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR'));
    const offered = h('select', { 'aria-label': 'Pick oferecida' }, mine.map((k) => h('option', { value: k.id, selected: preselect?.id === k.id }, pickLabel(k))));
    const dest = h('select', { 'aria-label': 'Franquia destinatária', onchange: fill }, teams.map((t) => h('option', { value: t.id }, t.fullName)));
    const wantPicks = h('select', { multiple: true, size: 6, 'aria-label': 'Picks desejadas' });
    const wantPlayers = h('select', { multiple: true, size: 6, 'aria-label': 'Jogadores desejados' });
    const protect = h('select', { 'aria-label': 'Proteção' }, [['', 'Sem proteção'], ['5:rollover', 'Top 5 · rola para o ano seguinte'], ['10:rollover', 'Top 10 · rola'], ['5:second-round', 'Top 5 · vira 2ª rodada']].map(([v, l]) => h('option', { value: v }, l)));
    const result = h('div', { class: 'stack small', 'aria-live': 'polite' });
    function fill() {
      const t = dest.value;
      mount(wantPicks, picksOwnedBy(world, t).filter((k) => k.season <= nextDraftSeason(world) + futurePickYears(world)).map((k) => h('option', { value: k.id }, pickLabel(k))));
      mount(wantPlayers, rosterOf(world, t).filter((p) => p.rosterStatus === 'standard').slice(0, 15).map((p) => h('option', { value: p.id }, `${p.name} · ${p.positions[0]} · ${p.ovr}`)));
      mount(result);
    }
    const build = () => {
      const t = dest.value;
      const assets = [pickAsset(offered.value, userId, t)];
      for (const o of wantPicks.selectedOptions) assets.push(pickAsset(o.value, t, userId, protect.value && world.draftPicks.get(o.value).round === 1 ? (([top, fb]) => ({ top: Number(top), fallback: fb, endSeason: world.draftPicks.get(o.value).season + 2 }))(protect.value.split(':')) : null));
      for (const o of wantPlayers.selectedOptions) assets.push(playerAsset(Number(o.value), t, userId));
      return { assets };
    };
    fill();
    infoDialog('Oferecer escolha para outra franquia', h('div', { class: 'stack' },
      h('label', { class: 'field' }, 'Pick oferecida', offered), h('label', { class: 'field' }, 'Franquia destinatária', dest),
      h('div', { class: 'grid cols-2' }, h('label', { class: 'field' }, 'Picks desejadas (futuras inclusive)', wantPicks), h('label', { class: 'field' }, 'Jogadores desejados', wantPlayers)),
      h('label', { class: 'field' }, 'Proteção nas picks de 1ª rodada que você receber', protect),
      h('p', { class: 'muted small' }, 'Exemplo: trocar a pick #12 por uma escolha futura de primeira rodada e um jogador. A negociação é avaliada pela IA e pelas regras da NBA.'), result),
    [{ label: 'Fechar' },
      { label: 'Avaliar', onClick: () => { const c = checkTrade(world, build()); mount(result, h('div', { class: c.legality.ok ? 'good' : 'bad' }, c.legality.ok ? 'Permitida' : `Bloqueada: ${c.legality.blocked[0].message}`), h('div', null, `Chance de aceitação: ${pct(c.acceptance.probability)} · ${c.balance.verdict.label}`), ...Object.values(c.acceptance.decisions).filter((d) => !d.human).flatMap((d) => d.cons.slice(0, 2).map((t) => h('div', { class: 'muted' }, t)))); return false; } },
      { label: 'Abrir na Trade Machine', onClick: () => { navigate(`/market?team=${userId}&with=${dest.value}&offer=${offered.value}`); } },
      { label: 'Propor agora', primary: true, onClick: async () => { const r = proposeToAi(world, build()); if (r.status === 'accepted') { toast('Troca de picks concluída: a ordem do Draft foi atualizada.'); await saveWorld(); refreshAll(); } else { mount(result, h('div', { class: 'warn' }, r.status === 'countered' ? r.counter.message : r.status === 'blocked' ? `Bloqueada: ${r.legality.blocked[0].message}` : `Recusada: ${r.refuse.cons[0] ?? ''}`)); return false; } } }]);
  }

  function picksTab() {
    const mine = picksOwnedBy(world, userId);
    const thisDraft = mine.filter((k) => k.season === draft.season);
    const future = mine.filter((k) => k.season > draft.season);
    const row = (k) => h('tr', null, h('td', null, `${k.season} · ${k.round}ª rodada`), h('td', null, k.number ? `#${k.number}` : '—'), h('td', null, k.originalTeamId === userId ? 'própria' : world.teams.get(k.originalTeamId).name), h('td', { class: 'small muted' }, [k.kind === 'expansion-reserved' ? 'reservada da expansão' : '', k.protection ? `protegida top ${k.protection.top}` : ''].filter(Boolean).join(' · ')), h('td', null, h('button', { class: 'btn small', type: 'button', onclick: () => tradePickDialog(k) }, icon('trade'), 'Oferecer')));
    return h('div', { class: 'stack' },
      h('div', { class: 'row wrap' }, h('button', { class: 'btn primary', type: 'button', onclick: () => tradePickDialog() }, icon('trade'), 'Oferecer escolha para outra franquia'), h('a', { class: 'btn', href: '#/market' }, 'Abrir a Trade Machine')),
      card(`Suas picks do Draft ${draft.season}`, thisDraft.length ? h('table', { class: 'data' }, h('thead', null, h('tr', null, ['Pick', 'Posição', 'Origem', 'Condições', ''].map((t) => h('th', null, t)))), h('tbody', null, thisDraft.map(row))) : h('p', { class: 'muted' }, 'Você não possui picks neste Draft.')),
      card('Picks futuras', future.length ? h('table', { class: 'data' }, h('thead', null, h('tr', null, ['Pick', 'Posição', 'Origem', 'Condições', ''].map((t) => h('th', null, t)))), h('tbody', null, future.slice(0, 20).map(row))) : h('p', { class: 'muted' }, '—')),
      draft.lottery ? card('Ordem do Draft (atual)', orderTable(liveOrder(world).filter((o) => o.status !== 'made').slice(0, 30))) : null);
  }

  // ------------------------------------------------------------------ aba: big board
  function boardTab() {
    const rows = bigBoard(world, availableProspects(world).length ? availableProspects(world) : prospectsAll());
    const mineIds = draft.userBoard ?? [];
    const host = h('div', null);
    const draw = () => {
      let list = rows.filter((r) => !filters.pos || filters.pos === '' || (filters.pos === 'fav' ? r.prospect.scouting?.favorite : r.prospect.positions.includes(filters.pos)));
      if (filters.sort === 'mine') list = [...list].sort((a, b) => { const ia = mineIds.indexOf(a.prospect.id); const ib = mineIds.indexOf(b.prospect.id); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.rank - b.rank; });
      else if (filters.sort === 'potential') list = [...list].sort((a, b) => b.consensus.potential - a.consensus.potential);
      mount(host, h('div', { class: 'table-wrap' }, h('table', { class: 'data drf-board' }, h('thead', null, h('tr', null, ['#', 'Prospecto', 'Pos', 'Idade', 'OVR', 'POT', ...SCOUTS.map((s) => s.name.split(' ')[0]), 'Mock', 'Sinal', 'Meu ranking'].map((t) => h('th', null, t)))),
        h('tbody', null, list.slice(0, 60).map((r) => {
          const p = r.prospect;
          const idx = mineIds.indexOf(p.id);
          return h('tr', { class: [p.scouting?.favorite && 'fav'] }, h('td', null, r.rank), h('td', null, h('span', { class: 'person' }, playerAvatar(p, { size: 'xs' }), h('span', null, h('span', { class: 'name' }, p.name), h('small', null, `${p.school} · ${p.country}`)))), h('td', null, p.positions[0]), h('td', null, p.age), h('td', null, r.consensus.exact ? r.consensus.ovr : `${r.consensus.ovrLow}–${r.consensus.ovrHigh}`), h('td', null, r.consensus.exact ? r.consensus.potential : `${r.consensus.potLow}–${r.consensus.potHigh}`),
            ...SCOUTS.map((s) => h('td', null, r.scoutRanks[s.id])), h('td', null, r.mockRank), h('td', null, r.signal ? chip(SIGNAL_LABEL[r.signal], r.signal === 'bust' ? 'bad' : r.signal === 'steal' ? 'good' : 'warn') : ''),
            h('td', null, h('div', { class: 'row', style: { gap: '4px' } }, h('button', { class: 'btn small ghost', type: 'button', 'aria-label': idx >= 0 ? `Remover ${p.name} do meu ranking` : `Adicionar ${p.name} ao meu ranking`, onclick: () => { if (idx >= 0) draft.userBoard.splice(idx, 1); else draft.userBoard.push(p.id); markDirty('meta', 'draft'); draw(); } }, idx >= 0 ? `#${idx + 1} ✕` : '+ ranking'), idx > 0 ? h('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'Subir', onclick: () => { [draft.userBoard[idx - 1], draft.userBoard[idx]] = [draft.userBoard[idx], draft.userBoard[idx - 1]]; markDirty('meta', 'draft'); draw(); } }, '↑') : null)));
        })))));
    };
    draw();
    return h('div', { class: 'stack' },
      h('div', { class: 'toolbar' }, segmented([['', 'Todos'], ['PG', 'PG'], ['SG', 'SG'], ['SF', 'SF'], ['PF', 'PF'], ['C', 'C'], ['fav', '★']], filters.pos, (v) => { filters.pos = v; draw(); }, { label: 'Filtrar' }),
        segmented([['rank', 'Consenso'], ['potential', 'Potencial'], ['mine', 'Meu ranking']], filters.sort === 'mine' || filters.sort === 'potential' ? filters.sort : 'rank', (v) => { filters.sort = v; draw(); }, { label: 'Ordenar' }), h('span', { class: 'grow' }), h('span', { class: 'muted small' }, `Treinos ${workoutsUsed(world)}/${MAX_WORKOUTS}`)),
      h('div', { class: 'note' }, 'A coluna Mock é a projeção pública; as colunas dos scouts são rankings independentes, com ruído proporcional à imprecisão do scouting. "Possível steal" = ranking dos scouts bem acima do mock; "risco de bust" = o contrário. Não são certezas.'), host);
  }

  // ------------------------------------------------------------------ aba: análise
  function analysisTab() {
    if (!draft.picks.length) return emptyState('Sem escolhas ainda', 'A análise aparece depois de cada seleção.');
    const index = analysisIndex ?? draft.picks.length - 1;
    const m = draft.picks[Math.min(index, draft.picks.length - 1)];
    const a = m.analysis;
    const p = world.prospects.get(m.prospectId);
    const team = world.teams.get(m.teamId);
    const select = h('select', { 'aria-label': 'Escolha analisada', onchange: (e) => { analysisIndex = Number(e.target.value); renderTabs(); } }, draft.picks.map((x, i) => h('option', { value: i, selected: i === draft.picks.indexOf(m) }, `#${x.number} ${world.prospects.get(x.prospectId).name}`)));
    return h('div', { class: 'stack' }, h('div', { class: 'toolbar' }, h('label', null, 'Escolha: ', select)),
      h('div', { class: 'drf-analysis' },
        h('div', { class: ['drf-grade', GRADE_KIND(m.grade)], 'aria-label': `Nota ${m.grade}` }, h('span', null, m.grade), h('small', null, 'nota da escolha')),
        h('div', { class: 'stack' }, h('div', { class: 'row' }, teamLogo(team, { size: 'md' }), h('strong', null, `#${m.number} · ${team.fullName} escolhe ${p.name}`)), h('p', { class: 'muted' }, `${p.positions[0]} · ${p.age} anos · ${p.school} · ${p.country} · ${p.style.label}`))),
      h('div', { class: 'grid cols-2' },
        card('Leitura da escolha', h('ul', { class: 'drf-facts' }, h('li', null, h('strong', null, 'Necessidade atendida: '), a.needMet ? `Sim — a posição ${p.positions[0]} era carência (índice ${a.need}).` : `Não — sem necessidade imediata em ${p.positions[0]}.`), h('li', null, h('strong', null, 'Melhor disponível: '), `${a.bestAvailable.name}${a.bestAvailable.prospectId === p.id ? ' (foi o escolhido)' : ''}`), h('li', null, h('strong', null, 'Ajuste ao elenco: '), a.fit), h('li', null, h('strong', null, 'Consenso dos scouts: '), `#${a.consensusRank} entre os disponíveis · projeção pública #${a.mockRank}${a.signal ? ` · ${a.signal}` : ''}`), h('li', null, h('strong', null, 'Projeção competitiva: '), a.projection.text))),
        card('Opinião dos analistas', h('ul', { class: 'drf-facts' }, a.analysts.map((x) => h('li', null, h('strong', null, `${x.analyst}: `), x.text)))),
        card('Reação da torcida', h('div', { class: 'stack' }, h('strong', null, `${a.fan.label} · ${a.fan.approval}% de aprovação`), h('div', { class: 'progress' }, h('i', { style: { width: `${a.fan.approval}%` } })))),
        card('Impacto nas escolhas seguintes', a.nextPicks.length ? h('ul', { class: 'drf-facts' }, a.nextPicks.map((n) => h('li', null, n.text))) : h('p', { class: 'muted' }, 'Nenhuma das próximas escolhas perdeu um alvo claro.'))));
  }

  // ------------------------------------------------------------------ aba: histórico
  function historyTab() {
    const years = draftYears(world);
    let year = Number(query.get('ano')) || (draft.status === 'complete' ? draft.season : years.find((y) => y < draft.season) ?? years[0]);
    let other = null;
    const host = h('div', null);
    const draw = () => {
      const retro = classRetrospective(world, year);
      const o = other ? classRetrospective(world, other) : null;
      mount(host, h('div', { class: 'stack' },
        h('div', { class: 'stats-row' }, h('div', { class: 'stat' }, h('span', { class: 'k' }, 'Escolhas'), h('span', { class: 'v' }, retro.rows.length)), h('div', { class: 'stat' }, h('span', { class: 'k' }, 'Classificação'), h('span', { class: 'v' }, retro.strength)), h('div', { class: 'stat' }, h('span', { class: 'k' }, 'Steals'), h('span', { class: 'v' }, retro.hits)), h('div', { class: 'stat' }, h('span', { class: 'k' }, 'Busts'), h('span', { class: 'v' }, retro.busts)),
          o ? h('div', { class: 'stat' }, h('span', { class: 'k' }, `Comparação ${other}`), h('span', { class: 'v' }, o.strength), h('span', { class: 's' }, `valor médio ${retro.averageValue.toFixed(1)} vs ${o.averageValue.toFixed(1)}`)) : null),
        h('div', { class: 'table-wrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, ['#', 'Franquia', 'Jogador', 'Pos', 'Nota no Draft', 'Time atual', 'OVR hoje', 'Avaliação'].map((t) => h('th', null, t)))),
          h('tbody', null, retro.rows.map((r) => h('tr', null, h('td', null, r.number), h('td', null, r.teamId), h('td', null, r.playerId ? h('a', { href: `#/player/${r.playerId}` }, r.name) : r.name), h('td', null, r.position), h('td', null, r.gradeAtDraft ? chip(r.gradeAtDraft, GRADE_KIND(r.gradeAtDraft)) : '—'), h('td', null, r.retired ? 'aposentado' : r.currentTeamId ?? '—'), h('td', null, r.ovr ?? '—'), h('td', null, r.verdict ? chip({ steal: 'Steal', bust: 'Bust', acerto: 'Acerto', esperado: 'Dentro do esperado', abaixo: 'Abaixo' }[r.verdict], { steal: 'good', acerto: 'good', bust: 'bad', abaixo: 'warn' }[r.verdict]) : '—'))))))));
    };
    const yearSel = h('select', { 'aria-label': 'Temporada do Draft', onchange: (e) => { year = Number(e.target.value); draw(); } }, years.map((y) => h('option', { value: y, selected: y === year }, `Draft ${y}`)));
    const otherSel = h('select', { 'aria-label': 'Comparar com', onchange: (e) => { other = Number(e.target.value) || null; draw(); } }, h('option', { value: '' }, 'Sem comparação'), years.map((y) => h('option', { value: y }, `Comparar com ${y}`)));
    draw();
    return h('div', { class: 'stack' }, h('div', { class: 'toolbar' }, yearSel, otherSel), host,
      h('p', { class: 'faint small' }, 'Turmas anteriores a 2027 vêm dos dados reais do seed (jogador.draft). A avaliação retrospectiva compara o valor atual do jogador com o esperado pela posição na escolha; busts e steals são julgados pelo desenvolvimento real.'));
  }

  // ------------------------------------------------------------------ composição
  const tabDefs = [
    { id: 'ao-vivo', label: 'Draft ao vivo', render: liveTab },
    { id: 'prospectos', label: 'Prospectos', render: prospectsTab },
    { id: 'picks', label: 'Trade de picks', render: picksTab },
    { id: 'big-board', label: 'Big board e scouting', render: boardTab },
    { id: 'analise', label: 'Análise ao vivo', render: analysisTab },
    { id: 'historico', label: 'Histórico', render: historyTab },
  ];
  let tabsApi = null;
  const tabsHost = h('div', null);
  let active = query.get('aba') ?? 'ao-vivo';
  function renderTabs() {
    tabsApi = tabView(tabDefs, { active, onChange: (id) => { active = id; setQuery({ aba: id === 'ao-vivo' ? null : id }); } });
    const orig = tabsApi;
    // expõe select() para navegação programática entre abas
    tabsApi.select = (id) => { active = id; setQuery({ aba: id === 'ao-vivo' ? null : id }); renderTabs(); };
    mount(tabsHost, orig);
  }
  function refreshAll() {
    renderControls();
    paintClock();
    renderTabs();
    mount(headHost, headerContent());
  }
  const headHost = h('div', null);
  function headerContent() {
    return pageHeader(`Draft ${draft.season}`, { sub: `${STATUS_LABEL[status()]} · ${prospectsAll().length} prospectos${draft.lottery ? ` · ${draft.order.length} escolhas` : ''}`, actions: [chip(STATUS_LABEL[status()], status() === 'live' ? 'good' : status() === 'complete' ? 'info' : ''), h('a', { class: 'btn', href: '#/offseason' }, 'Offseason'), h('a', { class: 'btn', href: '#/market' }, icon('trade'), 'Trade Machine')] });
  }
  mount(root, headHost, controls, tabsHost);
  mount(headHost, headerContent());
  renderControls();
  paintClock();
  renderTabs();
  if (status() === 'live') autoRun = false; // retomar exige ação: o Draft nunca "anda sozinho" ao reabrir a tela
  timerHandle = setInterval(tick, 1000);
  return root;
}
