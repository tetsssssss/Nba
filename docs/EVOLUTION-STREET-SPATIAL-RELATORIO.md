# NBA Universe Manager — Continuidade Evolution: Street 2D experimental

Data: 2026-10-08. Base de referência: `NBA-Universe-Manager-Evolution-2001-plus-projeto-referencia.zip`.

## Estado real

Esta rodada acrescenta **um motor espacial Street experimental**, um visualizador 2D em SVG, uma rota WNBA independente e novos testes. Não afirma ter concluído as Evolutions 3000–15000 ou milhares de melhorias.

## Implementações executadas

1. `src/arcade/street-spatial.js`: motor espacial independente com formatos 1x1, 2x2 e 3x3. Modela em 25 quadros de movimento as posições ofensivas e defensivas numa meia quadra; defensores aproximam-se de seus adversários conforme velocidade/defesa; calculam-se distância, pressão defensiva, roubos de bola, chance de acerto e trajetória da bola. Na tática de passes há animação de circulação e registro de assistência em cesta convertida. Cestas de 1 ou 2 pontos, metas 11 ou 21, vitória por 2 salvo teto de 25, box score e replay de no máximo 60 posses.
2. `src/ui/components/street-spatial.js`: visualização SVG de posições oriundas do motor, sem inventar posicionamento depois de simular. Replay com quadro a quadro, posse anterior/próxima e controles de reprodução. Respeita redução de movimento; controles acessíveis por teclado.
3. `src/ui/views/wnba.js`: rota `#/wnba/street-2d`, seleção de duas franquias, formato, meta, tática e semente. Permite iniciar, jogar posse a posse e simular partida até o final. Não modifica o Street clássico.
4. `css/evolution-spatial-street.css`: quadra responsiva e ajustes de foco, contraste, mobile e movimento reduzido.
5. Testes em `tests/evolution-spatial-street.test.mjs` e `tests/evolution-spatial-street-dom.test.mjs`.

## Como validar

- `npm test` executa a suíte completa.
- `PORT=5799 npm start`, acesse `http://127.0.0.1:5799/#/wnba/street-2d`.
- Clique **Nova partida Street 2D**, depois **Próxima posse 2D** ou **Simular até o final**. No replay, use **Quadro +1**, **Reproduzir** e os controles de posse.
- Compare o mesmo seed/tática para obter o mesmo placar e a mesma sequência de eventos.
- Teste em uma janela de celular e em um desktop. Esses cenários visuais permanecem pendentes de homologação real neste ambiente.

## Limitações

- O motor usa um modelo geométrico *simplificado*, sem colisões físicas completas, relógio de 12 segundos, bloqueios, falta individual ou contatos corporais precisos.
- Os quadros são interpolados e ligados às decisões da simulação, mas isto não é captura de jogadores reais, nem replay de vídeo.
- 60 FPS estáveis, compatibilidade touch, corretude visual no Chromium e fluidez de animações **não foram comprovados**.
- O jogo não contém modo Carreira WNBA. Seus resultados não persistem nem entram em calendários.
- Não foi modificada a Carreira NBA, nem `core/world.js`, saves, temporadas, contratos ou playoffs. Não substitua sua instalação privada com prompts 01 e 09 pelo ZIP completo de referência.

## Próxima iteração útil

Adicionar colisões básicas, decisões de passe sob pressão, interface de seleção de jogadoras, relógio de posse, marcação de zona, controle por teclado e testes visuais automatizados. Essas melhorias ainda não estão implementadas nesta rodada.
