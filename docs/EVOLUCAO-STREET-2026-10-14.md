# NBA Universe Manager | Street NBA/WNBA e All-Star | 14/10/2026

## Escopo implementado

1. `src/arcade/street-statistics.js`: módulo de leitura do box score de Street; separa cestas de 1 e 2 pontos (o Street não usa o sistema 2/3 da NBA), calcula acertos, tentativas, FG%, roubos e perdas, sem modificar o estado original.
2. `src/arcade/street.js`: cada evento de roubo agora identifica também `defenderId`, permitindo destacar o defensor correto; fórmula e resultado do jogo não mudaram.
3. `src/ui/views/arcade.js`: tabelas por equipe e atleta, foco de evento, rótulo da quadra de acordo com 1x1/2x2/3x3; alterar atleta, formato, meta ou semente descarta o jogo antigo da tela.
4. `src/ui/views/wnba.js`: estatísticas equivalentes no Street WNBA clássico; mudanças de configuração descartam placar/replay anterior e exigem iniciar uma nova partida.
5. `src/arcade/all-star.js`: concurso de 3 pontos agora distingue atributo zero de atributo ausente e retorna acertos, tentativas e aproveitamento; `src/ui/views/arcade.js` apresenta esses números.
6. CSS: tabelas responsivas com rolagem horizontal, destaque curto de eventos reais, respeito a `prefers-reduced-motion`.
7. `sw.js` e `tools/build-netlify.mjs`: cache `nuv-street-insights-20261014-r1` para impedir mistura com a versão anterior após atualização.

## Integridade e limites

- **Nenhum arquivo** de `src/core/`, `src/season/`, `src/players/`, `src/contracts/` ou `src/match/` foi modificado nesta rodada.
- As partidas Street e os concursos All-Star são avulsos. Não há escrita na carreira, IndexedDB ou resultados oficiais da temporada.
- A quadra Street NBA é um **diagrama esquemático**, não uma simulação espacial. O destaque do jogador usa o evento real, sem inventar trajetórias ou movimentos.
- O replay WNBA clássico continua textual. Não foi desenvolvido replay em vídeo.
- O motor gráfico Canvas Art da Carreira foi preservado, não reescrito.
- Instalações privadas desconhecidas precisam comparar e revisar o patch antes de aplicar.

## Validação

Validação efetivamente realizada em 14/10/2026:

- Referência de 13/10: **744/744 testes aprovados** antes das alterações.
- Testes direcionados novos: **14/14 aprovados** (incluindo DOM simulado e integridade do box score).
- Suíte completa: **758/758 aprovados**, zero falhas.
- Build Netlify concluído, `pwa:verify` íntegro com **185 recursos** e 3 ícones.
- HTTP local: **185/185 recursos** do catálogo responderam 200.
- Proteção SHA-256: **59/59 arquivos** de `src/core/`, `src/season/`, `src/players/`, `src/contracts/` e `src/match/` idênticos à referência.
- Playwright/Chromium: tentativa real de abrir localhost bloqueada por `net::ERR_BLOCKED_BY_ADMINISTRATOR`; **não homologado visualmente**.
- Android Xiaomi físico: **não testado**.

Os testes de interface com DOM simulado não substituem inspeção em Chromium/Android.

## Roadmap, não implementado

- Animações espaciais de Street com rastreamento real da bola, jogador e defensores.
- Replay visual de lances WNBA com dados de coordenadas reais.
- Homologação de desempenho e acessibilidade em Xiaomi físico.
- Integração com alterações privadas do Codex após revisão de conflitos.
