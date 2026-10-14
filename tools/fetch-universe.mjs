// Coleta os dados reais usados para montar o universo inicial.
// Fontes: ESPN (elencos, contratos, lesões, carreira), NBA.com (índice oficial
// de jogadores) e stats.nba.com (avançadas, tracking, play types, combine).
// Tudo vai para tools/.cache/ — rode `npm run data:build` depois para gerar data/seed/.
//
// Uso: node tools/fetch-universe.mjs [--refresh]
import { cachedFetch, mapLimit, readCache, rowsOf, writeCache, NBA_STATS_HEADERS } from './lib/http.mjs';
import { normalizeName } from './lib/names.mjs';

const refresh = process.argv.includes('--refresh');
export const SEASONS = ['2025-26', '2024-25']; // primeira = temporada-base dos ratings
export const NEXT_SEASON = '2026-27';

const report = { startedAt: new Date().toISOString(), ok: [], failed: [] };

async function grab(key, url, opts = {}) {
  try {
    const value = await cachedFetch(key, url, { refresh, ...opts });
    report.ok.push(key);
    return value;
  } catch (err) {
    report.failed.push({ key, url, error: err.message });
    console.warn(`  ! ${key}: ${err.message}`);
    return undefined;
  }
}

// ---------------------------------------------------------------- stats.nba.com
const STATS = 'https://stats.nba.com/stats/';
const dash = (season, extra = {}) =>
  new URLSearchParams({
    College: '', Conference: '', Country: '', DateFrom: '', DateTo: '', Division: '', DraftPick: '', DraftYear: '',
    GameScope: '', GameSegment: '', Height: '', LastNGames: '0', LeagueID: '00', Location: '', Month: '0',
    OpponentTeamID: '0', Outcome: '', PORound: '0', PaceAdjust: 'N', PerMode: 'PerGame', Period: '0',
    PlayerExperience: '', PlayerPosition: '', PlusMinus: 'N', Rank: 'N', Season: season, SeasonSegment: '',
    SeasonType: 'Regular Season', ShotClockRange: '', StarterBench: '', TeamID: '0', TwoWay: '0',
    VsConference: '', VsDivision: '', Weight: '', ...extra,
  }).toString();

const nba = (key, path, opts = {}) => grab(key, STATS + path, { headers: NBA_STATS_HEADERS, delay: 450, ...opts });

const SYNERGY_OFF = ['Isolation', 'Transition', 'PRBallHandler', 'PRRollman', 'Postup', 'Spotup', 'Handoff', 'Cut', 'OffScreen', 'OffRebound', 'Misc'];
const SYNERGY_DEF = ['Isolation', 'PRBallHandler', 'PRRollman', 'Postup', 'Spotup', 'Handoff', 'OffScreen'];
const PT_MEASURES = ['Drives', 'Passing', 'Rebounding', 'SpeedDistance', 'Possessions', 'Defense', 'PostTouch', 'PaintTouch', 'ElbowTouch', 'CatchShoot', 'PullUpShot', 'Efficiency'];
const PT_DEFEND = { overall: 'Overall', three: '3 Pointers', lt6: 'Less Than 6Ft', gt15: 'Greater Than 15Ft' };

