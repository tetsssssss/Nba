// IA ofensiva (DecisionEngine): o portador da bola pontua opções com o estado real
// da posse; quem está sem bola lê espaço, marcador e bola para cortar, abrir, bloquear.
import { PERIMETER_SLOTS, SLOTS, TUNE, clamp, dist, hoopOf, inPaint, segDist, slotPos, toWorld } from './config.js';
import { evaluateShot } from './shot.js';

const unit = (x, y) => {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};
const go = (p, x, y, mode, arrive = true) => {
  p.tx = x;
  p.ty = y;
  p.mode = mode;
  p.arrive = arrive;
};

export function nearestDefender(sim, p) {
  let best = null;
  let bd = 99;
  for (const d of sim.court) {
    if (d.team === p.team) continue;
    const dd = dist(d, p);
    if (dd < bd) {
      bd = dd;
      best = d;
    }
  }
  return { d: best, dist: bd };
}

/** Risco (0..1) de um passe de `from` até o ponto `aim` ser interceptado, pela geometria da linha de passe. */
export function laneRisk(sim, from, aim, lob = false) {
  let safe = 1;
  for (const d of sim.court) {
    if (d.team === from.team || d.stun > 0) continue;
    const s = segDist(from.x, from.y, aim.x, aim.y, d.x, d.y);
    if (s.t < 0.06) continue;
    const reach = 2.6 + 1.6 * d.prof.def.steal;
    let r = clamp(1 - s.d / reach, 0, 1) * (0.45 + 0.75 * d.prof.def.steal);
    if (lob) r *= 0.35;
    if (s.t > 0.93) r *= 0.6; // em cima do recebedor: só atrapalha se estiver colado
    safe *= 1 - 0.55 * r;
  }
  return 1 - safe;
}

/** Quanto vale a posse "continuar": cai com o shot clock, o que aumenta a disposição de arremessar. */
/** Fator de pressa do time: tática do técnico × slider de ritmo. <1 = arma e decide mais cedo. */
const tempo = (sim, team) => clamp((TUNE.SETUP_SCALE * (1 - 0.4 * sim.teams[team].tactics.pace)) / sim.sl.pace, 0.35, 2.6);

function possessionValue(sim, p) {
  const sc = Math.min(sim.shotClock, sim.clock + 0.5);
  const tac = sim.teams[p.team].tactics;
  let v = TUNE.POSSESSION_VALUE + 0.3 * (1 - sim.sl.shots) - 0.1 * tac.pace;
  if (sc < TUNE.PATIENCE_DECAY) v -= (1 - sc / TUNE.PATIENCE_DECAY) * 0.75;
  // ataque ainda se armando: espera os companheiros chegarem aos seus espaços antes de iniciar
  if (!sim.poss.advantage?.advantage && sim.t - sim.poss.t0 < 11 * tempo(sim, p.team) && !offenseSet(sim, p.team)) v += 0.4;
  else if (sim.t - sim.poss.t0 < 9) v += TUNE.EARLY_PATIENCE / sim.sl.pace - 0.08 * tac.pace;
  // fim de período: segura para o último arremesso
  if (sim.clock < 30 && sim.clock > 7 && sim.shotClock > sim.clock) v += 0.3;
  return v - 0.1 * (p.prof.handle.creation - 0.6) * (p.prof.tend.clutchShot > 0.6 && sim.isClutch() ? 1.5 : 1);
}

/** Viés por zona de arremesso: sliders globais + prioridade ofensiva do técnico. */
function zoneBias(sim, team, ev) {
  const { focus } = sim.teams[team].tactics;
  if (ev.three) return TUNE.ZONE_THREE + 0.24 * (sim.sl.three - 1) + (focus === 'three' ? 0.07 : focus === 'rim' || focus === 'post' ? -0.04 : 0);
  if (ev.rim) return 0.22 * (sim.sl.rim - 1) + (focus === 'rim' ? 0.05 : 0);
  return TUNE.ZONE_MID + 0.24 * (sim.sl.mid - 1) + (focus === 'three' ? -0.04 : 0);
}

function offenseSet(sim, team) {
  const dir = sim.dirOf(team);
  for (const m of sim.court) {
    if (m.team !== team || m.hasBall || m.act.type !== 'space') continue;
    const s = slotPos(dir, m.slot);
    if (Math.hypot(s.x - m.x, s.y - m.y) > 9) return false;
  }
  return true;
}

/**
 * Carga de uso do jogador: 0 enquanto sua fatia das finalizações do time está abaixo do teto,
 * crescendo até ~1,5 quando ele monopoliza o ataque. Lida pela decisão de arremessar e de passar.
 */
export function usageLoad(sim, p) {
  let mine = 0;
  let all = 0;
  const team = sim.teams[p.team];
  for (const m of team.all) {
    const u = m.stats.fga + 0.44 * m.stats.fta;
    all += u;
    if (m === p) mine = u;
  }
  if (all < 12) return 0; // começo de jogo: amostra pequena demais
  const cap = TUNE.USAGE_SOFT_CAP + (team.tactics.star === p.id ? TUNE.USAGE_STAR_BONUS : 0);
  return clamp((mine / all - cap) / TUNE.USAGE_WIDTH, 0, 1.5);
}

