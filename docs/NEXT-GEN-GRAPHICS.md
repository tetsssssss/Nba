# Motor gráfico Next Gen — entrega inicial

## Escopo implementado

O `MatchSim` permanece a fonte única de placar, tempo, posse, bola, atletas e eventos. `src/match/renderer3d.js` é um renderizador WebGL2 sem dependência externa e sem escrita no motor. Usa a mesma arte temática da quadra do 2D como textura de piso; desenha volume para atletas, arquibancada, reservas, mesa, suportes, tabelas, aros e bola. Movimentos básicos de pernas, braços, salto e drible derivam dos atributos e eventos existentes. Câmeras: lateral, diagonal, bola, cesta e replay. O replay reproduz apenas a janela recente de snapshots que o motor guardou.

Os controles de velocidade agora oferecem 0,75x, 0,80x, 0,90x, 1x, 2x, 4x e 8x. O relógio continua avançando pelo mesmo passo fixo da simulação; a velocidade só altera a quantidade de tempo processada entre quadros.

`src/ui/views/match-live.js` integra a troca dos visuais e mantém HUD, técnico, box score, sonoplastia e resultado comuns. O botão Replay 3D projeta os últimos snapshots reais do motor enquanto a simulação fica pausada; não grava ou altera o resultado. WebGL2 indisponível ou erro de desenho aciona 2D com aviso. O contexto 3D é liberado ao sair da partida. As preferências novas são locais e opcionais, sem mudar o esquema IndexedDB. O 2D preserva retratos e ganhou brilho do piso, silhueta mais expressiva quando falta foto, marca de movimento e indicador de posse.

## Sprints e estado

| Etapa solicitada | Estado | Evidência / limite |
| --- | --- | --- |
| Auditoria e restauro | Testado | Inspeção de `renderer.js`, `court-art.js`, `sim.js`, `match-live.js`, `soundscape.js`; ZIP anterior à edição com 247 entradas. |
| 2D premium | Parcial | Novos detalhes acima; nem todas as animações e identidades de competição foram retrabalhadas. |
| Arena 3D MVP | Implementado em código, aceitação pendente | WebGL2 com geometria, textura e cinco câmeras; não houve captura de quadro no navegador. |
| HUD | Parcial | Indicador de posse somado ao placar e painéis já existentes. |
| Replays cinematográficos | Parcial | Reprodução 3D dos últimos snapshots gravados; não há editor de lances, câmeras automatizadas nem replay Street. |
| Street Next Gen | Parcial | Diagrama do Street clássico ganhou piso urbano e identidade própria; quadra espacial e replay Street requerem outra etapa. Motores 1x1/2x2/3x3 intactos. |
| Áudio sincronizado | Preservado | `soundscape.js` continua lendo os eventos reais na tela de partida; não foi modificado. |
| Interface geral | Pendente | Configurações e comandos da partida atualizados; menus globais não reformulados. |

## Testes e desempenho

- Baseline: `npm test` = 681/681 aprovados.
- Após implementação: `node --test tests/graphics3d.test.mjs` = 4/4 aprovados; `npm test` = 685/685 aprovados.
- Auditoria anterior à atualização do manifesto: 240 arquivos inalterados, 6 editados, zero ausentes. Os demais arquivos novos serão incluídos no manifesto final.
- FPS real, memória JS/GPU, mobile, console, screenshots antes/depois e comparação de câmeras: **não medidos**. A ferramenta de navegador recusou `http://localhost:5173` por política de URL e proibiu outra via de automação para o mesmo endereço. Não se afirma meta de FPS.
- Resoluções máximas configuradas: DPR 1/1,5/2 conforme qualidade; multidão 24/48/96; esfera 8/12/16 segmentos. São limites de implementação, não benchmarks.

## Riscos e continuação

- Confirmar visualmente compilação dos shaders, textura, orientação da câmera, menus, tamanhos de tela e fallback em browser WebGL2 antes de recomendar 3D como padrão.
- A torcida e a sombra do 3D usam geometrias simples; não há rigging completo, números oficiais nas camisas ou mapa de sombras da GPU. Os dados base não fornecem número de camisa, então o renderizador não inventa esse atributo.
- O 3D usa o `MatchSim` das partidas 5x5. Street espacial é outro motor e requer integração própria.
- Saves existentes não recebem migração porque as novas preferências ficam em LocalStorage. Uma recarga de save em navegador ainda deve ser repetida após esta mudança.

## Uso e restauro

Execute `npm start`, abra `http://localhost:5173`, entre em Jogo rápido e use **Visual: 3D**, **Câmera** e **Qualidade**. Se necessário, restaure o conteúdo de `../NBA-Universe-Manager-pre-nextgen-2026-10-09.zip` em uma pasta separada. Não extraia sobre uma carreira sem antes exportar os saves do navegador.
