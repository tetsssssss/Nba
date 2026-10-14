// Cenários reproduzíveis do motor 2D. Cada teste roda a simulação de verdade
// (sem Canvas) em várias sementes e verifica o comportamento esperado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MatchSim } from '../src/match/sim.js';
import { createSandbox, syntheticPlayer as P } from '../src/match/scenarios.js';
import { evaluateShot } from '../src/match/shot.js';
import { breakAdvantage, laneRisk } from '../src/match/offense.js';
import { buildProfiles, getArchetype, getMovementProfile, getShootingProfile } from '../src/match/profiles.js';
import { TUNE, dist, hoopOf } from '../src/match/config.js';

const SEEDS = Array.from({ length: 14 }, (_, i) => `t${i}`);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

const quickPG = () => P(1, 'Rápido', { base: 65, heightIn: 74, weight: 185, positions: ['PG'], attrs: { speed: 94, acceleration: 95, agility: 92, ballHandling: 92, layup: 85, rimFinishing: 82 }, tendencies: { driveFreq: 90, rimAttackFreq: 80 } });
const slowC = () => P(2, 'Pesado', { base: 60, heightIn: 85, weight: 275, positions: ['C'], attrs: { speed: 42, acceleration: 38, agility: 38, perimeterDefense: 45, defensiveIQ: 55, strength: 92, interiorDefense: 85 } });
const stopper = () => P(3, 'Stopper', { base: 65, heightIn: 78, weight: 210, positions: ['SF'], attrs: { speed: 88, acceleration: 88, agility: 93, perimeterDefense: 95, defensiveIQ: 93, closeout: 90 } });
const strongC = () => P(4, 'Torre', { base: 62, heightIn: 84, weight: 280, positions: ['C'], attrs: { strength: 96, postScoring: 92, balance: 85, rimFinishing: 85 }, tendencies: { postUpFreq: 90 } });
const smallG = () => P(5, 'Baixinho', { base: 60, heightIn: 73, weight: 180, positions: ['PG'], attrs: { strength: 38, interiorDefense: 35 } });
const shooter = () => P(6, 'Atirador', { base: 60, positions: ['SG'], attrs: { threePoint: 93, catchAndShoot: 94, pullUp: 80 }, tendencies: { threePointFreq: 90, catchShootFreq: 90 } });

test('Teste 1 — armador rápido leva vantagem de infiltração sobre pivô lento no perímetro', () => {
  const advantage = (defender) =>
    mean(
      SEEDS.map((seed) => {
        const sim = createSandbox({ offense: [quickPG()], defense: [defender()], scenario: 'iso', seed, force: 'drive' });
        const [a, d] = sim.court;
        const hoop = hoopOf(sim.dirOf(0));
        sim.advance(1.4);
        return dist(d, hoop) - dist(a, hoop); // > 0: atacante já passou do marcador
      }),
    );
  const vsSlow = advantage(slowC);
  const vsStopper = advantage(stopper);
  assert.ok(vsSlow > vsStopper + 1.5, `vantagem contra o pivô ${vsSlow.toFixed(1)} pés; contra o stopper ${vsStopper.toFixed(1)}`);
  assert.ok(vsSlow > 0, 'o armador precisa passar do pivô');
});

test('Teste 2 — pivô forte ganha posição no post contra um guard', () => {
  const gained = (defender) =>
    mean(
      SEEDS.map((seed) => {
        const sim = createSandbox({ offense: [strongC()], defense: [defender()], scenario: 'post', seed });
        const a = sim.court[0];
        const hoop = hoopOf(sim.dirOf(0));
        const start = dist(a, hoop);
        let best = start;
        for (let i = 0; i < 60 && a.hasBall && a.act.type === 'post'; i++) {
          sim.step();
          best = Math.min(best, dist(a, hoop));
        }
        return start - best;
      }),
    );
  const vsGuard = gained(smallG);
  const vsBig = gained(strongC);
  assert.ok(vsGuard > vsBig + 0.8, `backdown contra guard ${vsGuard.toFixed(2)} pés; contra pivô ${vsBig.toFixed(2)}`);
  assert.ok(vsGuard < 9, 'ninguém empurra o defensor indefinidamente');
});

