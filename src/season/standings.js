// Classificação a partir dos jogos encerrados. Função pura.

const blank = (team) => ({ id: team.id, conference: team.conference, division: team.division, w: 0, l: 0, pf: 0, pa: 0, home: [0, 0], away: [0, 0], conf: [0, 0], div: [0, 0], last: [] });

/**
 * @param teams [{ id, conference, division }]
 * @param games jogos da temporada (só os 'regular' com status 'final' contam)
 * @returns { rows: Map(id → linha), conferences: { East: [linhas ordenadas], West: [...] } }
 * Cada linha: w, l, pct, gb, home, away, conf, div, l10 [v, d], streak (+n vitórias / -n derrotas), diff, seed, zone
 */
export function computeStandings(teams, games) {
  const rows = new Map(teams.map((t) => [t.id, blank(t)]));
  const info = new Map(teams.map((t) => [t.id, t]));
  const finals = games.filter((g) => g.type === 'regular' && g.status === 'final').sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const g of finals) {
    const [hs, as] = g.score;
    const sides = [[g.home, g.away, hs, as, 'home'], [g.away, g.home, as, hs, 'away']];
    for (const [id, opp, pts, against, where] of sides) {
      const r = rows.get(id);
      if (!r) continue;
      const win = pts > against ? 0 : 1;
      r[win ? 'l' : 'w']++;
      r.pf += pts;
      r.pa += against;
      r[where][win]++;
      if (info.get(opp)?.conference === r.conference) r.conf[win]++;
      if (info.get(opp)?.division === r.division) r.div[win]++;
      r.last.push(win === 0);
    }
  }
  for (const r of rows.values()) {
    const gp = r.w + r.l;
    r.gp = gp;
    r.pct = gp ? r.w / gp : 0;
    r.diff = gp ? (r.pf - r.pa) / gp : 0;
    const l10 = r.last.slice(-10);
    r.l10 = [l10.filter(Boolean).length, l10.filter((x) => !x).length];
    let streak = 0;
    for (let i = r.last.length - 1; i >= 0 && r.last[i] === r.last.at(-1); i--) streak++;
    r.streak = r.last.length ? (r.last.at(-1) ? streak : -streak) : 0;
    delete r.last;
  }
  const conferences = {};
  for (const r of rows.values()) (conferences[r.conference] ??= []).push(r);
  for (const list of Object.values(conferences)) {
    // desempate simplificado: aproveitamento, campanha na conferência, saldo de pontos
    list.sort((a, b) => b.pct - a.pct || b.conf[0] / Math.max(1, b.conf[0] + b.conf[1]) - a.conf[0] / Math.max(1, a.conf[0] + a.conf[1]) || b.diff - a.diff || a.id.localeCompare(b.id));
    const top = list[0];
    list.forEach((r, i) => {
      r.seed = i + 1;
      r.gb = (top.w - r.w + (r.l - top.l)) / 2;
      r.zone = i < 6 ? 'playoff' : i < 10 ? 'playin' : 'out';
    });
  }
  return { rows, conferences };
}
