# NBA Universe Manager — Relatório de Handoff

**Sessão 1 · 05/10/2026 · Fase 1 concluída, Fase 2 iniciada**

> **Sessão 2 (motor de partida 2D):** ver `docs/MOTOR-2D.md`. A Fase 5 saiu de "planejada" para "em andamento"; o menu ganhou **Partida 2D**.
>
> **Sessão 3 (layout, UX e navegação):** ver `docs/LAYOUT.md`. Design System em `css/tokens.css`, novo shell, Central do GM, elenco, perfil de jogador, comparação e observados.
>
> **Sessão 5 (calendário e temporada):** ver `docs/TEMPORADA.md`. Calendário de 82 jogos, avanço de dia, simulação rápida da liga, jogo oficial no 2D, classificação, líderes, box scores e Expansion Draft automático. Migração de banco v2.
>
> **Sessão 4 (mega evolução):** ver `docs/MEGA-EVOLUCAO.md`. Modos de jogo, tela de abertura, sliders, saves com slots e validação, comandos do técnico na partida, quadra nova e recalibração do motor (inclui a correção da concentração de pontos no cestinha).

Este documento é o ponto de partida obrigatório da próxima sessão. Ele descreve o
estado real do aplicativo; em caso de divergência, o código vence.

---

## 1. Como rodar

| Ação | Comando |
| --- | --- |
| Abrir o jogo | duplo clique em `Iniciar NBA Universe Manager.bat` ou `npm start` → http://localhost:5173 |
| Testes | `npm test` (28 testes, Node, sem dependências) |
| Atualizar dados reais | `npm run data:fetch` e depois `npm run data:build` |
| Auditar fotos | `npm run photos:audit` |

Não há dependências (`node_modules` não existe). O jogo usa ES modules, por isso
precisa ser servido por `server.mjs` — abrir `index.html` via `file://` não funciona.
Requer Node 20+. Para forçar novo download das fontes: `node tools/fetch-universe.mjs --refresh`.

---

## 2. Auditoria inicial

A pasta `NBA 2D` estava **vazia** — não havia projeto para preservar. Material
relacionado encontrado em `Downloads` (somente leitura, nada foi alterado):

- `basket-manager-*.zip` — protótipos antigos de ~35 KB (`index.html` + `app.js`). Não reaproveitados.
- `nba_rosters_2026_draft.pdf` (06/06/2026) — elencos montados à mão. **Não usado como fonte**: contém
  duplicidades (Harden em CLE e LAC, Duren em DET e PHX, Valančiūnas em DEN e SAC) e ausências (Mitchell, Flagg, Booker).
- `NBA_Intelligence_Report_2026_...pdf` (11/07/2026) — relatório de offseason marcado como "pré-validação".
  Serviu de conferência: as grandes movimentações que ele cita (Giannis no Heat, Knicks campeões de 2026)
  batem com as fontes oficiais consultadas agora.
- `Manual_Universo_NBA_Ano_1_...pdf` — universo narrativo anterior, baseado em mock draft. Superado pelo Draft 2026 real.

Decisão: construir do zero, com dados buscados diretamente em fontes oficiais.

---

## 3. Estado atual do aplicativo

### Funciona de ponta a ponta

- **Tela inicial**: lista de carreiras, nova carreira, importar save.
- **Nova carreira** (4 passos): nome, cargo (Dono, Presidente, Presidente de Operações de Basquete, GM, Técnico),
  franquia (32), dificuldade (5 níveis + Customizado com 10 multiplicadores e 8 sistemas ligáveis),
  modo de salary cap (4 níveis), duração (padrão 10), God Mode, aprovação automática de trades da IA.
- **Saves**: múltiplas carreiras independentes em IndexedDB, autosave, botão Salvar, exportar/importar `.json`, excluir.
  A última carreira reabre sozinha ao recarregar a página.
- **Central de operações**: campanha, elenco em destaque, notícias, tarefas geradas do estado real,
  folha vs. cap, departamento médico, conferência.
- **Franquia** (qualquer uma das 32): Elenco · Folha salarial (5 temporadas, opções, dead money, linhas de cap) ·
  Depth chart automático · Franquia (diretoria, arena, mercado, torcida) · História.
