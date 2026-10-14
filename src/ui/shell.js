// Moldura do aplicativo com uma carreira aberta: navegação lateral, barra superior e área de conteúdo.
import { h, clear, icon, mount } from './dom.js';
import { date as fmtDate, money, PHASE_LABEL, record } from './format.js';
import { navigate, parseHash } from './router.js';
import { chip, kbd } from './components/widgets.js';
import { modal, toast } from './components/feedback.js';
import { isTyping, menuButton, openPalette, setCommandSource } from './components/overlay.js';
import { teamLogo } from '../media/photos.js';
import { getWorld, hasUnsavedChanges, markDirty, payrollOf, saveWorld, userTeam } from '../core/world.js';
import { ROLE_BY_ID } from '../core/career-options.js';
import { seasonLabel } from '../contracts/cap.js';
import { emit, on } from '../core/events.js';
import { userTasks } from '../core/tasks.js';
import { applyUiPreferences, getSetting, setSetting } from '../core/settings.js';
import { advanceControl } from './sim-control.js';
import { MODE_BY_ID, careerRules, modeShows } from '../core/modes.js';

/**
 * Menu principal. Só entra nos grupos de cima o que funciona; o que ainda não existe fica
 * reunido em "Em breve" (recolhido por padrão), com a fase prevista — nunca finge funcionar.
 * `area` permite que um modo de jogo esconda partes do menu (ex.: Coach Mode sem contratos).
 */
const NAV = (teamId) => [
  { id: 'home', items: [{ label: 'Central do GM', icon: 'home', path: '/home', keys: 'H' }] },
  {
    id: 'team', title: 'Minha franquia',
    items: [
      { label: 'Elenco', icon: 'roster', path: `/team/${teamId}`, match: (p, q) => p === `/team/${teamId}` && !['depth', 'folha', 'franquia'].includes(q.get('tab')), keys: 'R' },
      { label: 'Rotação e depth chart', icon: 'depth', path: `/team/${teamId}?tab=depth`, match: (p, q) => p === `/team/${teamId}` && q.get('tab') === 'depth', keys: 'D' },
      { label: 'Contratos e cap', icon: 'cap', path: `/team/${teamId}?tab=folha`, match: (p, q) => p === `/team/${teamId}` && q.get('tab') === 'folha', keys: 'F', area: 'cap' },
      { label: 'Staff e franquia', icon: 'settings', path: `/team/${teamId}?tab=franquia`, match: (p, q) => p === `/team/${teamId}` && q.get('tab') === 'franquia' },
      { label: 'Partida 2D', icon: 'court', path: '/match', keys: 'G' },
    ],
  },
  {
    id: 'nba', title: 'Liga',
    items: [
      { label: 'Universo vivo', icon: 'news', path: '/world', keys: 'U' },
      { label: 'Classificação', icon: 'standings', path: '/standings', keys: 'C' },
      { label: 'Playoffs', icon: 'standings', path: '/playoffs' },
      { label: 'Calendário', icon: 'calendar', path: '/calendar', match: (p) => p === '/calendar' || p.startsWith('/game/'), keys: 'K' },
      { label: 'Observatório', icon: 'standings', path: '/observatory', keys: 'O' },
      { label: 'NBA Data Studio', icon: 'standings', path: '/data-lab' },
      { label: 'Franquias', icon: 'league', path: '/league', match: (p) => p === '/league' || (p.startsWith('/team/') && p !== `/team/${teamId}`), keys: 'L' },
      { label: 'Jogadores', icon: 'players', path: '/players', match: (p) => p === '/players' || p.startsWith('/player/') || p === '/compare', keys: 'J' },
      { label: 'Observados', icon: 'star', path: '/watchlist', keys: 'W' },
      { label: 'História', icon: 'history', path: '/history' },
    ],
  },
  {
    id: 'arcade', title: 'Arena · modos avulsos',
    items: [
      { label: 'NBA Arcade', icon: 'court', path: '/arcade/hub' },
      { label: 'WNBA · Liga feminina', icon: 'star', path: '/wnba/hub' },
      { label: 'NBB · Brasil', icon: 'league', path: '/international/nbb' },
      { label: 'EuroLeague · Clubes', icon: 'league', path: '/international/euroleague' },
      { label: 'EuroBasket · Seleções', icon: 'league', path: '/international/eurobasket' },
      { label: 'All-Star Weekend', icon: 'star', path: '/arcade/allstar' },
      { label: 'Roster Studio', icon: 'roster', path: '/arcade/roster' },
      { label: 'Street 1×1 a 3×3', icon: 'court', path: '/arcade/street' },
      { label: 'Circuito Street', icon: 'standings', path: '/arcade/circuit' },
      { label: 'Copa Relâmpago', icon: 'standings', path: '/arcade/cup' },
    ],
  },
  {
    id: 'soon', title: 'Em breve', defaultClosed: true,
    items: [
      { label: 'Táticas e treino', icon: 'tactics', phase: 6 },
      { label: 'Trades', icon: 'trade', phase: 2, area: 'market' },
      { label: 'Free agency', icon: 'market', phase: 3, area: 'market' },
      { label: 'Draft e scouting', icon: 'eye', phase: 3, area: 'talent' },
      { label: 'Expansion Draft', icon: 'expansion', phase: 3, area: 'talent' },
      { label: 'Finanças', icon: 'finance', phase: 8, area: 'cap' },
    ],
  },
];

