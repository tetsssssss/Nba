// Opções de criação de carreira: cargos, dificuldades e sistemas configuráveis.
// Os multiplicadores são lidos pelos sistemas de jogo à medida que forem
// implementados (trades, contratos, lesões, scouting...).

export const ROLES = [
  { id: 'owner', label: 'Dono', description: 'Controle total: finanças, arena, contratação e demissão de toda a diretoria, além das decisões de basquete.', controls: ['finance', 'arena', 'frontOffice', 'roster', 'contracts', 'draft', 'trades', 'coaching'] },
  { id: 'president', label: 'Presidente', description: 'Responde ao dono. Comanda o orçamento, a estrutura da franquia e a diretoria de basquete.', controls: ['finance', 'frontOffice', 'roster', 'contracts', 'draft', 'trades'] },
  { id: 'pobo', label: 'Presidente de Operações de Basquete', description: 'Estratégia esportiva de longo prazo: elenco, draft, trades e escolha do técnico.', controls: ['roster', 'contracts', 'draft', 'trades', 'frontOffice'] },
  { id: 'gm', label: 'General Manager', description: 'Montagem do elenco no dia a dia: trades, contratos, free agency e draft, dentro do orçamento definido.', controls: ['roster', 'contracts', 'draft', 'trades'] },
  { id: 'coach', label: 'Técnico', description: 'Rotação, táticas, treino e gestão do vestiário. Opina em movimentações, mas não as decide.', controls: ['coaching'] },
];
export const ROLE_BY_ID = Object.fromEntries(ROLES.map((r) => [r.id, r]));

// 1 = neutro. Acima de 1 dificulta para o usuário; abaixo facilita.
export const DIFFICULTY_SYSTEMS = [
  { key: 'tradeDifficulty', label: 'Dificuldade de trades', tip: 'Quanto as outras franquias exigem em troca.' },
  { key: 'ownerDemands', label: 'Exigência dos proprietários', tip: 'Metas esportivas e financeiras cobradas de você.' },
  { key: 'playerTolerance', label: 'Tolerância dos jogadores', tip: 'Paciência com minutos, papel e promessas não cumpridas (maior = menos tolerantes).' },
  { key: 'scoutingNoise', label: 'Imprecisão do scouting', tip: 'Margem de erro das avaliações de prospects.' },
  { key: 'contractDemands', label: 'Negociação salarial', tip: 'Quanto agentes pedem acima do valor de mercado.' },
  { key: 'injuryRate', label: 'Lesões', tip: 'Frequência e gravidade de lesões.' },
  { key: 'developmentPenalty', label: 'Desenvolvimento', tip: 'Dificuldade de evolução dos seus jogadores.' },
  { key: 'aiGmSharpness', label: 'Comportamento dos GMs', tip: 'Qualidade das decisões das outras 31 diretorias.' },
  { key: 'budgetPressure', label: 'Capacidade financeira', tip: 'Aperto de orçamento e tolerância à luxury tax.' },
  { key: 'freeAgentReluctance', label: 'Atração de free agents', tip: 'Resistência de free agents em assinar com você.' },
];

const preset = (v) => Object.fromEntries(DIFFICULTY_SYSTEMS.map((s) => [s.key, v]));

export const DIFFICULTIES = [
  { id: 'casual', label: 'Casual', description: 'Para explorar o universo sem pressão. A IA é generosa e os riscos são baixos.', modifiers: preset(0.6) },
  { id: 'easy', label: 'Fácil', description: 'Margem de erro confortável enquanto você aprende os sistemas.', modifiers: preset(0.8) },
  { id: 'normal', label: 'Normal', description: 'Experiência equilibrada: a liga reage de forma plausível.', modifiers: preset(1) },
  { id: 'realistic', label: 'Realista', description: 'GMs competentes, donos exigentes e mercado difícil — como na NBA.', modifiers: preset(1.2) },
  { id: 'hardcore', label: 'Hardcore', description: 'Nada é dado. Erros de gestão custam o cargo.', modifiers: preset(1.45) },
  { id: 'custom', label: 'Customizado', description: 'Ajuste cada sistema individualmente e ative ou desative o que quiser.', modifiers: preset(1) },
];
export const DIFFICULTY_BY_ID = Object.fromEntries(DIFFICULTIES.map((d) => [d.id, d]));

// Sistemas que o modo Customizado permite desligar.
export const TOGGLEABLE_SYSTEMS = [
  { key: 'injuries', label: 'Lesões' },
  { key: 'fatigue', label: 'Fadiga e load management' },
  { key: 'morale', label: 'Moral, promessas e pedidos de troca' },
  { key: 'finances', label: 'Finanças e pressão do proprietário' },
  { key: 'jobSecurity', label: 'Segurança do emprego (demissões)' },
  { key: 'scoutingFog', label: 'Incerteza do scouting' },
  { key: 'aiTrades', label: 'Trades entre franquias da IA' },
  { key: 'leagueVotes', label: 'Votações da liga (regras, expansão, relocação)' },
];

export function defaultCareerOptions() {
  return {
    saveName: '',
    managerName: '',
    mode: 'universe', // ver core/modes.js
    role: 'gm',
    teamId: null,
    difficulty: 'normal',
    modifiers: preset(1),
    systems: Object.fromEntries(TOGGLEABLE_SYSTEMS.map((s) => [s.key, true])),
    capMode: 'full',
    careerLength: 10,
    godMode: false,
    autoApproveAiTrades: true,
  };
}