- **Jogadores**: banco com busca, filtros (franquia, posição, vínculo, idade), ordenação e paginação.
- **Perfil do jogador**, 10 abas: Visão geral, Atributos, Estatísticas, Contrato, Desenvolvimento, Saúde,
  Relacionamentos (futuro), Histórico, Scouting, Tendências.
- **Franquias**: 32 equipes por conferência/divisão + tabela comparativa.
- **História**: campeões, temporada 2025-26 (classificação e chaves dos playoffs), Draft 2026 e 2025.
- **Configurações**, **Dev Tools** (auditorias + ferramentas) e **Roteiro**.
- **Busca global** de jogadores e franquias na barra superior.

### Universo

- 32 franquias. Seattle SuperSonics e Las Vegas Jokers no Oeste; New Orleans no Leste; Minnesota no Oeste. 16 + 16.
- Seattle recupera a história: título de 1979, 3 finais, 7 números aposentados, retrospecto oficial 1745-1585.
  O Thunder mantém apenas o que conquistou em Oklahoma City.
- **619 jogadores reais** nos elencos de pré-temporada de 05/10/2026, com 45 atributos, 33 tendências,
  posições naturais, Overall por posição e potencial dinâmico.
- 539 contratos reais ano a ano (opções, two-way, qualifying offers) + 80 estimados.
- Dead money real (ex.: stretch de Lillard no Bucks, Beal no Suns).
- Números financeiros oficiais de 2026-27: cap US$ 164,961 mi, tax US$ 200,428 mi, aprons US$ 209,015 mi / US$ 221,686 mi.
- 30 técnicos reais, 30 arenas, proprietários e GMs do cadastro oficial.

### Marcado explicitamente como futuro ("Fase N" na interface)

Trades, free agency, Expansion Draft, Draft e scouting, classificação, calendário, táticas, finanças, imprensa.
Nenhum desses botões finge funcionar: todos levam ao Roteiro com a fase destacada.

---

## 4. Arquitetura

```
index.html                 casca mínima; nenhuma lógica
server.mjs                 servidor estático local (sem dependências)
css/                       base.css · layout.css · components.css
src/
  main.js                  rotas e inicialização
  core/                    db · world · saves · universe · settings · events · rng · tasks · career-options · roadmap
  players/                 attributes · overall · tendencies · potential · depth
  contracts/               cap
  media/                   photos   (resolver central de imagens)
  dev/                     audit · selftest
  ui/                      dom · router · shell · format · search
    components/            widgets · table · feedback
    views/                 start · new-career · home · team · league · players · player · history · saves · settings · devtools · roadmap
data/
  static/                  franchises.json · league.json        (definição do universo — editar à mão)
  seed/                    gerado pelo pipeline — NÃO editar à mão
tools/                     pipeline de dados (roda em Node, não vai para o navegador)
  fetch-universe.mjs       baixa as fontes para tools/.cache/ (ignorado pelo git)
  build-seed.mjs           cache → data/seed/
  audit-photos.mjs         gera photo-manifest.json
  ratings/                 model.mjs · tendencies.mjs
  lib/                     http · features · career · contracts · names
  static/                  name-aliases.json · position-overrides.json   (curadoria manual)
tests/                     players · cap · seed
```

Pastas previstas no prompt mestre que ainda não existem (`simulation`, `match`, `scouting`, `trades`, `draft`,
`finance`) serão criadas quando a fase correspondente começar — não há pastas vazias.

### Convenções que o próximo agente precisa respeitar

- **Temporada = ano final.** `2027` é a temporada 2026-27. Use `seasonLabel()` para exibir.
- **Persistência**: um banco IndexedDB por carreira (`num-save-<id>`) + `num-meta` com o índice. 18 stores já criadas.
  Para mudar o schema, **acrescente** uma função em `MIGRATIONS` (`src/core/db.js`); nunca edite as existentes.
- **Estado em memória**: `getWorld()` mantém franquias, jogadores, contratos, técnicos, donos e arenas em `Map`s.
  Depois de alterar um registro chame `markDirty(store, id)` — o autosave grava. Entidades que crescem
  (notícias, transações, jogos) são lidas do banco com paginação.
