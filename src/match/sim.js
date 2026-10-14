// MatchSimulation: relógio, posse, regras e orquestração dos motores.
// Roda sem DOM (testes, calibração, simulação rápida). O renderer apenas LÊ este estado.
import { COURT, TUNE, clamp, dist, hoopOf, slotPos, toWorld } from './config.js';
import { buildProfiles, getArchetype } from './profiles.js';
import { movePlayer, recordHistory, resolveCollisions } from './movement.js';
import { createBall, updateBall } from './ball.js';
import { pickHelper, updateDefender } from './defense.js';
import { assignSlots, handlerTick, offBallTick } from './offense.js';
import { CONTEST_LEVELS, evaluateShot } from './shot.js';
import { createRng } from '../core/rng.js';
import { autoDepthChart } from '../players/depth.js';
import { assertPlayableRoster } from '../players/eligibility.js';
import { validateRotation } from '../players/rotation.js';
import { DEFAULT_TACTICS, TIMEOUTS_PER_GAME, describeTactic, normalizeSimSliders } from './tactics.js';

const newStats = () => ({ pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0 });

export function makeSimPlayer(data, team) {
  const pos = data.positions?.[0] ?? 'SF';
  return {
    id: data.id, data, team, name: data.name, short: data.lastName ?? data.name.split(' ').slice(-1)[0],
    x: 47, y: 25, vx: 0, vy: 0, facing: 0, tx: 47, ty: 25, mode: 'jog', arrive: true, face: null,
    hist: [], energy: 1, prof: buildProfiles(data, 1), profEnergy: 1,
    act: { type: 'space', t0: 0 }, slot: 'top', man: null, hasBall: false, hand: data.id % 9 === 0 ? -1 : 1,
    stun: 0, catchT: -9, dribbled: false, burst: 1, speedLimit: null, planted: false, noAvoid: false, ignore: null,
    role: pos === 'C' || (pos === 'PF' && (data.heightIn ?? 78) >= 81) ? 'big' : pos === 'PG' ? 'guard' : 'wing',
    archetype: getArchetype(data), stats: newStats(), secs: 0, starter: false, fouledOut: false,
    aiNext: 0, offNext: 0, debug: null, anim: null, effort: 0, state: '', crash: false, posting: false, stint: 0, rest: 0,
  };
}

export class MatchSim {
  /**
   * @param teams [{ id, name, colors, roster: [dados de jogador], coverage?: 'auto'|'drop'|'switch'|'hedge' }]
   * @param opts  { seed, quarterSeconds, sandbox, quiet, recordReplay, sliders }
   */
  constructor(teams, opts = {}) {
    if (!opts.sandbox) for (const team of teams) assertPlayableRoster(team);
    this.opts = opts;
    this.rng = createRng(opts.seed ?? 'nba-universe');
    this.seed = opts.seed ?? 'nba-universe';
    this.sandbox = Boolean(opts.sandbox);
    this.sl = normalizeSimSliders(opts.sliders); // sliders de simulação (1 = padrão)
    this.scoreLog = []; // [{ t, q, team, pts, id }] — base para sequências e destaques
    this.timeout = null; // último tempo concedido: { team, t }
    this.timeoutRequest = null;
    this.t = 0;
    this.quarter = 1;
    this.quarterSeconds = opts.quarterSeconds ?? TUNE.QUARTER_SECONDS;
    this.clock = this.quarterSeconds;
    this.shotClock = TUNE.SHOT_CLOCK;
    this.score = [0, 0];
    this.teamFouls = [0, 0];
    this.offense = 0;
    this.state = 'dead';
    this.over = false;
    this.ball = createBall();
    this.events = [];
    this.effects = [];
    this.replay = [];
    this.help = null;
    this.reb = null;
    this.pendingTO = null;
    this.result = null;
    this.metrics = { possessions: [0, 0], decisions: 0, drives: 0, moves: 0, screens: 0, screenHits: 0, cuts: 0, passes: 0, shots: 0, openShots: 0, qualitySum: 0, paintTouches: 0, badPassTO: 0, fastBreaks: 0, fastBreakPts: 0, spacingSum: 0, spacingN: 0, contestSum: 0 };
    this.teams = teams.map((info, i) => {
      const all = info.roster.map((d) => makeSimPlayer(d, i));
      let lineup;
      if (all.length <= 5 || this.sandbox) lineup = all.slice(0, 5);
      else {
        const { chart } = autoDepthChart(info.roster, 1);
        const ids = validateRotation(info.rotation, info.roster) ? info.rotation.starters : ['PG', 'SG', 'SF', 'PF', 'C'].map((p) => chart[p][0]?.player.id);
        lineup = ids.map((id) => all.find((p) => p.id === id)).filter(Boolean);
        for (const p of all) if (lineup.length < 5 && !lineup.includes(p)) lineup.push(p);
      }
      for (const p of lineup) p.starter = true;
      return { ...info, index: i, all, lineup, coverage: info.coverage ?? 'auto', tactics: { ...DEFAULT_TACTICS, ...(info.tactics ?? {}) }, timeouts: TIMEOUTS_PER_GAME, autoSubs: info.autoSubs !== false, aiCoach: info.aiCoach !== false, pendingSubs: [], matchups: new Map() };
    });
    for (const t of this.teams) {
      if (t.coverage === 'auto') {
        const big = t.lineup[t.lineup.length - 1];
        t.coverage = big && big.prof.def.perimeter > 0.62 && big.prof.move.agility > 0.55 ? 'switch' : 'drop';
      }
    }
    this.rebuildCourt();
    this.poss = { t0: 0, handler: null, transition: false, screen: null, inbounder: null, lastPass: null };
    if (!this.sandbox) {
      this.pendingTeam = 0;
      this.deadT = 0.01;
    }
  }

  // ------------------------------------------------------------------ utilidades
  dirOf(team) {
    const base = team === 0 ? 1 : -1;
    return this.quarter >= 3 && this.quarter <= 4 ? -base : base;
  }

