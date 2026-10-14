# Project State — 2026-10-14

Estado atual: o pacote CODIGO-COMPLETO de 14/10/2026 (758 testes) recebeu o módulo de gestão — Trade Machine 3.0, Draft Night, Finanças e contratos, Offseason de 11 fases, IA de GMs e God Mode ampliado — sem criar outro jogo: mesmas stores do IndexedDB (`draftPicks`, `prospects`, `finances`, `meta`), mesmo `career.godMode`, mesmo `cap.js`. Suíte: 829/829. `pwa:verify` e `release:verify` verdes; cache PWA `nuv-management-20261014-r1`. Pendências conhecidas: conferir `trade.rules`/`draft` de `league.json` (`needsValidation`) contra o CBA oficial; testes E2E automatizados; verificação em Chromium localhost e Xiaomi reais. Detalhes: `docs/GESTAO-TRADE-DRAFT-FINANCAS-OFFSEASON.md` e `docs/CODEX-RELATORIO-GESTAO-2026-10-14.md`.

---

## Histórico — 2026-10-09

O pacote da versão 0.2.0 segue como base canônica. A evolução gráfica começou sem substituir simulação, dados ou saves. O 2D atual permanece padrão. A Carreira agora também pode ser assistida no visual 2.5D Arcade em Canvas, com sprites estilizados e renderização de reserva em código; o 3D WebGL2 segue experimental dentro das partidas que usam `MatchSim`.

O menu inicial foi atualizado para uma seleção de modos em cartões horizontais inspirada na referência MyGM/MyLEAGUE. A tela `#/start` mantém as rotas funcionais e exibe o catálogo completo, com leiaute responsivo para telas menores.

Validação de código: a suíte Node completa passou após a camada Arcade, incluindo três testes novos de câmeras, poses e projeção sem mutação. Validação manual local: uma partida com elencos da Carreira abriu em `#/match`, avançou o relógio e os lances, trocou para **2.5D Arcade** e renderizou a quadra, sprites, placar e painel lateral sem avisos ou erros no console. A sessão foi deixada em andamento e não gravou resultado. A cobertura ainda não inclui teste de desempenho em dispositivos modestos, tela estreita, áudio, replay 3D ou uma partida oficial encerrada seguida de recarga de save.

Restauro integral anterior à mudança: `../NBA-Universe-Manager-pre-nextgen-2026-10-09.zip`. Relatório detalhado: `docs/NEXT-GEN-GRAPHICS.md`.
