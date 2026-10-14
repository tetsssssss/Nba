// Classes de prospectos (store `prospects`) e conversão em jogador profissional.
//
// IMPORTANTE (dados): o projeto não contém dados confiáveis de turmas de Draft futuras. Por isso todas as
// classes geradas aqui são FICTÍCIAS (`fictional: true`), com nomes inventados, sem foto e sem pretensão de
// representar pessoas reais. Se um dia houver uma fonte verificada, basta gravar prospectos com
// `fictional: false` e `source` preenchida; o restante do sistema não distingue a origem.
import { createRng } from '../core/rng.js';
import { ATTRIBUTE_KEYS, POSITIONS, clampRating } from '../players/attributes.js';
import { ATTRIBUTE_BY_KEY } from '../players/attributes.js';
import { POSITION_WEIGHTS, positionOverall } from '../players/overall.js';
import { TENDENCY_KEYS } from '../players/tendencies.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ------------------------------------------------------------------ nomes (todos inventados)
const FIRST = {
  usa: ['Marcus', 'Elijah', 'Terrence', 'Devin', 'Caleb', 'Jaylen', 'Malik', 'Tyson', 'Isaiah', 'Darius', 'Cole', 'Xavier', 'Brandon', 'Nolan', 'Trey', 'Jamal', 'Keanu', 'Roman', 'Silas', 'Declan', 'Amari', 'Landon', 'Zion', 'Corbin', 'Mateo', 'Jericho', 'Bryce', 'Dorian', 'Ezra', 'Quincy'],
  intl: ['Luka', 'Mathis', 'Nikos', 'Emre', 'Tomás', 'Rafael', 'Gabriel', 'Lucas', 'Henrique', 'Joaquín', 'Bogdan', 'Matej', 'Ousmane', 'Kwame', 'Oluwaseun', 'Yuto', 'Daichi', 'Aleksandar', 'Viktor', 'Jonas', 'Maximilian', 'Callum', 'Dejan', 'Ilias', 'Mamadou', 'Théo', 'Enzo', 'Arnas', 'Matteo', 'Cheikh'],
};
const LAST = {
  usa: ['Whitfield', 'Okonkwo-Reid', 'Harlan', 'Brockton', 'Delacroix', 'Faulkner', 'Gantt', 'Holloway', 'Ingram-Cole', 'Jessup', 'Kincaid', 'Lockhart', 'Merriweather', 'Nasby', 'Overton', 'Pettiford', 'Quarles', 'Redmond', 'Sandoval', 'Thibodeaux', 'Underhill', 'Vandiver', 'Wexler', 'Yarborough', 'Zellner', 'Ashby', 'Bellamy', 'Crenshaw', 'Dunmore', 'Everhart'],
  intl: ['Vukašinović', 'Marchetti', 'Lindqvist', 'Papadakis', 'Demirtaş', 'Albuquerque', 'Tavares-Lins', 'Cordeiro', 'Ferrandez', 'Koprivica', 'Novotný', 'Diagne', 'Mbaye', 'Adeyemi-Cole', 'Nakamura-Ruiz', 'Hoffmeister', 'Kowalczyk', 'Baltrūnas', 'Girardet', 'Moulin', 'Santángelo', 'Okafor-Lima', 'Zivkovic', 'Rinaldi', 'Svensson', 'Kaltenborn', 'Ndiaye', 'Pereira-Vaz', 'Stavrou', 'Varga'],
};
const ORIGINS = [
  { country: 'EUA', weight: 66, name: 'usa', school: 'college' },
  { country: 'Canadá', weight: 4, name: 'usa', school: 'college' },
  { country: 'França', weight: 4, name: 'intl', school: 'club', clubs: ['ASVEL Villeurbanne', 'Paris Basketball', 'Nanterre 92', 'Strasbourg SIG'] },
  { country: 'Brasil', weight: 4, name: 'intl', school: 'club', clubs: ['Flamengo', 'Franca', 'Minas', 'Bauru'] },
  { country: 'Espanha', weight: 3, name: 'intl', school: 'club', clubs: ['Real Madrid Baloncesto', 'Joventut Badalona', 'Unicaja Málaga'] },
  { country: 'Austrália', weight: 3, name: 'intl', school: 'club', clubs: ['Perth Wildcats', 'Illawarra Hawks', 'NBL Next Stars'] },
  { country: 'Nigéria', weight: 2, name: 'intl', school: 'college' },
  { country: 'Sérvia', weight: 2, name: 'intl', school: 'club', clubs: ['Mega Basket', 'KK Partizan'] },
  { country: 'Alemanha', weight: 2, name: 'intl', school: 'club', clubs: ['ALBA Berlin', 'Bayern Munique'] },
  { country: 'Lituânia', weight: 2, name: 'intl', school: 'club', clubs: ['Žalgiris Kaunas', 'Rytas Vilnius'] },
  { country: 'Argentina', weight: 2, name: 'intl', school: 'club', clubs: ['Boca Juniors', 'Quimsa'] },
  { country: 'Grécia', weight: 1.5, name: 'intl', school: 'club', clubs: ['Olympiacos', 'Panathinaikos'] },
  { country: 'Turquia', weight: 1.5, name: 'intl', school: 'club', clubs: ['Anadolu Efes', 'Fenerbahçe'] },
  { country: 'Camarões', weight: 1.5, name: 'intl', school: 'college' },
  { country: 'Japão', weight: 1, name: 'intl', school: 'club', clubs: ['Alvark Tokyo', 'Ryukyu Golden Kings'] },
  { country: 'Itália', weight: 1.5, name: 'intl', school: 'club', clubs: ['Virtus Bologna', 'Olimpia Milano'] },
];
const COLLEGES = ['Duke', 'Kentucky', 'Kansas', 'North Carolina', 'Arizona', 'UConn', 'Gonzaga', 'Michigan State', 'Houston', 'Tennessee', 'Baylor', 'Alabama', 'Auburn', 'Purdue', 'UCLA', 'Texas', 'Illinois', 'Arkansas', 'Villanova', 'Creighton', 'Florida', 'Oregon', 'Memphis', 'Iowa State', 'Marquette', 'Syracuse', 'USC', 'Ohio State', 'Louisville', 'Wake Forest', 'San Diego State', 'Saint Mary’s'];
// Clubes e universidades são instituições reais; os atletas aqui NÃO são.

