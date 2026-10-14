# NBA Universe Manager — handoff da mega evolução

Sessão de 6 out 2026 · versão 0.2.0 · branch `mega-evolucao` (parte de `layout-ux`).

## 1. Estado inicial encontrado

- 41 testes passando; app funcional com shell, Central do GM, elenco, perfil, comparação e partida 2D amistosa.
- Entrada única: "Nova carreira". A partida só abria dentro de uma carreira e não deixava rastro no save.
- Partida sem nenhum comando do usuário além de velocidade e câmera; substituições e tempos só da IA.
- Configurações numa tela só, sem sliders de simulação; multiplicadores de dificuldade só no assistente.
- Saves como lista administrativa; importação validava apenas o campo `format`.
- `Math.random` em dois pontos: id de save e rótulo de semente da partida. Nenhum em lógica de jogo.
- **Problema herdado que o relatório anterior não apontou:** o melhor criador de cada time monopolizava o ataque. Em 8 partidas da versão anterior, cestinhas de 57 a 70 pontos e 39% dos arremessos do time num só jogador; titulares com 37–41 minutos.

## 2. Fotos

- **Auditoria** (`npm run photos:audit`, refeita): 619 jogadores, **601 com foto** (597 no CDN da NBA, 545 na ESPN, 541 nas duas), 18 sem foto em nenhuma fonte — novatos e convidados de camp. Nenhuma inconclusiva. Eram 599 na sessão 1.
- **Sem regressão:** quem não tem foto continua com a silhueta neutra, nunca iniciais.
- **Cache de sessão:** `photos.js` lembra a URL que carregou por jogador/tamanho; os próximos avatares vão direto nela (sem tentar fonte que falha, sem piscar). Os bytes ficam no cache HTTP do navegador; entre sessões, o manifesto diz qual fonte funciona. Não criei um cache persistente próprio: duplicaria o do navegador.
- **Pré-carregamento limitado:** elenco do usuário ao abrir a Central; os 10 melhores de cada time ao escolher o confronto. Nunca centenas.
- **Tamanhos:** xs 24 · sm 32 · md 44 · lg 72 · xl 120 · hero 168 (novo: abertura e destaques).
- **Onde entraram fotos:** estrela da franquia na tela inicial, líderes do elenco, confronto da partida, quintetos ao vivo, substituições, cartão de fim de jogo, logo no círculo central da quadra.
- Arquivos: `src/media/photos.js` (`preloadPlayers`, `loadTeamLogoImage`, `photoCacheStats`), `data/seed/photo-manifest.json`.

## 3. Layout

- **Abertura do jogo** (`start.js`): Continuar com a franquia, temporada, campanha e cargo do último save; Nova carreira, Jogo rápido, Modo 2D, Commissioner, Saves, Configurações; palco com logo e foto da estrela nas cores da franquia; grade de modos com status.
- **Menu lateral:** só o que funciona nos grupos principais (Minha franquia, Liga); o que ainda não existe fica em "Em breve", recolhido, com a fase. Modos de jogo escondem áreas (Coach Mode sem contratos).
- **Central do GM:** ações Jogar / Elenco / Rotação / Salvar; novos cartões Líderes do elenco, Último jogo e Observados.
- **Saves:** cartões com capa gerada (cores, logo, temporada), modo, dificuldade, data no universo e último acesso.
- **Configurações:** abas Geral, Interface, Partida 2D, Simulação, Dificuldade, Save, Acessibilidade, Carreira.
- **Assistente de carreira:** passos novos de Modo e Experiência.
- CSS novo em `css/game.css`, só com tokens.

## 4. Partida 2D

