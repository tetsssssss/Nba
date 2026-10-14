# Gestão: Trade Machine 3.0, Draft Night, Finanças, Offseason e God Mode

Data da entrega: 2026-10-14. Base: `NBA-Universe-Manager-STREET-WNBA-ALLSTAR-2026-10-14-CODIGO-COMPLETO` (758 testes verdes).
Relatório de mudanças para o Codex: `docs/CODEX-RELATORIO-GESTAO-2026-10-14.md`.

Tudo aqui **estende** o projeto existente: mesmas stores do IndexedDB (`draftPicks`, `prospects`, `finances`,
`transactions`, `meta`), mesmo `career.godMode`, mesmo `cap.js`, mesmo `development.js`. Nenhum jogo paralelo foi criado.

## 1. Mapa de módulos

| Área | Arquivos | Responsabilidade |
| --- | --- | --- |
| Picks | `src/contracts/picks.js` | Registros de pick, propriedade, proteções, swaps, conversões, picks reservadas da expansão |
| Estado do mercado | `src/contracts/market-state.js` | Documento `meta.market` (rascunhos, travas, ofertas, histórico, revisões, checkpoints da IA, preferências) |
| Regras | `src/contracts/rules-config.js` | Defaults de `league.trade.rules` e `league.draft`, `capSeason`, prazo de trocas |
| Valuation | `src/contracts/valuation.js` | Valor de jogador/pick/swap em "pontos de valor", utilidade por perfil e horizonte |
| Legalidade | `src/contracts/trade-rules.js` | `checkLegality`: elenco, cap, aprons, salary matching, exceções, picks, Stepien, recém-contratados |
| Motor de trocas | `src/contracts/trade-engine.js` | `checkTrade`, `evaluateBalance`, `evaluateAcceptance`, `proposeTrade`, `executeProposal` (multi-time) |
| Fachada | `src/contracts/market.js` | `evaluateTrade`/`executeTrade`/`signFreeAgent` antigos, agora sobre o novo motor |
| Contratos | `src/contracts/contracts-engine.js` | Pedido de mercado, agente, rotas de assinatura, renovação, extensão, dispensa/stretch, opções, cap holds, rookies |
| Finanças | `src/contracts/finance.js` | Perfil do proprietário, receita/despesa, imposto de luxo, projeções, histórico |
| Cap | `src/contracts/cap.js`, `cap-growth.js` | Faixas do imposto, situação de cap, crescimento do cap (+6%/ano) |
| IA dos GMs | `src/gm/{team-context,personality,ai-gm,ai-offseason}.js` | Necessidades, 7 arquétipos, contrapropostas, ofertas, trades IA×IA, offseason da IA |
| Draft | `src/draft/{lottery,prospects,player-factory,scouting,draft-analysis,draft-engine}.js` | Loteria, classe de prospectos, scouting, Draft Night, análise, histórico |
| Aposentadorias | `src/players/retirement.js` | Perspectiva, decisão, aposentar/reverter |
| Offseason | `src/season/offseason.js` | Máquina de 11 fases persistente |
| God Mode | `src/core/godmode-permissions.js`, `godmode.js` | Permissões e intervenções do comissário |
| Bootstrap | `src/core/bootstrap.js` | `ensureWorldSystems`: cria/repara picks, prospectos, mercado, perfis de GM, offseason |
| Telas | `src/ui/views/{trade-machine,draft,finance,offseason,commissioner}.js`, `src/ui/components/mgmt.js`, `css/management.css` | Interfaces |

## 2. Persistência

- `world.draftPicks`, `world.prospects`, `world.finances`, `world.careerStats` (Maps) e os documentos `meta.market`, `meta.draft`, `meta.offseason`.
- `save-snapshot.js` exporta/importa tudo (backups, cópias); `save-validation.js` valida picks (propriedade, duplicidade), prospectos e documentos de estado.
- `ensureWorldSystems` é **idempotente** e roda em `openCareer`: saves antigos ganham picks dos próximos 7 Drafts, a classe de prospectos, perfis de GM e o documento de mercado sem perder nada.
- A IA e a offseason são **retomáveis**: `market.ai.lastTick` e ids de evento (`claimAiEvent`) impedem reprocessar ao abrir a tela; `off.applied` marca ações únicas da offseason (desenvolvimento, aposentadorias, rollover do cap).
- Fechar o navegador durante o Draft não o reinicia: `meta.draft` guarda status, pick atual, relógio e escolhas feitas.

