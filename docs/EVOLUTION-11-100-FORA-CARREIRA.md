# NBA Universe Manager | Evolution 11–100

## Escopo desta entrega

Esta entrega evolui **apresentação e análise da liga fora da carreira** com o novo **NBA Data Studio**. Os números E11 a E100 são **90 checkpoints incrementais verificáveis**, não 90 motores, sistemas de carreira ou reimplementações completas. Cada checkpoint tem um teste de cálculo ou comportamento associado.

**Inalterados:** `src/core/`, `src/season/`, `src/contracts/`, `src/players/`, `src/match/`, `src/ui/views/home.js`, `src/ui/views/team.js`, `src/ui/views/new-career.js` e saves. Não reimplementa nem substitui os prompts 01 (salvamento) e 09 (pós-temporada).

## O que foi entregue

- Nova página `#/data-lab` integrada ao menu Liga, com design responsivo e movimento reduzido.
- **Painel geral:** totais, resultados recentes, próximos jogos, força de elencos, prorrogações e margens.
- **Scouting:** busca sem acentos, país, posição, franquia, conferência, idade, OVR, potencial estimado, ordenação e exportação CSV.
- **DNA vs DNA:** comparação de dois atletas em radar e barras de atributos, com escalas fixas e resumo de vantagens.
- **Franquias:** núcleo (top 5), rotação (top 8), banco (6–10), idade média, jovens e cinco líderes.
- **Partidas:** busca, filtros, fases, datas, adversários, placares, prorrogações, margem, pontos totais e CSV.
- **Confrontos:** histórico de A versus B com mandos, vitórias, pontuações e jogos disputados.
- **Líderes:** 10 métricas por jogo, filtros por franquia e amostra, com exportação CSV.
- **Visual:** gradientes discretos, layout para desktop/tablet/mobile, animações curtas opcionais, estados vazios e foco de teclado.
- **Segurança do jogo:** potencial exato escondido fora do God Mode, exportação CSV protegida contra fórmulas, somente consultas aos Maps existentes.

## Fonte de dados e limites

Os painéis leem somente o universo atualmente carregado. Estatísticas de jogadores são valores **da temporada corrente**. Os resultados dependem de `world.games`, e os históricos não substituem um banco consolidado de todas as temporadas. O ranking por núcleo não prediz vitórias. O potencial de carreira comum usa a faixa estimada existente em `players/potential.js`.

## Evolutions 11 a 100: checkpoints de implementação e verificação

| Evolution | Critério verificado |

