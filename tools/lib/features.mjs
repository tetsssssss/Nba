// Lê as tabelas brutas da stats.nba.com (cache) e produz, por jogador, um conjunto
// "pooled" de totais ponderados por temporada. Todas as taxas do modelo de ratings
// são derivadas daqui — assim a temporada-base pesa mais, mas a anterior estabiliza
// amostras pequenas e cobre quem perdeu o ano por lesão.
import { readCache, rowsOf } from './http.mjs';

export const SEASON_WEIGHTS = { '2025-26': 1, '2024-25': 0.55 };

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : 0);

async function table(season, name, index = 0) {
  const payload = await readCache(`nba/${season}/${name}`);
  return payload ? rowsOf(payload, index) : [];
}

/** Zonas de arremesso: o payload tem cabeçalho em dois níveis. */
async function shotLocations(season) {
  const payload = await readCache(`nba/${season}/shot-locations`);
  if (!payload) return new Map();
  const set = payload.resultSets;
  const zones = set.headers[0].columnNames;
  const skip = set.headers[0].columnsToSkip;
  const out = new Map();
  for (const row of set.rowSet) {
    const z = {};
    zones.forEach((zone, i) => {
      z[zone] = { fgm: num(row[skip + i * 3]), fga: num(row[skip + i * 3 + 1]) };
    });
    out.set(row[0], z);
  }
  return out;
}

const SYN_OFF = { iso: 'isolation', trans: 'transition', prbh: 'prballhandler', roll: 'prrollman', post: 'postup', spot: 'spotup', handoff: 'handoff', cut: 'cut', offScreen: 'offscreen', putback: 'offrebound', misc: 'misc' };
const SYN_DEF = { iso: 'isolation', prbh: 'prballhandler', roll: 'prrollman', post: 'postup', spot: 'spotup', handoff: 'handoff', offScreen: 'offscreen' };

/** Play types: uma linha por jogador/time (trocados aparecem duas vezes) — agrega em totais. */
async function synergy(season, side, file) {
  const rows = await table(season, `synergy-${side}-${file}`);
  const out = new Map();
  for (const r of rows) {
    const gp = num(r.GP);
    const poss = num(r.POSS) * gp;
    const cur = out.get(r.PLAYER_ID) ?? { poss: 0, pts: 0, tov: 0, plusOne: 0, fta: 0 };
    cur.poss += poss;
    cur.pts += num(r.PTS) * gp;
    cur.tov += num(r.TOV_POSS_PCT) * poss;
    cur.plusOne += num(r.PLUSONE_POSS_PCT) * poss;
    cur.fta += num(r.FT_POSS_PCT) * poss;
    out.set(r.PLAYER_ID, cur);
  }
  return out;
}

const byId = (rows, key = 'PLAYER_ID') => new Map(rows.map((r) => [r[key], r]));

/** Carrega todas as tabelas de uma temporada indexadas por PLAYER_ID. */
async function loadSeason(season) {
  const t = {
    base: byId(await table(season, 'base-totals')),
    adv: byId(await table(season, 'dash-advanced')),
    scoring: byId(await table(season, 'dash-scoring')),
    misc: byId(await table(season, 'dash-misc')),
    defense: byId(await table(season, 'dash-defense')),
    zones: await shotLocations(season),
    cs: byId(await table(season, 'ptshot-catchshoot')),
    pu: byId(await table(season, 'ptshot-pullups')),
    open: byId(await table(season, 'ptshot-open')),
    tight: byId(await table(season, 'ptshot-tight')),
    hustle: byId(await table(season, 'hustle')),
    drives: byId(await table(season, 'pt-drives')),
    passing: byId(await table(season, 'pt-passing')),
    reb: byId(await table(season, 'pt-rebounding')),
    speed: byId(await table(season, 'pt-speeddistance')),
    poss: byId(await table(season, 'pt-possessions')),
    ptDef: byId(await table(season, 'pt-defense')),
    post: byId(await table(season, 'pt-posttouch')),
    dOverall: byId(await table(season, 'defend-overall'), 'CLOSE_DEF_PERSON_ID'),
    dThree: byId(await table(season, 'defend-three'), 'CLOSE_DEF_PERSON_ID'),
    dLt6: byId(await table(season, 'defend-lt6'), 'CLOSE_DEF_PERSON_ID'),
    dGt15: byId(await table(season, 'defend-gt15'), 'CLOSE_DEF_PERSON_ID'),
    clutch: byId(await table(season, 'clutch-base')),
    synOff: {},
    synDef: {},
    logs: new Map(),
  };
  for (const [k, file] of Object.entries(SYN_OFF)) t.synOff[k] = await synergy(season, 'off', file);
  for (const [k, file] of Object.entries(SYN_DEF)) t.synDef[k] = await synergy(season, 'def', file);
  for (const g of await table(season, 'player-game-logs')) {
    if (!t.logs.has(g.PLAYER_ID)) t.logs.set(g.PLAYER_ID, []);
    t.logs.get(g.PLAYER_ID).push(g);
  }
  return t;
}

