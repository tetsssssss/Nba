# NBA Universe Manager — Evolution 101–500

**Estado real deste release:** Evolution 101–172 implementadas e avaliadas por cenários automatizados. **Evolution 173–500:** plano de continuação, não implementado. O número 500 é a meta do programa de evolução, não a versão técnica já alcançada. Base: projeto de referência Evolution 11–100.

## Restrições obrigatórias

- Não alterar `src/core/world.js`, `src/core/saves.js`, `src/core/db.js`, `src/core/save-validation.js`, `src/season/season.js`, `src/season/schedule.js`, `src/contracts/`, nem a progressão da carreira.
- Não sobrescrever os prompts 01 e 09 do usuário, indisponíveis nesta cópia.
- O Arcade utiliza os jogadores, ratings e franquias do seed inicial; **não usa nem altera o roster de uma carreira aberta**.
- O Roster Studio usa exclusivamente a chave localStorage `nba-arcade-rosters-v1`, sem acesso às tabelas IndexedDB das carreiras.
- Os jogos All-Star e com rosters customizados são apresentados pelo motor 2D `MatchSim`. `renderLive` ganhou uma opção `isolated` que bloqueia `addGame` quando uma carreira estiver aberta, e exibe informação explícita de que o resultado não foi gravado.
- O Street é uma simulação separada, por posses, para quadra curta, e **não deve ser anunciado como conversão do motor 5×5 em 3×3 físico**.

## 101–172: funcionalidades implementadas

### NBA Arcade (hub)

Rotas independentes de carreira, acessíveis no menu inicial e lateral:

- `#/arcade/hub`
- `#/arcade/allstar`
- `#/arcade/roster`
- `#/arcade/street`
- `#/arcade/circuit`
- `#/arcade/cup`

### All-Star Weekend

- Seleção Leste × Oeste com 12 atletas por conferência a partir de seus ratings atuais do seed.
- Alternativa por draft de capitães, com 24 jogadores exclusivos.
- Jogo 5×5 ao vivo no motor `MatchSim`, com opção de controlar o Leste, Oeste ou deixar IA vs. IA.
- Concurso de três pontos: cinco racks, cinco bolas, bolas especiais valendo 2, teto de 30 pontos, probabilidade modulada pelos atributos.
- Concurso de enterradas: duas tentativas, notas até 50 cada, atributos de enterrada, impulsão e criação.
- MVP do amistoso calculado com pontos, rebotes, assistências e roubos no box score, exibido apenas nesta partida.
- Resultados não contam na carreira, na temporada regular ou nas premiações oficiais.

### Roster Studio

- Dois elencos alternativos com até 15 atletas cada e cinco ou mais para 5×5.
- Adicionar, remover e transferir jogadores entre os dois times, sem duplicidade.
- Editar nome e cor de cada equipe, pesquisar o banco real e ordenar pelo OVR.
- Draft automático ou fantasy draft reprodutível com semente.
- Importação/exportação em JSON com esquema e validações de IDs, quantidade, cores, nomes e duplicados.
- Persistência isolada em `localStorage`, não usa os saves do universo.
- Jogar custom vs. custom no motor 2D, com controle do Time A.

### Street Basketball e Circuito

- Street 1×1, 2×2 e 3×3 no modelo autônomo de meia quadra.
- Cesta interna = 1, externa = 2, jogo até 11 ou 21, diferença mínima de 2 pontos e teto de 25.
- Seleção de três jogadores a partir dos elencos do Roster Studio.
- Estilos táticos: equilibrado, arremesso exterior, infiltração e passe.
- Posse a posse, placar, cartões em quadra, log dos lances e box score individual.
- Simulação até o fim, replay por semente e controles de acesso.
- Circuito Street automático com 4 ou 8 trios de jogadores reais distintos; bracket, final e campeão.
- **Limitação honesta:** as representações de quadra são visuais 2D simplificadas, não o mesmo engine espacial com física e movimentação contínuas do 5×5.

### Copa Relâmpago

- Torneio de 4 ou 8 franquias reais com bracket de eliminação simples.
- Seleção manual de participantes, prevenção de repetidos e seed reproduzível.
- Motor rápido `simulateQuickGame` efetivamente utilizado em cada partida.
- Simulação isolada e independente de campeonatos de carreira.

## UI e acessibilidade

- Novo CSS isolado `css/evolution-101-500.css`: hero, cartões, filas de jogadores, tabela de concursos, placar e quadra Street, chave eliminatória.
- Responsividade, foco visível de teclado e respeito a `prefers-reduced-motion`.
- Sem substituição dos temas atuais ou dos estilos de Carreira.

## Testes

- 215 testes pré-existentes preservados.
- 72 testes adicionais nesta etapa, incluindo cenários adversariais, determinismo, integridade e uso do motor 2D.
- 287 testes esperados na regressão final.
- Verificação HTTP dos módulos e recursos estáticos.
- **QA visual no Chromium pendente**: o processo de navegador não conseguiu completar no ambiente.
- **QA de integração com a versão privada do usuário pendente**: os prompts 01 e 09 da versão atualizada não estão disponíveis.

## Arquivos deste pacote

- `src/arcade/all-star.js`, `rosters.js`, `street.js`, `tournament.js`
- `src/ui/views/arcade.js`
- `src/ui/views/match-live.js` (somente isolamento do Arcade, não regras de temporada)
- `src/main.js` (rota independente)
- `src/ui/shell.js` (atalhos Arcade)
- `src/ui/views/start.js` (modo Arcade no menu inicial)
- `css/evolution-101-500.css`, `index.html`
- `tests/evolution-101-500.test.mjs`
- `docs/EVOLUTION-101-500-RELATORIO.md` e `docs/EVOLUTION-173-500-ROADMAP.md`

## Integração segura

**Não substitua a versão privada atual pelo ZIP de referência.** A cópia desta entrega é baseada na Evolution 11–100 e não incorpora suas mudanças privadas 01 e 09. Use o patch e valide conflitos em `src/main.js`, `src/ui/shell.js`, `src/ui/views/start.js`, `src/ui/views/match-live.js` e `index.html`.

Na integração, mantenha `ctx.isolated === true` no `renderLive` de qualquer partida Arcade. Isso evita que `addGame` registre o amistoso em uma carreira aberta. Rode `npm test` e valide no navegador os fluxos de navegação, importação, armazenamento, controles 2D, tela cheia e modo Street antes de distribuir uma build.