function passOptions(sim, p, V0, extra = 0) {
  const out = [];
  const dir = sim.dirOf(p.team);
  const hoop = hoopOf(dir);
  const myDh = dist(p, hoop);
  const pp = p.prof.pass;
  const hold = sim.t - p.catchT;
  for (const m of sim.court) {
    if (m.team !== p.team || m === p) continue;
    const d = dist(p, m);
    if (d < 4 && m.act.type !== 'screen') continue;
    const mDh = dist(m, hoop);
    const nd = nearestDefender(sim, m);
    const lead = clamp(d / pp.speed, 0, 0.9);
    const cutting = (m.act.type === 'cut' || m.act.type === 'roll') && mDh < 16;
    // ponte aérea: só para quem enterra, já perto do aro e com o marcador para trás — e a bola vai PARA o aro
    const lob = cutting && mDh < 6.5 && mDh > 2 && m.prof.finish.canDunk && nd.dist > 2.5 && pp.vision > 0.55 && d > 10;
    const aim = { x: clamp(m.x + m.vx * lead * (lob ? 0.5 : 1), 2, 92), y: clamp(m.y + m.vy * lead * (lob ? 0.5 : 1), 2, 48) };
    const risk = laneRisk(sim, p, aim, lob) + clamp((d - 32) / 60, 0, 0.3);
    // valor do recebedor: arremesso que ele teria ao receber, ou a chegada livre no aro
    let value;
    if (cutting) value = 1.05 + 0.3 * m.prof.finish.layup + clamp((nd.dist - 2) * 0.06, -0.1, 0.2);
    else {
      const ev = evaluateShot(sim, m, { type: null, predict: true });
      value = ev.pMake * ev.points + clamp((nd.dist - 4) * 0.02, -0.05, 0.12) + 0.5 * zoneBias(sim, p.team, ev);
      if (m.posting && mDh < 13) value = Math.max(value, 0.9 + 0.35 * m.prof.finish.post);
      // devolver para quem cria melhor do que eu (reset), especialmente se estou travado
      const creator = m.prof.handle.creation - p.prof.handle.creation;
      if (creator > 0.08) value = Math.max(value, V0 - 0.1 + (creator * 0.5 + Math.min(0.25, hold * 0.06)) * (1 - Math.min(1, usageLoad(sim, m))));
    }
    // quem enxerga pouco simplesmente não vê a opção do lado fraco
    const seenChance = 0.55 + 0.45 * pp.vision - clamp((d - 25) / 60, 0, 0.25);
    if (sim.rng.next() > seenChance + (cutting ? 0.1 : 0)) continue;
    const ahead = sim.poss.transition && mDh < myDh - 12 ? 0.25 : 0;
    let score = (value - V0) * (1 - risk) - risk * (1.15 - 0.4 * (1 - pp.iq)) + 0.1 * (p.prof.tend.passFirst - 0.5) + extra + ahead;
    if (sim.teams[p.team].tactics.star === m.id) score += 0.1; // procurar o jogador prioritário
    // não devolve de primeira para quem acabou de passar, nem solta a bola sem ler a jogada
    const lp = sim.poss.lastPass;
    if (lp && lp.to === p && lp.from === m && sim.t - lp.t < 3) score -= 0.22;
    if (hold < 0.55 && !cutting) score -= 0.2;
    out.push({ kind: 'pass', to: m, score, aim, lob, risk, value });
  }
  return out;
}

function choose(sim, p, options) {
  // variância controlada: quanto menor o QI, mais ruído na leitura (força arremesso, perde o passe)
  const noise = TUNE.DECISION_NOISE * (1.15 - 0.85 * p.prof.pass.iq);
  // a leitura (com seu erro) persiste por ~1,5 s: reavaliar 5x por segundo não pode virar 5 sorteios
  if (!p.read || sim.t > p.read.until) p.read = { until: sim.t + 1.1 + sim.rng.next() * 0.9, map: {} };
  let best = null;
  for (const o of options) {
    const key = o.kind + (o.to ? o.to.id : '');
    const n = (p.read.map[key] ??= sim.rng.normal());
    o.final = o.score + n * noise;
    if (!best || o.final > best.final) best = o;
  }
  p.debug = { action: best?.label ?? best?.kind ?? 'segurar', score: best?.final ?? 0, options: options.map((o) => ({ k: o.label ?? o.kind, s: o.score })).sort((a, b) => b.s - a.s).slice(0, 5), shot: p.debug?.shot };
  sim.metrics.decisions++;
  return best;
}

/** Vantagem numérica na transição (2x1, 3x2...). */
export function breakAdvantage(sim, h) {
  const hoop = hoopOf(sim.dirOf(h.team));
  const dh = dist(h, hoop);
  let off = 0;
  let def = 0;
  for (const p of sim.court) {
    const d = dist(p, hoop);
    if (p.team === h.team) {
      if (d < dh + 8) off++;
    } else if (d < dh + 3) def++;
  }
  return { off, def, advantage: off > def && dh < 60 && dh > 6 };
}

