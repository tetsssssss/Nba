# Motor de Partida 2D — Relatório de Handoff

**Sessão 2 · 05/10/2026 · Fase 5 iniciada (fases A–F do motor funcionais, G parcial, H básica)**

Complementa `docs/HANDOFF.md` (fundação do projeto). Em caso de divergência, o código vence.

## Como usar

- No jogo: menu **Partida 2D** → *Partida completa* (amistoso entre duas franquias) ou *Sandbox* (uma posse controlada).
- Calibração sem navegador: `node tools/sim-match.mjs 10` (10 partidas com elencos reais, ~1.500× tempo real).
- Testes: `npm test` (39 testes; 11 do motor em `tests/match.test.mjs`).

## Estado atual do motor 2D

Não existia motor antes desta sessão. Agora há uma simulação espacial completa de partida:
dez jogadores e a bola com posição, velocidade e estado próprios, passo fixo de 1/30 s,
posses que emergem de movimento + decisão + resolução de habilidade no estado real da jogada.
Não há "sortear o resultado da posse e tocar uma animação" em nenhum ponto.

Arquitetura (`src/match/`), simulação separada da renderização:

| Módulo | Papel |
| --- | --- |
| `config.js` | Geometria da quadra e **todos** os parâmetros de calibração (`TUNE`) |
| `profiles.js` | Camada única atributos → comportamento (`getMovementProfile`, `getBallHandlingProfile`, `getShootingProfile`, `getFinishingProfile`, `getPassingProfile`, `getDefensiveProfile`, `getReboundProfile`, `getScreenProfile`), curvas não lineares, fadiga, arquétipos |
| `movement.js` | MovementEngine + CollisionSystem |
| `ball.js` | BallEngine |
| `shot.js` | Contest e qualidade de arremesso |
| `offense.js` | DecisionEngine do ataque (portador e sem bola), dribles, post, bloqueios |
| `defense.js` | IA defensiva |
| `sim.js` | MatchSimulation: relógio, posse, faltas, lances livres, substituições, estatísticas, métricas, snapshots |
| `scenarios.js` | Sandbox e jogadores sintéticos para teste |
| `renderer.js` | MatchRenderer (Canvas). Só lê o estado |

## Movimentação

- **Aceleração/desaceleração**: velocidade nunca muda instantaneamente; aceleração limitada pelo atributo (11–36 pés/s²), frenagem própria (equilíbrio), chegada suave ao alvo, zona morta contra microajuste. Teste automático garante: maior deslocamento por passo < 1,7 pé e aceleração própria < 62 pés/s².
- **Direção**: mudança brusca custa velocidade conforme o ângulo e a agilidade. Orientação corporal é separada do deslocamento (defensor desliza olhando o atacante; pivô recebe de costas).
- **Modos**: walk, jog, run, sprint, slide (lateral defensivo) e set (plantado). Velocidade com bola é menor e depende do controle de bola.
- **Pathfinding**: steering — desvia de corpos à frente para o lado livre; contato intencional (marcador, bloqueio, post) ignora o desvio.
- **Colisão**: suave, proporcional à massa (peso × força); quem está plantado é ~5× mais difícil de deslocar. Sem pinball.
- **Spacing**: 13 posições conceituais (top, slots, wings, corners, dunker, elbows, post). Quem está sem bola troca de espaço quando fica encavalado, quando a infiltração vem em sua direção ou quando perde a linha de passe. Espaçamento médio medido: ~15 pés.
- **Teletransporte**: só em bola parada (início de período, lateral, lance livre). Depois de cesta não há: alguém busca a bola e repõe.

## Técnica

