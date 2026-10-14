// Análise do Draft: nota da escolha ao vivo (com a informação PÚBLICA do consenso dos scouts — nunca o baseRank
// verdadeiro) e avaliação retrospectiva por turma (com o desenvolvimento real dos jogadores).
import { createRng } from '../core/rng.js';
import { godModeAllowed } from '../core/godmode-permissions.js';
import { rosterOf, teamNeeds } from '../gm/team-context.js';
import { ARCHETYPES } from '../gm/personality.js';
import { bigBoard, SIGNAL_LABEL } from './scouting.js';
import { firstRoundSlotValue, ovrValue, playerValue } from '../contracts/valuation.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const GRADE_STEPS = [[92, 'A+'], [86, 'A'], [81, 'A-'], [76, 'B+'], [71, 'B'], [66, 'B-'], [61, 'C+'], [56, 'C'], [50, 'C-'], [0, 'D']];
export const gradeOf = (score) => GRADE_STEPS.find(([min]) => score >= min)[1];
export const ANALYSTS = ['Rafa Duarte', 'Priya Nair', 'Colton Reed'];

/**
 * @param ctx { number, round, teamId, prospect, available: prospectos disponíveis ANTES da escolha (inclui o escolhido) }
 */
export function analyzePick(world, { number, round, teamId, prospect, available, all = null }) {
  const team = world.teams.get(teamId);
  const board = bigBoard(world, available);
  const row = board.find((r) => r.prospect.id === prospect.id);
  const best = board[0];
  // O mock draft público é medido sobre a turma inteira (posição absoluta), não sobre quem sobrou.
  const full = all ? bigBoard(world, all) : board;
  const absolute = full.find((r) => r.prospect.id === prospect.id);
  row.mockRank = absolute.mockRank;
  const rankPenalty = clamp((row.rank - 1) * 1.7, 0, 18);
  const slotEdge = clamp(number - row.mockRank, -14, 14); // positivo: caiu além do esperado pelo mock (barganha)
  const needs = teamNeeds(world, teamId);
  const need = needs.byPosition[prospect.positions[0]] ?? 0;
  const needBonus = clamp(need * 7, 0, 7);
  const riskPenalty = prospect.risk === 'alto' && number > 14 ? 0 : prospect.risk === 'alto' ? 3 : 0;
  const score = clamp(75 - rankPenalty + slotEdge * 1.1 + needBonus - riskPenalty, 30, 99);
  const grade = gradeOf(round === 2 ? score + 3 : score);

  const rng = createRng(`${world.draft?.seed ?? world.saveId}:analysis:${number}`);
  const pos = prospect.positions[0];
  const reach = row.rank >= 6 && number < row.mockRank - 4;
  const steal = number - row.mockRank >= 6 || (row.rank <= 2 && number >= 8);
  const fits = (ARCHETYPES[team.gm?.archetype]?.label ?? 'a diretoria');
  const needMet = need >= 0.45;
  const lines = [];
  const pick = (list) => list[rng.int(0, list.length - 1)];
  const [a1, a2, a3] = ANALYSTS;
  lines.push({ analyst: a1, text: steal ? pick([`${prospect.name} aparecia mais cedo nos mocks: ${team.name} leva uma barganha na #${number}.`, `Valor claro na #${number}: o consenso colocava ${prospect.name} perto da ${row.mockRank}ª escolha.`]) : reach ? pick([`${team.name} surpreende na #${number}: ${prospect.name} era visto mais perto da ${row.mockRank}ª escolha.`, `Aposta alta: ${team.name} sobe na lista por ${prospect.name} (${prospect.school}).`]) : pick([`Escolha dentro do esperado para a #${number}: ${prospect.name} é um ${pos} de ${prospect.age} anos com perfil ${prospect.style.label.toLowerCase()}.`, `${team.name} faz a escolha lógica: ${prospect.name}, ${prospect.style.label.toLowerCase()} vindo de ${prospect.school}.`]) });
  lines.push({ analyst: a2, text: needMet ? `Cobre uma carência real: ${team.name} precisava de ${pos}.` : prospect.risk === 'alto' ? `Teto alto (${prospect.potential - prospect.ovr >= 14 ? 'muita margem de evolução' : 'perfil promissor'}), mas risco alto: ${prospect.weaknesses.slice(0, 2).join(' e ').toLowerCase()} preocupam.` : `Sem necessidade imediata em ${pos}, ${team.name} escolheu o melhor talento (${fits.toLowerCase()}).` });
  lines.push({ analyst: a3, text: best.prospect.id === prospect.id ? 'Era o melhor nome disponível pelo consenso dos scouts.' : `O melhor disponível pelo consenso era ${best.prospect.name} (${best.prospect.positions[0]}, ${best.prospect.school}).` });

  const fan = clamp(Math.round(50 + (score - 70) * 1.15 + (team.fans.passion - 50) * 0.12 + (needMet ? 5 : 0)), 5, 98);
  const fanLabel = fan >= 85 ? 'Euforia' : fan >= 68 ? 'Aprovação' : fan >= 50 ? 'Cautela' : fan >= 35 ? 'Dúvida' : 'Vaias';

  // impacto competitivo: efeito do novato no 8º/9º jogador em 3 anos
  const roster = rosterOf(world, teamId);
  const eighth = roster[7]?.ovr ?? 62;
  const projected = prospect.ovr + Math.min(prospect.potential - prospect.ovr, 2.2 * 3 * (prospect.age <= 20 ? 1 : 0.7));
  const winsDelta = clamp(Math.round((projected - eighth) * 0.18 * 10) / 10, -0.3, 6);

  // impacto nas escolhas seguintes: quem tinha este prospecto no topo do seu quadro
  const next = (world.draft?.order ?? []).slice((world.draft?.cursor ?? 0) + 1, (world.draft?.cursor ?? 0) + 6);
  const remaining = board.filter((r) => r.prospect.id !== prospect.id);
  const lost = [];
  for (const entry of next) {
    const owner = world.draftPicks.get(entry.pickId)?.ownerTeamId;
    if (owner && row.rank <= 3 && row.prospect.positions[0] && (teamNeeds(world, owner).byPosition[pos] ?? 0) >= 0.45) lost.push({ teamId: owner, number: entry.number, text: `${world.teams.get(owner).name} (#${entry.number}) perde um alvo no ${pos}; o próximo da lista é ${remaining[0]?.prospect.name ?? '—'}.` });
  }
  return {
    score: Math.round(score), grade, needMet, need: Math.round(need * 100) / 100, steal, reach,
    bestAvailable: { prospectId: best.prospect.id, name: best.prospect.name, rank: 1 },
    consensusRank: row.rank, mockRank: row.mockRank, signal: row.signal ? SIGNAL_LABEL[row.signal] : null,
    fit: `${fits} · ${pos} de ${prospect.age} anos${prospect.age <= 20 ? ' (jovem: investimento de longo prazo)' : ''}`,
    analysts: lines, fan: { approval: fan, label: fanLabel },
    projection: { winsDelta, text: `${winsDelta >= 0 ? '+' : ''}${winsDelta.toFixed(1).replace('.', ',')} vitórias projetadas em 3 anos` },
    nextPicks: lost,
  };
}

