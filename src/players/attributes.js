// Catálogo dos 45 atributos de jogador (escala 0-100), em cinco grupos.
// É a única fonte de nomes/rótulos de atributos: UI, ratings e motor leem daqui.

export const ATTRIBUTE_GROUPS = [
  {
    id: 'offense',
    label: 'Ataque',
    attributes: [
      { key: 'rimFinishing', label: 'Finalização no aro', tip: 'Converter perto da cesta contra contato e proteção de aro.' },
      { key: 'layup', label: 'Bandeja', tip: 'Toque, ângulos e finalizações acrobáticas em infiltrações.' },
      { key: 'dunk', label: 'Enterrada', tip: 'Capacidade de finalizar por cima do aro.' },
      { key: 'postScoring', label: 'Jogo de costas', tip: 'Pontuar no post: ganchos, giros e fadeaways.' },
      { key: 'midRange', label: 'Meia distância', tip: 'Arremessos de dois fora do garrafão, incluindo floaters.' },
      { key: 'threePoint', label: 'Arremesso de 3', tip: 'Precisão de três pontos ponderada por volume.' },
      { key: 'freeThrow', label: 'Lance livre', tip: 'Aproveitamento na linha de lance livre.' },
      { key: 'pullUp', label: 'Pull-up', tip: 'Arremessar após o drible.' },
      { key: 'catchAndShoot', label: 'Catch and shoot', tip: 'Arremessar recebendo o passe, sem driblar.' },
      { key: 'shotCreation', label: 'Criação de arremesso', tip: 'Gerar o próprio arremesso sem depender de assistência.' },
      { key: 'offBallMovement', label: 'Movimentação sem bola', tip: 'Cortes, relocação e leitura de espaços sem a bola.' },
      { key: 'screenUsage', label: 'Uso de bloqueios', tip: 'Aproveitar bloqueios com e sem bola (off-screen, hand-off).' },
      { key: 'offensiveRebounding', label: 'Rebote ofensivo', tip: 'Atacar a tabela ofensiva e gerar segundas chances.' },
    ],
  },
  {
    id: 'playmaking',
    label: 'Criação',
    attributes: [
      { key: 'ballHandling', label: 'Controle de bola', tip: 'Drible sob pressão e mudança de direção.' },
      { key: 'passing', label: 'Passe', tip: 'Precisão e variedade de passes.' },
      { key: 'passingVision', label: 'Visão de jogo', tip: 'Enxergar companheiros livres antes da defesa reagir.' },
      { key: 'decisionMaking', label: 'Tomada de decisão', tip: 'Escolher a jogada certa: arremessar, passar ou reiniciar.' },
      { key: 'pickAndRoll', label: 'Pick and roll', tip: 'Conduzir o pick and roll ou atuar como bloqueador/rolador.' },
      { key: 'transitionPlay', label: 'Transição', tip: 'Eficiência em contra-ataques e quadra aberta.' },
      { key: 'turnoverAvoidance', label: 'Cuidado com a bola', tip: 'Evitar desperdícios considerando a carga de criação.' },
    ],
  },
  {
    id: 'defense',
    label: 'Defesa',
    attributes: [
      { key: 'perimeterDefense', label: 'Defesa de perímetro', tip: 'Conter a bola e contestar arremessos longe da cesta.' },
      { key: 'interiorDefense', label: 'Defesa interior', tip: 'Proteger o aro e defender no post.' },
      { key: 'steals', label: 'Roubos', tip: 'Mãos ativas, deflexões e roubos de bola.' },
      { key: 'blocks', label: 'Tocos', tip: 'Tempo de bola e alcance para bloquear arremessos.' },
      { key: 'screenNavigation', label: 'Navegação em bloqueios', tip: 'Passar por bloqueios sem perder o marcado.' },
      { key: 'helpDefense', label: 'Defesa de ajuda', tip: 'Rotações, coberturas e cargas ofensivas cavadas.' },
      { key: 'defensiveIQ', label: 'QI defensivo', tip: 'Posicionamento, antecipação e comunicação.' },
      { key: 'closeout', label: 'Closeout', tip: 'Fechar em arremessadores sem cometer falta ou ser batido.' },
      { key: 'defensiveRebounding', label: 'Rebote defensivo', tip: 'Box out e garantir o fim da posse adversária.' },
    ],
  },
  {
    id: 'physical',
    label: 'Físico',
    attributes: [
      { key: 'speed', label: 'Velocidade', tip: 'Velocidade máxima em quadra aberta.' },
      { key: 'acceleration', label: 'Aceleração', tip: 'Primeiro passo e explosão em espaços curtos.' },
      { key: 'strength', label: 'Força', tip: 'Absorver e impor contato.' },
      { key: 'vertical', label: 'Impulsão', tip: 'Salto vertical.' },
      { key: 'stamina', label: 'Stamina', tip: 'Sustentar rendimento com muitos minutos.' },
      { key: 'agility', label: 'Agilidade', tip: 'Deslocamento lateral e troca de direção.' },
      { key: 'balance', label: 'Equilíbrio', tip: 'Manter o controle do corpo no contato.' },
      { key: 'durability', label: 'Resistência física', tip: 'Robustez para suportar a temporada sem se lesionar.' },
    ],
  },
  {
    id: 'mental',
    label: 'Mental',
    attributes: [
      { key: 'offensiveIQ', label: 'QI ofensivo', tip: 'Seleção de arremessos, espaçamento e leitura da defesa.' },
      { key: 'clutch', label: 'Clutch', tip: 'Rendimento nos minutos finais de jogos apertados.' },
      { key: 'consistency', label: 'Consistência', tip: 'Regularidade de desempenho jogo a jogo.' },
      { key: 'discipline', label: 'Disciplina', tip: 'Evitar faltas desnecessárias, técnicas e erros de execução.' },
      { key: 'workEthic', label: 'Ética de trabalho', tip: 'Dedicação a treino e evolução. Estimativa: refinada por scouting.' },
      { key: 'leadership', label: 'Liderança', tip: 'Influência no vestiário e em quadra.' },
      { key: 'competitiveness', label: 'Competitividade', tip: 'Intensidade, disputa de bolas e vontade de vencer.' },
      { key: 'focus', label: 'Concentração', tip: 'Manter o foco em execução e detalhes.' },
    ],
  },
];

export const ATTRIBUTES = ATTRIBUTE_GROUPS.flatMap((g) => g.attributes.map((a) => ({ ...a, group: g.id })));
export const ATTRIBUTE_KEYS = ATTRIBUTES.map((a) => a.key);
export const ATTRIBUTE_BY_KEY = Object.fromEntries(ATTRIBUTES.map((a) => [a.key, a]));

export const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];
export const POSITION_LABELS = { PG: 'Armador', SG: 'Ala-armador', SF: 'Ala', PF: 'Ala-pivô', C: 'Pivô' };

export const clampRating = (v) => Math.max(0, Math.min(100, Math.round(v)));