- **Drible**: crossover, entre as pernas, pelas costas, in-and-out, hesitation, stepback, giro. Cada um é uma finta real (deslocamento) seguida de mudança de direção; a separação nasce do atraso de reação do defensor, que projeta o movimento do atacante. Ankle breaker raro, exige defensor comprometido com o lado errado + grande diferença técnica. Risco de perda proporcional à pressão e ao controle.
- **Passe**: peito, quicado, por cima, inversão, longo, ponte aérea, mão a mão — escolhido pelo contexto. A bola viaja com velocidade própria, com antecipação do recebedor (lead pass) e erro por distância/pressão/habilidade. Interceptação só para quem está fisicamente na linha, já reagiu e alcança a altura.
- **Arremesso**: gather (soltura rápida dá menos tempo ao closeout) → contest calculado por distância, posição entre arremessador e cesta, alcance/envergadura/impulsão e percepção → probabilidade por tipo (catch-and-shoot, pull-up, stepback, fadeaway, gancho, floater), distância, movimento, fadiga e clutch moderado. Cinco níveis de contest. Arco parabólico.
- **Bandeja / enterrada**: escolhidas por distância, impulso e habilidade; enterrada no congestionamento vira bandeja contestada. Toco e falta saem do contest (posição, alcance, timing, disciplina), não de sorteio isolado.
- **Post**: backdown com velocidade definida por força × massa contra força × massa × defesa interior, perdendo efeito com o tempo; saídas: gancho, fadeaway, dropstep, passe.
- **Screen**: corpo plantado que o marcador precisa contornar. Depois: roll, pop ou slip. Coberturas: drop, switch, hedge (automático pelo perfil do pivô). Menos detalhado: ICE, blitz/trap, re-screen (não implementados).

## IA

- **Decisão do portador (5 Hz)**: cada opção (arremessar, passar para cada companheiro, infiltrar, drible de criação, post, pedir bloqueio, segurar) recebe pontuação em pontos esperados, comparada ao valor de continuar a posse (que cai com o relógio). Entram tendências reais do jogador e variância controlada pelo QI — a leitura, com seu erro, persiste ~1,5 s. Quem enxerga pouco não vê a opção do lado fraco. Quem cria o próprio arremesso assume mais volume.
- **Sem bola (2 Hz)**: ocupar espaço, cortar (backdoor quando negado ou quando o marcador olha a bola), abrir/relocar, bloquear, rolar/abrir, selar no post, atacar o rebote ou recompor.
- **Defesa (todo passo)**: marcação bola-homem-cesta; marcador da bola com tempo de reação e antecipação; longe da bola afunda para a ajuda (menos em arremessadores); ajuda na infiltração escolhida por posição e perfil; closeout (quem fecha mal passa do ponto); recover quando batido; box out.
- **Transição**: reconhece vantagem numérica (2x1, 3x2), passa para quem está à frente, entrega do pivô ao armador.
- **Fim de relógio**: paciência cai com o shot clock; segura para o último arremesso do período.
- **Rotação**: substituições automáticas em bola parada por energia e faltas; titulares voltam descansados; tempo técnico quando alguém está no limite.

## Bola

Estados: controlada, passe, arremesso, solta/rebote, parada. Posição x/y, altura z, velocidade, rotação visual.
No erro, a bola sai do aro para um ponto físico (arremesso longo → rebote longo) e os jogadores reagem com atraso;
a disputa considera proximidade, alcance, técnica e box out. Bola solta de roubo/toco é disputada de verdade.
Recepção e interceptação usam teste de varredura do trecho percorrido no passo.

## Renderização e ferramentas

- Canvas com fotos reais nos marcadores (resolver central), anel da franquia, indicador de orientação, energia, nome.
- Animações por transformação refletindo o estado: passada, inclinação na corrida, postura defensiva, salto no arremesso/contest/enterrada, queda no ankle breaker, bloqueio plantado, drible mão-chão, bola cruzando o corpo no crossover.
- Bola com sombra, altura, arco, rastro e rotação. Avisos discretos: BLOQUEIO, TOCO, ROUBO, INTERCEPTAÇÃO, FALTA, ENTERRADA.
- Câmeras: dinâmica, superior, TV, lateral — com zona morta, interpolação e zoom automático (fecha em meia quadra, abre na transição).
- Velocidades 1x/2x/4x/8x/customizada com delta time correto; simular até bola parada, fim do quarto, 2 minutos finais, jogo apertado, fim.
- Debug: pausa, passo de 1 quadro, passo de 100 ms, semente reproduzível, overlay (alvos, vetores, marcações, linhas de passe por risco, espaços, ajuda, ponto do rebote) e painel com ação, pontuações das opções, qualidade/contest do arremesso, marcador e métricas.
- Sandbox: isolação, post, arremessador livre, closeout, pick and roll, contra-ataque 3x2, meia quadra 5x5; escolha de atacante, defensor e ação inicial; "repetir posse".
- Replay: `sim.snapshot()` e buffer opcional (`recordReplay`) prontos; sem interface.

## Testes

`tests/match.test.mjs` — 11 de 11 (suíte completa: 39 de 39):