/** Totais de uma temporada para um jogador, já convertidos de "por jogo" para total. */
function seasonTotals(t, id) {
  const b = t.base.get(id);
  if (!b || num(b.MIN) <= 0) return null;
  const gp = num(b.GP);
  const min = num(b.MIN);
  const a = t.adv.get(id) ?? {};
  const s = t.scoring.get(id) ?? {};
  const m = t.misc.get(id) ?? {};
  const d = t.defense.get(id) ?? {};
  const z = t.zones.get(id) ?? {};
  const zone = (name) => z[name] ?? { fgm: 0, fga: 0 };
  const shot = (row) => ({ fga: num(row?.FGA), fgm: num(row?.FGM), fg3a: num(row?.FG3A), fg3m: num(row?.FG3M) });
  const h = t.hustle.get(id) ?? {};
  const pg = (row, key) => num(row?.[key]) * num(row?.GP ?? gp); // tabelas "por jogo" → total
  const dr = t.drives.get(id);
  const pa = t.passing.get(id);
  const rb = t.reb.get(id);
  const sp = t.speed.get(id);
  const po = t.poss.get(id);
  const pd = t.ptDef.get(id);
  const pt = t.post.get(id);
  const c = t.clutch.get(id) ?? {};
  const def = (row, a2, m2) => ({ fga: num(row?.[a2]), fgm: num(row?.[m2]) });
  const fgm = num(b.FGM);
  const out = {
    gp, min,
    fgm, fga: num(b.FGA), fg3m: num(b.FG3M), fg3a: num(b.FG3A), ftm: num(b.FTM), fta: num(b.FTA),
    oreb: num(b.OREB), dreb: num(b.DREB), ast: num(b.AST), tov: num(b.TOV), stl: num(b.STL), blk: num(b.BLK),
    pf: num(b.PF), pfd: num(b.PFD), pts: num(b.PTS), plusMinus: num(b.PLUS_MINUS),
    // percentuais prontos: guardados como (valor × minutos) para média ponderada
    wUsg: num(a.USG_PCT) * min, wAstPct: num(a.AST_PCT) * min, wOrebPct: num(a.OREB_PCT) * min, wDrebPct: num(a.DREB_PCT) * min,
    wRebPct: num(a.REB_PCT) * min, wTovPct: num(a.E_TOV_PCT) * min, wPie: num(a.PIE) * min, wOffRtg: num(a.OFF_RATING) * min,
    wDefRtg: num(a.DEF_RATING) * min, wNetRtg: num(a.NET_RATING) * min, wPace: num(a.PACE) * min, poss: num(a.POSS),
    wDefWs: num(d.DEF_WS),
    uastFgm: fgm * num(s.PCT_UAST_FGM), ptsFb: pg(m, 'PTS_FB'), ptsPaint: pg(m, 'PTS_PAINT'), pts2nd: pg(m, 'PTS_2ND_CHANCE'),
    ra: zone('Restricted Area'), paint: zone('In The Paint (Non-RA)'), mid: zone('Mid-Range'), corner3: zone('Corner 3'), atb3: zone('Above the Break 3'),
    cs: shot(t.cs.get(id)), pu: shot(t.pu.get(id)), open: shot(t.open.get(id)), tight: shot(t.tight.get(id)),
    contested: num(h.CONTESTED_SHOTS), contested2: num(h.CONTESTED_SHOTS_2PT), contested3: num(h.CONTESTED_SHOTS_3PT),
    deflections: num(h.DEFLECTIONS), charges: num(h.CHARGES_DRAWN), screenAst: num(h.SCREEN_ASSISTS),
    looseOff: num(h.OFF_LOOSE_BALLS_RECOVERED), looseDef: num(h.DEF_LOOSE_BALLS_RECOVERED), boxOff: num(h.OFF_BOXOUTS), boxDef: num(h.DEF_BOXOUTS),
    drives: pg(dr, 'DRIVES'), driveFga: pg(dr, 'DRIVE_FGA'), driveFgm: pg(dr, 'DRIVE_FGM'), driveFta: pg(dr, 'DRIVE_FTA'),
    drivePasses: pg(dr, 'DRIVE_PASSES'), driveAst: pg(dr, 'DRIVE_AST'), driveTov: pg(dr, 'DRIVE_TOV'),
    passes: pg(pa, 'PASSES_MADE'), potAst: pg(pa, 'POTENTIAL_AST'), secAst: pg(pa, 'SECONDARY_AST'), astPts: pg(pa, 'AST_POINTS_CREATED'),
    orebContest: pg(rb, 'OREB_CONTEST'), orebChances: pg(rb, 'OREB_CHANCES'), drebContest: pg(rb, 'DREB_CONTEST'), drebChances: pg(rb, 'DREB_CHANCES'),
    distMiles: pg(sp, 'DIST_MILES'), wSpeed: num(sp?.AVG_SPEED) * min, wSpeedOff: num(sp?.AVG_SPEED_OFF) * min, wSpeedDef: num(sp?.AVG_SPEED_DEF) * min,
    touches: pg(po, 'TOUCHES'), timeOfPoss: pg(po, 'TIME_OF_POSS'), wDribPerTouch: num(po?.AVG_DRIB_PER_TOUCH) * min, wSecPerTouch: num(po?.AVG_SEC_PER_TOUCH) * min,
    postTouches: pg(po, 'POST_TOUCHES'), paintTouches: pg(po, 'PAINT_TOUCHES'), elbowTouches: pg(po, 'ELBOW_TOUCHES'),
    postFga: pg(pt, 'POST_TOUCH_FGA'), postFgm: pg(pt, 'POST_TOUCH_FGM'), postPasses: pg(pt, 'POST_TOUCH_PASSES'),
    defRim: { fga: pg(pd, 'DEF_RIM_FGA'), fgm: pg(pd, 'DEF_RIM_FGM') },
    dOverall: { ...def(t.dOverall.get(id), 'D_FGA', 'D_FGM'), exp: num(t.dOverall.get(id)?.NORMAL_FG_PCT) * num(t.dOverall.get(id)?.D_FGA) },
    dThree: { ...def(t.dThree.get(id), 'FG3A', 'FG3M'), exp: num(t.dThree.get(id)?.NS_FG3_PCT) * num(t.dThree.get(id)?.FG3A) },
    dLt6: { ...def(t.dLt6.get(id), 'FGA_LT_06', 'FGM_LT_06'), exp: num(t.dLt6.get(id)?.NS_LT_06_PCT) * num(t.dLt6.get(id)?.FGA_LT_06) },
    dGt15: { ...def(t.dGt15.get(id), 'FGA_GT_15', 'FGM_GT_15'), exp: num(t.dGt15.get(id)?.NS_GT_15_PCT) * num(t.dGt15.get(id)?.FGA_GT_15) },
    clutch: { min: num(c.MIN), gp: num(c.GP), pts: num(c.PTS), fga: num(c.FGA), fgm: num(c.FGM), fg3m: num(c.FG3M), fta: num(c.FTA), ftm: num(c.FTM), ast: num(c.AST), tov: num(c.TOV), plusMinus: num(c.PLUS_MINUS) },
    synOff: {}, synDef: {},
  };
  for (const k of Object.keys(SYN_OFF)) out.synOff[k] = t.synOff[k].get(id) ?? { poss: 0, pts: 0, tov: 0, plusOne: 0, fta: 0 };
  for (const k of Object.keys(SYN_DEF)) out.synDef[k] = t.synDef[k].get(id) ?? { poss: 0, pts: 0, tov: 0, plusOne: 0, fta: 0 };
  return out;
}