- **Quadra:** madeira com tábuas, garrafão e faixa externa na cor do mandante, logo no círculo central, nome nas linhas de fundo, iluminação com cantos escurecidos.
- **Jogadores:** anel da franquia, brilho dourado em quem tem a bola, nome em etiqueta legível, sombra que reage ao salto.
- **Bola:** maior, com contorno claro, ao lado do corpo no drible, rastro opcional.
- **Avisos de lance:** ROUBO, TOCO, FALTA, ERRO, TROCA, DROP, HEDGE, LIVRE, SUFOCADO, ENTERRADA — cerca de 1,3 s cada, desligáveis.
- **Placar de transmissão:** times, pontos, período, relógio, posse, tempos restantes, faltas coletivas e BÔNUS.
- **Painel lateral:** Lances, Box score ao vivo, Quintetos (energia e faltas), Estatísticas (parciais e comparação), Debug.
- **Destaques:** sequências ("12-2"), pontos seguidos, 3/5 faltas, double e triple-double, 30/40/50 pontos.
- **Câmera:** as quatro mantidas, suavização configurável, zoom automático opcional.
- **Interação (novo):** Tempo, Substituições, Táticas e sete táticas rápidas; atalhos Espaço, 1–4, T, B, X.

## 5. Dinâmica

- O usuário agora **comanda**: pede tempo (7 por jogo; sai na bola parada ou com a posse), agenda trocas visualmente (entram na próxima bola parada) e muda ritmo, prioridade ofensiva, jogador prioritário, cobertura do pick and roll, pressão, garrafão, rebote, transição e matchups.
- Nenhuma instrução aplica resultado: muda vieses da decisão dos jogadores e posicionamento defensivo. Testes medem o efeito (ver 9).
- A IA do adversário só pede tempo e substitui; ainda não ajusta tática.
- Placar "pulsa" ao pontuar, cartão de fim de jogo, indicador "Salvando… / Salvo", telas sem piscar.

## 6. Sliders

Persistência: `localStorage` (`num-settings.sliders`), exceto dificuldade, que fica no save (`career.modifiers`). Todos têm dica, marca do padrão no trilho e "Restaurar padrão" por grupo.

**Simulação** — padrão 100%, faixa 50–150%, passo 5. Presets: Casual, Simulação, Hardcore, Personalizado.

| Slider | Efeito no motor |
| --- | --- |
| Ritmo | tempo de armação do ataque e paciência inicial |
| Frequência de arremessos | régua para aceitar um arremesso |
| Bolas de três / Meia distância / Ataque ao aro | atratividade de cada zona na leitura |
| Erros | imprecisão de passe, erros não forçados, parte dos roubos |
| Faltas | chance de falta no arremesso e no bote |
| Rebotes ofensivos | peso do ataque na disputa |
| Roubos | interceptação e bote |
| Tocos | chance de um contest forte virar toco |

**Partida 2D** (só desenho) — Tamanho dos jogadores 60–160 · Foto no marcador 80–140 · Bola 60–220 · Suavização da câmera 40–250 · Zoom inicial 70–200 · Tamanho do placar 80–140. Chaves: câmera padrão, zoom automático, avisos, rastro, nomes, energia, destaques. Velocidade padrão em Geral.

**Interface** — Escala da interface 85–125.

**Dificuldade** (por carreira) — os dez multiplicadores existentes, 50–150%, com presets Casual a Hardcore. Valem quando cada sistema existir; nenhum afeta a partida.

Não implementado: "velocidade do lance a lance" (o texto acompanha a velocidade do jogo).

## 7. Modos de jogo

| Modo | Status | Observação |
| --- | --- | --- |
| Jogo rápido | **FUNCIONAL** | com ou sem carreira; você comanda um time |
| Espectador | **FUNCIONAL** | IA nos dois lados |
| Sandbox 2D | **FUNCIONAL** | cenário, atacante, defensor, ação, cobertura, distância do marcador, ajuste de atributos |
| NBA Universe | **PARCIAL** | sem calendário, temporada simulada, trades ou draft |
| Franchise | **PARCIAL** | cargo fixo de GM, sem God Mode; mesmas pendências |
| Coach Mode | **PARCIAL** | cargo de técnico; menu e Central sem contratos e cap; a "diretoria IA" ainda não age |
| Commissioner | **PARCIAL** | God Mode travado ligado e troca de franquia pelo selo da barra superior; forçar trades depende da Fase 2 |
| Expansion / Draft / Playoff | **PLANEJADO** | só reservados em `core/modes.js` |

