// Modelo de ratings v1 — converte dados reais (box score, tracking, play types,
// hustle, combine) nos 45 atributos do jogo, nas posições naturais, no Overall-alvo
// e no potencial inicial. Roda apenas em tempo de build (tools/build-seed.mjs).
//
// Princípios:
//  1. Cada atributo é um composto de indicadores reais → percentil na liga → escala 0-100.
//  2. Percentuais de arremesso são encolhidos para um prior conforme o volume (amostra pequena ≠ elite).
//  3. O nível geral (Overall-alvo) vem do valor de produção real; os atributos dão a forma do jogador.
//  4. Sem amostra NBA (novatos), o perfil é estimado por posição + combine + pick — e marcado como tal.
import { ATTRIBUTE_GROUPS, ATTRIBUTE_KEYS, POSITIONS } from '../../src/players/attributes.js';
import { POSITION_WEIGHTS, positionScore } from '../../src/players/overall.js';
import { stableNoise } from '../../src/core/rng.js';

export const MODEL_VERSION = 'ratings-v1';

const REF_MIN = 500; // minutos ponderados para entrar na população de referência
const SAMPLE_K = 250; // "minutos fantasma" do prior ao encolher compostos

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const safe = (v) => (Number.isFinite(v) ? v : 0);
const div = (a, b) => (b > 0 ? a / b : 0);
const shr = (makes, att, prior, k) => (makes + prior * k) / (att + k);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

function interp(anchors, x) {
  if (x <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i++) {
    if (x <= anchors[i][0]) {
      const [x0, y0] = anchors[i - 1];
      const [x1, y1] = anchors[i];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return anchors.at(-1)[1];
}

/** Percentil (0-1) de `v` numa lista ordenada, com interpolação. */
function percentileOf(sorted, v) {
  if (!sorted.length) return 0.5;
  if (v <= sorted[0]) return 0;
  if (v >= sorted.at(-1)) return 1;
  let lo = 0;
  let hi = sorted.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= v) lo = mid;
    else hi = mid;
  }
  const span = sorted[hi] - sorted[lo];
  return (lo + (span > 0 ? (v - sorted[lo]) / span : 0)) / (sorted.length - 1);
}

// Percentil na liga → rating. Mediana de rotação ≈ 62; elite ≈ 90+.
const SKILL_CURVE = [[0, 25], [0.05, 35], [0.15, 44], [0.3, 53], [0.5, 62], [0.7, 71], [0.85, 79], [0.93, 85], [0.98, 91], [0.995, 96], [1, 99]];
const FT_CURVE = [[0.4, 25], [0.5, 36], [0.6, 48], [0.7, 61], [0.78, 72], [0.85, 83], [0.9, 91], [0.94, 97]];
// Percentil de valor de produção → Overall-alvo.
const OVERALL_CURVE = [[0, 65], [0.1, 69], [0.25, 72.5], [0.5, 76], [0.7, 79.5], [0.85, 83.5], [0.93, 87], [0.97, 90], [0.99, 93.5], [0.997, 96], [1, 98]];

// Priors de eficiência ficam ABAIXO da média da liga: quem quase não usa um recurso
// (pivô que nunca arremessa de pull-up, armador que nunca joga de costas) não deve
// herdar a eficiência média de quem usa. Com volume real, o prior quase não pesa.
const SYN_PRIOR = { iso: [0.78, 40], trans: [1.0, 50], prbh: [0.78, 60], roll: [1.0, 40], post: [0.82, 40], spot: [0.92, 60], handoff: [0.82, 30], cut: [1.15, 30], offScreen: [0.85, 30], putback: [1.0, 25], misc: [0.5, 30] };
const SYN_DEF_PRIOR = { iso: 0.92, prbh: 0.9, roll: 1.05, post: 0.95, spot: 1.02, handoff: 0.92, offScreen: 0.95 };

