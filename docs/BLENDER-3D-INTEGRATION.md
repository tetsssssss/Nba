# Integração Blender — atletas 3D

O jogo tem um único motor esportivo. O WebGL2 apenas lê `MatchSim` para desenhar
quadra, atletas, bola e replay. Modelos Blender não entram no save, não recebem
eventos de resultado e não devem alterar a simulação.

## Modelo já integrado

`assets/models/nba-jersey-lowpoly.obj` é uma camisa low-poly original usada por
`src/match/renderer3d.js`. Ela é carregada de forma assíncrona no navegador.
Enquanto o arquivo ainda carrega — ou se falhar — o renderer usa a camisa em
caixa que já existia. Portanto, ausência de WebGL2 ou de asset mantém o jogo
jogável no visual 2D/2.5D.

## Como substituir no Blender

1. Abra o OBJ existente no Blender como guia de escala.
2. Modele somente a camisa/corpo externo, centrado no eixo XY, com os pés em
   `Z = 0` e com `Z` apontando para cima.
3. Aplique transformação, triangule as faces e exporte como Wavefront OBJ.
4. Mantenha o caminho e nome `assets/models/nba-jersey-lowpoly.obj`.
5. Teste o modo `3D Broadcast (WebGL2)` e, em seguida, execute `npm test`.

O loader lê `v`, `vn` e `f`; UVs, materiais, texturas, esqueleto e animações
não são necessários nesta primeira integração. Braços, pernas, cabeça, bola e
movimento continuam sincronizados pelo renderer com o estado vivo da partida.

## Regra de persistência

Não altere `src/core/db.js`, `src/core/save-snapshot.js`, `src/core/saves.js` ou
o formato do save para instalar um modelo. Se futuramente houver escolhas de
cosmético por atleta, grave só um identificador opcional e com fallback — nunca
um caminho local do Blender ou dados binários no IndexedDB.
