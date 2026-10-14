# Reformulação de layout, UX e navegação — relatório de handoff

Sessão de 6 out 2026. Branch `layout-ux` (parte de `motor-2d`). Nenhuma regra de jogo foi alterada: só apresentação, navegação e preferências.

## 1. Auditoria inicial

**Críticos (dificultavam usar)**
- Busca só achava jogadores e franquias, sumia abaixo de 1100 px e não tinha atalho.
- Clicar num jogador sempre trocava de tela: impossível inspecionar sem perder a lista.
- Tabelas esqueciam ordenação e página ao voltar; a rolagem também voltava ao topo.
- Dicas (`data-tip`) eram cortadas por tabelas, cartões e pelo menu.

**Importantes (leitura e navegação)**
- Menu com 19 links em 7 grupos, sem recolher; depth chart e folha escondidos em abas.
- Home era uma tabela de elenco + seis cartões de mesmo peso: nada dizia o que exigia decisão.
- Perfil do jogador: cabeçalho textual com foto pequena; 45 atributos sem forças/fraquezas; tendências exibidas como notas.
- Elenco com colunas fixas, sem filtro, sem comparação.
- Cabeçalho de tabela "sticky" não funcionava (o contêiner com `overflow` anulava).

**Visuais**
- Tokens incompletos: sem escala de espaçamento, tipografia, z-index ou tempos; `rgba()` soltos nos componentes.
- Três superfícies quase iguais; hierarquia dependia de bordas.
- Setas de ordenação em caracteres (▲▼); chips em pílula de cores variadas.

**Polimento**
- Sem transições, sem skeleton, estados vazios do tipo "Sem contrato.".
- Decimais com ponto em alguns lugares ("24.3 anos").

## 2. Design System

Fonte única: `css/tokens.css`. Os nomes antigos (`--surface`, `--muted`, `--good`…) continuam como apelidos.

| Grupo | Tokens |
| --- | --- |
| Superfícies | `--bg-primary` `--bg-secondary` `--surface-1/2/3` `--surface-hover` `--overlay` |
| Bordas | `--border-muted` `--border-default` `--border-strong` |
| Texto | `--text-primary` `--text-secondary` `--text-tertiary` |
| Semântica | `--accent` (laranja da marca), `--success` `--warning` `--danger` `--info` `--elite` e versões `-soft` |
| Franquia | `--team` (legível no escuro), `--team-raw`, `--team-2` — definidos pelo shell |
| Tipografia | `--font`, `--font-display` (Bahnschrift/condensada para títulos e números), `--fs-display/h1/h2/h3/body/small/micro` |
| Espaço | `--sp-1`…`--sp-7` = 4 · 8 · 12 · 16 · 24 · 32 · 48 |
| Raio | `--radius-sm` 4 · `--radius` 8 · `--radius-lg` 12 |
| Sombra | `--shadow-1/2/3` (só em elementos flutuantes) |
| Camadas | `--z-sticky/shell/popover/drawer/modal/toast/tooltip` |
| Movimento | `--t-fast` 120 ms · `--t-base` 180 ms · `--t-slow` 240 ms |
| Densidade | `--row-h` `--cell-pad` `--card-pad` `--gap` `--control-h` |

Preferências refletidas no `<html>`: `data-density` (compact/normal/comfortable), `data-font`, `data-motion`, `data-accent`.
Breakpoints: ≥1600 amplo · ≥1280 padrão · <1280 menu vira trilho de ícones · <1024 uma coluna.
Faixas de rating (cor + texto na dica): Elite 90+ · Excelente 80–89 · Bom 70–79 · Regular 60–69 · Fraco <60.
Botões: primary · secundário (padrão) · ghost · danger · icon. Chips: neutro · good · warn · bad · info · future.

Organização do CSS: `tokens.css` → `base.css` → `layout.css` (shell e grades) → `components.css` (genéricos) → `views.css` (telas).

## 3. Telas reformuladas

- **App Shell** — menu lateral em 5 grupos (Minha franquia, Mercado, Talentos, NBA + sistema no rodapé), grupos recolhíveis, modo trilho de ícones (preferência salva; automático abaixo de 1280 px). Barra superior: busca, cap, estado do save, pendências com contador, data e "Avançar dia" (marcado como Fase 4).
- **Central do GM (Home)** — faixa da franquia com 1 ação primária; 4 indicadores; alertas de decisão; quinteto provável com fotos; notícias com categoria; pendências, médico, folha e divisão na lateral.
- **Elenco** — filtro por posição e por disponibilidade, colunas opcionais (salvas), ordenação lembrada, seleção de 2–4 para comparar, ficha rápida ao clicar na linha, estrela de observado.
- **Perfil do jogador** — cabeçalho com retrato grande, número da camisa ao fundo, cor da franquia, Overall/Potencial e linha de estatísticas; abas na ordem pedida; visão geral com 5 forças e 5 fraquezas; atributos em 5 blocos com legenda de faixas; tendências como nível (Muito alto…Muito baixo) + marcadores.
- **Perfil de franquia** — cabeçalho novo; identidade própria para Las Vegas Jokers (losangos, neon contido) e faixa dourada para Seattle.
- **Comparar** (nova, `/compare?ids=`) — 2 a 4 jogadores; com dois, a coluna central mostra a diferença.
- **Observados** (nova, `/watchlist`).
- **Partida 2D** — placar grande com cores dos times, relógio de posse, velocidade em controle segmentado, "Simular até…" em menu, ferramentas de passo/câmera/debug recolhidas, painel lateral ocultável.
- **Jogadores, Configurações** — filtro segmentado, ficha rápida, página preservada ao voltar; novo cartão "Interface".
- As demais telas (Franquias, História, Saves, Dev Tools, Roteiro, início e nova carreira) receberam o Design System, mas não foram redesenhadas.