async function fetchSeason(season) {
  const k = (name) => `nba/${season}/${name}`;
  console.log(`stats.nba.com ${season}`);
  await nba(k('base-totals'), `leaguedashplayerstats?${dash(season, { MeasureType: 'Base', PerMode: 'Totals' })}`);
  for (const m of ['Advanced', 'Scoring', 'Misc', 'Defense']) {
    await nba(k(`dash-${m.toLowerCase()}`), `leaguedashplayerstats?${dash(season, { MeasureType: m })}`);
  }
  await nba(k('bio'), `leaguedashplayerbiostats?${dash(season)}`);
  await nba(k('shot-locations'), `leaguedashplayershotlocations?${dash(season, { DistanceRange: 'By Zone', MeasureType: 'Base', PerMode: 'Totals' })}`);
  const ptshot = { CloseDefDistRange: '', DribbleRange: '', ShotDistRange: '', TouchTimeRange: '', PerMode: 'Totals' };
  await nba(k('ptshot-catchshoot'), `leaguedashplayerptshot?${dash(season, { ...ptshot, GeneralRange: 'Catch and Shoot' })}`);
  await nba(k('ptshot-pullups'), `leaguedashplayerptshot?${dash(season, { ...ptshot, GeneralRange: 'Pullups' })}`);
  await nba(k('ptshot-open'), `leaguedashplayerptshot?${dash(season, { ...ptshot, GeneralRange: '', CloseDefDistRange: '6+ Feet - Wide Open' })}`);
  await nba(k('ptshot-tight'), `leaguedashplayerptshot?${dash(season, { ...ptshot, GeneralRange: '', CloseDefDistRange: '2-4 Feet - Tight' })}`);
  await nba(k('hustle'), `leaguehustlestatsplayer?${dash(season, { PerMode: 'Totals' })}`);
  for (const m of PT_MEASURES) {
    await nba(k(`pt-${m.toLowerCase()}`), `leaguedashptstats?${dash(season, { PlayerOrTeam: 'Player', PtMeasureType: m })}`);
  }
  for (const [name, cat] of Object.entries(PT_DEFEND)) {
    await nba(k(`defend-${name}`), `leaguedashptdefend?${dash(season, { DefenseCategory: cat, PerMode: 'Totals' })}`);
  }
  const clutch = { ClutchTime: 'Last 5 Minutes', AheadBehind: 'Ahead or Behind', PointDiff: '5', PerMode: 'Totals' };
  await nba(k('clutch-base'), `leaguedashplayerclutch?${dash(season, { ...clutch, MeasureType: 'Base' })}`);
  const syn = (type, grouping) =>
    `synergyplaytypes?${new URLSearchParams({ LeagueID: '00', PerMode: 'PerGame', PlayType: type, PlayerOrTeam: 'P', SeasonType: 'Regular Season', SeasonYear: season, TypeGrouping: grouping })}`;
  for (const t of SYNERGY_OFF) await nba(k(`synergy-off-${t.toLowerCase()}`), syn(t, 'offensive'), { timeout: 60000 });
  for (const t of SYNERGY_DEF) await nba(k(`synergy-def-${t.toLowerCase()}`), syn(t, 'defensive'), { timeout: 60000 });
}

