# NBA Universe Manager — Evolution 501–700: WNBA independente

**Data de referência:** 08/10/2026. **Base:** Evolution 101–172 (equivalente à continuação da Evolution 100). **Nenhuma alteração no modo Carreira**, IndexedDB, playoffs, offseason, transações NBA ou motor espacial compartilhado.

## O que está IMPLEMENTADO

### WNBA Universe
- 15 franquias oficiais da temporada 2026 (Leste 7; Oeste 8), incluindo Toronto Tempo e Portland Fire.
- 182 jogadoras identificadas nas páginas de elencos oficiais de cada franquia, com equipe, posição e médias PPG/RPG/APG da página de referência.
- Todas têm atributos de simulação e Overall *estimados por fórmula do jogo*, e não ratings oficiais.
- 30 IDs fotográficos obtidos de perfis oficiais WNBA, consumidos pela CDN oficial por URL; demais perfis exibem **silhueta neutra**. Nenhum atleta desconhecido recebe uma fotografia NBA ou de outra pessoa.
- Perfis, barras de atributos, busca por nome, filtro por franquia e classificação por Overall, pontos, rebotes ou assistências.
- Galeria de franquias com cores identificadoras, badges tipográficos e rosters navegáveis. **Logos oficiais gráficos não estão incluídos**.
- Página `#/wnba/hub` e subpáginas `teams`, `players`, `play`, `street`, `allstar`, `three`, `cup`.

### Partidas e modos avulsos
- Simulador rápido **específico da WNBA**, 4 períodos de 10 minutos, regra de 24 segundos parametrizada, prorrogação, box score individual e comentários de lances. Semente determinística.
- Amistoso tático **2D 5x5**, reutilizando o motor espacial existente, ajustado para **600 segundos por quarto** e protegido pela flag `isolated: true`. Demais peculiaridades do regulamento WNBA no motor espacial ainda dependem de adaptação dedicada.
- **Street WNBA** 1x1, 2x2, 3x3, 11/21 pontos, seleção de jogadoras, táticas, simulação completa ou passo a passo, usando motor Street autônomo.
- **WNBA All-Star Showcase**, seleções Leste/Oeste por ratings estimados (não votação oficial), com partida 2D 5x5 avulsa.
- **Concurso de três pontos**, com oito arremessadoras e cinco racks de até 30 pontos. Sem correspondência com resultados oficiais.
- **Copa WNBA** avulsa de 4 ou 8 franquias, com chaveamento e campeã. Não é a Copa oficial da WNBA.
- Nenhum resultado desses modos é persistido na Carreira NBA; os módulos WNBA não dependem do banco `world`.

## Arquivos incluídos no pacote de integração
- `src/wnba/catalog.js`: catálogo, cores, atributos e fotos oficiais mapeadas.
- `src/wnba/engine.js`: amistosos rápidos, Copa, seleção de estrelas.
- `src/ui/views/wnba.js`: todas as telas, busca, filtros, controle e partidas avulsas.
- `css/evolution-501-700.css`: interface WNBA e responsividade com movimento reduzido.
- `src/main.js`: uma rota opcional e um import.
- `src/ui/shell.js`: acesso WNBA no menu da Liga.
- `src/ui/views/start.js`: cartão de entrada WNBA e atalho.
- `src/media/photos.js`: roteamento seguro de headshots para CDN WNBA (e fallback).
- `index.html`: somente o link CSS.
- `tests/evolution-wnba-501-700.test.mjs`: testes de dados, partidas, fotografias, All-Star, Street, Copa e isolamento.

## Integração à versão PRIVADA do usuário

Os prompts 01 (salvamento) e 09 (playoffs, offseason) foram realizados numa versão privada que não está neste pacote. **NÃO sobreponha a sua versão atual pelo ZIP completo de referência.**

1. Faça cópia dos seus arquivos atuais.
2. Utilize o patch/diff contra a Evolution 101–172 ou aplique somente os arquivos novos (`src/wnba/*`, `src/ui/views/wnba.js`, `css/evolution-501-700.css`, `tests/evolution-wnba-501-700.test.mjs`).
3. Faça merge manual e mínimo de `src/main.js`, `src/ui/shell.js`, `src/ui/views/start.js`, `src/media/photos.js` e `index.html`, que podem ter evoluído na sua instalação.
4. Não substitua `src/core/world.js`, `src/core/saves.js`, `src/season/season.js` e demais módulos protegidos. Nenhum foi alterado pela Evolution WNBA.
5. Execute `npm test` e teste em navegador as rotas WNBA, fotos externas, teclado, 2D, a opção de retorno e pelo menos um jogo por modo.
6. Confirme que o funcionamento de Carreira e playoff/offseason existentes permanece inalterado.

## Fontes da base WNBA 2026

- https://www.wnba.com/ (liga e perfil)
- https://www.wnba.com/teams (franquias)
- A propriedade `rosterSource` em cada entrada do módulo `src/wnba/catalog.js` aponta para a página oficial da respectiva franquia em `https://{slug}.wnba.com/roster`.
- Headshots identificados com URLs `https://cdn.wnba.com/headshots/wnba/latest/260x190/{ID}.png`, obtidas exclusivamente dos perfis oficiais consultados. As imagens **não** estão embutidas nos ZIPs e precisam de conexão de rede; 152 atletas exibem fallback neutro.

## Resultados QA

- Suite original da referência Evolution 101–172: 287 testes aprovados antes da expansão.
- Nova suíte WNBA: 69 testes, cobrindo 15 equipes, 182 jogadoras, integridade de catálogo, fotos, motor rápido, 2D, WNBA Street, Copa, All-Star e três pontos.
- **356 testes totais** se a suíte completa passar no release final. Não declarar aprovado antes da execução.
- Smoke estatístico anterior à correção de lances livres: 200 amistosos rápidos IND × LVA com média de 79,1 pontos por equipe. A calibração final precisa de amostra diversificada de confrontos e validação visual.
- **Teste visual em navegador**: pendente até execução final. Testes unitários não validam telas, cliques ou fotos externas.

## Evolution 501–700: estado do escopo

As implementações concretas acima formam o marco funcional WNBA desta faixa. Não representam 200 commits nem 200 funcionalidades completas. A continuação do marco até a homologação Evolution 700 ainda envolve:

1. Ampliar fotos verificadas de 30 para todos os atletas, respeitando autorização de uso e fallback.
2. Confirmar os rosters de 2026 atleta a atleta e atualizar fontes no momento da integração.
3. Adicionar logotipos oficiais ou arte autorizada, separados de badges tipográficos.
4. Criar editor WNBA de rosters customizados, independente dos elencos NBA e da Carreira.
5. Adaptar detalhes próprios de faltas, timeouts e lances livres da WNBA ao motor 2D, sem modificar o modo NBA.
6. Criar gráficos de eficiência, confronto individual e liderança WNBA com filtros e comparações avançadas.
7. Ajustar física, dimensões e HUD da quadra 2D ao visual WNBA.
8. Criar Street WNBA com seleção livre de squads e cenário temático.
9. Executar teste end-to-end no Chromium com capturas desktop e mobile.
10. Ampliar bateria de partidas em temporadas sintéticas **sem criar carreira ou calendário persistente**.

**Não implementado:** modo Carreira WNBA, liga persistente de temporadas, mercado, draft real, integração de contratos NBA, replay integral WNBA com regras particulares e todas as fotos oficiais. O usuário solicitou explicitamente que a Carreira continue de fora.
