// Modos de jogo: as portas de entrada do NBA Universe Manager.
// `status` é honesto: 'functional' (completo no que promete), 'partial' (jogável, mas
// depende de sistemas ainda não implementados) ou 'planned' (só reservado na arquitetura).

export const GAME_MODES = [
  {
    id: 'universe', kind: 'career', status: 'partial', label: 'NBA Universe', icon: 'league',
    tagline: 'O modo completo',
    description: 'Carreira de até 10 temporadas num universo persistente de 32 franquias. Você escolhe o cargo, do dono ao técnico, e responde por tudo o que ele controla.',
    missing: 'Calendário e temporada regular disponíveis. Mercado de jogadores e Draft profissional ainda não estão completos.',
    career: { roles: ['owner', 'president', 'pobo', 'gm', 'coach'], defaultRole: 'gm', godMode: false },
  },
  {
    id: 'franchise', kind: 'career', status: 'partial', label: 'Franchise', icon: 'roster',
    tagline: 'Uma franquia, do elenco à quadra',
    description: 'Você é GM e técnico de uma única franquia: monta o elenco e comanda o time nas partidas. Sem responsabilidades de dono, sem God Mode.',
    missing: 'Mercado e gestão fora de quadra em desenvolvimento; use a temporada regular para acompanhar resultados.',
    career: { roles: ['gm'], defaultRole: 'gm', godMode: false, lockGodMode: true },
  },
  {
    id: 'coach', kind: 'career', status: 'partial', label: 'Coach Mode', icon: 'tactics',
    tagline: 'Só a quadra importa',
    description: 'Você é o técnico: escalação, rotação, táticas e a partida 2D. Contratos, cap e mercado saem do seu menu — a diretoria (IA) cuida disso.',
    missing: 'A diretoria controlada pela IA ainda não negocia: o elenco permanece o inicial.',
    career: { roles: ['coach'], defaultRole: 'coach', godMode: false, lockGodMode: true, hide: ['cap', 'market', 'talent'] },
  },
  {
    id: 'commissioner', kind: 'career', status: 'partial', label: 'Commissioner', icon: 'dev',
    tagline: 'As regras são suas',
    description: 'God Mode como modo de jogo: navegue pelo universo, edite jogadores, mova atletas entre times e assuma o controle de qualquer franquia a qualquer momento. As regras normais podem ser quebradas.',
    missing: 'Forçar trades e editar contratos chegam com os sistemas de mercado (Fase 2).',
    career: { roles: ['owner', 'president', 'pobo', 'gm', 'coach'], defaultRole: 'gm', godMode: true, switchTeams: true },
  },
  {
    id: 'quick', kind: 'instant', status: 'functional', label: 'Jogo rápido', icon: 'court', path: '/play/quick',
    tagline: 'Dois times, uma partida',
    description: 'Escolha mandante e visitante e jogue agora no motor 2D, comandando um dos times. Não altera nenhuma carreira.',
  },
  {
    id: 'spectator', kind: 'instant', status: 'functional', label: 'Espectador', icon: 'eye', path: '/play/spectator',
    tagline: 'A IA joga, você assiste',
    description: 'A IA comanda os dois times. Você controla câmera, velocidade e acompanha as estatísticas.',
  },
  {
    id: 'sandbox', kind: 'instant', status: 'functional', label: 'Sandbox 2D', icon: 'depth', path: '/play/sandbox',
    tagline: 'Laboratório de uma posse',
    description: 'Monte uma situação — isolação, pick and roll, post-up, contra-ataque —, escolha atacante, defensor, cobertura e ação, e repita com a mesma semente.',
  },
  { id: 'expansion', kind: 'future', status: 'planned', label: 'Expansion Mode', icon: 'expansion', tagline: 'Fase 3', description: 'Monte Seattle ou Las Vegas do zero no Expansion Draft.' },
  { id: 'draft', kind: 'future', status: 'planned', label: 'Draft Mode', icon: 'draft', tagline: 'Fase 3', description: 'Só a noite do Draft: big board, trocas de pick e escolhas.' },
  { id: 'playoffs', kind: 'future', status: 'planned', label: 'Playoff Mode', icon: 'standings', tagline: 'Fase 4', description: 'Comece direto no mata-mata com as 16 classificadas.' },
];

export const MODE_BY_ID = Object.fromEntries(GAME_MODES.map((m) => [m.id, m]));
export const CAREER_MODES = GAME_MODES.filter((m) => m.kind === 'career');
export const STATUS_LABEL = { functional: 'Funcional', partial: 'Parcial', planned: 'Planejado' };

/** Regras do modo da carreira aberta (saves antigos, sem modo gravado, são NBA Universe). */
export const careerRules = (career) => (MODE_BY_ID[career?.mode] ?? MODE_BY_ID.universe).career;

/** O usuário, neste modo e cargo, enxerga a área de menu `area` ('cap' | 'market' | 'talent')? */
export const modeShows = (career, area) => !careerRules(career).hide?.includes(area);
