# Relatório para o Codex — Gestão (Trade Machine 3.0 + Draft Night + Finanças + Offseason + God Mode)

Data: 2026-10-14 · Branch: `ccr-370690a2-3tzp2r` · Cache PWA: `nuv-management-20261014-r1`
Design e mapa de módulos: `docs/GESTAO-TRADE-DRAFT-FINANCAS-OFFSEASON.md`.

## 1. Resultado em uma linha

Os cinco sistemas pedidos no PROMPT MESTRE foram implementados **sobre** o projeto existente (mesmas stores, mesmo `career.godMode`, mesmo `cap.js`, mesmo `development.js`) e as telas `#/market`, `#/draft`, `#/finance`, `#/offseason` e `#/commissioner` estão operacionais. **Suíte: 828/828** (758 originais + 70 novos). `pwa:verify` e `release:verify` verdes.

## 2. Baseline e verificação

| Item | Resultado |
| --- | --- |
| Baseline do código original (CODIGO-COMPLETO) | 758/758 |
| Suíte após as mudanças | 828/828 (70 novos) |
| `npm run build:netlify` | 216 assets, VERSION `nuv-management-20261014-r1` |
| `npm run pwa:verify` | passou |
| `npm run release:verify` | passou (manifesto atualizado) |
| Navegador (Chromium + Playwright, neste ambiente) | DnD, botão `+`, verificação, relatório, Draft completo, offseason completa até 2028, FA/negociação e mobile sem overflow |
| Chromium localhost do usuário / Xiaomi / Android real | **não testados** (continuam pendentes, como no pacote anterior) |

O zip NETLIFY enviado pelo usuário é idêntico ao primeiro; o CODIGO-COMPLETO foi usado como base canônica.

## 3. O que mudou

### Arquivos novos (backend)
- `src/contracts/`: `picks.js`, `market-state.js`, `rules-config.js`, `valuation.js`, `trade-rules.js`, `trade-engine.js`, `contracts-engine.js`, `finance.js`, `cap-growth.js`
- `src/gm/`: `team-context.js`, `personality.js`, `ai-gm.js`, `ai-offseason.js`
- `src/draft/`: `lottery.js`, `prospects.js`, `player-factory.js`, `scouting.js`, `draft-analysis.js`, `draft-engine.js`
- `src/players/retirement.js`, `src/season/offseason.js`
- `src/core/`: `bootstrap.js`, `godmode-permissions.js`, `godmode.js`

### Arquivos novos (UI/CSS)
`src/ui/views/{trade-machine,draft,finance,offseason,commissioner}.js`, `src/ui/components/mgmt.js`, `css/management.css` (linkado em `index.html` antes de `mobile-pwa.css`).

### Arquivos alterados (24)
| Arquivo | Mudança |
| --- | --- |
| `data/static/league.json` | Blocos **aditivos** `trade.rules` e `draft`. `futurePickYearsAhead:1` e `expansion` intactos |
| `src/core/world.js` | Carrega `draftPicks`, `prospects`, `finances`, `careerStats`; docs `meta.market/draft/offseason`; `bumpRosters`; `payrollOf` usa `capSeason` |
| `src/core/save-snapshot.js`, `save-validation.js` | Novas stores e documentos entram em backup/validação |
| `src/core/saves.js` | `openCareer` chama `ensureWorldSystems` (idempotente; migra saves antigos) |
| `src/contracts/market.js` | Reescrito como **fachada**: `evaluateTrade`/`executeTrade`/`signFreeAgent` passam pelo novo motor (testes antigos seguem verdes) |
| `src/contracts/cap.js` | `TAX_BRACKET`, `luxuryTaxBill`, `capSituation` |
| `src/season/season.js` | `runAiMarketTick` após cada dia; `ensureOffseason` ao definir o campeão; `beginNextSeason({simplified})` |
| `src/players/offseason-integration.js` | Idade por `birthDate`, potencial coerente, `bumpRosters`; desenvolvimento roda uma vez por temporada |
| `src/core/{modes,roadmap,tasks}.js` | Textos, fases e tarefas de offseason/draft/ofertas/revisão |
| `src/dev/audit.js` | Checks de picks, Draft, expansão, cap; FA e aposentados |
| `src/main.js`, `src/ui/shell.js`, `src/ui/sim-control.js` | Rotas, grupo "Gestão" no menu, badge da offseason, `takeControl` |
| `src/ui/views/{team,devtools,settings,new-career}.js` | Aba Mercado vira lançador; aba Picks com propriedade real; Dev Tools usa o God Mode novo |
| `index.html`, `sw.js`, `tools/build-netlify.mjs`, `offline-assets.json` | CSS novo e versão de cache |