- **Imagens**: só `playerAvatar()` / `teamLogo()` de `src/media/photos.js`. Nenhuma tela monta URL.
- **DOM**: `h()` e `mount()` de `src/ui/dom.js`. Não use `el.append()` nativo com valores condicionais
  (ele escreve "null" e achata arrays) nem `innerHTML` com dados.
- **Aleatoriedade**: sempre `createRng()` de `src/core/rng.js`, nunca `Math.random()` em lógica de jogo.
- **Overall**: `positionOverall(attributes, pos)`. Não existe Overall universal. `player.ovr` é cache da posição
  principal — chame `refreshPlayer()` após mexer em atributos.

---

## 5. Pipeline de dados e modelo de ratings

Fontes (todas consultadas em 05/10/2026):

| Fonte | Uso |
| --- | --- |
| stats.nba.com / NBA.com | elenco oficial, posição, altura, peso, país, draft, cadastro de franquia, classificação e playoffs 2025-26, combine 2003-2026 |
| ESPN | data de nascimento, lesões, carreira temporada a temporada, técnicos, logos |
| HoopsHype | contratos ano a ano, opções, two-way, dead money |
| stats.nba.com (tracking) | avançadas, zonas de arremesso, catch-and-shoot/pull-up, drives, toques, passes, hustle, defesa, play types, clutch, jogo a jogo — 2025-26 e 2024-25 |
| Hoops Rumors | números oficiais do cap 2026-27 |

**Modelo `ratings-v1`** (`tools/ratings/model.mjs`):

1. Cada atributo é um composto de indicadores reais → percentil na liga → escala 0-100.
2. Percentuais são encolhidos para um prior conforme o volume; o prior fica abaixo da média,
   para que quem não usa um recurso não herde eficiência de quem usa.
3. 2025-26 pesa 1,0 e 2024-25 pesa 0,55 — cobre lesionados (Haliburton, Tatum) e estabiliza amostras pequenas.
4. O nível geral vem do valor de produção real (produção por jogo, PIE, minutos, net rating, defesa);
   os atributos dão a forma do jogador e são ajustados para que a fórmula de Overall atinja esse alvo.
5. Novatos sem amostra: perfil de reserva da posição + combine + ruído, com alvo pela posição no draft.

Confiança por jogador: 264 alta · 142 média · 94 baixa · 119 sem amostra NBA.

Topo atual: SGA 98 · Jokić 96 · Wembanyama 95 · Giannis 94 · Dončić 93 · Kawhi 93 · Tatum 93 · Cunningham 92 · Mitchell 92.
Distribuição: 15 jogadores 90+, 38 entre 85-89, 69 entre 80-84.

**Ao regerar o seed**: se a calibração mudar, o teste `ratings: a constante de calibração...` falha de propósito.
Copie os novos valores de `data/seed/meta.json` para `OVERALL_CALIBRATION` em `src/players/overall.js`.

---

## 6. Decisões de design tomadas nesta sessão

| Decisão | Motivo |
| --- | --- |
| HTML/CSS/JS puro com ES modules + servidor local | Arquitetura modular sem build; nada a instalar |
| Um banco IndexedDB por carreira | Excluir, exportar e isolar universos fica trivial |
| Dados reais e dados derivados em arquivos separados | Tudo que é estimado fica identificável e auditável |
| Ratings calculados no build, não no navegador | O navegador não precisa de 47 MB de tabelas de tracking |
| Carreira começa na pré-temporada real (05/10/2026) | É o retrato oficial mais recente; os elencos têm até 22 jogadores e precisam ser cortados para 15 + 3 |
| 8 divisões de 4 equipes | Com 32 franquias é o único arranjo simétrico. Leste: Atlantic, Mid-Atlantic, Central, Southeast. Oeste: Northwest (com SEA e OKC juntos), Mountain (com LVJ), Pacific, Southwest |
| Posições por altura + papel estatístico, com 26 overrides manuais | Fontes oficiais só informam G/F/C. Overrides em `tools/static/position-overrides.json` |
| Técnico: cadastro oficial da NBA prevalece sobre a ESPN | A ESPN ainda listava Tiago Splitter em Portland (ele foi para Chicago) |
| Donos das expansões são grupos fictícios, marcados como tal | Não há proprietários reais |
| T-Mobile Arena para Las Vegas, Climate Pledge Arena para Seattle | Arenas reais existentes nas cidades |