// ------------------------------------------------------------------ retrospectiva
/** Avalia uma turma já selecionada: compara a produção atual de cada jogador com o esperado pela posição. */
export function classRetrospective(world, season) {
  const picks = [...world.draftPicks.values()].filter((p) => p.season === season && p.status === 'exercised');
  const rows = [];
  if (picks.length) {
    for (const pick of picks.sort((a, b) => a.number - b.number)) {
      const prospect = world.prospects.get(pick.prospectId);
      const player = prospect?.playerId ? world.players.get(prospect.playerId) : null;
      const row = rowFor(world, { number: pick.number, round: pick.round, teamId: pick.exercisedBy ?? pick.ownerTeamId, name: prospect?.name, player, prospect, college: prospect?.school });
      row.gradeAtDraft = world.career.draftLog?.[season]?.find((x) => x.number === pick.number)?.grade ?? null;
      rows.push(row);
    }
  } else {
    // turmas anteriores ao início do universo: dados reais do seed (player.draft)
    for (const p of world.players.values()) {
      if (p.draft?.year !== season || !p.draft.pick) continue;
      rows.push(rowFor(world, { number: p.draft.round === 1 ? p.draft.pick : 30 + p.draft.pick, round: p.draft.round, teamId: p.draft.team, name: p.name, player: p, college: p.college }));
    }
    rows.sort((a, b) => a.number - b.number);
  }
  const hits = rows.filter((r) => r.verdict === 'steal').length;
  const busts = rows.filter((r) => r.verdict === 'bust').length;
  const avg = rows.length ? rows.reduce((a, r) => a + (r.value ?? 0), 0) / rows.length : 0;
  return { season, rows, hits, busts, averageValue: avg, strength: avg > 14 ? 'Turma forte' : avg > 8 ? 'Turma sólida' : 'Turma fraca', complete: rows.length > 0 };
}

function rowFor(world, { number, round, teamId, name, player, prospect, college }) {
  const value = player ? playerValue(world, player, { view: godModeAllowed(world.career) ? 'god' : 'public' }).value : null;
  const expected = round === 1 ? firstRoundSlotValue(Math.min(number, 30)) * 0.62 : 3;
  const delta = value == null ? null : value - expected;
  const verdict = value == null ? null : delta >= 14 ? 'steal' : delta <= -14 && round === 1 && number <= 20 ? 'bust' : delta >= 4 ? 'acerto' : delta <= -6 ? 'abaixo' : 'esperado';
  return { number, round, teamId, name: name ?? player?.name, playerId: player?.id ?? null, position: player?.positions?.[0] ?? prospect?.positions?.[0], college, ovr: player?.ovr ?? null, potential: world.career.godMode ? player?.potential ?? null : null, currentTeamId: player?.teamId ?? null, retired: Boolean(player?.retired), value, expected, delta, verdict };
}

/** Todas as turmas conhecidas, da mais recente para a mais antiga. */
export function draftYears(world) {
  const years = new Set();
  for (const p of world.draftPicks.values()) if (p.status === 'exercised') years.add(p.season);
  for (const p of world.players.values()) if (p.draft?.year && p.draft.pick) years.add(p.draft.year);
  return [...years].sort((a, b) => b - a);
}
export { ovrValue };