## 8. Saves

- **IndexedDB:** inalterado (um banco por carreira + índice). **Nenhuma migração foi necessária**: jogos usam a store `games` que já existia; o modo fica em `career.mode`.
- **Compatibilidade:** save sem `mode` é tratado como NBA Universe; resumos antigos mostram "—" onde falta dado.
- **Autosave:** mantido, com "Salvando…" na barra; aviso extra opcional.
- **Manual:** tecla S, botão na Central e em Saves.
- **Slots:** "Salvar cópia em novo slot" e "Criar ponto de restauração" clonam o universo (≈1,8 MB por cópia); guardam-se os 3 pontos mais recentes por carreira.
- **Checkpoints automáticos:** `checkpointBefore(evento)` pronto para início de temporada, deadline, playoffs, Draft e free agency — **nada o chama ainda**, porque esses eventos não existem.
- **Exportar / importar:** validação de formato, versão, stores, metadados, franquia do usuário, jogadores quebrados, duplicados e órfãos, com lista de problemas legível.
- **Recuperação:** save que não abre não é apagado; diálogo com Tentar novamente, Exportar backup e Voltar.
- **Partida em andamento:** não é salva. Falta serializar a `MatchSim` inteira (estado do RNG, jogadores, bola, posse, perfis) e restaurar referências entre objetos; hoje partidas só são gravadas ao terminar.

## 9. Testes

- **57 de 57** (41 anteriores + 16 novos em `tests/mega.test.mjs`).
- Novos: definição e persistência dos sliders, presets, modos, validação de save (7 casos), tática, substituição, tempo, matchup, determinismo com sliders, efeito mensurável de ritmo/três/prioridade ofensiva, destaques, registro de jogo.
- Um teste antigo ("o banco é utilizado") falhou durante a recalibração e apontou um defeito real da nova rotação, corrigido.
- **Manual no navegador:** abertura → nova carreira (modo, cargo, time, experiência) → Central → partida → tempo, substituição e instrução → fim de jogo → gravação → recarregar → persistência → saves (cópia) → configurações (sliders, presets, abas) → validação de backup → jogo rápido, espectador e sandbox sem carreira. Sem erros de console.
- **Resoluções:** 1366×768 e 1920×1080 conferidas por medição de estouro nas telas novas sem carreira (abertura, saves, configurações, preparação da partida, assistente). Inspeção visual só a 750 px de largura (limite do painel). As telas dentro da carreira e 2560×1440 não foram reconferidas nesta sessão.

## 10. Performance

- Desenho a ~100 quadros/s no painel de teste, com quadra nova e dez fotos.
- Motor sem desenho: ~1.390× o tempo real.
- Fotos de Canvas continuam em cache (`Image` criado uma vez por jogador).
- Save completo: 1,85 MB em JSON.

## 11. Calibração do motor (16 partidas, por time)

| | Antes | Agora | NBA |
| --- | --- | --- | --- |
| Pontos | 129 | 112,6 | ~115 |
| Posses (contador do motor) | 107,5 | 103,4 | ~100 |
| Arremessos | 98,5 | 87,3 | ~89 |
| FG% | 47,7 | 47,2 | 47 |
| Tentativas de 3 | 45 | 37,8 | ~37 |
| 3P% | 36,6 | 35,2 | 36 |
| Lances livres | 24,8 | 22,4 | 22 |
| Rebotes | 54,8 | 48,8 | 44 |
| Assistências | 29,1 | 23,1 | 26 |
| Roubos / tocos | 9,6 / 5,5 | 8,2 / 5,5 | 8 / 5 |
| Erros | 11,2 | 13,4 | 14 |
| Faltas | 17,6 | 15,2 | 20 |
| Fatia de arremessos do cestinha | 39% | 28% | ~25% |
| Minutos do cestinha | ~40 | ~33 | ~35 |

