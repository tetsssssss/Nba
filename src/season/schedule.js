// Gerador de calendário da temporada regular: 82 jogos por franquia (41 em casa), 1.312 no total.
// O calendário é GERADO pelo jogo — não é o calendário real da NBA, que não existe para este universo
// de 32 franquias. Determinístico: a mesma semente produz o mesmo calendário.
//
// Fórmula (liga de 2 conferências × 4 divisões × 4 times):
//   divisão ............ 3 rivais × 4 jogos (2 em casa, 2 fora) = 12
//   conferência ........ 12 rivais: 2 "parceiros" × 4 jogos + 10 × 3 jogos = 38
//   outra conferência .. 16 rivais × 2 jogos (1 em casa, 1 fora) = 32
import { addDays } from '../ui/format.js';

/** Orienta um grafo regular de grau par de modo que cada vértice tenha metade das arestas "saindo" (circuito de Euler). */
function eulerOrientation(nodes, edges) {
  const adj = new Map(nodes.map((n) => [n, []]));
  edges.forEach(([a, b], i) => {
    adj.get(a).push({ to: b, i });
    adj.get(b).push({ to: a, i });
  });
  const used = new Array(edges.length).fill(false);
  const out = [];
  for (const start of nodes) {
    const stack = [start];
    const path = [];
    while (stack.length) {
      const v = stack.at(-1);
      const list = adj.get(v);
      while (list.length && used[list.at(-1).i]) list.pop();
      if (!list.length) path.push(stack.pop());
      else {
        const e = list.pop();
        used[e.i] = true;
        stack.push(e.to);
      }
    }
    for (let k = 0; k + 1 < path.length; k++) out.push([path[k], path[k + 1]]);
  }
  return out; // [de, para]: "de" recebe o jogo extra em casa
}

/** Lista de confrontos [mandante, visitante] da temporada, ainda sem datas. */
export function buildMatchups(teams, season) {
  const games = [];
  const add = (home, away, n = 1) => {
    for (let i = 0; i < n; i++) games.push([home, away]);
  };
  const byConf = new Map();
  for (const t of teams) {
    if (!byConf.has(t.conference)) byConf.set(t.conference, new Map());
    const divs = byConf.get(t.conference);
    if (!divs.has(t.division)) divs.set(t.division, []);
    divs.get(t.division).push(t.id);
  }
  const confs = [...byConf.keys()].sort();
  for (const conf of confs) {
    const divNames = [...byConf.get(conf).keys()].sort();
    const divs = divNames.map((d) => byConf.get(conf).get(d).slice().sort());
    const n = divs.length;
    const rot = season % divs[0].length; // os parceiros de 4 jogos giram a cada temporada
    const partner = new Set();
    const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    divs.forEach((ids, d) => ids.forEach((id, k) => partner.add(key(id, divs[(d + 1) % n][(k + rot) % ids.length]))));
    const three = [];
    const all = divs.flat();
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const [a, b] = [all[i], all[j]];
        const sameDiv = divs.some((ids) => ids.includes(a) && ids.includes(b));
        if (sameDiv || partner.has(key(a, b))) {
          add(a, b, 2);
          add(b, a, 2);
        } else three.push([a, b]);
      }
    }
    // séries de 3 jogos: um de cada lado + o terceiro distribuído de forma que todos fiquem com 41 em casa
    for (const [a, b] of three) {
      add(a, b);
      add(b, a);
    }
    for (const [home, away] of eulerOrientation(all, three)) add(home, away);
  }
  const [east, west] = confs.map((c) => [...byConf.get(c).values()].flat());
  for (const a of east) {
    for (const b of west) {
      add(a, b);
      add(b, a);
    }
  }
  return games;
}

/**
 * @param teams  [{ id, conference, division }]
 * @param opts   { season, start: 'AAAA-MM-DD', days, breaks: [[início, fim]], rng }
 * @returns [{ id, season, date, home, away, type: 'regular', status: 'scheduled' }] em ordem de data
 */
export function generateSchedule(teams, { season, start, days = 174, breaks = [], rng }) {
  const pool = rng.shuffle(buildMatchups(teams, season)).map(([home, away]) => ({ home, away }));
  const left = new Map(teams.map((t) => [t.id, 0]));
  for (const g of pool) {
    left.set(g.home, left.get(g.home) + 1);
    left.set(g.away, left.get(g.away) + 1);
  }
  const played = new Map(teams.map((t) => [t.id, []])); // índices dos dias em que o time joga
  const inBreak = (date) => breaks.some(([a, b]) => date >= a && date <= b);
  const out = [];
  let remaining = pool;
  for (let d = 0; remaining.length && d < days + 40; d++) {
    const date = addDays(start, d);
    if (inBreak(date)) continue;
    const daysLeft = Math.max(1, days - d - breaks.reduce((n, [a, b]) => n + (b > date ? Math.round((Date.parse(b) - Math.max(Date.parse(a), Date.parse(date))) / 864e5) + 1 : 0), 0));
    const target = Math.min(15, Math.ceil(remaining.length / daysLeft) + (d % 7 === 2 || d % 7 === 4 ? 2 : 0));
    const busy = new Set();
    const recent = (id, back) => played.get(id).includes(d - back);
    const blocked = (id) => busy.has(id) || (recent(id, 1) && recent(id, 2)) || played.get(id).filter((x) => x > d - 6).length >= 4;
    // prioridade: quem tem mais jogos por fazer e está há mais tempo sem jogar; evita o segundo dia seguido
    const score = (g) => left.get(g.home) + left.get(g.away) - (recent(g.home, 1) ? 9 : 0) - (recent(g.away, 1) ? 9 : 0) + (d - (played.get(g.home).at(-1) ?? -3)) + (d - (played.get(g.away).at(-1) ?? -3));
    const ranked = remaining.map((g) => [g, score(g) + rng.next()]).sort((a, b) => b[1] - a[1]);
    const today = [];
    const rest = [];
    for (const [g] of ranked) {
      if (today.length < target && !blocked(g.home) && !blocked(g.away)) {
        today.push(g);
        busy.add(g.home);
        busy.add(g.away);
      } else rest.push(g);
    }
    for (const g of today) {
      played.get(g.home).push(d);
      played.get(g.away).push(d);
      left.set(g.home, left.get(g.home) - 1);
      left.set(g.away, left.get(g.away) - 1);
      out.push({ id: `g${season}-${String(out.length + 1).padStart(4, '0')}`, season, date, home: g.home, away: g.away, type: 'regular', status: 'scheduled' });
    }
    remaining = rest;
  }
  if (remaining.length) throw new Error(`Calendário incompleto: ${remaining.length} jogo(s) sem data.`);
  return out;
}