  isClutch() {
    return this.quarter >= 4 && this.clock < 300 && Math.abs(this.score[0] - this.score[1]) <= 5;
  }

  defenderOf(p) {
    let best = null;
    let bd = 1e9;
    for (const d of this.court) {
      if (d.team === p.team) continue;
      if (d.man === p) return d;
      const dd = dist(d, p);
      if (dd < bd) {
        bd = dd;
        best = d;
      }
    }
    return this.sandbox && bd > 12 ? null : best;
  }

  tickOffBall(p) {
    if (this.t < p.offNext) return false;
    p.offNext = this.t + (0.75 + this.rng.next() * 0.5) / TUNE.OFFBALL_HZ;
    return true;
  }

  say(p, text, major = false) {
    if (this.opts.quiet) return;
    this.events.push({ q: this.quarter, clock: this.clock, team: p?.team ?? -1, text: p ? `${p.short} ${text}` : text, major });
    if (this.events.length > 500) this.events.splice(0, 100);
  }

  fx(label, p) {
    if (this.opts.quiet) return;
    this.effects.push({ label, x: p.x, y: p.y, t: this.t });
    if (this.effects.length > 14) this.effects.shift();
  }

  rebuildCourt() {
    this.court = [...this.teams[0].lineup, ...this.teams[1].lineup];
    this.assignMatchups();
  }

  assignMatchups() {
    const [a, b] = this.teams;
    for (const p of this.court) p.man = null;
    a.lineup.forEach((p, i) => (p.man = b.lineup[i] ?? null));
    b.lineup.forEach((p, i) => (p.man = a.lineup[i] ?? null));
    // matchups definidos pelo técnico: troca os alvos de dois defensores, se ambos os lados estão em quadra
    for (const t of this.teams) {
      for (const [defId, targetId] of t.matchups) {
        const d = t.lineup.find((p) => p.id === defId);
        const other = t.lineup.find((p) => p.man?.id === targetId);
        if (!d || !other || d === other) continue;
        [d.man, other.man] = [other.man, d.man];
      }
    }
  }

