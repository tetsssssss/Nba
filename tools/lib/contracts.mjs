// Monta o contrato inicial de cada jogador.
// Prioridade de fonte: HoopsHype (ano a ano, com opções) → ESPN (salário atual +
// anos restantes) → estimativa do jogo (marcada como tal para validação).
import { normalizeName } from './names.mjs';

const START_YEAR = 2026; // HoopsHype identifica 2026-27 como 2026; o jogo usa o ano final (2027)

/** Map<teamId, Map<nomeNormalizado, entrada>> com os compromissos de 2026-27 em diante. */
export function indexHoopsHype(contractsByTeam) {
  const byTeam = new Map();
  for (const [teamId, list] of contractsByTeam) {
    const entries = new Map();
    for (const c of list ?? []) {
      const seasons = c.seasons.filter((s) => s.season >= START_YEAR).sort((a, b) => a.season - b.season);
      if (seasons.length) entries.set(normalizeName(c.playerName), { name: c.playerName, updated: c.updateDate, seasons });
    }
    byTeam.set(teamId, entries);
  }
  return byTeam;
}

/** Contrato ativo a partir de uma entrada (anos dispensados/terminados ficam de fora). */
export function fromHoopsHype(entry) {
  const years = [];
  let qualifyingOffer = null;
  for (const s of entry.seasons) {
    if (s.terminated) continue;
    if (s.qualifyingOffer) {
      qualifyingOffer = { season: s.season + 1, amount: s.salary };
      continue;
    }
    const year = { season: s.season + 1, salary: s.salary, option: s.playerOption ? 'player' : s.teamOption ? 'team' : null };
    // valor que conta para o cap quando difere do salário (ex.: veterano no mínimo, two-way)
    if (s.capAllocation != null && s.capAllocation !== s.salary) year.capHit = s.capAllocation;
    years.push(year);
  }
  if (!years.length) return null;
  return {
    years,
    qualifyingOffer,
    twoWay: entry.seasons.some((s) => s.twoWayContract && s.season === START_YEAR),
    source: 'hoopshype',
    sourceUpdated: entry.updated?.slice(0, 10) ?? null,
  };
}

/**
 * Compromisso na folha de um time por um jogador que não está no elenco oficial dele:
 * dispensa, stretch ou buyout. Conta para o cap pelo valor alocado.
 */
export function deadMoneyFrom(entry) {
  const years = entry.seasons.filter((s) => !s.qualifyingOffer && (s.capAllocation ?? s.salary) > 0).map((s) => ({ season: s.season + 1, amount: s.capAllocation ?? s.salary }));
  if (!years.length) return null;
  return { name: entry.name, years, confirmed: entry.seasons.some((s) => s.terminated) };
}

export function fromEspn(athlete) {
  const c = athlete?.contract;
  if (!c?.active || c.season?.year !== START_YEAR + 1 || !c.salary) return null;
  const count = Math.max(1, c.yearsRemaining ?? 1);
  const years = Array.from({ length: count }, (_, i) => ({ season: START_YEAR + 1 + i, salary: Math.round(c.salary * Math.pow(1.05, i)), option: null, estimated: i > 0 }));
  return { years, qualifyingOffer: null, twoWay: false, source: 'espn', sourceNote: 'Salário atual oficial; anos futuros estimados com +5% a.a. e sem informação de opções.' };
}

/** Sem contrato em nenhuma fonte: tratado como convite de training camp (mínimo, não garantido). */
export function estimated(player, league) {
  const scale = league.cap.minimumSalaryScale.byYearsOfService;
  const salary = scale[Math.min(player.exp ?? 0, scale.length - 1)];
  return {
    years: [{ season: START_YEAR + 1, salary, option: null, estimated: true }],
    qualifyingOffer: null,
    twoWay: false,
    guaranteed: false,
    source: 'estimated',
    sourceNote: 'Sem contrato nas fontes consultadas. Assumido contrato mínimo não garantido (training camp).',
  };
}

export function classify(contract, player) {
  if (contract.twoWay) return 'two-way';
  if (contract.source === 'estimated') return 'camp';
  const draftYear = player.draft?.year;
  if (player.draft?.round === 1 && draftYear && draftYear >= START_YEAR - 3) return 'rookie-scale';
  return 'standard';
}
