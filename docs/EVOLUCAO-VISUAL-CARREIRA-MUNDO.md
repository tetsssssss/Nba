# NBA Universe Manager | Evolution 01: Visual, Carreira e Mundo

## Estado da entrega (2026-10-08)

Base: ZIP v0.2.0 com melhorias dos prompts 02–08 e 10–14, não a versão particular do usuário. **Prompts 01 (save seguro) e 09 (playoffs/offseason) foram informados como concluídos e não foram sobrescritos neste trabalho.**

### Implementado e executável na base fornecida
- Nova rota `#/world` chamada **O Universo**; link na navegação e busca de comandos.
- Painel de mundo baseado exclusivamente nos jogos e notícias já salvos: total de jogos oficiais, ranking indicativo da temporada regular (62% aproveitamento, 28% últimos 10 jogos, 10% aproximado por diferencial, com limitador de saldo), sequências de >=3 vitórias/derrotas, duelos de jogos repetidos/apertados, finais emocionantes e arquivo de notícias.
- Filtro interativo Leste/Oeste/Toda Liga para o ranking de momento, com `aria-pressed`.
- Central do GM: faixa de trajetória com jogos disputados, progresso real da temporada, posição na conferência, sequência, últimos dez e projeção matemática das vitórias. Não cria missões falsas nem modifica os saves.
- Novo stylesheet `css/evolution.css`: visual mais sofisticado, cards, espaços e contornos, badges, hero, animações de entrada e de barra, animação discreta de status e layout responsivo.
- Acessibilidade: redução de movimento por preferência existente `data-motion='off'` e `prefers-reduced-motion`; progresso com `role='progressbar'` e valores expostos.
- Manchetes de partidas de playoffs quando representadas com `type` playoff/playoffs/playin/play-in/postseason na versão atual. Ranking e indicadores de classificação continuam limitados aos jogos de temporada regular.

### Testes
- Nova suíte `tests/world-pulse.test.mjs`: pré-temporada, resultados e temporadas diferentes, sequências, confrontos, notícias fundamentadas, projeção, integridade e jogos de playoffs.
- Testes de Node executados; resultados anexados em `NBA-Universe-Manager-Evolution-01-testes.log`.
- Servidor estático serviu novos módulos em `http://127.0.0.1:5174`, mas Chromium headless excedeu o timeout, por isso **não houve inspeção visual end-to-end aprovada**.

## Como integrar na versão atual sem eliminar os prompts 01/09

**Não sobrescreva o repositório atual com o ZIP completo de referência.** Faça uma cópia e exporte seus saves primeiro.

1. Copie os quatro arquivos novos: `css/evolution.css`, `src/season/world-pulse.js`, `src/ui/views/world.js`, `tests/world-pulse.test.mjs`.
2. Acrescente `css/evolution.css` em `index.html`, após `css/game.css`.
3. Em `src/main.js`, importe `worldView` de `./ui/views/world.js` e adicione `defineRoute('/world', worldView)` ao lado das rotas que requerem carreira.
4. Em `src/ui/shell.js`, adicione o menu `{ label: 'Universo vivo', icon: 'news', path: '/world', keys: 'U' }` na seção da liga. Remova a entrada inerte `Notícias` da seção Em breve, se ela ainda existir. Se seu prompt 09 já tiver criado uma rota de mundo/notícias, unifique, não duplique.
5. Em `src/ui/views/home.js`, importe `franchisePulse` e `seasonSnapshot`, calcule os indicadores a partir de `seasonGames()` e apresente o bloco `career-arc` entre os KPIs e alertas. A versão modificada do arquivo é a referência, não substitua funções novas do seu prompt 09.
6. Se sua offseason mudou os nomes ou tipos de jogos, adapte exclusivamente `finalOfficial()` e `finalRegular()` em `world-pulse.js`, preservando a separação entre jogos regulares e playoffs.
7. Execute `npm test` e abra `#/home` e `#/world` em desktop e mobile, incluindo saves durante playoffs, offseason e início da segunda temporada. Teste `Ctrl+K`, filtro de conferências, clique em jogo, opção para reduzir animações e reabrir save.
8. Se a implementação atual do prompt 09 contém um calendário diferente, ajuste `franchisePulse()` para usar o calendário regular desse save, sem contar jogos de playoffs na barra de 82 partidas.

Use o patch para inspecionar as alterações; `git apply --check` primeiro. Se houver conflito com alterações atuais, aplique manualmente só os trechos indicados. **Não execute `git apply --force` ou sobreponha arquivos complexos.**

## Critérios de integridade e limitações
- Nenhum schema do IndexedDB, mecanismo de save, simulação de jogo, playoff ou offseason é alterado por esta entrega.
- Sem notícias fabricadas: só resultados reais ou registros existentes.
- Ranking de momento é indicativo, não substitui regras de desempate ou classificação oficial.
- História do mundo é derivada da temporada atual; rivalidades históricas plurianuais e objetivos de proprietário não foram implementados nesta etapa.
- As animações da interface não alteram física ou FPS do motor de partidas.
- O QA visual no navegador ficou pendente em razão do bloqueio/timeout do Chromium; testes de unidade não substituem E2E.

## Próximas sprints, em ordem
1. Unificar com a offseason já existente (Prompt 09) e garantir trocas de temporadas sem duplicação de manchetes.
2. Adicionar calendário de rivalidades plurianuais e histórico de prêmios reais persistentes, com migração segura quando necessário.
3. Criar uma caixa de entrada de decisões de GM com consequências verificáveis (contratos, rotação, staff) em vez de botões sem efeito.
4. Melhorar interfaces de partida: placar, transições e feedback de jogadas com respeito à opção de reduzir animações.
5. Realizar QA end-to-end e corrigir problemas comprovados nas resoluções 1440×900, 1280×720, 768×1024 e 390×844.
