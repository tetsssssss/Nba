// Simulação rápida de uma partida, posse a posse, sem quadra: é o que resolve os ~15 jogos por dia
// da liga em milissegundos. NÃO substitui o motor 2D (src/match), que continua sendo o jogo do
// usuário; é um modelo estatístico mais simples, alimentado pelos mesmos atributos e tendências,
// e que devolve o mesmo formato de registro (ver match/bridge.js) para a classificação e as estatísticas.
import { autoDepthChart } from '../players/depth.js';
import { assertPlayableRoster } from '../players/eligibility.js';
import { resolveRotation } from '../players/rotation.js';

/** Constantes de calibração do modelo rápido (alvo: médias da NBA por time). */
export const QUICK = {
  POSSESSIONS: 99.5,
  POSSESSIONS_SD: 3.2,
  HOME_EDGE: 0.006, // vantagem de quadra no aproveitamento
  TURNOVER: 0.132,
  THREE_RATE_BASE: 0.1,
  THREE_RATE_TEND: 0.58,
  THREE_BASE: 0.212,
  THREE_SKILL: 0.0021,
  TWO_BASE: 0.352,
  TWO_SKILL: 0.0023,
  DEFENSE: 0.0023,
  OVR_EDGE: 0.0009, // aproveitamento por ponto de Overall acima de 76
  CREATION: 0.0016, // aproveitamento do time por ponto de criação coletiva acima da média // quanto cada ponto de defesa coletiva acima da média tira do aproveitamento
  FOUL_BASE: 0.07,
  FOUL_TEND: 0.11,
  OREB: 0.215,
  BLOCK: 0.19,
  ASSIST_TWO: 0.47,
  ASSIST_THREE: 0.78,
  MINUTES: [34, 33, 31, 29, 27, 23, 19, 16, 12, 8, 5, 3, 0],
};