const SYSTEM = [
  { label: 'Saves', icon: 'save', path: '/saves' },
  { label: 'Configurações', icon: 'settings', path: '/settings' },
  { label: 'Dev Tools', icon: 'dev', path: '/dev' },
  { label: 'Roteiro do projeto', icon: 'roadmap', path: '/roadmap' },
];

const LEVEL_DOT = { bad: 'bad', warn: 'warn', info: 'info', future: 'future' };

export function createShell() {
  const nav = h('nav', { class: 'nav', 'aria-label': 'Menu principal' });
  const sideTeam = h('a', { class: 'side-team' });
  const top = h('header', { class: 'topbar' });
  const outlet = h('main', { class: 'main', id: 'main', tabIndex: -1 });
  const saveState = h('button', { class: 'save-state', type: 'button', onclick: manualSave, tip: 'Clique para gravar agora. O autosave também grava sozinho.' }, 'Salvo');
  const collapseBtn = h('button', { class: 'btn icon ghost', type: 'button', onclick: toggleSidebar });
  const el = h(
    'div',
    { class: 'shell' },
    h('a', { class: 'skip-link', href: '#main', onclick: (e) => (e.preventDefault(), outlet.focus()) }, 'Pular para o conteúdo'),
    h(
      'aside',
      { class: 'sidebar' },
      sideTeam,
      nav,
      h('div', { class: 'side-foot' }, SYSTEM.map((s) => h('a', { class: 'btn icon ghost', href: `#${s.path}`, 'aria-label': s.label, tip: s.label, dataset: { path: s.path } }, icon(s.icon)))),
    ),
    top,
    outlet,
  );

  function paintCollapsed() {
    const collapsed = getSetting('sidebarCollapsed');
    el.classList.toggle('collapsed', collapsed);
    mount(collapseBtn, icon('panel'));
    collapseBtn.setAttribute('aria-label', collapsed ? 'Expandir menu' : 'Recolher menu');
    collapseBtn.dataset.tip = collapsed ? 'Expandir menu  [' : 'Recolher menu  [';
  }
  function toggleSidebar() {
    setSetting('sidebarCollapsed', !getSetting('sidebarCollapsed'));
    paintCollapsed();
  }

  function renderNav() {
    const world = getWorld();
    const team = userTeam();
    const { path, query } = parseHash();
    const closed = new Set(getSetting('navClosedGroups'));

    mount(sideTeam, teamLogo(team, { size: 'md' }), h('span', { class: 'side-team-text' }, h('strong', null, team.name), h('small', null, `${record(team.record)} · ${ROLE_BY_ID[world.career.role].label} · ${MODE_BY_ID[world.career.mode ?? 'universe'].label}`)));
    sideTeam.href = `#/team/${team.id}`;
    sideTeam.dataset.team = team.id;
    sideTeam.setAttribute('aria-label', `${team.fullName} — abrir elenco`);

    clear(nav);
    for (const group of NAV(team.id)) {
      const items = group.items.filter((i) => !i.area || modeShows(world.career, i.area));
      if (!items.length) continue;
      const isClosed = Boolean(group.title) && closed.has(group.id) !== Boolean(group.defaultClosed);
      const box = h('div', { class: ['nav-group', isClosed && 'closed'] });
      if (group.title) {
        box.append(
          h(
            'button',
            {
              class: 'nav-title', type: 'button', 'aria-expanded': String(!isClosed),
              onclick: () => {
                const next = new Set(getSetting('navClosedGroups'));
                if (!next.delete(group.id)) next.add(group.id);
                setSetting('navClosedGroups', [...next]);
                renderNav();
              },
            },
            group.title,
            group.defaultClosed ? h('span', { class: 'nav-count' }, items.length) : null,
            icon('chevron'),
          ),
        );
      }
      for (const item of items) {
        if (item.phase) {
          box.append(h('a', { class: 'nav-item future', href: `#/roadmap?fase=${item.phase}`, tip: `${item.label}: ainda não implementado — previsto para a Fase ${item.phase}.` }, icon(item.icon), h('span', { class: 'nav-label' }, item.label), h('span', { class: 'phase' }, `F${item.phase}`)));
        } else {
          const active = item.match ? item.match(path, query) : path === item.path;
          box.append(h('a', { class: ['nav-item', active && 'active'], href: `#${item.path}`, 'aria-current': active ? 'page' : null, tip: item.label, dataset: { nav: '1' } }, icon(item.icon), h('span', { class: 'nav-label' }, item.label)));
        }
      }
      nav.append(box);
    }
    for (const a of el.querySelectorAll('.side-foot a')) a.classList.toggle('active', a.dataset.path === path);
  }

  function renderTop() {
    const world = getWorld();
    const team = userTeam();
    const payroll = payrollOf(team.id);
    const tasks = userTasks();
    const urgent = tasks.filter((t) => t.level === 'bad' || t.level === 'warn').length;

    const root = document.documentElement;
    applyUiPreferences();
    if (getSetting('teamAccent')) {
      root.style.setProperty('--team', readable(team.colors));
      root.style.setProperty('--team-raw', team.colors[0]);
      root.style.setProperty('--team-2', team.colors[1] ?? '#ffffff');
    } else for (const v of ['--team', '--team-raw', '--team-2']) root.style.removeProperty(v);
    el.classList.toggle('god', Boolean(world.career.godMode));

    const inbox = menuButton(
      () => (tasks.length ? [{ heading: 'Pendências da franquia' }, ...tasks.map((t) => ({ label: t.title, sub: t.text, dot: LEVEL_DOT[t.level], href: t.link ?? null, disabled: !t.link }))] : [{ heading: 'Nenhuma pendência no momento.' }]),
      { iconName: 'bell', title: urgent ? `${urgent} pendência(s) que pedem atenção` : 'Pendências' },
    );
    inbox.classList.add('inbox');
    if (urgent) inbox.append(h('span', { class: 'count-badge', 'aria-hidden': 'true' }, urgent));

    mount(
      top,
      collapseBtn,
      h('button', { class: 'search-trigger', type: 'button', onclick: openPalette, 'aria-label': 'Busca global e comandos (Ctrl+K)' }, icon('search'), h('span', { class: 'grow' }, 'Buscar jogador, franquia, página…'), kbd('Ctrl K')),
      world.career.godMode ? godFlag(world) : null,
      h('span', { class: 'spacer' }),
      h('a', { class: 'top-stat', href: `#/team/${team.id}?tab=folha`, tip: 'Situação da folha salarial — abrir detalhes.' }, h('span', { class: 'micro faint' }, payroll.capSpace >= 0 ? 'Espaço no cap' : 'Acima do cap'), h('strong', { class: ['num', payroll.status === 'second-apron' && 'bad'] }, money(Math.abs(payroll.capSpace)))),
      saveState,
      inbox,
      h('div', { class: 'top-date' }, h('strong', null, fmtDate(world.calendar.date)), h('span', null, `${PHASE_LABEL[world.calendar.phase]} ${seasonLabel(world.calendar.season)}`)),
      advanceControl(),
    );
  }

  function godFlag(world) {
    if (!careerRules(world.career).switchTeams) return h('a', { class: 'god-flag', href: '#/settings?tab=carreira', tip: 'God Mode ativo: as regras podem ser quebradas e o potencial exato fica visível.' }, 'COMMISSIONER MODE');
    const teams = [...world.teams.values()].sort((x, y) => x.fullName.localeCompare(y.fullName, 'pt-BR'));
    const take = (t) => {
      world.career.teamId = t.id;
      markDirty('meta', 'career');
      emit('career:changed');
      toast(`Você agora controla o ${t.fullName}.`);
      navigate('/home');
    };
    const menu = menuButton(() => [{ heading: 'Controlar outra franquia' }, ...teams.map((t) => ({ label: t.fullName, checked: t.id === world.career.teamId, onClick: () => take(t) }))], { label: 'COMMISSIONER MODE', iconName: null, cls: 'god-flag', align: 'left', title: 'Modo Comissário: as regras podem ser quebradas. Clique para assumir outra franquia.' });
    menu.firstChild.dataset.tip = 'Modo Comissário: as regras normais podem ser quebradas. Clique para assumir o controle de outra franquia.';
    return menu;
  }

  async function manualSave() {
    try {
      await saveWorld();
      setSaved();
      toast('Carreira salva.');
    } catch (err) {
      setSaveState('error', 'Erro ao salvar');
      toast(`Falha ao salvar; as alterações foram mantidas. Clique no status do save para tentar novamente. ${err.message}`, 'error');
    }
  }

  const setSaveState = (cls, text) => {
    saveState.className = `save-state ${cls}`;
    saveState.textContent = text;
  };
  const setSaved = () => setSaveState('', 'Salvo');

  // ---- atalhos de teclado (inativos enquanto o usuário digita)
  function shortcuts() {
    const teamId = userTeam().id;
    return NAV(teamId).flatMap((g) => g.items).filter((i) => i.keys && i.path);
  }
  function showShortcuts() {
    modal((close) => [
      h('h2', null, 'Atalhos de teclado'),
      h('div', { class: 'shortcut-list' }, [['Ctrl K  ou  /', 'Busca global e comandos'], ...shortcuts().map((i) => [i.keys, i.label]), ['S', 'Salvar a carreira agora'], ['[', 'Recolher/expandir o menu'], ['Espaço · 1–4 · T · B · X', 'Na partida: pausar, velocidade, tempo, banco, táticas'], ['?', 'Esta lista'], ['Esc', 'Fechar painel, menu ou janela']].map(([k, label]) => h('div', { class: 'row between' }, h('span', { class: 'muted' }, label), kbd(k)))),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: close }, 'Entendi')),
    ]);
  }
  function onKey(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') return e.preventDefault(), openPalette();
    if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || document.querySelector('.modal-backdrop, .palette-backdrop')) return;
    if (e.key === '/') return e.preventDefault(), openPalette();
    if (e.key === '?') return showShortcuts();
    if (e.key === '[') return toggleSidebar();
    if (e.key.toLowerCase() === 's') return manualSave();
    const hit = shortcuts().find((i) => i.keys.toLowerCase() === e.key.toLowerCase());
    if (hit) navigate(hit.path);
  }
  document.addEventListener('keydown', onKey);
  window.addEventListener('querychange', renderNav);

  setCommandSource(() => {
    const team = userTeam();
    const pages = [...NAV(team.id).flatMap((g) => g.items.map((i) => ({ ...i, sub: g.title }))), ...SYSTEM.map((s) => ({ ...s, sub: 'Sistema' }))];
    return [
      ...pages.map((i) => (i.phase ? { label: i.label, sub: `Previsto para a Fase ${i.phase}`, icon: i.icon, path: `/roadmap?fase=${i.phase}` } : { label: i.label, sub: i.sub, icon: i.icon, path: i.path, keys: i.keys })),
      { label: 'História da franquia', sub: team.fullName, icon: 'history', path: `/team/${team.id}?tab=historia` },
      { label: 'Salvar carreira agora', icon: 'save', run: manualSave, keys: 'S', alias: 'gravar save' },
      { label: 'Jogo rápido', sub: 'Partida 2D', icon: 'court', path: '/play/quick' },
      { label: 'Espectador', sub: 'Partida 2D', icon: 'eye', path: '/play/spectator' },
      { label: 'Sandbox 2D', sub: 'Partida 2D', icon: 'depth', path: '/play/sandbox' },
      { label: 'Sliders de simulação', sub: 'Configurações', icon: 'sliders', path: '/settings?tab=simulacao' },
      { label: 'Recolher ou expandir o menu', icon: 'panel', run: toggleSidebar, keys: '[', alias: 'sidebar' },
      { label: 'Atalhos de teclado', icon: 'keyboard', run: showShortcuts, keys: '?', alias: 'ajuda teclas' },
    ];
  });

  const offs = [
    on('world:dirty', () => setSaveState('dirty', 'Não salvo')),
    on('save:start', () => setSaveState('saving', 'Salvando…')),
    on('save:done', () => {
      setSaved();
      if (getSetting('saveToasts')) toast('Carreira salva automaticamente.');
    }),
    on('save:error', (err) => {
      setSaveState('error', 'Erro ao salvar');
      toast(`Falha no autosave; as alterações foram mantidas. Clique no status do save para tentar novamente. ${err.message}`, 'error');
    }),
    on('calendar:changed', renderTop),
    on('game:final', () => !getWorld().quiet && renderTop()),
    () => document.removeEventListener('keydown', onKey),
    () => window.removeEventListener('querychange', renderNav),
  ];

  paintCollapsed();
  return {
    el,
    outlet,
    refresh() {
      paintCollapsed();
      renderNav();
      renderTop();
      if (hasUnsavedChanges()) setSaveState('dirty', 'Não salvo');
    },
    destroy() {
      for (const off of offs) off();
    },
  };
}

/** Cor da franquia legível sobre fundo escuro (algumas são preto ou azul-marinho). */
function readable([primary, secondary]) {
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  };
  if (lum(primary) >= 0.3) return primary;
  if (secondary && lum(secondary) >= 0.3 && lum(secondary) < 0.95) return secondary;
  // marinho/preto: clareia a própria cor em vez de cair num cinza sem identidade
  return `color-mix(in srgb, ${primary} 45%, #dfe6f5)`;
}
export { readable as readableTeamColor };
