// Qualidade de arremesso: contest + tipo + distância + equilíbrio + fadiga.
// Usado tanto para DECIDIR (o jogador estima a própria chance) quanto para RESOLVER.
import { TUNE, clamp, dist, hoopOf, isThree } from './config.js';

export const CONTEST_LEVELS = ['livre', 'levemente contestado', 'contestado', 'muito contestado', 'sufocado'];
const levelOf = (c) => (c < 0.2 ? 0 : c < 0.38 ? 1 : c < 0.58 ? 2 : c < 0.78 ? 3 : 4);

/**
 * Contest sofrido por `shooter` agora. Não é só distância: conta posição (entre o
 * arremessador e a cesta), alcance/impulsão do defensor e se ele já percebeu o arremesso.
 */
export function contestOn(sim, shooter, lookahead = 0) {
  const hoop = hoopOf(sim.dirOf(shooter.team));
  const hx = hoop.x - shooter.x;
  const hy = hoop.y - shooter.y;
  const hl = Math.hypot(hx, hy) || 1;
  let best = 0;
  let second = 0;
  let by = null;
  for (const d of sim.court) {
    if (d.team === shooter.team) continue;
    const dx = d.x - shooter.x;
    const dy = d.y - shooter.y;
    let dd = Math.hypot(dx, dy);
    if (dd > 14) continue;
    // previsão: até a bola sair, o defensor ainda fecha parte da distância
    if (lookahead > 0 && d.stun <= 0) {
      const closing = Math.max(0, -(d.vx * dx + d.vy * dy) / (dd || 1));
      dd = Math.max(1.3, dd - closing * lookahead - 0.4 * d.prof.move.accel * lookahead * lookahead);
    }
    if (dd > 9) continue;
    const front = 0.4 + 0.6 * Math.max(0, (dx * hx + dy * hy) / ((dd || 1) * hl));
    const reach = clamp(1 + (d.prof.def.reach - shooter.prof.def.reach) * 0.11, 0.6, 1.45);
    const gatherAge = shooter.act.type === 'gather' ? sim.t - shooter.act.t0 : 0.2;
    const aware = d.stun > 0 ? 0.15 : gatherAge >= d.prof.def.reaction * 0.6 || (d.man === shooter && dd < 4.5) ? 1 : 0.6;
    const c = reach * front * aware * Math.exp(-Math.pow(dd / TUNE.CONTEST_RANGE, 1.5)) * (0.85 + 0.3 * d.prof.tend.contest);
    if (c > best) {
      second = best;
      best = c;
      by = d;
    } else if (c > second) second = c;
  }
  const value = clamp(best + 0.3 * second, 0, 1);
  return { value, level: levelOf(value), by };
}

/** Tipo de arremesso natural para a situação atual do jogador. */
export function naturalShotType(sim, p, hint) {
  if (hint) return hint;
  const hoop = hoopOf(sim.dirOf(p.team));
  const d = dist(p, hoop);
  const speed = Math.hypot(p.vx, p.vy);
  if (d <= 6) {
    const f = p.prof.finish;
    const momentum = speed > 7 || d < 2.5;
    return f.canDunk && momentum && d <= 5 && f.dunk > 0.5 ? 'dunk' : 'layup';
  }
  if (d <= 11) return speed > 5 ? 'floater' : p.act.type === 'post' ? 'hook' : 'floater';
  return isThree(sim.dirOf(p.team), p.x, p.y) ? 'three' : 'mid';
}

/**
 * @returns { type, points, dist, pMake, quality (0-100), contest, level, catchShoot }
 */
export function evaluateShot(sim, p, { type = null, contest = null, predict = false } = {}) {
  const dir = sim.dirOf(p.team);
  const hoop = hoopOf(dir);
  const d = dist(p, hoop);
  const kind = naturalShotType(sim, p, type);
  const c = contest ?? contestOn(sim, p, predict ? (kind === "dunk" || kind === "layup" ? 0.2 : p.prof.shoot.gather) : 0);
  const sh = p.prof.shoot;
  const fin = p.prof.finish;
  const speed = Math.hypot(p.vx, p.vy);
  const catchShoot = !p.dribbled && sim.t - p.catchT < 2.2;
  const three = (kind === 'three' || kind === 'stepback' || kind === 'pullup' || kind === 'mid' || kind === 'fadeaway') && isThree(dir, p.x, p.y);
  let pm;
  let rim = false;
  switch (kind) {
    case 'dunk':
      pm = TUNE.DUNK_BASE + TUNE.DUNK_SKILL * fin.dunk;
      rim = true;
      break;
    case 'layup':
      pm = TUNE.LAYUP_BASE + TUNE.LAYUP_SKILL * fin.layup - Math.max(0, d - 4) * 0.03;
      rim = true;
      break;
    case 'floater':
      pm = TUNE.SHORT_BASE + TUNE.SHORT_SKILL * (0.5 * fin.layup + 0.5 * sh.mid) - Math.max(0, d - 8) * 0.012;
      break;
    case 'hook':
      pm = TUNE.HOOK_BASE + TUNE.HOOK_SKILL * fin.post - Math.max(0, d - 6) * 0.014;
      break;
    default: {
      const move = kind === 'stepback' || kind === 'pullup' || !catchShoot;
      if (three) {
        const skill = move ? 0.5 * sh.three + 0.5 * sh.pullUp : 0.5 * sh.three + 0.5 * sh.catchShoot;
        pm = TUNE.THREE_BASE + TUNE.THREE_SKILL * skill - (move ? 0.015 : 0) - (kind === 'stepback' ? 0.02 : 0) - Math.max(0, d - 25) * 0.014;
      } else if (kind === 'fadeaway') {
        pm = TUNE.MID_BASE - 0.03 + TUNE.MID_SKILL * (0.5 * fin.post + 0.5 * sh.mid);
      } else {
        const skill = move ? 0.5 * sh.mid + 0.5 * sh.pullUp : 0.5 * sh.mid + 0.5 * sh.catchShoot;
        pm = TUNE.MID_BASE + TUNE.MID_SKILL * skill - Math.max(0, d - 14) * 0.004;
      }
      // arremessar em movimento desequilibra — menos para quem domina o pull-up
      pm -= Math.min(0.07, speed * 0.005) * (1 - 0.6 * sh.pullUp);
    }
  }
  pm -= sh.fatiguePenalty;
  if (sim.isClutch?.()) pm += (sh.clutch - 0.6) * 0.035;
  pm *= 1 - c.value * (rim ? TUNE.CONTEST_RIM : TUNE.CONTEST_JUMPER);
  pm = clamp(pm * TUNE.SHOT_SCALE, 0.02, 0.97);
  const points = three ? 3 : 2;
  return { type: kind, points, dist: d, pMake: pm, quality: Math.round(clamp((pm * points) / 1.45, 0, 1) * 100), contest: c.value, level: c.level, by: c.by, catchShoot, rim, three };
}
