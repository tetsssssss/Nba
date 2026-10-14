// BallEngine: a bola tem posição (x, y), altura (z) e estado próprios.
// Passes e arremessos viajam fisicamente; interceptação, recepção e rebote
// dependem de onde os corpos realmente estão.
import { COURT, TUNE, clamp, dist, segDist } from './config.js';

export function createBall() {
  return { x: 47, y: 25, z: 4, vx: 0, vy: 0, vz: 0, state: 'loose', owner: null, t: 0, spin: 0 };
}

export function updateBall(sim, dt) {
  const b = sim.ball;
  b.spin += dt * (4 + Math.hypot(b.vx, b.vy) * 0.25);
  if (b.state === 'held') {
    const o = b.owner;
    // na mão do portador, do lado do drible; a oscilação mão-chão é desenhada pelo renderer
    const side = o.hand * 0.9;
    b.x = o.x + Math.cos(o.facing) * 0.9 - Math.sin(o.facing) * side;
    b.y = o.y + Math.sin(o.facing) * 0.9 + Math.cos(o.facing) * side;
    b.z = 3.6;
    b.vx = o.vx;
    b.vy = o.vy;
    return;
  }
  b.t += dt;
  if (b.state === 'pass') return updatePass(sim, b, dt);
  if (b.state === 'shot') {
    const u = clamp(b.t / b.T, 0, 1);
    b.x = b.x0 + (b.x1 - b.x0) * u;
    b.y = b.y0 + (b.y1 - b.y0) * u;
    b.z = b.z0 + (b.z1 - b.z0) * u + b.arc * 4 * u * (1 - u); // arco parabólico
    if (u >= 1) sim.shotArrived();
    return;
  }
  // ---- bola solta / rebote
  if (b.fall) {
    const u = clamp(b.t / b.T, 0, 1);
    b.x = b.x0 + (b.x1 - b.x0) * u;
    b.y = b.y0 + (b.y1 - b.y0) * u;
    b.z = b.z0 * (1 - u) + b.arc * 4 * u * (1 - u);
    if (u >= 1) {
      b.fall = false;
      b.vx = ((b.x1 - b.x0) / b.T) * 0.45;
      b.vy = ((b.y1 - b.y0) / b.T) * 0.45;
      b.vz = 9;
      b.z = 0.1;
    }
  } else {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.vz -= 32 * dt;
    b.z += b.vz * dt;
    if (b.z < 0.4) {
      b.z = 0.4;
      b.vz = Math.abs(b.vz) * 0.55;
      b.vx *= 0.9;
      b.vy *= 0.9;
    }
    const drag = Math.exp(-0.5 * dt);
    b.vx *= drag;
    b.vy *= drag;
  }
  if (b.x < -1 || b.x > COURT.L + 1 || b.y < -1 || b.y > COURT.W + 1) return sim.outOfBounds();
  if (b.t < (b.minT ?? 0)) return;
  tryPickup(sim, b);
}

function updatePass(sim, b, dt) {
  // varredura: a bola anda mais de um pé por passo, então o teste é contra o trecho percorrido
  const px = b.x;
  const py = b.y;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  const swept = (o) => segDist(px, py, b.x, b.y, o.x, o.y).d;
  const u = clamp(b.t / b.T, 0, 1);
  b.z = b.kind === 'lob' ? 5 + 9 * 4 * u * (1 - u) : b.kind === 'bounce' ? 3.6 * Math.abs(1 - 2 * Math.min(1, u * 1.15)) + 0.4 : b.kind === 'overhead' ? 7 - 1.5 * u : 4.2;
  // interceptação: só quem está fisicamente na linha, já reagiu e alcança a altura da bola
  for (const d of sim.court) {
    if (d.team === b.from.team || d.stun > 0 || b.checked.has(d)) continue;
    const dd = swept(d);
    const reach = 1.5 + 1.5 * d.prof.def.steal;
    if (dd > reach || b.z > d.prof.def.reach + 0.3) continue;
    if (b.t < d.prof.def.reaction * 0.75) continue; // não deu tempo de reagir
    b.checked.add(d);
    const p = (0.16 + 0.62 * d.prof.def.steal) * TUNE.INTERCEPT_SCALE * sim.sl.steals * Math.sqrt(sim.sl.turnovers) * (b.kind === 'bounce' ? 0.7 : 1) * (1 - dd / (reach * 1.6));
    if (sim.rng.next() < p) return sim.intercepted(d);
  }
  // recepção
  const to = b.to;
  const dr = swept(to);
  if (dr < 2.2 && b.z < to.prof.def.reach + 0.6 && b.t > 0.08) return sim.giveBall(to, 'pass');
  if (b.t > b.T + 0.12) {
    // passou do ponto sem ser dominada: bola solta de verdade
    b.state = 'loose';
    b.fall = false;
    b.vz = 0;
    b.minT = 0;
    b.t = 0;
    b.reserved = null;
    b.loosePass = true;
  }
}

/** Disputa da bola solta. No rebote, vários podem alcançá-la: posição, alcance e técnica decidem. */
function tryPickup(sim, b) {
  const cands = [];
  for (const p of sim.court) {
    if (b.reserved != null && p.team !== b.reserved) continue;
    if (p.stun > 0) continue;
    const d = dist(p, b);
    const reach = b.rebound ? p.prof.reb.reach : 7.5;
    if (d <= (b.rebound ? 3.3 : TUNE.PICKUP_RADIUS) && b.z <= reach) cands.push({ p, d });
  }
  if (!cands.length) return;
  if (!b.rebound) {
    cands.sort((a, c) => a.d - c.d);
    return sim.giveBall(cands[0].p, 'loose');
  }
  const offense = sim.offense;
  const weights = cands.map(({ p, d }) => {
    const skill = p.team === offense ? p.prof.reb.off * 0.7 * sim.sl.oreb : p.prof.reb.def;
    let w = (0.25 + skill) * Math.pow(p.prof.reb.reach / 10, 3) * (1.6 - d / 3.3);
    // box out: adversário entre mim e a bola me tira a jogada
    for (const o of sim.court) {
      if (o.team === p.team) continue;
      const od = dist(o, b);
      if (od < d && dist(o, p) < 2.9) w *= 0.5 - 0.25 * o.prof.reb.boxOut;
    }
    return [p, Math.max(0.02, w)];
  });
  sim.giveBall(sim.rng.weighted(weights), 'rebound');
}
