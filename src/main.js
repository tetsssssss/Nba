// Ponto de entrada: registra as rotas, abre a última carreira e monta a interface.
import { h, mount } from './ui/dom.js';
import { defineRoute, matchRoute, navigate, parseHash, startRouter } from './ui/router.js';
import { createShell } from './ui/shell.js';
import { toast } from './ui/components/feedback.js';
import { startView } from './ui/views/start.js';
import { newCareerView } from './ui/views/new-career.js';
import { homeView } from './ui/views/home.js';
import { worldView } from './ui/views/world.js';
import { teamView } from './ui/views/team.js';
import { leagueView } from './ui/views/league.js';
import { observatoryView } from './ui/views/observatory.js';
import { dataLabView } from './ui/views/data-lab.js';
import { playersView } from './ui/views/players.js';
import { playerView } from './ui/views/player.js';
import { historyView } from './ui/views/history.js';
import { savesView } from './ui/views/saves.js';
import { settingsView } from './ui/views/settings.js';
import { devToolsView } from './ui/views/devtools.js';
import { roadmapView } from './ui/views/roadmap.js';
import { matchView, playView } from './ui/views/match.js';
import { openRecovery } from './ui/views/saves.js';
import { listSaves } from './core/saves.js';
import { icon } from './ui/dom.js';
import { loadPhotoManifest } from './media/photos.js';
import { applyUiPreferences, getSetting } from './core/settings.js';
import { installTooltips } from './ui/components/tooltip.js';
import { compareView } from './ui/views/compare.js';
import { standingsView } from './ui/views/standings.js';
import { playoffsView } from './ui/views/playoffs.js';
import { calendarView } from './ui/views/calendar.js';
import { gameView } from './ui/views/game.js';
import { ensureSchedule } from './season/season.js';
import { watchlistView } from './ui/views/watchlist.js';
import { arcadeView } from './ui/views/arcade.js';
import { wnbaView } from './ui/views/wnba.js';
import { internationalView } from './ui/views/international.js';
import { hasUnsavedChanges, hasWorld, saveWorld } from './core/world.js';
import { openCareer } from './core/saves.js';
import { on } from './core/events.js';

const app = document.getElementById('app');
let shell = null;
let renderToken = 0;

// rotas sem carreira aberta
defineRoute('/start', startView, { career: false });
defineRoute('/new', newCareerView, { career: false });
// rotas da carreira
defineRoute('/home', homeView);
defineRoute('/world', worldView);
defineRoute('/team/:id', teamView);
defineRoute('/league', leagueView);
defineRoute('/observatory', observatoryView);
defineRoute('/data-lab', dataLabView);
defineRoute('/players', playersView);
defineRoute('/player/:id', playerView);
defineRoute('/history', historyView);
// rotas que funcionam com ou sem carreira aberta
defineRoute('/saves', savesView, { career: 'optional' });
defineRoute('/settings', settingsView, { career: 'optional' });
defineRoute('/play/:mode', playView, { career: 'optional' });
defineRoute('/arcade/:mode', arcadeView, { career: 'optional' });
defineRoute('/wnba/:mode', wnbaView, { career: 'optional' });
defineRoute('/international/:league', internationalView, { career: 'optional' });
defineRoute('/dev', devToolsView);
defineRoute('/roadmap', roadmapView);
defineRoute('/match', matchView);
defineRoute('/compare', compareView);
defineRoute('/standings', standingsView);
defineRoute('/playoffs', playoffsView);
defineRoute('/calendar', calendarView);
defineRoute('/game/:id', gameView);
defineRoute('/watchlist', watchlistView);

function teardownShell() {
  shell?.destroy();
  shell = null;
}

const scrollMemory = new Map();
let lastHash = null;

async function render() {
  const token = ++renderToken;
  if (shell && lastHash) scrollMemory.set(lastHash, shell.outlet.scrollTop);
  lastHash = location.hash;
  const { path } = parseHash();
  if (path === '/') return navigate(hasWorld() ? '/home' : '/start', { replace: true });
  const match = matchRoute(path);
  if (!match) return navigate(hasWorld() ? '/home' : '/start', { replace: true });
  const optional = match.route.meta.career === 'optional';
  const needsCareer = optional ? hasWorld() : match.route.meta.career !== false;
  if (needsCareer && !hasWorld()) return navigate('/start', { replace: true });

  let outlet = app;
  if (needsCareer) {
    if (!shell) {
      shell = createShell();
      mount(app, shell.el);
    }
    shell.refresh();
    outlet = shell.outlet;
  } else {
    teardownShell();
  }

  try {
    const view = await match.route.view(match.params);
    if (token !== renderToken) return; // navegação mais recente venceu
    if (optional && !needsCareer) {
      // sem carreira: moldura simples com o caminho de volta ao menu inicial
      mount(app, h('div', { class: 'standalone' }, h('header', { class: 'standalone-bar' }, h('a', { class: 'btn ghost', href: '#/start' }, icon('exit'), 'Menu inicial'), h('strong', { class: 'standalone-brand' }, 'NBA Universe Manager')), h('main', { class: 'standalone-main' }, view)));
      return;
    }
    mount(outlet, view);
    // "voltar" devolve o usuário ao ponto em que estava; navegação nova começa no topo
    outlet.scrollTop = scrollMemory.get(location.hash) ?? 0;
  } catch (err) {
    console.error(err);
    if (token !== renderToken) return;
    mount(outlet, h('div', { class: 'page' }, h('div', { class: 'note warn' }, h('strong', null, 'Não foi possível abrir esta tela. '), err.message)));
  }
}

on('world:unloaded', teardownShell);
// toda carreira aberta tem calendário: as novas ganham na criação, as antigas na primeira abertura
on('world:loaded', () => ensureSchedule());
on('career:changed', () => shell?.refresh());

// Garante a gravação ao fechar/ocultar a aba.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && hasUnsavedChanges()) saveWorld().catch(() => {});
});
window.addEventListener('beforeunload', (e) => {
  if (hasUnsavedChanges()) {
    saveWorld().catch(() => {});
    e.preventDefault();
  }
});

async function boot() {
  applyUiPreferences();
  installTooltips();
  await loadPhotoManifest();
  const last = getSetting('lastSaveId');
  if (last) {
    try {
      await openCareer(last);
    } catch (err) {
      // o save fica intacto: o usuário decide entre tentar de novo, exportar ou voltar
      const save = (await listSaves().catch(() => [])).find((s) => s.id === last);
      if (save) setTimeout(() => openRecovery(save, err), 300);
      else toast('A última carreira não foi encontrada neste navegador.', 'warn');
    }
  }
  startRouter(render);
}

boot().catch((err) => {
  console.error(err);
  mount(app, h('div', { class: 'loading', style: { height: '100vh' } }, `Falha ao iniciar: ${err.message}`));
});
