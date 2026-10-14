# Calendário e temporada — handoff

Sessão de 6 out 2026 · branch `mega-evolucao`. Fecha a primeira metade da Fase 4.

## O que existe agora

- **Calendário** (`src/season/schedule.js`): 1.312 jogos, 82 por franquia e 41 em casa. Divisão 3×4, conferência 2×4 + 10×3, outra conferência 16×2. Ninguém joga duas vezes no dia nem três dias seguidos; All-Star break livre. Gerado pela semente do save. **É um calendário do jogo, não o real** — as datas (`league.json → calendar`) são decisão de design e precisam de validação se houver datas oficiais.
- **Avanço do tempo** (`src/season/season.js`, `src/ui/sim-control.js`): "Avançar dia" na barra superior e "Simular até" próximo jogo, 7 dias, 30 dias, All-Star break ou fim da temporada, com progresso e botão de parar. Temporada inteira em ~1,3 s no navegador.
- **Jogo do usuário:** em dia de jogo o botão vira "Jogar vs/@ adversário" e abre o motor 2D com times e mando fixos; o resultado vale para campanha, classificação e estatísticas. Quem preferir avança o dia e o modelo rápido resolve.
- **Simulação rápida** (`src/season/quick-game.js`): modelo estatístico posse a posse para os outros jogos da liga, alimentado pelos mesmos atributos e tendências. Não é um segundo motor 2D: não tem quadra, só produz o box score.
- **Classificação** (`/standings`): por conferência, com zonas de playoffs e play-in em texto, casa/fora, conferência, últimos 10, sequência e saldo; aba de líderes com fotos.
- **Calendário** (`/calendar`): os 82 jogos do time por mês, ou a rodada da liga dia a dia.
- **Página do jogo** (`/game/:id`): placar, parciais e box score; indica se foi jogado no 2D ou simulado.
- **Central do GM:** próximo jogo, último resultado, classificação da conferência, líderes da temporada em curso.
- **Perfil do jogador:** a linha de estatísticas passa a mostrar a temporada em curso.
- **Expansion Draft automático** (`src/season/expansion.js`): na véspera da noite de abertura, cada franquia protege os 7 mais valiosos, perde no máximo 2, e Seattle e Las Vegas alternam 14 escolhas cada. O resultado aparece numa janela e nas notícias.

## Banco de dados

- **Migração v2** (nova, sem alterar a v1): stores `boxScores` e `playerSeasons`. Saves v1 migram ao abrir e ganham calendário na primeira abertura.
- O calendário fica em `games`; o box score de cada jogo, separado em `boxScores`, para o calendário ficar leve em memória.

## Calibração do modelo rápido (temporada completa, por time)

| | Modelo rápido | NBA |
| --- | --- | --- |
| Pontos | 114,4 | ~115 |
| FG% | 47,6 (42,4/89,2) | 47 |
| 3P% | 36,8 em 35,2 | 36 em ~37 |
| LL% | 77,0 em 21,5 | 78 em ~22 |
| Rebotes | 49,5 | 44 |
| Assistências | 24,0 | 26 |
| Roubos / tocos | 7,5 / 4,4 | 8 / 5 |
| Erros / faltas | 13,3 / 19,3 | 14 / 20 |
| Mandante vence | 55% | ~55% |
| Prorrogações | 1,8% | ~6% |

Líderes numa temporada de teste: 34,0 pontos, 15,8 rebotes, 10,2 assistências. Campanhas de 66-16 a 17-65.

## Testes

64 de 64 (7 novos em `tests/season.test.mjs`): fórmula de confrontos, datas válidas, determinismo, Expansion Draft, registro do jogo rápido, classificação e temporada inteira.
No navegador: criar carreira → simular até o primeiro jogo (Expansion Draft) → jogar o jogo oficial no 2D → campanha 1-0 → simular 30 dias → classificação, líderes, calendário, box score → simular até o fim → recarregar e conferir persistência. Sem erros de console.

## Limitações conhecidas

- **Sem play-in, playoffs, prêmios e offseason:** ao fim dos 82 jogos a carreira para em "Temporada regular encerrada".
- **Expansion Draft não é interativo:** o usuário não escolhe protegidos nem picks, mesmo sendo uma das franquias novas.
- **Lesões congeladas:** quem está "Fora" no banco de dados inicial nunca volta, e ninguém se machuca. Explica campanhas muito ruins de alguns times.
- **Elencos acima de 15** não são cortados antes da estreia.
- **Dois modelos de partida:** o jogo do usuário no 2D e os da liga no modelo rápido não produzem estatísticas idênticas (o 2D tem menos faltas e mais rebotes).
- **Modelo rápido:** poucas prorrogações; rebotes totais altos; não usa a rotação nem as táticas definidas pelo usuário.
- Fadiga entre jogos e jogos em dias seguidos não têm efeito.
- Desempate da classificação simplificado (aproveitamento, campanha na conferência, saldo).

## Próximos passos

1. Play-in e playoffs (chaveamento, séries melhor de 7) e prêmios da temporada.
2. Virada de temporada: offseason, envelhecimento, contratos que expiram.
3. Lesões e retorno de lesionados; corte para 15 antes da estreia.
4. Expansion Draft interativo (protegidos e picks do usuário).
5. Rotação do usuário valendo também na simulação rápida.