// ------------------------------------------------------------------ portador da bola
export function handlerTick(sim, p) {
  const dir = sim.dirOf(p.team);
  const hoop = hoopOf(dir);
  const dh = dist(p, hoop);
  const act = p.act;
  const on = sim.defenderOf(p);
  const onDist = on ? dist(on, p) : 99;
  const [hx, hy] = unit(hoop.x - p.x, hoop.y - p.y);
  p.face = act.type === 'post' ? { x: p.x - hx * 5, y: p.y - hy * 5 } : hoop;
  p.planted = false;
  p.noAvoid = false;
  p.speedLimit = null;

  if (act.type === 'gather') {
    // sobe para o arremesso: jumper freia; finalização continua em direção ao aro
    if (act.rim) go(p, hoop.x - hx * 0.8, hoop.y - hy * 0.8, 'run', false);
    else go(p, p.x, p.y, 'set');
    if (sim.t >= act.until) sim.releaseShot(p, act.shot);
    return;
  }

  if (act.type === 'move') return dribbleMove(sim, p, on, hoop, hx, hy);

  // reposição depois de cesta: quem pegou a bola entrega ao armador
  if (sim.poss.inbounder === p) {
    const h = sim.poss.handler;
    go(p, p.x, p.y, 'walk');
    if (h && h !== p && sim.t - p.catchT > 1.1 && dist(h, p) < 30) {
      sim.poss.inbounder = null;
      return sim.pass(p, h, { x: h.x + h.vx * 0.3, y: h.y + h.vy * 0.3 }, false);
    }
    if (!h || h === p || sim.t - p.catchT > 3.5) sim.poss.inbounder = null;
    return;
  }

  if (act.type === 'post') return postTick(sim, p, on, hoop, dh, hx, hy);
  if (act.type === 'drive') return driveTick(sim, p, on, hoop, dh, hx, hy);

  // ---- 'dribble': conduzindo / lendo a defesa
  const tac = sim.teams[p.team].tactics;
  const V0 = possessionValue(sim, p);
  const options = [];
  const brk = sim.poss.transition ? breakAdvantage(sim, p) : null;
  if (brk) sim.poss.advantage = brk;

  // subida de quadra
  if (dh > 34) {
    const lat = clamp((p.y - 25) * dir * 0.5, -10, 10);
    const entry = toWorld(dir, 30, lat);
    go(p, entry.x, entry.y, brk?.advantage || (sim.poss.transition && (p.prof.tend.pace > 0.7 || tac.transition === 'push') && tac.transition !== 'walk') ? 'sprint' : dh > 70 || (tac.transition === 'push' && tempo(sim, p.team) < 0.9) ? 'run' : 'jog', false);
    if (brk?.advantage && dh < 50) return startDrive(sim, p, 0, 'contra-ataque');
    // passe longo para quem está na frente
    const ahead = passOptions(sim, p, V0 + 0.1).filter((o) => o.score > 0.12 && dist(o.to, hoop) < dh - 14);
    const pick = ahead.sort((a, b) => b.score - a.score)[0];
    if (pick && sim.t - p.catchT > 0.4) return sim.pass(p, pick.to, pick.aim, pick.lob);
    // rebote com pivô: entrega ao armador
    const h = sim.poss.handler;
    if (h && h !== p && p.prof.handle.control < 0.62 && dist(h, p) < 32 && sim.t - p.catchT > 0.35) {
      if (laneRisk(sim, p, h) < 0.3) return sim.pass(p, h, { x: h.x + h.vx * 0.3, y: h.y + h.vy * 0.3 }, false);
    }
    return;
  }
  sim.poss.transition = sim.poss.transition && sim.t - sim.poss.t0 < 7;
  go(p, p.x, p.y, 'jog');
  // chegou ao ataque: organiza a jogada antes de iniciar a ação (menos para quem joga em ritmo alto)
  sim.poss.arrivedT ??= sim.t;
  const settling = !brk?.advantage && sim.t - sim.poss.arrivedT < (2.2 + 2.8 * (1 - p.prof.tend.pace)) * tempo(sim, p.team) && sim.shotClock > 10 ? 0.3 : 0;

  // arremesso
  const ev = evaluateShot(sim, p, { predict: true });
  p.debug = { ...(p.debug ?? {}), shot: ev };
  const tend = p.prof.tend;
  const bias = (ev.three ? 0.24 * (tend.three - 0.45) : ev.rim ? 0.1 : 0.12 + 0.3 * (tend.mid - 0.3)) + zoneBias(sim, p.team, ev);
  const rhythm = ev.catchShoot ? 0.08 + 0.1 * (tend.catchShoot - 0.5) + (ev.level <= 1 ? 0.08 : 0) : 0;
  // quem cria o próprio arremesso assume mais volume: é daí que estrelas emergem, sem bônus oculto
  const load = usageLoad(sim, p);
  const self = (0.34 * (p.prof.handle.creation - 0.55) + (tac.star === p.id ? 0.1 : 0)) * (1 - load) - 0.14 * load;
  options.push({ kind: 'shoot', label: `arremesso ${ev.type}`, score: ev.pMake * ev.points - V0 + bias + rhythm + (ev.catchShoot ? 0 : self), ev });

  // passes
  for (const o of passOptions(sim, p, V0, 0.1 * load)) options.push({ ...o, label: `passe → ${o.to.short}` });

  // infiltração: vantagem física sobre o marcador + espaço no garrafão
  const waitingScreen = sim.poss.screen && sim.poss.screen.phase === 'go' && sim.shotClock > 7;
  if (dh > 7 && !waitingScreen) {
    const adv = driveAdvantage(sim, p, on, hoop);
    const finish = (0.5 + 0.25 * p.prof.finish.layup) * 2;
    const pBeat = 1 / (1 + Math.exp(-adv * 3));
    options.push({ kind: 'drive', label: 'infiltração', score: finish * pBeat - V0 - settling + self + 0.3 * (tend.drive - 0.5) + 0.12 * (tend.rim - 0.4) + (brk?.advantage ? 0.5 : 0) + 0.25 * (sim.sl.rim - 1) + (tac.focus === 'rim' ? 0.1 : tac.focus === 'three' ? -0.05 : 0), adv });
    // drible para criar separação (isolação)
    if (on && onDist < 7 && sim.t - p.catchT > 0.6) {
      const mq = p.prof.handle.moveQuality;
      options.push({ kind: 'move', label: 'drible de criação', score: 0.02 + 0.45 * mq * (0.4 + tend.iso) - 0.44 - settling + self + (V0 < 0.8 ? 0.15 : 0) + 0.15 * (p.prof.handle.creation - 0.5) });
    }
  }

  // jogo de costas
  if (dh < 17 && dh > 6 && on) {
    const edge = p.prof.move.strength * p.prof.move.mass - on.prof.move.strength * on.prof.move.mass * (0.6 + 0.4 * on.prof.def.interior);
    options.push({ kind: 'post', label: 'post-up', score: -0.28 + 0.5 * p.prof.finish.post + 0.55 * edge + 0.35 * (tend.post - 0.3) + (p.posting ? 0.2 : 0) + (tac.focus === 'post' ? 0.16 : 0) });
  }

  // pedir bloqueio
  if (!sim.poss.screen && dh > 20 && sim.t - sim.poss.t0 > 1.5 && sim.t - (sim.poss.lastScreen ?? -9) > 5) {
    const big = pickScreener(sim, p);
    if (big) options.push({ kind: 'screen', label: `pick and roll com ${big.short}`, score: -0.05 - settling + 0.4 * tend.pnr + 0.2 * big.prof.tend.roll, big });
  }

  options.push({ kind: 'hold', label: 'segurar', score: 0.04 });
  const pick = choose(sim, p, options);
  if (!pick || pick.kind === 'hold') {
    // usa o bloqueio já armado
    const scr = sim.poss.screen;
    if (scr && scr.phase === 'set' && scr.handler === p) startDrive(sim, p, scr.side, 'usa o bloqueio', scr.screener);
    return;
  }
  if (pick.kind === 'shoot') return sim.startGather(p, ev.type);
  if (pick.kind === 'pass') return sim.pass(p, pick.to, pick.aim, pick.lob);
  if (pick.kind === 'drive') return startDrive(sim, p, 0, 'infiltração');
  if (pick.kind === 'move') return startMove(sim, p, on, hoop);
  if (pick.kind === 'post') {
    p.act = { type: 'post', t0: sim.t };
    return sim.say(p, 'posta de costas');
  }
  if (pick.kind === 'screen') return startScreen(sim, pick.big, p);
}

