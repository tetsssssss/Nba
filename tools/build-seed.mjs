// Transforma o cache bruto (tools/.cache) nos arquivos de data/seed/ que o jogo
// carrega ao criar um universo. Dados reais e dados derivados pelo jogo ficam em
// arquivos separados; tudo que não pôde ser confirmado vai para validation.json.
//
// Uso: node tools/build-seed.mjs [--verbose]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT_DIR, readCache, rowsOf } from './lib/http.mjs';
import { ageOn, normalizeName, parseHeight } from './lib/names.mjs';
import { CAREER_COLUMNS, parseCareer, tenureWith } from './lib/career.mjs';
import { classify, deadMoneyFrom, estimated, fromEspn, fromHoopsHype, indexHoopsHype } from './lib/contracts.mjs';
import { loadPlayerFeatures, SEASON_WEIGHTS } from './lib/features.mjs';
import { MODEL_VERSION, buildRatings } from './ratings/model.mjs';
import { buildTendencies } from './ratings/tendencies.mjs';

const verbose = process.argv.includes('--verbose');
const SEED_DIR = join(ROOT_DIR, 'data', 'seed');
const readJson = async (rel) => JSON.parse(await readFile(join(ROOT_DIR, rel), 'utf8'));
const round = (v, d = 1) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);

const issues = []; // { level: 'error' | 'warn' | 'info', code, message, ...ctx }
const issue = (level, code, message, ctx = {}) => issues.push({ level, code, message, ...ctx });

// ------------------------------------------------------------------ fontes
const { franchises } = await readJson('data/static/franchises.json');
const league = await readJson('data/static/league.json');
const fetchReport = await readCache('fetch-report');
const snapshotDate = (fetchReport?.finishedAt ?? new Date().toISOString()).slice(0, 10);
const snapshotYear = Number(snapshotDate.slice(0, 4));

const real = franchises.filter((f) => !f.expansion);
const byNbaTeamId = new Map(real.map((f) => [f.nbaTeamId, f]));
const byEspnId = new Map(real.map((f) => [String(f.espnId), f.id]));

// ------------------------------------------------------------------ identidade
const nbaIndex = rowsOf((await readCache('nba/player-index-2026-27')) ?? { resultSets: [] });
if (!nbaIndex.length) throw new Error('Índice de jogadores da NBA ausente. Rode `npm run data:fetch`.');

const espnByName = new Map();
const espnAll = [];
const coachesRaw = [];
for (const f of real) {
  const roster = await readCache(`espn/roster/${f.espnId}`);
  if (!roster) {
    issue('error', 'espn-roster-missing', `Elenco ESPN ausente para ${f.id}`);
    continue;
  }
  for (const c of roster.coach ?? []) coachesRaw.push({ teamId: f.id, ...c });
  for (const a of roster.athletes) {
    const rec = { ...a, teamId: f.id };
    espnAll.push(rec);
    const key = normalizeName(a.fullName);
    if (!espnByName.has(key)) espnByName.set(key, []);
    espnByName.get(key).push(rec);
  }
}

// Nomes grafados de forma diferente entre NBA.com e ESPN (chave e valor já normalizados).
const ALIASES = new Map(Object.entries(await readJson('tools/static/name-aliases.json')).filter(([k]) => !k.startsWith('_')));
/** Todas as grafias conhecidas de um nome (a primeira é a do índice da NBA). */
const variants = (name) => {
  const key = normalizeName(name);
  return [key, ...(ALIASES.get(key) ?? [])];
};

