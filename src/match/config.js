// Geometria da quadra (em pés) e TODOS os parâmetros de calibração do motor 2D.
// Nenhum outro módulo deve conter número mágico de balanceamento: ajuste aqui.

export const COURT = {
  L: 94, // comprimento
  W: 50, // largura
  hoop: 5.25, // distância do aro à linha de fundo
  three: 23.75, // raio da linha de três
  cornerLat: 22, // distância lateral da linha de três nos cantos
  paintHalf: 8, // meia largura do garrafão
  ft: 19, // linha de lance livre (a partir da linha de fundo)
  ra: 4, // área restrita
};

export const TUNE = {
  DT: 1 / 30, // passo fixo da simulação (s)
  QUARTER_SECONDS: 720,
  OVERTIME_SECONDS: 300,
  SHOT_CLOCK: 24,
  SHOT_CLOCK_OREB: 14,

  // --- movimento
  MOVEMENT_SPEED_SCALE: 1,
  COLLISION_RADIUS: 1.15, // raio corporal (pés)
  COLLISION_STIFFNESS: 0.55, // 0 = corpos se atravessam, 1 = rígido
  AVOID_DISTANCE: 5, // antecipação para desviar de corpos
  AVOID_STRENGTH: 0.55,
  ARRIVE_DEADZONE: 0.4, // dentro disso o jogador não microajusta
  TURN_SPEED_LOSS: 5.5, // perda de velocidade em mudança brusca de direção
  SPACING_DISTANCE: 12, // distância desejada entre atacantes sem bola
  WALK: 0.24,
  JOG: 0.42,
  RUN: 0.62,

  // --- defesa
  DEFENSIVE_REACTION_SCALE: 1,
  ONBALL_GAP: 3.4, // distância base do marcador da bola
  HELP_SAG: 0.42, // quanto o marcador longe da bola afunda para a ajuda
  HELP_TRIGGER: 1.6, // vantagem (pés) do atacante sobre o marcador que aciona a ajuda
  CONTEST_RANGE: 2.7, // escala de distância do contest
  CONTEST_JUMPER: 0.31, // quanto um contest máximo derruba um arremesso
  CONTEST_RIM: 0.42,

  // --- bola
  PASS_SPEED_SCALE: 1,
  SHOT_ARC: 1,
  INTERCEPT_SCALE: 0.31,
  STRIP_SCALE: 0.44, // roubos no drible
  REBOUND_LONG: 0.3, // quanto a distância do arremesso alonga o rebote
  PICKUP_RADIUS: 1.9,

  // --- eficiência (bases calibradas contra médias da NBA)
  SHOT_SCALE: 0.965,
  THREE_BASE: 0.238, THREE_SKILL: 0.31,
  MID_BASE: 0.25, MID_SKILL: 0.29,
  SHORT_BASE: 0.28, SHORT_SKILL: 0.27,
  LAYUP_BASE: 0.465, LAYUP_SKILL: 0.31,
  DUNK_BASE: 0.82, DUNK_SKILL: 0.16,
  HOOK_BASE: 0.3, HOOK_SKILL: 0.29,
  FOUL_JUMPER: 0.15, FOUL_RIM: 0.64,
  BLOCK_RIM: 0.5, BLOCK_JUMPER: 0.1,

  // --- decisão
  DECISION_HZ: 5, // portador da bola
  OFFBALL_HZ: 2,
  DECISION_NOISE: 0.3, // variância (reduzida pelo QI)
  POSSESSION_VALUE: 1.31, // pontos esperados de "continuar a posse": régua para aceitar um arremesso
  EARLY_PATIENCE: 0.12, // exigência extra nos primeiros segundos da posse (evita o arremesso apressado)
  PATIENCE_DECAY: 8, // segundos de shot clock em que a paciência começa a cair
  ZONE_THREE: 0.03, // viés de seleção por zona (calibra o volume de bolas de três e de meia distância)
  ZONE_MID: 0.04,
  PASS_ERROR_SCALE: 1.15, // imprecisão de passe
  FUMBLE_SCALE: 1.3, // erros não forçados no drible (andada, bola que escapa)
  SETUP_SCALE: 1.75, // tempo que o ataque leva para se armar antes de iniciar a ação: principal régua do ritmo

  // --- distribuição de jogo: acima desta fatia das finalizações do time, o ataque deixa de forçar a bola
  // no mesmo jogador (companheiros param de devolver, ele próprio procura o passe) — é o efeito da atenção
  // defensiva e da divisão de bola, sem o qual o melhor criador arremessaria 50 vezes por jogo
  USAGE_SOFT_CAP: 0.23,
  USAGE_WIDTH: 0.13, // quão rápido o efeito cresce acima do teto
  USAGE_STAR_BONUS: 0.07, // folga para o "jogador prioritário" escolhido pelo técnico

  // --- rotação da IA: tempo seguido em quadra antes de descansar e descanso mínimo (em jogo de 12 min por quarto)
  STINT_STARTER: 500,
  STINT_BENCH: 400,
  REST_MIN: 300,

  // --- fadiga
  FATIGUE_BASE: 0.0005,
  FATIGUE_EFFORT: 0.0026,
  FATIGUE_RECOVERY: 0.0045,
  SUB_OUT: 0.6,
  SUB_IN: 0.93,
};

// Posições conceituais do ataque: [distância da linha de fundo, deslocamento lateral].
export const SLOTS = {
  top: [31, 0],
  slotL: [29, -11], slotR: [29, 11],
  wingL: [21, -21], wingR: [21, 21],
  cornerL: [5, -23.2], cornerR: [5, 23.2],
  dunkerL: [4.8, -7.5], dunkerR: [4.8, 7.5],
  elbowL: [19, -8], elbowR: [19, 8],
  postL: [10, -9.5], postR: [10, 9.5],
};
export const PERIMETER_SLOTS = ['top', 'slotL', 'slotR', 'wingL', 'wingR', 'cornerL', 'cornerR'];

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const len = (x, y) => Math.hypot(x, y);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Aro atacado por quem joga na direção `dir` (+1 = para a direita). */
export const hoopOf = (dir) => ({ x: dir > 0 ? COURT.L - COURT.hoop : COURT.hoop, y: COURT.W / 2 });

/** Coordenada de ataque (distância da linha de fundo, lateral) → quadra. */
export const toWorld = (dir, d, lat) => ({ x: dir > 0 ? COURT.L - d : d, y: COURT.W / 2 + lat * dir });
export const slotPos = (dir, name) => toWorld(dir, SLOTS[name][0], SLOTS[name][1]);

/** Distância de (px,py) ao segmento a→b e posição relativa t (0..1) do ponto mais próximo. */
export function segDist(ax, ay, bx, by, px, py) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy || 1e-9;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
  return { d: Math.hypot(px - (ax + dx * t), py - (ay + dy * t)), t };
}

export function isThree(dir, x, y) {
  const h = hoopOf(dir);
  const lat = Math.abs(y - h.y);
  const fromBaseline = dir > 0 ? COURT.L - x : x;
  if (fromBaseline < 14) return lat >= COURT.cornerLat;
  return Math.hypot(x - h.x, y - h.y) >= COURT.three;
}

export const inPaint = (dir, x, y) => {
  const fromBaseline = dir > 0 ? COURT.L - x : x;
  return fromBaseline < COURT.ft && Math.abs(y - COURT.W / 2) < COURT.paintHalf;
};
