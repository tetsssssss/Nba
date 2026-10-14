# NBA Universe Manager · Pacote de Transmissão integrado (12/10/2026)

## Base
`NBA-Universe-Manager-BABYLON-BLENDER-2026-10-12-COMPLETO.zip`.

## Código implementado

- **`src/match/broadcast-overlay-state.js`**: dados puros de placar (equipes, pontos, período, relógios e posse), identificação de eventos e rastreador de lances novos. Não escreve no `MatchSim` ou na persistência.
- **`src/ui/components/broadcast-live-overlay.js`**: componente DOM para placar sobre a quadra e vinhetas curtas a partir dos eventos oficiais da partida; expiração sem timers; controle de visibilidade; texto escapado pelo helper `h`.
- **`src/ui/views/match-live.js`**: integra o overlay no mesmo `court-wrap` compartilhado pelos renderizadores existentes, atualiza via `refreshHud`, expõe botão `Placar TV` e libera recursos ao sair.
- **`css/broadcast-tv.css`** e **`index.html`**: visual responsivo, contraste, distinção de posse e suporte a `prefers-reduced-motion`.
- **`assets/broadcast/`**: cópias do scorebug estático SVG, lower-third, matchup e tokens de design provenientes do pacote de transmissão. São **referências visuais**; o overlay realmente conectado aos dados é construído em DOM, não desenhado em cima de um SVG estático.
- **`tests/broadcast-tv-state.test.mjs`** e **`tests/broadcast-tv-dom.test.mjs`**: testes do estado, do rastreador e da renderização DOM.

## Compromissos

- Continua disponível o placar anterior do jogo; o novo placar é uma sobreposição opcional, útil especialmente em tela cheia.
- Não existe série de playoff inserida artificialmente no placar. Apenas dados disponíveis no snapshot oficial são exibidos.
- Eventos sem registro suficiente não recebem destaque inventado.
- Nenhuma lógica de simulação, contratação, temporada, classificação, playoffs/offseason ou save foi modificada.
- O visual é integrado onde existe `renderLive`; não há reivindicação de aplicação automática em toda tela WNBA/Street/All-Star caso esses modos usem views próprias.
- Compatível com visual 2D, WebGL2 e Babylon, porque é independente do renderer.

## Verificação e limites

- Executar `npm test` na raiz.
- Executar `npm run release:verify` para inventário de arquivo.
- Reproduzir em navegador real e no celular ainda é necessário. A inspeção de navegador local neste ambiente pode ser bloqueada por política de acesso; o resultado deve constar no relatório final.
- **Não houve captura de motion no Figma/Canva/Adobe**. Vinhetas atuais são transições CSS simples, não vídeos animados produzidos externamente.

## Como desfazer

1. Manter uma cópia intacta do ZIP base e de todos os saves privados.
2. Para reverter os módulos novos, aplicar patch reverso sobre uma árvore de arquivos que corresponda exatamente a esta entrega.
3. Ou simplesmente desabilitar no próprio jogo com o botão `Placar TV: desligado`, sem afetar o `MatchSim`.