test('Testes 3 e 4 — arremessador livre tem alta qualidade; com closeout a qualidade cai', () => {
  const open = createSandbox({ offense: [shooter()], defense: [stopper()], scenario: 'spotup', seed: 's' });
  const tight = createSandbox({ offense: [shooter()], defense: [stopper()], scenario: 'spotup', seed: 's', gap: 2.2 });
  const a = evaluateShot(open, open.court[0]);
  const b = evaluateShot(tight, tight.court[0]);
  assert.equal(a.level, 0, 'arremesso livre');
  assert.ok(a.three && a.catchShoot);
  assert.ok(a.pMake > 0.4, `chance livre ${a.pMake.toFixed(2)}`);
  assert.ok(b.level >= 2, `nível de contest ${b.level}`);
  assert.ok(a.quality >= b.quality + 8, `qualidade ${a.quality} → ${b.quality}`);
  // prever o closeout também reduz a estimativa de quem decide
  const closing = createSandbox({ offense: [shooter()], defense: [stopper()], scenario: 'closeout', seed: 's' });
  const now = evaluateShot(closing, closing.court[0]);
  const predicted = evaluateShot(closing, closing.court[0], { predict: true });
  assert.ok(predicted.contest > now.contest, 'defensor chegando aumenta o contest previsto');
});

test('Teste 5 — o bloqueio existe fisicamente e altera a trajetória do defensor', () => {
  let contacts = 0;
  let set = 0;
  for (const seed of SEEDS) {
    const sim = createSandbox({ offense: [quickPG(), strongC()], defense: [stopper(), slowC()], scenario: 'pnr', seed, coverage: 'drop' });
    const onBall = sim.court.find((p) => p.team === 1 && p.man === sim.court[0]);
    for (let i = 0; i < 240 && !sim.over; i++) {
      sim.step();
      if (sim.poss.screen?.phase === 'set') set = Math.max(set, 1);
      if (onBall.screened) break;
    }
    if (onBall.screened) contacts++;
  }
  assert.ok(set === 1, 'o bloqueador chega a plantar o bloqueio');
  assert.ok(contacts / SEEDS.length >= 0.35, `o marcador da bola bateu no bloqueio em ${contacts}/${SEEDS.length} posses`);
});

test('Teste 6 — a IA reconhece a vantagem numérica no contra-ataque 3x2', () => {
  const run = (nDef) => {
    const sim = createSandbox({ offense: [quickPG(), shooter(), P(7, 'Ala')], defense: [stopper(), slowC(), smallG()].slice(0, nDef), scenario: 'break', seed: 'b' });
    return { sim, adv: breakAdvantage(sim, sim.court[0]) };
  };
  const three2 = run(2);
  assert.equal(three2.adv.off, 3);
  assert.equal(three2.adv.def, 2);
  assert.equal(three2.adv.advantage, true);
  // e ataca: em poucos segundos a bola está perto do aro
  const hoop = hoopOf(three2.sim.dirOf(0));
  three2.sim.advance(3.2);
  assert.ok(three2.sim.over || dist(three2.sim.ball, hoop) < 26, 'a transição chega à área de finalização');
});

test('Teste 7 — passe através de um defensor tem risco maior de interceptação', () => {
  const build = (blocked) => {
    const thief = P(8, 'Ladrão', { base: 60, attrs: { steals: 95, defensiveIQ: 90 } });
    const sim = createSandbox({ offense: [quickPG(), shooter()], defense: [smallG(), thief], scenario: 'half', seed: 'x' });
    const [h, m] = sim.teams[0].lineup;
    const d = sim.teams[1].lineup[1];
    sim.place(h, 60, 25);
    sim.place(m, 60, 45);
    sim.place(sim.teams[1].lineup[0], 20, 5);
    sim.place(d, blocked ? 60 : 30, blocked ? 35 : 5);
    return { sim, h, m };
  };
  const clear = build(false);
  const blocked = build(true);
  const rClear = laneRisk(clear.sim, clear.h, clear.m);
  const rBlocked = laneRisk(blocked.sim, blocked.h, blocked.m);
  assert.ok(rBlocked > rClear + 0.25, `risco ${rClear.toFixed(2)} → ${rBlocked.toFixed(2)}`);
  // e na prática: a bola viaja e pode ser cortada
  let stolen = 0;
  for (let i = 0; i < 40; i++) {
    const { sim, h, m } = build(true);
    sim.rng = { ...sim.rng, next: (() => { let s = i * 7919 + 13; return () => ((s = (s * 16807) % 2147483647), s / 2147483647); })(), normal: () => 0 };
    sim.pass(h, m, { x: m.x, y: m.y }, false);
    for (let k = 0; k < 40 && sim.ball.state === 'pass'; k++) sim.step();
    if (sim.ball.owner?.team === 1 || sim.ball.last?.team === 1) stolen++;
  }
  assert.ok(stolen >= 6, `interceptados ${stolen}/40`);
});

test('Teste 8 — jogador fatigado piora de forma leve e gradual', () => {
  const d = quickPG();
  const fresh = getMovementProfile(d, 1);
  const tired = getMovementProfile(d, 0.4);
  const ratio = tired.maxSpeed / fresh.maxSpeed;
  assert.ok(ratio < 0.97 && ratio > 0.85, `velocidade cansado/descansado = ${ratio.toFixed(3)}`);
  assert.ok(tired.accel < fresh.accel);
  assert.ok(getShootingProfile(d, 0.4).fatiguePenalty > 0 && getShootingProfile(d, 0.4).fatiguePenalty < 0.05);
  assert.ok(buildProfiles(d, 0.4).def.reaction > buildProfiles(d, 1).def.reaction, 'defensor cansado reage mais devagar');
});