const usedEspn = new Set();
const players = [];
for (const row of nbaIndex) {
  const franchise = byNbaTeamId.get(row.TEAM_ID);
  if (!franchise) {
    issue('warn', 'nba-player-without-team', `${row.PLAYER_FIRST_NAME} ${row.PLAYER_LAST_NAME} sem franquia reconhecida (TEAM_ID ${row.TEAM_ID})`);
    continue;
  }
  const name = `${row.PLAYER_FIRST_NAME} ${row.PLAYER_LAST_NAME}`.trim();
  const candidates = variants(name).flatMap((k) => espnByName.get(k) ?? []);
  const espn = candidates.find((c) => c.teamId === franchise.id && !usedEspn.has(c.id)) ?? candidates.find((c) => !usedEspn.has(c.id)) ?? null;
  if (espn) usedEspn.add(espn.id);
  players.push({ row, name, franchise, espn });
}
const espnOnly = espnAll.filter((a) => !usedEspn.has(a.id));

// ------------------------------------------------------------------ combine + draft
const combine = new Map();
for (let y = 2003; y <= 2026; y++) {
  for (const c of rowsOf((await readCache(`nba/combine/${y}`)) ?? { resultSets: [] })) {
    const num = (v) => (v == null || v === '' ? null : Number(v));
    combine.set(c.PLAYER_ID, {
      year: y, position: c.POSITION || null, heightNoShoes: num(c.HEIGHT_WO_SHOES), wingspan: num(c.WINGSPAN), standingReach: num(c.STANDING_REACH), weight: num(c.WEIGHT),
      bodyFat: num(c.BODY_FAT_PCT), standingVertical: num(c.STANDING_VERTICAL_LEAP), maxVertical: num(c.MAX_VERTICAL_LEAP),
      laneAgility: num(c.LANE_AGILITY_TIME), sprint: num(c.THREE_QUARTER_SPRINT), bench: num(c.BENCH_PRESS),
    });
  }
}
const draftRows = rowsOf((await readCache('nba/draft-history')) ?? { resultSets: [] });
const draftByPlayer = new Map(draftRows.map((d) => [d.PERSON_ID, d]));

// ------------------------------------------------------------------ carreira (ESPN)
const careerStats = {};
const careerInfo = new Map();
for (const p of players) {
  const payload = p.espn ? await readCache(`espn/athlete-stats/${p.espn.id}`) : null;
  const career = parseCareer(payload, byEspnId);
  careerInfo.set(p.row.PERSON_ID, career);
  if (career.rows.length) careerStats[p.row.PERSON_ID] = career.rows;
}

// ------------------------------------------------------------------ bio
const features = await loadPlayerFeatures();
const bios = await Promise.all(players.map(async ({ row, name, franchise, espn }) => {
  const id = row.PERSON_ID;
  const career = careerInfo.get(id);
  const f = features.get(id);
  const draft = draftByPlayer.get(id);
  // sem ESPN: a ficha oficial (commonplayerinfo) cobre a data de nascimento
  const info = espn ? null : rowsOf((await readCache(`nba/player-info/${id}`)) ?? { resultSets: [] })[0] ?? null;
  const heightIn = parseHeight(row.HEIGHT) ?? espn?.height ?? null;
  const weight = Number(row.WEIGHT) || espn?.weight || null;
  const birthDate = espn?.dateOfBirth?.slice(0, 10) ?? info?.BIRTHDATE?.slice(0, 10) ?? null;
  const age = ageOn(birthDate, snapshotDate) ?? espn?.age ?? null;
  const seasonsPlayed = new Set(career.rows.map((r) => r[0])).size;
  const exp = seasonsPlayed || (f ? Object.values(f.seasons).filter(Boolean).length : 0) || Number(info?.SEASON_EXP) || 0;
  const mpgDen = f ? Object.entries(f.seasons).reduce((a, [s, t]) => a + (t ? t.gp * SEASON_WEIGHTS[s] : 0), 0) : 0;
  const injury = espn?.injuries?.[0] ?? null;
  if (!espn) issue('info', 'no-espn-match', `${name} (${franchise.id}) não está nos elencos da ESPN — sem status de lesão e sem carreira por temporada.`, { playerId: id });
  if (age == null) issue('warn', 'age-missing', `${name} (${franchise.id}) sem idade conhecida.`, { playerId: id });
  if (!heightIn) issue('warn', 'height-missing', `${name} (${franchise.id}) sem altura.`, { playerId: id });
  return {
    id,
    espnId: espn ? Number(espn.id) : null,
    name,
    firstName: row.PLAYER_FIRST_NAME,
    lastName: row.PLAYER_LAST_NAME,
    teamId: franchise.id,
    jersey: row.JERSEY_NUMBER || espn?.jersey || null,
    positionLabel: row.POSITION || espn?.position?.abbreviation || null,
    heightIn,
    weight,
    birthDate,
    age,
    country: row.COUNTRY || espn?.birthPlace?.country || null,
    birthPlace: espn?.birthPlace ? [espn.birthPlace.city, espn.birthPlace.state, espn.birthPlace.country].filter(Boolean).join(', ') : null,
    college: row.COLLEGE || espn?.college?.name || null,
    draft: row.DRAFT_YEAR ? { year: row.DRAFT_YEAR, round: row.DRAFT_ROUND, pick: row.DRAFT_NUMBER, team: draft?.TEAM_ABBREVIATION ?? null } : null,
    exp,
    rookie: seasonsPlayed === 0 && !f,
    injury: injury ? { status: injury.status, since: injury.date?.slice(0, 10) ?? null } : null,
    combine: combine.get(id) ?? null,
    // insumos do modelo (não vão para o seed)
    _model: {
      mpg: f && mpgDen ? f.pooled.min / mpgDen : 0,
      careerSeasons: career.bySeason,
      techRate: career.techRate,
      improvement: career.improvement,
      tenure: tenureWith(career.lastTeams, franchise.id),
    },
  };
}));

