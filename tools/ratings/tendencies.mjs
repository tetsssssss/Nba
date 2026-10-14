// Tendências iniciais a partir de frequências reais. Ver src/players/tendencies.js.
import { TENDENCY_KEYS } from '../../src/players/tendencies.js';
import { stableNoise } from '../../src/core/rng.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const div = (a, b) => (b > 0 ? a / b : 0);

function percentileOf(sorted, v) {
  if (v <= sorted[0]) return 0;
  if (v >= sorted.at(-1)) return 1;
  let lo = 0;
  let hi = sorted.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= v) lo = mid;
    else hi = mid;
  }
  return (lo + div(v - sorted[lo], sorted[hi] - sorted[lo])) / (sorted.length - 1);
}

// Valor bruto de cada tendência. `share` = fração direta (escala fixa); `pct` = percentil na liga.
const RAW = {
  threePointFreq: { share: 0.75, of: (r) => r.pctFga3 },
  rimAttackFreq: { share: 0.6, of: (r) => div(r.raFga36, r.fga36) },
  midRangeFreq: { share: 0.4, of: (r) => div(r.midFga36, r.fga36) },
  pullUpFreq: { share: 0.6, of: (r) => div(r.puFga36, r.fga36) },
  catchShootFreq: { share: 0.7, of: (r) => div(r.csFga36, r.fga36) },
  stepbackFreq: { pct: true, of: (r) => r.pu3a36 },
  drawFoul: { pct: true, of: (r) => r.ftr },
  isoFreq: { share: 0.25, of: (r) => r.isoFreq },
  postUpFreq: { share: 0.25, of: (r) => r.postFreq },
  pnrHandlerFreq: { share: 0.5, of: (r) => r.prbhFreq },
  pnrRollFreq: { share: 0.35, of: (r) => r.rollFreq },
  transitionFreq: { share: 0.3, of: (r) => r.transFreq },
  cutFreq: { share: 0.25, of: (r) => r.cutFreq },
  offScreenFreq: { share: 0.2, of: (r) => r.offScreenFreq },
  handoffFreq: { share: 0.15, of: (r) => r.handoffFreq },
  spotUpFreq: { share: 0.5, of: (r) => r.spotFreq },
  putbackFreq: { share: 0.2, of: (r) => r.putbackFreq },
  driveFreq: { pct: true, of: (r) => r.drives36 },
  passFirst: { pct: true, of: (r) => r.passPerTouch * 0.5 + r.astPct },
  extraPass: { pct: true, of: (r) => r.secAst36 },
  driveAndKick: { share: 0.6, of: (r) => r.drivePassPct },
  holdBall: { pct: true, of: (r) => r.secPerTouch },
  dribbleHeavy: { pct: true, of: (r) => r.dribPerTouch },
  pushPace: { pct: true, of: (r) => r.transPoss36 + r.ptsFb36 * 0.5 },
  crashOffensiveGlass: { pct: true, of: (r) => r.orebChances36 },
  lookForStar: { pct: true, of: (r) => r.passPerTouch - r.usg * 2 },
  contestShots: { pct: true, of: (r) => r.contested36 },
  gambleForSteals: { pct: true, of: (r) => r.stl36 + r.deflections36 * 0.4 },
  blockAttempts: { pct: true, of: (r) => r.blk36 + r.contested2_36 * 0.1 },
  takeCharges: { pct: true, of: (r) => r.charges36 },
  foulProne: { pct: true, of: (r) => r.pf36 },
  clutchShotTaking: { pct: true, of: (r) => (r.clutchMin >= 20 ? div(r.clutchFga36, r.fga36) : NaN) },
  clutchPassing: { share: 0.5, of: (r) => (r.clutchMin >= 20 ? div(r.clutchAst36, r.clutchAst36 + r.clutchFga36) : div(r.ast36, r.ast36 + r.fga36)) },
};

/** @param rated saída de buildRatings().players (com `rates` e `group`) */
export function buildTendencies(rated) {
  const ref = rated.filter((p) => p.rates && p.rates.wMin >= 500);
  const sorted = {};
  for (const key of TENDENCY_KEYS) {
    if (RAW[key].pct) sorted[key] = ref.map((p) => RAW[key].of(p.rates)).filter(Number.isFinite).sort((a, b) => a - b);
  }
  const value = (p, key) => {
    const def = RAW[key];
    const raw = def.of(p.rates);
    if (!Number.isFinite(raw)) return null;
    return clamp(Math.round((def.pct ? percentileOf(sorted[key], raw) : raw / def.share) * 100), 0, 100);
  };
  const known = new Map(ref.map((p) => [p.id, Object.fromEntries(TENDENCY_KEYS.map((k) => [k, value(p, k)]))]));
  // mediana por grupo de posição: prior para amostras pequenas e para quem não tem dados
  const groupMedian = {};
  for (const g of ['G', 'W', 'B']) {
    groupMedian[g] = {};
    for (const key of TENDENCY_KEYS) {
      const vals = ref.filter((p) => p.group === g).map((p) => known.get(p.id)[key]).filter((v) => v != null).sort((a, b) => a - b);
      groupMedian[g][key] = vals.length ? vals[Math.floor(vals.length / 2)] : 50;
    }
  }
  const out = new Map();
  for (const p of rated) {
    const prior = groupMedian[p.group];
    const t = {};
    for (const key of TENDENCY_KEYS) {
      const noise = Math.round(stableNoise(p.id, `tend:${key}`) * 6);
      if (!p.rates) {
        t[key] = clamp(prior[key] + noise, 0, 100);
        continue;
      }
      const v = known.get(p.id)?.[key] ?? value(p, key);
      const trust = p.rates.wMin / (p.rates.wMin + 200);
      t[key] = v == null ? clamp(prior[key] + noise, 0, 100) : clamp(Math.round(v * trust + prior[key] * (1 - trust)), 0, 100);
    }
    out.set(p.id, t);
  }
  return out;
}
