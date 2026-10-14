# PROMPT PARA CODEX | Integração segura NBA Universe Manager, prompts 01 e 09

## Contexto

Existem DUAS linhas de trabalho:

- **A. Sua instalação privada e mais atual**: o usuário diz que o Codex já implementou o prompt 01 (save) e o prompt 09 (play-in/playoffs/offseason). É a **fonte principal** da carreira e da persistência.
- **B. Este pacote de referência**, integrado com NBA, WNBA, Arcade, All-Star, Street 2D, análise e implementações próprias dos prompts 01 e 09.

Esta distribuição não possui os arquivos privados da linha A e **não garante que a sua offseason seja tão completa quanto a dela**. Trata-se de uma implementação alternativa testada que deve ser comparada, não copiada cegamente.

## Comando de integração para Codex

> Trabalhe como integrador sênior. Tenho uma instalação principal (A) e um novo ZIP de referência (B). Examine ambos antes de modificar. Não sobrescreva a instalação principal por B; crie um terceiro diretório (C) para integrar. Compare módulos de persistência (`src/core/world.js`, `db.js`, `save-snapshot.js`, `saves.js`), progressão (`src/season/season.js`, `postseason.js`, `schedule.js`), interface (`src/ui/sim-control.js`, `src/ui/views/playoffs.js`, `calendar.js`, `match.js`, `src/main.js`, `src/ui/shell.js`), dados, testes e configurações. **Para cada função duplicada, preserve a implementação mais completa e comprovada pelos testes.** Se a minha versão A já possuir offseason com draft, mercado, contratos e melhorias de IA, mantenha esses sistemas e integre somente o que não existe. Não substitua o schema do IndexedDB, não reinicie saves, não modifique IDs de jogadores ou franquias, não apague histórico e não sobreponha arquivos binários/JSON de dados personalizados. Prefira integrar funcionalidades isoladas B em A por commits pequenos. Nunca mantenha duas máquinas de estados concorrentes para a mesma temporada. Os dois motores NBA (rápido e 2D), a WNBA e Street devem continuar operacionais.
>
> Teste: 1. carregar save criado em A; 2. exportar/importar save; 3. falha forçada em bulkWrite e retry sem perda; 4. chamadas concorrentes de save; 5. temporada regular completa (82 jogos/time); 6. play-in seeds 7-10 e fase final 8; 7. séries melhor de 7 e mando 2-2-1-1-1; 8. gravar/recarregar no meio de playoffs e de offseason; 9. continuar duas temporadas consecutivas preservando históricos e campeões; 10. partidas oficiais no 2D; 11. todos os modos Arcade, WNBA e Street isolados da carreira; 12. navegação real e botões, navegador desktop e mobile; 13. comparar estatísticas e classificação (playoffs não contam como vitórias na temporada regular); 14. regressão de todos os testes anteriores.
>
> Entregue um relatório de merge com a origem de cada módulo (A/B/mesclado), os conflitos resolvidos, funcionalidades preservadas, o resultado dos testes reais, qualquer restrição e um ZIP de C pronto para jogar. Se algo não estiver disponível no material, indique explicitamente, sem inventar resultado ou declarar 80.000 evoluções implementadas.

## No pacote B, o que realmente está implementado

1. `src/core/save-snapshot.js`: lotes de save isolados, reencaminhamento após erro de transação ou erro de índice e proteção para alterações concorrentes.
2. `src/season/postseason.js`: play-in (7x8, 9x10, final pela vaga 8), quatro rodadas de melhor de sete, final e campeão, com mando 2-2-1-1-1.
3. `src/season/season.js`: avanço da carreira até o campeão, box scores dos playoffs separados da temporada regular, histórico simplificado de campeões, troca para a temporada seguinte e calendário de 82 jogos. Compatibilidade de abertura para saves legados em fase `playoffs` ainda sem chave `postseason`.
4. Interface: `#/playoffs`, botões para continuar a temporada e jogar no 2D, menu atualizado.
5. Todos os modos Arcade, WNBA e Street já presentes na referência anterior.

## Limitações a preservar como limitações, não promessas

- O offseason do pacote B é **simplificado**: mantém o elenco e as regras salariais da versão anterior; não inclui draft e free agency completos.
- Os testes automatizados cobrem a lógica do save (com adaptadores simulando erro), a criação e resolução de séries e dois calendários consecutivos; não equivalem à homologação completa do IndexedDB do browser em produção.
- O código privado do prompt 01/09 do usuário não está neste pacote. Não há como saber antecipadamente se suas funcionalidades colidem ou se são mais completas.
- Evolução 80000 é uma **meta**, não um contador de funcionalidades implementadas. Faça releases com lista verificável de mudanças e testes.

## Mapa das próximas grandes frentes até a meta de longo prazo

- Confiabilidade: migrações, backups de integração, recovery, stress tests, perfis de performance.
- Carreira: offseason **real** (draft, scouting, trades, renovações, free agency, lesões, staff, finance rules).
- NBA/WNBA: dados históricos atualizados, imagens verificadas, regras distintas, ratings calibrados.
- Street: relógio de posse, colisões, física e replay contínuo, arenas e espectadores.
- All-Star/Arcade: concursos, eventos, analytics e personalização.
- UI: acessibilidade, performance, animações, QA visual e mobile.

Cada incremento deve ter diff, teste de execução, documentação, prova de não-regressão e status objetivo. Nenhuma etapa recebe status 'concluída' sem código e validação.