/** Taxas e eficiências derivadas dos totais ponderados de um jogador. */
export function deriveRates(p, mpg) {
  const m = p.min;
  const per36 = (x) => (safe(x) / m) * 36;
  const w = (x) => safe(x) / m; // percentuais guardados como valor × minutos
  const tsa = p.fga + 0.44 * p.fta;
  const ftRaw = div(p.ftm, p.fta);
  const ftPct = shr(p.ftm, p.fta, 0.76, 40);
  const prior3 = clamp(0.22 + (ftPct - 0.6) * 0.44, 0.2, 0.35);
  const efg = (s, prior, k) => shr(s.fgm + 0.5 * s.fg3m, s.fga, prior, k);
  const diff = (d, k) => (d.fgm - d.exp) / (d.fga + k); // FG% permitido − esperado (negativo = bom)
  const gs = p.pts + 0.4 * p.fgm - 0.7 * p.fga - 0.4 * (p.fta - p.ftm) + 0.7 * p.oreb + 0.3 * p.dreb + p.stl + 0.7 * p.ast + 0.7 * p.blk - 0.4 * p.pf - p.tov;
  const r = {
    wMin: m, mpg,
    fga36: per36(p.fga), fg3a36: per36(p.fg3a), fta36: per36(p.fta), pts36: per36(p.pts), ast36: per36(p.ast), tov36: per36(p.tov),
    stl36: per36(p.stl), blk36: per36(p.blk), pf36: per36(p.pf), pfd36: per36(p.pfd), oreb36: per36(p.oreb), dreb36: per36(p.dreb),
    gs36: per36(gs), gsPg: (per36(gs) * mpg) / 36, ts: div(p.pts, 2 * tsa), ftPct, ftRaw, fg3Pct: shr(p.fg3m, p.fg3a, prior3, 140),
    ftr: div(p.fta, p.fga), pctFga3: div(p.fg3a, p.fga),
    usg: w(p.wUsg), astPct: w(p.wAstPct), orebPct: w(p.wOrebPct), drebPct: w(p.wDrebPct), rebPct: w(p.wRebPct), tovPct: w(p.wTovPct),
    pie: w(p.wPie), offRtg: w(p.wOffRtg), defRtg: w(p.wDefRtg), netRtg: (w(p.wNetRtg) * m) / (m + 400), pace: w(p.wPace),
    astTo: (p.ast + 20) / (p.tov + 12),
    raPct: shr(p.ra.fgm, p.ra.fga, 0.6, 60), raFga36: per36(p.ra.fga), paintPct: shr(p.paint.fgm, p.paint.fga, 0.38, 60), paintFga36: per36(p.paint.fga),
    midPct: shr(p.mid.fgm, p.mid.fga, 0.36, 80), midFga36: per36(p.mid.fga), corner3a36: per36(p.corner3.fga),
    csEfg: efg(p.cs, 0.47, 100), csFga36: per36(p.cs.fga), cs3Pct: shr(p.cs.fg3m, p.cs.fg3a, prior3 + 0.01, 120),
    puEfg: efg(p.pu, 0.36, 80), puFga36: per36(p.pu.fga), pu3a36: per36(p.pu.fg3a),
    tightEfg: efg(p.tight, 0.43, 80), tightFga36: per36(p.tight.fga), openEfg: efg(p.open, 0.5, 80),
    uastFgm36: per36(p.uastFgm), ptsFb36: per36(p.ptsFb), ptsPaint36: per36(p.ptsPaint), pts2nd36: per36(p.pts2nd),
    contested36: per36(p.contested), contested2_36: per36(p.contested2), contested3_36: per36(p.contested3),
    deflections36: per36(p.deflections), charges36: per36(p.charges), screenAst36: per36(p.screenAst),
    loose36: per36(p.looseOff + p.looseDef), looseDef36: per36(p.looseDef), boxOff36: per36(p.boxOff), boxDef36: per36(p.boxDef),
    drives36: per36(p.drives), driveFgPct: shr(p.driveFgm, p.driveFga, 0.43, 80), driveTovPct: shr(p.driveTov, p.drives, 0.07, 100),
    drivePassPct: div(p.drivePasses, p.drives), driveFta36: per36(p.driveFta),
    passes36: per36(p.passes), potAst36: per36(p.potAst), secAst36: per36(p.secAst), astPts36: per36(p.astPts), astPerPass: shr(p.ast, p.passes, 0.08, 300),
    passPerTouch: div(p.passes, p.touches),
    orebContest36: per36(p.orebContest), drebContest36: per36(p.drebContest), orebChances36: per36(p.orebChances),
    distPerMin: div(p.distMiles, m), speed: w(p.wSpeed), speedOff: w(p.wSpeedOff), speedDef: w(p.wSpeedDef),
    touches36: per36(p.touches), timeOfPoss36: per36(p.timeOfPoss), dribPerTouch: w(p.wDribPerTouch), secPerTouch: w(p.wSecPerTouch),
    postTouches36: per36(p.postTouches), paintTouches36: per36(p.paintTouches), elbowTouches36: per36(p.elbowTouches),
    postFgPct: shr(p.postFgm, p.postFga, 0.42, 40),
    defRimFga36: per36(p.defRim.fga), defRimPct: shr(p.defRim.fgm, p.defRim.fga, 0.63, 120),
    d3Diff: diff(p.dThree, 150), dLt6Diff: diff(p.dLt6, 120), dGt15Diff: diff(p.dGt15, 150), dOverallDiff: diff(p.dOverall, 250),
    defWs36: per36(p.wDefWs), stocksPerFoul: (p.stl + p.blk + 5) / (p.pf + 15), shotQuality: div(p.ra.fga + p.fg3a, p.fga),
    clutchMin: p.clutch.min, clutchShare: div(p.clutch.min, m),
    clutchPts36: (p.clutch.pts / (p.clutch.min + 40)) * 36,
    clutchTs: (p.clutch.pts + 0.56 * 2 * 30) / (2 * (p.clutch.fga + 0.44 * p.clutch.fta + 30)),
    clutchPm36: (p.clutch.plusMinus / (p.clutch.min + 80)) * 36,
    clutchFga36: (p.clutch.fga / (p.clutch.min + 40)) * 36, clutchAst36: (p.clutch.ast / (p.clutch.min + 40)) * 36,
    andOne36: 0,
  };
  let offPoss = 0;
  let andOne = 0;
  for (const s of Object.values(p.synOff)) {
    offPoss += s.poss;
    andOne += s.plusOne;
  }
  r.andOne36 = per36(andOne);
  for (const [k, s] of Object.entries(p.synOff)) {
    const [prior, kk] = SYN_PRIOR[k];
    r[`${k}Poss36`] = per36(s.poss);
    r[`${k}PPP`] = shr(s.pts, s.poss, prior, kk);
    r[`${k}Freq`] = div(s.poss, offPoss);
  }
  for (const [k, s] of Object.entries(p.synDef)) {
    r[`d_${k}Poss36`] = per36(s.poss);
    r[`d_${k}PPP`] = shr(s.pts, s.poss, SYN_DEF_PRIOR[k], 40);
  }
  for (const k of Object.keys(r)) r[k] = safe(r[k]);
  return r;
}