// ------------------------------------------------------------------ ratings
const positionOverrides = new Map(Object.entries(await readJson('tools/static/position-overrides.json')).filter(([k]) => !k.startsWith('_')));
const rated = buildRatings(
  bios.map((b) => ({
    id: b.id, heightIn: b.heightIn, weight: b.weight, age: b.age, exp: b.exp, positionLabel: b.positionLabel, draft: b.draft,
    combine: b.combine, injuryStatus: b.injury?.status, snapshotYear, positionOverride: positionOverrides.get(normalizeName(b.name)), ...b._model,
  })),
  features,
);
for (const key of positionOverrides.keys()) {
  if (!bios.some((b) => normalizeName(b.name) === key)) issue('warn', 'override-unmatched', `Override de posição sem jogador correspondente: "${key}".`);
}
const tendencies = buildTendencies(rated.players);
const ratingById = new Map(rated.players.map((r) => [r.id, r]));

// ------------------------------------------------------------------ contratos
const hoops = new Map();
for (const f of real) hoops.set(f.id, await readCache(`hoopshype/contracts/${f.espnId}`));
for (const f of real) if (!hoops.get(f.id)) issue('error', 'contracts-missing', `Contratos HoopsHype ausentes para ${f.id}.`);
const hhByTeam = indexHoopsHype(hoops);

const contracts = [];
const matchedHoops = new Set(); // `${teamId}:${nome}` das entradas que viraram contrato ativo
const espnOf = new Map(players.map((p) => [p.row.PERSON_ID, p.espn]));
for (const b of bios) {
  const names = variants(b.name);
  const teamMap = hhByTeam.get(b.teamId);
  const hit = names.find((k) => teamMap?.has(k) && fromHoopsHype(teamMap.get(k)));
  let contract = hit ? fromHoopsHype(teamMap.get(hit)) : null;
  if (hit) matchedHoops.add(`${b.teamId}:${hit}`);
  contract ??= fromEspn(espnOf.get(b.id));
  contract ??= estimated(b, league);
  contract.type = classify(contract, b);
  if (contract.source === 'estimated') issue('info', 'contract-estimated', `${b.name} (${b.teamId}): contrato estimado (mínimo não garantido).`, { playerId: b.id });
  contracts.push({ playerId: b.id, teamId: b.teamId, yearsWithTeam: b._model.tenure, ...contract });
}