function driveAdvantage(sim, p, on, hoop) {
  // 1) físico: explosão com bola do atacante contra deslocamento lateral do defensor
  const mine = p.prof.move.maxSpeed * p.prof.handle.speedWithBall * (0.6 + 0.4 * p.prof.move.accel / 30);
  let adv = 0.45;
  if (on) {
    const his = on.prof.move.maxSpeed * on.prof.move.slide * (0.6 + 0.4 * on.prof.move.accel / 30) * (0.75 + 0.5 * on.prof.def.perimeter);
    adv = (mine - his) / 9 - 0.95; // defensor em posição, por padrão, contém
    // 2) posição: defensor fora da linha atacante→aro, colado demais ou chegando desequilibrado
    const s = segDist(p.x, p.y, hoop.x, hoop.y, on.x, on.y);
    adv += clamp((s.d - 1.5) * 0.22, -0.2, 0.7);
    const closing = Math.hypot(on.vx, on.vy);
    if (closing > 9 && dist(on, p) < 7) adv += 0.35; // closeout descontrolado
    if (on.stun > 0) adv += 1;
  }
  // 3) garrafão congestionado
  let clog = 0;
  for (const d of sim.court) {
    if (d.team === p.team || d === on) continue;
    const s = segDist(p.x, p.y, hoop.x, hoop.y, d.x, d.y);
    if (s.d < 5 && s.t > 0.35) clog += (1 - s.d / 5) * (0.6 + 0.5 * d.prof.def.block);
  }
  return adv - clog * 0.42;
}

function startDrive(sim, p, side, label, around = null) {
  const dir = sim.dirOf(p.team);
  const hoop = hoopOf(dir);
  const on = sim.defenderOf(p);
  if (!side) {
    // ataca o lado em que o defensor está mais exposto (ou a mão forte, na dúvida)
    const cross = on ? (hoop.x - p.x) * (on.y - p.y) - (hoop.y - p.y) * (on.x - p.x) : 0;
    side = Math.abs(cross) > 2 ? (cross > 0 ? -1 : 1) : p.hand;
  }
  p.act = { type: 'drive', t0: sim.t, side, around, stall: 0, label };
  p.dribbled = true;
  p.burst = 1 + 0.35 * p.prof.handle.moveQuality;
  sim.metrics.drives++;
  sim.say(p, label);
}