// ---------------------------------------------------------------- posições
// Faixa de posição permitida pelo rótulo oficial (1 = PG ... 5 = C) e quanto o
// papel de condutor de bola pode "diminuir" o jogador dentro dela.
const LABEL_RANGE = { G: [1, 2.35], 'G-F': [1.6, 3.2], 'F-G': [1.8, 3.5], F: [2.6, 4.4], 'F-C': [3.6, 4.7], 'C-F': [4.3, 5], C: [4.6, 5] };
const HANDLER_SCALE = { G: 1, 'G-F': 1, 'F-G': 0.8, F: 0.45, 'F-C': 0, 'C-F': 0, C: 0 };
const EXPECTED_WEIGHT = (heightIn) => 215 + (heightIn - 78) * 6.2;

const POSITION_INDEX = { PG: 1, SG: 2, SF: 3, PF: 4, C: 5 };

/** Posição listada no Draft Combine ("SF", "PG-SG"...) → faixa permitida. */
function combineRange(text) {
  const idx = String(text ?? '').split('-').map((s) => POSITION_INDEX[s.trim()]).filter(Boolean);
  if (!idx.length) return null;
  return [Math.min(...idx) - 0.4, Math.max(...idx) + 0.4];
}

export function derivePositions(bio, z) {
  if (bio.positionOverride?.length) {
    const idx = bio.positionOverride.map((p) => POSITION_INDEX[p]);
    return { positions: bio.positionOverride, positionValue: Number((idx[0] + (idx[1] ? (idx[1] - idx[0]) * 0.35 : 0)).toFixed(2)) };
  }
  const height = bio.heightIn || 78;
  const label = LABEL_RANGE[bio.positionLabel] ? bio.positionLabel : null;
  // Altura média por posição na NBA: ~6'2.5" (PG) a ~6'11" (C), cerca de 2,1" por degrau.
  const pHeight = clamp(1 + (height - 74.5) / 2.1, 0.6, 5.4);
  const weightAdj = clamp(((bio.weight || EXPECTED_WEIGHT(height)) - EXPECTED_WEIGHT(height)) * 0.014, -0.4, 0.6);
  let p = pHeight + weightAdj;
  let initiator = false;
  if (z) {
    const handler = clamp(0.35 * z('timeOfPoss36') + 0.65 * z('astPct'), -1.6, 2.4);
    // "Jogar de pivô" aparece na defesa do aro, nos bloqueios e no rebote — não na altura.
    let big = clamp(0.3 * z('defRimFga36') + 0.25 * z('screenAst36') + 0.2 * z('rebPct') + 0.15 * z('blk36') + 0.1 * z('rollPoss36'), -1.5, 2);
    if (big < 0) big *= pHeight < 2.5 ? 0 : 0.5;
    p += clamp(-0.35 * handler * (label ? HANDLER_SCALE[label] : 0.6) + 0.8 * big, -0.9, 0.9);
    // Alas altos que jogam no perímetro (muito pull-up e bola de três, pouco rebote) são alas, não pivôs.
    const perimeter = label && label !== 'C' ? clamp(0.5 * z('pctFga3') + 0.5 * z('puFga36') - 0.5 * z('rebPct'), 0, 2) : 0;
    if (p > 3.5 && perimeter > 0) p = Math.max(3.4, p - 0.45 * perimeter);
    const tz = z('timeOfPoss36');
    const az = z('astPct');
    // Quem inicia o ataque joga de armador, seja qual for a altura.
    initiator = label === 'G' ? tz > 1 && az > 0.9 : label === 'G-F' || label === 'F-G' ? tz > 1.9 && az > 1.5 : false;
  } else {
    // Sem amostra NBA: a posição listada no Draft Combine é a melhor referência disponível.
    const range = combineRange(bio.combine?.position);
    if (range) p = clamp(p, ...range);
  }
  if (label) p = clamp(p, ...LABEL_RANGE[label]);
  if (initiator) p = Math.min(p, 1.45);
  p = clamp(p, 1, 5);
  const primary = Math.round(p);
  const positions = [POSITIONS[primary - 1]];
  const frac = p - primary;
  if (Math.abs(frac) > 0.3) {
    const second = primary + Math.sign(frac);
    if (second >= 1 && second <= 5) positions.push(POSITIONS[second - 1]);
  } else if (initiator && primary === 1 && height >= 77) {
    positions.push('SG');
  }
  return { positions, positionValue: Number(p.toFixed(2)) };
}

const groupOf = (positionValue) => (positionValue < 2.5 ? 'G' : positionValue < 3.7 ? 'W' : 'B');