// Compromissos na folha por jogadores que não estão no elenco oficial do time
// (dispensas, stretch, buyouts): contam para o cap como dead money.
const deadByTeam = new Map(real.map((f) => [f.id, []]));
for (const [teamId, map] of hhByTeam) {
  for (const [key, entry] of map) {
    if (matchedHoops.has(`${teamId}:${key}`)) continue;
    const dead = deadMoneyFrom(entry);
    if (!dead) continue;
    deadByTeam.get(teamId).push(dead);
    const amount = dead.years.find((y) => y.season === 2027)?.amount ?? 0;
    issue('info', 'dead-money', `${teamId}: ${entry.name} fora do elenco oficial — ${(amount / 1e6).toFixed(2)} mi em 2026-27 tratados como dead money${dead.confirmed ? ' (dispensa confirmada na fonte)' : ''}.`, { teamId });
  }
}

// ------------------------------------------------------------------ franquias
const standings = new Map(rowsOf((await readCache('nba/standings-2025-26')) ?? { resultSets: [] }).map((s) => [s.TeamID, s]));
const franchiseHistory = rowsOf((await readCache('nba/franchise-history')) ?? { resultSets: [] });

// playoffs 2026 → séries e campeão
const playoffLogs = rowsOf((await readCache('nba/playoffs-2025-26-team-logs')) ?? { resultSets: [] });
const seriesMap = new Map();
for (const g of playoffLogs) {
  const m = /^(\w+) (?:vs\.|@) (\w+)$/.exec(g.MATCHUP);
  if (!m) continue;
  const pair = [m[1], m[2]].sort().join('-');
  const s = seriesMap.get(pair) ?? { teams: [m[1], m[2]].sort(), wins: {}, first: g.GAME_DATE, last: g.GAME_DATE };
  if (g.WL === 'W') s.wins[g.TEAM_ABBREVIATION] = (s.wins[g.TEAM_ABBREVIATION] ?? 0) + 1;
  if (g.GAME_DATE > s.last) s.last = g.GAME_DATE;
  seriesMap.set(pair, s);
}
const series = [...seriesMap.values()].sort((a, b) => a.last.localeCompare(b.last) || a.first.localeCompare(b.first)).map((s) => {
  const [a, b] = s.teams;
  const winner = (s.wins[a] ?? 0) > (s.wins[b] ?? 0) ? a : b;
  return { winner, loser: winner === a ? b : a, score: `${s.wins[winner] ?? 0}-${s.wins[winner === a ? b : a] ?? 0}`, ended: s.last };
});
const ROUND_BY_INDEX = (i, total) => (total === 15 ? (i < 8 ? 'Primeira rodada' : i < 12 ? 'Semifinal de conferência' : i < 14 ? 'Final de conferência' : 'Finais da NBA') : null);
series.forEach((s, i) => (s.round = ROUND_BY_INDEX(i, series.length)));
const finals = series.length === 15 ? series[14] : null;
if (!finals) issue('warn', 'playoffs-incomplete', `Playoffs 2026: esperadas 15 séries, encontradas ${series.length}.`);
const bestRound = new Map();
for (const s of series) {
  bestRound.set(s.loser, `Eliminado: ${s.round}`);
  if (s === finals) bestRound.set(s.winner, 'Campeão da NBA');
}