## 3. Trade Machine 3.0 (`#/market`)

- Dois painéis (elenco/picks, com foto, OVR/POT, idade, posição, salário, anos, necessidades, situação de cap) + mesa central.
- Entrada: arrastar (desktop), botões `+` e `×` (toque e teclado) e Enter/Espaço nos itens focados. Arrastar nunca é obrigatório.
- Ações: **VERIFICAR**, **PROPOR**, **CONTRAPROPOSTA**, **TRAVAR**, **LIMPAR**, **SALVAR RASCUNHO**, **HISTÓRICO**.
- Três avaliações independentes no relatório:
  1. **Legalidade** (CBA): bloqueios com regra, franquia e mensagem específicas.
  2. **Equilíbrio esportivo**: balança de valor em pontos, por lado.
  3. **Aceitação estratégica**: probabilidade por franquia, dependente do perfil do GM, `career.modifiers.tradeDifficulty` e `aiGmSharpness`.
- Suporta 1×1 até multi-jogador, jogadores + picks, três ou mais franquias, picks protegidas, swaps, dinheiro, exceções de troca (TPE) e restrição de recém-contratados.
- Seleção das franquias: o usuário escolhe a adversária; só o God Mode permite trocar o lado esquerdo.

### Regras de legalidade (`checkLegality`)
Elenco (mín./máx.), limite de dinheiro por temporada, salary matching por enquadramento (abaixo do cap, intermediário, avançado, 1º apron, 2º apron), proibição de agregar salários e de receber dinheiro no 2º apron, uso de TPE com tolerância, recém-contratados (bloqueio de dias), picks (propriedade, horizonte, congelamento por Stepien), proteções válidas, prazo de trocas, direitos de swap.

> **Atenção:** os percentuais e prazos estão em `league.json` → `trade.rules` com `needsValidation: true`. Foram reproduzidos de memória do CBA 2023 e adaptados à liga de 32 franquias. Precisam ser conferidos contra o texto oficial antes de serem tratados como definitivos.

### Horizonte de picks futuras
`league.trade.futurePickYearsAhead = 1` permanece como decisão de design. **Nada foi alterado silenciosamente.** Existe um mecanismo explícito de ampliação por carreira (`market.prefs.futurePickYearsAhead`, 0–6) em "Regras de troca" da Trade Machine; vale para o usuário e para a IA e fica no documento `meta.market`.

## 4. IA dos GMs

- 7 arquétipos: Contender, Reconstrução, Desenvolvimento, Caçador de estrelas, Corte de custos, Guardião de picks, Última dança de veteranos. Arquétipo e horizonte derivados do elenco, idade e situação de cap; a reavaliação mantém a intensidade do GM e guarda o histórico de mudanças de estratégia (o perfil não oscila a cada dia).
- `buildCounter`: contraproposta que equilibra valor e salary matching. `buildOfferToUser`: pacotes (incluindo sweeteners) que a IA oferece ao usuário. `findAiTrade`: trades IA×IA.
- `runAiMarketTick` roda após cada dia simulado; respeita `career.systems.aiTrades`, `career.autoApproveAiTrades` e `canReviewAiTrades` (revisão aprovar/vetar no Painel do Comissário).

## 5. Draft Night (`#/draft`)

Seis abas: Draft ao vivo, Prospectos, Trade de picks, Big board e scouting, Análise ao vivo, Histórico.

- **Ordem**: `planDraftOrder` — loteria com as probabilidades de `league.draft.lotteryOdds` (14 times, 4 sorteios), demais por campanha. As picks reservadas da expansão ficam **fora** da loteria.
- **Draft 2027**: SEA #4/#5 e LVJ #1/#10 são preservadas (picks extras de número fixo, `kind: 'expansion-reserved'`). A 1ª rodada tem 34 picks. O Draft 2026 real nunca é recriado.
- **Prospectos**: fictícios (sem dados reais confiáveis), `generateProspectClass` com semente por temporada. IDs estáveis `9.000.000 + (ano−2000)·1000 + rank`.
- **Scouting**: relatórios com ruído estável por semente e por scout; `scoutingNoise` do save altera a precisão. Treinos individuais limitados (`MAX_WORKOUTS`). Consenso e Big Board próprio.
- **Estado persistente**; auto-pick respeita `draft.forced` (God Mode); `simToUserPick`, `simAll`, pausa/retomada.
- **Análise**: grade por pick com mock absoluto sobre a turma inteira; retrospectiva por turma; histórico persiste em `career.draftLog`.
- **Contratos de rookie**: escala salarial por número da pick (1ª rodada) e contrato da 2ª rodada.

