# NBA Universe Manager — Evolution 02: áreas fora da carreira

## Escopo congelado

O usuário confirmou os PROMPTS 01 (save) e 09 (playoffs/offseason) como já implementados em sua cópia pessoal. Como essa cópia NÃO foi recebida, **nenhum módulo de Carreira, mundo persistente, salvamento, calendário, simulação ou postseason foi alterado nesta entrega**.

Modificações estritamente limitadas:

1. `index.html`: adiciona a referência a `css/evolution-02.css` após `evolution.css`.
2. `css/evolution-02.css` (novo): estilos de Liga e ficha de Jogo, responsividade de 4/3/2/1 colunas, animações não essenciais com opção de reduzir movimento.
3. `src/ui/presentation-insights.js` (novo): cálculos puros de força do núcleo, filtro/ordenação visual de franquias, placar/parciais e cestinhas.
4. `src/ui/views/league.js`: explorador de franquias com busca, filtro Leste/Oeste, ordenação e cartões. Comparativo tabular original foi preservado; divisão original disponível em painel recolhível.
5. `src/ui/views/game.js`: placar em estilo transmissão, comparação gráfica de períodos, cestinhas dos dois times e fallback para dados históricos sem parciais/box.
6. `tests/presentation-insights.test.mjs` (novo): 14 testes para módulos de leitura, filtros e robustez.

## Instalação na sua versão atual (recomendada)

**Não substitua o projeto completo**, porque ele parte da cópia Evolution 01, que não tem suas implementações atuais dos prompts 01 e 09.

1. Faça um backup do projeto atual.
2. Use `git apply --check NBA-Universe-Manager-Evolution-02.patch` e depois `git apply NBA-Universe-Manager-Evolution-02.patch`, se os contextos forem compatíveis. Se houver conflito, resolva somente no arquivo alvo; **não use `--force`**.
3. Em alternativa, copie somente `css/evolution-02.css`, `src/ui/presentation-insights.js` e `tests/presentation-insights.test.mjs`, acrescente manualmente o `<link rel="stylesheet" href="css/evolution-02.css" />` depois do `evolution.css` no seu `index.html`, e integre as partes visuais de `league.js` e `game.js` por merge.
4. Se seu prompt 09 já mudou `game.js` para suportar pós-temporada, preserve as modificações e incorpore apenas as seções de placar e resumo, nunca substitua `game.js` integralmente.
5. Rode `npm test` e revise Liga, busca/filtros/ordenação, placar final com e sem box, responsividade e configuração de movimento reduzido.

## Testes executados

- `npm test`: **103 aprovados, zero reprovados** na base disponível (89 prévios + 14 novos).
- `node --check` e importação dos novos módulos: aprovados.
- Teste de navegador: tentativa realizada, mas o Chromium não conseguiu completar a navegação neste ambiente. Verificação visual manual segue pendente.

## Por que esta entrega não modifica carreira

Apenas renderização, filtros locais em memória e análise de dados já existentes são executados. Nenhuma função nova altera `world`, dispara eventos de temporada, salva estado ou muda o resultado de partidas.

## Próximo foco fora de carreira

1. Fichas individuais de jogadores: radar de habilidades acessível e comparação visual entre atletas.
2. Central de estatísticas: filtros de desempenho em tabelas, distribuição de pontuação e séries de resultados, sem modificar o motor.
3. Transmissão 2D: interface do placar, controles e HUD com modos de legibilidade, sem tocar na física ou IA.
4. QA visual real com screenshots em desktop/mobile após abrir a aplicação em um ambiente compatível.
