// Potencial dinâmico. O valor guardado no jogador é a projeção atual do universo;
// o que o usuário enxerga é uma FAIXA, tão larga quanto a incerteza sobre o jogador.
// (A revisão anual do potencial — treino, minutos, lesões, ambiente — entra na Fase 6.)

/** Meia-largura da faixa exibida: jovens e amostras pequenas são mais incertos. */
export function potentialUncertainty(player, age) {
  const youth = Math.max(0, 25 - (age ?? 26)) * 0.6;
  const sample = { high: 0, medium: 1, low: 2, none: 3 }[player.ratingConfidence] ?? 1;
  return Math.round(1 + youth + sample);
}

/**
 * @returns { low, high, exact } — `exact` só deve ser mostrado em God Mode.
 */
export function potentialEstimate(player, age) {
  const spread = potentialUncertainty(player, age);
  const settled = (age ?? 26) >= 29 && player.ratingConfidence === 'high';
  if (settled) return { low: player.potential, high: player.potential, exact: player.potential };
  // deslocamento estável por jogador, para a faixa não ficar centrada no valor verdadeiro
  const offset = Math.round((((player.id * 2654435761) >>> 0) / 4294967295 - 0.5) * spread);
  const low = Math.max(player.ovr, player.potential - spread + offset);
  const high = Math.min(99, Math.max(low, player.potential + spread + offset));
  return { low, high, exact: player.potential };
}

export function careerStage(age) {
  if (age == null) return { id: 'unknown', label: 'Idade desconhecida' };
  if (age <= 22) return { id: 'prospect', label: 'Em formação' };
  if (age <= 25) return { id: 'rising', label: 'Em ascensão' };
  if (age <= 30) return { id: 'prime', label: 'Auge' };
  if (age <= 33) return { id: 'veteran', label: 'Veterano' };
  return { id: 'decline', label: 'Fim de carreira' };
}
