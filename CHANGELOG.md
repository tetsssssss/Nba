## 2026-10-14 | Street NBA/WNBA, All-Star e acessibilidade (camada independente)

- Street NBA/WNBA: box score de 1 e 2 pontos, aproveitamento, roubos e perdas por atleta e equipe; cálculo derivado de eventos reais.
- Street NBA: destaque visual do atleta envolvido no último lance (incluindo defensor em roubos), formato acessível correto e invalidação de partidas quando a escalação/configuração muda.
- Street WNBA: alterações de formato, franquia, atleta, meta ou semente removem placares/replays obsoletos antes da nova partida.
- All-Star: concurso de 3 pontos mostra acertos/25 bolas e aproveitamento; atributo zero passa a ser tratado como zero, sem substituição implícita por 50.
- Cache PWA versionado para publicação; sem mudança em IndexedDB, Carreira NBA, playoffs, offseason ou contratos.
- Testes e limites: ver docs/EVOLUCAO-STREET-2026-10-14.md.

## 2026-10-13 | Arcade, Street, WNBA e PWA (atualização isolada)

- Street NBA: corrigida troca 1×1/2×2/3×3; validação explícita de escalações.
- Roster Studio: fantasy draft com semente, desfazer/refazer e confirmação de restauração.
- All-Star: rótulos de controle coerentes com o draft de capitães.
- Street 2D WNBA: aproveitamento, roubos e anúncios acessíveis por posse.
- Acessibilidade: redução de movimento e fim de jogo sem ações inertes.
- PWA: versão de cache atualizada e verificação cruzada service worker/catálogo.
- Suíte: 744 testes aprovados, incluindo 13 novos. Chromium localhost bloqueado; Android real pendente.
- Documentação: `docs/EVOLUCAO-ARCADE-WNBA-2026-10-13.md`.

# Changelog

## 2026-10-09 — menu inicial inspirado em MyGM/MyLEAGUE

- Reorganizado o menu inicial para uma seleção visual de modos com título, separador, cartões horizontais, destaque vermelho, arte em alto contraste e descrições curtas.
- Mantidas todas as rotas existentes de carreira, jogo rápido, Arcade, WNBA, NBB, EuroLeague, EuroBasket, saves e configurações.
- O visual usa apenas a camada de apresentação; nenhum modo ou save foi alterado.

## 2026-10-09 — Carreira NBA 2.5D Arcade

- Adicionada camada visual 2.5D Arcade para partidas da Carreira, selecionável no controle **Visual** e em Configurações.
- Incluído atlas original de poses estilizadas de drible, corrida, passe e arremesso, com silhueta em Canvas como reserva durante o carregamento da imagem.
- Adicionados uniformes e números por equipe, sombras suaves, destaque do portador, postura defensiva, bola animada, banco, torcida e quadra em perspectiva.
- Incluídas quatro câmeras Arcade: transmissão, próxima, acompanhando a bola e atrás da cesta.
- O renderizador apenas lê `MatchSim`; saves, estatísticas, placar, relógio, substituições e resultados não mudam.
- Incluídos testes de câmeras, poses e projeção sem mutação do estado.

## 2026-10-09 — início do motor gráfico Next Gen

- Catálogo NBB ampliado com três referências pesquisadas via Google Imagens e conferidas em fontes identificadas: Corderro Bennett, Hugo Nicolini e Rafael Mineiro.
- Catálogo EuroLeague ampliado com quatro referências pesquisadas via Google Imagens: Juhann Begarin, Nick Calathes, David Lighty e Shaquille Harrison.
- Adicionadas velocidades de acompanhamento 0,75x, 0,80x e 0,90x aos controles da partida e às configurações; o campo manual também aceita vírgula decimal.
- Criado renderizador WebGL2 isolado do `MatchSim`, com quadra temática, arquibancada, banco, mesa, aros, dez corpos articulados, bola e cinco câmeras.
- Adicionado replay 3D curto a partir dos snapshots reais do motor, sem alterar o estado vivo da partida.
- Adicionada troca 2D/3D na partida, três níveis de qualidade, limite de resolução e fallback para 2D.
- Refinados o brilho da quadra 2D, a silhueta sem fotografia, a leitura da corrida e o indicador de posse no HUD.
- Dada identidade urbana ao diagrama de posse do Street clássico, preservando seus formatos e resultados.
- Mantidos os sistemas de jogo, modos, fotografias, sonoplastia, Carreira, playoffs e armazenamento.
- Incluídos testes focados no estado visual da bola, configurações e falta de WebGL2.

O motor 3D ainda requer validação visual e de desempenho em navegador. Veja `docs/NEXT-GEN-GRAPHICS.md`.

## 12/10/2026: Babylon.js local opcional (integração modular)
- Adicionado renderizador Babylon.js procedural, carregamento UMD local e opção GLB Blender, sem CDN ou mudança no motor esportivo.
- Botão de partida, seleção visual nas configurações, câmeras, fallback 2D/WebGL2 e novos testes de leitura sem mutação e renderização simulada.
- Runtime Babylon real, GLB real e performance visual ainda pendentes de homologação no computador do usuário.

## 2026-10-12 — Broadcast Next Gen + Netlify + Xiaomi PWA
- Vinhetas de pré-jogo, quarto, tempo técnico e final sobre a partida, sem mudar MatchSim.
- Apresentação de titulares e estatísticas reais em resumos; título contextual WNBA/All-Star/Playoffs se houver indicação do contexto.
- Narração TV opcional via SpeechSynthesis do navegador para lances registrados relevantes.
- Instalação PWA em navegadores compatíveis: manifest, ícones, service worker e catálogo offline local.
- Distribuição Netlify estática com build próprio; fonte e ferramentas locais mantidas no pacote navegador.
- Configuração MIME para manifest e WebAssembly no servidor local.
- Testes novos de estado, apresentação DOM, narração e PWA.