// ------------------------------------------------------------------ estilos de jogo
const STYLES = {
  PG: [
    { id: 'floor-general', label: 'Armador clássico', boost: ['passing', 'passingVision', 'decisionMaking', 'pickAndRoll', 'ballHandling'], drop: ['threePoint', 'strength'], tip: 'Dita o ritmo e cria para os companheiros.' },
    { id: 'scoring-guard', label: 'Armador pontuador', boost: ['shotCreation', 'pullUp', 'threePoint', 'ballHandling', 'acceleration'], drop: ['defensiveIQ', 'turnoverAvoidance'], tip: 'Gera o próprio arremesso em qualquer parte da quadra.' },
    { id: 'two-way-guard', label: 'Armador dois sentidos', boost: ['perimeterDefense', 'steals', 'closeout', 'agility', 'catchAndShoot'], drop: ['shotCreation', 'postScoring'], tip: 'Defensor de perímetro com arremesso confiável.' },
  ],
  SG: [
    { id: 'shooter', label: 'Arremessador', boost: ['threePoint', 'catchAndShoot', 'freeThrow', 'offBallMovement', 'screenUsage'], drop: ['rimFinishing', 'defensiveRebounding'], tip: 'Alonga a defesa e pune closeouts.' },
    { id: 'slasher', label: 'Infiltrador', boost: ['rimFinishing', 'layup', 'dunk', 'acceleration', 'vertical'], drop: ['threePoint', 'midRange'], tip: 'Ataca o aro com explosão.' },
    { id: '3d-wing', label: 'Ala-armador 3&D', boost: ['perimeterDefense', 'threePoint', 'catchAndShoot', 'closeout', 'helpDefense'], drop: ['ballHandling', 'shotCreation'], tip: 'Encaixe imediato em qualquer elenco.' },
  ],
  SF: [
    { id: 'wing-scorer', label: 'Ala pontuador', boost: ['shotCreation', 'midRange', 'pullUp', 'rimFinishing', 'threePoint'], drop: ['defensiveIQ', 'passing'], tip: 'Terceiro nível de pontuação com versatilidade.' },
    { id: 'point-forward', label: 'Ala armador', boost: ['passing', 'passingVision', 'ballHandling', 'decisionMaking', 'transitionPlay'], drop: ['threePoint', 'blocks'], tip: 'Cria jogadas partindo do perímetro.' },
    { id: 'defensive-wing', label: 'Ala defensor', boost: ['perimeterDefense', 'interiorDefense', 'steals', 'blocks', 'helpDefense'], drop: ['shotCreation', 'pullUp'], tip: 'Marca de uma a quatro posições.' },
  ],
  PF: [
    { id: 'stretch-four', label: 'Ala-pivô espaçador', boost: ['threePoint', 'catchAndShoot', 'screenUsage', 'offensiveIQ', 'freeThrow'], drop: ['interiorDefense', 'blocks'], tip: 'Abre a quadra para o jogo interno.' },
    { id: 'power-forward', label: 'Ala-pivô físico', boost: ['strength', 'rimFinishing', 'offensiveRebounding', 'defensiveRebounding', 'interiorDefense'], drop: ['threePoint', 'ballHandling'], tip: 'Impõe o físico no garrafão.' },
    { id: 'switch-big', label: 'Ala-pivô versátil', boost: ['perimeterDefense', 'helpDefense', 'passing', 'agility', 'defensiveIQ'], drop: ['postScoring', 'strength'], tip: 'Troca de marcação e conecta o ataque.' },
  ],
  C: [
    { id: 'rim-protector', label: 'Pivô protetor de aro', boost: ['blocks', 'interiorDefense', 'defensiveRebounding', 'helpDefense', 'vertical'], drop: ['threePoint', 'ballHandling', 'freeThrow'], tip: 'Âncora da defesa.' },
    { id: 'roll-man', label: 'Pivô finalizador', boost: ['rimFinishing', 'dunk', 'pickAndRoll', 'screenUsage', 'offensiveRebounding'], drop: ['perimeterDefense', 'midRange'], tip: 'Vertical roller com ótimas mãos.' },
    { id: 'skilled-big', label: 'Pivô habilidoso', boost: ['postScoring', 'passing', 'passingVision', 'midRange', 'offensiveIQ'], drop: ['speed', 'vertical'], tip: 'Hub ofensivo no alto do garrafão.' },
  ],
};
const POSITION_HEIGHT = { PG: [72, 77], SG: [74, 79], SF: [77, 81], PF: [79, 83], C: [81, 87] };
const SECONDARY = { PG: ['SG', null, null], SG: ['PG', 'SF', null], SF: ['SG', 'PF', null], PF: ['SF', 'C', null], C: ['PF', null, null] };