---

## 7. Arquivos criados

Tudo é novo (repositório iniciado nesta sessão). Os de maior peso:

- `tools/ratings/model.mjs`, `tools/lib/features.mjs`, `tools/build-seed.mjs`, `tools/fetch-universe.mjs`
- `src/core/db.js`, `src/core/world.js`, `src/core/universe.js`, `src/core/saves.js`
- `src/players/overall.js`, `src/players/attributes.js`, `src/media/photos.js`, `src/contracts/cap.js`
- `src/ui/views/player.js`, `src/ui/views/team.js`, `src/ui/views/home.js`, `src/ui/views/devtools.js`
- `data/static/franchises.json`, `data/static/league.json`, `data/seed/*`

Totais: `src` 40 arquivos / 4.291 linhas · `tools` 10 / 1.727 · `tests` 3 / 362 · `css` 3 / 1.338 · seed 1,8 MB.

---

## 8. Testes executados

**Automatizados** — `npm test`: 28 de 28 passando.

- `players.test.mjs`: catálogo de 45 atributos, pesos por posição, Overall monotônico e dependente da posição,
  depth chart sem repetição e respeitando lesões, faixa de potencial, RNG determinístico.
- `cap.test.mjs`: resumo de contrato, status por faixa de cap, efeito do modo de cap, two-way, dead money, cap hit, casos vazios.
- `seed.test.mjs`: 32 franquias 16/16, história de Seattle/OKC, regras da liga, identidade dos jogadores,
  ratings iguais à fórmula do jogo, calibração, distribuição, contratos, dados oficiais das franquias,
  campeão e drafts, cobertura de fotos, ausência de erros de validação, normalização de nomes.

**No navegador** (localhost:5173):

- Assistente completo pela interface, incluindo validação de campo vazio.
- Autoteste de IndexedDB das Dev Tools: 8 de 8.
- Auditoria de integridade: 17 OK e 2 pontos de atenção esperados (contratos estimados, 20 sem foto).
- Editar atributo (Overall recalculado 83→85), transferir jogador, forçar lesão, avançar data;
  autosave gravou e tudo persistiu após recarregar.
- Três carreiras simultâneas e independentes; exportar → importar → conferir → excluir; arquivo inválido rejeitado.
- **Save antigo**: carreira criada antes de regerar o seed continuou abrindo normalmente.
- Teste de fumaça em 21 rotas e todas as abas: nenhum erro de console, IDs e rotas inválidos tratados.

Ao final, as carreiras de teste foram apagadas: o navegador está limpo.

---

## 9. Bugs encontrados e corrigidos

- O CDN da NBA responde HTTP 200 com uma silhueta genérica quando não há foto. A auditoria agora identifica essa
  resposta pelo ETag; 27 jogadores que pareciam ter foto na NBA foram reclassificados.
- `el.append()` nativo escrevia "null" na barra superior e achataria listas em texto → criado `mount()`.
- Parênteses desbalanceados em `new-career.js` e `player.js`.
- 11 contratos reais não casavam por grafia diferente entre fontes → `name-aliases.json`.
- Dead money real não entrava na folha.
- Técnico duplicado em Chicago e Portland.
- Pivôs de poucos minutos superavaliados na primeira versão do modelo → produção por jogo passou a pesar mais.

## 10. Bugs conhecidos e limitações

- **Posições** são derivadas pelo modelo. Fora dos 26 casos com override pode haver jogador em posição discutível.
- **Novatos de 2026** têm perfil genérico da posição; só físico (combine) e nível (pick) são individualizados.
- **Enterrada, ética de trabalho e liderança** não têm medição direta: são estimativas declaradas como tal.
- A auditoria de fotos em tempo de execução ("Auditar carregando as imagens") depende de rede.
- `beforeunload` pede confirmação se houver alteração ainda não gravada (janela de 4 s do autosave).
- Não há layout para celular; abaixo de 1100 px as grades empilham, mas a barra lateral é fixa.

