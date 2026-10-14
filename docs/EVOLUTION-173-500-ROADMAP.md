# Evolutions 173–500 — Roadmap técnico (NÃO IMPLEMENTADO)

Este documento separa o trabalho **futuro** do que já está codificado no release Evolution 101–172. Não há alegação de que 328 checkpoints tenham sido executados. Cada faixa é um programa de entrega, com testes e critérios de conclusão.

| Faixa | Programa de evolução | Resultado esperado | Critério de conclusão |
|---|---|---|---|
| 173–190 | All-Star: votação, técnicos, reservas e capitães | Seleção por votos simulados e escalações customizadas, sem carreira | Sem duplicatas; regras e pesos documentados |
| 191–210 | All-Star Weekend 2.0 | Skills Challenge, rodada final dos concursos e recordes locais | Simulação reproduzível, UI acessível, testes de empate |
| 211–230 | Personalização de jogadores | Editor de atleta fictício com posições, atributos e limites | Dados validados, nenhum atleta inserido em saves existentes |
| 231–250 | Roster Studio 2.0 | Perfis de roster, múltiplos pacotes, comparação e undo/redo | Migração de schema, backup, conflitos resolvidos |
| 251–270 | Street: mecânicas espaciais | Engine físico 3×3 ou adaptações verificadas do engine 5×5 | Movimentação real, colisões, revisão de regras e FPS |
| 271–290 | Street: personalização | Quadras, clima visual, uniformes, câmeras e efeitos | Sem alteração das probabilidades por aparência |
| 291–310 | Street: competição | Circuitos configuráveis, ranking local, replays | Historificação apenas em espaço Arcade, sem carreira |
| 311–330 | Street: habilidades | Assinaturas técnicas, energia, estilos de marcação e escolhas | Atributos demonstravelmente relevantes |
| 331–350 | Draft de fantasia e ligas avulsas | Draft com relógio, CPU adversária e liga separada | Persistência independente e torneios reproduzíveis |
| 351–370 | Modos de desafio | Situações históricas, 1-posse, comeback, clutch, buzzer beater | Objetivos mensuráveis e pontuação justa |
| 371–390 | Torneios especiais | Round robin, séries melhor de 3/5/7 e fase de grupos | Chaves e desempates sem estados inválidos |
| 391–410 | Transmissão 2D | Replay, câmeras, placares temáticos e overlays | Sincronização de eventos e baixo custo de render |
| 411–430 | Apresentação de jogadores | Cartões, animações, scouting e foto com fallback | Acessibilidade, responsabilidade com imagem e performance |
| 431–450 | Acessibilidade e responsividade | Teclado completo, contraste, leitores de tela, dispositivos móveis | Testes reais em múltiplos viewports |
| 451–470 | Performance e QA | Benchmarks, CI, testes end-to-end, fuzz de saves Arcade | Regressões automatizadas, tempos monitorados |
| 471–490 | Ferramentas de mod e exportação | Pacotes customizados, importador seguro, documentação | Importação restrita, sem eval e sem sobrescrever carreira |
| 491–500 | Homologação Evolution 500 | Build integrada, migration checks, changelog e release | Todas as áreas jogáveis, QA visual e testes completos |

## Regras transversais

1. Antes de alterar, identifique a versão atual do usuário. Nunca reverta as implementações privadas dos prompts 01 e 09.
2. Todas as melhorias acima devem ser incrementais e isoladas dos saves da carreira até autorização explícita para integrá-las.
3. Cada checkpoint precisa de objetivo, mudança de código, teste automatizado, teste visual quando aplicável e documentação.
4. Não marcar item como concluído por simples criação de uma descrição ou de um teste sem funcionalidade correspondente.
5. Caso haja conflito com `world.js` ou `season.js`, interrompa apenas a integração desse ponto e disponibilize patch isolado; não substitua os arquivos protegidos.

## Prompt mestre de continuação

> Atue como engenheiro sênior de simulação esportiva e frontend. Use o projeto Evolution 101–172 como base técnica de Arcade. Execute o roadmap 173–500 por faixas incrementais e honestamente rastreadas. Comece lendo a implementação e os 287 testes do release, confirme o estado atual de cada recurso e a compatibilidade com os prompts privados 01 e 09. Aprofunde All-Star, Roster Studio, Street, Torneios e outros modos sem modificar Carreira ou saves. Prefira funcionalidades reais a dezenas de contadores cosméticos. Implemente, teste e documente cada faixa com evidências, métricas, resultados de navegador e patch. Preserve dados, mecânicas funcionais, acessibilidade e isolamento do Arcade. Não declare o marco 500 até que todos os critérios da faixa 491–500 estejam validados.
