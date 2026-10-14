# Evolutions 501–700 — checklist de execução e regressão

## Sistema entregue
- [x] Liga feminina isolada, com 15 franquias 2026.
- [x] Catálogo com 182 jogadoras documentadas.
- [x] Atributos exclusivos de simulação WNBA, claramente estimados.
- [x] Fotos oficiais por ID verificado (30) e fallback seguro nas outras.
- [x] Galeria e ficha de franquia / jogadora.
- [x] Busca, filtros, ordenação e barras de atributos.
- [x] Simulador rápido WNBA com placar por período, estatísticas e seeds.
- [x] Amistoso WNBA 2D em exibição isolada, 4×10 min.
- [x] All-Star Showcase com seleções Leste/Oeste e amistoso 2D.
- [x] Concurso de três pontos WNBA.
- [x] Street feminino 1×1, 2×2 e 3×3, com modo por posse.
- [x] Copa WNBA isolada, 4 ou 8 equipes.
- [x] Estilos responsivos, animações leves, opção de movimento reduzido.
- [x] Nenhuma alteração de mundo/salvamento/carreira/sazonalização NBA.
- [x] Testes automatizados novos para cada motor e integridade do catálogo.

## Melhoria planejada para homologação 700
- [ ] Completar fotos autorizadas e logos verificados.
- [ ] Editor WNBA de rosters e equipes personalizadas independentes.
- [ ] Cobertura do regulamento WNBA completo pelo motor espacial 2D.
- [ ] Melhorias de câmera, replay, estatísticas ao vivo WNBA.
- [ ] Teste end-to-end com navegador real, incluindo mobile.
- [ ] Validação final de integração com a versão privada que possui prompts 01 e 09.

## Preservação obrigatória
- Nunca alterar `src/core/world.js`, `src/core/saves.js`, `src/season/season.js` sem autorização explícita posterior.
- Nunca registrar torneios WNBA/Street/All-Star nos saves da Carreira NBA.
- Não fingir que ratings ou concursos fictícios são estatísticas ou eventos oficiais WNBA.
- Não associar foto de outra jogadora quando não houver ID oficial verificado.
