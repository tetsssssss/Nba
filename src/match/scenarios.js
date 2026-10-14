// Sandbox: monta uma única posse em situação controlada (1x1, post, pick and roll,
// contra-ataque...) para testar e calibrar movimentos sem jogar uma partida inteira.
import { dist, hoopOf, slotPos, toWorld } from './config.js';
import { MatchSim } from './sim.js';
import { startScreen } from './offense.js';

export const SCENARIOS = [
  { id: 'iso', label: 'Isolação no topo', off: 1, def: 1 },
  { id: 'post', label: 'Post-up no bloco', off: 1, def: 1 },
  { id: 'spotup', label: 'Arremessador livre na ala', off: 1, def: 1 },
  { id: 'closeout', label: 'Arremessador com closeout', off: 1, def: 1 },
  { id: 'pnr', label: 'Pick and roll', off: 2, def: 2 },
  { id: 'break', label: 'Contra-ataque 3x2', off: 3, def: 2 },
  { id: 'half', label: 'Meia quadra 5x5', off: 5, def: 5 },
];

/**
 * @param o.offense  dados dos atacantes (o primeiro tem a bola)
 * @param o.defense  dados dos defensores (na ordem de marcação)
 * @param o.scenario id de SCENARIOS
 * @param o.force    'drive' | 'post' | 'shoot' | null — ação inicial obrigatória do portador
 * @param o.gap      distância inicial do marcador da bola
 */
export function createSandbox({ offense, defense, scenario = 'iso', seed = 'sandbox', force = null, gap = null, coverage = 'auto', sliders = null }) {
  const sim = new MatchSim(
    [
      { id: 'ATK', name: 'Ataque', colors: ['#f26b3a', '#ffffff'], roster: offense },
      { id: 'DEF', name: 'Defesa', colors: ['#5aa9f0', '#ffffff'], roster: defense, coverage },
    ],
    { seed, sandbox: true, quiet: false, sliders },
  );
  sim.scenario = scenario;
  sim.state = 'play';
  sim.clock = 300;
  sim.changePossession(0, scenario === 'break');
  const dir = sim.dirOf(0);
  const hoop = hoopOf(dir);
  const [atk, dfn] = sim.teams.map((t) => t.lineup);
  const h = atk[0];
  sim.poss.handler = h;
  const put = (p, d, lat) => {
    const w = toWorld(dir, d, lat);
    sim.place(p, w.x, w.y);
    p.facing = Math.atan2(hoop.y - w.y, hoop.x - w.x);
  };
  const guard = (d, m, g = 3.5) => {
    const l = dist(m, hoop) || 1;
    sim.place(d, m.x + ((hoop.x - m.x) / l) * g, m.y + ((hoop.y - m.y) / l) * g);
    d.facing = Math.atan2(m.y - d.y, m.x - d.x);
  };
  // base: todos nos seus espaços, defensores do lado da cesta
  atk.forEach((p) => {
    const s = slotPos(dir, p.slot);
    sim.place(p, s.x, s.y);
  });
  put(h, 30, 0);
  if (scenario === 'post') put(h, 11, 9);
  if (scenario === 'spotup' || scenario === 'closeout') put(h, 21, 20);
  if (scenario === 'pnr' && atk[1]) put(atk[1], 22, 9);
  if (scenario === 'break') {
    put(h, 50, 0);
    if (atk[1]) put(atk[1], 44, -17);
    if (atk[2]) put(atk[2], 44, 17);
  }
  dfn.forEach((d, i) => d.man && guard(d, d.man, i === 0 ? gap ?? (scenario === 'spotup' ? 13 : scenario === 'closeout' ? 9 : scenario === 'post' ? 2 : 4) : 3.5));
  if (scenario === 'break') {
    const a = toWorld(dir, 16, -5);
    const b = toWorld(dir, 12, 5);
    if (dfn[0]) sim.place(dfn[0], a.x, a.y);
    if (dfn[1]) sim.place(dfn[1], b.x, b.y);
    for (const p of atk) (p.vx = dir * 12), (p.act = p === h ? p.act : { type: 'space', t0: 0 });
  }
  sim.holdBall(h);
  h.catchT = scenario === 'spotup' || scenario === 'closeout' ? sim.t : -3;
  h.dribbled = false;
  if (scenario === 'closeout' && dfn[0]) {
    // o defensor já vem fechando em velocidade
    const l = dist(dfn[0], h) || 1;
    dfn[0].vx = ((h.x - dfn[0].x) / l) * 14;
    dfn[0].vy = ((h.y - dfn[0].y) / l) * 14;
  }
  if (scenario === 'post' || force === 'post') h.act = { type: 'post', t0: 0 };
  if (force === 'drive') h.act = { type: 'drive', t0: 0, side: h.hand, around: null, stall: 0 };
  if (force === 'shoot') sim.startGather(h, null);
  if (scenario === 'pnr' && atk[1]) startScreen(sim, atk[1], h);
  sim.forced = force;
  return sim;
}

/** Jogador sintético para testes: todos os atributos em `base`, com sobrescritas. */
export function syntheticPlayer(id, name, { base = 60, attrs = {}, tendencies = {}, heightIn = 78, weight = 215, positions = ['SF'] } = {}) {
  const keys = ['rimFinishing', 'layup', 'dunk', 'postScoring', 'midRange', 'threePoint', 'freeThrow', 'pullUp', 'catchAndShoot', 'shotCreation', 'offBallMovement', 'screenUsage', 'offensiveRebounding', 'ballHandling', 'passing', 'passingVision', 'decisionMaking', 'pickAndRoll', 'transitionPlay', 'turnoverAvoidance', 'perimeterDefense', 'interiorDefense', 'steals', 'blocks', 'screenNavigation', 'helpDefense', 'defensiveIQ', 'closeout', 'defensiveRebounding', 'speed', 'acceleration', 'strength', 'vertical', 'stamina', 'agility', 'balance', 'durability', 'offensiveIQ', 'clutch', 'consistency', 'discipline', 'workEthic', 'leadership', 'competitiveness', 'focus'];
  return { id, name, lastName: name, positions, heightIn, weight, ovr: base, attributes: { ...Object.fromEntries(keys.map((k) => [k, base])), ...attrs }, tendencies };
}
