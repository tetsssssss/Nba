# NBA Universe Manager: pacote incremental sobre o arquivo v0.2.0

## Contexto de compatibilidade (leia primeiro)

A versão mais recente do usuário já inclui **PROMPT 01 (save seguro)** e **PROMPT 09 (playoffs e carreira plurianual)**. Esses dois códigos não estavam disponíveis. Este pacote foi aplicado somente sobre o arquivo v0.2.0 original. **Não substitua a versão atual pelo ZIP completo**. A forma segura é aplicar o patch sobre uma cópia da versão atual, revisando conflitos manualmente. Os arquivos `src/core/world.js`, `src/core/db.js` e `src/core/saves.js` (PROMPT 01) NÃO foram editados neste pacote. A lógica nova do PROMPT 09 não é reproduzida e continua devendo ser preservada.

### Estado honesto por prompt

| Prompt | Trabalho sobre a v0.2.0 | Limitação para versão atual |
|---|---|---|
| 02 | Corrigido gatilho do Expansion Draft para usar IDs em `league.expansion.teams` e idempotência; preferências de proteção/ordem | Integração no ciclo de abertura atualizado precisa ser revisada |
| 03 | Validação central de cinco atletas; bloqueio antes do RNG, motor 2D e pré-checagem diária | Tratamento de contingência com contratação emergencial ainda não existe |
| 04 | Validação mais rígida de metas e integridade referencial, franquias, liga, calendário, jogos e contratos órfãos | Migrações de formatos desconhecidos não puderam ser testadas |
| 05 | Checkpoint na transição pré-temporada/abertura, também para simulação acelerada, com marcador persistente | Demais eventos (trade deadline, draft etc.) não integrados |
| 06 | Atualizadas descrições incorretas e informações de controles de dificuldade futuros | Auditoria visual completa não ocorreu |
| 07 | Novo comparador reproducível para simulação rápida x motor 2D; oito confrontos comparados | Não foram alteradas constantes de motor sem amostra suficiente |
| 08 | Editor de titulares e pesos de minutos, salvo no time; motor rápido usa minutos normalizados e 2D usa quinteto inicial | Minutos por atleta ainda não são impostos pelo treinador automático do 2D |
| 10 | Mercado básico de trocas 1x1, avaliação determinística, validação salarial simplificada e contratação direta de free agents | Ainda faltam CBA avançado, trades com múltiplos atletas/picks, aceitação estratégica de GMs, dispensas e renovações |
| 11 | Módulo determinístico de envelhecimento/desenvolvimento, wrapper idempotente para offseason | Chamada ao offseason do PROMPT 09 tem de ser integrada manualmente |
| 12 | Configuração manual de protegidos (franquia antiga) e prioridades de picks (expansão) | Escolha turno a turno ainda automática |
| 13 | Testes de unidade/regressão ampliados e script `tools/browser-smoke.py` | Chromium em ambiente de execução bloqueou URL local; não há aprovação end-to-end |
| 14 | História da temporada derivada de resultados e indicador estatístico de destaque | Prêmios oficiais e narrativa histórica plurianual persistente ainda não integrados |

## Integração sem apagar os prompts 01 e 09

1. Faça cópia completa do repositório atual e exporte os saves importantes.
2. Use `git apply --check NBA-Universe-Manager-prompts-02-08_10-14.patch`. Isso verifica compatibilidade textual antes de alterar o código. Se falhar, **não use `--force` nem sobrescreva arquivos**.
3. Aplique arquivos sem conflito, depois faça merge manual dos seguintes: `src/season/season.js`, `src/ui/sim-control.js`, `src/ui/views/match.js`, `src/ui/views/team.js` e eventuais arquivos da offseason que já existam.
4. Em `season.js` do PROMPT 09, preserve a máquina de estados e todas as fases de play-in, playoffs, offseason. Transplante apenas: (a) gatilho de expansão explícito; (b) preferências do draft; (c) pré-checagem de elenco; (d) rotação passada para o modelo rápido; (e) callback opcional para checkpoint de transição, **se o avanço diário da versão atual for compatível**.
5. Na passagem de offseason implementada pelo PROMPT 09, importe `applyOffseasonDevelopment` de `src/players/offseason-integration.js` e chame `applyOffseasonDevelopment(world, completedSeason)` **uma única vez depois dos jogos e antes de limpar as estatísticas**. O marcador `career.lifecycleEvents` impede duplicação por recarregamento. Antes de ligar a rotina, execute testes sobre várias temporadas e verifique distribuição de OVR.
6. Mantenha a implementação de `saveWorld()` e o esquema de banco da versão atual; eles são prioritários. Uma migração de save e persistência deve ser testada antes de criar uma carreira de longo prazo.
7. Execute `npm test`, `node tools/compare-engines.mjs 8 qa2026`, simule uma temporada, inicie playoffs e teste save/load em todas as fases.
8. Para QA de navegador, execute o servidor via `npm start` e `python tools/browser-smoke.py http://localhost:5173`. Se uma política bloquear loopback, use ambiente local normal e registre essa limitação.

## Arquivos novos relevantes

- `src/players/eligibility.js`
- `src/players/rotation.js`
- `src/players/development.js`
- `src/players/offseason-integration.js`
- `src/contracts/market.js`
- `src/core/checkpoint-events.js`
- `src/season/narrative.js`
- `tools/compare-engines.mjs`
- `tools/browser-smoke.py`
- `tests/improvements.test.mjs`

## Compatibilidade

Os novos valores de rotação ficam em `teams[].rotation`; proteção, prioridades e marcadores ficam no registro `career`. Nenhuma store adicional é exigida na v0.2.0. A versão atual do usuário pode ter alterações incompatíveis, especialmente em metadados, fases de temporada e persistência. Faça verificação de esquema e migração antes de integrar, e nunca teste primeiro sobre o save principal.