  primaryHandler(team) {
    let best = null;
    let bs = -1;
    for (const p of this.teams[team].lineup) {
      const s = p.prof.handle.control * 0.6 + p.prof.pass.iq * 0.2 + p.prof.pass.vision * 0.2;
      if (s > bs) {
        bs = s;
        best = p;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ posse
  changePossession(team, live) {
    const prev = this.offense;
    if (this.pendingTO) {
      const { by, stl, badPass } = this.pendingTO;
      if (by.team !== team) {
        by.stats.tov++;
        if (stl) {
          stl.stats.stl++;
          this.fx('ROUBO', stl);
          this.say(stl, `rouba a bola de ${by.short}`, true);
        } else this.say(by, 'perde a posse', true);
        if (badPass) this.metrics.badPassTO++;
        this.result ??= { type: 'turnover', by };
      }
      this.pendingTO = null;
    }
    this.offense = team;
    this.shotClock = TUNE.SHOT_CLOCK;
    this.help = null;
    this.reb = null;
    this.assignMatchups();
    this.poss = { t0: this.t, handler: this.primaryHandler(team), transition: live, screen: null, inbounder: null, lastPass: null };
    for (const p of this.court) {
      if (!p.hasBall) p.act = { type: 'space', t0: this.t };
      p.planted = false;
      p.crash = false;
      p.posting = false;
      p.speedLimit = null;
      p.burst = 1;
      p.aiNext = this.t + 0.15;
    }
    assignSlots(this, team);
    this.metrics.possessions[team]++;
    if (live && prev !== team) this.metrics.fastBreaks++;
    this.possCount = (this.possCount ?? 0) + 1;
    if (this.sandbox && this.possCount > 1) this.over = true;
  }

  giveBall(p, how) {
    const b = this.ball;
    const wasRebound = b.rebound;
    for (const o of this.court) o.hasBall = false;
    b.state = 'held';
    b.owner = p;
    b.rebound = false;
    b.fall = false;
    b.loosePass = false;
    const reserved = b.reserved;
    b.reserved = null;
    b.last = p;
    p.hasBall = true;
    p.catchT = this.t;
    p.read = null;
    p.dribbled = how !== 'pass';
    p.act = { type: 'dribble', t0: this.t };
    p.speedLimit = null;
    p.aiNext = this.t + (how === 'pass' ? 0.12 + (1 - p.prof.pass.iq) * 0.2 : 0.25);
    if (p.team !== this.offense) {
      if (wasRebound) {
        p.stats.drb++;
        this.say(p, 'pega o rebote defensivo');
        this.result ??= { type: 'miss' };
      }
      this.changePossession(p.team, true);
    } else {
      if (wasRebound) {
        p.stats.orb++;
        this.shotClock = TUNE.SHOT_CLOCK_OREB;
        this.poss.t0 = this.t;
        this.poss.screen = null;
        this.reb = null;
        for (const o of this.court) if (!o.hasBall) o.act = { type: 'space', t0: this.t };
        this.say(p, 'pega o rebote ofensivo', true);
      }
      this.pendingTO = null;
      this.reb = null;
      if (how === 'pass') {
        this.poss.lastPass = { from: b.from, to: p, t: this.t };
        this.metrics.passes++;
      }
      if (reserved != null && p !== this.poss.handler) this.poss.inbounder = p;
    }
  }

  pass(p, to, aim, lob) {
    const b = this.ball;
    const pp = p.prof.pass;
    const d = Math.hypot(aim.x - p.x, aim.y - p.y);
    const on = this.defenderOf(p);
    const pressure = on && dist(on, p) < 3 ? 1.5 : 1;
    // precisão: erro cresce com distância e pressão; um passe ruim sai do alcance do recebedor
    const err = pp.error * (d / 10) * pressure * TUNE.PASS_ERROR_SCALE * this.sl.turnovers;
    const ax = aim.x + this.rng.normal() * err;
    const ay = aim.y + this.rng.normal() * err;
    const dd = Math.hypot(ax - p.x, ay - p.y) || 1;
    let kind = 'chest';
    let speed = pp.speed;
    if (lob) (kind = 'lob'), (speed *= 0.62);
    else if (dd < 5) (kind = 'handoff'), (speed *= 0.5);
    else if (dd > 38) (kind = 'outlet'), (speed *= 1.05);
    else if (dd > 27) kind = 'skip';
    else if (to.act.type === 'roll' || (to.posting && dd < 18)) (kind = 'bounce'), (speed *= 0.85);
    else if (on && dist(on, p) < 2.6 && this.rng.chance(0.5)) kind = 'overhead';
    b.state = 'pass';
    b.kind = kind;
    b.from = p;
    b.to = to;
    b.owner = null;
    b.x = p.x;
    b.y = p.y;
    b.T = dd / speed;
    b.vx = ((ax - p.x) / dd) * speed;
    b.vy = ((ay - p.y) / dd) * speed;
    b.aim = { x: ax, y: ay };
    b.t = 0;
    b.checked = new Set();
    b.last = p;
    p.hasBall = false;
    p.act = { type: 'space', t0: this.t };
    p.anim = { type: 'pass', t: this.t };
    p.speedLimit = null;
    this.pendingTO = { by: p, stl: null, badPass: true };
    const names = { chest: 'passe', lob: 'ponte aérea', handoff: 'mão a mão', outlet: 'passe longo', skip: 'inversão', bounce: 'passe quicado', overhead: 'passe por cima' };
    this.say(p, `${names[kind]} para ${to.short}`);
  }

  intercepted(d) {
    const b = this.ball;
    this.pendingTO = { by: b.from, stl: d, badPass: true };
    this.fx('INTERCEPTAÇÃO', d);
    if (this.rng.chance(0.55)) return this.giveBall(d, 'steal');
    // só desviou: bola viva
    b.state = 'loose';
    b.fall = false;
    b.rebound = false;
    b.vx = b.vx * 0.25 + this.rng.normal() * 5;
    b.vy = b.vy * 0.25 + this.rng.normal() * 5;
    b.vz = 6;
    b.t = 0;
    b.minT = 0.15;
    b.last = d;
  }

  /** Tentativa de roubo no drible. Devolve true se a jogada do portador foi interrompida. */
  stripRisk(p, def, mult) {
    if (!def || def.stun > 0 || dist(def, p) > 3) return false;
    const prob = TUNE.STRIP_SCALE * 0.02 * mult * (0.3 + 1.2 * def.prof.def.steal + 0.4 * def.prof.tend.gamble) * (1.75 - 1.5 * p.prof.handle.security) * this.sl.steals * Math.sqrt(this.sl.turnovers) * (1 + 0.35 * this.teams[def.team].tactics.pressure);
    if (this.rng.next() >= prob) return false;
    if (this.rng.next() < 0.5 * (1.3 - def.prof.def.discipline) * this.sl.fouls * (1 + 0.25 * this.teams[def.team].tactics.pressure)) {
      this.commonFoul(def, p, 'falta na tentativa de roubo');
      return true;
    }
    const b = this.ball;
    const ang = Math.atan2(def.y - p.y, def.x - p.x) + this.rng.normal() * 0.9;
    b.state = 'loose';
    b.owner = null;
    b.fall = false;
    b.rebound = false;
    b.vx = Math.cos(ang) * 11;
    b.vy = Math.sin(ang) * 11;
    b.vz = 4;
    b.t = 0;
    b.minT = 0.2;
    b.last = def;
    p.hasBall = false;
    p.act = { type: 'space', t0: this.t };
    this.pendingTO = { by: p, stl: def, badPass: false };
    this.say(def, `tira a bola de ${p.short}`);
    return true;
  }

  /** Erro não forçado de quem conduz (andada, pisar na linha, bola que escapa): os erros que não viram roubo. */
  fumbleRisk(p, on) {
    if (this.sandbox) return false;
    const pressure = on && dist(on, p) < 3.2 ? 1 : 0.3;
    const moving = p.act.type === 'drive' ? 1.7 : p.dribbled ? 1 : 0.5;
    const prob = TUNE.FUMBLE_SCALE * 0.0042 * pressure * moving * (1.7 - 1.5 * p.prof.handle.security) * (1.25 - 0.25 * p.energy) * this.sl.turnovers;
    if (this.rng.next() >= prob) return false;
    this.pendingTO = { by: p, stl: null, badPass: false };
    if (this.rng.next() < 0.55) {
      // violação: bola parada, posse do adversário
      this.say(p, p.act.type === 'drive' ? 'comete andada' : 'pisa na linha', true);
      this.fx('ERRO', p);
      this.deadBall(1 - p.team);
      return true;
    }
    const b = this.ball;
    const ang = p.facing + this.rng.normal() * 1.2;
    b.state = 'loose';
    b.owner = null;
    b.fall = false;
    b.rebound = false;
    b.vx = Math.cos(ang) * 9;
    b.vy = Math.sin(ang) * 9;
    b.vz = 3;
    b.t = 0;
    b.minT = 0.25;
    b.last = p;
    p.hasBall = false;
    p.act = { type: 'space', t0: this.t };
    this.say(p, 'perde o controle da bola');
    return true;
  }

  outOfBounds() {
    const b = this.ball;
    const last = b.last ?? b.from;
    const team = last ? 1 - last.team : 1 - this.offense;
    if (team !== this.offense && !this.pendingTO && last) this.pendingTO = { by: b.loosePass ? b.from : last, stl: null, badPass: Boolean(b.loosePass) };
    if (this.pendingTO && this.pendingTO.by.team !== this.offense) this.pendingTO = null;
    if (this.pendingTO) this.pendingTO.stl = null;
    if (b.rebound && team !== this.offense) this.result ??= { type: 'miss' };
    this.say(null, 'Bola fora.');
    this.deadBall(team);
  }

  // ------------------------------------------------------------------ arremesso
  startGather(p, type) {
    const ev = evaluateShot(this, p, { type });
    const rim = ev.rim || ev.type === 'floater';
    p.act = { type: 'gather', t0: this.t, until: this.t + (rim ? 0.26 : p.prof.shoot.gather), shot: type ?? ev.type, rim };
    p.anim = { type: 'gather', t: this.t };
  }

  releaseShot(p, type) {
    let ev = evaluateShot(this, p, { type });
    // enterrada no meio do congestionamento vira bandeja contestada
    if (ev.type === 'dunk' && (ev.contest > 0.32 || this.rng.next() > 0.25 + 0.7 * p.prof.finish.dunk)) ev = evaluateShot(this, p, { type: 'layup' });
    const def = ev.by;
    const nearRim = ev.rim || ev.type === 'floater' || ev.type === 'hook';
    const b = this.ball;
    const hoop = hoopOf(this.dirOf(p.team));
    let fouled = false;
    let blocked = false;
    if (def) {
      // falta e toco nascem do contest (posição + alcance + timing), não de um sorteio isolado
      const closing = clamp(Math.hypot(def.vx, def.vy) / 14, 0, 1);
      const pFoul = ev.contest * (nearRim ? TUNE.FOUL_RIM : TUNE.FOUL_JUMPER) * (1.25 - def.prof.def.discipline) * (0.7 + 0.6 * p.prof.finish.drawFoul) * (0.8 + 0.4 * def.prof.tend.foul) * (1 + 0.5 * closing) * this.sl.fouls;
      fouled = this.rng.next() < pFoul;
      if (!fouled) {
        const lengthEdge = clamp(1 + (def.prof.def.reach - p.prof.def.reach) * 0.16, 0.45, 1.7);
        const pBlock = Math.pow(ev.contest, 1.5) * (0.25 + def.prof.def.block) * (nearRim ? TUNE.BLOCK_RIM : TUNE.BLOCK_JUMPER) * lengthEdge * (0.8 + 0.5 * def.prof.tend.block) * (ev.type === 'dunk' ? 0.5 : 1) * this.sl.blocks;
        blocked = this.rng.next() < pBlock;
      }
    }
    const made = !blocked && this.rng.next() < ev.pMake * (fouled ? 0.8 : 1);
    if (!blocked && !fouled && !nearRim) {
      if (ev.level === 0) this.fx('LIVRE', p);
      else if (ev.level >= 4 && def) this.fx('SUFOCADO', def);
    }
    const lp = this.poss.lastPass;
    const assist = lp && lp.to === p && this.t - lp.t < (ev.catchShoot ? 2.6 : 3.4) ? lp.from : null;
    p.hasBall = false;
    b.owner = null;
    p.act = { type: 'space', t0: this.t };
    p.anim = { type: ev.type === 'dunk' ? 'dunk' : 'shot', t: this.t };
    if (def) def.anim = { type: 'contest', t: this.t };
    this.metrics.shots++;
    this.metrics.qualitySum += ev.quality;
    this.metrics.contestSum += ev.contest;
    if (ev.level === 0) this.metrics.openShots++;
    p.debug = { ...(p.debug ?? {}), shot: ev, action: `arremesso ${ev.type}` };
    this.lastShot = { shooter: p, ev, t: this.t, made, blocked, fouled };

    if (blocked) {
      p.stats.fga++;
      if (ev.three) p.stats.tpa++;
      def.stats.blk++;
      this.fx('TOCO', def);
      this.say(def, `dá um toco em ${p.short}`, true);
      const ang = Math.atan2(p.y - hoop.y, p.x - hoop.x) + this.rng.normal() * 1.1;
      b.state = 'loose';
      b.fall = false;
      b.rebound = true;
      b.x = p.x;
      b.y = p.y;
      b.z = 8;
      b.vx = Math.cos(ang) * (7 + this.rng.next() * 8);
      b.vy = Math.sin(ang) * (7 + this.rng.next() * 8);
      b.vz = 2;
      b.t = 0;
      b.minT = 0.25;
      b.last = def;
      this.reb = { live: true, t0: this.t, x: clamp(b.x + b.vx * 0.7, 1, COURT.L - 1), y: clamp(b.y + b.vy * 0.7, 1, COURT.W - 1) };
      this.setCrashers();
      return;
    }
    const d = ev.dist;
    b.state = 'shot';
    b.x0 = p.x;
    b.y0 = p.y;
    b.z0 = ev.type === 'dunk' ? 10.5 : 7 + p.prof.finish.vertical * 1.5;
    b.x1 = hoop.x;
    b.y1 = hoop.y;
    b.z1 = 10;
    b.T = ev.type === 'dunk' ? 0.18 : ev.rim ? 0.42 : 0.5 + d * 0.034;
    b.arc = (ev.type === 'dunk' ? 0.2 : ev.rim ? 1.3 : 1.6 + d * 0.17) * TUNE.SHOT_ARC;
    b.t = 0;
    b.last = p;
    b.shot = { shooter: p, made, ev, fouled, def, assist, points: ev.points };
    this.reb = { live: false, t0: this.t, x: hoop.x, y: hoop.y };
    this.setCrashers();
    if (fouled) this.fx('FALTA', def);
  }

  setCrashers() {
    for (const o of this.court) {
      if (o.team !== this.offense) continue;
      const k = { crash: 1.45, balanced: 1, getback: 0.45 }[this.teams[o.team].tactics.boards] ?? 1;
      o.crash = o.role === 'big' ? this.rng.next() < (0.55 + 0.4 * o.prof.reb.crash) * k : this.rng.next() < 0.5 * o.prof.reb.crash * k;
    }
  }

  shotArrived() {
    const b = this.ball;
    const s = b.shot;
    const p = s.shooter;
    const hoop = { x: b.x1, y: b.y1 };
    if (s.ft) return this.freeThrowArrived(s);
    const st = p.stats;
    const desc = { dunk: 'enterrada', layup: 'bandeja', floater: 'floater', hook: 'gancho', mid: 'arremesso de média distância', three: 'bola de três', pullup: s.ev.three ? 'pull-up de três' : 'pull-up', stepback: s.ev.three ? 'stepback de três' : 'stepback', fadeaway: 'fadeaway' }[s.ev.type] ?? 'arremesso';
    if (s.made || !s.fouled) {
      st.fga++;
      if (s.ev.three) st.tpa++;
    }
    if (s.made) {
      st.fgm++;
      if (s.ev.three) st.tpm++;
      st.pts += s.points;
      this.score[p.team] += s.points;
      this.scoreLog.push({ t: this.t, q: this.quarter, team: p.team, pts: s.points, id: p.id });
      if (s.assist) s.assist.stats.ast++;
      if (this.poss.transition) this.metrics.fastBreakPts += s.points;
      if (s.ev.type === 'dunk') this.fx('ENTERRADA', p);
      this.say(p, `converte ${desc}${s.assist ? ` (assistência de ${s.assist.short})` : ''} — ${CONTEST_LEVELS[s.ev.level]}`, true);
      this.result ??= { type: 'made', points: s.points, shot: s.ev };
    } else if (!s.fouled) this.say(p, `erra ${desc} — ${CONTEST_LEVELS[s.ev.level]}`, true);
    if (s.fouled) return this.shootingFoul(s.def, p, s.made ? 1 : s.points);
    if (s.made) return this.afterMade(1 - p.team, hoop);
    // erro: a bola sai do aro para um ponto físico; arremesso longo → rebote longo
    const away = Math.atan2(b.y0 - hoop.y, b.x0 - hoop.x);
    const ang = away + (this.rng.chance(0.35) ? Math.PI * 0.6 * (this.rng.chance(0.5) ? 1 : -1) : 0) + this.rng.normal() * 0.8;
    const L = 2 + this.rng.next() * 4 + s.ev.dist * TUNE.REBOUND_LONG * (0.25 + this.rng.next() * 0.75);
    const dir = this.dirOf(p.team);
    b.state = 'loose';
    b.fall = true;
    b.rebound = true;
    b.reserved = null;
    b.x0 = hoop.x;
    b.y0 = hoop.y;
    b.z0 = 10;
    b.x1 = clamp(hoop.x + Math.cos(ang) * L, dir > 0 ? 60 : 1.5, dir > 0 ? COURT.L - 1.5 : 34);
    b.y1 = clamp(hoop.y + Math.sin(ang) * L, 2, COURT.W - 2);
    b.T = 0.65 + L * 0.045;
    b.arc = 2.5 + this.rng.next() * 2.5;
    b.t = 0;
    b.minT = 0.3;
    this.reb = { live: true, t0: this.t, x: b.x1, y: b.y1 };
  }

  afterMade(team, hoop) {
    const b = this.ball;
    if (this.sandbox) return (this.over = true);
    // tempo técnico quando alguém está no limite: abre a janela de substituições
    // só o técnico da IA pede tempo sozinho; o time do usuário guarda os seus
    const tiredTeam = this.teams.find((t) => t.aiCoach && t.timeouts > 0 && t.lineup.some((p) => p.energy < TUNE.SUB_OUT - 0.04));
    if (tiredTeam && this.t - (this.lastTimeout ?? -99) > 150) {
      this.timeoutRequest = tiredTeam.index;
      return this.deadBall(team);
    }
    b.state = 'loose';
    b.fall = false;
    b.rebound = false;
    b.x = hoop.x;
    b.y = hoop.y;
    b.z = 9;
    b.vx = 0;
    b.vy = 0;
    b.vz = 0;
    b.t = 0;
    b.minT = 1.5; // a bola cai da rede e alguém precisa buscá-la e repor
    b.reserved = team;
    b.shot = null;
    this.changePossession(team, false);
  }

  // ------------------------------------------------------------------ faltas e lances livres
  registerFoul(def) {
    def.stats.pf++;
    this.teamFouls[def.team]++;
    if (def.stats.pf >= 6) {
      def.fouledOut = true;
      this.say(def, 'está eliminado por faltas', true);
    }
  }

  commonFoul(def, on, text) {
    this.registerFoul(def);
    this.say(def, `${text} em ${on.short}`, true);
    this.fx('FALTA', def);
    this.pendingTO = null;
    if (def.team !== this.offense && this.teamFouls[def.team] > 4) return this.startFT(on, 2);
    if (def.team === this.offense) {
      def.stats.tov++;
      return this.deadBall(1 - def.team);
    }
    this.shotClock = Math.max(this.shotClock, TUNE.SHOT_CLOCK_OREB);
    this.deadBall(this.offense, true);
  }

  shootingFoul(def, shooter, n) {
    this.registerFoul(def);
    this.say(def, `faz falta em ${shooter.short} no arremesso (${n} lance${n > 1 ? 's' : ''} livre${n > 1 ? 's' : ''})`, true);
    this.startFT(shooter, n);
  }

  startFT(shooter, n) {
    const dir = this.dirOf(shooter.team);
    this.offense = shooter.team;
    this.state = 'ft';
    this.reb = null;
    this.help = null;
    this.ft = { shooter, n, i: 0, timer: 1.7, phase: 'aim' };
    const spots = { off: [[10, 8.6], [10, -8.6], [31, -9], [34, 8]], def: [[6.6, -8.6], [6.6, 8.6], [13.4, -8.6], [13.4, 8.6], [28, 0]] };
    let oi = 0;
    let di = 0;
    for (const p of this.court) {
      const s = p === shooter ? [COURT.ft, 0] : p.team === shooter.team ? spots.off[oi++ % 4] : spots.def[di++ % 5];
      const w = toWorld(dir, s[0], s[1]);
      this.place(p, w.x, w.y);
      p.act = { type: 'space', t0: this.t };
      p.hasBall = false;
    }
    shooter.facing = dir > 0 ? 0 : Math.PI;
    this.holdBall(shooter);
    if (this.sandbox) this.over = true;
  }

  holdBall(p) {
    const b = this.ball;
    for (const o of this.court) o.hasBall = false;
    b.state = 'held';
    b.owner = p;
    b.rebound = false;
    b.fall = false;
    b.reserved = null;
    p.hasBall = true;
    p.catchT = this.t;
    p.dribbled = false;
    p.act = { type: 'dribble', t0: this.t };
    updateBall(this, 0);
  }

  stepFT(dt) {
    const f = this.ft;
    const b = this.ball;
    if (f.phase === 'aim') {
      f.timer -= dt;
      updateBall(this, 0);
      if (f.timer > 0) return;
      const p = f.shooter;
      const hoop = hoopOf(this.dirOf(p.team));
      const made = this.rng.next() < 0.3 + 0.6 * p.prof.shoot.freeThrow;
      p.hasBall = false;
      b.owner = null;
      b.state = 'shot';
      Object.assign(b, { x0: p.x, y0: p.y, z0: 7.5, x1: hoop.x, y1: hoop.y, z1: 10, T: 0.95, arc: 3.2, t: 0 });
      b.shot = { shooter: p, made, ft: true };
      p.anim = { type: 'shot', t: this.t };
      f.phase = 'air';
      return;
    }
    updateBall(this, dt);
  }

  freeThrowArrived(s) {
    const f = this.ft;
    const p = s.shooter;
    p.stats.fta++;
    if (s.made) {
      p.stats.ftm++;
      p.stats.pts++;
      this.score[p.team]++;
      this.scoreLog.push({ t: this.t, q: this.quarter, team: p.team, pts: 1, id: p.id });
    }
    this.say(p, s.made ? 'converte o lance livre' : 'erra o lance livre', true);
    f.i++;
    if (f.i < f.n) {
      f.phase = 'aim';
      f.timer = 1.5;
      return this.holdBall(p);
    }
    this.state = 'play';
    this.ft = null;
    const hoop = hoopOf(this.dirOf(p.team));
    if (s.made) return this.afterMade(1 - p.team, hoop);
    const b = this.ball;
    const ang = this.rng.next() * Math.PI * 2;
    const L = 2 + this.rng.next() * 4;
    Object.assign(b, { state: 'loose', fall: true, rebound: true, reserved: null, x0: hoop.x, y0: hoop.y, z0: 10, x1: clamp(hoop.x + Math.cos(ang) * L, 1.5, COURT.L - 1.5), y1: hoop.y + Math.sin(ang) * L, T: 0.8, arc: 3, t: 0, minT: 0.3, last: p });
    this.reb = { live: true, t0: this.t, x: b.x1, y: b.y1 };
    this.setCrashers();
  }

  // ------------------------------------------------------------------ bola parada
  place(p, x, y) {
    p.x = x;
    p.y = y;
    p.vx = 0;
    p.vy = 0;
    p.tx = x;
    p.ty = y;
    p.hist.length = 0;
    p.stun = 0;
    p.planted = false;
  }

  deadBall(team, keep = false) {
    if (this.sandbox) return (this.over = true);
    this.state = 'dead';
    this.deadT = 1.3;
    this.pendingTeam = team;
    this.pendingKeep = keep;
    this.ball.state = 'dead';
    this.ball.owner = null;
    for (const p of this.court) p.hasBall = false;
    if (this.timeoutRequest != null) this.grantTimeout(this.timeoutRequest);
  }

  // ------------------------------------------------------------------ comandos do técnico
  /** Muda uma instrução tática. A IA passa a tentar executá-la; nada é aplicado "por decreto". */
  setTactic(team, key, value) {
    const t = this.teams[team];
    if (key === 'coverage') t.coverage = value;
    else if (key === 'autoSubs') t.autoSubs = Boolean(value);
    else if (key in t.tactics) t.tactics[key] = value;
    else return null;
    const text = key === 'autoSubs' ? (value ? 'Substituições automáticas' : 'Substituições manuais') : describeTactic(key, value, t);
    this.say(null, `${t.name} — ${text}`);
    return text;
  }

  /** Define quem um defensor marca. targetId = null desfaz. Vale a partir da próxima troca de posse. */
  setMatchup(team, defenderId, targetId) {
    const t = this.teams[team];
    for (const [d, target] of t.matchups) if (target === targetId || d === defenderId) t.matchups.delete(d);
    if (targetId != null) t.matchups.set(defenderId, targetId);
    this.assignMatchups();
  }

  /** Agenda uma substituição; ela acontece na próxima bola parada. */
  requestSub(team, outId, inId) {
    const t = this.teams[team];
    const out = t.lineup.find((p) => p.id === outId);
    const sub = t.all.find((p) => p.id === inId);
    if (!out || !sub) return { ok: false, reason: 'Jogador não encontrado.' };
    if (t.lineup.includes(sub)) return { ok: false, reason: `${sub.short} já está em quadra.` };
    if (sub.fouledOut) return { ok: false, reason: `${sub.short} está eliminado por faltas.` };
    t.pendingSubs = t.pendingSubs.filter((s) => s.outId !== outId && s.inId !== inId);
    t.pendingSubs.push({ outId, inId });
    return { ok: true };
  }

  cancelSub(team, outId) {
    const t = this.teams[team];
    t.pendingSubs = t.pendingSubs.filter((s) => s.outId !== outId);
  }

  /**
   * Pede tempo. Sai na hora se a bola está parada ou se o time tem a posse controlada;
   * caso contrário fica pedido para a próxima bola parada.
   * @returns 'granted' | 'queued' | 'none' (sem tempos) | 'no' (sandbox / jogo encerrado)
   */
  callTimeout(team) {
    const t = this.teams[team];
    if (this.sandbox || this.over) return 'no';
    if (t.timeouts <= 0) return 'none';
    if (this.state === 'dead') return this.grantTimeout(team), 'granted';
    if (this.state === 'play' && this.offense === team && this.ball.state === 'held') {
      this.timeoutRequest = team;
      this.deadBall(team, true);
      return 'granted';
    }
    this.timeoutRequest = team;
    return 'queued';
  }

  grantTimeout(team) {
    const t = this.teams[team];
    this.timeoutRequest = null;
    if (t.timeouts <= 0) return;
    t.timeouts--;
    this.deadT = Math.max(this.deadT, 2.5);
    this.lastTimeout = this.t;
    // o descanso é real, mas pequeno: um tempo não zera o cansaço
    for (const p of this.court) p.energy = Math.min(1, p.energy + 0.045);
    this.timeout = { team, t: this.t };
    this.say(null, `Tempo pedido pelo ${t.name} (restam ${t.timeouts}).`, true);
  }

  resume() {
    this.state = 'play';
    this.substitutions();
    const team = this.pendingTeam;
    const keepClock = this.pendingKeep ? this.shotClock : null;
    for (const p of this.court) p.hasBall = false;
    this.changePossession(team, false);
    if (keepClock != null) {
      this.shotClock = keepClock;
      this.metrics.possessions[team]--;
    }
    this.setupHalfCourt(team);
  }

  /** Reposicionamento de bola parada (única situação em que há "teletransporte"). */
  setupHalfCourt(team) {
    const dir = this.dirOf(team);
    const hoop = hoopOf(dir);
    const h = this.poss.handler;
    for (const p of this.teams[team].lineup) {
      const s = p === h ? toWorld(dir, 40, 0) : slotPos(dir, p.slot);
      this.place(p, s.x, s.y);
      p.facing = Math.atan2(hoop.y - p.y, hoop.x - p.x);
    }
    for (const d of this.teams[1 - team].lineup) {
      const m = d.man;
      if (!m) {
        this.place(d, hoop.x - dir * 6, hoop.y);
        continue;
      }
      const l = dist(m, hoop) || 1;
      this.place(d, m.x + ((hoop.x - m.x) / l) * 3.5, m.y + ((hoop.y - m.y) / l) * 3.5);
      d.facing = Math.atan2(m.y - d.y, m.x - d.x);
    }
    this.holdBall(h);
  }

  substitutions() {
    if (this.sandbox) return;
    let changed = false;
    const closing = this.quarter >= 4 && this.clock < 300;
    const scale = this.quarterSeconds / TUNE.QUARTER_SECONDS; // jogos de quarto curto giram a rotação na mesma proporção
    for (const t of this.teams) {
      for (const { outId, inId } of t.pendingSubs) {
        const i = t.lineup.findIndex((p) => p.id === outId);
        const sub = t.all.find((p) => p.id === inId);
        if (i < 0 || !sub || sub.fouledOut || t.lineup.includes(sub)) continue;
        this.say(sub, `entra no lugar de ${t.lineup[i].short}`);
        t.lineup[i] = sub;
        changed = true;
      }
      t.pendingSubs = [];
      const bench = () => t.all.filter((p) => !t.lineup.includes(p) && !p.fouledOut);
      const fit = (p, i) => (p.data.ovr ?? 70) + (p.role === t.lineup[i].role ? 4 : 0) + (p.data.positions?.includes(t.lineup[i].data.positions?.[0]) ? 3 : 0);
      t.lineup.forEach((c, i) => {
        // técnico humano no comando: só troca sozinho quem foi eliminado por faltas
        if (!t.autoSubs && !c.fouledOut) return;
        // rotação planejada: ninguém fica em quadra indefinidamente só porque ainda tem energia
        const stamina = (c.data.attributes?.stamina ?? 60) / 100;
        const due = !closing && c.stint > (c.starter ? TUNE.STINT_STARTER : TUNE.STINT_BENCH) * scale * (0.8 + 0.4 * stamina);
        const tired = due || (c.energy < TUNE.SUB_OUT && !(closing && c.starter && c.energy > 0.45));
        const trouble = c.fouledOut || (c.stats.pf >= 5 && !closing) || (c.stats.pf >= 4 && this.quarter <= 2);
        // titular descansado volta no lugar do reserva
        const rested = (p) => (closing && p.energy > 0.6) || (p.rest > TUNE.REST_MIN * scale && p.energy > 0.8);
        const back = !c.starter && (closing || c.stint > 150 * scale) ? bench().filter((p) => p.starter && rested(p) && p.role === c.role)[0] : null;
        if (!tired && !trouble && !back) return;
        // quem acabou de sentar não volta pela porta dos fundos: precisa ter descansado um mínimo
        const pool = bench().filter((p) => (p.energy > 0.78 && p.rest > TUNE.REST_MIN * scale * 0.6) || c.fouledOut);
        const sub = back ?? pool.sort((a, b) => fit(b, i) - fit(a, i))[0];
        if (!sub) return;
        t.lineup[i] = sub;
        this.say(sub, `entra no lugar de ${c.short}`);
        changed = true;
      });
    }
    if (changed) this.rebuildCourt();
  }

  endQuarter() {
    this.say(null, `Fim do ${this.quarter > 4 ? 'tempo extra' : `${this.quarter}º quarto`}: ${this.teams[0].name} ${this.score[0]} x ${this.score[1]} ${this.teams[1].name}`, true);
    if (this.quarter >= 4 && this.score[0] !== this.score[1]) {
      this.over = true;
      this.state = 'over';
      return;
    }
    this.quarter++;
    this.clock = this.quarter > 4 ? TUNE.OVERTIME_SECONDS * (this.quarterSeconds / TUNE.QUARTER_SECONDS) : this.quarterSeconds;
    this.teamFouls = [0, 0];
    this.pendingTO = null;
    this.periodBreak = this.quarter; // sinal para a interface: intervalo antes deste período
    this.deadBall(this.quarter % 2 === 1 ? 0 : 1);
    this.deadT = 2;
  }

  // ------------------------------------------------------------------ passo de simulação
  step(dt = TUNE.DT) {
    if (this.over) return;
    this.t += dt;
    if (this.state === 'dead') {
      this.deadT -= dt;
      for (const t of this.teams) for (const p of t.all) if (!t.lineup.includes(p)) p.energy = Math.min(1, p.energy + TUNE.FATIGUE_RECOVERY * dt);
      if (this.deadT <= 0) this.resume();
      return;
    }
    if (this.state === 'ft') return this.stepFT(dt);

    const b = this.ball;
    this.clock -= dt;
    if (b.state === 'held' || b.state === 'pass') this.shotClock -= dt;
    const handler = b.state === 'held' ? b.owner : null;

    // ---- decisões (frequência menor que a do movimento)
    if (handler && this.t >= (this.helpNext ?? 0)) {
      this.helpNext = this.t + 0.2;
      const driving = handler.act.type === 'drive' || (handler.act.type === 'gather' && handler.act.rim);
      const prev = this.help;
      this.help = driving ? pickHelper(this, handler, this.defenderOf(handler)) : null;
      if (this.help && prev?.helper && prev.helper !== this.help.helper && dist(prev.helper, prev.spot) < 6) this.help.helper = prev.helper; // evita troca de ajudante a cada tick
    }
    if (!handler) this.help = null;

    for (const p of this.court) {
      if (p.team === this.offense) {
        if (p === handler) {
          const fine = p.act.type === 'gather' || p.act.type === 'move';
          if (fine || this.t >= p.aiNext) {
            if (!fine) {
              p.aiNext = this.t + 1 / TUNE.DECISION_HZ;
              const on = this.defenderOf(p);
              if (on && p.act.type !== 'gather' && this.stripRisk(p, on, 0.45)) continue;
              if (this.fumbleRisk(p, on)) continue;
            }
            if (p.hasBall) handlerTick(this, p);
          }
        } else offBallTick(this, p);
      } else updateDefender(this, p);
    }
    if (b.state === 'loose' && !this.reb) this.chaseLoose();

    // ---- movimento, contato e bola
    for (const p of this.court) {
      movePlayer(this, p, dt);
      recordHistory(p);
      p.secs += dt;
      p.stint += dt;
      p.rest = 0;
      const stamina = (p.data.attributes.stamina ?? 60) / 100;
      p.energy = Math.max(0.2, p.energy - (TUNE.FATIGUE_BASE + TUNE.FATIGUE_EFFORT * p.effort * p.effort) * dt * (1.5 - 0.85 * stamina));
      if (Math.abs(p.energy - p.profEnergy) > 0.04) {
        p.prof = buildProfiles(p.data, p.energy);
        p.profEnergy = p.energy;
      }
    }
    for (const t of this.teams) {
      for (const p of t.all) {
        if (t.lineup.includes(p)) continue;
        p.energy = Math.min(1, p.energy + TUNE.FATIGUE_RECOVERY * dt);
        p.rest += dt;
        p.stint = 0;
      }
    }
    resolveCollisions(this);
    updateBall(this, dt);
    if (this.over || this.state !== 'play') return;

    // ---- métricas de execução
    if (handler && this.t >= (this.spaceNext ?? 0)) {
      this.spaceNext = this.t + 1;
      const hoop = hoopOf(this.dirOf(this.offense));
      if (dist(handler, hoop) < 34) {
        let sum = 0;
        let nn = 0;
        for (const p of this.court) {
          if (p.team !== this.offense) continue;
          let near = 99;
          for (const m of this.court) if (m.team === p.team && m !== p) near = Math.min(near, dist(p, m));
          if (near < 99) (sum += near), nn++;
        }
        if (nn) (this.metrics.spacingSum += sum / nn), this.metrics.spacingN++;
      }
    }
    if (this.opts.recordReplay && Math.round(this.t / dt) % 3 === 0) {
      this.replay.push(this.snapshot());
      if (this.replay.length > 300) this.replay.shift();
    }

    // ---- violações e relógio
    if (this.shotClock <= 0 && (b.state === 'held' || b.state === 'pass')) {
      const p = b.owner ?? b.from;
      if (p) p.stats.tov++;
      this.pendingTO = null;
      this.say(null, 'Estouro dos 24 segundos.', true);
      this.result ??= { type: 'turnover' };
      return this.deadBall(1 - this.offense);
    }
    if (this.clock <= 0 && b.state !== 'shot') this.endQuarter();
  }

  chaseLoose() {
    const b = this.ball;
    for (const t of [0, 1]) {
      if (b.reserved != null && b.reserved !== t) continue;
      const list = this.teams[t].lineup.slice().sort((a, c) => dist(a, b) - dist(c, b));
      list.slice(0, b.reserved != null ? 1 : 2).forEach((p) => {
        p.tx = b.x + b.vx * 0.25;
        p.ty = b.y + b.vy * 0.25;
        p.mode = b.reserved != null ? 'run' : 'sprint';
        p.arrive = false;
        p.planted = false;
      });
    }
  }

  /** Roda a simulação por `seconds` de jogo (para acelerar ou simular sem renderizar). */
  advance(seconds) {
    const steps = Math.round(seconds / TUNE.DT);
    for (let i = 0; i < steps && !this.over; i++) this.step();
  }

  runToEnd(maxSteps = 4e5) {
    for (let i = 0; i < maxSteps && !this.over; i++) this.step();
    return this;
  }

  /** Estado mínimo para replay/melhores momentos. */
  snapshot() {
    const b = this.ball;
    return { t: this.t, q: this.quarter, clock: this.clock, score: [...this.score], ball: [b.x, b.y, b.z, b.state], players: this.court.map((p) => [p.id, p.x, p.y, p.facing, p.hasBall ? 1 : 0]) };
  }

  boxScore() {
    return this.teams.map((t) => {
      const rows = t.all.filter((p) => p.secs > 0).map((p) => ({ id: p.id, name: p.name, min: p.secs / 60, ...p.stats, reb: p.stats.orb + p.stats.drb, starter: p.starter, onCourt: t.lineup.includes(p), energy: p.energy }));
      const total = rows.reduce((a, r) => {
        for (const k of Object.keys(newStats())) a[k] += r[k];
        return a;
      }, newStats());
      total.reb = total.orb + total.drb;
      return { team: t.name, id: t.id, rows: rows.sort((a, b) => b.min - a.min), total };
    });
  }
}
