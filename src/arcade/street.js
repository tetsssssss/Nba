// Motor autônomo 3x3 de meia quadra. Não usa regras 5x5, calendário ou IndexedDB.
import { createRng } from '../core/rng.js';
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const attr = (p, key, fallback = 60) => Number.isFinite(p.attributes?.[key]) ? p.attributes[key] : fallback;
export function newStreetGame(teams, { seed = 'street', target = 21, checkBall = true, squadSize = 3 } = {}) {
  if (![11, 21].includes(target)) throw Error('Street: meta deve ser 11 ou 21.');
  if (![1, 2, 3].includes(squadSize)) throw Error('Street: formato de equipe inválido.');
  if (!Array.isArray(teams) || teams.length !== 2 || teams.some((t) => t.roster?.length !== squadSize)) throw Error(`Street exige exatamente ${squadSize} jogador(es) por time.`);
  if (teams.some(t => t.roster.some(p => !p || p.id == null || !p.name || !p.attributes)))
    throw Error('Street: elenco contém atleta inválido ou incompleto.');
  const ids = teams.flatMap((t) => t.roster.map((p) => String(p.id)));
  if (new Set(ids).size !== squadSize * 2) throw Error('Street não permite jogador repetido.');
  return { teams, seed: String(seed), target, squadSize, checkBall, score: [0, 0], offense: 0,
    possessions: 0, over: false, winner: null, events: [], box: teams.map((t) => Object.fromEntries(t.roster.map((p) => [String(p.id), { pts: 0, fga: 0, fgm: 0, tpa: 0, tpm: 0, stl: 0, tov: 0 }]))),
  };
}
export function streetPossession(state, tactic = 'balanced') {
  if (state.over) return state;
  if (!['balanced', 'outside', 'drive', 'pass'].includes(tactic)) throw Error('Tática Street desconhecida.');
  const next = { ...state, score: [...state.score], events: [...state.events],
    box: state.box.map((b) => Object.fromEntries(Object.entries(b).map(([id, stats]) => [id, { ...stats }]))) };
  const rng = createRng(`${state.seed}:${state.possessions}`);
  const attacking = next.offense;
  const opp = 1 - attacking;
  const offense = next.teams[attacking].roster;
  const defense = next.teams[opp].roster;
  const attackWeights = offense.map((p) => [p, 15 + attr(p, 'shotCreation') + attr(p, 'ballHandling') * 0.35]);
  const shooter = rng.weighted(attackWeights);
  const defender = rng.pick(defense);
  const a = shooter.attributes || {};
  const d = defender.attributes || {};
  const outside = tactic === 'outside' ? 0.87 : tactic === 'drive' ? 0.14 : tactic === 'pass' ? 0.52 : 0.43;
  const isTwo = rng.chance(outside);
  const stealChance = clamp(0.085 + (attr(defender, 'steals') - 60) * .0019 - (attr(shooter, 'ballHandling') - 60) * .0012 - (tactic === 'pass' ? .02 : 0), .025, .20);
  const sStats = next.box[attacking][String(shooter.id)];
  const dStats = next.box[opp][String(defender.id)];
  let text, kind = 'miss', points = 0;
  if (rng.chance(stealChance)) {
    dStats.stl++; sStats.tov++; kind = 'steal';
    text = `${defender.name} rouba a bola de ${shooter.name}.`;
  } else {
    const skill = isTwo ? (.7 * attr(shooter, 'threePoint') + .3 * attr(shooter, 'catchAndShoot'))
      : (.5 * attr(shooter, 'rimFinishing') + .3 * attr(shooter, 'layup') + .2 * attr(shooter, 'shotCreation'));
    const defend = isTwo ? attr(defender, 'perimeterDefense') : attr(defender, 'interiorDefense');
    const pMake = clamp((isTwo ? .35 : .54) + .005 * (skill - 70) - .0028 * (defend - 65) + (tactic === 'pass' ? .03 : 0), .14, .79);
    sStats.fga++; if (isTwo) sStats.tpa++;
    if (rng.chance(pMake)) {
      kind = isTwo ? 'long' : 'drive'; points = isTwo ? 2 : 1;
      sStats.fgm++; if (isTwo) sStats.tpm++; sStats.pts += points;
      next.score[attacking] += points;
      text = `${shooter.name} converte ${isTwo ? 'de fora (2)' : 'perto do aro (1)'}!`;
    } else text = `${shooter.name} erra ${isTwo ? 'de fora' : 'a infiltração'}.`;
  }
  next.possessions++;
  const score = next.score[attacking];
  if (score >= next.target && (score - next.score[opp] >= 2 || score >= 25)) { next.over = true; next.winner = attacking; }
  if (!next.over) next.offense = opp;
  next.events = [{ kind, offense: attacking, playerId: shooter.id, defenderId: kind === 'steal' ? defender.id : null, points, text, score: [...next.score], n: next.possessions }, ...next.events].slice(0, 60);
  return next;
}
export function simulateStreet(game, { limit = 300, tactic = 'balanced' } = {}) {
  let current = game;
  for (let i = 0; i < limit && !current.over; i++) current = streetPossession(current, tactic);
  return current;
}

/** Circuito Street: quartas/semis/final, squads 3x3 únicos e partidas reais do motor Street. */
export function runStreetCircuit(squads, { seed = 'street-circuit', target = 11 } = {}) {
  if (![4, 8].includes(squads?.length)) throw Error('Circuito Street exige 4 ou 8 trios.');
  if (new Set(squads.map((s) => s.id)).size !== squads.length) throw Error('Trios repetidos no circuito.');
  const ids = squads.flatMap((t) => t.roster.map((p) => String(p.id)));
  if (new Set(ids).size !== squads.length * 3 || squads.some((t) => t.roster.length !== 3)) throw Error('Circuito Street exige trios sem atletas repetidos.');
  let contenders = [...squads];
  const rounds = [];
  for (let stage = 1; contenders.length > 1; stage++) {
    const games = [];
    const next = [];
    for (let i = 0; i < contenders.length; i += 2) {
      const a = contenders[i], b = contenders[i+1];
      const game = simulateStreet(newStreetGame([a,b],{seed:`${seed}:s${stage}:p${i/2}`,target}));
      const winner = game.teams[game.winner];
      games.push({ home:a.id, away:b.id, score:[...game.score], winner:winner.id, possessions:game.possessions });
      next.push(winner);
    }
    rounds.push(games); contenders=next;
  }
  return { seed, rounds, champion:contenders[0].id };
}
