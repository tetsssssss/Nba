// Vinhetas construídas APENAS com dados reais de MatchSim. Não modifica a partida.
import { broadcastSnapshot } from './broadcast-bridge.js';

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const score = (sim) => Array.isArray(sim?.score) ? sim.score.slice(0, 2).map(finite) : [0, 0];
const teams = (sim) => [0, 1].map(i => String(sim?.teams?.[i]?.name ?? (i ? 'Visitante' : 'Mandante')));

export function broadcastCompetitionName(context = {}) {
  const explicit = String(context.presentationTitle ?? '').trim();
  if (explicit) return explicit.slice(0, 90);
  const c = String(context.competition ?? '').toLowerCase();
  if (/final/.test(c)) return 'Finais · NBA Universe TV';
  if (/playoff|postseason/.test(c)) return 'Playoffs · NBA Universe TV';
  if (/wnba/.test(c)) return 'WNBA · NBA Universe TV';
  if (/all.?star/.test(c)) return 'All-Star · NBA Universe TV';
  if (context.mode === 'official') return 'Temporada · NBA Universe TV';
  return 'NBA Universe TV · Partida';
}

export function broadcastQuarterPoints(sim, quarter) {
  if (!Number.isInteger(quarter) || quarter < 1) return null;
  const rows = Array.isArray(sim?.scoreLog) ? sim.scoreLog : [];
  const period = [0, 0];
  for (const entry of rows) {
    if (entry?.q !== quarter) continue;
    if (entry.team !== 0 && entry.team !== 1) continue;
    const pts = Number(entry.pts);
    if (!Number.isInteger(pts) || pts < 1 || pts > 4) continue;
    period[entry.team] += pts;
  }
  return period;
}

export function broadcastScorers(sim, count = 2) {
  const results = [];
  for (const team of sim?.teams ?? []) {
    const roster = Array.isArray(team?.all) ? team.all : [];
    const scorers = roster.filter(p => Number.isFinite(Number(p?.stats?.pts)) && p.stats.pts > 0)
      .sort((a, b) => Number(b.stats.pts) - Number(a.stats.pts));
    for (const p of scorers.slice(0, count)) results.push({
      team: String(team.name ?? ''), player: String(p.name ?? p.short ?? 'Atleta'),
      pts: Number(p.stats.pts), reb: finite(p.stats.orb) + finite(p.stats.drb), ast: finite(p.stats.ast),
    });
  }
  return results;
}

function comparison(sim) {
  if (typeof sim?.boxScore !== 'function') return [];
  try {
    const box = sim.boxScore();
    if (!Array.isArray(box) || box.length !== 2) return [];
    const totals = box.map(team => team?.total ?? {});
    const pairs = [
      ['Rebotes', 'reb'], ['Assistências', 'ast'], ['Bolas de 3', 'tpm'], ['Erros', 'tov'],
    ];
    return pairs.map(([label, key]) => ({ label, values: totals.map(v => finite(v[key])) }));
  } catch { return []; }
}

export function broadcastShowCard(sim, kind, context = {}) {
  const names = teams(sim), points = score(sim), competition = broadcastCompetitionName(context);
  const leader = points[0] === points[1] ? null : points[0] > points[1] ? 0 : 1;
  const base = { kind, competition, names, score: points, description: '', heading: '', stats: [], players: [] };
  if (kind === 'pregame') {
    return { ...base, heading: 'NOITE DE JOGO', description: `${names[0]} × ${names[1]}`,
      players: (sim?.teams ?? []).flatMap(team => (Array.isArray(team?.lineup) ? team.lineup : [])
        .slice(0, 5).map(p => ({ team: String(team.name ?? ''), player: String(p.short ?? p.name ?? 'Atleta'), starter: true }))) };
  }
  if (kind === 'timeout') return { ...base, heading: 'TEMPO TÉCNICO', description: 'Panorama da partida', stats: comparison(sim), players: broadcastScorers(sim, 1) };
  if (kind === 'quarter') {
    const completed = Number(context.completedQuarter);
    const q = Number.isInteger(completed) && completed > 0 ? completed : Math.max(1, finite(sim?.quarter) - 1);
    const quarter = broadcastQuarterPoints(sim, q);
    return { ...base, heading: q > 4 ? `RESUMO · PRORROGAÇÃO ${q - 4}` : `FIM DO ${q}º QUARTO`,
      description: quarter ? `${names[0]} ${quarter[0]} × ${quarter[1]} ${names[1]} no período` : 'Resumo do período',
      stats: comparison(sim), players: broadcastScorers(sim, 1) };
  }
  if (kind === 'final') {
    const snap = broadcastSnapshot(sim, { eventLimit: 0 });
    return { ...base, heading: 'FIM DE JOGO',
      description: leader === null ? 'Placar empatado' : `Vitória de ${names[leader]} por ${Math.abs(points[0] - points[1])} ponto(s)`,
      stats: comparison(sim), players: broadcastScorers(sim, 1), summary: snap.headline };
  }
  return null;
}

// Sem timers globais e sem escrita: eventos observados por refresh().
export function createBroadcastShowTracker(sim, { now = () => 0, duration = 5600, context = {} } = {}) {
  let enabled = true;
  let lastQuarter = Number(sim?.quarter) || 1;
  let lastOver = Boolean(sim?.over);
  let lastTimeout = sim?.timeout ?? null;
  let current = null;
  let until = -Infinity;
  if (!lastOver && lastQuarter === 1 && finite(sim?.t) < 0.5) {
    current = broadcastShowCard(sim, 'pregame', context);
    until = now() + duration;
  }
  const show = (kind, extra = {}) => {
    current = broadcastShowCard(sim, kind, { ...context, ...extra });
    until = now() + (kind === 'final' ? duration * 2 : duration);
    return current;
  };
  return {
    refresh() {
      if (!enabled) { lastQuarter = Number(sim?.quarter) || lastQuarter; lastOver = Boolean(sim?.over); lastTimeout = sim?.timeout ?? null; return null; }
      const q = Number(sim?.quarter) || 1;
      if (!lastOver && sim?.over) show('final');
      else if (q !== lastQuarter && q > lastQuarter) show('quarter', { completedQuarter: lastQuarter });
      else if (sim?.timeout && sim.timeout !== lastTimeout) show('timeout');
      lastQuarter = q; lastOver = Boolean(sim?.over); lastTimeout = sim?.timeout ?? null;
      if (now() >= until) current = null;
      return current;
    },
    show,
    setEnabled(value) { enabled = Boolean(value); if (!enabled) current = null; return enabled; },
    get enabled() { return enabled; },
    get active() { return enabled && current && now() < until ? current : null; },
  };
}