const STAT_KEYS = ['pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'orb', 'drb', 'ast', 'stl', 'blk', 'tov', 'pf'];
const blank = () => Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Prepara um time: rotação, minutos e os pesos de cada jogador em cada tipo de lance. */
function prepare(team, rng) {
  const roster = team.roster.filter((p) => p.injury?.status !== 'Out');
  const { chart } = autoDepthChart(roster, 1);
  // os titulares saem do depth chart; os minutos seguem a qualidade, não a posição (o pivô estrela não é o "quinto homem")
  const natural = ['PG', 'SG', 'SF', 'PF', 'C'].map((pos) => chart[pos][0]?.player).filter(Boolean).sort((a, b) => b.ovr - a.ovr);
  const resolved = resolveRotation(team.rotation, roster, { starters: natural, bench: roster.filter((p) => !natural.includes(p)).sort((a, b) => b.ovr - a.ovr), minutes: {} });
  const { starters, bench } = resolved;
  const order = [...starters, ...bench].slice(0, QUICK.MINUTES.length);
  const raw = order.map((p, i) => Math.max(0, resolved.minutes[p.id] ?? (QUICK.MINUTES[i] + (i < 10 ? rng.normal() * 1.6 : 0))));
  const denominator = raw.reduce((a, b) => a + b, 0);
  if (!denominator) throw new Error('Rotação não contém minutos jogáveis.');
  const scale = 240 / denominator;
  const players = order.map((data, i) => {
    const a = data.attributes;
    const t = data.tendencies ?? {};
    const min = raw[i] * scale;
    const scoring = 0.45 * a.shotCreation + 0.2 * a.offensiveIQ + 0.35 * Math.max(a.threePoint, a.rimFinishing, a.midRange);
    return {
      data, min, starter: i < starters.length, stats: blank(),
      use: min * Math.exp(0.026 * (scoring - 70)),
      threeRate: a.threePoint < 42 ? 0.03 : clamp(QUICK.THREE_RATE_BASE + QUICK.THREE_RATE_TEND * ((t.threePointFreq ?? 40) / 100), 0.02, 0.6),
      p3: QUICK.THREE_BASE + QUICK.THREE_SKILL * a.threePoint,
      p2: QUICK.TWO_BASE + QUICK.TWO_SKILL * (0.55 * a.rimFinishing + 0.25 * a.midRange + 0.2 * a.layup),
      pFt: 0.42 + 0.0048 * a.freeThrow,
      // impacto geral do jogador (leitura, criação, tudo o que o Overall resume) no próprio aproveitamento
      edge: QUICK.OVR_EDGE * ((data.ovr ?? 75) - 76),
      foul: QUICK.FOUL_BASE + QUICK.FOUL_TEND * ((t.drawFoul ?? 40) / 100),
      pass: min * Math.exp(0.042 * (0.6 * a.passing + 0.4 * a.passingVision - 65)),
      orb: min * Math.exp(0.034 * (a.offensiveRebounding - 60)),
      drb: min * Math.exp(0.027 * (a.defensiveRebounding - 60)),
      stl: min * Math.exp(0.032 * (a.steals - 60)),
      blk: min * Math.exp(0.055 * (a.blocks - 55)),
      tov: min * Math.exp(0.02 * (a.shotCreation - 60) - 0.03 * (a.turnoverAvoidance - 60)),
      pfw: min * (1.4 - 0.008 * a.discipline),
    };
  });
  const avg = (f) => players.reduce((s, p) => s + f(p.data.attributes) * p.min, 0) / 240;
  return {
    id: team.id, players,
    perimeter: avg((a) => 0.6 * a.perimeterDefense + 0.2 * a.closeout + 0.2 * a.defensiveIQ),
    interior: avg((a) => 0.55 * a.interiorDefense + 0.25 * a.blocks + 0.2 * a.helpDefense),
    steal: avg((a) => a.steals),
    care: avg((a) => 0.6 * a.turnoverAvoidance + 0.4 * a.ballHandling),
    oreb: avg((a) => a.offensiveRebounding),
    dreb: avg((a) => a.defensiveRebounding),
    pace: avg((a) => a.transitionPlay),
    // criação coletiva: bons passadores melhoram o arremesso dos companheiros
    creation: avg((a) => 0.5 * a.passing + 0.3 * a.passingVision + 0.2 * a.offensiveIQ),
    level: players.reduce((s, p) => s + (p.data.ovr ?? 75) * p.min, 0) / 240,
  };
}

const pick = (rng, players, key, except = null) => rng.weighted(players.filter((p) => p !== except && p[key] > 0).map((p) => [p, p[key]]));

/** Uma posse de `o` contra `d`. Devolve os pontos marcados. */
function possession(rng, o, d, home) {
  if (rng.next() < QUICK.TURNOVER * (1 + 0.006 * (d.steal - 62)) * (1 - 0.007 * (o.care - 68))) {
    pick(rng, o.players, 'tov').stats.tov++;
    if (rng.next() < 0.56) pick(rng, d.players, 'stl').stats.stl++;
    return 0;
  }
  if (rng.next() < 0.085) pick(rng, d.players, 'pfw').stats.pf++; // falta fora do arremesso
  let points = 0;
  for (let chance = 0; chance < 4; chance++) {
    const s = pick(rng, o.players, 'use');
    const three = rng.next() < s.threeRate;
    const fouled = rng.next() < s.foul * (three ? 0.25 : 1.25);
    const defense = three ? d.perimeter : d.interior;
    const p = (three ? s.p3 : s.p2) + s.edge + QUICK.CREATION * (o.creation - 66) - QUICK.DEFENSE * (defense - 66 + 0.5 * (d.level - 76)) + (home ? QUICK.HOME_EDGE : -QUICK.HOME_EDGE);
    const made = rng.next() < p * (fouled ? 0.55 : 1);
    if (fouled) pick(rng, d.players, 'pfw').stats.pf++;
    if (made || !fouled) {
      s.stats.fga++;
      if (three) s.stats.tpa++;
    }
    if (made) {
      const pts = three ? 3 : 2;
      s.stats.fgm++;
      if (three) s.stats.tpm++;
      s.stats.pts += pts;
      points += pts;
      if (rng.next() < (three ? QUICK.ASSIST_THREE : QUICK.ASSIST_TWO)) pick(rng, o.players, 'pass', s).stats.ast++;
    }
    let lastMissed = !made;
    if (fouled) {
      const n = made ? 1 : three ? 3 : 2;
      for (let i = 0; i < n; i++) {
        s.stats.fta++;
        lastMissed = rng.next() >= s.pFt;
        if (!lastMissed) {
          s.stats.ftm++;
          s.stats.pts++;
          points++;
        }
      }
    }
    if (!lastMissed) return points;
    if (!fouled && !three && rng.next() < QUICK.BLOCK * (1 + 0.02 * (d.interior - 66))) pick(rng, d.players, 'blk').stats.blk++;
    if (rng.next() < QUICK.OREB * (1 + 0.012 * (o.oreb - d.dreb + 8))) pick(rng, o.players, 'orb').stats.orb++;
    else {
      pick(rng, d.players, 'drb').stats.drb++;
      return points;
    }
  }
  return points;
}

/**
 * @param home, away { id, roster: [jogadores com attributes, tendencies, ovr, positions] }
 * @returns registro de jogo no formato de match/bridge.js (sem `seed`: o estado do RNG é de quem chama)
 */
export function simulateQuickGame(home, away, rng, { type = 'regular' } = {}) {
  // Não consumir o RNG nem registrar partidas se um dos lados é inválido.
  for (const team of [home, away]) assertPlayableRoster(team);
  const teams = [prepare(home, rng), prepare(away, rng)];
  const pace = QUICK.POSSESSIONS + 0.06 * ((teams[0].pace + teams[1].pace) / 2 - 65) + rng.normal() * QUICK.POSSESSIONS_SD;
  const perQuarter = Math.round(pace / 4);
  const score = [0, 0];
  const periods = [[], []];
  const play = (n) => {
    const q = [0, 0];
    for (let i = 0; i < n; i++) {
      q[0] += possession(rng, teams[0], teams[1], true);
      q[1] += possession(rng, teams[1], teams[0], false);
    }
    for (const t of [0, 1]) {
      score[t] += q[t];
      periods[t].push(q[t]);
    }
  };
  for (let q = 0; q < 4; q++) play(perQuarter);
  let overtimes = 0;
  while (score[0] === score[1] && overtimes < 6) {
    overtimes++;
    play(Math.round(perQuarter * 0.42));
  }
  if (score[0] === score[1]) score[rng.next() < 0.5 ? 0 : 1]++; // sexta prorrogação empatada: decide no lance livre final
  const extra = 1 + (overtimes * 5) / 48;
  const box = teams.map((t, i) => {
    const players = t.players.filter((p) => p.min >= 0.5).map((p) => ({ id: p.data.id, name: p.data.name, starter: p.starter, min: Math.round(p.min * extra * 10) / 10, ...p.stats }));
    const total = blank();
    for (const p of players) for (const k of STAT_KEYS) total[k] += p[k];
    // a cesta de desempate (rara) entra no total para o box score bater com o placar
    if (total.pts !== score[i]) {
      const top = players.slice().sort((a, b) => b.pts - a.pts)[0];
      const diff = score[i] - total.pts;
      top.pts += diff;
      top.ftm += diff;
      top.fta += diff;
      total.pts += diff;
      total.ftm += diff;
      total.fta += diff;
      periods[i][periods[i].length - 1] += diff;
    }
    return { teamId: t.id, total, players };
  });
  return { v: 1, type, status: 'final', quick: true, home: home.id, away: away.id, score, periods, overtimes, quarterSeconds: 720, userTeamId: null, box };
}
