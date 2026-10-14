// Destaques discretos da partida ("12-2 run", "8 pontos seguidos", "3 faltas", "double-double").
// Funções puras sobre o estado da simulação: a interface decide quando e como mostrar.

/**
 * Sequência de pontos em andamento: o maior trecho final do jogo em que um time
 * abriu vantagem clara. Ex.: { team: 0, a: 12, b: 2 } → "12-2".
 */
export function scoringRun(sim, { minPoints = 8, maxSeconds = 420 } = {}) {
  const log = sim.scoreLog;
  if (!log.length) return null;
  const pts = [0, 0];
  let best = null;
  for (let i = log.length - 1; i >= 0 && sim.t - log[i].t <= maxSeconds; i--) {
    pts[log[i].team] += log[i].pts;
    for (const team of [0, 1]) {
      const a = pts[team];
      const b = pts[1 - team];
      // precisa ser dominante (4x ou mais) e a última cesta tem de ser do time em sequência
      if (a >= minPoints && b * 4 <= a && log.at(-1).team === team && (!best || a - b > best.a - best.b)) best = { team, a, b, since: log[i].t };
    }
  }
  return best;
}

/** Pontos consecutivos do mesmo jogador dentro do próprio time (sem ninguém mais do time pontuar entre eles). */
export function playerStreak(sim, minPoints = 8) {
  const log = sim.scoreLog;
  const last = log.at(-1);
  if (!last) return null;
  let pts = 0;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].team !== last.team) continue;
    if (log[i].id !== last.id) break;
    pts += log[i].pts;
  }
  return pts >= minPoints ? { team: last.team, id: last.id, pts } : null;
}

/**
 * Lista de notas do momento. Cada nota tem uma `key` estável para a interface
 * mostrar uma única vez: [{ key, team, text, tone }]
 */
export function matchNotes(sim) {
  const notes = [];
  const run = scoringRun(sim);
  if (run) notes.push({ key: `run-${run.team}-${Math.round(run.since)}-${Math.floor(run.a / 4)}`, team: run.team, text: `Sequência de ${run.a}-${run.b} do ${sim.teams[run.team].name}`, tone: 'run' });
  const streak = playerStreak(sim);
  if (streak) {
    const p = sim.teams[streak.team].all.find((x) => x.id === streak.id);
    if (p) notes.push({ key: `streak-${p.id}-${Math.floor(streak.pts / 4)}`, team: streak.team, text: `${p.short}: ${streak.pts} pontos seguidos`, tone: 'hot' });
  }
  const firstHalf = sim.quarter <= 2;
  for (const t of sim.teams) {
    for (const p of t.all) {
      const s = p.stats;
      if (t.lineup.includes(p) && !p.fouledOut && ((firstHalf && s.pf === 3) || s.pf === 5)) notes.push({ key: `pf-${p.id}-${s.pf}`, team: t.index, text: `${p.short} com ${s.pf} faltas`, tone: 'warn' });
      const doubles = [s.pts, s.orb + s.drb, s.ast, s.stl, s.blk].filter((v) => v >= 10).length;
      if (doubles >= 3) notes.push({ key: `td-${p.id}`, team: t.index, text: `Triple-double de ${p.short}`, tone: 'hot' });
      else if (doubles === 2) notes.push({ key: `dd-${p.id}`, team: t.index, text: `Double-double de ${p.short}`, tone: 'info' });
      for (const mark of [30, 40, 50]) if (s.pts >= mark && s.pts < mark + 10) notes.push({ key: `pts-${p.id}-${mark}`, team: t.index, text: `${p.short} chega a ${mark} pontos`, tone: 'hot' });
    }
  }
  return notes;
}

/** Placar por período a partir do registro de cestas. */
export function periodScores(sim) {
  const periods = Math.max(4, sim.quarter);
  const out = [Array(periods).fill(0), Array(periods).fill(0)];
  for (const e of sim.scoreLog) out[e.team][e.q - 1] += e.pts;
  return out;
}

/** Estatísticas coletivas lado a lado (aba "Estatísticas" do painel da partida). */
export function teamComparison(sim) {
  const box = sim.boxScore();
  const pct = (m, a) => (a ? Math.round((m / a) * 1000) / 10 : 0);
  const row = (label, f, unit = '') => ({ label, values: box.map((b) => f(b.total)), unit });
  return [
    row('Arremessos', (t) => `${t.fgm}/${t.fga}`),
    row('FG%', (t) => pct(t.fgm, t.fga), '%'),
    row('Bolas de 3', (t) => `${t.tpm}/${t.tpa}`),
    row('3P%', (t) => pct(t.tpm, t.tpa), '%'),
    row('Lances livres', (t) => `${t.ftm}/${t.fta}`),
    row('Rebotes', (t) => t.reb),
    row('Rebotes ofensivos', (t) => t.orb),
    row('Assistências', (t) => t.ast),
    row('Roubos', (t) => t.stl),
    row('Tocos', (t) => t.blk),
    row('Erros', (t) => t.tov),
    row('Faltas', (t) => t.pf),
  ];
}
