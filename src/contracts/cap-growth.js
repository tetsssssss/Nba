// Crescimento do salary cap entre temporadas. Os números de 2026-27 em league.json são OFICIAIS; os anos
// seguintes são PROJEÇÃO do jogo (cresce `league.cap.annualGrowth`, padrão 6% ao ano, como o teto de 7% da NBA).
// Contratos já assinados não mudam (salários são nominais, como na realidade).
import { markDirty } from '../core/world.js';

const SCALED_KEYS = ['salaryCap', 'luxuryTax', 'firstApron', 'secondApron', 'minimumTeamSalary', 'tradeCashLimit', 'estimatedAverageSalary', 'twoWaySalary'];

export function advanceLeagueCap(world, toSeason) {
  const cap = world.league.cap;
  cap.history ??= [];
  if (cap.history.some((h) => h.season === toSeason - 1) || cap.currentSeason === toSeason) return false;
  const growth = cap.annualGrowth ?? 0.06;
  cap.history.push({ season: cap.currentSeason ?? world.league.startSeason, label: cap.season, salaryCap: cap.salaryCap, luxuryTax: cap.luxuryTax, firstApron: cap.firstApron, secondApron: cap.secondApron, source: cap.source });
  const scale = (v) => Math.round(v * (1 + growth) / 1000) * 1000;
  for (const key of SCALED_KEYS) if (typeof cap[key] === 'number') cap[key] = scale(cap[key]);
  for (const group of ['exceptions', 'maxSalary']) if (cap[group]) for (const k of Object.keys(cap[group])) cap[group][k] = scale(cap[group][k]);
  if (cap.minimumSalaryScale?.byYearsOfService) cap.minimumSalaryScale.byYearsOfService = cap.minimumSalaryScale.byYearsOfService.map(scale);
  if (cap.rookieScale) cap.rookieScale.firstYearPick1 = scale(cap.rookieScale.firstYearPick1);
  cap.currentSeason = toSeason;
  cap.season = `${toSeason - 1}-${String(toSeason % 100).padStart(2, '0')}`;
  cap.projected = true;
  cap.annualGrowth = growth;
  cap.projectionNote = `Projeção do jogo: +${Math.round(growth * 100)}% ao ano sobre os números oficiais de 2026-27.`;
  markDirty('meta', 'league');
  return true;
}