## 4. Componentes criados

`src/ui/components/widgets.js`: `pageHeader`, `breadcrumbs`, `kpi`, `bigStat`, `emptyState`, `segmented`, `ratingRow`, `tierLabel`, `tendencyRow`, `statusBadge`, `playerCard`, `favStar`, `kbd`.
`src/ui/components/overlay.js`: `openDrawer`, `menuButton`, `openPalette` / `setCommandSource`.
`src/ui/components/tooltip.js`: dica flutuante única.
`src/ui/components/player-quick.js`: `openPlayerQuick`.
`src/ui/components/table.js`: `stateKey`, `pinFirst`, `rowClass`, `setRows(…, { keepPage })`.
`src/media/photos.js`: `playerPortrait`.
`src/core/watchlist.js`, `src/players/statline.js`.

## 5. UX melhorada

- **Abrir qualquer coisa**: Ctrl+K (ou `/`) → nome → Enter. Busca jogadores, franquias, técnicos, páginas e ações.
- **Inspecionar jogador**: 1 clique na linha abre a ficha rápida; o perfil completo está a mais 1 clique.
- **Comparar**: marcar 2–4 no elenco → Comparar. Também pela ficha rápida e pelo menu "…" do perfil.
- **Depth chart e folha**: 1 clique no menu (antes: elenco → aba).
- **Voltar**: a tela anterior reabre com ordenação, filtros, página e rolagem.
- **Atalhos**: H, R, D, F, G, W, L, J, `[`, `?` (desligados enquanto se digita).

## 6. Responsividade

Verificado por script (estouro horizontal e de cartões) em 1024×768, 1366×768, 1920×1080 e 2560×1440, em 15–27 rotas; inspeção visual a 750 px de largura (painel do navegador). O painel não exibe capturas legíveis acima da própria largura, então as resoluções maiores foram conferidas por medição, não por olho.

## 7. Funcionalidades preservadas

Criação/abertura/exclusão de carreira, autosave e salvar manual, todas as abas de franquia e de jogador, filtros da lista de jogadores (ainda na URL), God Mode e Dev Tools, partida 2D completa e sandbox (motor intocado).

## 8. Testes

- `npm test`: 41/41 (39 anteriores + 2 de `statline`).
- Navegador: todas as rotas sem erro de console; menu de colunas, seleção e comparação, filtro por posição, ordenação salva, pendências, estrela → Observados, densidade, cor da franquia ligada/desligada, atalhos, voltar, partida rodando a 4x.

## 9. Bugs e limitações conhecidos

- Abaixo de 1440 px a tabela ganha rolagem horizontal e o cabeçalho deixa de ficar fixo em relação à página.
- "Avançar dia", Trades, Draft, Free agency, Finanças, Táticas, Imprensa: continuam sem sistema por trás; aparecem marcados com a fase prevista.
- Moral, objetivos do proprietário, próximo jogo e inbox de mensagens não existem nos dados; não foram simulados na interface.
- Partida: sem timeout, substituições ou táticas (o motor ainda não expõe controle do técnico).
- Marcar "Menu lateral recolhido" nas Configurações recarrega a página.
- Drag-and-drop no depth chart não foi feito (o depth chart ainda é automático).

## 10. Regressões

Nenhuma encontrada. Mudança de comportamento intencional: clicar numa linha de jogador abre a ficha rápida em vez de navegar (o nome continua sendo link direto).

## 11. Arquivos alterados

Novos: `css/tokens.css`, `css/views.css`, `src/ui/components/{overlay,tooltip,player-quick}.js`, `src/ui/views/{compare,watchlist}.js`, `src/core/watchlist.js`, `src/players/statline.js`, `tests/statline.test.mjs`, `docs/LAYOUT.md`.
Reescritos: `css/{base,layout,components}.css`, `src/ui/shell.js`, `src/ui/views/home.js`.
Alterados: `index.html`, `src/main.js`, `src/core/settings.js`, `src/media/photos.js`, `src/ui/{dom,router}.js`, `src/ui/components/{widgets,table,feedback}.js`, `src/ui/views/{team,player,players,settings,match}.js`.

## 12. Próxima prioridade de layout

1. Franquias/Liga e História com a nova linguagem (cartões de líderes, campeões, recordes com fotos).
2. Folha salarial: linha do tempo de cap por temporada.
3. Depth chart manual com arrastar-e-soltar e visual dos 240 minutos — depende do sistema de rotação (Fase 6).
4. Trade Center, Draft Hub e Free Agency: desenhar junto com os sistemas (Fases 2–3), já sobre estes componentes.