// ---------------------------------------------------------------- compostos
// Cada composto recebe z(nome) → z-score do indicador na população de referência.
const COMPOSITES = {
  rimFinishing: (z) => 0.5 * z('raPct') + 0.25 * z('raFga36') + 0.1 * z('driveFgPct') + 0.15 * z('ftr'),
  layup: (z) => 0.35 * z('driveFgPct') + 0.2 * z('drives36') + 0.25 * z('raPct') + 0.2 * z('paintPct'),
  postScoring: (z) => 0.4 * z('postPoss36') + 0.3 * z('postPPP') + 0.15 * z('postTouches36') + 0.15 * z('postFgPct'),
  midRange: (z) => 0.6 * z('midPct') + 0.25 * z('midFga36') + 0.15 * z('paintPct'),
  threePoint: (z) => 0.6 * z('fg3Pct') + 0.3 * z('fg3a36') + 0.1 * z('ftPct'),
  pullUp: (z) => 0.55 * z('puEfg') + 0.45 * z('puFga36'),
  catchAndShoot: (z) => 0.6 * z('csEfg') + 0.25 * z('csFga36') + 0.15 * z('cs3Pct'),
  shotCreation: (z) => 0.35 * z('uastFgm36') + 0.15 * z('isoPoss36') + 0.15 * z('isoPPP') + 0.15 * z('puFga36') + 0.1 * z('usg') + 0.1 * z('tightEfg'),
  offBallMovement: (z) => 0.2 * z('cutPoss36') + 0.2 * z('offScreenPoss36') + 0.15 * z('spotPPP') + 0.1 * z('cutPPP') + 0.15 * z('speedOff') + 0.2 * z('csFga36'),
  screenUsage: (z) => 0.3 * z('offScreenPoss36') + 0.15 * z('offScreenPPP') + 0.2 * z('handoffPoss36') + 0.1 * z('handoffPPP') + 0.15 * z('prbhPoss36') + 0.1 * z('prbhPPP'),
  offensiveRebounding: (z) => 0.6 * z('orebPct') + 0.15 * z('orebContest36') + 0.15 * z('putbackPoss36') + 0.1 * z('boxOff36'),

  ballHandling: (z) => 0.25 * z('timeOfPoss36') + 0.2 * z('dribPerTouch') + 0.2 * z('drives36') - 0.1 * z('driveTovPct') + 0.15 * (0.6 * z('prbhPoss36') + 0.4 * z('isoPoss36')) + 0.1 * z('puFga36'),
  passing: (z) => 0.35 * z('astPct') + 0.3 * z('potAst36') + 0.15 * z('astTo') + 0.2 * z('astPerPass'),
  passingVision: (z) => 0.35 * z('potAst36') + 0.15 * z('secAst36') + 0.3 * z('astPts36') + 0.2 * z('astPerPass'),
  decisionMaking: (z) => 0.3 * z('astTo') - 0.25 * z('tovPct') + 0.2 * z('ts') + 0.1 * z('offRtg') + 0.05 * z('shotQuality') + 0.1 * z('exp'),
  pnrHandler: (z) => 0.5 * z('prbhPoss36') + 0.5 * z('prbhPPP'),
  pnrRoller: (z) => 0.4 * z('rollPoss36') + 0.35 * z('rollPPP') + 0.25 * z('screenAst36'),
  transitionPlay: (z) => 0.4 * z('transPoss36') + 0.3 * z('transPPP') + 0.2 * z('ptsFb36') + 0.1 * z('speed'),
  turnoverAvoidance: (z) => -z('tovPct') + 0.35 * z('astPct') + 0.2 * z('usg'),

  perimeterDefense: (z) =>
    -0.15 * z('d3Diff') - 0.15 * z('dGt15Diff') - 0.15 * z('d_isoPPP') - 0.15 * z('d_prbhPPP') + 0.15 * z('deflections36') + 0.05 * z('contested3_36') + 0.05 * z('stl36') - 0.1 * z('defRtg') - 0.08 * z('heightIn') + 0.05 * z('speedDef'),
  interiorDefense: (z) =>
    -0.25 * z('dLt6Diff') + 0.15 * z('defRimFga36') - 0.15 * z('defRimPct') + 0.15 * z('blk36') + 0.1 * z('contested2_36') - 0.05 * z('d_postPPP') - 0.05 * z('d_rollPPP') + 0.05 * z('heightIn') + 0.05 * z('weight'),
  steals: (z) => 0.65 * z('stl36') + 0.35 * z('deflections36'),
  blocks: (z) => 0.85 * z('blk36') + 0.15 * z('contested2_36'),
  screenNavigation: (z) =>
    -0.3 * z('d_prbhPPP') - 0.2 * z('d_offScreenPPP') - 0.2 * z('d_handoffPPP') + 0.15 * z('chasePoss36') + 0.1 * z('speedDef') - 0.15 * z('weight') - 0.1 * z('heightIn'),
  helpDefense: (z) => 0.15 * z('charges36') + 0.2 * z('blk36') + 0.2 * z('deflections36') + 0.15 * z('contested36') + 0.15 * z('defWs36') + 0.05 * z('looseDef36') - 0.1 * z('defRtg'),
  defensiveIQ: (z) => 0.25 * z('defWs36') - 0.15 * z('defRtg') + 0.2 * z('stocksPerFoul') + 0.1 * z('charges36') + 0.1 * z('deflections36') + 0.1 * z('exp') - 0.1 * z('dOverallDiff'),
  closeout: (z) => 0.4 * z('contested3_36') - 0.3 * z('d_spotPPP') - 0.3 * z('d3Diff'),
  defensiveRebounding: (z) => 0.65 * z('drebPct') + 0.15 * z('boxDef36') + 0.2 * z('drebContest36'),

  offensiveIQ: (z) => 0.2 * z('ts') + 0.15 * z('astTo') + 0.15 * z('offRtg') + 0.1 * z('shotQuality') + 0.15 * z('exp') + 0.15 * z('pie') - 0.1 * z('tovPct'),
  clutch: (z) => 0.3 * z('clutchPts36') + 0.3 * z('clutchTs') + 0.2 * z('clutchPm36') + 0.2 * z('clutchShare'),
  consistency: (z) => -0.7 * z('gameCv') + 0.2 * z('mpg') + 0.1 * z('pie'),
  discipline: (z) => -0.5 * z('pf36Rel') - 0.3 * z('techRate') - 0.2 * z('tovPct'),
  competitiveness: (z) => 0.25 * z('loose36') + 0.1 * z('charges36') + 0.15 * z('deflections36') + 0.1 * z('contested36') + 0.1 * z('orebContest36') + 0.1 * z('clutchShare') + 0.2 * z('pie'),
  focus: (z) => 0.3 * z('ftPct') - 0.2 * z('tovPct') - 0.25 * z('gameCv') - 0.1 * z('pf36Rel') + 0.15 * z('csEfg'),
  // valor defensivo e de produção (não são atributos; alimentam o Overall-alvo)
  _defValue: (z) => 0.5 * z('defWs36') - 0.25 * z('defRtg') + 0.15 * z('deflections36') + 0.1 * z('blk36'),
};

