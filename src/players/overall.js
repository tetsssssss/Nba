// Overall por posição. Não existe um Overall universal: o mesmo jogador tem um
// valor diferente como PG, SG, SF, PF ou C, porque cada posição pesa os atributos
// de outro jeito. O jogo exibe o Overall das posições naturais do jogador.
import { ATTRIBUTE_KEYS, POSITIONS, clampRating } from './attributes.js';

// Pesos relativos (normalizados em tempo de carga). Atributos ausentes pesam 0:
// workEthic, leadership, competitiveness e durability não entram no Overall —
// influenciam evolução, vestiário e saúde, não a capacidade atual em quadra.
const RAW_WEIGHTS = {
  PG: {
    rimFinishing: 4, layup: 5, dunk: 0.5, postScoring: 0.5, midRange: 4, threePoint: 8, freeThrow: 2.5, pullUp: 6,
    catchAndShoot: 3, shotCreation: 7, offBallMovement: 2, screenUsage: 2.5, offensiveRebounding: 0.5,
    ballHandling: 8, passing: 7, passingVision: 6, decisionMaking: 5, pickAndRoll: 5, transitionPlay: 2.5, turnoverAvoidance: 3,
    perimeterDefense: 5, interiorDefense: 0.5, steals: 2, blocks: 0.2, screenNavigation: 2, helpDefense: 1, defensiveIQ: 2.5, closeout: 1.5, defensiveRebounding: 0.8,
    speed: 2.5, acceleration: 2.5, strength: 0.5, vertical: 0.5, stamina: 1.5, agility: 2, balance: 0.5,
    offensiveIQ: 4, clutch: 1.5, consistency: 2, discipline: 0.5, focus: 1,
  },
  SG: {
    rimFinishing: 4.5, layup: 4.5, dunk: 1, postScoring: 0.5, midRange: 4.5, threePoint: 9, freeThrow: 2.5, pullUp: 5,
    catchAndShoot: 6, shotCreation: 6, offBallMovement: 4, screenUsage: 3.5, offensiveRebounding: 0.5,
    ballHandling: 5, passing: 3.5, passingVision: 2.5, decisionMaking: 4, pickAndRoll: 3, transitionPlay: 2.5, turnoverAvoidance: 2,
    perimeterDefense: 7, interiorDefense: 0.8, steals: 2.5, blocks: 0.5, screenNavigation: 3, helpDefense: 1.5, defensiveIQ: 3, closeout: 2.5, defensiveRebounding: 1,
    speed: 2.5, acceleration: 2.5, strength: 1, vertical: 1.2, stamina: 1.5, agility: 2.5, balance: 0.8,
    offensiveIQ: 4, clutch: 1.5, consistency: 2, discipline: 0.5, focus: 1,
  },
  SF: {
    rimFinishing: 5.5, layup: 4, dunk: 2, postScoring: 1.5, midRange: 4, threePoint: 7.5, freeThrow: 2, pullUp: 3.5,
    catchAndShoot: 5.5, shotCreation: 5, offBallMovement: 4, screenUsage: 2, offensiveRebounding: 1.5,
    ballHandling: 3.5, passing: 3, passingVision: 2, decisionMaking: 4, pickAndRoll: 2, transitionPlay: 3, turnoverAvoidance: 2,
    perimeterDefense: 7.5, interiorDefense: 2.5, steals: 2.5, blocks: 1.2, screenNavigation: 2.5, helpDefense: 2.5, defensiveIQ: 3.5, closeout: 3, defensiveRebounding: 2.5,
    speed: 2.5, acceleration: 2, strength: 2, vertical: 2, stamina: 1.5, agility: 2.5, balance: 1,
    offensiveIQ: 4, clutch: 1.5, consistency: 2, discipline: 0.5, focus: 1,
  },
  PF: {
    rimFinishing: 7, layup: 3, dunk: 3, postScoring: 4, midRange: 3, threePoint: 5, freeThrow: 2, pullUp: 1.5,
    catchAndShoot: 4, shotCreation: 3, offBallMovement: 3, screenUsage: 1, offensiveRebounding: 4,
    ballHandling: 2, passing: 2.5, passingVision: 1.5, decisionMaking: 4, pickAndRoll: 3.5, transitionPlay: 2, turnoverAvoidance: 2,
    perimeterDefense: 4.5, interiorDefense: 7, steals: 1.5, blocks: 3.5, screenNavigation: 1, helpDefense: 4, defensiveIQ: 4, closeout: 2.5, defensiveRebounding: 5.5,
    speed: 1.5, acceleration: 1.2, strength: 3.5, vertical: 2.5, stamina: 1.5, agility: 1.5, balance: 1.5,
    offensiveIQ: 4, clutch: 1.2, consistency: 2, discipline: 0.8, focus: 1,
  },
  C: {
    rimFinishing: 9, layup: 2, dunk: 4, postScoring: 5, midRange: 2, threePoint: 2.5, freeThrow: 2, pullUp: 0.3,
    catchAndShoot: 1.5, shotCreation: 2, offBallMovement: 2.5, screenUsage: 0.5, offensiveRebounding: 6,
    ballHandling: 0.8, passing: 2.5, passingVision: 1.5, decisionMaking: 4, pickAndRoll: 5, transitionPlay: 1, turnoverAvoidance: 2,
    perimeterDefense: 2, interiorDefense: 10, steals: 1, blocks: 6, screenNavigation: 0.3, helpDefense: 5, defensiveIQ: 4.5, closeout: 1, defensiveRebounding: 7,
    speed: 1, acceleration: 0.8, strength: 4.5, vertical: 3, stamina: 1.5, agility: 1, balance: 1.5,
    offensiveIQ: 4, clutch: 1, consistency: 2, discipline: 1, focus: 1,
  },
};

