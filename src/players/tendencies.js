// Catálogo de tendências (0-100): COMO o jogador joga, não o quão bem.
// Os valores iniciais vêm de frequências reais (play types, tracking, zonas de
// arremesso). O motor 2D usa estas tendências para escolher ações.

export const TENDENCY_GROUPS = [
  {
    id: 'shot',
    label: 'Seleção de arremesso',
    tendencies: [
      { key: 'threePointFreq', label: 'Arremessar de 3', tip: 'Parcela dos arremessos que saem de três pontos.' },
      { key: 'rimAttackFreq', label: 'Atacar o aro', tip: 'Parcela dos arremessos na área restrita.' },
      { key: 'midRangeFreq', label: 'Meia distância', tip: 'Parcela dos arremessos de meia distância.' },
      { key: 'pullUpFreq', label: 'Pull-up', tip: 'Arremessos após o drible.' },
      { key: 'catchShootFreq', label: 'Catch and shoot', tip: 'Arremessos recebendo o passe, sem driblar.' },
      { key: 'stepbackFreq', label: 'Stepback', tip: 'Estimativa a partir do volume de pull-ups de três.' },
      { key: 'drawFoul', label: 'Buscar a falta', tip: 'Lances livres tentados por arremesso.' },
    ],
  },
  {
    id: 'play',
    label: 'Tipos de jogada',
    tendencies: [
      { key: 'isoFreq', label: 'Isolação', tip: 'Frequência de posses em isolação.' },
      { key: 'postUpFreq', label: 'Post-up', tip: 'Frequência de posses de costas para a cesta.' },
      { key: 'pnrHandlerFreq', label: 'Pick and roll (condutor)', tip: 'Posses conduzindo o pick and roll.' },
      { key: 'pnrRollFreq', label: 'Pick and roll (bloqueador)', tip: 'Posses como bloqueador que rola ou abre.' },
      { key: 'transitionFreq', label: 'Transição', tip: 'Posses em contra-ataque.' },
      { key: 'cutFreq', label: 'Cortar sem bola', tip: 'Posses finalizadas em cortes.' },
      { key: 'offScreenFreq', label: 'Sair de bloqueios', tip: 'Posses saindo de bloqueios sem bola.' },
      { key: 'handoffFreq', label: 'Hand-off', tip: 'Posses recebendo a bola em mão a mão.' },
      { key: 'spotUpFreq', label: 'Spot-up', tip: 'Posses parado esperando o passe.' },
      { key: 'putbackFreq', label: 'Putback', tip: 'Posses em rebote ofensivo com finalização.' },
      { key: 'driveFreq', label: 'Infiltrar', tip: 'Infiltrações por 36 minutos (percentil na liga).' },
    ],
  },
  {
    id: 'ball',
    label: 'Com a bola',
    tendencies: [
      { key: 'passFirst', label: 'Priorizar o passe', tip: 'Passes por toque e parcela de assistências.' },
      { key: 'extraPass', label: 'Passe extra', tip: 'Assistências secundárias (o passe antes do passe).' },
      { key: 'driveAndKick', label: 'Infiltrar e abrir', tip: 'Parcela das infiltrações que terminam em passe.' },
      { key: 'holdBall', label: 'Segurar a bola', tip: 'Segundos por toque.' },
      { key: 'dribbleHeavy', label: 'Driblar muito', tip: 'Dribles por toque.' },
      { key: 'pushPace', label: 'Acelerar o ritmo', tip: 'Volume de transição e pontos de contra-ataque.' },
      { key: 'crashOffensiveGlass', label: 'Atacar o rebote ofensivo', tip: 'Chances de rebote ofensivo disputadas.' },
      { key: 'lookForStar', label: 'Procurar a estrela', tip: 'Baixo uso próprio + muito passe. Será relativo aos companheiros na simulação.' },
    ],
  },
  {
    id: 'defense',
    label: 'Defesa',
    tendencies: [
      { key: 'contestShots', label: 'Contestar arremessos', tip: 'Arremessos contestados por 36 minutos.' },
      { key: 'gambleForSteals', label: 'Buscar o roubo', tip: 'Roubos e deflexões.' },
      { key: 'blockAttempts', label: 'Buscar o toco', tip: 'Tocos e contestações de dois pontos.' },
      { key: 'takeCharges', label: 'Cavar faltas de ataque', tip: 'Cargas ofensivas cavadas.' },
      { key: 'foulProne', label: 'Cometer faltas', tip: 'Faltas pessoais por 36 minutos.' },
    ],
  },
  {
    id: 'clutch',
    label: 'Momentos decisivos',
    tendencies: [
      { key: 'clutchShotTaking', label: 'Chamar o arremesso no clutch', tip: 'Volume de arremessos nos minutos finais comparado ao resto do jogo.' },
      { key: 'clutchPassing', label: 'Passar no clutch', tip: 'Parcela de criação para companheiros nos minutos finais.' },
    ],
  },
];

export const TENDENCIES = TENDENCY_GROUPS.flatMap((g) => g.tendencies.map((t) => ({ ...t, group: g.id })));
export const TENDENCY_KEYS = TENDENCIES.map((t) => t.key);