function driveTick(sim, p, on, hoop, dh, hx, hy) {
  const act = p.act;
  const V0 = possessionValue(sim, p);
  p.dribbled = true;
  if (sim.t - act.t0 > 0.7) p.burst = 1;
  // rota: contorna o bloqueio antes de atacar o aro
  let tx = hoop.x - hx * 1.2 + -hy * act.side * 1.5;
  let ty = hoop.y - hy * 1.2 + hx * act.side * 1.5;
  if (act.around) {
    const s = act.around;
    const past = dist(p, hoop) < dist(s, hoop) - 0.5 || sim.t - act.t0 > 2.2;
    if (past) act.around = null;
    else {
      tx = s.x + -hy * act.side * 3 + hx * 2;
      ty = s.y + hx * act.side * 3 + hy * 2;
    }
  }
  go(p, tx, ty, 'sprint', false);

  // corpo no caminho?
  let cutoff = null;
  for (const d of sim.court) {
    if (d.team === p.team) continue;
    const ox = d.x - p.x;
    const oy = d.y - p.y;
    const ahead = ox * hx + oy * hy;
    // caminho fechado: ajuda plantada na rota, ou o próprio marcador conseguiu ficar na frente e me parou
    const inPath = ahead > 0.5 && ahead < 4 && Math.abs(ox * -hy + oy * hx) < 1.9;
    if (inPath && (d !== on || Math.hypot(p.vx, p.vy) < 6)) cutoff = d;
  }
  const speed = Math.hypot(p.vx, p.vy);
  act.stall = speed < 4 ? act.stall + 1 / TUNE.DECISION_HZ : 0;
  if (sim.t - act.t0 < 0.6) cutoff = null; // dá tempo de o primeiro passo acontecer
  if (inPaint(sim.dirOf(p.team), p.x, p.y) && !act.touched) {
    act.touched = true;
    sim.metrics.paintTouches++;
  }

  // chegou: finaliza
  const range = cutoff ? 8.5 : 5.2;
  if (dh < range) {
    if (dh > 6) return sim.startGather(p, 'floater');
    return sim.startGather(p, null);
  }

  const options = [{ kind: 'go', label: 'continuar', score: cutoff ? -0.12 : 0.15 }];
  // descarregar: a ajuda deixou alguém livre
  for (const o of passOptions(sim, p, V0, 0.12 * (p.prof.tend.kick - 0.3) + (sim.help ? 0.1 : 0))) options.push({ ...o, label: `descarrega → ${o.to.short}` });
  // parar e arremessar
  if (dh < 26 && (cutoff || sim.rng.next() < 0.5)) {
    const ev = evaluateShot(sim, p, { type: dh > 11 ? 'pullup' : null, predict: true });
    options.push({ kind: 'shoot', label: 'pull-up', score: ev.pMake * ev.points - V0 + 0.18 * (p.prof.tend.pullUp - 0.5) + (cutoff ? 0.08 : -0.1), ev });
  }
  // mudar de lado (giro) se cortaram o caminho
  if (cutoff && dh > 8 && sim.t - (act.spunAt ?? -9) > 1.2) options.push({ kind: 'spin', label: 'giro', score: -0.15 + 0.4 * p.prof.handle.moveQuality });
  if (act.stall > 0.8) options.push({ kind: 'reset', label: 'recua', score: 0.1 });
  const pick = choose(sim, p, options);
  if (!pick || pick.kind === 'go') return;
  if (pick.kind === 'pass') return sim.pass(p, pick.to, pick.aim, pick.lob);
  if (pick.kind === 'shoot') return sim.startGather(p, pick.ev.type === 'three' || pick.ev.type === 'mid' ? 'pullup' : pick.ev.type);
  if (pick.kind === 'spin') {
    act.side = -act.side;
    act.spunAt = sim.t;
    p.hand = -p.hand;
    p.anim = { type: 'spin', t: sim.t };
    p.vx *= 0.55;
    p.vy *= 0.55;
    sim.say(p, 'gira para o outro lado');
    return sim.stripRisk(p, cutoff, 1.4);
  }
  if (pick.kind === 'reset') {
    p.act = { type: 'dribble', t0: sim.t };
    const [ux, uy] = unit(p.x - hoop.x, p.y - hoop.y);
    go(p, p.x + ux * 6, p.y + uy * 6, 'run');
  }
}

// ---- dribles: finta real → o defensor reage (com atraso) → mudança de direção
const MOVES = [
  { kind: 'crossover', label: 'crossover', feint: 0.24, cut: true, skill: 0.35 },
  { kind: 'between', label: 'drible entre as pernas', feint: 0.26, cut: true, skill: 0.5 },
  { kind: 'behind', label: 'drible pelas costas', feint: 0.3, cut: true, skill: 0.62 },
  { kind: 'inout', label: 'in-and-out', feint: 0.2, cut: false, skill: 0.5 },
  { kind: 'hesitation', label: 'hesitation', feint: 0.3, cut: false, skill: 0.4 },
  { kind: 'stepback', label: 'stepback', feint: 0.36, cut: false, skill: 0.55 },
];

function startMove(sim, p, on, hoop) {
  const mq = p.prof.handle.moveQuality;
  const t = p.prof.tend;
  const pool = MOVES.filter((m) => mq + 0.2 >= m.skill);
  const weights = pool.map((m) => {
    if (m.kind === 'stepback') return 0.1 + 1.1 * t.stepback * (p.prof.shoot.pullUp > 0.6 ? 1 : 0.2);
    if (m.kind === 'hesitation') return 0.5 + p.prof.move.accel / 30;
    return 1;
  });
  const move = sim.rng.weighted(pool.map((m, i) => [m, weights[i]])) ?? MOVES[0];
  const cross = on ? (hoop.x - p.x) * (on.y - p.y) - (hoop.y - p.y) * (on.x - p.x) : 0;
  const goSide = Math.abs(cross) > 1.5 ? (cross > 0 ? -1 : 1) : sim.rng.chance(0.5) ? 1 : -1;
  p.act = { type: 'move', move, t0: sim.t, goSide, phase: 0 };
  p.dribbled = true;
  p.anim = { type: move.kind, t: sim.t };
  sim.metrics.moves++;
  sim.say(p, move.label);
}

