// Configurações pequenas do aplicativo (LocalStorage). Dados de carreira vão para o IndexedDB.
const KEY = 'num-settings';

const DEFAULTS = {
  autosave: true,
  autosaveDelayMs: 4000,
  lastSaveId: null,
  units: 'metric', // 'metric' | 'imperial'
  playersPageSize: 50,
  devMode: false,
  // ---- preferências de interface
  sidebarCollapsed: false,
  navClosedGroups: [], // grupos do menu recolhidos pelo usuário
  density: 'normal', // 'compact' | 'normal' | 'comfortable'
  fontSize: 'normal', // 'normal' | 'large'
  teamAccent: true, // cor da franquia nos destaques
  animations: true,
  rosterColumns: null, // colunas opcionais escolhidas no elenco (null = padrão)
  tableState: {}, // ordenação por tabela
  // ---- sliders (ver core/sliders.js) e partida 2D
  sliders: {},
  matchCamera: 'dynamic',
  matchGraphics: '2d', // '2d' | 'arcade' | '3d'; preferência local, fora do save
  match3dCamera: 'broadcast',
  matchArcadeCamera: 'broadcast',
  graphicsQuality: 'medium', // 'low' | 'medium' | 'high'
  matchSpeed: 1,
  matchAutoZoom: true,
  matchPopups: true,
  matchTrail: true,
  matchNames: true,
  matchStamina: true,
  matchNotes: true, // destaques (sequências, double-double...)
  // Sonoplastia gerada localmente (fora do save da carreira)
  audioEnabled: true,
  audioMaster: 0.65,
  audioCourt: 0.8,
  audioArena: 0.45,
  matchQuarter: 12, // minutos por quarto no jogo rápido
  saveToasts: false, // aviso a cada autosave (o indicador da barra superior sempre aparece)
  checkpoints: true, // cópia de segurança antes de eventos importantes
  reduceMotion: false,
  highContrast: false,
};

/** Reflete as preferências visuais no <html>, onde o CSS (tokens.css) as lê. */
export function applyUiPreferences() {
  const s = read();
  const root = document.documentElement;
  root.dataset.density = s.density;
  root.dataset.font = s.fontSize;
  root.dataset.motion = s.animations && !s.reduceMotion ? 'on' : 'off';
  root.dataset.contrast = s.highContrast ? 'high' : 'normal';
  const sl = s.sliders ?? {};
  root.style.setProperty('--ui-scale', String((sl.visual?.uiScale ?? 100) / 100));
  root.style.setProperty('--hud-scale', String((sl.match2d?.hudScale ?? 100) / 100));
  root.dataset.accent = s.teamAccent ? 'team' : 'brand';
}

let cache = null;

function read() {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

export const getSettings = () => ({ ...read() });
export const getSetting = (key) => read()[key];

export function setSetting(key, value) {
  read()[key] = value;
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch (err) {
    console.warn('Não foi possível gravar as configurações', err);
  }
}

export function resetSettings() {
  cache = { ...DEFAULTS };
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* sem storage disponível */
  }
}