1. Armador rápido passa do pivô lento no perímetro; contra o stopper a vantagem é ≥ 1,5 pé menor.
2. Pivô forte ganha mais terreno no post contra guard do que contra pivô — e não empurra indefinidamente.
3–4. Arremessador livre: nível "livre", chance > 40%; com marcador colado cai ≥ 8 pontos de qualidade; closeout chegando aumenta o contest previsto.
5. O bloqueio é plantado e o marcador da bola bate nele em ≥ 35% das posses.
6. Contra-ataque 3x2 reconhecido (3 contra 2, vantagem) e a bola chega à área de finalização.
7. Passe através de defensor: risco geométrico sobe > 0,25 e há interceptações reais.
8. Fadiga: velocidade cai entre 3% e 15%; reação defensiva piora.
9. Física: ninguém se teletransporta; aceleração limitada; passe nunca "pula".
10. Determinismo: mesma semente = mesma partida.
11. Identidade: slasher finaliza muito mais no aro; sniper arremessa muito mais de três; especialista defensivo arremessa menos.
12. Estatísticas com elencos reais dentro de faixas plausíveis; rotação usa o banco.

No navegador: partida completa e sandbox (PnR com overlay de debug e câmera TV) renderizando sem erros de console.

## Estatísticas (10 partidas, elencos reais)

| Por time | Motor | NBA |
| --- | --- | --- |
| Pontos | 129,2 | ~115 |
| Posses | 107,5 | ~100 |
| FG% | 47,7% (47,0/98,5) | 47% (~89 tentativas) |
| 3P% | 36,6% (45,0 tentativas) | 36% (~37) |
| LL% | 75,4% (24,8 tentativas) | 78% (~22) |
| Rebotes / ofensivos | 54,8 / 12,4 | 44 / 11 |
| Assistências | 29,1 | 26 |
| Roubos / tocos | 9,6 / 5,5 | 8 / 5 |
| Erros | 11,2 | 14 |
| Faltas | 17,6 | 20 |

Métricas de execução por time: 109 drives, 65 dribles de criação, 75 bloqueios (11 com contato registrado),
134 cortes, 325 passes, 47 toques no garrafão, 15% de arremessos livres, qualidade média 75, contest médio 38%.

## Bugs e limitações conhecidas

- **Ritmo ~8% acima do real** e ~10% de arremessos a mais; por isso pontos e rebotes absolutos ficam altos. Percentuais estão no alvo. Alavancas: `POSSESSION_VALUE`, tempo de organização em `offense.js`.
- Bolas de três acima do volume real (45 contra 37); meia distância quase não aparece.
- Erros abaixo do real (11 contra 14).
- Poucos bloqueios geram contato registrado (11 de 75): o marcador costuma desviar antes. Vale revisar o desvio do defensor da bola.
- Muitos cortes (134 por time) — o texto dos lances fica repetitivo.
- Substituições em excesso (~70 por jogo somando os dois times).
- Sem controle do técnico: tática, rotação manual e timeouts do usuário não existem (cobertura de PnR é automática).
- Não implementados: zona, ICE, blitz/trap, dobra, re-screen, alley-oop como finalização própria, 3 segundos, 8 segundos, goaltending, jump ball.
- A partida é amistosa: não grava resultado nem estatísticas na carreira.
- Canvas depende de `requestAnimationFrame`: com a aba em segundo plano a animação desacelera (a simulação continua correta).

## Regressões

Nenhuma. Os 28 testes anteriores continuam passando; o único arquivo pré-existente com lógica alterada foi `src/media/photos.js` (acréscimo de `loadPlayerImage`).

## Arquivos

Novos: `src/match/{config,profiles,movement,ball,shot,offense,defense,sim,scenarios,renderer}.js`, `src/ui/views/match.js`, `tools/sim-match.mjs`, `tests/match.test.mjs`, `docs/MOTOR-2D.md`.
Alterados: `src/main.js` (rota `/match`), `src/ui/shell.js` (menu), `src/core/roadmap.js`, `src/media/photos.js`, `css/components.css`.

## Próximo passo

1. Fechar a calibração de ritmo e do perfil de arremessos (meta: 100 posses, 89 arremessos, 37 de três, 14 erros).
2. Fazer o marcador da bola brigar com o bloqueio (go over / go under explícitos) para o PnR gerar mais vantagem real.
3. Controle do técnico (Fase 6): ritmo, cobertura de PnR, prioridade de jogadores, rotação e timeouts — os pontos de entrada já existem (`team.coverage`, `TUNE`, `substitutions()`).
4. Ligar a partida à carreira quando o calendário existir (Fase 4): gravar placar, box score e fadiga.
