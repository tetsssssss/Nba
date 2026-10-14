// MovementEngine + CollisionSystem.
// Ninguém é teletransportado: a IA só define um alvo e um modo de locomoção;
// este módulo acelera, freia, vira e separa os corpos.
import { COURT, TUNE, clamp } from './config.js';

const MODE_FACTOR = { walk: TUNE.WALK, jog: TUNE.JOG, run: TUNE.RUN, sprint: 1, set: 0 };

/** Velocidade-teto do jogador no modo atual (pés/s). */
export function speedCap(p) {
  const m = p.prof.move;
  let f = p.mode === 'slide' ? m.slide : MODE_FACTOR[p.mode] ?? TUNE.RUN;
  if (p.hasBall) f *= p.prof.handle.speedWithBall;
  if (p.speedLimit != null) f = Math.min(f, p.speedLimit / m.maxSpeed);
  return m.maxSpeed * f;
}

export function movePlayer(sim, p, dt) {
  const m = p.prof.move;
  if (p.stun > 0) p.stun -= dt;
  const dx = p.tx - p.x;
  const dy = p.ty - p.y;
  const d = Math.hypot(dx, dy);
  const cur = Math.hypot(p.vx, p.vy);
  const cap = p.stun > 0 || p.mode === 'set' ? 0 : speedCap(p);

  let wx = 0;
  let wy = 0;
  if (d > TUNE.ARRIVE_DEADZONE && cap > 0) {
    // chegada suave: freia a tempo de parar no alvo (a menos que deva passar correndo)
    const want = p.arrive === false ? cap : Math.min(cap, Math.sqrt(2 * m.decel * d) * 0.85);
    wx = (dx / d) * want;
    wy = (dy / d) * want;
    // desvio de corpos à frente (steering), sem zigue-zague: só empurra para o lado livre
    if (!p.noAvoid && want > 2) {
      const ax = dx / d;
      const ay = dy / d;
      for (const o of sim.court) {
        if (o === p || o === p.ignore) continue;
        const ox = o.x - p.x;
        const oy = o.y - p.y;
        const ahead = ox * ax + oy * ay;
        if (ahead < 0.4 || ahead > Math.min(TUNE.AVOID_DISTANCE, d)) continue;
        const side = ox * -ay + oy * ax; // lado do obstáculo em relação à rota
        const clear = TUNE.COLLISION_RADIUS * 2.1;
        if (Math.abs(side) > clear) continue;
        const push = (1 - Math.abs(side) / clear) * (1 - ahead / TUNE.AVOID_DISTANCE) * TUNE.AVOID_STRENGTH * want;
        const s = side >= 0 ? -1 : 1;
        wx += -ay * s * push;
        wy += ax * s * push;
      }
      const wl = Math.hypot(wx, wy);
      if (wl > want) {
        wx = (wx / wl) * want;
        wy = (wy / wl) * want;
      }
    }
  }

  // mudança brusca de direção custa velocidade (menos para quem é ágil)
  const wl = Math.hypot(wx, wy);
  if (cur > 4 && wl > 1) {
    const cos = (p.vx * wx + p.vy * wy) / (cur * wl);
    if (cos < 0.75) {
      const loss = ((0.75 - cos) / 1.75) * (1 - 0.8 * m.agility) * TUNE.TURN_SPEED_LOSS * dt;
      p.vx *= 1 - Math.min(0.5, loss);
      p.vy *= 1 - Math.min(0.5, loss);
    }
  }

  // aceleração limitada: 0 → velocidade máxima leva tempo; frear é mais rápido que arrancar
  let ax = wx - p.vx;
  let ay = wy - p.vy;
  const al = Math.hypot(ax, ay);
  const braking = wl < cur;
  const limit = (braking ? m.decel : m.accel * Math.min(1.6, p.burst ?? 1)) * dt;
  if (al > limit) {
    ax = (ax / al) * limit;
    ay = (ay / al) * limit;
  }
  p.vx += ax;
  p.vy += ay;
  if (wl === 0 && Math.hypot(p.vx, p.vy) < 0.25) {
    p.vx = 0;
    p.vy = 0;
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  // limites da quadra (faixa mínima fora das linhas)
  p.x = clamp(p.x, -2, COURT.L + 2);
  p.y = clamp(p.y, -2, COURT.W + 2);

  // orientação corporal separada do deslocamento: defensor desliza olhando para o atacante
  let fa = null;
  if (p.face) fa = Math.atan2(p.face.y - p.y, p.face.x - p.x);
  else if (Math.hypot(p.vx, p.vy) > 1.5) fa = Math.atan2(p.vy, p.vx);
  if (fa != null) {
    let diff = fa - p.facing;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    p.facing += clamp(diff, -9 * dt, 9 * dt);
  }
  p.effort = Math.hypot(p.vx, p.vy) / m.maxSpeed;
}

/** Contato corporal suave: separa sobreposições proporcionalmente à massa. Sem pinball. */
export function resolveCollisions(sim) {
  const list = sim.court;
  const R = TUNE.COLLISION_RADIUS;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = R * 2;
      if (d >= min || d < 1e-6) continue;
      const nx = dx / d;
      const ny = dy / d;
      // quem está plantado (bloqueio, post) é muito mais difícil de deslocar
      const ma = a.prof.move.mass * (a.planted ? 5 : 1);
      const mb = b.prof.move.mass * (b.planted ? 5 : 1);
      const overlap = (min - d) * TUNE.COLLISION_STIFFNESS;
      const sa = mb / (ma + mb);
      const sb = ma / (ma + mb);
      a.x -= nx * overlap * sa;
      a.y -= ny * overlap * sa;
      b.x += nx * overlap * sb;
      b.y += ny * overlap * sb;
      // amortece só a componente de aproximação
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) {
        a.vx += nx * rel * sa * 0.5;
        a.vy += ny * rel * sa * 0.5;
        b.vx -= nx * rel * sb * 0.5;
        b.vy -= ny * rel * sb * 0.5;
      }
      a.bump = sim.t;
      b.bump = sim.t;
      if (a.team !== b.team) {
        a.contact = sim.t;
        b.contact = sim.t;
        if (a.planted === 'screen') b.screened = sim.t;
        if (b.planted === 'screen') a.screened = sim.t;
      }
    }
  }
}

/** Posição/velocidade de `p` como vista `delay` segundos atrás (tempo de reação do defensor). */
export function perceived(p, delay, dt = TUNE.DT) {
  const h = p.hist;
  const back = Math.min(h.length - 1, Math.round(delay / dt));
  return h.length ? h[h.length - 1 - back] : p;
}

export function recordHistory(p) {
  p.hist.push({ x: p.x, y: p.y, vx: p.vx, vy: p.vy });
  if (p.hist.length > 36) p.hist.shift();
}