function dribbleMove(sim, p, on, hoop, hx, hy) {
  const act = p.act;
  const m = act.move;
  const mq = p.prof.handle.moveQuality;
  const el = sim.t - act.t0;
  const lx = -hy;
  const ly = hx;
  if (el < m.feint) {
    // 1) ameaça: vende um lado (ou a parada, ou o recuo)
    if (m.kind === 'hesitation') {
      p.speedLimit = 2.5;
      return go(p, p.x + hx * 2, p.y + hy * 2, 'run', false);
    }
    if (m.kind === 'stepback') {
      p.burst = 1.5 + 0.6 * mq;
      return go(p, p.x - hx * 6 + lx * act.goSide * 1.5, p.y - hy * 6 + ly * act.goSide * 1.5, 'sprint', false);
    }
    const fs = m.cut ? -act.goSide : act.goSide;
    p.burst = 1.2;
    return go(p, p.x + lx * fs * 5 + hx * 1.5, p.y + ly * fs * 5 + hy * 1.5, 'run', false);
  }
  // 2) resolução: o que a finta produziu de verdade?
  if (m.cut) p.hand = -p.hand;
  if (sim.stripRisk(p, on, 1.5 + (1 - mq))) return;
  if (on) {
    // ankle breaker: raro — defensor comprometido com o lado errado, em velocidade, contra drible de elite
    const wrong = (on.vx * lx + on.vy * ly) * -act.goSide;
    const edge = mq - on.prof.def.perimeter;
    if (m.cut && wrong > 6.5 && edge > 0.2 && sim.rng.next() < 0.1 + edge * 0.25) {
      on.stun = 0.9;
      on.anim = { type: 'fall', t: sim.t };
      sim.fx('ANKLE BREAKER', on);
      sim.say(p, `quebra a cintura de ${on.short}`);
    }
  }
  if (m.kind === 'stepback') {
    p.burst = 1;
    // só arremessa se o recuo realmente criou espaço; senão volta a ler a jogada
    const ev = evaluateShot(sim, p, { type: 'stepback', predict: true });
    if (ev.pMake * ev.points > possessionValue(sim, p) - 0.12 - 0.1 * p.prof.tend.stepback) return sim.startGather(p, 'stepback');
    p.act = { type: 'dribble', t0: sim.t };
    return;
  }
  const sep = on ? dist(on, p) : 9;
  act.type = 'done';
  startDrive(sim, p, act.goSide, sep > 4.5 ? 'ganha espaço e ataca' : 'ataca o marcador');
  p.burst = 1.3 + 0.7 * mq;
}

// ---- jogo de costas
function postTick(sim, p, on, hoop, dh, hx, hy) {
  const act = p.act;
  const el = sim.t - act.t0;
  p.dribbled = true;
  p.noAvoid = true;
  p.ignore = on;
  // backdown: força e massa contra força, massa e defesa interior. Ninguém empurra para sempre.
  let push = 1.4;
  if (on) {
    const edge = p.prof.move.strength * p.prof.move.mass - on.prof.move.strength * on.prof.move.mass * (0.6 + 0.4 * on.prof.def.interior);
    push = clamp(1.3 + 6 * edge, 0.25, 4.2) * clamp(1.2 - el * 0.22, 0.3, 1);
  }
  p.speedLimit = push;
  go(p, hoop.x, hoop.y, 'run', false);
  if (el < 0.9) return;
  const V0 = possessionValue(sim, p);
  const options = [{ kind: 'hold', label: 'backdown', score: el > 3.2 ? -0.5 : 0.06 }];
  const hook = evaluateShot(sim, p, { type: dh < 11 ? 'hook' : 'fadeaway', predict: true });
  options.push({ kind: 'shoot', label: hook.type, score: hook.pMake * hook.points - V0 + 0.12, ev: hook });
  if (dh < 9) options.push({ kind: 'drop', label: 'dropstep', score: -0.05 + 0.3 * p.prof.finish.post + 0.25 * p.prof.move.agility - (on ? 0.2 * on.prof.def.interior : 0) });
  for (const o of passOptions(sim, p, V0, 0.05)) options.push({ ...o, label: `passe do post → ${o.to.short}` });
  const pick = choose(sim, p, options);
  if (!pick || pick.kind === 'hold') return;
  if (pick.kind === 'shoot') return sim.startGather(p, pick.ev.type);
  if (pick.kind === 'pass') return sim.pass(p, pick.to, pick.aim, false);
  if (pick.kind === 'drop') {
    p.speedLimit = null;
    p.anim = { type: 'spin', t: sim.t };
    startDrive(sim, p, sim.rng.chance(0.5) ? 1 : -1, 'dropstep');
    p.burst = 1.6;
  }
}

// ------------------------------------------------------------------ bloqueios
function pickScreener(sim, handler) {
  let best = null;
  let bs = 0.35;
  for (const m of sim.court) {
    if (m.team !== handler.team || m === handler || m.act.type !== 'space') continue;
    const s = m.prof.screen.quality + (m.role === 'big' ? 0.25 : 0) - dist(m, handler) / 90;
    if (s > bs) {
      bs = s;
      best = m;
    }
  }
  return best;
}

export function startScreen(sim, screener, handler) {
  const on = sim.defenderOf(handler);
  if (!on) return;
  const side = screener.y * sim.dirOf(handler.team) > handler.y * sim.dirOf(handler.team) ? 1 : -1;
  screener.act = { type: 'screen', t0: sim.t, phase: 'go', side, handler };
  sim.poss.screen = { screener, handler, side, phase: 'go', setT: 0 };
  sim.poss.lastScreen = sim.t;
  sim.metrics.screens++;
  sim.say(handler, `pede o bloqueio de ${screener.short}`);
}

