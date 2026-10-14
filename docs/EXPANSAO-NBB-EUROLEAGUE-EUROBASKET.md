# Expansão internacional — NBB, EuroLeague, EuroBasket

## Implementado nesta versão de referência

Três telas independentes: `#/international/nbb`, `#/international/euroleague`, `#/international/eurobasket`. Disponíveis na navegação lateral e na seleção inicial de modos.

- NBB 2025/26: 20 clubes reais catalogados, **9 com pelo menos cinco jogadores nominalmente confirmados e disponíveis para partidas**, 120 jogadores identificados na base. Os outros onze não recebem jogadores fictícios; é preciso completar sua verificação para jogá-los.
- EuroLeague 2025/26: 20 clubes, todos com cinco ou mais jogadores registrados; 232 jogadores identificados. Os elencos são uma seleção nominal derivada de uma fotografia de 2025/26, não necessariamente a lista exaustiva de inscritos.
- EuroBasket 2025: 24 seleções com 12 jogadores cada, total de 288 jogadores. Seleções e grupos seguem a edição de 2025; resultados gerados pelo jogo são simulações alternativas, sem relação com o resultado oficial.
- Modos: amistoso FIBA em motor estatístico rápido, 5x5 Canvas 2D com quatro quartos de 10 minutos, torneio eliminatório de 4/8/16 equipes, e EuroBasket completo com grupos e mata-mata de 75 jogos.
- Busca de atletas por nome e equipe, fichas individuais e grupos de atributos; placar por período, estatísticas individuais e identificação das fontes dos elencos.
- Dados separados de `src/season`, `src/core/world`, contratos e saves; partidas avulsas **não alteram a Carreira NBA**.

## Fotos, atributos e procedência

Todas as 640 identidades de atletas são nomes transcritos de fontes esportivas de referência. **As classificações 0–100 são derivadas por algoritmo determinístico e são estimativas do jogo, NÃO notas oficiais nem extraídas de números reais individuais.** Posições usadas pelo motor, velocidade e estatura também podem ser estimadas. Consultar fontes antes de ajustar.

A integração associa 44 identificações a fotografias de perfis públicos NBA, referentes a alguns dos atletas cadastrados. Como nomes podem constar em mais de uma competição, as associações resultam atualmente em **1 NBB + 13 EuroLeague + 34 EuroBasket** retratos exibíveis (48 inscrições nos elencos). O mesmo atleta pode aparecer em clube e seleção. **Não há fotos locais incluídas no ZIP:** o carregamento requer internet e depende da disponibilidade da CDN da NBA. O jogo apresenta iniciais neutras em caso de foto não conferida, inexistente ou sem rede; nunca atribui a fotografia de outra pessoa.

Fontes de referência dos elencos:
- NBB clubes e elenco: https://lnb.com.br/equipes/ e registros nominais da Confederação Brasileira de Basketball (https://www.cbb.com.br/).
- EuroLeague: https://mediacentre.euroleague.net/en/app/2/communication/communication/preview/23369 e listagem publicada de rosters https://sport.sky.it/basket/2025/09/29/eurolega-2025-2026-quintetti-roster .
- EuroBasket: https://www.fiba.basketball/en/news/roster-tracker-who-is-playing-at-fiba-eurobasket-2025 .
- Fotografia, quando disponível: `https://cdn.nba.com/headshots/nba/latest/260x190/<NBA-ID>.png` (imagens externas, não redistribuídas).

## Arquivos adicionados

- `src/international/teams.json`, `photo-ids.json`, `stars.json`
- `src/international/catalog.js`, `engine.js`
- `src/ui/views/international.js`
- `css/international.css`
- `tests/international-competitions.test.mjs`, `tests/international-dom.test.mjs`

Arquivos de navegação alterados: `src/main.js`, `src/ui/shell.js`, `src/ui/views/start.js`, `index.html`.

## Execução e teste

Com Node.js 20+ instalado: `npm start` e acesse `http://localhost:5173`. Os lançadores da raiz também funcionam. Execute `npm test`: **642 testes**, incluindo **27 novos** para as três competições, aprovados nesta base. Testes de interface automatizados utilizam DOM simulado; o jogo 2D foi inicializado por código com dois quintetos. **Não foi concluída uma homologação visual no Chromium para partidas completas**.

## Integração na versão privada

O ZIP é baseado na última versão integrada de referência (`BASE-80K`). A versão privada desenvolvida no Codex pode ter implementação mais completa dos prompts 01 e 09. **Não substitua cegamente a pasta principal**: use o ZIP de arquivos modificados ou o patch e revise `src/main.js`, `src/ui/shell.js`, `src/ui/views/start.js`, `index.html`. Os módulos de Carreira, persistência, playoffs e offseason não foram modificados nesta expansão.

## Limitações e evolução sugerida

Completar primeiro os elencos dos 11 clubes NBB pendentes; verificar e atribuir fotografias nominais adicionais; atualizar data e fontes ao mudar a edição dos torneios; refinar atributos com estatísticas específicas de cada competição; testar extensivamente o Canvas 2D no navegador e adaptar todas as diferenças FIBA (bônus, faltas, regras de reposição) caso ainda não estejam representadas. Nesta entrega, o 2D reutiliza o motor NBA e utiliza 4×10 minutos, portanto não declara conformidade integral ao regulamento FIBA.