const teams = [];
const champions = [];
for (const f of real) {
  const espnTeam = (await readCache(`espn/team/${f.espnId}`))?.team;
  const details = await readCache(`nba/team-details/${f.nbaTeamId}`);
  const set = (name) => rowsOf({ resultSets: details?.resultSets.filter((s) => s.name === name) ?? [] });
  const bg = set('TeamBackground')[0] ?? {};
  const st = standings.get(f.nbaTeamId);
  if (!details) issue('warn', 'team-details-missing', `Detalhes oficiais ausentes para ${f.id}.`);
  let titles = set('TeamAwardsChampionships').map((r) => ({ year: r.YEARAWARDED, opponent: r.OPPOSITETEAM }));
  let retired = set('TeamRetired').map((r) => ({ number: r.JERSEY, name: r.PLAYER, seasons: r.SEASONSWITHTEAM, year: r.YEAR }));
  let confTitles = set('TeamAwardsConf').map((r) => r.YEARAWARDED);
  let divTitles = set('TeamAwardsDiv').map((r) => r.YEARAWARDED);
  let founded = bg.YEARFOUNDED ?? null;
  let record = franchiseHistory.filter((h) => h.TEAM_ID === f.nbaTeamId).sort((a, b) => b.YEARS - a.YEARS)[0];
  if (f.id === 'OKC') {
    // No universo do jogo, a história anterior a 2008 volta para Seattle.
    titles = titles.filter((t) => t.year >= 2009);
    confTitles = confTitles.filter((y) => y >= 2009);
    divTitles = divTitles.filter((y) => y >= 2009);
    retired = retired.filter((r) => !r.seasons || Number(String(r.seasons).slice(-4)) >= 2009);
    founded = 2008;
    record = franchiseHistory.find((h) => h.TEAM_ID === f.nbaTeamId && h.TEAM_CITY === 'Oklahoma City' && h.START_YEAR === '2008') ?? record;
  }
  for (const t of titles) champions.push({ year: t.year, teamId: f.id, opponent: t.opponent });
  // Técnico: o cadastro oficial da franquia (NBA.com) prevalece quando a ESPN diverge.
  const coach = coachesRaw.find((c) => c.teamId === f.id);
  const espnCoach = coach ? `${coach.firstName} ${coach.lastName}` : null;
  const sameCoach = (a, b) => normalizeName(a).replace(/\s/g, '') === normalizeName(b).replace(/\s/g, '');
  let coachName = espnCoach ?? bg.HEADCOACH ?? null;
  if (espnCoach && bg.HEADCOACH && !sameCoach(espnCoach, bg.HEADCOACH)) {
    coachName = bg.HEADCOACH;
    coach.replacedBy = bg.HEADCOACH;
    issue('warn', 'coach-mismatch', `${f.id}: a ESPN lista ${espnCoach} como técnico; o cadastro oficial da NBA lista ${bg.HEADCOACH}. Usando o cadastro oficial — confirmar.`, { teamId: f.id });
  }
  teams.push({
    id: f.id,
    nbaTeamId: f.nbaTeamId,
    espnId: f.espnId,
    founded,
    logo: espnTeam?.logos?.[0]?.href ?? null,
    arena: { name: bg.ARENA ?? espnTeam?.franchise?.venue?.fullName ?? null, capacity: Number(bg.ARENACAPACITY) || null },
    owner: bg.OWNER ?? null,
    generalManager: bg.GENERALMANAGER ?? null,
    headCoach: coachName,
    gLeagueAffiliate: bg.DLEAGUEAFFILIATION ?? null,
    championships: titles.map((t) => t.year),
    conferenceTitles: confTitles,
    divisionTitles: divTitles,
    retiredNumbers: retired,
    allTimeRecord: record ? { wins: record.WINS, losses: record.LOSSES, from: Number(record.START_YEAR), playoffAppearances: record.PO_APPEARANCES } : null,
    lastSeason: st
      ? { season: 2026, wins: st.WINS, losses: st.LOSSES, conference: st.Conference, conferenceRank: st.PlayoffRank, division: st.Division, home: st.HOME, road: st.ROAD, ppg: st.PointsPG, oppPpg: st.OppPointsPG, playoffs: bestRound.get(f.id) ?? 'Fora dos playoffs' }
      : null,
    deadMoney: deadByTeam.get(f.id) ?? [],
  });
  if (!bg.ARENACAPACITY) issue('info', 'arena-capacity-missing', `${f.id}: capacidade da arena não informada pela fonte oficial.`, { teamId: f.id });
}
// Seattle: linha oficial da era SuperSonics (1967-2008)
const seaLine = franchiseHistory.find((h) => h.TEAM_CITY === 'Seattle' && h.TEAM_NAME === 'SuperSonics');
const seattleRecord = seaLine ? { wins: seaLine.WINS, losses: seaLine.LOSSES, from: Number(seaLine.START_YEAR), to: Number(seaLine.END_YEAR) + 1, playoffAppearances: seaLine.PO_APPEARANCES, divisionTitles: seaLine.DIV_TITLES, conferenceTitles: seaLine.CONF_TITLES } : null;
champions.push({ year: 1979, teamId: 'SEA', opponent: 'Washington Bullets' });
if (finals) {
  const champ = real.find((f) => f.id === finals.winner);
  if (champ && !champions.some((c) => c.year === 2026)) champions.push({ year: 2026, teamId: champ.id, opponent: real.find((f) => f.id === finals.loser)?.name ?? finals.loser });
  const t = teams.find((x) => x.id === finals.winner);
  if (t && !t.championships.includes(2026)) t.championships.push(2026);
}
champions.sort((a, b) => a.year - b.year);