const SKILL_ATTRS = ATTRIBUTE_GROUPS.filter((g) => g.id !== 'physical').flatMap((g) => g.attributes.map((a) => a.key));

// ---------------------------------------------------------------- físico
function ageDecline(age, start, rate, lateStart, lateRate) {
  return Math.max(0, age - start) * rate + Math.max(0, age - lateStart) * lateRate;
}

function physicalAttributes(bio, zr, zg) {
  const h = bio.heightIn || 78;
  const wt = bio.weight || EXPECTED_WEIGHT(h);
  const age = bio.age ?? 26;
  const cb = bio.combine ?? {};
  const yearsSinceCombine = cb.year ? Math.max(0, (bio.snapshotYear ?? 2026) - cb.year) : 0;
  const n = (key, amp) => stableNoise(bio.id, key) * amp;
  const blend = (prior, measured, weight) => (measured == null ? prior : prior * (1 - weight) + measured * weight);

  let speed = 78 - 2.0 * (h - 78) - 0.1 * (wt - 215) + clamp(3 * zg('speedOff') + 2 * zr('transPoss36') + 1.5 * zr('drives36'), -7, 7) + n('speed', 2);
  const sprint = cb.sprint ? 75 + ((3.25 - cb.sprint) / 0.05) * 2.2 : null;
  speed = blend(speed, sprint, yearsSinceCombine <= 6 ? 0.4 : 0.2) - ageDecline(age, 29, 1.0, 33, 0.7);

  let agility = 76 - 1.9 * (h - 78) - 0.12 * (wt - 215) + clamp(2.5 * zg('speedDef') + 2 * zr('deflections36'), -6, 6) + n('agility', 2);
  const lane = cb.laneAgility ? 75 + (11.0 - cb.laneAgility) * 14 : null;
  agility = blend(agility, lane, yearsSinceCombine <= 6 ? 0.35 : 0.15) - ageDecline(age, 29, 0.9, 33, 0.6);

  let acceleration = 79 - 2.0 * (h - 78) - 0.16 * (wt - 215) + clamp(3 * zg('drives36') + 1.5 * zr('stl36') + 1.5 * zr('transPoss36'), -7, 7) + n('accel', 2);
  acceleration = blend(acceleration, sprint == null ? null : (sprint + (lane ?? sprint)) / 2, yearsSinceCombine <= 6 ? 0.35 : 0.15) - ageDecline(age, 28, 1.2, 32, 0.7);

  let strength = 55 + 0.42 * (wt - 215) + 0.6 * (h - 78) + clamp(2.5 * zg('postPoss36') + 2 * zg('boxDef36') + 1.5 * zr('ftr'), -6, 6) + n('strength', 2);
  if (cb.bench != null) strength += clamp((cb.bench - 10) * 0.6, -5, 6);
  strength += -Math.max(0, 24 - age) * 1.3 - ageDecline(age, 32, 0.6, 36, 0.6);

  let vertical = 70 - 1.0 * (h - 78) - 0.08 * (wt - 215) + clamp(5 * zg('blk36') + 3 * zg('orebPct') + 3 * zg('cutPoss36'), -9, 10) + n('vertical', 2.5);
  const jump = cb.maxVertical ? 68 + (cb.maxVertical - 35) * 3.0 : null;
  vertical = blend(vertical, jump, yearsSinceCombine <= 6 ? 0.6 : 0.3) - ageDecline(age, 28, 1.1, 32, 0.7);

  const stamina = 66 + 7 * clamp(zr('mpg'), -1.2, 2.5) + 3 * clamp(zr('distPerMin'), -2, 2) - ageDecline(age, 31, 0.8, 35, 0.8) + n('stamina', 2);
  const balance = 62 + 0.1 * (wt - EXPECTED_WEIGHT(h)) + 4 * clamp(zr('andOne36'), -2, 2.5) - 3 * clamp(zr('driveTovPct'), -2, 2) + 3 * clamp(zr('ftr'), -2, 2) + n('balance', 3);
  return {
    speed: clamp(speed, 30, 98), acceleration: clamp(acceleration, 28, 98), strength: clamp(strength, 25, 98), vertical: clamp(vertical, 30, 98),
    stamina: clamp(stamina, 45, 97), agility: clamp(agility, 28, 97), balance: clamp(balance, 38, 96),
  };
}

/** Disponibilidade histórica → resistência física. Só conta temporadas em que era jogador de rotação. */
function durabilityRating(bio) {
  const seasons = (bio.careerSeasons ?? []).filter((s) => s.mpg >= 18 && s.year <= (bio.snapshotYear ?? 2026)).slice(-4).reverse();
  const n = stableNoise(bio.id, 'durability');
  let rating;
  if (!seasons.length) {
    rating = 73 + n * 6;
  } else {
    const weights = [1, 0.8, 0.6, 0.4];
    let got = 0;
    let max = 0;
    seasons.forEach((s, i) => {
      const teamGames = s.year === 2020 ? 70 : s.year === 2021 ? 72 : 82;
      got += Math.min(s.gp, teamGames) * weights[i];
      max += teamGames * weights[i];
    });
    const availability = got / max;
    rating = 40 + 55 * Math.pow(availability, 1.5) + n * 3;
    // pouca história pesa menos: uma temporada não define um jogador
    const trust = Math.min(1, seasons.length / 3);
    rating = rating * trust + 73 * (1 - trust);
  }
  rating -= ageDecline(bio.age ?? 26, 32, 1.0, 36, 1.0);
  if (bio.injuryStatus === 'Out') rating -= 4;
  return clamp(rating, 30, 97);
}