function pickOrigin(rng) {
  return rng.weighted(ORIGINS.map((o) => [o, o.weight]));
}

function makeName(rng, origin, used) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const first = rng.pick(FIRST[origin.name]);
    const last = rng.pick(LAST[origin.name]);
    const full = `${first} ${last}`;
    if (!used.has(full.toLowerCase())) { used.add(full.toLowerCase()); return { firstName: first, lastName: last, name: full }; }
  }
  const suffix = `${rng.int(2, 9)}`;
  const first = rng.pick(FIRST[origin.name]);
  const last = `${rng.pick(LAST[origin.name])} ${'Jr.'}`;
  used.add(`${first} ${last}${suffix}`.toLowerCase());
  return { firstName: first, lastName: last, name: `${first} ${last}` };
}

/** Atributos com a "cara" da posição e do estilo, ajustados até atingir o Overall alvo. */
export function buildAttributes(rng, position, style, targetOvr) {
  const weights = POSITION_WEIGHTS[position];
  const mean = ATTRIBUTE_KEYS.reduce((a, k) => a + weights[k], 0) / ATTRIBUTE_KEYS.length;
  const shape = {};
  for (const key of ATTRIBUTE_KEYS) {
    const importance = weights[key] ? weights[key] / mean : 0.3; // atributos fora do Overall (ética, liderança...) ficam neutros
    shape[key] = clamp((importance - 1) * 9, -13, 15) + rng.normal() * 4.5;
  }
  for (const key of style.boost) shape[key] += rng.float(5, 11);
  for (const key of style.drop) shape[key] -= rng.float(6, 13);
  shape.workEthic = rng.normal() * 9;
  shape.durability = rng.normal() * 8;
  const make = (base) => Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, clampRating(base + shape[k])]));
  let lo = 20;
  let hi = 95;
  let best = make(55);
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    best = make(mid);
    const ovr = positionOverall(best, position);
    if (ovr === targetOvr) break;
    if (ovr < targetOvr) lo = mid; else hi = mid;
  }
  return best;
}