function screenTick(sim, p) {
  const act = p.act;
  const scr = sim.poss.screen;
  const h = act.handler;
  const dir = sim.dirOf(p.team);
  const hoop = hoopOf(dir);
  if (!scr || scr.screener !== p || !h.hasBall) return release(sim, p, 'space');
  const on = sim.defenderOf(h);
  if (!on) return release(sim, p, 'space');
  const [hx, hy] = unit(hoop.x - h.x, hoop.y - h.y);
  if (act.phase === 'go') {
    // ocupa o ombro do marcador da bola, do lado combinado
    const sx = on.x + -hy * act.side * 2.5 - hx * 0.4;
    const sy = on.y + hx * act.side * 2.5 - hy * 0.4;
    p.noAvoid = true;
    p.ignore = on;
    go(p, sx, sy, 'run');
    p.face = on;
    if (dist(p, { x: sx, y: sy }) < 1.3 || sim.t - act.t0 > 3.6) {
      act.phase = 'set';
      scr.phase = 'set';
      scr.setT = sim.t;
      // slip: finge o bloqueio e corta antes do contato
      if (sim.rng.next() < 0.1 * p.prof.tend.cut + 0.03) {
        sim.say(p, 'faz o slip');
        return release(sim, p, 'roll');
      }
    }
    return;
  }
  // plantado: corpo físico que o defensor precisa contornar
  p.planted = 'screen';
  p.mode = 'set';
  p.tx = p.x;
  p.ty = p.y;
  const passed = dist(h, hoop) < dist(p, hoop) - 1 || dist(h, p) > 9;
  if (passed || sim.t - scr.setT > 2.6) {
    if (on.screened && sim.t - on.screened < 1.5) {
      sim.metrics.screenHits++;
      sim.fx('BLOQUEIO', p);
      // troca: os dois defensores trocam de marcado no contato
      const sd = sim.defenderOf(p);
      if (sim.teams[on.team].coverage === 'switch' && sd) {
        on.man = p;
        sd.man = h;
      }
    }
    const pop = p.prof.screen.pop > 0.6 && sim.rng.next() < p.prof.screen.pop * 0.9;
    release(sim, p, pop ? 'pop' : 'roll');
  }
}

function release(sim, p, type) {
  p.planted = false;
  p.noAvoid = false;
  if (sim.poss.screen?.screener === p) sim.poss.screen.phase = 'done';
  p.act = { type, t0: sim.t };
  if (type === 'pop') {
    p.slot = freeSlot(sim, p, PERIMETER_SLOTS.slice(0, 5));
    sim.say(p, 'abre para o arremesso (pop)');
  } else if (type === 'roll') sim.say(p, 'rola para a cesta');
}

// ------------------------------------------------------------------ sem bola
function freeSlot(sim, p, names) {
  const dir = sim.dirOf(p.team);
  const ball = sim.ball.owner ?? sim.ball;
  let best = p.slot;
  let bs = -1e9;
  for (const name of names) {
    const pos = slotPos(dir, name);
    let nearest = 99;
    for (const m of sim.court) {
      if (m.team !== p.team || m === p) continue;
      const mt = m.hasBall ? m : m.slot ? slotPos(dir, m.slot) : m;
      nearest = Math.min(nearest, Math.hypot(mt.x - pos.x, mt.y - pos.y), dist(m, pos));
    }
    if (nearest < TUNE.SPACING_DISTANCE * 0.75) continue;
    // prefere o espaço mais próximo que mantenha a linha de passe aberta
    const lane = laneRisk(sim, ball, pos);
    const s = -dist(p, pos) * 0.5 + Math.min(nearest, 20) * 0.4 - lane * 12;
    if (s > bs) {
      bs = s;
      best = name;
    }
  }
  return best;
}

