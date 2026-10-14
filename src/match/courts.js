// Identidade visual da quadra de cada franquia, no estilo 2D clássico das transmissões:
// tom e padrão da madeira, cor do garrafão, faixa externa, área tingida dentro do arco e textos.
//
// ATENÇÃO — precisa de validação: os temas abaixo são INSPIRADOS nos pisos clássicos das franquias
// (parquet de Boston, garrafão dourado dos Lakers, espinha de peixe do Brooklyn…), montados de
// memória a partir das cores oficiais. Não são reproduções exatas de um piso de uma temporada
// específica. Seattle usa as cores históricas dos SuperSonics; Las Vegas é criação do jogo.

/** Padrões de madeira: 'planks' (tábuas longas), 'parquet' (painéis alternados), 'herringbone' (espinha de peixe). */
const OVERRIDES = {
  ATL: { apron: '#E03A3E', paint: '#E03A3E', trim: '#C1D32F' },
  BOS: { wood: 'parquet', floor: '#c8a165', apron: '#007A33', paint: '#007A33', trim: '#ffffff' },
  BKN: { wood: 'herringbone', floor: '#b4ada1', apron: '#000000', paint: '#1a1a1a', trim: '#ffffff', center: '#000000' },
  CHA: { apron: '#1D1160', paint: '#00788C', trim: '#ffffff' },
  CHI: { apron: '#000000', paint: '#CE1141', trim: '#ffffff', center: '#CE1141' },
  CLE: { apron: '#860038', paint: '#860038', trim: '#FDBB30', stain: 'rgba(120, 60, 20, 0.14)' },
  DAL: { apron: '#00538C', paint: '#00538C', trim: '#B8C4CA' },
  DEN: { apron: '#0E2240', paint: '#0E2240', trim: '#FEC524', stain: 'rgba(110, 70, 20, 0.14)' },
  DET: { apron: '#1D42BA', paint: '#C8102E', trim: '#ffffff' },
  GSW: { apron: '#1D428A', paint: '#1D428A', trim: '#FFC72C', center: '#FFC72C' },
  HOU: { apron: '#CE1141', paint: '#CE1141', trim: '#ffffff' },
  IND: { apron: '#002D62', paint: '#002D62', trim: '#FDBB30' },
  LAC: { apron: '#1D428A', paint: '#C8102E', trim: '#ffffff' },
  LAL: { floor: '#d1a565', apron: '#552583', paint: '#FDB927', trim: '#552583', center: '#FDB927' },
  MEM: { apron: '#12173F', paint: '#5D76A9', trim: '#F5B112', stain: 'rgba(90, 60, 30, 0.12)' },
  MIA: { apron: '#000000', paint: '#98002E', trim: '#F9A01B' },
  MIL: { floor: '#d6b481', apron: '#00471B', paint: '#00471B', trim: '#EEE1C6', stain: 'rgba(120, 80, 30, 0.16)' },
  MIN: { apron: '#0C2340', paint: '#0C2340', trim: '#78BE20' },
  NOP: { apron: '#0C2340', paint: '#0C2340', trim: '#C8102E' },
  NYK: { floor: '#cba366', apron: '#006BB6', paint: '#006BB6', trim: '#F58426', center: '#F58426' },
  OKC: { apron: '#007AC1', paint: '#007AC1', trim: '#EF3B24' },
  ORL: { wood: 'parquet', apron: '#0077C0', paint: '#0077C0', trim: '#C4CED4' },
  PHI: { apron: '#006BB6', paint: '#006BB6', trim: '#ED174C' },
  PHX: { apron: '#E56020', paint: '#1D1160', trim: '#E56020', stain: 'rgba(130, 70, 20, 0.12)' },
  POR: { apron: '#000000', paint: '#E03A3E', trim: '#ffffff', stain: 'rgba(90, 55, 25, 0.12)' },
  SAC: { apron: '#5A2D81', paint: '#5A2D81', trim: '#63727A' },
  SAS: { floor: '#d2b07a', apron: '#000000', paint: '#111111', trim: '#C4CED4', center: '#000000' },
  TOR: { apron: '#000000', paint: '#CE1141', trim: '#ffffff' },
  UTA: { apron: '#4E2A84', paint: '#4E2A84', trim: '#6CAEDF', stain: 'rgba(100, 65, 25, 0.13)' },
  WAS: { apron: '#002B5C', paint: '#E31837', trim: '#ffffff' },
  SEA: { floor: '#cfa767', apron: '#00653A', paint: '#00653A', trim: '#FFC200', center: '#FFC200' },
  LVJ: { floor: '#c39a63', apron: '#0D0B14', paint: '#7B2CFF', trim: '#F2C14E', center: '#0D0B14', stain: 'rgba(60, 20, 110, 0.10)' },
};

/** Tema da quadra do mandante. Franquia desconhecida (sandbox, testes) recebe um tema neutro pelas próprias cores. */
export function courtTheme(team) {
  const c1 = team?.colors?.[0] ?? '#7a3c1e';
  const c2 = team?.colors?.[1] ?? '#ffffff';
  const o = OVERRIDES[team?.id] ?? {};
  const info = team?.team ?? team;
  return {
    wood: o.wood ?? 'planks',
    floor: o.floor ?? '#c79f68',
    apron: o.apron ?? c1,
    paint: o.paint ?? c1,
    trim: o.trim ?? c2,
    center: o.center ?? o.paint ?? c1,
    stain: o.stain ?? null,
    baseline: (info?.name ?? team?.name ?? team?.id ?? '').toUpperCase(),
    sideline: (info?.city ?? '').toUpperCase(),
    crowd: [o.apron ?? c1, o.trim ?? c2],
  };
}
