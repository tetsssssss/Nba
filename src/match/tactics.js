// Instruções do técnico e sliders de simulação lidos pelo motor.
// Nada aqui decide resultado: são vieses que a IA dos jogadores TENTA executar
// (mais pressa, mais infiltração, marcação mais colada...) e que cobram seu preço em quadra.

export const TIMEOUTS_PER_GAME = 7;

/** Tática neutra: o time joga conforme as tendências dos próprios jogadores. */
export const DEFAULT_TACTICS = {
  pace: 0, // -1 cadenciado · 0 natural · 1 acelerado
  focus: 'balanced', // 'balanced' | 'rim' | 'three' | 'post'
  star: null, // id do jogador que deve receber e decidir mais
  pressure: 0, // 0 normal · 1 pressão na bola
  paint: 0, // 0 normal · 1 fechar o garrafão
  boards: 'balanced', // 'crash' | 'balanced' | 'getback'
  transition: 'normal', // 'push' | 'normal' | 'walk'
};

export const TACTIC_OPTIONS = {
  pace: {
    label: 'Ritmo',
    options: [
      [-1, 'Cadenciado', 'Gasta o relógio de posse e procura o melhor arremesso. Menos posses, menos erros forçados.'],
      [0, 'Natural', 'Cada jogador decide no próprio ritmo.'],
      [1, 'Acelerado', 'Aceita o primeiro bom arremesso e arma a jogada mais cedo. Mais posses e mais cansaço.'],
    ],
  },
  focus: {
    label: 'Prioridade ofensiva',
    options: [
      ['balanced', 'Equilibrado', 'Sem preferência: a leitura de cada posse decide.'],
      ['rim', 'Atacar o aro', 'Mais infiltrações e finalizações perto da cesta; gera faltas, mas enfrenta a ajuda.'],
      ['three', 'Bola de três', 'Valoriza o arremesso de fora e o passe para o arremessador aberto.'],
      ['post', 'Jogo interior', 'Procura o post-up de quem leva vantagem física.'],
    ],
  },
  transition: {
    label: 'Transição ofensiva',
    options: [
      ['walk', 'Segurar', 'Sobe a bola sem correr e arma o ataque de meia quadra.'],
      ['normal', 'Normal', 'Corre quando há vantagem numérica.'],
      ['push', 'Correr sempre', 'O condutor acelera em toda recuperação de bola.'],
    ],
  },
  boards: {
    label: 'Rebote ofensivo',
    options: [
      ['getback', 'Voltar para defender', 'Quase ninguém ataca o rebote: menos segundas chances, menos contra-ataques sofridos.'],
      ['balanced', 'Equilibrado', 'Os pivôs atacam o rebote; os demais recompõem.'],
      ['crash', 'Atacar o rebote', 'Mais jogadores disputam o rebote ofensivo e a defesa de transição fica exposta.'],
    ],
  },
  coverage: {
    label: 'Cobertura do pick and roll',
    options: [
      ['drop', 'Drop', 'O pivô recua para proteger o aro; cede o arremesso de meia distância ao condutor.'],
      ['switch', 'Troca', 'Os defensores trocam de marcação no bloqueio; evita a vantagem, mas cria mismatches.'],
      ['hedge', 'Hedge', 'O pivô sobe para conter o condutor e depois recupera; exige pivô ágil.'],
    ],
  },
  pressure: {
    label: 'Marcação na bola',
    options: [
      [0, 'Normal', 'Distância padrão do marcador da bola.'],
      [1, 'Pressionar', 'Marcador colado: mais roubos e faltas, e mais chance de ser batido no drible.'],
    ],
  },
  paint: {
    label: 'Proteção do garrafão',
    options: [
      [0, 'Normal', 'Ajuda padrão do lado fraco.'],
      [1, 'Fechar o garrafão', 'Os marcadores longe da bola afundam mais para a ajuda; sobra arremesso de três aberto.'],
    ],
  },
};

/** Sliders globais de simulação: 1 = calibração padrão. */
export const SIM_SLIDER_DEFAULTS = { pace: 1, shots: 1, three: 1, mid: 1, rim: 1, turnovers: 1, fouls: 1, oreb: 1, steals: 1, blocks: 1 };

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Normaliza sliders vindos de fora (configurações, testes): valores ausentes ou inválidos viram 1. */
export function normalizeSimSliders(input) {
  const out = { ...SIM_SLIDER_DEFAULTS };
  for (const key of Object.keys(out)) {
    const v = Number(input?.[key]);
    if (Number.isFinite(v)) out[key] = clamp(v, 0.5, 1.5);
  }
  return out;
}

/** Texto curto mostrado quando uma instrução é dada ("Ritmo: acelerado"). */
export function describeTactic(key, value, team) {
  if (key === 'star') {
    const p = team?.all.find((x) => x.id === value);
    return p ? `Prioridade ofensiva: ${p.short}` : 'Sem jogador prioritário';
  }
  const def = TACTIC_OPTIONS[key];
  const opt = def?.options.find(([v]) => v === value);
  return def && opt ? `${def.label}: ${opt[1].toLowerCase()}` : `${key}: ${value}`;
}