export function offBallTick(sim, p) {
  const dir = sim.dirOf(p.team);
  const hoop = hoopOf(dir);
  const handler = sim.ball.state === 'held' ? sim.ball.owner : null;
  const ballPos = handler ?? sim.ball;
  const act = p.act;
  p.face = ballPos;
  p.planted = false;
  p.noAvoid = false;
  p.ignore = null;
  p.speedLimit = null;
  p.burst = 1;
  p.posting = false;

  // rebote ofensivo ou recomposição
  if (sim.reb) {
    if (p.crash && sim.reb.live) return go(p, sim.reb.x, sim.reb.y, 'sprint', false);
    if (p.crash) return go(p, hoop.x + (p.x - hoop.x) * 0.5, hoop.y + (p.y - hoop.y) * 0.5, 'run');
    const back = toWorld(dir, 50, (p.y - 25) * dir * 0.6);
    return go(p, back.x, back.y, 'run');
  }

  // a bola vem para mim: vai ao encontro do passe
  if (sim.ball.state === 'pass' && sim.ball.to === p) {
    const a = sim.ball.aim;
    return go(p, a.x, a.y, act.type === 'cut' || act.type === 'roll' ? 'sprint' : 'run');
  }

  if (act.type === 'screen') return screenTick(sim, p);

  if (act.type === 'roll') {
    go(p, hoop.x - dir * 2.5, hoop.y, 'sprint', false);
    if (dist(p, hoop) < 4.5 || sim.t - act.t0 > 3) {
      p.slot = p.y > 25 === dir > 0 ? 'dunkerR' : 'dunkerL';
      p.act = { type: 'space', t0: sim.t };
    }
    return;
  }
  if (act.type === 'pop') {
    const s = slotPos(dir, p.slot);
    go(p, s.x, s.y, 'run');
    if (dist(p, s) < 2 || sim.t - act.t0 > 3) p.act = { type: 'space', t0: sim.t };
    return;
  }
  if (act.type === 'cut') {
    go(p, hoop.x - dir * 1.5, hoop.y + act.offset, 'sprint', false);
    if (dist(p, hoop) < 4 || sim.t - act.t0 > 2.6) {
      // não recebeu: limpa o garrafão para o lado fraco
      p.slot = freeSlot(sim, p, PERIMETER_SLOTS);
      p.act = { type: 'space', t0: sim.t };
    }
    return;
  }

  // armador sem a bola (rebote/reposição): aproxima-se para receber
  if (sim.poss.handler === p && handler && handler !== p && dist(handler, hoop) > 40) {
    const [ux, uy] = unit(hoop.x - handler.x, hoop.y - handler.y);
    return go(p, handler.x + ux * 14 + -uy * 6, handler.y + uy * 14 + ux * 6, 'run');
  }

  // ---- 'space': ocupa o espaço e lê a jogada
  const s = slotPos(dir, p.slot);
  const far = dist(p, s);
  const transition = sim.poss.transition && dist(p, hoop) > 38;
  go(p, s.x, s.y, transition ? 'sprint' : far > 14 ? 'run' : far > 3 ? 'jog' : 'walk');
  if (transition || !handler || dist(handler, hoop) > 42) return;
  if (!sim.tickOffBall(p)) return;

  const nd = sim.defenderOf(p);
  const ndDist = nd ? dist(nd, p) : 99;
  const t = p.prof.tend;
  const driving = handler.act.type === 'drive' || handler.act.type === 'post';

  // pivô de costas: sela o marcador no post do lado da bola
  if (p.role === 'big' && p.prof.finish.post > 0.62 && t.post > 0.35 && !sim.poss.screen && !driving) {
    const side = ballPos.y > 25 === dir > 0 ? 'postR' : 'postL';
    if (p.slot !== side && sim.rng.next() < 0.25 * t.post) p.slot = side;
    if (p.slot === side && far < 3) p.posting = true;
  }

  // corte: o marcador afundou na ajuda, olha a bola ou nega a linha de passe
  let paint = 0;
  for (const m of sim.court) if (m !== p && inPaint(dir, m.x, m.y)) paint++;
  const dh = dist(p, hoop);
  if (!driving && dh > 14 && paint <= 2 && !p.posting && sim.t - (p.lastCut ?? -9) > 6) {
    let chance = 0.05 + 0.3 * t.cut;
    let label = 'corta para a cesta';
    if (nd) {
      const denied = segDist(ballPos.x, ballPos.y, p.x, p.y, nd.x, nd.y).d < 2.2 && ndDist < 5;
      const ballWatching = ndDist > 6.5;
      const behind = dist(nd, hoop) > dh - 1;
      if (denied || behind) {
        chance += 0.3;
        label = 'backdoor';
      } else if (ballWatching) chance += 0.15;
      else chance *= 0.35;
    }
    if (sim.rng.next() < chance * 0.22) {
      p.act = { type: 'cut', t0: sim.t, offset: (p.y - hoop.y) * 0.12 };
      p.lastCut = sim.t;
      sim.metrics.cuts++;
      sim.say(p, label);
      return;
    }
  }

  // spacing: reposiciona se a infiltração vem na minha direção, se estou encavalado ou sem linha de passe
  let crowd = 99;
  for (const m of sim.court) if (m.team === p.team && m !== p) crowd = Math.min(crowd, dist(m, p));
  const blocked = laneRisk(sim, ballPos, p) > 0.4;
  if (crowd < TUNE.SPACING_DISTANCE * 0.6 || (driving && dist(handler, s) < 10) || (blocked && far < 3 && sim.rng.next() < 0.6)) {
    const names = p.role === 'big' && p.prof.shoot.three < 0.55 ? ['dunkerL', 'dunkerR', 'elbowL', 'elbowR', 'cornerL', 'cornerR'] : PERIMETER_SLOTS;
    const next = freeSlot(sim, p, names);
    if (next !== p.slot) {
      p.slot = next;
      p.state = 'relocate';
    }
  }
}

/** Distribui as posições iniciais da posse conforme o papel de cada um. */
export function assignSlots(sim, team) {
  const list = sim.court.filter((p) => p.team === team);
  const handler = sim.poss.handler;
  const taken = new Set();
  const take = (p, options) => {
    const name = options.find((o) => !taken.has(o)) ?? PERIMETER_SLOTS.find((o) => !taken.has(o)) ?? 'top';
    taken.add(name);
    p.slot = name;
  };
  if (handler) take(handler, ['top']);
  const rest = list.filter((p) => p !== handler).sort((a, b) => b.prof.shoot.three - a.prof.shoot.three);
  const bigs = rest.filter((p) => p.role === 'big');
  const stretch = bigs.filter((p) => p.prof.shoot.three >= 0.6);
  for (const p of rest) {
    if (p.role === 'big' && !stretch.includes(p)) continue;
    take(p, ['wingL', 'wingR', 'cornerR', 'cornerL', 'slotL', 'slotR']);
  }
  // pivôs que não arremessam: dunker spot e cotovelo (4 abertos, 1 dentro); com dois, um em cada nível
  bigs.filter((p) => !stretch.includes(p)).forEach((p, i) => take(p, i === 0 ? ['dunkerR', 'dunkerL'] : ['elbowL', 'elbowR']));
  for (const p of list) if (!SLOTS[p.slot]) p.slot = 'top';
}