### Testes novos (70)
`management-baseline` (3), `picks` (6), `lottery` (5), `trades` (11), `ai` (7), `draft` (7), `offseason` (7), `contracts-finance` (10), `godmode` (6), `management-persistence` (3), `management-dom` (5).
Infraestrutura: `tests/helpers/{env,career}.js` e **`tests/vendor/fake-indexeddb/`** (cópia vendorizada, Apache-2.0, 47 arquivos) para rodar carreiras reais em memória sem dependências npm. O `package.json` não ganhou dependências.

## 4. Decisões de design que o Codex precisa conhecer

1. **Convenção de temporada**: ano final (2027 = 2026-27). O Draft 2027 ocorre no fim de 2026-27. O Draft 2026 real **nunca** é recriado.
2. **Draft 2027 e expansão**: LVJ #1/#10 e SEA #4/#5 preservadas (`kind:'expansion-reserved'`, número fixo, fora da loteria). A primeira rodada tem **34 picks** (32 naturais + 2 extras). Nenhuma franquia estabelecida perde sua pick.
3. **Picks futuras**: `futurePickYearsAhead=1` **não foi alterado**. Ampliação explícita por carreira em "Regras de troca" (`market.prefs.futurePickYearsAhead`, 0–6), válida para o usuário e para a IA.
4. **CBA**: `trade.rules` e `draft` em `league.json` têm `needsValidation:true`. Percentuais de salary matching, aprons, TPE e prazos vieram de memória do CBA 2023 e **precisam de conferência** contra o texto oficial.
5. **Prospectos fictícios** (sem dados confiáveis de classes futuras). IDs estáveis `9.000.000+(ano−2000)·1000+rank`; scouting com ruído por semente e `career.modifiers.scoutingNoise`.
6. **Valores oficial × estimado × projetado** são separados e rotulados na UI. O cap projetado cresce 6%/ano; o histórico guarda sempre o valor oficial.
7. **Idempotência**: `ensureWorldSystems`, `runAiMarketTick` (`market.ai.lastTick` + `claimAiEvent`) e `off.applied` evitam reprocessar ao abrir a tela ou recarregar.
8. **God Mode** é um só (`career.godMode`). `lockGodMode` (Franchise/Coach) nunca concede poderes, mesmo com `godMode=true` editado no save. OVERRIDE TOTAL exige digitar a frase e registra cada regra ignorada (`logAdmin`).
9. **Aposentadoria**: o contrato remanescente é tratado (sai da folha com registro), não apagado.
10. **Cap da temporada** (`capSeason`): entre o fim das finais e o início do novo ano de liga vale o cap da temporada que acabou; depois, o da próxima.

## 5. Bugs reais encontrados e corrigidos durante o trabalho
- `ensureDraft()` sem argumento criava o Draft do ano seguinte e sobrescrevia o doc concluído → padrão passou a `calendar.season`; arquivo compacto em `career.draftLog`.
- Fachada de `market.js` quebrava `evaluateTrade` com mundo falso e `signFreeAgent` (salário −1) → pré-validação e fallbacks.
- `autoCompleteOffseason` travava em team option do usuário → `autoDecideUserOptions`.
- Finanças em escala errada (receita ~200 bi) → coeficiente de ingresso recalibrado.
- `render()` da offseason depois do rollover lia `world.offseason` nulo → guarda.
- Classes `.left/.right` colidiam com CSS global → `tm-left/tm-right`.
- Grades do Draft infladas → mock absoluto sobre a turma inteira.

## 6. Limitações e pontos de atenção
- Testes DOM são de **fumaça** (FakeNode). Fluxos completos foram verificados à mão com Playwright; não há suíte E2E automatizada no repositório.
- A IA usa perfil + utilidade; sem memória de relacionamento entre GMs.
- Mobile: layout testado em viewport estreito (sem overflow), mas não em hardware real.
- `tests/vendor/` aumenta o pacote (47 arquivos); pode ser removido se o Codex preferir adicionar `fake-indexeddb` como `devDependency`.
- O remoto `origin` (tetsssssss/Nba) só contém a branch `ccr-370690a2-3tzp2r`; não há branch base, então não foi possível abrir PR automaticamente. Para revisar, crie uma branch base a partir do commit `7c1f4b6` (baseline do CODIGO-COMPLETO original) e abra o PR contra ela, ou promova esta branch a principal.

## 7. Sugestões de próximos passos
1. Conferir `trade.rules` e `draft` contra o CBA oficial e remover `needsValidation`.
2. Teste E2E (Playwright) do fluxo Trade Machine → Draft → Offseason em CI.
3. Memória de relacionamento entre GMs (rancor/confiança) usando `market.history`.
4. Exportar o histórico do comissário (`logAdmin`) para JSON/CSV.
5. Drag-and-drop com pré-visualização de salary matching ao soltar.

## 8. Como reproduzir
```
npm test
npm run build:netlify && npm run pwa:verify && npm run release:verify
PORT=5188 node server.mjs   # abrir #/market, #/draft, #/finance, #/offseason
```