// ------------------------------------------------------------------ técnicos
const coaches = coachesRaw.map((c) =>
  c.replacedBy
    ? { id: `coach-${c.teamId}-${normalizeName(c.replacedBy).replace(/\s/g, '-')}`, espnId: null, name: c.replacedBy, teamId: c.teamId, role: 'head', experienceYears: null }
    : { id: `coach-${c.id}`, espnId: Number(c.id), name: `${c.firstName} ${c.lastName}`, teamId: c.teamId, role: 'head', experienceYears: c.experience ?? null },
);
for (const f of real) if (!coaches.some((c) => c.teamId === f.id)) issue('warn', 'coach-missing', `${f.id} sem técnico nas fontes.`, { teamId: f.id });

// ------------------------------------------------------------------ draft recente
const draftOf = (year) =>
  draftRows.filter((d) => d.SEASON === String(year)).sort((a, b) => a.OVERALL_PICK - b.OVERALL_PICK)
    .map((d) => ({ pick: d.OVERALL_PICK, round: d.ROUND_NUMBER, playerId: d.PERSON_ID, name: d.PLAYER_NAME, team: d.TEAM_ABBREVIATION, from: d.ORGANIZATION }));

// ------------------------------------------------------------------ validação
const dupNames = new Map();
for (const b of bios) dupNames.set(normalizeName(b.name), [...(dupNames.get(normalizeName(b.name)) ?? []), b]);
for (const [, list] of dupNames) if (list.length > 1) issue('info', 'same-name', `Homônimos: ${list.map((b) => `${b.name} (${b.teamId}, id ${b.id})`).join(' / ')}`);
const idSet = new Set();
for (const b of bios) {
  if (idSet.has(b.id)) issue('error', 'duplicate-id', `ID duplicado: ${b.id} (${b.name})`);
  idSet.add(b.id);
}
for (const a of espnOnly) issue('info', 'espn-only', `${a.fullName} aparece no elenco da ESPN (${a.teamId}) mas não no índice oficial da NBA — não incluído.`);
const rosterSizes = Object.fromEntries(real.map((f) => [f.id, bios.filter((b) => b.teamId === f.id).length]));
for (const [teamId, size] of Object.entries(rosterSizes)) {
  if (size < 14) issue('warn', 'roster-small', `${teamId} com apenas ${size} jogadores.`, { teamId });
  if (size > league.roster.offseasonMax) issue('warn', 'roster-large', `${teamId} com ${size} jogadores (limite de offseason: ${league.roster.offseasonMax}).`, { teamId });
}
const payroll = Object.fromEntries(real.map((f) => {
  const hit = (c) => {
    const y = c.years.find((x) => x.season === 2027);
    return y ? y.capHit ?? y.salary : 0;
  };
  const live = contracts.filter((c) => c.teamId === f.id && !c.twoWay).reduce((a, c) => a + hit(c), 0);
  const dead = (deadByTeam.get(f.id) ?? []).reduce((a, d) => a + (d.years.find((y) => y.season === 2027)?.amount ?? 0), 0);
  return [f.id, { live, dead, total: live + dead }];
}));