// ---------------------------------------------------------------- Overall-alvo de novatos
function rookieTarget(bio) {
  const pick = bio.draft?.pick;
  const n = stableNoise(bio.id, 'rookieTarget') * 1.5;
  if (!pick) return 61 + n;
  return interp([[1, 79], [3, 77], [5, 75], [10, 72.5], [14, 71], [20, 69], [30, 66.5], [31, 66], [45, 64], [60, 62]], pick) + n;
}

// ---------------------------------------------------------------- potencial
// Estimativa inicial — o potencial é dinâmico e será revisto a cada temporada.
function initialPotential(bio, overall, valueZ, workEthic) {
  const age = bio.age ?? 26;
  const headroom = interp([[18, 15], [19, 14], [20, 12], [21, 10], [22, 8], [23, 6], [24, 4.5], [25, 3], [26, 1.5], [27, 0.6], [29, 0]], age);
  const yearsPro = bio.exp ?? 0;
  const pick = bio.draft?.pick;
  let pedigree = 0;
  if (pick && yearsPro <= 4) pedigree = pick <= 5 ? 2.5 : pick <= 14 ? 1.5 : pick <= 30 ? 0.5 : 0;
  const production = age <= 23 && valueZ != null ? clamp(valueZ, -1, 2) * 1.5 : 0;
  const ethic = ((workEthic - 68) / 20) * 1.5;
  const unknown = stableNoise(bio.id, 'potential') * (age <= 22 ? 3 : 1.5);
  const mult = age <= 26 ? 1 : 0.5;
  // quanto mais perto do teto da escala, menos espaço real para crescer
  const room = clamp((97 - overall) / 22, 0.15, 1.2);
  return clamp(overall + Math.max(0, headroom + (pedigree + production + ethic + unknown) * mult) * room, overall, 99);
}

/** Mínimos quadrados (equações normais) para poucas variáveis. */
function leastSquares(X, y) {
  const n = X[0].length;
  const A = Array.from({ length: n }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (j < n ? X.reduce((a, r) => a + r[i] * r[j], 0) : X.reduce((a, r, k) => a + r[i] * y[k], 0))));
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[pivot][i])) pivot = r;
    [A[i], A[pivot]] = [A[pivot], A[i]];
    if (Math.abs(A[i][i]) < 1e-9) continue;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = A[r][i] / A[i][i];
      for (let c = i; c <= n; c++) A[r][c] -= f * A[i][c];
    }
  }
  return A.map((row, i) => (Math.abs(row[i]) < 1e-9 ? 0 : row[n] / row[i]));
}

// ---------------------------------------------------------------- modelo
/**
 * @param players [{ id, heightIn, weight, age, exp, positionLabel, draft, combine, careerSeasons, techRate, injuryStatus, mpg }]
 * @param features Map<id, { pooled, logs }> de loadPlayerFeatures
 */
