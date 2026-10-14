# NBA Universe Manager — Evolution 2001+: progresso rumo à meta 15000

Data: 2026-10-08. Base: `NBA-Universe-Manager-Evolution-1001-2000-projeto-referencia.zip`.

**Status preciso:** este pacote acrescenta três módulos Arcade novos, duas páginas de interface e seus testes. A meta **Evolution 15000 NÃO foi alcançada**; números de Evolution representam uma direção de roadmap, não milhares de funcionalidades já entregues.

## Implementado nesta entrega

1. **Criador de Jogadoras WNBA** (`#/wnba/creator`): duas equipes de até 15 atletas fictícias, criação individual (nome, posição, idade, seis atributos de 25 a 99), edição, transferências, exclusão, nomes/cores das equipes, demonstração com 10 fictícias, importação/exportação JSON. O armazenamento é uma chave própria `wnba-arcade-created-players-v1`, **sem IndexedDB ou World da NBA**. Fotos são sempre neutras.
2. **Partidas com os atletas criados**: amistoso rápido real usando `simulateWnbaCustom()` em quatro períodos de dez minutos, partida 2D pelo `MatchSim` existente e Street 3x3 pelo motor de posses existente. Quintetos mínimos são validados antes do jogo. Resultados são avulsos, sem alterar a Carreira ou a base oficial.
3. **Academia de habilidades** (`#/wnba/academy`): concursos de arremesso, drible, passe e defesa, com sementes reprodutíveis, participantes de destaque WNBA ou criadas, pontuação por rodada, quadro de resultados e nenhuma evolução do atleta.
4. **Duelo de Estrelas Street 1x1** (`#/wnba/duels`): chaves de oito ou dezesseis atletas, pontuação até 11 ou 21, jogos completos do motor Street, vencedor e placares por rodada, sem persistir resultados como jogos oficiais.
5. **Interface:** novas páginas e menu, cartões, controles ajustáveis, contrastes e foco de teclado, CSS responsivo, opção de movimento reduzido. Todos os dados fictícios são sinalizados como ficção.

## Validação e limites

- Executada a suíte `npm test` completa, com **566/566 testes aprovados** na cópia de desenvolvimento.
- Os 64 testes novos abrangem o criador, edição e validação, exportação/importação, quintetos, simulação rápida, integração ao motor 2D, Street, desafios, duelos, ações dos botões em DOM de teste, nomes inválidos e isolamento de dados.
- Servidor HTTP em porta exclusiva respondeu com 200 para HTML, CSS e os novos módulos ES.
- Inspeção visual real em Chromium **pendente**: o processo não conseguiu concluir o carregamento no ambiente. DOM de teste não equivale a inspeção de tela nem certificação de FPS.
- Código da Carreira, `core/world`, temporada, save, contratos e motor espacial original não foi modificado.
- **Os prompts privados 01 (save) e 09 (playoffs) não estão na referência disponível**: nunca substitua sua instalação privada pelo ZIP de referência sem integração e revisão do patch.

## Pontos de atenção

- Jogadoras criadas são **ficcionais**, não são registradas em times oficiais nem possuem fotografia real.
- Campos `stats2026` nos perfis fictícios servem somente como *interface de compatibilidade do simulador*. São parâmetros derivados dos atributos inventados, **não médias WNBA de 2026**.
- Os desafios de habilidades e duelos podem ser repetidos com diferentes sementes, mas não dão XP nem desbloqueios na carreira.
- A interface aceita a importação exclusivamente de formatos validados; JSON suspeito não é executado como HTML.

## Como integrar

1. Crie backup de sua instalação atual, sobretudo das alterações privadas dos prompts 01 e 09.
2. Aplique `NBA-Universe-Manager-Evolution-2001-plus.patch` com `git apply --check`, depois `git apply`; resolva conflitos pontualmente se necessário.
3. Execute `npm test` e inicie `npm start` para testar os modos `#/wnba/creator`, `#/wnba/academy` e `#/wnba/duels`.
4. Confirme a navegação em pelo menos 1280 px, 768 px e 390 px e com teclado e movimento reduzido. Esses testes são **pendentes neste ambiente**.
5. Não importe o ZIP de referência sobre sua versão atual com os prompts privados.