// ------------------------------------------------------------------ escrita
const lines = (arr) => `[\n${arr.map((x) => JSON.stringify(x)).join(',\n')}\n]\n`;
const strip = ({ _model, ...rest }) => rest;
await mkdir(SEED_DIR, { recursive: true });
const write = (name, text) => writeFile(join(SEED_DIR, name), text, 'utf8');

await write('players.json', lines(bios.map((b) => {
  const r = ratingById.get(b.id);
  return { ...strip(b), positions: r.positions };
})));
await write('ratings.json', lines(rated.players.map((r) => ({
  playerId: r.id, overall: r.overall, potential: r.potential, confidence: r.confidence, sampleMinutes: r.sampleMinutes,
  attributes: r.attributes, tendencies: tendencies.get(r.id),
}))));
await write('contracts.json', lines(contracts));
await write('career-stats.json', `${JSON.stringify({ columns: CAREER_COLUMNS, note: 'Médias por jogo, temporada regular. season = ano de término (2026 = 2025-26). Fonte: ESPN.', players: careerStats })}\n`);
// estatísticas avançadas reais da temporada-base, para exibição no perfil
const advanced = {};
for (const r of rated.players) {
  const f = features.get(r.id);
  const a = f?.rawAdvanced;
  if (!a || !f.seasons['2025-26']) continue;
  const x = r.rates;
  advanced[r.id] = {
    usg: round(a.USG_PCT * 100), ts: round(a.TS_PCT * 100), efg: round(a.EFG_PCT * 100), astPct: round(a.AST_PCT * 100), rebPct: round(a.REB_PCT * 100),
    tovPct: round(a.E_TOV_PCT), pie: round(a.PIE * 100), offRtg: round(a.OFF_RATING), defRtg: round(a.DEF_RATING), netRtg: round(a.NET_RATING),
    shotProfile: { rim: round(x.raFga36 / x.fga36 * 100, 0), paint: round(x.paintFga36 / x.fga36 * 100, 0), mid: round(x.midFga36 / x.fga36 * 100, 0), three: round(x.pctFga3 * 100, 0) },
  };
}
await write('advanced-stats.json', `${JSON.stringify({ season: 2026, note: 'Temporada regular 2025-26. Fonte: stats.nba.com.', players: advanced })}\n`);
await write('teams.json', lines(teams));
await write('coaches.json', lines(coaches));
await write('history.json', `${JSON.stringify({
  champions,
  seattleRecord,
  lastSeason: { season: 2026, label: '2025-26', champion: finals?.winner ?? null, runnerUp: finals?.loser ?? null, finalsScore: finals?.score ?? null, playoffSeries: series },
  drafts: { 2026: draftOf(2026), 2025: draftOf(2025) },
}, null, 1)}\n`);