/** Tendências a partir dos atributos (0-100); o motor 2D só precisa de valores plausíveis e estáveis. */
export function buildTendencies(rng, a, position) {
  const mix = (...ks) => ks.reduce((s, k) => s + (a[k] ?? 50), 0) / ks.length;
  const n = () => rng.normal() * 6;
  const guard = position === 'PG' || position === 'SG';
  const big = position === 'C' || position === 'PF';
  const t = {
    threePointFreq: mix('threePoint', 'catchAndShoot') + n() - (big ? 12 : 0),
    rimAttackFreq: mix('rimFinishing', 'layup', 'dunk') + n(),
    midRangeFreq: mix('midRange', 'pullUp') - 8 + n(),
    pullUpFreq: mix('pullUp', 'shotCreation') + n() - (big ? 15 : 0),
    catchShootFreq: mix('catchAndShoot', 'offBallMovement') + n(),
    stepbackFreq: mix('pullUp', 'threePoint') - 12 + n(),
    drawFoul: mix('rimFinishing', 'strength', 'freeThrow') - 5 + n(),
    isoFreq: mix('shotCreation', 'ballHandling') - 10 + n(),
    postUpFreq: mix('postScoring', 'strength') - (guard ? 25 : 5) + n(),
    pnrHandlerFreq: mix('pickAndRoll', 'ballHandling', 'passing') - (big ? 30 : 0) + n(),
    pnrRollFreq: mix('pickAndRoll', 'screenUsage', 'rimFinishing') - (guard ? 30 : 0) + n(),
    transitionFreq: mix('speed', 'transitionPlay') + n(),
    cutFreq: mix('offBallMovement', 'rimFinishing') + n(),
    offScreenFreq: mix('screenUsage', 'catchAndShoot') - 15 + n(),
    handoffFreq: mix('passing', 'offBallMovement') - 15 + n(),
    spotUpFreq: mix('catchAndShoot', 'threePoint') + n(),
    putbackFreq: mix('offensiveRebounding', 'strength') + n(),
    driveFreq: mix('speed', 'layup', 'ballHandling') - (big ? 20 : 0) + n(),
    passFirst: mix('passing', 'passingVision') + n(),
    extraPass: mix('passingVision', 'decisionMaking') - 5 + n(),
    driveAndKick: mix('passing', 'passingVision') - 5 + n(),
    holdBall: 100 - mix('passing', 'decisionMaking') + n(),
    dribbleHeavy: mix('ballHandling', 'shotCreation') + n(),
    pushPace: mix('transitionPlay', 'speed') - 5 + n(),
    crashOffensiveGlass: mix('offensiveRebounding') + n(),
    lookForStar: 100 - mix('shotCreation', 'offensiveIQ') + n(),
    contestShots: mix('perimeterDefense', 'closeout', 'defensiveIQ') + n(),
    gambleForSteals: mix('steals') + n(),
    blockAttempts: mix('blocks', 'vertical') + n(),
    takeCharges: mix('helpDefense', 'defensiveIQ') - 10 + n(),
    foulProne: 100 - mix('discipline', 'defensiveIQ') + n(),
    clutchShotTaking: mix('clutch', 'shotCreation') - 10 + n(),
    clutchPassing: mix('clutch', 'passingVision') - 10 + n(),
  };
  return Object.fromEntries(TENDENCY_KEYS.map((k) => [k, clampRating(t[k] ?? 50)]));
}

function strengthsAndWeaknesses(attributes, style) {
  const skip = new Set(['workEthic', 'durability', 'leadership', 'competitiveness']);
  const keys = ATTRIBUTE_KEYS.filter((k) => !skip.has(k));
  const avg = keys.reduce((a, k) => a + attributes[k], 0) / keys.length;
  // O estilo de jogo é a "marca" do prospecto: seus atributos-assinatura entram primeiro nos pontos fortes.
  const score = (k) => attributes[k] - avg + (style.boost.includes(k) ? 6 : 0) - (style.drop.includes(k) ? 6 : 0);
  const ranked = [...keys].sort((a, b) => score(b) - score(a));
  const label = (k) => ATTRIBUTE_BY_KEY[k].label;
  const best = ranked.slice(0, 3);
  const worst = ranked.slice(-3).reverse();
  return { strengths: best.map(label), weaknesses: worst.map(label), best, worst };
}

/**
 * Gera a classe de um Draft. Determinística: mesma semente e ano produzem a mesma turma.
 * @param usedNames nomes (minúsculos) que não podem se repetir (elencos atuais e outras classes)
 */