export const POSITION_WEIGHTS = Object.fromEntries(
  POSITIONS.map((pos) => {
    const raw = RAW_WEIGHTS[pos];
    const total = Object.values(raw).reduce((a, b) => a + b, 0);
    return [pos, Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, (raw[k] ?? 0) / total]))];
  }),
);

// Média de potência: recompensa picos de elite mais do que a média aritmética
// (um especialista de 95 vale mais do que dois atributos medianos somados).
const POWER = 2.2;

// Converte a média ponderada (s) na escala de Overall: a + b·s + c·max(0, s − knot).
// O trecho acima do nó dá a convexidade do topo. Ajustada uma vez pelo modelo de
// ratings (tools/ratings/model.mjs) contra a produção real da temporada-base; é
// constante do modelo — a evolução dos atributos move o Overall naturalmente.
// Deve coincidir com data/seed/meta.json → ratingModel.calibration (há teste).
export const OVERALL_CALIBRATION = {
  PG: { a: 12.187, b: 0.912, c: 0.1773, knot: 76.52 },
  SG: { a: 25.503, b: 0.7548, c: 0.1391, knot: 68.17 },
  SF: { a: 13.138, b: 0.9769, c: 0.3661, knot: 67.19 },
  PF: { a: 18.47, b: 0.881, c: 0.4226, knot: 67.48 },
  C: { a: -10.424, b: 1.2385, c: 0.1358, knot: 73.95 },
};

/** Média ponderada (potência) dos atributos para a posição, antes da calibração. */
export function positionScore(attributes, position) {
  const weights = POSITION_WEIGHTS[position];
  let acc = 0;
  for (const key of ATTRIBUTE_KEYS) {
    const w = weights[key];
    if (w) acc += w * Math.pow(Math.max(0, attributes[key] ?? 0), POWER);
  }
  return Math.pow(acc, 1 / POWER);
}

/** Overall (valor contínuo) do jogador atuando em `position`. */
export function positionOverallExact(attributes, position) {
  const { a, b, c, knot } = OVERALL_CALIBRATION[position];
  const s = positionScore(attributes, position);
  return a + b * s + c * Math.max(0, s - knot);
}

export const positionOverall = (attributes, position) => clampRating(positionOverallExact(attributes, position));

/** Overall em todas as cinco posições: { PG, SG, SF, PF, C }. */
export function allPositionOveralls(attributes) {
  return Object.fromEntries(POSITIONS.map((pos) => [pos, positionOverall(attributes, pos)]));
}

/** Overall de exibição: o da posição natural principal. */
export function primaryOverall(player) {
  return positionOverall(player.attributes, player.positions[0]);
}
