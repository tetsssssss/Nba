# NBA Universe TV — extensão incremental de 12/10/2026

## Ponto de partida auditado

- Fonte: `NBA-Universe-Manager-BLENDER-OBJ-INTEGRADO-2026-10-12.zip` (SHA-256 registrado no relatório).
- O renderer atual é WebGL2 **próprio**, não Babylon.js. Há um OBJ de camisa low-poly em `assets/models/nba-jersey-lowpoly.obj`.
- Há camadas 2D e 2.5D, câmeras do WebGL2 e replay a partir de snapshots do `MatchSim`.
- **Ainda não existe** implementação comprovada de jogadores com armature Blender/GLB, biblioteca completa de animações, público skeletal ou migração para Babylon.js.

## Implementado neste pacote

1. `src/match/broadcast-bridge.js`: adaptador puramente de leitura para estado, eventos e histórico de pontuação. Retorna dados serializáveis sem persistência e sem chamadas que avançam `MatchSim`.
2. `src/ui/components/broadcast-studio.js`: painel 'TV e análise' com leitura acessível do placar, posse, relógios, últimos lances e gráfico SVG do diferencial de pontuação.
3. `src/ui/views/match-live.js`: conecta o painel e acrescenta o botão **Diretor TV** para recomendar uma câmera do renderer WebGL2 existente. O diretor é opcional e não modifica o resultado, nem participa do replay. Se 3D não estiver disponível, a partida mantém 2D.
4. `css/game.css`: estilos responsivos e tratamento `prefers-reduced-motion`.
5. `tests/broadcast-engine.test.mjs` e `tests/broadcast-dom.test.mjs`: cobertura unitária da integridade do placar e de um DOM simplificado.

## Limitações

- A identificação da categoria de um lance é heurística sobre o **texto realmente emitido** pelo motor. Não deve ser interpretada como reconhecimento semântico completo.
- O gráfico de vantagem é cumulativo por índice de pontuação. **Não** é mapa de arremessos e não inventa coordenadas. Se o histórico não fechar com o placar, omite o gráfico.
- O botão diretor usa as câmeras WebGL2 existentes; não altera o motor de rendering para Babylon.js.
- A interface foi validada com DOM simulado. Screenshot/homologação em Chromium local depende de acesso permitido a localhost; este ambiente bloqueou a navegação.
- Não foi executado Blender porque não está instalado no ambiente de geração. O OBJ da origem permanece idêntico.

## Próxima camada 3D: contrato de integração (roadmap, NÃO implementada)

Para o primeiro renderer Babylon.js, manter o `MatchSim` como fonte única do estado. O novo módulo receberá os mesmos snapshots usados pelo WebGL2, sem assinar nem gravar no IndexedDB. Implementar como *plugin visual opcional*, não substituição direta. Preservar o 2D e o WebGL2 enquanto os modelos GLB e a performance não forem homologados.

Produção Blender recomendada:

- Aplicar transformações antes de exportar e usar glTF/GLB com materiais PBR.
- Criar um único esqueleto/armature humanoide reutilizável para a primeira família de atletas.
- Animações nomeadas `idle`, `run`, `dribble`, `pass`, `shoot`, `defend`, `rebound`, `dunk`; alinhar relógios de contatos da mão com a bola aos eventos do motor.
- Criar três níveis de detalhe e limitar polígonos/texturas por perfil após **medições**, não por promessas de FPS.
- Não usar nome, imagem, animação ou asset protegido sem licença apropriada.

## Integração no Codex

1. Faça backup do projeto privado atual e dos saves; verifique diferenças do ZIP de referência.
2. **Prefira o `.patch`**; revise conflitos sobretudo em `match-live.js` e `game.css`.
3. Rode `node --test --test-concurrency=3 tests/*.test.mjs` e `node tools/verify-release.mjs`.
4. Abra um jogo novo e um save legado: verifique o botão `Diretor TV`, a aba `TV e análise`, gráfico, pausas, replay, avanço de períodos, partida encerrada e recarga de save.
5. Só após comparação com a versão privada e smoke real considere incorporar no seu fluxo principal.