export function generateProspectClass({ draftYear, seed, size = 98, usedNames = new Set() }) {
  const used = new Set(usedNames);
  const out = [];
  const talentRng = createRng(`${seed}:class:${draftYear}`);
  // Ordem de "talento" da turma: sorteada uma vez para garantir curva monotônica entre projeção e posição.
  const raw = Array.from({ length: size }, (_, i) => ({ i, score: talentRng.normal() + talentRng.next() * 0.6 })).sort((a, b) => b.score - a.score);
  raw.forEach(({ i }, rank) => {
    const rng = createRng(`${seed}:prospect:${draftYear}:${i}`);
    const q = rank / (size - 1);
    const origin = pickOrigin(rng);
    const youngBias = q < 0.25 ? 0.62 : 0.34;
    const age = rng.chance(youngBias) ? 19 : rng.weighted([[20, 40], [21, 28], [22, 16], [23, 6]]);
    const agePenalty = Math.max(0, age - 20);
    let targetOvr = Math.round(79 - 20 * Math.pow(q, 0.75) + rng.normal() * 1.8 + agePenalty * 1.2);
    let targetPot = Math.round(94 - 28 * Math.pow(q, 0.7) + rng.normal() * 2.4 - agePenalty * 2.6);
    targetOvr = clamp(targetOvr, 54, 80);
    targetPot = clamp(Math.max(targetPot, targetOvr + 2), 58, 96);
    const position = rng.weighted(POSITIONS.map((p) => [p, p === 'C' ? 17 : p === 'PF' ? 20 : 21]));
    const second = SECONDARY[position][rng.int(0, 2)];
    const style = rng.pick(STYLES[position]);
    const attributes = buildAttributes(rng, position, style, targetOvr);
    const ovr = positionOverall(attributes, position);
    const tendencies = buildTendencies(rng, attributes, position);
    const [hLo, hHi] = POSITION_HEIGHT[position];
    const heightIn = clamp(Math.round(rng.float(hLo, hHi) + (attributes.vertical > 80 ? 0 : 0)), 70, 90);
    const weight = Math.round(165 + (heightIn - 70) * 6.2 + rng.float(-8, 16));
    const traits = strengthsAndWeaknesses(attributes, style);
    const gap = targetPot - ovr;
    const consistencyRisk = (100 - attributes.consistency) / 100;
    const riskScore = clamp(gap / 28 + (age <= 19 ? 0.25 : 0) + consistencyRisk * 0.6 + (attributes.durability < 55 ? 0.25 : 0) - 0.15, 0, 1.6);
    const risk = riskScore > 0.95 ? 'alto' : riskScore > 0.55 ? 'médio' : 'baixo';
    const names = makeName(rng, origin, used);
    const club = origin.school === 'college' ? rng.pick(COLLEGES) : rng.pick(origin.clubs);
    // idade na noite do Draft (fim de junho do ano do Draft): nascidos até junho já fizeram aniversário
    const birthMonth = rng.int(1, 12);
    const birthYear = birthMonth <= 6 ? draftYear - age : draftYear - age - 1;
    const birthDate = `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(rng.int(1, 28)).padStart(2, '0')}`;
    out.push({
      id: `P${draftYear}-${String(rank + 1).padStart(3, '0')}`,
      draftYear,
      ...names,
      fictional: true,
      source: 'gerado',
      photoSource: 'none',
      age,
      birthDate,
      country: origin.country,
      school: club,
      schoolKind: origin.school,
      heightIn,
      weight,
      positions: second ? [position, second] : [position],
      attributes,
      tendencies,
      ovr,
      potential: Math.max(ovr, targetPot),
      style: { id: style.id, label: style.label, tip: style.tip },
      strengths: traits.strengths,
      weaknesses: traits.weaknesses,
      risk,
      riskScore: Math.round(riskScore * 100) / 100,
      baseRank: rank + 1, // posição "verdadeira" na turma (só o God Mode enxerga)
      status: 'available', // available | drafted | undrafted | signed | withdrew
      draft: null,
      scouting: { notes: '', favorite: false, scoutGrade: null },
    });
  });
  return out;
}

/** Nomes já ocupados no universo (jogadores atuais e prospectos). */
export function usedNamesOf(world) {
  const used = new Set();
  for (const p of world.players.values()) used.add(p.name.toLowerCase());
  for (const p of world.prospects.values()) used.add(p.name.toLowerCase());
  return used;
}

export const prospectsOfYear = (world, year) => [...world.prospects.values()].filter((p) => p.draftYear === year);

/** Garante a classe do `draftYear` e das duas seguintes. Idempotente. */
export function ensureProspectClasses(world, firstYear, { markDirty, count = 3 } = {}) {
  let created = 0;
  for (let year = firstYear; year < firstYear + count; year++) {
    if (prospectsOfYear(world, year).length) continue;
    const list = generateProspectClass({ draftYear: year, seed: world.saveId, usedNames: usedNamesOf(world) });
    for (const p of list) {
      world.prospects.set(p.id, p);
      markDirty?.('prospects', p.id);
      created++;
    }
  }
  return created;
}
