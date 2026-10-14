# Roadmap rumo à Evolution 15000 — não implementado nesta rodada

A numeração a seguir é um mapa de trabalho, **não a contagem de implementações concluídas**. Cada fase necessita critérios de aceitação, commits, testes reais, relatório de evidência e pacote de integração.

| Faixa-alvo | Produto a construir | Condição obrigatória antes de declarar concluído |
|---|---|---|
| 2001–3000 | Editor de atletas WNBA/NBA, modo desafios, duel league, personalização de equipes e validação visual | Atletas salvos e reimportados; partidas 2D e Street concluídas no navegador; sem tocar na Carreira |
| 3001–4000 | Street com física e movimentação espacial de 1x1, 2x2 e 3x3 | Bola, movimentação, colisões, defesa, tempo, marcação, 60 FPS mensurado e regras de 1/2 pontos |
| 4001–5000 | Arenas e identidade visual, câmeras 2D, zoom, transições, replay fiel | Reprodução sincronizada de cada ação, captura em três resoluções e teste de acessibilidade |
| 5001–6000 | WNBA: elencos auditados, fotos oficiais adicionais, logos licenciados quando permitidos, atributos calibrados | Proveniência de cada dado e imagem; fallbacks neutros; sem misturar snapshots |
| 6001–7000 | All-Star completo NBA/WNBA, concurso 3pts, habilidades, enterradas, seleção de capitães | Pontuações reproduzíveis e regras específicas verificadas; sem persistência no universo principal |
| 7001–8000 | Modos fantasy, multiequipes, copa, criação de torneios e seeds | Calendários sem duplicidade, desempates definidos e resultados conservados apenas em storage Arcade |
| 8001–9000 | Ferramentas de edição de elencos, atributos, quadras, uniformes e import/export | Compatibilidade retroativa, validação de JSON e testes de reversão |
| 9001–10000 | Estatísticas avançadas, box score profundo, shot charts e comparação temporal | Métricas derivadas de dados registrados, auditoria estatística e não-fabricação de dados |
| 10001–11000 | IA adaptativa de partida Arcade, arquétipos, personalidades e comportamento situacional | Diferenciação observável em centenas de confrontos com controle estatístico |
| 11001–12000 | Novos modos de desafio cooperativo/local, espectador, torneios temáticos | Fluxo completo UI → partida → resultado, sem comprometer saves privados |
| 12001–13000 | Polimento técnico e performance em desktop/mobile | Performance profiling, medição de FPS, consumo e memória, limites sob carga |
| 13001–14000 | Suite de QA end-to-end, compatibilidade, acessibilidade e depuração | Fluxos de cliques completos, screenshots, contrastes, teclado, persistência e regressão |
| 14001–15000 | Consolidação, balanceamento, documentação, migração e homologação | Pacote final com auditoria, lista de funcionalidades *realmente executadas* e bugs conhecidos |

**Regra permanente:** não tocar nos sistemas da Carreira NBA, nos prompts privados 01/09 ou nos saves oficiais sem receber a base atual e autorização específica. Não criar números falsos de testes ou checkpoints. Se o ambiente não permitir um teste visual, declarar explicitamente essa limitação.
