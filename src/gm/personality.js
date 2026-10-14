// Personalidade administrativa das 32 franquias. Cada arquétipo é um conjunto de pesos que a valuation,
// a IA de trades, o Draft e a free agency leem. A atribuição é determinística (semente = id do save),
// persistida em `team.gm` e reavaliada a cada offseason a partir dos resultados.
import { createRng } from '../core/rng.js';
import { ageOf, leagueTable, rosterOf } from './team-context.js';

/**
 * now/future: peso de produção imediata e de longo prazo · youth: bônus a jovens de alto potencial ·
 * picks: valor das escolhas · stars: expoente de consolidação (maior = paga mais por estrelas) ·
 * salary: sensibilidade a salário/imposto · vets: bônus a veteranos de alto nível · depth: valor da profundidade.
 */
export const ARCHETYPES = {
  contender: { id: 'contender', label: 'Contender', icon: 'trophy', now: 1.3, future: 0.65, youth: 0.85, picks: 0.7, stars: 1.05, salary: 0.8, vets: 1.12, depth: 1.1, summary: 'Quer vencer agora: troca juventude e picks por produção imediata.' },
  rebuild: { id: 'rebuild', label: 'Reconstrução', icon: 'hammer', now: 0.6, future: 1.35, youth: 1.35, picks: 1.4, stars: 0.85, salary: 1.15, vets: 0.7, depth: 0.8, summary: 'Acumula picks e jovens; vende veteranos caros.' },
  development: { id: 'development', label: 'Desenvolvimento de jovens', icon: 'sprout', now: 0.85, future: 1.2, youth: 1.55, picks: 1.1, stars: 0.95, salary: 1, vets: 0.8, depth: 0.9, summary: 'Prioriza minutos e evolução de talentos de até 23 anos.' },
  starChase: { id: 'starChase', label: 'Busca agressiva por estrelas', icon: 'star', now: 1.1, future: 1.0, youth: 1, picks: 0.85, stars: 1.5, salary: 0.75, vets: 1, depth: 0.7, summary: 'Paga caro por um craque e aceita perder profundidade para tê-lo.' },
  costCut: { id: 'costCut', label: 'Redução da folha', icon: 'scissors', now: 0.95, future: 0.9, youth: 1, picks: 1.1, stars: 0.9, salary: 1.9, vets: 0.9, depth: 1, summary: 'Quer sair da luxury tax e aceita perder talento para economizar.' },
  pickKeeper: { id: 'pickKeeper', label: 'Preservação de picks', icon: 'shield', now: 0.95, future: 1.15, youth: 1.05, picks: 1.75, stars: 0.95, salary: 1, vets: 0.9, depth: 1, summary: 'Raramente cede escolhas de primeira rodada.' },
  veteranLastRun: { id: 'veteranLastRun', label: 'Última chance dos veteranos', icon: 'clock', now: 1.45, future: 0.5, youth: 0.6, picks: 0.5, stars: 1.2, salary: 0.65, vets: 1.45, depth: 1.1, summary: 'Elenco veterano em janela de título: vale tudo pelo agora.' },
};
export const ARCHETYPE_IDS = Object.keys(ARCHETYPES);
export const NEUTRAL_PROFILE = { id: 'neutral', label: 'Neutro', now: 1, future: 1, youth: 1, picks: 1, stars: 1.2, salary: 1, vets: 1, depth: 1 };

/** Pesos efetivos de uma franquia (arquétipo × intensidade pessoal do GM). */
export function profileOf(team) {
  const base = ARCHETYPES[team?.gm?.archetype];
  if (!base) return NEUTRAL_PROFILE;
  const k = team.gm.intensity ?? 1;
  const mix = (v) => 1 + (v - 1) * k;
  return { ...base, now: mix(base.now), future: mix(base.future), youth: mix(base.youth), picks: mix(base.picks), stars: base.stars, salary: mix(base.salary), vets: mix(base.vets), depth: mix(base.depth), patience: team.gm.patience ?? 1, risk: team.gm.risk ?? 1 };
}

/** Pesos por ano (0 = esta temporada) para somar a produção futura de um jogador. */
export function horizonWeights(profile) {
  const now = profile.now ?? 1;
  const future = profile.future ?? 1;
  return [1 * now, 0.78 * (0.5 + 0.5 * now) * (0.6 + 0.4 * future), 0.6 * future, 0.46 * future, 0.35 * future];
}

