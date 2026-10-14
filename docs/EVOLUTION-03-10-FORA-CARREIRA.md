# NBA Universe Manager | Evolution 03–10

## Escopo congelado

**NÃO ALTERADO:** `src/core/world.js`, `src/core/saves.js`, `src/core/db.js`, toda a pasta `src/season/`, toda a pasta `src/contracts/`, toda a pasta `src/players/`, toda a pasta `src/match/`, `src/ui/views/home.js`, `src/ui/views/team.js` e os sistemas de carreira, playoffs, offseason e progressão.

As melhorias funcionam como apresentação e consulta sobre o estado existente. O ZIP de referência NÃO contém as alterações recentes do usuário nos prompts 01 (salvamento) e 09 (playoffs/offseason).

## Evolutions implementadas

### E03 | Perfil de jogador premium
- Radar vetorial com os cinco grupos originais de atributos (escala 0 a 100).
- Análise de maior força e barras numéricas.
- Rótulos acessíveis no gráfico, sem biblioteca gráfica ou novas dependências.

### E04 | Evolução estatística
- Gráfico histórico de pontos, rebotes e assistências.
- Agrupamento de passagens por diferentes franquias na mesma temporada com médias ponderadas por jogos.
- Limita a nove temporadas para preservar legibilidade.
- Não gera dados para jogadores sem carreira registrada.

### E05 | Pós-jogo analítico
- Evolução do placar acumulado entre períodos e prorrogações.
- Comparativo de FG%, 3PT%, eFG%, assistências, rebotes e turnovers.
- Maior vantagem de cada equipe medida ao final de cada período (não representa vantagem de posse a posse).
- Graceful fallback quando não existe box score.

### E06 | Observatório da Liga
- Nova tela em `#/observatory`.
- Destaques de overall e potencial, filtro por conferência e busca por atleta/franquia.
- Acessível pelo menu lateral dentro de Liga.

### E07 | Núcleos das franquias
- Ranking visual das equipes pela média de overall dos cinco melhores atletas do elenco.
- Cada cartão leva à franquia existente.
- Métrica é um índice de elenco, NÃO previsão de vitórias ou desempenho em partidas.

### E08 | Partida 2D mais legível
- Modo TV/Transmissão alternável por botão.
- Controle de tela cheia da quadra nos navegadores com Fullscreen API.
- HUD com placar tabular, contraste e clareza melhorados.
- Nenhum cálculo, evento ou propriedade da simulação 2D foi alterado.

### E09 | Comparação visual entre atletas
- Radar duplo entre exatamente dois jogadores, na rota `/compare` já existente.
- Escalas e eixos comuns, legendas separadas e descrição acessível.
- Conserva a comparação tabular anterior.

### E10 | Responsividade, acessibilidade e testes
- Revisão da malha de cards em 1250, 900, 760 e 620 px.
- Foco de teclado, rótulos para SVGs e controles de filtros.
- Redução de animações em `prefers-reduced-motion` e `data-motion=off`.
- Funções puras para métricas e visualizações; novos testes de dados ausentes, prorrogações, agrupamento de temporadas e gráficos.

## Integração na sua versão com prompts 01 e 09

Recomendado: aplicar **o patch** e revisar eventuais conflitos. Os módulos críticos e o modo carreira não fazem parte das alterações.

```bash
# na raiz DO SEU PROJETO ATUAL, faça backup/commit primeiro
# conferir sem modificar
git apply --check NBA-Universe-Manager-Evolution-03-10.patch
# aplicar somente se o check tiver sucesso
git apply NBA-Universe-Manager-Evolution-03-10.patch
npm test
```

Se houver conflitos, integre manualmente:
- `src/main.js`: importar `observatoryView` e registrar `'/observatory'`.
- `src/ui/shell.js`: adicionar link para o Observatório no grupo Liga (NÃO sobrescrever o menu atual).
- `index.html`: incluir o último CSS `css/evolution-03-10.css`.
- `src/ui/views/`: mesclar `player.js`, `compare.js`, `game.js`, `match-live.js` preservando seus recursos atuais.
- `src/ui/experience-insights.js`, `src/ui/components/visuals.js`, `src/ui/views/observatory.js` e `css/evolution-03-10.css`: arquivos novos.

A rota `/observatory` requer um universo aberto; sem save, o roteador existente continuará no menu inicial.

## Restrições e validação

- Os testes de Node foram executados, incluindo os cenários novos e regressão total.
- O Chromium do ambiente bloqueou a navegação local com `ERR_BLOCKED_BY_ADMINISTRATOR`; testes visuais, cliques, layout real e Fullscreen API seguem sem certificação end-to-end.
- Dados do mundo não são modificados por nenhum dos novos cálculos. Métricas de apresentação (DNA, núcleo forte, série histórica) não interferem em resultados.
- Não usar o ZIP de referência para substituir sua versão atual com os prompts 01 e 09 implementados.

## Arquivos tocados

- `index.html`
- `css/evolution-03-10.css` (novo)
- `src/main.js`
- `src/ui/shell.js`
- `src/ui/views/player.js`
- `src/ui/views/compare.js`
- `src/ui/views/game.js`
- `src/ui/views/match-live.js`
- `src/ui/views/observatory.js` (novo)
- `src/ui/components/visuals.js` (novo)
- `src/ui/experience-insights.js` (novo)
- `tests/evolution-03-10.test.mjs` (novo)
- `tests/evolution-visuals.test.mjs` (novo)
- este documento
