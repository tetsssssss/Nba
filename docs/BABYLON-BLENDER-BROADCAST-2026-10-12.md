# NBA Universe Manager: Babylon.js + Blender (integração opcional)

## Implementado
- Botão **Babylon 3D** na partida e seleção na tela de configurações; nenhum modo foi removido.
- Renderer Babylon com madeira/quadra, garrafões, aros, tabela, jogadores procedurais de baixa complexidade, bola que acompanha o estado oficial, quatro câmeras e escalonamento de qualidade.
- `readVisualFrame()` somente leitura; lê jogadores, coordenadas e bola do `MatchSim`. Não consulta nem modifica IndexedDB, score, RNG, relógios ou eventos.
- Sem biblioteca local: interface conserva 2D/WebGL2 e informa claramente como instalar.
- Importação opcional de `assets/models/nba-player.glb`; sem asset, os avatares procedurais continuam.
- Script Blender para exportar um avatar low-poly inicial, **sem armature/animações**.

## Pré-requisito real
Babylon.js instalado na máquina **não é disponibilizado automaticamente ao navegador**. Copie a distribuição UMD de Babylon e loaders para os caminhos descritos em `assets/vendor/README.txt`. O projeto não depende de CDN; os arquivos da biblioteca não foram incluídos porque não estavam disponíveis no ambiente de geração.

## Exportando um atleta do Blender
1. Abra o Blender, entre em **Scripting** e execute `tools/blender/create-broadcast-player.py`.
2. O script exporta `assets/models/nba-player.glb`, no projeto; é um protótipo de proporção/escala, não um atleta completo.
3. No navegador, entre em uma partida e clique **Babylon 3D**. Se o pacote de loaders estiver instalado e o arquivo presente, o GLB é carregado de maneira assíncrona.
4. Para substituir o protótipo, crie um único objeto raiz com componentes hierárquicos e escala física aproximada à referência, origem nos pés. A exportação glTF converte os eixos do Blender para o Babylon.

## Testes e limitações
- Testes unitários verificam o contrato de coordenadas, independência do sim e ausência de biblioteca.
- Neste ambiente, não foi possível baixar nem executar Babylon.js e o Blender não está instalado: **não houve validação gráfica Babylon em navegador real nem execução do script Blender**.
- A renderização atual usa um jogador procedural sem armature; movimentos são aproximados com pernas oscilantes. Animações esqueléticas, torcidas e replay Babylon ainda são roadmap. Replay 3D continua disponível no WebGL2 pré-existente.
- Não foram realizadas medições confiáveis de FPS no novo renderer. Perfil ajusta resolução e ainda precisa de medições no dispositivo do usuário.

## Rollback
Volte ao modo 2D ou WebGL2 pelo botão existente; o runtime Babylon só atua na visualização. Para reverter o código, aplique o patch reverso na cópia limpa que corresponda à versão Broadcast TV (12/10) ou restaure o ZIP original. Faça backup do projeto privado e saves antes de integrar.
