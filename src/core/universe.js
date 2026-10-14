// Criação do universo inicial de uma carreira a partir do seed (dados reais em
// data/seed) e da definição do universo do jogo (data/static).
import { bulkWrite } from './db.js';
import { DIFFICULTY_BY_ID, ROLE_BY_ID } from './career-options.js';
import { positionOverall } from '../players/overall.js';

const SEED_FILES = {
  meta: 'data/seed/meta.json',
  teams: 'data/seed/teams.json',
  players: 'data/seed/players.json',
  ratings: 'data/seed/ratings.json',
  contracts: 'data/seed/contracts.json',
  career: 'data/seed/career-stats.json',
  advanced: 'data/seed/advanced-stats.json',
  coaches: 'data/seed/coaches.json',
  history: 'data/seed/history.json',
  franchises: 'data/static/franchises.json',
  league: 'data/static/league.json',
};

let seedCache = null;

/** Carrega (uma vez) todos os arquivos de seed. */
export async function loadSeed() {
  if (seedCache) return seedCache;
  const entries = await Promise.all(
    Object.entries(SEED_FILES).map(async ([key, url]) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Não foi possível carregar ${url} (HTTP ${res.status}). Gere o seed com "npm run data:all".`);
      return [key, await res.json()];
    }),
  );
  seedCache = Object.fromEntries(entries);
  return seedCache;
}

/** As 32 franquias do universo, com conferência/divisão já resolvidas. Não depende de save. */
export function buildTeams(seed) {
  const place = new Map();
  for (const conference of ['East', 'West']) {
    for (const [division, ids] of Object.entries(seed.franchises.alignment[conference])) {
      for (const id of ids) place.set(id, { conference, division });
    }
  }
  const official = new Map(seed.teams.map((t) => [t.id, t]));
  return seed.franchises.franchises.map((f) => {
    const o = official.get(f.id);
    const identity = f.identity ?? null;
    const pos = place.get(f.id);
    if (!pos) throw new Error(`Franquia ${f.id} sem conferência/divisão em franchises.json`);
    return {
      id: f.id,
      city: f.city,
      name: f.name,
      fullName: `${f.city} ${f.name}`,
      conference: pos.conference,
      division: pos.division,
      colors: f.colors,
      market: f.market,
      fans: f.fans,
      rivals: f.rivals ?? [],
      expansion: Boolean(f.expansion),
      nbaTeamId: f.nbaTeamId,
      espnId: f.espnId,
      logo: o?.logo ?? null,
      founded: o?.founded ?? identity?.founded ?? null,
      arenaId: `arena-${f.id}`,
      ownerId: `owner-${f.id}`,
      generalManager: o?.generalManager ?? null,
      gLeagueAffiliate: o?.gLeagueAffiliate ?? null,
      championships: o?.championships ?? identity?.championships ?? [],
      conferenceTitles: o?.conferenceTitles ?? [],
      divisionTitles: o?.divisionTitles ?? [],
      finalsAppearances: identity?.finalsAppearances ?? null,
      retiredNumbers: o?.retiredNumbers ?? identity?.retiredNumbers ?? [],
      allTimeRecord: o?.allTimeRecord ?? (f.id === 'SEA' ? seed.history.seattleRecord : null),
      lastSeason: o?.lastSeason ?? null,
      deadMoney: o?.deadMoney ?? [],
      identity,
      record: { wins: 0, losses: 0 },
    };
  });
}

const rosterStatusOf = (contract) => (contract?.twoWay ? 'two-way' : contract?.type === 'camp' ? 'camp' : 'standard');

function initialNews(date, seed, teams, career) {
  const team = teams.find((t) => t.id === career.teamId);
  const last = seed.history.lastSeason;
  const champion = teams.find((t) => t.id === last?.champion);
  const runnerUp = teams.find((t) => t.id === last?.runnerUp);
  const items = [
    {
      category: 'liga',
      title: 'NBA oficializa a expansão para 32 franquias',
      body: 'Seattle SuperSonics e Las Vegas Jokers entram na Conferência Oeste a partir de 2026-27. Seattle recupera nome, cores, títulos e números aposentados da franquia original. O Expansion Draft definirá os primeiros elencos: cada franquia protege 7 jogadores e pode perder no máximo 2.',
      teamIds: ['SEA', 'LVJ'],
    },
    {
      category: 'liga',
      title: 'Pelicans mudam para a Conferência Leste',
      body: 'Com duas novas equipes no Oeste, o New Orleans Pelicans passa a disputar a Conferência Leste. A liga fica com 16 franquias de cada lado, em quatro divisões de quatro.',
      teamIds: ['NOP'],
    },
  ];
  if (champion) {
    items.push({
      category: 'liga',
      title: `${champion.fullName} defende o título`,
      body: `Campeão de ${last.label} ao bater o ${runnerUp?.fullName ?? last.runnerUp} por ${last.finalsScore} nas finais, o ${champion.name} começa a temporada como o time a ser batido.`,
      teamIds: [champion.id],
    });
  }
  items.push({
    category: 'franquia',
    title: `${career.managerName} assume o ${team.fullName}`,
    body: `${career.managerName} é o novo ${ROLE_BY_ID[career.role].label.toLowerCase()} do ${team.name}. ${team.expansion ? 'A franquia ainda não tem elenco: tudo começa no Expansion Draft.' : `A torcida espera: ${team.fans.note}`}`,
    teamIds: [team.id],
  });
  return items.map((n, i) => ({ id: `news-${date}-${String(i).padStart(3, '0')}`, date, playerIds: [], source: 'Redação NBA Universe', ...n }));
}

/**
 * Popula um banco de save recém-criado.
 * @param options saída do assistente de nova carreira (ver career-options.js)
 * @returns resumo para o índice de saves
 */
/** Jogadores do seed já com atributos, tendências e Overall. Não depende de save (jogo rápido usa direto). */
export function buildPlayers(seed) {
  const ratings = new Map(seed.ratings.map((r) => [r.playerId, r]));
  const contractByPlayer = new Map(seed.contracts.map((c) => [c.playerId, c]));
  return seed.players.map((bio) => {
    const r = ratings.get(bio.id);
    if (!r) throw new Error(`Jogador ${bio.name} sem ratings no seed.`);
    return {
      ...bio,
      attributes: r.attributes,
      tendencies: r.tendencies,
      potential: r.potential,
      ovr: positionOverall(r.attributes, bio.positions[0]),
      ratingConfidence: r.confidence,
      sampleMinutes: r.sampleMinutes,
      rosterStatus: rosterStatusOf(contractByPlayer.get(bio.id)),
    };
  });
}

export async function createUniverse(db, saveId, options, seed) {
  const league = seed.league;
  const date = league.snapshotDate;
  const season = league.startSeason;
  const teams = buildTeams(seed);
  const userTeam = teams.find((t) => t.id === options.teamId);
  if (!userTeam) throw new Error('Escolha uma franquia para iniciar a carreira.');

  const careerRows = seed.career.players;
  const advanced = seed.advanced.players;
  const players = buildPlayers(seed);

  const coaches = seed.coaches.map((c) => ({ ...c }));
  const coachByTeam = new Map(coaches.map((c) => [c.teamId, c.id]));
  for (const t of teams) t.headCoachId = coachByTeam.get(t.id) ?? null;

  const official = new Map(seed.teams.map((t) => [t.id, t]));
  const arenas = teams.map((t) => {
    const src = official.get(t.id)?.arena ?? t.identity?.arena ?? {};
    return { id: t.arenaId, teamId: t.id, name: src.name ?? null, capacity: src.capacity ?? null, opened: src.opened ?? null, note: src.note ?? null };
  });
  const owners = teams.map((t) => {
    const own = t.identity?.ownership;
    return { id: t.ownerId, teamId: t.id, name: own?.name ?? official.get(t.id)?.owner ?? null, fictional: Boolean(own?.fictional), profile: own?.profile ?? null, note: own?.note ?? null };
  });

  const career = {
    managerName: options.managerName.trim(),
    mode: options.mode ?? 'universe',
    role: options.role,
    teamId: options.teamId,
    difficulty: options.difficulty,
    modifiers: options.difficulty === 'custom' ? options.modifiers : DIFFICULTY_BY_ID[options.difficulty].modifiers,
    systems: options.systems,
    capMode: options.capMode,
    careerLength: options.careerLength,
    godMode: Boolean(options.godMode),
    autoApproveAiTrades: options.autoApproveAiTrades !== false,
    startedOn: date,
    startSeason: season,
    history: [{ season, teamId: options.teamId, role: options.role, from: date }],
  };
  const calendar = { date, season, phase: 'preseason' };
  const news = initialNews(date, seed, teams, career);

  await bulkWrite(db, {
    meta: [
      { key: 'career', value: career },
      { key: 'calendar', value: calendar },
      { key: 'league', value: league },
      { key: 'history', value: seed.history },
      { key: 'seedInfo', value: { snapshotDate: seed.meta.snapshotDate, generatedAt: seed.meta.generatedAt, ratingModel: seed.meta.ratingModel.version, sources: seed.meta.sources } },
      { key: 'rng', value: { seed: saveId, state: null } },
    ],
    teams,
    players,
    contracts: seed.contracts.map((c) => ({ ...c })),
    careerStats: players.map((p) => ({ playerId: p.id, rows: careerRows[p.id] ?? [], advanced: advanced[p.id] ?? null })),
    coaches,
    owners,
    arenas,
    news,
    seasons: [{ season, label: league.startSeasonLabel, status: 'preseason', champion: null }],
  });

  return summarize(saveId, options.saveName, career, calendar, userTeam, new Date().toISOString(), starOf(players, userTeam.id));
}

/** Melhor jogador de um elenco, no formato mínimo que o resolver de fotos precisa. */
export function starOf(players, teamId) {
  let best = null;
  for (const p of players) if (p.teamId === teamId && (!best || p.ovr > best.ovr)) best = p;
  return best ? { id: best.id, espnId: best.espnId ?? null, name: best.name, ovr: best.ovr, position: best.positions?.[0] ?? null } : null;
}

export function summarize(saveId, name, career, calendar, team, createdAt, star = null) {
  return {
    star,
    id: saveId,
    name: name?.trim() || `${team.name} — ${career.managerName}`,
    managerName: career.managerName,
    role: career.role,
    teamId: team.id,
    teamName: team.fullName,
    teamColor: team.colors[0],
    season: calendar.season,
    date: calendar.date,
    godMode: career.godMode,
    mode: career.mode ?? 'universe',
    difficulty: career.difficulty,
    teamColor2: team.colors[1] ?? null,
    record: team.record ? { wins: team.record.wins, losses: team.record.losses } : null,
    createdAt,
    updatedAt: new Date().toISOString(),
  };
}
