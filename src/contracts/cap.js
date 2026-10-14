// Folha salarial e situação de cap de uma franquia.
// Convenção de temporada em todo o jogo: o ANO FINAL (2027 = temporada 2026-27).

export const seasonLabel = (season) => `${season - 1}-${String(season % 100).padStart(2, '0')}`;

export const salaryIn = (contract, season) => contract?.years.find((y) => y.season === season)?.salary ?? 0;

/**
 * Valor que conta para o cap. Normalmente é o próprio salário; difere, por exemplo,
 * em veteranos no mínimo (a liga reembolsa a diferença) e em contratos two-way.
 */
export function capHitIn(contract, season) {
  const year = contract?.years.find((y) => y.season === season);
  return year ? year.capHit ?? year.salary : 0;
}

/** Resumo de um contrato visto a partir de `season`. */
export function contractSummary(contract, season) {
  if (!contract) return null;
  const remaining = contract.years.filter((y) => y.season >= season);
  const last = remaining.at(-1);
  return {
    salary: salaryIn(contract, season),
    yearsLeft: remaining.length,
    total: remaining.reduce((a, y) => a + y.salary, 0),
    endSeason: last?.season ?? null,
    expiring: remaining.length === 1,
    finalOption: last?.option ?? null,
    estimated: contract.source === 'estimated' || remaining.some((y) => y.estimated),
  };
}

/** Quais linhas de teto o modo de cap escolhido na carreira utiliza. */
export function capLines(capMode) {
  return {
    luxuryTax: capMode !== 'basic',
    aprons: capMode === 'advanced' || capMode === 'full',
  };
}

/**
 * @param roster   jogadores da franquia
 * @param contracts Map<playerId, contrato>
 * @param team     registro da franquia (para dead money)
 * @param cap      regras financeiras da liga (league.cap)
 */
export function teamPayroll(roster, contracts, team, cap, season, capMode = 'full') {
  let live = 0;
  let twoWay = 0;
  let estimated = 0;
  let standardCount = 0;
  let twoWayCount = 0;
  for (const player of roster) {
    const contract = contracts.get(player.id);
    if (contract?.twoWay) {
      twoWay += salaryIn(contract, season); // two-way não conta para o cap
      twoWayCount++;
      continue;
    }
    const hit = capHitIn(contract, season);
    standardCount++;
    live += hit;
    if (contract?.source === 'estimated') estimated += hit;
  }
  const dead = (team?.deadMoney ?? []).reduce((a, d) => a + (d.years.find((y) => y.season === season)?.amount ?? 0), 0);
  const total = live + dead;
  const lines = capLines(capMode);
  let status = total <= cap.salaryCap ? 'under-cap' : 'over-cap';
  if (lines.luxuryTax && total > cap.luxuryTax) status = 'tax';
  if (lines.aprons && total > cap.firstApron) status = 'first-apron';
  if (lines.aprons && total > cap.secondApron) status = 'second-apron';
  return {
    season, live, dead, twoWay, total, estimated, standardCount, twoWayCount,
    capSpace: cap.salaryCap - total,
    taxRoom: cap.luxuryTax - total,
    firstApronRoom: cap.firstApron - total,
    secondApronRoom: cap.secondApron - total,
    status,
  };
}

export const CAP_STATUS_LABEL = {
  'under-cap': 'Abaixo do cap',
  'over-cap': 'Acima do cap',
  tax: 'Na luxury tax',
  'first-apron': 'Acima do 1º apron',
  'second-apron': 'Acima do 2º apron',
};

export const CONTRACT_TYPE_LABEL = {
  standard: 'Padrão',
  'rookie-scale': 'Escala de novato',
  'two-way': 'Two-way',
  camp: 'Training camp (não garantido)',
};

// ------------------------------------------------------------------ luxury tax (prompt mestre: Finanças)
/** Faixas de US$ 5 mi acima da linha do imposto. Valores do CBA de 2023 reproduzidos de memória: marcados como ESTIMADOS (needsValidation). */
export const TAX_BRACKET = 5000000;
const TAX_RATES = [1.5, 1.75, 2.5, 3.25];
const REPEATER_RATES = [2.5, 2.75, 3.5, 4.25];

/**
 * Imposto de luxo devido sobre uma folha. `repeater`: pagou imposto em 3 das 4 últimas temporadas.
 * Nos modos de cap sem luxury tax (basic) devolve 0.
 */
export function luxuryTaxBill(total, cap, { repeater = false, capMode = 'full' } = {}) {
  if (!capLines(capMode).luxuryTax) return 0;
  let over = Math.max(0, total - cap.luxuryTax);
  if (!over) return 0;
  const rates = repeater ? REPEATER_RATES : TAX_RATES;
  let bill = 0;
  for (let i = 0; over > 0; i++) {
    const slice = Math.min(over, TAX_BRACKET);
    const rate = i < rates.length ? rates[i] : rates.at(-1) + 0.5 * (i - rates.length + 1);
    bill += slice * rate;
    over -= slice;
  }
  return Math.round(bill);
}

/** Linhas de cap por cima de um valor de folha (útil para mensagens). */
export function capSituation(total, cap, capMode = 'full') {
  const lines = capLines(capMode);
  let status = total <= cap.salaryCap ? 'under-cap' : 'over-cap';
  if (lines.luxuryTax && total > cap.luxuryTax) status = 'tax';
  if (lines.aprons && total > cap.firstApron) status = 'first-apron';
  if (lines.aprons && total > cap.secondApron) status = 'second-apron';
  return status;
}
