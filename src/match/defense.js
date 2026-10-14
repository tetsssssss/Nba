// IA defensiva: relação bola-homem-cesta, contenção com tempo de reação,
// ajuda, closeout, cobertura de pick and roll e box out.
import { TUNE, clamp, dist, hoopOf, lerp } from './config.js';
import { perceived } from './movement.js';

const unit = (x, y) => {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};

function setTarget(d, x, y, mode, face) {
  d.tx = x;
  d.ty = y;
  d.mode = mode;
  d.face = face ?? null;
}

/** Escolhe quem roda para parar uma infiltração: o mais bem posicionado, com preferência a protetores de aro. */
export function pickHelper(sim, handler, onBall) {
  const hoop = hoopOf(sim.dirOf(handler.team));
  const dh = dist(handler, hoop);
  if (dh > 24 || dh < 3) return null;
  const beaten = !onBall || onBall.stun > 0 || dist(onBall, hoop) > dh - TUNE.HELP_TRIGGER + 2.2;
  if (!beaten) return null;
  const [ux, uy] = unit(handler.x - hoop.x, handler.y - hoop.y);
  const spot = { x: hoop.x + ux * Math.min(5, dh * 0.5), y: hoop.y + uy * Math.min(5, dh * 0.5) };
  let best = null;
  let bestCost = 14;
  for (const d of sim.court) {
    if (d.team === handler.team || d === onBall) continue;
    const cost = dist(d, spot) - 4 * d.prof.def.help - 3 * d.prof.def.block;
    if (cost < bestCost) {
      bestCost = cost;
      best = d;
    }
  }
  return best ? { helper: best, spot } : null;
}

export function updateDefender(sim, d) {
  const man = d.man;
  const ball = sim.ball;
  const dir = sim.dirOf(sim.offense);
  const hoop = hoopOf(dir);
  const def = d.prof.def;
  d.arrive = true;
  d.planted = false;
  d.noAvoid = false;
  d.ignore = man;
  d.burst = 1;
  d.speedLimit = null;
  d.state = 'stance';
  if (!man) return setTarget(d, hoop.x - dir * 8, hoop.y, 'run', ball);

  // ---- rebote: sela o marcado e depois ataca o ponto de queda
  if (sim.reb) {
    if (sim.reb.live && sim.t - sim.reb.t0 > def.reaction * 0.5) {
      d.arrive = false;
      d.state = 'rebound';
      return setTarget(d, sim.reb.x, sim.reb.y, 'sprint', sim.reb);
    }
    const [ux, uy] = unit(hoop.x - man.x, hoop.y - man.y);
    d.state = 'box out';
    d.noAvoid = true;
    return setTarget(d, man.x + ux * 2.1, man.y + uy * 2.1, 'run', man);
  }

  const handler = ball.state === 'held' ? ball.owner : null;

  // ---- ajuda na infiltração
  if (sim.help && sim.help.helper === d && handler) {
    d.state = 'help';
    return setTarget(d, sim.help.spot.x, sim.help.spot.y, 'sprint', handler);
  }

  if (man.hasBall) return onBall(sim, d, man, hoop);

  // ---- cobertura do pick and roll pelo marcador do bloqueador
  const scr = sim.poss.screen;
  if (scr && scr.screener === man && scr.phase === 'set' && handler) {
    const cov = sim.teams[d.team].coverage;
    if (!scr.shown) {
      // aviso visual da cobertura escolhida, uma vez por bloqueio
      scr.shown = true;
      sim.fx(cov === 'switch' ? 'TROCA' : cov === 'hedge' ? 'HEDGE' : 'DROP', d);
    }
    if (cov === 'hedge' && sim.t - scr.setT < 1.3) {
      const [ux, uy] = unit(man.x - hoop.x, man.y - hoop.y);
      d.state = 'hedge';
      return setTarget(d, man.x + ux * 2.5 + (handler.x - man.x) * 0.35, man.y + uy * 2.5 + (handler.y - man.y) * 0.35, 'sprint', handler);
    }
    if (cov !== 'switch') {
      // drop: afunda entre a bola e o aro, protegendo a cesta
      const dh = dist(handler, hoop);
      const [ux, uy] = unit(handler.x - hoop.x, handler.y - hoop.y);
      const depth = clamp(dh - 7, 4, 13);
      d.state = 'drop';
      return setTarget(d, hoop.x + ux * depth, hoop.y + uy * depth, 'run', handler);
    }
  }

  // ---- passe a caminho do meu homem: closeout
  if (ball.state === 'pass' && ball.to === man && ball.t >= def.reaction * 0.7) {
    const [ux, uy] = unit(hoop.x - ball.aim.x, hoop.y - ball.aim.y);
    const gap = 2 + (1 - def.closeout) * 1.2;
    d.state = 'closeout';
    // quem fecha mal chega desequilibrado (passa do ponto); quem fecha bem freia a tempo
    d.arrive = def.closeout > 0.45 || dist(d, ball.aim) < 5;
    return setTarget(d, ball.aim.x + ux * gap, ball.aim.y + uy * gap, 'sprint', man);
  }

  // ---- longe da bola: do lado da cesta, afundando para a linha de ajuda
  const bx = handler ? handler.x : ball.x;
  const by = handler ? handler.y : ball.y;
  const manBall = Math.hypot(man.x - bx, man.y - by);
  let sag = TUNE.HELP_SAG * clamp((manBall - 9) / 18, 0, 1) * (0.7 + 0.6 * def.help) * (1 + 0.55 * sim.teams[d.team].tactics.paint);
  if (man.prof.shoot.three > 0.66) sag *= 0.6; // não abandona arremessador
  const manHoop = dist(man, hoop);
  if (manHoop < 9) sag *= 0.3;
  // quem olha a bola demora mais para perceber o corte do próprio marcado
  const seen = perceived(man, def.reaction * (1 + sag * 1.5));
  const [ux, uy] = unit(hoop.x - seen.x, hoop.y - seen.y);
  const gap = clamp(manHoop * 0.17, 2.3, 8);
  const baseX = seen.x + ux * gap;
  const baseY = seen.y + uy * gap;
  const helpX = bx * 0.35 + hoop.x * 0.65;
  const helpY = by * 0.35 + hoop.y * 0.65;
  const tx = lerp(baseX, helpX, sag);
  const ty = lerp(baseY, helpY, sag);
  const far = Math.hypot(tx - d.x, ty - d.y);
  // transição: quem está atrás da linha da bola corre para proteger a cesta
  const mode = far > 10 ? 'sprint' : far > 4 ? 'run' : 'slide';
  d.state = sag > 0.2 ? 'ajuda' : manBall < 14 ? 'deny' : 'stance';
  setTarget(d, tx, ty, mode, far > 10 ? null : handler ?? ball);
}