/** Sugere o arquétipo pelo que se vê no elenco e na campanha; `rng` quebra empates e dá variação entre carreiras. */
export function archetypeScores(world, team) {
  const table = leagueTable(world);
  const row = table.rows.get(team.id);
  const roster = rosterOf(world, team.id).filter((p) => p.rosterStatus === 'standard');
  const avgAge = roster.length ? roster.reduce((a, p) => a + ageOf(world, p), 0) / roster.length : 26;
  const payrollRatio = payrollRatioOf(world, team, roster);
  const rank = row?.rank ?? 16;
  const scores = Object.fromEntries(ARCHETYPE_IDS.map((id) => [id, 1]));
  if (rank <= 5) { scores.contender += 5; scores.veteranLastRun += avgAge >= 28 ? 4 : 0.5; scores.starChase += 1; }
  else if (rank <= 12) { scores.contender += 3; scores.starChase += 1.5; scores.pickKeeper += 1; scores.veteranLastRun += avgAge >= 28.5 ? 2.5 : 0; }
  else if (rank <= 20) { scores.starChase += 1.5; scores.development += 1.5; scores.pickKeeper += 1.5; scores.costCut += 1; scores.contender += 1; }
  else { scores.rebuild += 4; scores.development += avgAge <= 25.5 ? 3 : 1; scores.pickKeeper += 1; }
  if (payrollRatio > 1.08) scores.costCut += 3.5;
  if (payrollRatio > 1.0 && rank > 14) scores.costCut += 2;
  if (avgAge <= 24.8) scores.development += 2.5;
  if (avgAge >= 28.5 && rank > 12) scores.rebuild += 2;
  if (team.expansion) { scores.development += 3; scores.rebuild += 2; scores.contender = 0.2; scores.veteranLastRun = 0.1; }
  return scores;
}

export function suggestArchetype(world, team, rng) {
  const scores = archetypeScores(world, team);
  return rng.weighted(Object.entries(scores).map(([id, weight]) => [id, Math.max(0.05, weight)]));
}

function payrollRatioOf(world, team, roster) {
  const season = world.calendar.season;
  const total = roster.reduce((a, p) => a + (world.contracts.get(p.id)?.years.find((y) => y.season === season)?.salary ?? 0), 0);
  return total / world.league.cap.luxuryTax;
}

/**
 * Atribui (ou reavalia) o perfil de cada franquia. Sem `force`, só preenche quem ainda não tem.
 * Reavaliação mantém a intensidade do GM e guarda o histórico de mudanças de estratégia.
 */
export function assignGmProfiles(world, { markDirty, force = false } = {}) {
  const changes = [];
  const season = world.calendar.season;
  for (const team of world.teams.values()) {
    if (team.gm && !force) continue;
    const rng = createRng(`${world.saveId}:gm:${team.id}:${force ? season : 'init'}`);
    let archetype = suggestArchetype(world, team, rng);
    if (team.gm && force) {
      // Estabilidade: a diretoria só muda de rumo quando o cenário realmente deixou de combinar com a estratégia atual.
      const scores = archetypeScores(world, team);
      const best = Math.max(...Object.values(scores));
      if (scores[team.gm.archetype] >= best * 0.55 || rng.chance(0.4)) archetype = team.gm.archetype;
    }
    if (!team.gm) {
      team.gm = { archetype, intensity: Math.round((0.85 + rng.next() * 0.35) * 100) / 100, patience: Math.round((0.8 + rng.next() * 0.5) * 100) / 100, risk: Math.round((0.8 + rng.next() * 0.5) * 100) / 100, since: season, history: [] };
      markDirty?.('teams', team.id);
      changes.push({ teamId: team.id, from: null, to: archetype });
    } else if (team.gm.archetype !== archetype) {
      team.gm.history = [...(team.gm.history ?? []), { season: team.gm.since, archetype: team.gm.archetype }].slice(-8);
      changes.push({ teamId: team.id, from: team.gm.archetype, to: archetype });
      team.gm.archetype = archetype;
      team.gm.since = season;
      markDirty?.('teams', team.id);
    }
  }
  return changes;
}