test('física: ninguém se teletransporta e a aceleração é limitada', () => {
  const roster = (o) => Array.from({ length: 5 }, (_, i) => P(o + i, `J${o + i}`, { base: 62 + i * 4, positions: [['PG', 'SG', 'SF', 'PF', 'C'][i]], heightIn: 74 + i * 2.5, weight: 190 + i * 18 }));
  const sim = new MatchSim([{ id: 'A', name: 'A', colors: [], roster: roster(10) }, { id: 'B', name: 'B', colors: [], roster: roster(20) }], { seed: 'fis', quiet: true, quarterSeconds: 120 });
  let worstMove = 0;
  let worstAccel = 0;
  let worstBall = 0;
  let prev = null;
  for (let i = 0; i < 6000 && !sim.over; i++) {
    const before = sim.state === 'play' ? sim.court.map((p) => [p, p.x, p.y, Math.hypot(p.vx, p.vy)]) : null;
    const ballBefore = sim.ball.state === 'pass' ? [sim.ball.x, sim.ball.y] : null;
    sim.step();
    if (before && sim.state === 'play' && prev === 'play') {
      for (const [p, x, y, v] of before) {
        if (!sim.court.includes(p)) continue;
        worstMove = Math.max(worstMove, Math.hypot(p.x - x, p.y - y));
        // colisões amortecem a velocidade; só o ganho importa
        if (p.bump !== sim.t) worstAccel = Math.max(worstAccel, (Math.hypot(p.vx, p.vy) - v) / TUNE.DT);
      }
      if (ballBefore && sim.ball.state === 'pass') worstBall = Math.max(worstBall, Math.hypot(sim.ball.x - ballBefore[0], sim.ball.y - ballBefore[1]));
    }
    prev = sim.state;
  }
  assert.ok(worstMove < 1.7, `maior deslocamento em um passo: ${worstMove.toFixed(2)} pés`);
  assert.ok(worstAccel < 62, `maior aceleração: ${worstAccel.toFixed(0)} pés/s²`);
  assert.ok(worstBall < 2.2, `passe viaja no máximo ${worstBall.toFixed(2)} pés por passo`);
});

test('determinismo: a mesma semente reproduz a mesma partida', () => {
  const roster = (o) => Array.from({ length: 6 }, (_, i) => P(o + i, `J${o + i}`, { base: 60 + i * 5, positions: [['PG', 'SG', 'SF', 'PF', 'C', 'SF'][i]] }));
  const play = (seed) => {
    const sim = new MatchSim([{ id: 'A', name: 'A', colors: [], roster: roster(10) }, { id: 'B', name: 'B', colors: [], roster: roster(20) }], { seed, quiet: true, quarterSeconds: 90 });
    sim.runToEnd();
    return `${sim.score.join('-')}@${sim.t.toFixed(3)}:${sim.court.map((p) => p.x.toFixed(3)).join(',')}`;
  };
  assert.equal(play('abc'), play('abc'));
  assert.notEqual(play('abc'), play('abd'));
});

