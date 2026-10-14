// Camada única que converte atributos (0-100) em comportamento físico e técnico.
// O resto do motor NUNCA lê `attributes` diretamente para calcular efeito:
// pede um perfil aqui. Isso concentra a calibração e as curvas não lineares.
import { TUNE, clamp } from './config.js';

const n = (v) => clamp(v ?? 50, 0, 100) / 100;
/** Curva de elite: a diferença 95→99 pesa mais do que 55→59. */
const elite = (v, e = 1.5) => Math.pow(n(v), e);
const avg = (...xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Efeito gradual da fadiga: energia 1 = descansado, 0 = exausto. Nunca destrói o jogador. */
const physical = (energy) => 0.85 + 0.15 * energy;
const technical = (energy) => 0.94 + 0.06 * energy;

export function getMovementProfile(d, energy = 1) {
  const a = d.attributes;
  const f = physical(energy) * TUNE.MOVEMENT_SPEED_SCALE;
  const weight = d.weight || 215;
  return {
    maxSpeed: (13 + 10 * elite(a.speed, 1.3)) * f, // pés/s
    accel: (11 + 25 * elite(a.acceleration, 1.3)) * f, // pés/s²
    decel: 24 + 20 * n(a.balance),
    agility: n(a.agility) * physical(energy), // 0..1: quanto preserva velocidade ao mudar de direção
    slide: 0.5 + 0.24 * n(a.agility), // fração da velocidade em deslocamento lateral defensivo
    mass: (weight / 215) * (0.75 + 0.5 * n(a.strength)),
    strength: n(a.strength) * physical(energy),
  };
}

export function getBallHandlingProfile(d, energy = 1) {
  const a = d.attributes;
  const t = technical(energy);
  return {
    speedWithBall: 0.7 + 0.27 * elite(a.ballHandling, 1.2), // fração da velocidade mantida com a bola
    control: n(a.ballHandling) * t,
    moveQuality: (0.5 * elite(a.ballHandling, 1.3) + 0.25 * n(a.agility) + 0.25 * n(a.acceleration)) * t,
    security: (0.6 * n(a.ballHandling) + 0.25 * n(a.turnoverAvoidance) + 0.15 * n(a.strength)) * t,
    creation: n(a.shotCreation),
  };
}

export function getShootingProfile(d, energy = 1) {
  const a = d.attributes;
  const t = technical(energy);
  return {
    three: n(a.threePoint) * t,
    catchShoot: n(a.catchAndShoot) * t,
    pullUp: n(a.pullUp) * t,
    mid: n(a.midRange) * t,
    freeThrow: n(a.freeThrow),
    // gather: tempo entre decidir e soltar a bola. Quem tem soltura rápida dá menos tempo ao closeout.
    gather: 0.6 - 0.22 * n(avg(a.catchAndShoot, a.pullUp)),
    fatiguePenalty: 0.04 * (1 - energy),
    clutch: n(a.clutch),
    consistency: n(a.consistency),
  };
}

export function getFinishingProfile(d, energy = 1) {
  const a = d.attributes;
  const t = technical(energy);
  return {
    layup: n(avg(a.layup, a.rimFinishing)) * t,
    rim: n(a.rimFinishing) * t,
    dunk: n(a.dunk),
    vertical: n(a.vertical) * physical(energy),
    canDunk: a.dunk >= 55 && (d.heightIn || 78) + a.vertical * 0.16 >= 86,
    post: n(a.postScoring) * t,
    balance: n(a.balance),
    drawFoul: n(d.tendencies?.drawFoul ?? 50),
  };
}

export function getPassingProfile(d, energy = 1) {
  const a = d.attributes;
  return {
    speed: (36 + 13 * n(a.passing)) * TUNE.PASS_SPEED_SCALE, // pés/s
    error: (0.36 - 0.3 * n(a.passing)) / technical(energy), // desvio (pés) a cada 10 pés de passe
    vision: n(a.passingVision),
    iq: n(avg(a.decisionMaking, a.offensiveIQ)) * technical(energy),
  };
}

export function getDefensiveProfile(d, energy = 1) {
  const a = d.attributes;
  const height = d.heightIn || 78;
  const wingspan = d.combine?.wingspan || height * 1.06;
  return {
    // atraso entre o atacante agir e o defensor perceber
    reaction: ((0.44 - 0.29 * elite(avg(a.defensiveIQ, a.perimeterDefense), 1.2)) / physical(energy)) * TUNE.DEFENSIVE_REACTION_SCALE,
    anticipation: 0.15 + 0.6 * n(a.defensiveIQ), // quanto projeta o movimento do atacante (explorável por fintas)
    perimeter: n(a.perimeterDefense) * physical(energy),
    interior: n(a.interiorDefense) * physical(energy),
    steal: n(a.steals),
    block: elite(a.blocks, 1.4),
    closeout: n(a.closeout),
    screenNav: n(a.screenNavigation),
    help: n(avg(a.helpDefense, a.defensiveIQ)),
    discipline: n(a.discipline),
    // alcance em pés: envergadura domina, impulsão soma
    reach: (height * 0.84 + wingspan * 0.5) / 12 + (0.9 + 1.9 * n(a.vertical)) * physical(energy),
    length: wingspan / 12,
  };
}

export function getReboundProfile(d, energy = 1) {
  const a = d.attributes;
  const height = d.heightIn || 78;
  return {
    off: elite(a.offensiveRebounding, 1.2),
    def: elite(a.defensiveRebounding, 1.2),
    reach: (height * 1.33) / 12 + (0.9 + 1.9 * n(a.vertical)) * physical(energy),
    boxOut: 0.5 * n(a.strength) + 0.5 * n(a.defensiveRebounding),
    crash: n(d.tendencies?.crashOffensiveGlass ?? 40),
  };
}

export function getScreenProfile(d) {
  const a = d.attributes;
  return {
    quality: 0.45 * n(a.strength) + 0.3 * n(a.pickAndRoll) + 0.25 * clamp(((d.weight || 215) - 180) / 100, 0, 1),
    roll: n(d.tendencies?.pnrRollFreq ?? 40),
    pop: n(a.threePoint),
  };
}

/** Todos os perfis de um jogador num objeto só (recalculado quando a energia muda). */
export function buildProfiles(d, energy = 1) {
  return {
    move: getMovementProfile(d, energy),
    handle: getBallHandlingProfile(d, energy),
    shoot: getShootingProfile(d, energy),
    finish: getFinishingProfile(d, energy),
    pass: getPassingProfile(d, energy),
    def: getDefensiveProfile(d, energy),
    reb: getReboundProfile(d, energy),
    screen: getScreenProfile(d),
    tend: tendencies(d),
    energy,
  };
}

function tendencies(d) {
  const t = d.tendencies ?? {};
  const g = (k, fallback = 50) => n(t[k] ?? fallback);
  return {
    three: g('threePointFreq'), rim: g('rimAttackFreq'), mid: g('midRangeFreq'), pullUp: g('pullUpFreq'), catchShoot: g('catchShootFreq'),
    stepback: g('stepbackFreq', 30), iso: g('isoFreq', 30), post: g('postUpFreq', 20), pnr: g('pnrHandlerFreq', 30), roll: g('pnrRollFreq', 30),
    transition: g('transitionFreq'), cut: g('cutFreq', 30), drive: g('driveFreq'), passFirst: g('passFirst'), extraPass: g('extraPass'),
    kick: g('driveAndKick'), hold: g('holdBall'), pace: g('pushPace'), crash: g('crashOffensiveGlass', 35), contest: g('contestShots'),
    gamble: g('gambleForSteals', 40), foul: g('foulProne', 45), charge: g('takeCharges', 30), block: g('blockAttempts', 40),
    clutchShot: g('clutchShotTaking'), spotUp: g('spotUpFreq'), offScreen: g('offScreenFreq', 25),
  };
}

// Leitura resumida do jogador. NÃO altera a simulação: é só um rótulo derivado.
export function getArchetype(d) {
  const a = d.attributes;
  const t = d.tendencies ?? {};
  const big = (d.heightIn || 78) >= 81;
  const scores = {
    'Floor general': a.passing * 0.5 + a.passingVision * 0.3 + a.ballHandling * 0.2 + (t.passFirst ?? 50) * 0.15,
    'Shot creator': a.shotCreation * 0.5 + a.pullUp * 0.3 + a.ballHandling * 0.2 + (t.isoFreq ?? 30) * 0.15,
    Slasher: a.rimFinishing * 0.35 + a.acceleration * 0.3 + a.layup * 0.2 + (t.driveFreq ?? 50) * 0.3,
    'Spot-up shooter': a.catchAndShoot * 0.5 + a.threePoint * 0.4 + (t.catchShootFreq ?? 50) * 0.25 - a.shotCreation * 0.15,
    '3&D': a.threePoint * 0.4 + a.perimeterDefense * 0.5 + a.closeout * 0.15,
    'Point forward': big ? a.passing * 0.5 + a.ballHandling * 0.4 + a.passingVision * 0.2 : 0,
    'Stretch big': big ? a.threePoint * 0.7 + a.catchAndShoot * 0.4 : 0,
    'Rim protector': big ? a.blocks * 0.5 + a.interiorDefense * 0.5 + a.helpDefense * 0.1 : 0,
    'Post scorer': a.postScoring * 0.7 + a.strength * 0.25 + (t.postUpFreq ?? 20) * 0.3,
    'Roll man': big ? a.pickAndRoll * 0.4 + a.dunk * 0.3 + a.rimFinishing * 0.3 + (t.pnrRollFreq ?? 30) * 0.2 : 0,
    'Defensive stopper': a.perimeterDefense * 0.55 + a.steals * 0.2 + a.screenNavigation * 0.2 + a.defensiveIQ * 0.15 - a.shotCreation * 0.1,
  };
  return Object.entries(scores).sort((x, y) => y[1] - x[1])[0][0];
}