async function fetchLeagueWide() {
  console.log('stats.nba.com — liga');
  await nba('nba/standings-2025-26', `leaguestandingsv3?LeagueID=00&Season=2025-26&SeasonType=Regular%20Season`);
  // Playoffs 2026: registra o campeão real da temporada anterior ao universo.
  await nba('nba/playoffs-2025-26-team-logs', `leaguegamelog?Counter=0&DateFrom=&DateTo=&Direction=ASC&LeagueID=00&PlayerOrTeam=T&Season=2025-26&SeasonType=Playoffs&Sorter=DATE`);
  // Jogo a jogo de todos os jogadores: base para consistência e disponibilidade.
  for (const season of SEASONS) {
    await nba(`nba/${season}/player-game-logs`, `leaguegamelog?Counter=0&DateFrom=&DateTo=&Direction=ASC&LeagueID=00&PlayerOrTeam=P&Season=${season}&SeasonType=Regular%20Season&Sorter=DATE`, { timeout: 90000 });
  }
  await nba('nba/franchise-history', `franchisehistory?LeagueID=00`);
  await nba('nba/draft-history', `drafthistory?LeagueID=00`);
  await nba(`nba/player-index-${NEXT_SEASON}`, `playerindex?${new URLSearchParams({ Active: '', AllStar: '', College: '', Country: '', DraftPick: '', DraftRound: '', DraftYear: '', Height: '', Historical: '0', LeagueID: '00', Season: NEXT_SEASON, SeasonType: 'Regular Season', TeamID: '0', Weight: '' })}`);
  // Combine: medidas e testes físicos reais de todos os anos com jogadores ainda ativos.
  for (let y = 2003; y <= 2026; y++) {
    const sy = `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
    await nba(`nba/combine/${y}`, `draftcombinestats?LeagueID=00&SeasonYear=${sy}`);
  }
}

async function fetchTeamDetails(teamIds) {
  console.log('stats.nba.com — detalhes das franquias');
  for (const id of teamIds) await nba(`nba/team-details/${id}`, `teamdetails?TeamID=${id}`);
}

// ---------------------------------------------------------------- ESPN
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/';

async function fetchEspn() {
  console.log('ESPN — franquias e elencos');
  const teamsPayload = await grab('espn/teams', `${ESPN}teams?limit=40`);
  const teams = teamsPayload.sports[0].leagues[0].teams.map((t) => t.team);
  const rosters = await mapLimit(teams, 4, async (t) => {
    await grab(`espn/team/${t.id}`, `${ESPN}teams/${t.id}`);
    return grab(`espn/roster/${t.id}`, `${ESPN}teams/${t.id}/roster`);
  });
  const athleteIds = [...new Set(rosters.flatMap((r) => (r?.athletes ?? []).map((a) => a.id)))];
  console.log(`ESPN — carreira de ${athleteIds.length} jogadores`);
  let done = 0;
  await mapLimit(athleteIds, 6, async (id) => {
    await grab(`espn/athlete-stats/${id}`, `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${id}/stats?region=us&lang=en&contentorigin=espn`, { retries: 2 });
    if (++done % 100 === 0) console.log(`  ${done}/${athleteIds.length}`);
  });
  const names = new Set(rosters.flatMap((r) => (r?.athletes ?? []).map((a) => normalizeName(a.fullName))));
  return { teams, names };
}

// Jogadores do índice oficial que a ESPN não lista: a ficha oficial traz a data de nascimento.
async function fetchMissingBios(nbaPlayers, espnNames) {
  const missing = nbaPlayers.filter((p) => !espnNames.has(normalizeName(`${p.PLAYER_FIRST_NAME} ${p.PLAYER_LAST_NAME}`)));
  console.log(`stats.nba.com — ficha de ${missing.length} jogadores ausentes na ESPN`);
  for (const p of missing) await nba(`nba/player-info/${p.PERSON_ID}`, `commonplayerinfo?LeagueID=00&PlayerID=${p.PERSON_ID}`);
}

// ---------------------------------------------------------------- HoopsHype (contratos)
// Contratos ano a ano com opções (player/team), two-way e qualifying offers.
const HOOPSHYPE_TEAM_ID = { 30: 5312 }; // Charlotte é o único id que difere do da ESPN
async function fetchContracts(espnTeams) {
  console.log('HoopsHype — contratos');
  for (const t of espnTeams) {
    const html = await grab(`hoopshype/html/${t.id}`, `https://www.hoopshype.com/salaries/teams/${t.slug}/${HOOPSHYPE_TEAM_ID[t.id] ?? t.id}/`, { as: 'text', delay: 800 });
    const m = html?.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
    if (!m) {
      report.failed.push({ key: `hoopshype/contracts/${t.id}`, error: '__NEXT_DATA__ não encontrado' });
      continue;
    }
    const queries = JSON.parse(m[1]).props?.pageProps?.dehydratedState?.queries ?? [];
    const contracts = queries.map((q) => q.state?.data?.contracts?.contracts).find(Array.isArray);
    if (!contracts) {
      report.failed.push({ key: `hoopshype/contracts/${t.id}`, error: 'lista de contratos ausente' });
      continue;
    }
    await writeCache(`hoopshype/contracts/${t.id}`, contracts);
  }
}

async function fetchNbaCom() {
  console.log('NBA.com — índice oficial de jogadores');
  const html = await grab('nbacom/players-html', 'https://www.nba.com/players', { as: 'text' });
  const m = html?.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (!m) {
    report.failed.push({ key: 'nbacom/players', error: '__NEXT_DATA__ não encontrado' });
    return [];
  }
  const players = JSON.parse(m[1]).props.pageProps.players;
  await writeCache('nbacom/players', players);
  return players;
}

// ---------------------------------------------------------------- main
const { teams: espnTeams, names: espnNames } = await fetchEspn();
await fetchContracts(espnTeams);
const nbaPlayers = await fetchNbaCom();
const nbaTeamIds = [...new Set(nbaPlayers.map((p) => p.TEAM_ID).filter(Boolean))].sort();
await fetchLeagueWide();
await fetchMissingBios(rowsOf((await readCache(`nba/player-index-${NEXT_SEASON}`)) ?? { resultSets: [] }), espnNames);
await fetchTeamDetails(nbaTeamIds);
for (const season of SEASONS) await fetchSeason(season);

report.finishedAt = new Date().toISOString();
await writeCache('fetch-report', report);
console.log(`\nConcluído: ${report.ok.length} recursos ok, ${report.failed.length} falhas.`);
for (const f of report.failed) console.log(`  FALHOU ${f.key}: ${f.error}`);