## 11. Regressões

Nenhuma — não havia funcionalidade anterior.

---

## 12. Dados que precisam de validação

Lista completa em **Dev Tools → Validação dos dados reais** (`data/seed/validation.json`: 0 erros, 2 avisos, 143 informações).

1. **80 contratos estimados** — convidados de training camp sem contrato nas fontes; assumido mínimo não garantido de 1 ano.
2. **Dead money inferido** — compromissos na folha de um time por jogadores fora do elenco oficial dele.
   Os marcados como "dispensa confirmada na fonte" são seguros; os demais merecem conferência
   (ex.: Gary Harris em Detroit, Johni Broome em Philadelphia — podem ser atraso do índice oficial).
3. **Técnico do Trail Blazers** — ESPN: Tiago Splitter; cadastro oficial: Micah Nori. Usado o oficial.
4. **Toronto com 22 jogadores** (limite de offseason: 21) — é o que o índice oficial lista.
5. **Capacidade de arena ausente** em 10 franquias: BKN, DEN, DET, GSW, NOP, OKC, PHI, PHX, TOR, UTA.
6. **Escala de salário mínimo e de novatos 2026-27** — derivadas da tabela anterior corrigida pelo cap (`needsValidation` em `league.json`).
7. **20 jogadores sem foto** em nenhuma fonte (convidados de camp) — usam placeholder neutro.
8. **Índices de mercado e de torcida** em `franchises.json` são valores de balanceamento, não estatísticas.

---

## 13. Pendências

**Fase 2 — restante**

- Dispensar jogador e converter two-way/padrão (o elenco precisa ir de ~21 para 15 + 3).
- Negociação de renovação/extensão com agente; Bird Rights e exceções conforme o modo de cap.
- Trade Machine: multi-times, legalidade instantânea, salary matching, impacto na folha, elenco resultante.
- Valor de trade composto e 15 estilos de GM; trades entre IAs com aprovação em God Mode.

**Fase 3**

- Posse real das picks de draft (trocas já feitas) — ainda não importada.
- Listas de 7 protegidos, Expansion Draft com acordos laterais, benefícios temporários das expansões.
- Prospects reais de 2027, Big Board, Mock Drafts, scouting com margem de erro, combine, Draft Night.

**Decisão tomada pelo usuário em 6 out 2026: opção A** — as picks reservadas valem para o Draft 2027
(registrado em `data/static/league.json` → `expansion.initialDraftSeason`). Contexto da escolha:

O prompt mestre dá a Las Vegas as picks #1 e #10 e a Seattle as #4 e #5 do "draft inicial". O Draft 2026 real
**já aconteceu** (Dybantsa #1 para Washington, Peterson #2 para Utah, Boozer #3 para Memphis) e esses novatos
estão nos elencos. Opções:

- **A (recomendada)** — a carreira começa agora, o Expansion Draft acontece antes da noite de abertura e as
  picks reservadas valem para o **Draft 2027**, com prospects reais de 2027. Mantém todos os dados reais intactos.
- **B** — voltar o universo para junho de 2026 e refazer o Draft 2026 com as expansões escolhendo; exige desfazer
  as contratações reais de julho em diante.

---

## 14. Próximo passo recomendado

1. ~~Confirmar a opção A ou B~~ — decidido: opção A (Draft 2027).
2. Fechar a Fase 2 pela ordem: **dispensa de jogadores → Trade Machine com validação de legalidade → IA de trades**.
   A fundação necessária já existe: contratos ano a ano, `teamPayroll()`, `movePlayer()`, store `transactions`
   e `career.modifiers.tradeDifficulty`.
3. Antes de qualquer alteração em jogadores: rodar `npm test` e a auditoria das Dev Tools.

---

## 15. Git

- Branch: `main`
- Commit da fundação: `e700016` — "Fundação do NBA Universe Manager (Fase 1 + início da Fase 2)"; este relatório foi fechado no commit seguinte (`git log -1`)
- Identidade local do repositório: `ggomes655 <ggomes655@gmail.com>` (não havia identidade global configurada)
- Ignorados: `node_modules/`, `tools/.cache/` (47 MB de respostas brutas, regeneráveis com `npm run data:fetch`)