/** Soma ponderada recursiva de dois objetos numéricos de mesma forma. */
function addWeighted(acc, src, w) {
  for (const [k, v] of Object.entries(src)) {
    if (typeof v === 'number') acc[k] = (acc[k] ?? 0) + v * w;
    else if (v && typeof v === 'object') acc[k] = addWeighted(acc[k] ?? {}, v, w);
  }
  return acc;
}

/** Estatísticas de jogo a jogo: regularidade (Game Score por minuto) e disponibilidade. */
function logSummary(logs) {
  const played = logs.filter((g) => num(g.MIN) >= 12);
  if (played.length < 15) return { games: logs.length, cv: null };
  const scores = played.map((g) => {
    const gs = num(g.PTS) + 0.4 * num(g.FGM) - 0.7 * num(g.FGA) - 0.4 * (num(g.FTA) - num(g.FTM)) + 0.7 * num(g.OREB) + 0.3 * num(g.DREB) + num(g.STL) + 0.7 * num(g.AST) + 0.7 * num(g.BLK) - 0.4 * num(g.PF) - num(g.TOV);
    return gs / num(g.MIN);
  });
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const sd = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length);
  return { games: logs.length, cv: sd / Math.max(0.12, Math.abs(mean)), sd };
}

/**
 * Devolve Map<nbaId, { pooled, seasons: { '2025-26': totals|null, ... }, logs }>.
 * `pooled` soma as temporadas com SEASON_WEIGHTS; `pooled.wMin` é a amostra efetiva.
 */
export async function loadPlayerFeatures(seasons = Object.keys(SEASON_WEIGHTS)) {
  const loaded = {};
  for (const season of seasons) loaded[season] = await loadSeason(season);
  const ids = new Set(seasons.flatMap((s) => [...loaded[s].base.keys()]));
  const out = new Map();
  for (const id of ids) {
    const perSeason = {};
    const pooled = {};
    for (const season of seasons) {
      const totals = seasonTotals(loaded[season], id);
      perSeason[season] = totals;
      if (totals) addWeighted(pooled, totals, SEASON_WEIGHTS[season]);
    }
    if (!pooled.min) continue;
    const primary = loaded[seasons[0]];
    const logs = primary.logs.get(id) ?? loaded[seasons[1]]?.logs.get(id) ?? [];
    out.set(id, { pooled, seasons: perSeason, logs: logSummary(logs), rawAdvanced: primary.adv.get(id) ?? null });
  }
  return out;
}
