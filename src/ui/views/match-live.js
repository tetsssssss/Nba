// Partida em andamento: placar de transmissão, quadra, controles de jogo, comandos do técnico e painel lateral.
// Toda regra mora em src/match; esta tela só lê o estado e envia comandos (setTactic, requestSub, callTimeout).
import { h, icon, mount } from '../dom.js';
import { chip, emptyState } from '../components/widgets.js';
import { modal, tabView, toast } from '../components/feedback.js';
import { menuButton } from '../components/overlay.js';
import { openSubstitutions, openTactics, openTimeout } from './match-coach.js';
import { loadPlayerImage, loadTeamLogoImage, playerAvatar, teamLogo } from '../../media/photos.js';
import { CAMERAS, MatchRenderer } from '../../match/renderer.js';
import { CAMERAS_3D, GRAPHICS_QUALITY, MatchRenderer3D, qualityOf, replayProjection } from '../../match/renderer3d.js';
import { ARCADE25D_CAMERAS, MatchRendererArcade25D } from '../../match/renderer-arcade25d.js';
import { TUNE } from '../../match/config.js';
import { CONTEST_LEVELS } from '../../match/shot.js';
import { matchNotes, periodScores, teamComparison } from '../../match/highlights.js';
import { buildGameRecord, topScorers } from '../../match/bridge.js';
import { addGame, hasWorld } from '../../core/world.js';
import { getSetting, setSetting } from '../../core/settings.js';
import { gameSound } from '../../audio/soundscape.js';
import { createBroadcastNarrator } from '../../audio/broadcast-narration.js';
import { renderOptions, sliderValue } from '../../core/sliders.js';
import { broadcastSnapshot, recommendBroadcastCamera } from '../../match/broadcast-bridge.js';
import { createBroadcastStudio } from '../components/broadcast-studio.js';
import { createLiveBroadcastOverlay } from '../components/broadcast-live-overlay.js';
import { createBroadcastShowOverlay } from '../components/broadcast-show-overlay.js';
import { loadBabylonRuntime, loadBabylonGltfLoader } from '../../match/babylon-adapter.js';
import { MatchRendererBabylon, BABYLON_CAMERAS } from '../../match/renderer-babylon.js';

// Velocidades de acompanhamento: frações ajudam a observar jogadas e movimentos
// sem alterar o relógio ou as regras da simulação. Os atalhos numéricos continuam
// reservados às velocidades inteiras mais usadas.
const SPEEDS = [0.75, 0.8, 0.9, 1, 2, 4, 8];
const HOTKEY_SPEEDS = [1, 2, 4, 8];
const speedLabel = (value) => `${String(value).replace('.', ',')}x`;
const parseSpeed = (value, fallback = 1) => {
  const parsed = Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(parsed) ? Math.max(0.1, Math.min(32, parsed)) : fallback;
};
const clockText = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
const periodLabel = (sim) => (sim.sandbox ? 'Sandbox' : sim.quarter > 4 ? `Prorrogação ${sim.quarter - 4}` : `${sim.quarter}º quarto`);
const pips = (n, total) => h('span', { class: 'to-pips', tip: `${n} tempo(s) restante(s)` }, Array.from({ length: total }, (_, i) => h('i', { class: i < n && 'on' })));

/**
 * @param ctx { control: 0 | 1 | null (espectador), mode: 'quick'|'spectator'|'sandbox', onNew, onRestart }
 * @returns função de limpeza
 */