export function buildRatings(players, features) {
  // 1. taxas por jogador
  const rows = players.map((bio) => {
    const f = features.get(bio.id);
    const r = f ? deriveRates(f.pooled, bio.mpg ?? 0) : null;
    if (r) {
      r.heightIn = bio.heightIn || 78;
      r.weight = bio.weight || EXPECTED_WEIGHT(r.heightIn);
      r.exp = Math.min(bio.exp ?? 0, 14);
      r.techRate = bio.techRate ?? 0;
      r.gameCv = f.logs.cv ?? NaN;
      r.chasePoss36 = r.d_prbhPoss36 + r.d_offScreenPoss36 + r.d_handoffPoss36;
    }
    return { bio, r, f };
  });
  const withData = rows.filter((x) => x.r);
  const ref = withData.filter((x) => x.r.wMin >= REF_MIN);

  // 2. z-scores league-wide
  const keys = Object.keys(ref[0].r);
  const dist = {};
  for (const k of keys) {
    const vals = ref.map((x) => x.r[k]).filter(Number.isFinite);
    const mu = mean(vals);
    const sd = Math.sqrt(mean(vals.map((v) => (v - mu) ** 2))) || 1;
    dist[k] = { mu, sd };
  }
  const zOf = (r) => (k) => {
    const d = dist[k];
    if (!d) throw new Error(`Indicador desconhecido: ${k}`);
    const v = r[k];
    return Number.isFinite(v) ? clamp((v - d.mu) / d.sd, -3, 3) : 0;
  };

  // 3. posições (usa apenas z-scores gerais)
  for (const x of rows) {
    Object.assign(x, derivePositions(x.bio, x.r ? zOf(x.r) : null));
    x.group = groupOf(x.positionValue);
  }

  // faltas relativas à posição (pivôs fazem mais faltas por função, não por indisciplina)
  const groupMean = (k, g) => mean(ref.filter((x) => x.group === g).map((x) => x.r[k]));
  const pfMean = { G: groupMean('pf36', 'G'), W: groupMean('pf36', 'W'), B: groupMean('pf36', 'B') };
  for (const x of withData) x.r.pf36Rel = x.r.pf36 - pfMean[x.group];
  {
    const vals = ref.map((x) => x.r.pf36Rel);
    const mu = mean(vals);
    dist.pf36Rel = { mu, sd: Math.sqrt(mean(vals.map((v) => (v - mu) ** 2))) || 1 };
  }
  // z dentro do grupo de posição (para sinais físicos confundidos com tamanho)
  const groupDist = {};
  for (const g of ['G', 'W', 'B']) {
    groupDist[g] = {};
    const members = ref.filter((x) => x.group === g);
    for (const k of ['speedOff', 'speedDef', 'drives36', 'postPoss36', 'boxDef36', 'blk36', 'orebPct', 'cutPoss36']) {
      const vals = members.map((x) => x.r[k]);
      const mu = mean(vals);
      groupDist[g][k] = { mu, sd: Math.sqrt(mean(vals.map((v) => (v - mu) ** 2))) || 1 };
    }
  }
  const zGroupOf = (x) => (k) => clamp((x.r[k] - groupDist[x.group][k].mu) / groupDist[x.group][k].sd, -3, 3);

  // 4. compostos → encolhimento por amostra → percentil → rating
  const compNames = Object.keys(COMPOSITES);
  for (const x of withData) {
    const z = zOf(x.r);
    x.comp = Object.fromEntries(compNames.map((c) => [c, COMPOSITES[c](z)]));
  }
  const prior = {};
  for (const g of ['G', 'W', 'B']) {
    const members = ref.filter((x) => x.group === g);
    prior[g] = Object.fromEntries(compNames.map((c) => [c, median(members.map((x) => x.comp[c]))]));
  }
  for (const x of withData) {
    const wgt = x.r.wMin / (x.r.wMin + SAMPLE_K);
    for (const c of compNames) x.comp[c] = x.comp[c] * wgt + prior[x.group][c] * (1 - wgt);
    // clutch e consistência dependem de amostras próprias
    const clutchTrust = x.r.clutchMin / (x.r.clutchMin + 45);
    x.comp.clutch = x.comp.clutch * clutchTrust + prior[x.group].clutch * (1 - clutchTrust);
    if (!Number.isFinite(x.r.gameCv)) x.comp.consistency = prior[x.group].consistency - 0.4;
  }
  const sorted = Object.fromEntries(compNames.map((c) => [c, ref.map((x) => x.comp[c]).sort((a, b) => a - b)]));
  const rate = (x, c) => interp(SKILL_CURVE, percentileOf(sorted[c], x.comp[c]));

  // 5. valor de produção → Overall-alvo
  // Produção por jogo (qualidade × papel) pesa mais do que taxas por minuto: um reserva
  // eficiente em 12 minutos não vale o mesmo que um titular de 34.
  const wide = (r, k) => (Number.isFinite(r[k]) ? clamp((r[k] - dist[k].mu) / dist[k].sd, -3, 4.5) : 0);
  const defMu = mean(sorted._defValue);
  const defSd = Math.sqrt(mean(sorted._defValue.map((v) => (v - defMu) ** 2))) || 1;
  for (const x of withData) {
    const z = zOf(x.r);
    const def = clamp((x.comp._defValue - defMu) / defSd, -2.5, 2.5);
    const raw = 0.4 * wide(x.r, 'gsPg') + 0.2 * wide(x.r, 'pie') + 0.15 * z('mpg') + 0.1 * z('netRtg') + 0.15 * def;
    const wgt = x.r.wMin / (x.r.wMin + SAMPLE_K);
    x.value = raw * wgt + -1.3 * (1 - wgt);
  }
  const sortedValue = ref.map((x) => x.value).sort((a, b) => a - b);
  const valueMu = mean(sortedValue);
  const valueSd = Math.sqrt(mean(sortedValue.map((v) => (v - valueMu) ** 2)));

  // 6. atributos
  for (const x of rows) {
    const { bio } = x;
    const n = (key, amp) => stableNoise(bio.id, key) * amp;
    const attrs = {};
    if (x.r) {
      const z = zOf(x.r);
      const zg = zGroupOf(x);
      for (const key of ['rimFinishing', 'layup', 'postScoring', 'midRange', 'threePoint', 'pullUp', 'catchAndShoot', 'shotCreation', 'offBallMovement', 'screenUsage', 'offensiveRebounding',
        'ballHandling', 'passing', 'passingVision', 'decisionMaking', 'transitionPlay', 'turnoverAvoidance',
        'perimeterDefense', 'interiorDefense', 'steals', 'blocks', 'screenNavigation', 'helpDefense', 'defensiveIQ', 'closeout', 'defensiveRebounding',
        'offensiveIQ', 'clutch', 'consistency', 'discipline', 'competitiveness', 'focus']) {
        attrs[key] = rate(x, key);
      }
      attrs.pickAndRoll = Math.max(rate(x, 'pnrHandler'), rate(x, 'pnrRoller'));
      attrs.freeThrow = interp(FT_CURVE, x.r.ftPct);
      Object.assign(attrs, physicalAttributes(bio, z, zg));
      // Enterrada: não há medição direta — proxy por volume no aro, jogadas acima do aro, altura e impulsão.
      const dunkSignal = 0.25 * z('raFga36') + 0.25 * mean([z('cutPoss36'), z('rollPoss36'), z('putbackPoss36')]) + 0.1 * z('transPoss36') + 0.15 * z('heightIn');
      attrs.dunk = clamp(22 + 0.62 * attrs.vertical + 9 * dunkSignal + (bio.heightIn - 78) * 0.8, 20, 98);
      attrs.competitiveness = clamp(attrs.competitiveness + n('competitiveness', 5), 30, 99);
      // Ética de trabalho e liderança não são mensuráveis em box score: proxies + incerteza declarada.
      const late = bio.draft?.pick ? clamp((bio.draft.pick - 20) / 40, -0.5, 1) : 1.2;
      const overachiever = clamp(x.value - valueMu, -1.5, 2.5) / valueSd * Math.max(0, late);
      attrs.workEthic = clamp(66 + 5 * overachiever + 2.5 * clamp(bio.improvement ?? 0, -2, 2) + 0.9 * z('ftPct') + n('workEthic', 9), 40, 97);
      const role = 0.5 * z('mpg') + 0.3 * z('usg') + 0.2 * z('pie');
      attrs.leadership = clamp(50 + 2.1 * Math.min(bio.exp ?? 0, 14) + 5 * role + Math.min(6, (bio.tenure ?? 0) * 1.2) + n('leadership', 7), 25, 98);
    }
    attrs.durability = durabilityRating(bio);
    x.attrs = attrs;
  }

  // Novatos e jogadores sem amostra: perfil = mediana "reserva" do grupo de posição + combine + ruído.
  const benchProfile = {};
  for (const g of ['G', 'W', 'B']) {
    const members = ref.filter((x) => x.group === g).sort((a, b) => a.value - b.value);
    const lower = members.slice(0, Math.max(8, Math.floor(members.length * 0.45)));
    benchProfile[g] = Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, median(lower.map((m) => m.attrs[k]))]));
  }
  for (const x of rows) {
    if (x.r) continue;
    const { bio } = x;
    const base = benchProfile[x.group];
    const zero = () => 0;
    const phys = physicalAttributes(bio, zero, zero);
    for (const k of ATTRIBUTE_KEYS) {
      if (k === 'durability') continue;
      const span = k in phys ? 0 : 7;
      x.attrs[k] = clamp((k in phys ? phys[k] : base[k]) + stableNoise(bio.id, `attr:${k}`) * span, 15, 97);
    }
    x.attrs.workEthic = clamp(68 + stableNoise(bio.id, 'workEthic') * 12, 40, 97);
    x.attrs.leadership = clamp(42 + stableNoise(bio.id, 'leadership') * 10, 25, 80);
    x.attrs.consistency = clamp(base.consistency - 6 + stableNoise(bio.id, 'attr:consistency') * 6, 25, 80);
  }

  // 7. Overall-alvo
  for (const x of rows) {
    if (x.r) {
      const pct = percentileOf(sortedValue, x.value);
      let target = interp(OVERALL_CURVE, pct);
      if (x.value < sortedValue[0]) target = Math.max(58, 65 - ((sortedValue[0] - x.value) / valueSd) * 6);
      // amostra mínima: mistura com a expectativa de draft (um novato de 80 minutos não é "conhecido")
      const trust = clamp(x.r.wMin / 600, 0, 1);
      x.target = target * trust + Math.max(target, rookieTarget(x.bio) - 2) * (1 - trust);
    } else {
      x.target = rookieTarget(x.bio);
    }
  }

  // 8. calibração: reta média-ponderada → Overall por posição, depois ajuste fino por jogador
  // Overall = a + b·s + c·max(0, s − knot): o trecho acima do nó dá a convexidade do topo
  // (a distância entre um All-Star e um MVP é maior do que entre dois titulares medianos).
  const calibration = {};
  for (const pos of POSITIONS) {
    const pts = ref.filter((x) => x.positions[0] === pos).map((x) => [positionScore(x.attrs, pos), x.target]);
    const scores = pts.map((p) => p[0]).sort((a, b) => a - b);
    const knot = Number(scores[Math.floor(scores.length * 0.7)].toFixed(2));
    const [a, b, c] = leastSquares(pts.map(([s]) => [1, s, Math.max(0, s - knot)]), pts.map((p) => p[1]));
    calibration[pos] = { a: Number(a.toFixed(3)), b: Number(b.toFixed(4)), c: Number(Math.max(0, c).toFixed(4)), knot, n: pts.length };
  }
  const exact = (attrs, pos) => {
    const { a, b, c, knot } = calibration[pos];
    const s = positionScore(attrs, pos);
    return a + b * s + c * Math.max(0, s - knot);
  };
  for (const x of rows) {
    const pos = x.positions[0];
    const weights = POSITION_WEIGHTS[pos];
    const movable = SKILL_ATTRS.filter((k) => weights[k] > 0);
    const share = movable.reduce((a, k) => a + weights[k], 0);
    const limit = !x.r ? 30 : x.r.wMin < 600 ? 16 : 10;
    let moved = 0;
    for (let i = 0; i < 8; i++) {
      const gap = x.target - exact(x.attrs, pos);
      if (Math.abs(gap) < 0.15) break;
      const cal = calibration[pos];
      const slope = cal.b + (positionScore(x.attrs, pos) > cal.knot ? cal.c : 0);
      const step = clamp(gap / (slope * share), -limit - moved, limit - moved);
      if (Math.abs(step) < 0.05) break;
      moved += step;
      for (const k of movable) x.attrs[k] = clamp(x.attrs[k] + step, 5, 99);
    }
    x.shift = Number(moved.toFixed(2));
  }

  // 9. saída
  return {
    calibration,
    referencePopulation: ref.length,
    players: rows.map((x) => {
      const attributes = Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, Math.round(clamp(x.attrs[k], 0, 99))]));
      const pos = x.positions[0];
      const overall = Math.round(clamp(exact(attributes, pos), 40, 99));
      const valueZ = x.r ? (x.value - valueMu) / valueSd : null;
      return {
        id: x.bio.id,
        positions: x.positions,
        positionValue: x.positionValue,
        attributes,
        overall,
        target: Number(x.target.toFixed(1)),
        potential: Math.round(initialPotential(x.bio, overall, valueZ, attributes.workEthic)),
        confidence: !x.r ? 'none' : x.r.wMin >= 1500 ? 'high' : x.r.wMin >= REF_MIN ? 'medium' : 'low',
        sampleMinutes: x.r ? Math.round(x.r.wMin) : 0,
        shift: x.shift,
        group: x.group,
        rates: x.r,
      };
    }),
  };
}