test('identidade: perfis diferentes jogam de forma diferente', () => {
  const slasher = P(31, 'Slasher', { base: 66, positions: ['SG'], attrs: { speed: 92, acceleration: 93, rimFinishing: 90, layup: 90, ballHandling: 85, threePoint: 40, catchAndShoot: 40, shotCreation: 80 }, tendencies: { driveFreq: 95, rimAttackFreq: 90, threePointFreq: 8, isoFreq: 60 } });
  const sniper = P(32, 'Sniper', { base: 66, positions: ['SF'], attrs: { threePoint: 95, catchAndShoot: 95, speed: 60, rimFinishing: 50, layup: 50, shotCreation: 50 }, tendencies: { driveFreq: 10, rimAttackFreq: 10, threePointFreq: 95, catchShootFreq: 95 } });
  const lock = P(33, 'Cadeado', { base: 62, positions: ['SF'], attrs: { perimeterDefense: 96, steals: 90, defensiveIQ: 95, threePoint: 45, shotCreation: 35 }, tendencies: { threePointFreq: 30, driveFreq: 20, passFirst: 80 } });
  assert.notEqual(getArchetype(slasher), getArchetype(sniper));
  assert.equal(getArchetype(lock), 'Defensive stopper');
  const others = (o) => [P(o, 'Arm', { base: 64, positions: ['PG'], attrs: { ballHandling: 80, passing: 82 } }), P(o + 1, 'Piv', { base: 64, positions: ['C'], heightIn: 84, weight: 255 })];
  const filler = (o) => Array.from({ length: 5 }, (_, i) => P(o + i, `R${i}`, { base: 62, positions: [['PG', 'SG', 'SF', 'PF', 'C'][i]], heightIn: 75 + i * 2.4 }));
  const shots = new Map([[31, { n: 0, three: 0, rim: 0 }], [32, { n: 0, three: 0, rim: 0 }], [33, { n: 0, three: 0, rim: 0 }]]);
  for (const seed of ['i1', 'i2', 'i3']) {
    const sim = new MatchSim([{ id: 'A', name: 'A', colors: [], roster: [...others(40), slasher, sniper, lock] }, { id: 'B', name: 'B', colors: [], roster: filler(50) }], { seed, quiet: true, quarterSeconds: 360 });
    let seen = null;
    while (!sim.over) {
      sim.step();
      const s = sim.lastShot;
      if (s && s !== seen) {
        seen = s;
        const rec = shots.get(s.shooter.id);
        if (rec) (rec.n++, s.ev.three && rec.three++, s.ev.rim && rec.rim++);
      }
    }
  }
  const [a, b, c] = [31, 32, 33].map((id) => shots.get(id));
  assert.ok(a.n >= 12 && b.n >= 12, `amostra: slasher ${a.n}, sniper ${b.n}, cadeado ${c.n}`);
  assert.ok(a.rim / a.n > b.rim / b.n + 0.25, `no aro: slasher ${(a.rim / a.n).toFixed(2)} × sniper ${(b.rim / b.n).toFixed(2)}`);
  assert.ok(b.three / b.n > a.three / a.n + 0.3, `de três: sniper ${(b.three / b.n).toFixed(2)} × slasher ${(a.three / a.n).toFixed(2)}`);
  assert.ok(c.n < Math.max(a.n, b.n), 'o especialista defensivo arremessa menos que os pontuadores');
});

test('estatísticas plausíveis com elencos reais', () => {
  const read = (f) => JSON.parse(readFileSync(new URL(`../data/seed/${f}`, import.meta.url), 'utf8'));
  const players = read('players.json');
  const ratings = new Map(read('ratings.json').map((r) => [r.playerId, r]));
  const roster = (id) => players.filter((p) => p.teamId === id && p.injury?.status !== 'Out').map((p) => ({ ...p, ...ratings.get(p.id), ovr: ratings.get(p.id).overall })).sort((a, b) => b.ovr - a.ovr).slice(0, 13);
  const tot = { pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, reb: 0, orb: 0, ast: 0, tov: 0, stl: 0, blk: 0, pf: 0, n: 0, poss: 0 };
  for (const [a, b, seed] of [['OKC', 'DEN', 'e1'], ['NYK', 'SAS', 'e2'], ['WAS', 'UTA', 'e3']]) {
    const sim = new MatchSim([{ id: a, name: a, colors: [], roster: roster(a) }, { id: b, name: b, colors: [], roster: roster(b) }], { seed, quiet: true });
    sim.runToEnd();
    assert.ok(sim.over, 'a partida termina');
    for (const t of sim.boxScore()) {
      for (const k of Object.keys(tot)) if (k in t.total) tot[k] += t.total[k];
      tot.n++;
      const minutes = t.rows.reduce((x, r) => x + r.min, 0);
      assert.ok(Math.abs(minutes - (sim.t - 0) / 60 * 5) < 30, `minutos distribuídos: ${minutes.toFixed(0)}`);
      const top = Math.max(...t.rows.map((r) => r.min));
      assert.ok(top <= 46, `rotação: ninguém joga ${top.toFixed(0)} minutos`);
      assert.ok(t.rows.length >= 8, 'o banco é utilizado');
    }
    tot.poss += sim.metrics.possessions[0] + sim.metrics.possessions[1];
  }
  const per = (k) => tot[k] / tot.n;
  const within = (label, v, lo, hi) => assert.ok(v >= lo && v <= hi, `${label} = ${v.toFixed(1)} (esperado ${lo}–${hi})`);
  within('pontos por time', per('pts'), 95, 140);
  within('posses por time', per('poss'), 88, 125);
  within('FG%', (tot.fgm / tot.fga) * 100, 41, 53);
  within('3P%', (tot.tpm / tot.tpa) * 100, 28, 42);
  within('tentativas de 3', per('tpa'), 20, 52);
  within('LL%', (tot.ftm / tot.fta) * 100, 68, 88);
  within('lances livres tentados', per('fta'), 12, 38);
  within('rebotes', per('reb'), 36, 62);
  within('rebotes ofensivos', per('orb'), 5, 18);
  within('assistências', per('ast'), 15, 36);
  within('erros', per('tov'), 7, 21);
  within('roubos', per('stl'), 4, 13);
  within('tocos', per('blk'), 2, 10);
  within('faltas', per('pf'), 12, 28);
});