export function renderLive(root, sim, infos, ctx) {
  const control = ctx.control;
  const canvas = h('canvas', { 'aria-label': 'Quadra da partida' });
  const renderer = new MatchRenderer(canvas, sim, { imageOf: (p) => loadPlayerImage(p.data), logoOf: (t) => loadTeamLogoImage(t.team), options: renderOptions() });
  const canvas3d = h('canvas', { class: 'match-canvas-3d hidden', 'aria-label': 'Quadra 3D da partida' });
  const canvasArcade = h('canvas', { class: 'match-canvas-arcade hidden', 'aria-label': 'Quadra 2.5D arcade da partida' });
  const canvasBabylon = h('canvas', { class: 'match-canvas-babylon hidden', 'aria-label': 'Quadra Babylon 3D da partida' });
  let renderer3d = null;
  let rendererArcade = null;
  let rendererBabylon = null, babylonRequest = 0;
  let graphicsMode = '2d';
  renderer.camera = getSetting('matchCamera');
  renderer.autoZoom = getSetting('matchAutoZoom');
  renderer.showStamina = getSetting('matchStamina');
  renderer.pixelRatioCap = qualityOf(getSetting('graphicsQuality')).dpr;
  renderer.zoomUser = sliderValue('match2d', 'zoom') / 100;
  let lastSoundEvent = sim.events.at(-1) ?? null;
  let audioActive = gameSound.isUnlocked() && getSetting('audioEnabled') !== false;
  gameSound.setActive(audioActive);
  const state = { speed: getSetting('matchSpeed'), paused: false, acc: 0, last: performance.now(), until: null, shownEvents: 0, onlyMajor: false, seenNotes: new Set(), lastTimeout: null, ended: false, fps: 60, raf: 0, replay: null };

  // ---- placar de transmissão
  const score = [h('span', { class: 'pts' }, '0'), h('span', { class: 'pts' }, '0')];
  const clock = h('strong', null, clockText(sim.clock));
  const period = h('span', null, periodLabel(sim));
  const shot = h('span', { class: 'shotclock' }, '24');
  const timeouts = [h('span'), h('span')];
  const possession = [0, 1].map(() => h('span', { class: 'match-possession hidden', title: 'Posse de bola' }, '● POSSE'));
  const bonus = [h('span', { class: 'bonus hidden', tip: 'Em bônus: a próxima falta do adversário vale lances livres.' }, 'BÔNUS'), h('span', { class: 'bonus hidden', tip: 'Em bônus: a próxima falta do adversário vale lances livres.' }, 'BÔNUS')];
  const fouls = [0, 1].map(() => h('span', { class: 'team-fouls', tip: 'Faltas coletivas no período (a partir da 5ª, o adversário arremessa lances livres).' }));
  const ticker = h('div', { class: 'match-ticker', 'aria-live': 'polite' });
  const side = (i) =>
    h(
      'div',
      { class: ['side', i === 1 && 'away', control === i && 'mine'], style: { '--c1': infos[i].colors[0] } },
      teamLogo(infos[i].team, { size: 'md' }),
      h('span', { class: 'side-name' }, h('small', null, i === 0 ? 'Mandante' : 'Visitante', control === i ? ' · você' : ''), infos[i].name, h('span', { class: 'side-meta' }, possession[i], timeouts[i], fouls[i], bonus[i])),
      score[i],
    );

  // ---- painel lateral
  const pbp = h('div', { class: 'pbp' });
  const boxHost = h('div', null);
  const lineupHost = h('div', null);
  const statsHost = h('div', null);
  const debugHost = h('div', null);
  // Painel somente leitura. Nenhuma gravação de dados ou alteração de MatchSim.
  const broadcastStudio = createBroadcastStudio(sim);
  const tvNarrator = createBroadcastNarrator();
  const tvOverlay = createLiveBroadcastOverlay(sim, { mode: ctx.mode, onCue: cue => tvNarrator.announce(cue, { speed: state.speed }) });
  const tvShow = createBroadcastShowOverlay(sim, { context: ctx });
  let directorOn = false, directorChangedAt = -Infinity;
  let lastDirectorEvent = null;

  // ---- controles de jogo
  const playBtn = h('button', { class: 'btn primary play', onclick: togglePause });
  const speedBtns = SPEEDS.map((v) => h('button', { type: 'button', 'aria-label': `Velocidade ${speedLabel(v)}`, onclick: () => setSpeed(v) }, speedLabel(v)));
  const custom = h('input', { type: 'number', min: 0.1, max: 32, step: 0.05, value: state.speed, 'aria-label': 'Velocidade customizada', onchange: (e) => setSpeed(parseSpeed(e.target.value)) });
  const fpsLabel = h('span', { class: 'faint num' }, '60 fps');
  const tools = h('div', { class: 'match-controls match-tools hidden' });
  const layout = h('div', { class: 'match-layout evo-broadcast' });
  const soundBtn = h('button', { type: 'button', class: 'btn', 'aria-label': 'Ativar ou desativar sonoplastia', 'aria-pressed': String(audioActive), onclick: toggleSound }, audioActive ? 'Som: ligado' : 'Ativar som');
  const graphicsBtn = h('button', { type: 'button', class: 'btn', 'aria-label': 'Alternar visualização da partida', 'aria-pressed': 'false', onclick: () => setGraphicsMode(graphicsMode === '2d' ? 'arcade' : graphicsMode === 'arcade' ? '3d' : '2d') }, 'Visual: 2D');
  const replayBadge = h('span', { class: 'match-replay-badge hidden', 'aria-live': 'polite' }, 'REPLAY · lance registrado');
  const replayBtn = h('button', { type: 'button', class: 'btn', onclick: startReplay, title: 'Revê os últimos quadros gravados pelo motor no visual 3D' }, 'Replay 3D');
  const babylonBtn = h('button', { type: 'button', class: 'btn', 'aria-label': 'Ativar quadra Babylon.js local', onclick: () => setGraphicsMode(graphicsMode === 'babylon' ? '3d' : 'babylon') }, 'Babylon 3D');
  const directorBtn = h('button', { type: 'button', class: 'btn broadcast-director', 'aria-pressed': 'false', 'aria-label': 'Ativar ou desativar diretor automático de câmera 3D', onclick: () => { directorOn = !directorOn; directorBtn.setAttribute('aria-pressed', String(directorOn)); directorBtn.textContent = directorOn ? 'Diretor TV: ligado' : 'Diretor TV'; if (directorOn) directorChangedAt = -Infinity; } }, 'Diretor TV');
  function stopReplay(resume = true) {
    if (!state.replay) return;
    const wasPlaying = state.replay.wasPlaying;
    state.replay = null;
    if (renderer3d) renderer3d.sim = sim;
    replayBadge.classList.add('hidden');
    state.paused = resume && wasPlaying ? false : true;
    state.last = performance.now();
    sync();
  }
  function startReplay() {
    if (state.replay) { stopReplay(); return; }
    if (sim.replay.length < 2) { toast('Ainda não há quadros gravados para replay.', 'warn'); return; }
    if (graphicsMode !== '3d') setGraphicsMode('3d');
    if (graphicsMode !== '3d') return;
    state.replay = { frames: sim.replay.slice(-60), index: 0, acc: 0, wasPlaying: !state.paused };
    state.paused = true;
    state.until = null;
    replayBadge.classList.remove('hidden');
    sync();
  }
  function setGraphicsMode(mode, persist = true) {
    if (mode === 'babylon') { void activateBabylon(persist); return; }
    ++babylonRequest;
    babylonBtn.disabled = false;
    babylonBtn.textContent = 'Babylon 3D';
    if (mode !== '3d' && state.replay) stopReplay();
    if (mode === '3d') {
      try {
        if (renderer3d?.lost) throw Error('O contexto WebGL2 foi perdido nesta partida.');
        renderer3d ??= new MatchRenderer3D(canvas3d, sim, { quality: getSetting('graphicsQuality'), logoOf: (t) => loadTeamLogoImage(t.team) });
        renderer3d.camera = getSetting('match3dCamera');
        renderer3d.onFailure = (message) => { toast(message, 'warn'); setGraphicsMode('2d', false); };
      } catch (err) {
        console.warn('Visualização 3D indisponível:', err);
        toast('3D indisponível neste navegador; partida continua em 2D.', 'warn');
        mode = '2d';
      }
    }
    if (mode === 'arcade') {
      try {
        rendererArcade ??= new MatchRendererArcade25D(canvasArcade, sim, { quality: getSetting('graphicsQuality') });
        rendererArcade.camera = getSetting('matchArcadeCamera');
      } catch (err) {
        console.warn('Visualização arcade indisponível:', err);
        toast('Visual 2.5D indisponível; partida continua em 2D.', 'warn');
        mode = '2d';
      }
    }
    graphicsMode = mode;
    canvas.classList.toggle('hidden', mode !== '2d');
    canvas3d.classList.toggle('hidden', mode !== '3d');
    canvasArcade.classList.toggle('hidden', mode !== 'arcade');
    canvasBabylon.classList.toggle('hidden', mode !== 'babylon');
    babylonBtn.setAttribute('aria-pressed', String(mode === 'babylon'));
    graphicsBtn.textContent = mode === 'arcade' ? 'Visual: 2.5D Arcade' : mode === 'babylon' ? 'Visual: Babylon 3D' : `Visual: ${mode.toUpperCase()}`;
    graphicsBtn.setAttribute('aria-pressed', String(mode !== '2d'));
    if (persist) setSetting('matchGraphics', mode);
  }
  async function activateBabylon(persist) {
    const request = ++babylonRequest;
    babylonBtn.disabled = true;
    babylonBtn.textContent = 'Carregando Babylon…';
    try {
      const BABYLON = await loadBabylonRuntime();
      if (request !== babylonRequest) return;
      rendererBabylon ??= new MatchRendererBabylon(canvasBabylon, sim, { BABYLON, quality: getSetting('graphicsQuality') });
      if (state.replay) stopReplay();
      graphicsMode = 'babylon';
      canvas.classList.add('hidden');
      canvasArcade.classList.add('hidden');
      canvas3d.classList.add('hidden');
      canvasBabylon.classList.remove('hidden');
      graphicsBtn.textContent = 'Visual: Babylon 3D';
      graphicsBtn.setAttribute('aria-pressed', 'true');
      babylonBtn.setAttribute('aria-pressed', 'true');
      if (persist) setSetting('matchGraphics', 'babylon');
      // Modelo Blender é opcional. 404 ou loader ausente mantêm jogadores procedurais.
      if (typeof fetch === 'function') {
        void fetch('assets/models/nba-player.glb', { method: 'HEAD' })
          .then((response) => response.ok ? loadBabylonGltfLoader().then(() => rendererBabylon?.loadPlayerGLB()) : null)
          .catch((error) => console.info('GLB opcional não carregado; jogadores procedurais mantidos.', error));
      }
    } catch (error) {
      console.warn('Babylon opcional indisponível:', error);
      if (request === babylonRequest) {
        toast('Instale assets/vendor/babylon.js para ativar Babylon. Mantido visual anterior.', 'warn');
        if (getSetting('matchGraphics') === 'babylon') setSetting('matchGraphics', '2d');
      }
    } finally {
      if (request === babylonRequest) { babylonBtn.disabled = false; babylonBtn.textContent = 'Babylon 3D'; }
    }
  }
  async function toggleSound() {
    if (audioActive) {
      audioActive = false;
      setSetting('audioEnabled', false);
      gameSound.setActive(false);
    } else {
      setSetting('audioEnabled', true);
      audioActive = await gameSound.unlock();
      gameSound.setActive(audioActive);
      if (!audioActive) toast('Som indisponível ou bloqueado pelo navegador.', 'warn');
    }
    soundBtn.textContent = audioActive ? 'Som: ligado' : 'Ativar som';
    soundBtn.setAttribute('aria-pressed', String(audioActive));
  }
  const viewMode = h('button', { type: 'button', class: 'btn evo-view-button', 'aria-label': 'Alternar visual de transmissão', 'aria-pressed': 'true',
    onclick: () => { const on = layout.classList.toggle('evo-broadcast'); viewMode.setAttribute('aria-pressed', String(on)); } }, 'TV');
  const overlay = h('div', { class: 'match-overlay hidden' });
  const tvShowBtn = h('button', { type: 'button', class: 'btn', 'aria-pressed': 'true',
    'aria-label': 'Ativar ou desativar vinhetas cinematográficas de transmissão',
    onclick: () => { const active = tvShow.setEnabled(!tvShow.enabled); tvShowBtn.setAttribute('aria-pressed', String(active)); tvShowBtn.textContent = active ? 'Vinhetas: ligadas' : 'Vinhetas: desligadas'; } }, 'Vinhetas: ligadas');
  const tvNarrationBtn = h('button', { type: 'button', class: 'btn', 'aria-pressed': 'false',
    'aria-label': 'Ativar ou desativar narração automática em português',
    onclick: () => { const active = tvNarrator.setEnabled(!tvNarrator.enabled);
      if (!active && !tvNarrator.available) toast('Este navegador não oferece narração de voz.', 'warn');
      tvNarrationBtn.setAttribute('aria-pressed', String(active)); tvNarrationBtn.textContent = active ? 'Narração TV: ligada' : 'Narração TV: desligada'; } }, 'Narração TV: desligada');
  const tvIntroBtn = h('button', { type: 'button', class: 'btn',
    onclick: () => tvShow.show('pregame'), 'aria-label': 'Mostrar apresentação da partida' }, 'Apresentação TV');
  const tvOverlayBtn = h('button', { type: 'button', class: 'btn', 'aria-label': 'Mostrar ou ocultar os elementos da transmissão sobre a quadra', 'aria-pressed': 'true', onclick: () => { const active = tvOverlay.setVisible(!tvOverlay.visible); tvOverlayBtn.setAttribute('aria-pressed', String(active)); tvOverlayBtn.textContent = active ? 'Placar TV: ligado' : 'Placar TV: desligado'; } }, 'Placar TV: ligado');

  function sync() {
    mount(playBtn, icon(sim.over ? 'check' : state.paused ? 'play' : 'pause'), h('span', null, sim.over ? 'Encerrada' : state.paused ? 'Continuar' : 'Pausar'));
    playBtn.disabled = sim.over;
    speedBtns.forEach((b, i) => b.classList.toggle('active', state.speed === SPEEDS[i]));
    custom.value = state.speed;
  }
  function togglePause() {
    if (sim.over) return;
    if (state.replay) { stopReplay(false); return; }
    state.paused = !state.paused;
    state.until = null;
    sync();
  }
  function setSpeed(v) {
    state.speed = v;
    sync();
  }
  const pause = () => ((state.paused = true), (state.until = null), sync());
  const resume = () => ((state.paused = false), (state.last = performance.now()), sync());
  const stepBy = (seconds) => {
    pause();
    sim.advance(seconds);
  };
  const simUntil = (label, test) => ({ label, onClick: () => ((state.until = test.length === 0 ? test() : test), (state.paused = false), sync()) });

  // ---- comandos do técnico
  const coach = { sim, team: control, pause, resume, refresh: () => (refreshCoach(), refreshHud(true)) };
  const quick = h('div', { class: 'quick-tactics' });
  const toBtn = h('button', { class: 'btn', onclick: callTimeout });
  function refreshCoach() {
    if (control == null) return;
    const t = sim.teams[control];
    const tac = t.tactics;
    mount(toBtn, 'Tempo', h('span', { class: 'chip' }, t.timeouts));
    toBtn.disabled = t.timeouts <= 0 || sim.over;
    const toggle = (label, on, apply, tip) => h('button', { type: 'button', class: ['qt', on && 'on'], 'aria-pressed': String(on), tip, onclick: () => (say(apply()), refreshCoach()) }, label);
    const set = (key, value) => sim.setTactic(control, key, value);
    mount(
      quick,
      h('button', { type: 'button', class: 'qt', disabled: tac.pace <= -1, tip: 'Cadenciar: gastar mais o relógio de posse.', onclick: () => (say(set('pace', tac.pace - 1)), refreshCoach()) }, 'Ritmo −'),
      h('button', { type: 'button', class: 'qt', disabled: tac.pace >= 1, tip: 'Acelerar: armar e arremessar mais cedo.', onclick: () => (say(set('pace', tac.pace + 1)), refreshCoach()) }, 'Ritmo +'),
      toggle('Atacar o aro', tac.focus === 'rim', () => set('focus', tac.focus === 'rim' ? 'balanced' : 'rim'), 'Prioriza infiltrações e finalizações perto da cesta.'),
      toggle('Mais bolas de 3', tac.focus === 'three', () => set('focus', tac.focus === 'three' ? 'balanced' : 'three'), 'Prioriza o arremesso de fora.'),
      toggle('Fechar o garrafão', tac.paint === 1, () => set('paint', tac.paint ? 0 : 1), 'A ajuda afunda mais; sobra arremesso de três para o adversário.'),
      toggle('Trocar tudo', t.coverage === 'switch', () => set('coverage', t.coverage === 'switch' ? 'drop' : 'switch'), 'Troca de marcação em todo bloqueio (desligado: drop).'),
      toggle('Pressionar a bola', tac.pressure === 1, () => set('pressure', tac.pressure ? 0 : 1), 'Marcador colado no condutor: mais roubos e faltas, mais chance de ser batido.'),
    );
  }
  const say = (text) => text && toast(text);
  function callTimeout() {
    const result = sim.callTimeout(control);
    if (result === 'queued') toast('Tempo pedido: sai na próxima bola parada.');
    else if (result === 'none') toast('Sem tempos restantes.', 'warn');
    refreshCoach();
  }

  // ---- atualização do HUD
  let lastScore = '';
  function refreshHud(force = false) {
    for (const i of [0, 1]) {
      if (score[i].textContent !== String(sim.score[i])) {
        score[i].textContent = sim.score[i];
        score[i].classList.remove('bump');
        void score[i].offsetWidth; // reinicia a animação do placar
        score[i].classList.add('bump');
      }
      mount(timeouts[i], pips(sim.teams[i].timeouts, 7));
      possession[i].classList.toggle('hidden', sim.offense !== i || sim.over);
      const committed = sim.teamFouls[i];
      fouls[i].textContent = `F ${committed}`;
      bonus[i].classList.toggle('hidden', sim.teamFouls[1 - i] < 5 || sim.sandbox);
    }
    clock.textContent = clockText(sim.clock);
    period.textContent = periodLabel(sim);
    shot.textContent = Math.max(0, Math.ceil(sim.shotClock));
    shot.classList.toggle('low', sim.shotClock <= 5 && sim.state === 'play');
    // lance a lance
    const evs = sim.events;
    broadcastStudio.refresh(force);
    tvOverlay.refresh(force);
    tvShow.refresh();
    if (force || evs.length !== state.shownEvents) {
      state.shownEvents = evs.length;
      const list = (state.onlyMajor ? evs.filter((e) => e.major) : evs).slice(-70).reverse();
      mount(pbp, list.length ? list.map((e) => h('div', { class: ['ev', e.major && 'major'] }, h('span', { class: 'when' }, `${e.q}Q ${clockText(e.clock)}`), h('span', null, e.team >= 0 ? h('strong', { style: { color: 'var(--text-secondary)' } }, `${sim.teams[e.team].name}: `) : null, e.text))) : emptyState('A partida vai começar', 'Os lances aparecem aqui em tempo real.'));
    }
    // destaques: cada nota aparece uma vez, por alguns segundos
    const key = `${sim.score[0]}-${sim.score[1]}-${sim.teamFouls.join('-')}`;
    if (key !== lastScore && getSetting('matchNotes') && !sim.sandbox) {
      lastScore = key;
      for (const note of matchNotes(sim)) {
        if (state.seenNotes.has(note.key)) continue;
        state.seenNotes.add(note.key);
        const el = h('span', { class: ['note-chip', note.tone], style: { '--c1': infos[note.team].colors[0] } }, note.text);
        ticker.prepend(el);
        setTimeout(() => el.remove(), 9000);
        while (ticker.children.length > 3) ticker.lastChild.remove();
      }
    }
  }

  function renderBox() {
    const box = sim.boxScore();
    mount(
      boxHost,
      box.map((t) =>
        h(
          'div',
          { class: 'box-team' },
          h('h3', null, t.team),
          h(
            'div',
            { class: 'table-wrap' },
            h(
              'table',
              { class: 'data box' },
              h('thead', null, h('tr', null, ['Jogador', 'MIN', 'PTS', 'REB', 'AST', 'ROB', 'TOC', 'FG', '3P', 'LL', 'ERR', 'F'].map((x, i) => h('th', { class: i ? 'num' : '' }, x)))),
              h('tbody', null, t.rows.map((r) => h('tr', { class: r.onCourt && 'on-court' }, h('td', null, r.onCourt ? h('i', { class: 'court-dot', tip: 'Em quadra' }) : null, r.name), ...[r.min.toFixed(0), r.pts, r.reb, r.ast, r.stl, r.blk, `${r.fgm}/${r.fga}`, `${r.tpm}/${r.tpa}`, `${r.ftm}/${r.fta}`, r.tov, r.pf].map((v, i) => h('td', { class: ['num', i === 1 && 'strong'] }, v))))),
              h('tfoot', null, h('tr', null, h('td', null, 'Total'), ...['', t.total.pts, t.total.reb, t.total.ast, t.total.stl, t.total.blk, `${t.total.fgm}/${t.total.fga}`, `${t.total.tpm}/${t.total.tpa}`, `${t.total.ftm}/${t.total.fta}`, t.total.tov, t.total.pf].map((v) => h('td', { class: 'num' }, v)))),
            ),
          ),
        ),
      ),
    );
  }

  function renderLineups() {
    const POS = ['PG', 'SG', 'SF', 'PF', 'C'];
    const row = (p, label) =>
      h(
        'div',
        { class: ['lineup-row', p.fouledOut && 'out'] },
        h('span', { class: 'micro faint pos-tag' }, label),
        playerAvatar(p.data, { size: 'xs', color: infos[p.team].colors[0] }),
        h('span', { class: 'grow name' }, p.short),
        h('span', { class: 'energy', tip: `Energia ${(p.energy * 100).toFixed(0)}%` }, h('i', { class: p.energy > 0.7 ? 'ok' : p.energy > 0.5 ? 'mid' : 'low', style: { width: `${Math.round(p.energy * 100)}%` } })),
        h('span', { class: ['num small', p.stats.pf >= 4 && 'warn'], tip: 'Faltas' }, `${p.stats.pf}F`),
        h('span', { class: 'num small strong', tip: 'Pontos' }, p.stats.pts),
      );
    mount(
      lineupHost,
      sim.teams.map((t) => {
        const bench = t.all.filter((p) => !t.lineup.includes(p));
        return h('div', { class: 'box-team' }, h('h3', null, t.name, control === t.index ? ' · você' : ''), t.lineup.map((p, i) => row(p, POS[i] ?? '')), bench.length ? h('div', { class: 'micro faint bench-title' }, 'Banco') : null, bench.map((p) => row(p, p.data.positions?.[0] ?? '')));
      }),
    );
  }

  function renderStats() {
    const periods = periodScores(sim);
    const rows = teamComparison(sim);
    const num = (v) => (typeof v === 'number' ? v : Number(String(v).split('/')[0]));
    mount(
      statsHost,
      h(
        'table',
        { class: 'data box' },
        h('thead', null, h('tr', null, h('th', null, 'Período'), periods[0].map((_, i) => h('th', { class: 'num' }, i < 4 ? `${i + 1}º` : `P${i - 3}`)), h('th', { class: 'num' }, 'Total'))),
        h('tbody', null, sim.teams.map((t, i) => h('tr', null, h('td', null, t.name), periods[i].map((v) => h('td', { class: 'num' }, v)), h('td', { class: 'num strong' }, sim.score[i])))),
      ),
      h(
        'div',
        { class: 'cmp', style: { marginTop: '12px' } },
        rows.map((r) => {
          const [a, b] = r.values.map(num);
          const total = a + b || 1;
          return h('div', { class: 'stat-duel' }, h('span', { class: ['num', a > b && 'strong'] }, `${r.values[0]}${r.unit}`), h('span', { class: 'duel-mid' }, h('span', { class: 'micro faint' }, r.label), h('span', { class: 'duel-bar' }, h('i', { style: { width: `${(a / total) * 100}%`, background: infos[0].colors[0] } }), h('i', { style: { width: `${(b / total) * 100}%`, background: infos[1].colors[0] } }))), h('span', { class: ['num', b > a && 'strong'] }, `${r.values[1]}${r.unit}`));
        }),
      ),
    );
  }

  function renderDebug() {
    const p = sim.ball.owner ?? sim.lastShot?.shooter;
    const m = sim.metrics;
    const d = p?.debug;
    const s = d?.shot;
    const lines = [];
    if (p) {
      const on = sim.defenderOf(p);
      lines.push(`${p.name} — ${p.archetype}`);
      lines.push(`Ação: ${d?.action ?? p.act.type}   (decisão ${d?.score?.toFixed(2) ?? '—'})`);
      if (s) lines.push(`Arremesso: ${s.type} · qualidade ${s.quality} · contest ${(s.contest * 100).toFixed(0)}% (${CONTEST_LEVELS[s.level]}) · chance ${(s.pMake * 100).toFixed(0)}%`);
      lines.push(`Velocidade: ${Math.hypot(p.vx, p.vy).toFixed(1)} de ${p.prof.move.maxSpeed.toFixed(1)} pés/s · energia ${(p.energy * 100).toFixed(0)}%`);
      lines.push(`Alvo: (${p.tx.toFixed(0)}, ${p.ty.toFixed(0)}) · espaço: ${p.slot}`);
      if (on) lines.push(`Marcador: ${on.name} [${on.state}] a ${Math.hypot(on.x - p.x, on.y - p.y).toFixed(1)} pés · reação ${on.prof.def.reaction.toFixed(2)} s`);
      if (d?.options) lines.push('', 'Opções avaliadas:', ...d.options.map((o) => `  ${o.s >= 0 ? '+' : ''}${o.s.toFixed(2)}  ${o.k}`));
    }
    lines.push('', `Semente: ${sim.seed} · t = ${sim.t.toFixed(2)} s`);
    lines.push(`Sliders: ${Object.entries(sim.sl).filter(([, v]) => v !== 1).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(' · ') || 'padrão'}`);
    lines.push(`Cobertura PnR: ${sim.teams[0].name} ${sim.teams[0].coverage} · ${sim.teams[1].name} ${sim.teams[1].coverage}`);
    lines.push(`Arremessos livres: ${m.shots ? ((m.openShots / m.shots) * 100).toFixed(0) : 0}% · qualidade média ${m.shots ? (m.qualitySum / m.shots).toFixed(0) : '—'}`);
    lines.push(`Espaçamento médio: ${m.spacingN ? (m.spacingSum / m.spacingN).toFixed(1) : '—'} pés · toques no garrafão: ${m.paintTouches}`);
    lines.push(`Drives ${m.drives} · dribles ${m.moves} · bloqueios ${m.screens} (contato ${m.screenHits}) · cortes ${m.cuts} · passes ${m.passes}`);
    lines.push(`Erros de passe ${m.badPassTO} · pontos de transição ${m.fastBreakPts} · decisões ${m.decisions}`);
    lines.push(`Desenho: ${state.fps.toFixed(0)} quadros/s`);
    mount(debugHost, h('pre', { class: 'log', style: { maxHeight: '520px' } }, lines.join('\n')));
  }

  // ---- fim de jogo
  function finish() {
    state.ended = true;
    sync();
    refreshHud(true);
    refreshCoach();
    if (sim.sandbox) return;
    const record = buildGameRecord(sim, { userTeam: control });
    let saved = false;
    if (ctx.isolated) ctx.onArcadeFinish?.(record);
    else if (ctx.onFinish) ctx.onFinish(record);
    else if (hasWorld()) {
      addGame(record);
      saved = true;
    }
    const winner = sim.score[0] > sim.score[1] ? 0 : 1;
    const tops = topScorers(record);
    overlay.classList.remove('hidden');
    mount(
      overlay,
      h(
        'div',
        { class: 'final-card', style: { '--c1': infos[winner].colors[0] } },
        h('span', { class: 'micro' }, sim.quarter > 4 ? `Final · ${sim.quarter - 4} prorrogação(ões)` : 'Final'),
        h('div', { class: 'final-score' }, teamLogo(infos[0].team, { size: 'md' }), h('span', { class: ['display', winner === 0 && 'win'] }, sim.score[0]), h('span', { class: 'faint' }, '×'), h('span', { class: ['display', winner === 1 && 'win'] }, sim.score[1]), teamLogo(infos[1].team, { size: 'md' })),
        h('p', { class: 'muted' }, control == null ? `${infos[winner].fullName} vence.` : winner === control ? `Vitória do seu ${infos[control].name}!` : `Derrota para o ${infos[winner].name}.`),
        h('div', { class: 'final-tops' }, tops.map((p, i) => (p ? h('div', { class: 'row' }, playerAvatar(sim.teams[i].all.find((x) => x.id === p.id)?.data, { size: 'md', color: infos[i].colors[0] }), h('div', null, h('strong', null, p.name), h('div', { class: 'muted small' }, `${p.pts} pts · ${p.orb + p.drb} reb · ${p.ast} ast`))) : null))),
        ctx.isolated ? h('p', { class:'faint small' }, 'Modo avulso: placar e box score não foram gravados em nenhuma carreira.') : null,
        saved ? h('p', { class: 'faint small' }, 'Amistoso gravado no histórico da carreira. Não altera campanha nem estatísticas da temporada.') : null,
        ctx.onFinish ? h('p', { class: 'faint small' }, 'Resultado registrado na temporada: campanha, classificação e estatísticas atualizadas. Avance o dia para os outros jogos da rodada.') : null,
        h('div', { class: 'row', style: { justifyContent: 'center' } }, h('button', { class: 'btn primary', onclick: ctx.onNew }, ctx.onFinish ? 'Voltar à Central' : 'Novo jogo'), h('button', { class: 'btn', onclick: () => overlay.classList.add('hidden') }, 'Ver quadra e box score')),
      ),
    );
  }

  // ---- laço de desenho (a simulação avança em passos fixos; o desenho só lê)
  let hudTick = 0;
  let fpsAcc = 0;
  let fpsN = 0;
  function frame(now) {
    if (!canvas.isConnected) return cleanup();
    const real = Math.min(0.1, (now - state.last) / 1000);
    state.last = now;
    fpsAcc += real;
    if (++fpsN >= 30) {
      state.fps = fpsN / (fpsAcc || 1);
      fpsLabel.textContent = `${state.fps.toFixed(0)} fps`;
      fpsAcc = fpsN = 0;
    }
    if (!state.paused && !sim.over) {
      if (state.until) {
        // simulação rápida: muitos passos por quadro, com orçamento de tempo para não travar a tela
        const t0 = performance.now();
        while (!sim.over && !state.until(sim) && performance.now() - t0 < 12) sim.step();
        if (sim.over || state.until(sim)) {
          state.until = null;
          state.paused = !sim.over;
          sync();
        }
      } else {
        state.acc += real * state.speed;
        let guard = 0;
        while (state.acc >= TUNE.DT && guard++ < 60) {
          sim.step();
          state.acc -= TUNE.DT;
        }
        if (guard >= 60) state.acc = 0;
      }
    }
    // tempo concedido ao time do usuário: pausa e abre o painel do técnico
    if (sim.timeout && sim.timeout !== state.lastTimeout) {
      state.lastTimeout = sim.timeout;
      refreshCoach();
      if (sim.timeout.team === control && !sim.over) {
        pause();
        openTimeout(coach);
      }
    }
    if (audioActive && !state.paused && !state.until && !sim.over) {
      gameSound.courtTick({ ballHeld: sim.ball?.state === 'held', moving: sim.state === 'play', speed: state.speed });
    }
    // Reproduz apenas eventos novos, evitando tempestade de áudio em simulação acelerada.
    if (hudTick % 6 === 0) {
      const newEvents = sim.events;
      const previousIndex = lastSoundEvent ? newEvents.indexOf(lastSoundEvent) : -1;
      if (audioActive && !state.until) {
        const unseen = newEvents.slice(previousIndex < 0 ? -2 : previousIndex + 1).slice(-3);
        for (const event of unseen) gameSound.playBasketballEvent(event, { speed: state.speed });
      }
      lastSoundEvent = newEvents.at(-1) ?? lastSoundEvent;
    }
    if (sim.over && !state.ended) finish();
    if (graphicsMode === '3d') {
      if (state.replay) {
        const replay = state.replay;
        replay.acc += real;
        while (replay.acc >= 0.14 && replay.index < replay.frames.length - 1) { replay.acc -= 0.14; replay.index++; }
        renderer3d.sim = replayProjection(sim, replay.frames[replay.index], replay.frames[Math.max(0, replay.index - 1)]);
        if (replay.index === replay.frames.length - 1 && replay.acc >= 0.14) stopReplay();
      }
      if (directorOn && !state.replay) {
        const latest = sim.events.at(-1);
        if (latest !== lastDirectorEvent) {
          lastDirectorEvent = latest;
          const recommended = recommendBroadcastCamera(broadcastSnapshot(sim), { previous: renderer3d.camera, previousChange: directorChangedAt, time: sim.t });
          if (recommended !== renderer3d.camera) { renderer3d.camera = recommended; directorChangedAt = sim.t; }
        }
      }
      try { renderer3d.draw(real); }
      catch (err) { console.warn('Falha ao desenhar 3D:', err); toast('Falha no 3D; partida continua em 2D.', 'warn'); setGraphicsMode('2d', false); }
    }
    if (graphicsMode === 'babylon') {
      try {
        if (directorOn && !state.replay) rendererBabylon.camera = recommendBroadcastCamera(broadcastSnapshot(sim), { previous: rendererBabylon.camera, previousChange: directorChangedAt, time: sim.t });
        rendererBabylon.draw(real);
      } catch (err) { console.warn('Babylon perdeu a renderização:', err); toast('Babylon indisponível; retomando WebGL2/2D.', 'warn'); setGraphicsMode('3d', false); }
    }
    if (graphicsMode === 'arcade') rendererArcade.draw(real);
    if (graphicsMode === '2d') renderer.draw(real);
    if (++hudTick % 6 === 0) {
      refreshHud();
      if (hudTick % 30 === 0) {
        if (boxHost.isConnected) renderBox();
        if (lineupHost.isConnected) renderLineups();
        if (statsHost.isConnected) renderStats();
        if (debugHost.isConnected) renderDebug();
        if (control != null) toBtn.disabled = sim.teams[control].timeouts <= 0 || sim.over;
      }
    }
    state.raf = requestAnimationFrame(frame);
  }

  // ---- atalhos da partida (têm prioridade sobre os atalhos globais enquanto a quadra está na tela)
  function onKey(e) {
    if (!canvas.isConnected) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea, select, .modal, .drawer, .palette')) return;
    const speedIndex = ['1', '2', '3', '4'].indexOf(e.key);
    if (e.key === ' ') togglePause();
    else if (speedIndex >= 0) setSpeed(HOTKEY_SPEEDS[speedIndex]);
    else if (e.key.toLowerCase() === 't' && control != null) callTimeout();
    else if (e.key.toLowerCase() === 'b' && control != null) openSubstitutions(coach);
    else if (e.key.toLowerCase() === 'x' && control != null) openTactics(coach);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }
  document.addEventListener('keydown', onKey, true);
  function cleanup() {
    cancelAnimationFrame(state.raf);
    document.removeEventListener('keydown', onKey, true);
    gameSound.setActive(false);
    renderer3d?.dispose();
    rendererArcade?.dispose();
    ++babylonRequest;
    rendererBabylon?.dispose();
    tvOverlay.dispose();
    tvShow.dispose();
    tvNarrator.dispose();
  }

  mount(
    tools,
    h('span', { class: 'micro faint' }, 'Ferramentas'),
    h('button', { class: 'btn small', onclick: () => stepBy(TUNE.DT), tip: 'Avança um único passo de simulação.' }, 'Passo 1 quadro'),
    h('button', { class: 'btn small', onclick: () => stepBy(0.1) }, 'Passo 100 ms'),
    h('label', { class: 'check' }, 'Velocidade', custom),
    h('span', { class: 'sep' }),
    h('label', { class: 'check' }, 'Zoom', h('input', { type: 'range', min: 0.7, max: 2, step: 0.05, value: renderer.zoomUser, style: { width: '90px' }, oninput: (e) => (renderer.zoomUser = Number(e.target.value)) })),
    h('label', { class: 'check', tip: 'Fecha o enquadramento em meia quadra e abre na transição.' }, h('input', { type: 'checkbox', checked: renderer.autoZoom, onchange: (e) => (renderer.autoZoom = e.target.checked) }), 'Zoom automático'),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: renderer.showStamina, onchange: (e) => (renderer.showStamina = e.target.checked) }), 'Energia'),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: renderer.opt.popups, onchange: (e) => renderer.setOptions({ popups: e.target.checked }) }), 'Avisos de lance'),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: (e) => (renderer.debug = e.target.checked) }), 'Debug visual'),
    h('span', { class: 'grow' }),
    fpsLabel,
  );

  const cameraMenu = menuButton(() => graphicsMode === 'babylon'
    ? [{ heading: 'Câmera Babylon 3D' }, ...BABYLON_CAMERAS.map(([id, label]) => ({ label, checked: rendererBabylon?.camera === id, onClick: () => { if (rendererBabylon) rendererBabylon.camera = id; } }))]
    : graphicsMode === '3d'
    ? [{ heading: 'Câmera 3D' }, ...CAMERAS_3D.map(([id, label]) => ({ label, checked: renderer3d?.camera === id, onClick: () => { renderer3d.camera = id; setSetting('match3dCamera', id); } }))]
    : graphicsMode === 'arcade'
      ? [{ heading: 'Câmera 2.5D Arcade' }, ...ARCADE25D_CAMERAS.map(([id, label]) => ({ label, checked: rendererArcade?.camera === id, onClick: () => { rendererArcade.camera = id; setSetting('matchArcadeCamera', id); } }))]
      : [{ heading: 'Câmera 2D' }, ...CAMERAS.map((c) => ({ label: c.label, checked: renderer.camera === c.id, onClick: () => (renderer.camera = c.id) }))], { label: 'Câmera', iconName: 'eye', cls: 'btn', align: 'left' });
  const qualityMenu = menuButton(() => [{ heading: 'Qualidade gráfica' }, ...Object.keys(GRAPHICS_QUALITY).map((id) => ({ label: { low: 'Baixa', medium: 'Média', high: 'Alta' }[id], checked: getSetting('graphicsQuality') === id, onClick: () => { setSetting('graphicsQuality', id); renderer.pixelRatioCap = qualityOf(id).dpr; renderer3d?.setQuality(id); rendererArcade?.setQuality(id); rendererBabylon?.setQuality(id); } }))], { label: 'Qualidade', cls: 'btn', align: 'left' });

  mount(
    layout,
    h(
      'div',
      { class: 'match-stage' },
      h('div', { class: 'scoreboard', 'aria-label': 'Placar da partida' }, side(0), h('div', { class: 'clock' }, period, clock, h('div', { class: 'shot-wrap', tip: 'Relógio de posse' }, shot)), side(1)),
      h('div', { class: 'court-wrap' }, canvas, canvasArcade, canvas3d, canvasBabylon, tvOverlay.root, tvShow.root, replayBadge, ticker, overlay),
      control == null
        ? null
        : h(
            'div',
            { class: 'match-controls coach-bar' },
            h('span', { class: 'micro coach-label' }, 'Técnico'),
            toBtn,
            h('button', { class: 'btn', onclick: () => openSubstitutions(coach), tip: 'Substituições  (B)' }, icon('roster'), 'Substituições'),
            h('button', { class: 'btn', onclick: () => openTactics(coach), tip: 'Táticas  (X)' }, icon('tactics'), 'Táticas'),
            h('span', { class: 'sep' }),
            quick,
          ),
      h(
        'div',
        { class: 'match-controls' },
        playBtn,
        h('div', { class: 'segmented', role: 'group', 'aria-label': 'Velocidade da partida' }, speedBtns),
        sim.sandbox
          ? h('button', { class: 'btn', onclick: ctx.onRestart, tip: 'Recomeça a mesma posse com a mesma semente.' }, 'Repetir posse')
          : menuButton(
              [
                { heading: 'Simular até…' },
                simUntil('A próxima bola parada', (s) => s.state !== 'play'),
                simUntil('O fim do quarto', () => {
                  const q = sim.quarter;
                  return (s) => s.quarter !== q;
                }),
                simUntil('Os 2 minutos finais', (s) => s.quarter >= 4 && s.clock <= 120),
                simUntil('O jogo ficar apertado', (s) => s.quarter >= 4 && Math.abs(s.score[0] - s.score[1]) <= 5),
                simUntil('O fim do jogo', (s) => s.over),
              ],
              { label: 'Simular até…', iconName: 'forward', cls: 'btn', align: 'left' },
            ),
        cameraMenu,
        graphicsBtn,
        replayBtn,
        directorBtn,
        babylonBtn,
        tvOverlayBtn,
        tvShowBtn,
        tvIntroBtn,
        tvNarrationBtn,
        qualityMenu,
        viewMode,
        soundBtn,
        h('button', { class: 'btn ghost', type: 'button', 'aria-label': 'Expandir a quadra em tela cheia',
          onclick: () => { const stage = layout.querySelector('.match-stage');
            if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
            else stage?.requestFullscreen?.().catch(() => toast('Tela cheia indisponível neste navegador.', 'warn')); } }, 'Tela cheia'),
        h('span', { class: 'grow' }),
        chip(ctx.mode === 'sandbox' ? 'Sandbox' : ctx.mode === 'spectator' ? 'Espectador' : ctx.mode === 'official' ? 'Jogo oficial' : 'Amistoso', ctx.mode === 'official' ? 'good' : 'info'),
        h('button', { class: 'btn ghost', onclick: confirmNew }, ctx.mode === 'official' ? 'Sair' : 'Nova partida'),
        h('button', { class: 'btn icon ghost', 'aria-label': 'Ferramentas: passo a passo, zoom e debug', tip: 'Passo a passo, zoom e debug', onclick: () => tools.classList.toggle('hidden') }, icon('settings')),
        h('button', { class: 'btn icon ghost', 'aria-label': 'Mostrar ou ocultar o painel lateral', tip: 'Painel lateral', onclick: () => layout.classList.toggle('side-closed') }, icon('panel')),
      ),
      tools,
    ),
    h(
      'aside',
      { class: 'card match-side' },
      tabView(
        [
          { id: 'broadcast', label: 'TV e análise', render: () => (broadcastStudio.refresh(true), broadcastStudio.root) },
          { id: 'pbp', label: 'Lances', render: () => h('div', null, h('label', { class: 'check small', style: { marginBottom: '8px' } }, h('input', { type: 'checkbox', onchange: (e) => ((state.onlyMajor = e.target.checked), refreshHud(true)) }), 'Só lances principais'), pbp) },
          { id: 'box', label: 'Box score', render: () => (renderBox(), boxHost) },
          { id: 'lineups', label: 'Quintetos', render: () => (renderLineups(), lineupHost) },
          { id: 'stats', label: 'Estatísticas', render: () => (renderStats(), statsHost) },
          { id: 'debug', label: 'Debug', render: () => (renderDebug(), debugHost) },
        ],
        {},
      ),
    ),
  );

  function confirmNew() {
    if (sim.over || sim.sandbox) return ctx.onNew();
    pause();
    modal((close) => [
      h('h2', null, 'Abandonar a partida?'),
      h('p', { class: 'muted' }, ctx.mode === 'official' ? 'O jogo oficial continua agendado para hoje: você pode jogá-lo de novo ou deixar a simulação rápida resolver ao avançar o dia.' : 'A partida em andamento será descartada. Partidas só são gravadas quando terminam.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => (close(), resume()) }, 'Continuar jogando'), h('button', { class: 'btn danger', onclick: () => (close(), ctx.onNew()) }, 'Abandonar')),
    ]);
  }

  mount(root, layout);
  if (['3d', 'arcade', 'babylon'].includes(getSetting('matchGraphics'))) setGraphicsMode(getSetting('matchGraphics'), false);
  state.raf = requestAnimationFrame(frame);
  window.__match = { sim, renderer, get renderer3d() { return renderer3d; }, get rendererArcade() { return rendererArcade; }, get rendererBabylon() { return rendererBabylon; }, state }; // inspeção pelo console durante o desenvolvimento
  sync();
  refreshHud(true);
  refreshCoach();
  return cleanup;
}