const counts = { error: 0, warn: 0, info: 0 };
for (const i of issues) counts[i.level]++;
const confidence = { high: 0, medium: 0, low: 0, none: 0 };
for (const r of rated.players) confidence[r.confidence]++;
const contractSources = {};
for (const c of contracts) contractSources[c.source] = (contractSources[c.source] ?? 0) + 1;
const meta = {
  snapshotDate,
  generatedAt: new Date().toISOString(),
  season: league.startSeasonLabel,
  sources: [
    { id: 'nba-index', name: 'NBA.com / stats.nba.com — índice oficial de jogadores 2026-27', use: 'elencos, posição, altura, peso, país, draft' },
    { id: 'espn', name: 'ESPN — elencos e estatísticas de carreira', use: 'data de nascimento, lesões, carreira, técnicos, logos' },
    { id: 'hoopshype', name: 'HoopsHype — salários', use: 'contratos ano a ano, opções, two-way, dead money' },
    { id: 'nba-stats', name: 'stats.nba.com — avançadas, tracking, play types, hustle, combine', use: 'modelo de atributos e tendências' },
  ],
  fetch: fetchReport ? { finishedAt: fetchReport.finishedAt, ok: fetchReport.ok.length, failed: fetchReport.failed.length } : null,
  counts: { players: bios.length, teams: teams.length, coaches: coaches.length, contracts: contracts.length, careerSeasons: Object.values(careerStats).reduce((a, r) => a + r.length, 0) },
  ratingModel: { version: MODEL_VERSION, seasons: SEASON_WEIGHTS, referencePopulation: rated.referencePopulation, calibration: rated.calibration, confidence },
  contractSources,
};
await write('meta.json', `${JSON.stringify(meta, null, 1)}\n`);
await write('validation.json', `${JSON.stringify({ generatedAt: meta.generatedAt, counts, rosterSizes, payroll, issues }, null, 1)}\n`);

// ------------------------------------------------------------------ resumo
console.log(`Seed gerado em data/seed (snapshot ${snapshotDate})`);
console.log(`  jogadores: ${bios.length} | sem ESPN: ${bios.filter((b) => !b.espnId).length} | só ESPN: ${espnOnly.length}`);
console.log(`  contratos: ${JSON.stringify(contractSources)}`);
console.log(`  confiança dos ratings: ${JSON.stringify(confidence)} | população de referência: ${rated.referencePopulation}`);
console.log(`  calibração do Overall: ${JSON.stringify(rated.calibration)}`);
console.log(`  campeão 2026: ${finals?.winner} sobre ${finals?.loser} (${finals?.score})`);
console.log(`  validação: ${counts.error} erros, ${counts.warn} avisos, ${counts.info} informações`);
if (verbose) {
  for (const i of issues.filter((x) => x.level !== 'info')) console.log(`  [${i.level}] ${i.code}: ${i.message}`);
  const sortedPlayers = [...rated.players].sort((a, b) => b.overall - a.overall);
  const nameOf = new Map(bios.map((b) => [b.id, b]));
  const show = (r) => `${String(r.overall).padStart(2)} pot${r.potential} aj${String(r.shift).padStart(5)} ${nameOf.get(r.id).name.slice(0, 24).padEnd(24)} ${nameOf.get(r.id).teamId} ${r.positions.join('/').padEnd(5)} ${nameOf.get(r.id).age}a`;
  const from = Number(process.env.FROM ?? 0);
  const top = sortedPlayers.slice(from, from + Number(process.env.TOP ?? 75));
  console.log(`\nRanking ${from + 1}-${from + top.length}:`);
  for (let i = 0; i < top.length; i += 3) console.log('  ' + top.slice(i, i + 3).map(show).join(' | '));
  const dist = {};
  for (const r of rated.players) dist[Math.floor(r.overall / 5) * 5] = (dist[Math.floor(r.overall / 5) * 5] ?? 0) + 1;
  console.log('\nDistribuição de Overall:', JSON.stringify(dist));
  const watch = (process.env.WATCH ?? '').split(',').filter(Boolean);
  for (const w of watch) {
    const b = bios.find((x) => normalizeName(x.name).includes(normalizeName(w)));
    if (!b) continue;
    const r = ratingById.get(b.id);
    console.log(`\n${b.name} (${b.teamId}) ${r.positions.join('/')} OVR ${r.overall} POT ${r.potential} conf ${r.confidence} pv ${r.positionValue}`);
    console.log('  ' + Object.entries(r.attributes).map(([k, v]) => `${k}:${v}`).join(' '));
  }
}
