# NBA Universe Manager: Evolution 701–1000 | WNBA Arcade Expansion

**Base:** Evolution 501–700 WNBA, sem os prompts privados 01 e 09 do usuário. **Data:** 08/10/2026.

## Implementação entregue

### 701–760: Roster Studio WNBA
- Criação e edição de dois elencos fantasy WNBA de até 15 jogadoras, com nomes e cores customizados.
- Transferência/toggle entre equipes impedindo atletas duplicadas e IDs inexistentes.
- Fantasy Draft determinístico de 20 jogadoras, dez por equipe.
- Importação/exportação JSON com esquema validado (`version=1`), limite de 80 KB e strings seguras.
- Armazenamento local **separado** sob `wnba-arcade-studio-v1`; não acessa IndexedDB da carreira.
- Amistosos customizados rápidos e partida tática 2D com dois quintetos válidos; quatro quartos de dez minutos.

### 761–820: WNBA Observatório
- Painel de scouting por nome, franquia e função G/F/C, ranking por Overall simulado, PPG/RPG/APG de referência.
- Comparador entre duas jogadoras, com cinco categorias de atributos e três médias estatísticas.
- Comparação dos núcleos das 15 franquias por média de OVR das cinco maiores notas, posições e elenco.
- Exportação CSV UTF-8 com escaping.

### 821–880: Modos avulsos
- Séries de exibição melhor de 3, 5 ou 7, com jogos completos e campeã, sem calendário persistente.
- Draft de capitãs WNBA com seleção serpentina e elencos equilibrados.
- Desafio de habilidades simulado, usando controle, passe, velocidade e finalização.
- Circuito Street WNBA com quatro ou oito trios, com resultados reais do motor Street.

### 881–930: Visual, fotografia e quadra
- Ilustração 2D estática da meia quadra Street WNBA e mapa das zonas de arremesso a partir dos eventos reais do motor. **Os pontos no desenho são esquemáticos e não coordenadas de rastreamento.**
- Melhorias CSS responsivas para o Studio, scouting, comparações e galeria.
- Tela de auditoria de fotografias mostrando retratos oficiais já mapeados e faltantes.
- **Sem novas fotos não verificadas.** O catálogo permanece com 30 IDs identificados entre 182 atletas, e com fallback neutro para os demais.
- Respeito à preferência de movimento reduzido, e elementos interativos construídos com DOM de texto, não `innerHTML`.

### 931–1000: Validação e integração
- Nova suíte de testes para validação de rosters, saves locais isolados, simulação, torneios e estatísticas.
- Regressão sobre os 356 testes da base anterior; comparação dos módulos protegidos no patch.
- Patch, ZIP só de arquivos modificados, ZIP completo de **referência** e relatório.

> **Escopo real:** os intervalos acima organizam frentes de trabalho, mas NÃO indicam 300 funcionalidades independentes, commits ou testes visuais concluídos. Este documento descreve as entregas verificáveis do release, não certifica todas as 300 evoluções individuais.

## Entradas no menu

`#/wnba/studio`, `#/wnba/lab`, `#/wnba/series`, `#/wnba/festival`, `#/wnba/photos`. Também permanecem: `hub`, `teams`, `players`, `play`, `street`, `allstar`, `three` e `cup`.

## Arquivos de implementação

- `src/wnba/roster-studio.js`
- `src/wnba/analytics.js`
- `src/wnba/showcase.js`
- `src/wnba/court.js`
- `src/wnba/engine.js` (somente funções WNBA isoladas e parametrização para jogos customizados)
- `src/ui/views/wnba.js` (só UI da WNBA)
- `css/evolution-701-1000.css`
- `index.html` (inclusão de uma folha de estilo)
- `tests/evolution-wnba-701-1000.test.mjs`

**Módulos intocados:** `src/core/world.js`, `src/core/saves.js`, `src/core/db.js`, `src/season/*`, `src/contracts/*`, `src/match/*`, `src/players/*`, `src/arcade/*` e views da Carreira NBA. O código de WNBA não importa o banco/estado da carreira.

## Integração sem sobrescrever os prompts 01 e 09

O ZIP de referência NÃO contém as alterações privadas de salvamento e playoffs/offseason do usuário.

1. Faça backup do projeto atualizado.
2. Não substitua `src/core`, `src/season`, `src/match`, ou sua Carreira por arquivos deste pacote.
3. Integre preferencialmente os quatro módulos novos `src/wnba/*`, a nova folha CSS e a suíte de testes.
4. Aplique com merge os acréscimos em `src/wnba/engine.js`, `src/ui/views/wnba.js` e o link CSS de `index.html`. A nova view depende dos módulos `501–700` já integrados.
5. Execute `npm test`. Teste manualmente rosters, exportação/importação, reabertura após refresh, exibição, Circuito, fotos e telas mobile.
6. Confirme que os saves, a offseason e os playoffs previamente implementados permanecem funcionais.

## Limitações reais

- **Sem modo Carreira WNBA**, nem temporadas WNBA persistentes, nem modificação da Carreira NBA.
- Roster Studio armazena suas escolhas em `localStorage` separado; não substitui ou reescreve os elencos base. Não há sincronização automática entre aparelhos.
- A lista de atletas é o snapshot do pacote anterior (2026-10-08), não uma consulta em tempo real de elencos.
- Atributos são estimativas do simulador; os indicadores `stats2026` são rótulos de referência do pacote-base, não simulações de temporada.
- A quadra Street é ilustrativa. O motor Street é por posses, não movimentação contínua 2D.
- Fotos: 30 IDs oficiais mapeados, sem download/binário das imagens; 152 perfis usam fallback. Verificação visual na CDN exige acesso à internet.
- O jogo completo no motor 2D reaproveita a física e o sistema existente de 5x5, sem prometer homologação integral de todas as regras WNBA.
- O Chromium do ambiente não conseguiu concluir a abertura da aplicação nesta rodada. Assim, a verificação visual real permanece pendente.

## Trabalho futuro recomendado

1. Testes E2E reais em browser (Chromium/Firefox) após integração à versão privada.
2. Conferência individual de 182 perfis e fotos com fontes oficiais e licenças de uso apropriadas.
3. UI para múltiplos rosters customizados, sem inserir dados no save de Carreira NBA.
4. Estatísticas avançadas de partidas customizadas, com rastreamento de arremessos apenas se o motor produzir coordenadas reais.
5. Regras WNBA específicas no 2D isoladas por configuração, sem alterar o NBA padrão.
6. Melhorias de performance mobile na galeria de 182 atletas.
