// Fases de desenvolvimento do projeto. A interface usa esta lista para marcar,
// de forma explícita, o que ainda não existe ("Fase N") — nenhum botão finge funcionar.

export const PHASES = [
  {
    id: 1, title: 'Fundação', status: 'done',
    items: ['Shell do aplicativo e navegação', 'Banco de dados IndexedDB com múltiplos saves e autosave', '32 franquias (expansão com Seattle e Las Vegas, conferências 16/16)', 'Banco de jogadores reais com 45 atributos e tendências', 'Sistema central de fotos com auditoria'],
  },
  {
    id: 2, title: 'Elenco, contratos e trades', status: 'partial',
    items: ['Elenco, depth chart automático e perfil do jogador ✔', 'Contratos reais ano a ano, folha salarial e linhas de cap ✔', 'Dispensas, renovações e negociação com agentes', 'Trade Machine (multi-times, picks, swaps, salary matching)', 'IA de trades e 15 estilos de GM'],
  },
  {
    id: 3, title: 'Expansão e Draft', status: 'partial',
    items: ['Expansion Draft automático na véspera da noite de abertura (7 protegidos, máx. 2 perdidos) ✔', 'Listas de protegidos escolhidas pelo usuário', 'Expansion Draft interativo com acordos laterais', 'Picks de draft reais e proteções', 'Prospects reais de 2027, Big Board, Mock Drafts e scouting com margem de erro', 'Combine, workouts e Draft Night', 'Free agency'],
  },
  {
    id: 4, title: 'Calendário e simulação', status: 'partial',
    items: ['Calendário de 32 equipes: 82 jogos por franquia ✔', 'Avançar dia e simular até um marco ✔', 'Simulação estatística das partidas da liga ✔', 'Jogo oficial do usuário no motor 2D valendo para a campanha ✔', 'Classificação por conferência, líderes e box scores ✔', 'Play-in, playoffs e prêmios', 'Virada de temporada (offseason)'],
  },
  {
    id: 5, title: 'Motor de partida 2D', status: 'partial',
    items: ['Simulação espacial separada do Canvas: aceleração, mudança de direção, colisão suave e spacing ✔', 'Bola física (x, y, z): drible, passes com antecipação, interceptação, arco de arremesso e rebote ✔', 'IA: decisão por pontuação, movimentação sem bola, bloqueios, pick and roll, post, ajuda, closeout e transição ✔', 'Câmeras, velocidades 0,75x-8x, simular até eventos, pausa/passo, Debug e Sandbox ✔', 'Narração play-by-play contextual ✔', 'Integração com calendário/carreira, controle tático do técnico e timeouts'],
  },
  {
    id: 6, title: 'Táticas, rotações e IA avançada', status: 'todo',
    items: ['Rotação de 240 minutos e quintetos', 'Playbook e esquemas defensivos', 'Técnicos e staff com atributos', 'Treino, fadiga, lesões detalhadas e load management', 'Desenvolvimento e regressão de jogadores'],
  },
  {
    id: 7, title: 'Imprensa, relações e narrativas', status: 'todo',
    items: ['Jornalistas, rumores e entrevistas', 'Personalidades, vestiário e relacionamentos', 'Promessas, moral e pedidos de troca', 'Rivalidades dinâmicas e cultura de torcida'],
  },
  {
    id: 8, title: 'Finanças e universo de longo prazo', status: 'todo',
    items: ['Receitas, ingressos, patrocínios e luxury tax', 'Arenas: reforma, ampliação e nova arena', 'Proprietários e segurança do emprego', 'Votações da liga, nova expansão e relocação', 'História completa navegável após 10 temporadas'],
  },
];

export const PHASE_STATUS_LABEL = { done: 'Concluída', partial: 'Em andamento', todo: 'Planejada' };
