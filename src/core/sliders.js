// Sistema central de sliders. Toda personalização numérica do jogo é declarada aqui:
// a tela de Configurações, o assistente de carreira e o motor leem desta lista.
// Valores são percentuais inteiros (100 = padrão), gravados em settings.sliders[grupo][chave].
// Os de dificuldade pertencem à carreira (career.modifiers) e não ficam aqui.
import { getSetting, setSetting } from './settings.js';

const pct = (key, label, tip, { min = 50, max = 150, step = 5, def = 100 } = {}) => ({ key, label, tip, min, max, step, default: def, unit: '%' });

export const SLIDER_GROUPS = [
  {
    id: 'simulation',
    label: 'Simulação',
    description: 'Calibração estatística do motor de partida. 100% é o padrão calibrado contra médias da NBA. Os sliders deslocam tendências; cada lance continua nascendo de posição, atributos e decisão.',
    sliders: [
      pct('pace', 'Ritmo', 'Quanto tempo os ataques levam para se armar e iniciar a ação. Mais alto = mais posses por jogo.'),
      pct('shots', 'Frequência de arremessos', 'Disposição geral para aceitar um arremesso mais cedo no relógio de posse, em vez de continuar trabalhando a jogada.'),
      pct('three', 'Bolas de três', 'Atratividade do arremesso de três na leitura dos jogadores. Não muda o aproveitamento, só o volume.'),
      pct('mid', 'Meia distância', 'Atratividade do arremesso de dois fora do garrafão.'),
      pct('rim', 'Ataque ao aro', 'Disposição para infiltrar e finalizar perto da cesta. Mais infiltrações geram mais faltas e mais ajudas defensivas.'),
      pct('turnovers', 'Erros', 'Aumenta ou reduz a probabilidade global de erros sem eliminar a influência de passe, pressão e controle de bola.'),
      pct('fouls', 'Faltas', 'Frequência de faltas no arremesso e na tentativa de roubo. Disciplina do defensor e habilidade de cavar falta continuam valendo.'),
      pct('oreb', 'Rebotes ofensivos', 'Peso do time atacante na disputa do rebote. Posição, alcance e box out continuam decidindo cada bola.'),
      pct('steals', 'Roubos', 'Chance de interceptar passes e tirar a bola no drible, sempre condicionada a estar na linha do passe ou colado no condutor.'),
      pct('blocks', 'Tocos', 'Chance de um contest forte virar toco. Depende do alcance e do tempo do defensor.'),
    ],
    presets: [
      { id: 'casual', label: 'Casual', description: 'Jogo mais solto: mais pontos, menos erros e menos faltas.', values: { pace: 105, shots: 105, three: 110, turnovers: 80, fouls: 85, steals: 90 } },
      { id: 'simulation', label: 'Simulação', description: 'Calibração padrão, próxima das médias reais.', values: {} },
      { id: 'hardcore', label: 'Hardcore', description: 'Jogo mais físico e truncado: mais erros, faltas e defesa.', values: { pace: 95, turnovers: 115, fouls: 115, steals: 110, blocks: 110, three: 95 } },
    ],
  },
  {
    id: 'match2d',
    label: 'Partida 2D',
    description: 'Como a partida é desenhada. Nada aqui altera o resultado.',
    sliders: [
      pct('markerScale', 'Tamanho dos jogadores', 'Tamanho do marcador de cada jogador em quadra.', { min: 60, max: 160 }),
      pct('photoScale', 'Tamanho da foto no marcador', 'Aproxima ou afasta o rosto dentro do marcador.', { min: 80, max: 140 }),
      pct('ballScale', 'Tamanho da bola', 'Bola maior é mais fácil de acompanhar em telas pequenas ou em velocidade alta.', { min: 60, max: 220, step: 10 }),
      pct('smoothing', 'Suavização da câmera', 'Mais alto = câmera mais lenta e estável; mais baixo = acompanha a bola de perto.', { min: 40, max: 250, step: 10 }),
      pct('zoom', 'Zoom inicial', 'Aproximação da câmera ao começar a partida. Pode ser ajustada durante o jogo.', { min: 70, max: 200, step: 5 }),
      pct('hudScale', 'Tamanho do placar', 'Escala do placar de transmissão sobre a quadra.', { min: 80, max: 140 }),
    ],
    presets: [],
  },
  {
    id: 'visual',
    label: 'Interface',
    description: 'Escala geral das telas.',
    sliders: [pct('uiScale', 'Escala da interface', 'Aumenta ou diminui tudo: textos, tabelas e botões. Útil em monitores muito grandes ou pequenos.', { min: 85, max: 125 })],
    presets: [],
  },
];

export const SLIDER_GROUP_BY_ID = Object.fromEntries(SLIDER_GROUPS.map((g) => [g.id, g]));

export const defaultsOf = (groupId) => Object.fromEntries(SLIDER_GROUP_BY_ID[groupId].sliders.map((s) => [s.key, s.default]));

const clampTo = (def, value) => {
  const v = Number(value);
  if (!Number.isFinite(v)) return def.default;
  return Math.min(def.max, Math.max(def.min, Math.round(v / def.step) * def.step));
};

/** Valores atuais de um grupo, sempre completos e dentro da faixa (settings antigos ou corrompidos não quebram). */
export function sliderValues(groupId, stored = getSetting('sliders')) {
  const saved = stored?.[groupId] ?? {};
  return Object.fromEntries(SLIDER_GROUP_BY_ID[groupId].sliders.map((s) => [s.key, clampTo(s, saved[s.key] ?? s.default)]));
}

export const sliderValue = (groupId, key) => sliderValues(groupId)[key];

export function setSlider(groupId, key, value) {
  const def = SLIDER_GROUP_BY_ID[groupId].sliders.find((s) => s.key === key);
  if (!def) return;
  const all = { ...(getSetting('sliders') ?? {}) };
  all[groupId] = { ...sliderValues(groupId, all), [key]: clampTo(def, value) };
  setSetting('sliders', all);
}

export function resetSliders(groupId) {
  const all = { ...(getSetting('sliders') ?? {}) };
  delete all[groupId];
  setSetting('sliders', all);
}

export function applyPreset(groupId, presetId) {
  const preset = SLIDER_GROUP_BY_ID[groupId].presets.find((p) => p.id === presetId);
  if (!preset) return;
  const all = { ...(getSetting('sliders') ?? {}) };
  all[groupId] = { ...defaultsOf(groupId), ...preset.values };
  setSetting('sliders', all);
}

/** Preset que corresponde exatamente aos valores atuais, ou 'custom'. */
export function activePreset(groupId, values = sliderValues(groupId)) {
  const base = defaultsOf(groupId);
  for (const preset of SLIDER_GROUP_BY_ID[groupId].presets) {
    const target = { ...base, ...preset.values };
    if (Object.keys(target).every((k) => target[k] === values[k])) return preset.id;
  }
  return 'custom';
}

/** Multiplicadores (1 = padrão) no formato que o motor de partida espera em opts.sliders. */
export const simSliders = (values = sliderValues('simulation')) => Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v / 100]));

/** Opções visuais do renderer a partir dos sliders e chaves da aba Partida 2D. */
export function renderOptions() {
  const v = sliderValues('match2d');
  return { markerScale: v.markerScale / 100, photoScale: v.photoScale / 100, ballScale: v.ballScale / 100, smoothing: v.smoothing / 100, popups: getSetting('matchPopups'), trail: getSetting('matchTrail'), names: getSetting('matchNames') };
}