function onBall(sim, d, man, hoop) {
  const def = d.prof.def;
  // o defensor enxerga o atacante com atraso e projeta o movimento — fintas exploram a projeção
  const seen = perceived(man, def.reaction);
  const lead = def.reaction * def.anticipation;
  const px = seen.x + seen.vx * lead;
  const py = seen.y + seen.vy * lead;
  const [ux, uy] = unit(hoop.x - px, hoop.y - py);
  const manHoop = dist(man, hoop);
  let gap = TUNE.ONBALL_GAP - 0.9 * man.prof.shoot.three - 0.8 * sim.teams[d.team].tactics.pressure;
  if (manHoop > 28) gap = 4 + (1 - man.prof.shoot.three) * 3.5 + (manHoop - 28) * 0.25;
  const act = man.act.type;
  d.noAvoid = false;
  if (act === 'post') {
    gap = 1.9;
    d.noAvoid = true;
    d.state = 'post';
  } else if (act === 'gather') {
    // contest: fecha no arremessador (se já percebeu o gesto)
    if (sim.t - man.act.t0 >= def.reaction * 0.6) {
      d.state = 'contest';
      d.contesting = sim.t;
      d.arrive = false;
      d.noAvoid = true;
      return setTarget(d, man.x + ux * 1.3, man.y + uy * 1.3, 'sprint', man);
    }
    gap = 2.2;
  }
  const tx = px + ux * gap;
  const ty = py + uy * gap;
  const off = Math.hypot(tx - d.x, ty - d.y);
  const beaten = dist(d, hoop) > manHoop + 0.4;
  if (beaten || off > 6.5) {
    // batido: vira e corre para recuperar, mirando à frente do atacante
    d.state = 'recover';
    d.arrive = false;
    return setTarget(d, man.x + ux * 3.5 + man.vx * 0.25, man.y + uy * 3.5 + man.vy * 0.25, 'sprint', null);
  }
  if (d.state === 'stance') d.state = 'contain';
  setTarget(d, tx, ty, 'slide', man);
}
