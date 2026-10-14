// Gerador pseudoaleatório determinístico (mulberry32). Toda aleatoriedade do
// jogo passa por aqui para que universos e simulações sejam reproduzíveis.

/** Hash FNV-1a de 32 bits de uma string — usado para derivar sementes estáveis. */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function createRng(seed) {
  let state = (typeof seed === 'string' ? hashString(seed) : seed) >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    /** Float uniforme em [min, max). */
    float: (min = 0, max = 1) => min + next() * (max - min),
    /** Inteiro uniforme em [min, max]. */
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)],
    /** Aproximação de normal (soma de uniformes), média 0 e desvio 1. */
    normal: () => (next() + next() + next() + next() + next() + next() - 3) / 0.7071,
    /** Escolha ponderada: items = [{ weight, ... }] ou pares [valor, peso]. */
    weighted: (items) => {
      const weights = items.map((it) => (Array.isArray(it) ? it[1] : it.weight));
      let roll = next() * weights.reduce((a, b) => a + b, 0);
      for (let i = 0; i < items.length; i++) {
        roll -= weights[i];
        if (roll <= 0) return Array.isArray(items[i]) ? items[i][0] : items[i];
      }
      return Array.isArray(items.at(-1)) ? items.at(-1)[0] : items.at(-1);
    },
    shuffle: (list) => {
      const out = [...list];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    getState: () => state,
  };
  return rng;
}

/** Ruído determinístico em [-1, 1] para um par (entidade, chave). */
export function stableNoise(entityId, key) {
  return createRng(`${entityId}:${key}`).next() * 2 - 1;
}
