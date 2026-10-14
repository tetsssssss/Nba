# NBA Universe Manager: Evolution 1001–2000 — Entrega técnica incremental

**Base de referência:** Evolution 701–1000. Esta base NÃO inclui as alterações privadas já concluídas pelo usuário para os prompts 01 (save) e 09 (playoffs/offseason).

**Situação:** implementação e testes concluídos dos módulos listados a seguir. A numeração até 2000 é uma meta de roadmap; **não significa que 1000 novas funcionalidades, 1000 commits ou 1000 etapas individuais foram implementados**. O trabalho realizado nesta entrega é descrito por arquivos, funções e testes concretos.

## Implementação comprovável

### 1. WNBA Liga Arcade instantânea (`src/wnba/arcade-league.js`)
- 4, 6, 8, 10 ou 15 franquias, escolhidas na interface `#/wnba/arcade-league`.
- Geração de todos-contra-todos usando método de rotação; 15 franquias incluem folga, sem confronto inventado.
- Turno único e ida/volta, placares de jogos reais do motor WNBA, classificação por vitórias e saldo.
- Semifinais e final opcionais com resultados simulados; eventos somente em memória, não geram save ou temporada de Carreira.
- Para 15 franquias, turno único contém 105 jogos; ida e volta contém 210.

### 2. Biblioteca de até 8 rosters fantasy WNBA (`src/wnba/roster-library.js`)
- Seleção, duplicação, criação de slot limpo, renomeação, exclusão protegida por confirmação e importação/exportação da biblioteca completa.
- IDs estáveis; validação rigorosa das jogadoras e das equipes. Migração de leitura do Roster Studio legado, sem apagar o valor anterior.
- Chave **localStorage** exclusiva `wnba-arcade-roster-library-v1`. Nenhum acesso a `src/core/world.js`, IndexedDB central ou saves NBA.
- Roster Studio existente continua permitindo transferência, fantasy draft e amistosos. Cada slot salva suas alterações independentemente.

### 3. Laboratório de táticas Street (`src/wnba/street-lab.js`)
- `#/wnba/street-lab`: compara balanceada, arremessos longos, infiltração e passes.
- Time A usa a estratégia testada; time B usa a estratégia equilibrada em todas as simulações, com mesmas sementes entre estratégias.
- Formatos 1x1, 2x2 e 3x3, metas de 11/21, 8 a 64 jogos pela interface, métricas de vitórias, pontos e posses.
- Resultados são *amostras simuladas*; não são previsões oficiais ou histórico persistente.

### 4. Replay Street textual e correção de bug (`src/wnba/replay.js` e `src/ui/views/wnba.js`)
- Replay navegável pelas posses existentes no histórico do motor, com placar, texto do lance, equipe atacante e ordem cronológica.
- Limitação clara: o motor retém apenas as **últimas 60 posses**, não há vídeo nem coordenadas reais de rastreamento.
- **Bug confirmado e corrigido:** a visualização Street chamava `streetChart(game)` sem definição no módulo. Foi adicionada a função para desenhar um mapa SVG esquemático a partir dos eventos.
- Cores distintas para acertos/erros, descrição acessível e aviso explícito de que as posições são ilustrativas.

### 5. Layout, robustez e integração
- CSS dedicado `css/evolution-1001-2000.css`, escopado ao `.wnba-page`, com tabelas roláveis, cartões responsivos e respeito a movimento reduzido.
- Novas abas WNBA conectadas pela view atual, preservando rotas e funções anteriores.
- A nova biblioteca não sobrescreve automaticamente a chave do Roster Studio legado.

## Testes

- **458** testes na base anterior.
- **44** testes novos: 39 testes de lógica e invariantes, mais 5 testes de interface em DOM simulado com eventos de clique.
- **502 testes automatizados aprovados** na suíte completa da nova base, conforme `NBA-Evolution-1001-2000-TESTES-FINAIS.log`.
- A verificação do servidor HTTP confirmou retorno 200 para o HTML e os módulos JavaScript.
- A tentativa de executar a interface em Chromium via Playwright falhou com `net::ERR_BLOCKED_BY_ADMINISTRATOR` para localhost e file://. Portanto **não há homologação visual real**. Os testes DOM comprovam criação dos elementos e execução dos callbacks, mas não disposição em tela, FPS ou comportamento em dispositivos.

## Preservação e integração

Novos módulos ficam apenas sob `src/wnba/`. Foi alterada a view `src/ui/views/wnba.js` e adicionado um link CSS em `index.html`.

**Sem alterações em:** `src/core`, `src/season`, `src/match`, `src/contracts`, `src/players`, `src/arcade`, banco de dados ou views da Carreira NBA. Este fato é verificado por comparação de arquivos com a Evolution 701–1000 de referência, não com a versão privada do usuário.

Não substitua diretamente a versão privada com o ZIP completo. Use o patch ou os arquivos selecionados, revise mudanças concorrentes em `index.html` e `wnba.js` e execute `npm test` novamente na sua versão.

## Roadmap técnico real até a marca 2000, ainda NÃO implementado

- **Próxima frente A:** QA visual real em ambiente de navegador não bloqueado, acessibilidade por teclado e correções de layout baseadas em capturas.
- **Próxima frente B:** motor Street 2D com movimentação e física próprias, sem forçar a estrutura NBA 5x5.
- **Próxima frente C:** expansão de fotos verificadas WNBA, com fontes e validação individuais, sem atribuir retratos de outras atletas.
- **Próxima frente D:** rosters WNBA com atletas criadas pelo usuário, atributos editáveis e validação compatível com os motores 2D e rápido.
- **Próxima frente E:** novos concursos All-Star, replays de partida e transmissão com câmeras, métricas e overlays.
- **Próxima frente F:** campeonatos Arcade customizáveis, histórico local opcional de resultados avulsos, testes de estresse, acessibilidade e otimização mobile.

O modo Carreira, o prompt 01 e o prompt 09 permanecem congelados até solicitação explícita do usuário.