## 6. Finanças (`#/finance`)

- Folha oficial (`payrollFor`), estimada (cap holds, escolhas) e projetada (+6%/ano de crescimento do cap), sempre separadas e rotuladas.
- Central de contratos: vencimentos, opções, Bird rights, cap holds, exceções, two-way, dead money, stretch.
- Free agency: pedido de mercado (esfria com o tempo), resposta do agente (mensagens concretas), rotas de assinatura (espaço, mid-level, bi-annual, mínimo, Bird).
- `checkSigning` impede contratações inválidas em qualquer modo de cap (elenco cheio, rota inexistente, mínimo salarial, teto do contrato). Nas dificuldades Realista/Hardcore o teto do proprietário também **bloqueia** o que estouraria o orçamento; nas demais apenas avisa. Os modos de cap (básico, intermediário, avançado, completo) escolhem quais linhas (cap, imposto, aprons) aparecem.
- Imposto de luxo por faixas (`luxuryTaxBill`); perfil do proprietário (`ownerProfile`) limita orçamento; histórico por temporada (`closeSeasonBooks`).

## 7. Offseason (`#/offseason`)

11 fases persistentes: Encerramento das finais → Campeão e premiações → Decisões e aposentadorias → Draft Lottery → Scouting → Draft Night → Decisões contratuais → Free Agency (30 dias) → Renovações → Ajustes de elenco → Próxima temporada.

- Cada fase tem `requirements` (o que bloqueia avançar) e `completeStep`; `autoCompleteOffseason` conclui o que falta de forma segura (inclusive opções de contrato do usuário).
- **Aposentadorias**: `retirementOutlook` (idade, overall, lesão, carreira) → `decideRetirements`; override do usuário/God Mode. O contrato remanescente é tratado (sai da folha com registro), nunca apagado.
- **Desenvolvimento**: `development.js`/`offseason-integration.js` roda **uma vez** por temporada (`off.applied`).
- O cap da liga avança na transição (`advanceLeagueCap`); o histórico guarda o valor oficial de cada ano.

## 8. God Mode

Um só sistema: `career.godMode`. Modos que bloqueiam (Franchise, Coach: `lockGodMode`) nunca recebem poderes.

- **FORÇAR ACEITAÇÃO**: ignora a IA; a legalidade continua valendo.
- **OVERRIDE TOTAL**: exige digitar `OVERRIDE TOTAL`; informa as regras ignoradas; cada uso é registrado (`logAdmin`).
- Painel do Comissário (`#/commissioner`): trocar de franquia, mover jogador, editar contrato/atributos/potencial, corrigir salário, dono de pick, forçar pick do Draft, aposentar/reverter, condições da liga, eventos, revisão de trades da IA.

## 9. Navegação

Grupo "Gestão" no menu: Trade Machine (`/market`), Draft (`/draft`), Finanças (`/finance`), Offseason (`/offseason`), Comissário (`/commissioner`, só com God Mode/Commissioner). Cada item aparece conforme as permissões do modo da carreira. A aba Mercado de `team.js` virou lançador; a aba Picks usa a propriedade real. O botão de simulação leva à Offseason quando a temporada termina.

## 10. Como testar

```
npm test                 # 829 testes (758 originais + 71 novos)
npm run build:netlify    # regenera dist/netlify e offline-assets.json
npm run pwa:verify
npm run release:verify
```

Testes novos: `management-baseline`, `picks`, `lottery`, `trades`, `ai`, `draft`, `offseason`, `contracts-finance`, `godmode`, `management-persistence`, `management-dom`. Os de carreira usam `tests/helpers/{env,career}.js` com `fake-indexeddb` vendorizado em `tests/vendor/` (sem dependências npm).

## 11. Limitações conhecidas

- Regras do CBA com `needsValidation` (ver acima). Valores de exceções, aprons e matching são aproximações.
- Prospectos fictícios; nenhuma lista real de 2027 foi incluída.
- Testes DOM são de fumaça (FakeNode). A verificação de fluxo completo (DnD, Draft, Offseason, mobile) foi feita manualmente com Playwright/Chromium neste ambiente; Chromium localhost/Xiaomi reais seguem pendentes no dispositivo do usuário.
- A IA aprende só o perfil e a utilidade descritos aqui; não há memória de relacionamento entre GMs.
