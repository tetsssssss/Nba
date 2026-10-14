# Release: pacote integrado com os prompts 01 + 09

## Base
- Parte de `NBA-Universe-Manager-PLAYABLE-Street-2D.zip`, evolução de referência que já inclui WNBA, NBA Arcade, All-Star, Street 2D, criação de jogadoras e estatísticas.
- Inclui implementação **alternativa e independente** dos prompts 01 e 09; código da sua instalação privada não foi fornecido.

## Alterações efetivas
- Gravação do mundo por lote isolado; em falha de IndexedDB, dirty e pending são restaurados e podem ser gravados novamente. Alterações surgidas enquanto a transação aguarda não são descartadas. Se somente o resumo do índice falhar, a sincronização continua pendente.
- Ao terminar temporada regular, o play-in gera jogos das sementes 7-10 e classifica as vagas 7 e 8 nas conferências Leste e Oeste.
- Mata-mata: primeira rodada, semifinais de conferência, finais de conferência e Finais da NBA em melhor de sete e mando 2-2-1-1-1. Agenda próximos confrontos conforme resultados. Sementes e mandos derivam da classificação.
- Partidas oficiais dos playoffs integradas ao motor rápido e ao 2D, com box score por partida separado dos totais da temporada regular.
- Tela de playoff na carreira, campeão registrado no histórico simplificado e botão para próxima temporada.
- A próxima temporada preserva os jogadores e contratos, zera apenas os números anuais em memória, cria calendário novo com IDs exclusivos, mantém os jogos históricos no banco e atualiza datas para o novo ano.
- Mantidos NBA, WNBA, Street e Arcade sem alterar seus motores.

## O que não foi concluído
- A offseason ainda não possui mercado/draft/IA completa. A instalação privada do usuário pode ter versão mais completa e deve ser priorizada no merge.
- Não houve merge com a instalação privada ou validação visual Chromium completa.
- Nem todas as 80.000 evoluções foram executadas. Esta numeração é uma meta de produto.

## Operação
1. Extraia o ZIP.
2. Instale Node.js >=20 e execute `JOGAR - Windows.bat`, `JOGAR - Linux.sh` ou `JOGAR - macOS.command`.
3. Acesse `#/playoffs` para acompanhar a pós-temporada; use `Avançar dia`/`Simular até…` para disputar jogos.
4. Depois das Finais, avance para a temporada seguinte pelo topo da interface.
5. Execute `npm test` para rodar a suíte; verifique os resultados de teste atualizados no manifesto e na saída do comando.
6. Para usar os saves da instalação privada, siga `docs/CODEX-INTEGRACAO-01-09-EVOLUCAO-80000.md` e faça merge, **não substituição**.