|---:|---|
| 11 | gera dados de scouting sem alterar os atletas |
| 12 | busca tolera acentos e nomes compostos |
| 13 | filtro por conferência |
| 14 | filtro por franquia |
| 15 | filtro por posição |
| 16 | idade máxima exclui veterano |
| 17 | piso de overall |
| 18 | teto de overall |
| 19 | potencial mínimo |
| 20 | filtro por país com string exata |
| 21 | DNA de cinco grupos não inventa atributos ausentes |
| 22 | percentil baseado no OVR dos atletas avaliados |
| 23 | gap de potencial correto |
| 24 | gap ausente permanece desconhecido |
| 25 | ordenação por potencial |
| 26 | ordenação crescente por overall |
| 27 | combinação de filtros resulta em interseção |
| 28 | campo desconhecido é preservado sem contaminar classificação |
| 29 | classificações não mutam Maps fornecidos |
| 30 | scouting não inclui jogador com overall ausente no filtro |
| 31 | cria três franquias mesmo com elenco vazio |
| 32 | núcleo é média dos cinco maiores atletas disponíveis |
| 33 | banco desconhecido permanece nulo sem banco |
| 34 | franquia sem elenco não recebe força fabricada |
| 35 | idade média usa apenas idades válidas |
| 36 | detecta jovens com menos de 25 |
| 37 | identifica líder de franquia |
| 38 | equipes ordenadas por núcleo |
| 39 | filtro textual ignora acentos |
| 40 | filtro de conferência de franquias |
| 41 | isola temporada especificada |
| 42 | partidas sem score são agendadas |
| 43 | placar é mandante na posição zero |
| 44 | total de pontos e margem corretos |
| 45 | filtra resultados de uma franquia |
| 46 | jogos por equipe e adversário |
| 47 | condição finalizada |
| 48 | fase play-in ou playoffs não altera temporada regular |
| 49 | seleciona jogos apertados |
| 50 | pontuação mínima respeitada |
| 51 | margem média exclui jogos pendentes |
| 52 | overtime real é contado uma vez |
| 53 | clássicos encerrados por até cinco pontos |
| 54 | nenhuma partida retorna média nula |
| 55 | maior pontuação respeita total real |
| 56 | filtro por data inicial e final |
| 57 | busca textual por id |
| 58 | ordenação de pontos somados |
| 59 | filtro de jogos é puro |
| 60 | temporada vazia tem zero jogos |
| 61 | confrontos diretos contam jogos finalizados |
| 62 | vitórias da franquia A |
| 63 | vitórias da franquia B |
| 64 | confronto com troca de mando |
| 65 | margem média dos dois encontros |
| 66 | prorrogação no confronto |
| 67 | pontos médios por equipe corretos |
| 68 | histórico em ordem reversa por data |
| 69 | confronto repetido não cria histórico |
| 70 | confrontos ainda não ocorridos zerados |
| 71 | estatísticas removem IDs sem jogador e gp inválido |
| 72 | médias de pontos por jogo |
| 73 | médias de rebotes ofensivos e defensivos |
| 74 | líderes por assistência |
| 75 | percentual de arremesso correto |
| 76 | percentual de três nulo sem tentativa |
| 77 | mínimo de jogos retira pequena amostra |
| 78 | filtro por franquia em líderes |
| 79 | indicador inválido gera lista vazia |
| 80 | dez indicadores oficiais |
| 81 | CSV possui cabeçalho e linha em português |
| 82 | CSV remove risco de fórmula iniciada por igual |
| 83 | CSV escapa aspas internas |
| 84 | CSV usa CRLF |
| 85 | CSV não altera linha original |
| 86 | estágio 11–100 contém nove blocos únicos |
| 87 | nomes de frentes do plano não se repetem |
| 88 | filtros de dados faltantes não lançam exceção |
| 89 | jogador sem franquia ou OVR não contamina núcleo |
| 90 | rankings preservam estruturas originais |
| 91 | comparação rejeita o mesmo atleta |
| 92 | comparação rejeita ID ausente |
| 93 | comparação gera cinco eixos de atributos |
| 94 | diferenças nulas são tratadas como equilíbrio |
| 95 | igualdade tem média zero |
| 96 | comparação aponta vantagem da esquerda |
| 97 | comparação aponta vantagem da direita |
| 98 | dados ausentes não são convertidos em empate inventado |
| 99 | comparação mantém ordem dos rótulos do radar |
| 100 | comparação não altera dados originais |

## Testes

- `npm test`: **215 testes aprovados**, incluindo 91 novos testes desta etapa (E11–E100 mais restrição de potencial).
- `node --check`: validado para os módulos alterados.
- Verificação com dados da base de referência: 619 atletas classificados e 30 franquias da seed inicial; o universo criado em jogo tem franquias adicionais.
- Servidor local respondeu 200 para HTML, CSS e novo módulo.
- **Chromium/Playwright:** navegador bloqueou `http://127.0.0.1:5197/` com `ERR_BLOCKED_BY_ADMINISTRATOR`. Interações reais, capturas e responsividade visual seguem não certificadas.

## Integração com sua versão atual (prompts 01 e 09 já implementados)

1. Faça backup ou commit da **sua** versão atual.
2. Aplique apenas o patch depois de verificar `git apply --check`. Se houver conflitos, mescle manualmente.
3. Integre a importação de `dataLabView` e a rota `#/data-lab` em `src/main.js` sem substituir suas rotas de pós-temporada.
4. Acrescente link `NBA Data Studio` no grupo Liga do `src/ui/shell.js` sem trocar o menu inteiro.
5. Inclua o novo CSS no `index.html`; os novos módulos `src/ui/lab-insights.js` e `src/ui/views/data-lab.js` são autônomos e estritamente de consulta.
6. Rode `npm test` e teste as sete abas em Chromium local; verifique a fase do seu prompt 09, períodos extras e as regras de visibilidade dos atributos.

## Arquivos novos/alterados

- `index.html`
- `src/main.js`
- `src/ui/shell.js`
- `css/evolution-11-100.css`
- `src/ui/lab-insights.js`
- `src/ui/views/data-lab.js`
- `tests/evolution-11-100.test.mjs`
- `docs/EVOLUTION-11-100-FORA-CARREIRA.md`

## Critério de conclusão e honestidade técnica

As 90 marcações descrevem validações incrementais e recursos de consulta dentro de um sistema de análise, não 90 grandes features independentes. Os cálculos e imports passaram; ainda é necessária validação no navegador e integração com seu código privado atualizado dos prompts 01 e 09.
