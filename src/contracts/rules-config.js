// Regras configuráveis da liga com valores-padrão. Saves antigos não têm os blocos novos de league.json
// (trade.rules, draft); o código usa estes padrões, que espelham o arquivo.
import { addDays } from '../ui/format.js';

export const DEFAULT_TRADE_RULES = {
  needsValidation: true,
  matching: {
    basic: { pct: 1.0, plus: 0 },
    intermediate: { pct: 1.25, plus: 100000 },
    advanced: { pct: 2.0, plus: 250000 },
    full: { pct: 2.0, plus: 250000 },
  },
  firstApronMatching: { pct: 1.1, plus: 100000 },
  secondApronMatching: { pct: 1.0, plus: 0 },
  secondApronNoAggregation: true,
  secondApronNoCash: true,
  tradeExceptionValidDays: 365,
  tradeExceptionAllowance: 100000,
  recentSigningLockDays: 90,
  recentSigningEarliest: '12-15',
  deadlineDaysBeforeAllStar: 7,
  stepien: true,
  frozenPickSeasonsOut: 6,
};

export const DEFAULT_DRAFT_RULES = {
  lotteryTeams: 14,
  lotteryDraws: 4,
  lotteryOdds: [140, 140, 140, 125, 105, 90, 75, 60, 45, 30, 20, 15, 10, 5],
  secondsPerPick: 120,
  rookieScaleYears: 4,
  rookieGuaranteedYears: 2,
};

const merge = (base, extra) => {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return extra ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(extra)) out[k] = base && typeof base[k] === 'object' && !Array.isArray(base[k]) ? merge(base[k], v) : v;
  return out;
};

export const tradeRules = (world) => merge(DEFAULT_TRADE_RULES, world.league.trade?.rules);
export const draftRules = (world) => merge(DEFAULT_DRAFT_RULES, world.league.draft);

/** Data-limite de trocas da temporada: N dias antes do início do All-Star break (decisão de design editável). */
export function tradeDeadline(world) {
  const explicit = world.league.trade?.deadline;
  if (explicit) return explicit;
  const allStar = world.league.calendar?.allStarBreak?.[0];
  return allStar ? addDays(allStar, -tradeRules(world).deadlineDaysBeforeAllStar) : null;
}

/**
 * Temporada cujo salary cap vale hoje. Entre o fim da temporada e o início do novo ano de liga (offseason,
 * antes das decisões de contrato) vale a que terminou; depois disso, a próxima.
 */
export function capSeason(world) {
  return world.offseason?.leagueYearStarted && world.calendar.phase === 'offseason' ? world.calendar.season + 1 : world.calendar.season;
}