O que mudou no motor: tempo de armação e paciência inicial (ritmo), viés por zona, erros não forçados no drible (andada, pisar na linha, bola que escapa), **teto suave de uso** (acima de ~23% das finalizações do time o ataque deixa de forçar a bola no mesmo jogador) e **rotação por tempo em quadra** (titular descansa após ~8–10 min e só volta depois de 5).

## 12. Bugs conhecidos

- Poucas faltas (15 contra 20) e assistências abaixo do real.
- O contador de posses do motor superestima em ~3 (a fórmula padrão dá ~100).
- O sistema é sensível: mexer num viés de zona altera ritmo e aproveitamento. Os sliders funcionam, mas valores extremos saem do realismo.
- Screens ainda geram pouco contato; cortes em excesso (herdado).
- A IA adversária não muda tática durante o jogo.
- Escala da interface diferente de 100% usa `zoom` no `<body>`: dicas e canvas foram ajustados, mas menus não foram testados em todas as telas.
- Partida abandonada não é gravada.

## 13. Regressões

- Nenhuma funcional encontrada.
- Mudanças intencionais de comportamento: partidas têm resultado diferente para a mesma semente (recalibração); o menu lateral esconde por padrão os itens futuros; o time do usuário não pede tempo sozinho.

## 14. Arquivos principais

Novos: `src/core/{sliders,modes,save-validation}.js`, `src/match/{tactics,highlights,bridge,exhibition}.js`, `src/ui/views/{match-live,match-coach}.js`, `css/game.css`, `tests/mega.test.mjs`, `docs/MEGA-EVOLUCAO.md`.
Reescritos: `src/core/saves.js`, `src/match/renderer.js`, `src/ui/views/{match,start,saves,settings}.js`.
Alterados: `src/match/{sim,offense,defense,ball,config,scenarios}.js`, `src/core/{world,universe,settings,career-options}.js`, `src/media/photos.js`, `src/ui/{shell,dom}.js`, `src/ui/components/tooltip.js`, `src/ui/views/{home,new-career}.js`, `src/main.js`, `index.html`.

## 15. Próximos cinco passos

1. **Calendário e simulação da temporada (Fase 4)** — é o que destrava os quatro modos de carreira; a ponte `match/bridge.js` já define o registro de jogo e lista os seis passos da integração.
2. **IA do técnico adversário** — ajustar ritmo, cobertura e matchups durante o jogo, para o usuário ter contra quem pensar.
3. **Faltas e contato em bloqueios** — fechar as duas lacunas de calibração que restam.
4. **Rotação manual persistente** — depth chart e minutos definidos fora da partida, usados pelo motor.
5. **Trades e dispensa de jogadores (Fase 2)** — dão função real ao Commissioner e à diretoria IA do Coach Mode.

## 16. Complemento — ginásio e quadras por franquia

Pedido posterior do usuário, antes do calendário.

- **Arquibancada:** fileiras de torcida em volta da quadra (cores do mandante misturadas a neutras), corredores de acesso, mesa do placar e os dois bancos. A torcida é gerada por ruído determinístico, não por `Math.random`.
- **Quadra por franquia** (`src/match/courts.js`): tom e padrão da madeira (tábuas, parquet, espinha de peixe), garrafão, borda de contraste, faixa externa, área tingida dentro do arco, nome nas linhas de fundo e cidade nas laterais. **Precisa de validação:** os 32 temas são inspirados nos pisos clássicos e montados de memória a partir das cores oficiais; não reproduzem um piso de uma temporada específica.
- **Cesta:** tabela, haste, aro maior com contorno branco e rede, desenhados por cima dos jogadores; nas câmeras inclinadas a tabela aparece de perfil.
- **Fotos mais nítidas:** os marcadores passaram a usar o retrato de 1040×760 (antes 260×190), com suavização de alta qualidade.
- **Como é desenhado** (`src/match/court-art.js`): toda a arte estática vai uma vez para um canvas fora da tela e é copiada a cada quadro; a resolução sobe em degraus conforme o zoom. Continua a ~100 quadros/s.
- Limite conhecido: a espinha de peixe do Brooklyn ficou com o desenho grande demais.
