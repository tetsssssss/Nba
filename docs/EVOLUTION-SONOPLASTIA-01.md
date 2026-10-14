# Evolution Sonoplastia 01 (2026-10-08)

## Entregue e funcionando em código

- Sistema Web Audio sintetizado localmente em `src/audio/soundscape.js`, sem downloads, MP3 ou dependências externas.
- Partidas 2D: quiques de bola, passos/tênis, passes, aro, cesta, enterrada, roubo/toco, apito, buzina e reação da torcida.
- Sons disparados conforme eventos já registrados pelo motor, sem modificar placar, física ou regras esportivas.
- Botão **Ativar som** em partidas NBA, WNBA, NBB, EuroLeague e EuroBasket que usam `renderLive`.
- Configurações → Partida 2D → Sonoplastia: ativação, volume geral, volume de quadra/árbitro, volume da torcida; botões **Ouvir** para testar efeitos.
- Replay espacial WNBA Street: botão **Ativar som** e efeitos leves nos quadros de movimentação e arremesso.
- O jogo começa sem iniciar áudio automaticamente; é preciso clicar em **Ativar som** (política dos navegadores).
- Limitador de repetição para evitar acúmulo de sons na simulação acelerada; 8x não emite lances sequenciais.
- Som desligado ao sair da partida; áudio não consulta nem escreve dados da carreira ou do IndexedDB.

## Limites

- Esta é a primeira etapa: os efeitos são sintetizados por osciladores/filtros, não gravações de torcidas reais ou locução humana.
- Torcida é uma reação curta em jogadas; ambiente contínuo de ginásio e narração contextual permanecem para evolução futura.
- Os testes verificam síntese por mocks do Web Audio e lógica de eventos; a audição subjetiva, mixagem, browsers e latência ainda precisam ser verificados com alto-falantes reais.
- Configurações de áudio são locais a cada navegador, não fazem parte do save da carreira.
- A implementação foi testada sobre `NBA-Universe-Manager-FOTOS-NBB-EUROLEAGUE-v2-projeto-referencia.zip`. Se sua instalação Codex divergiu, faça merge, não substituição cega.

## Próximas etapas recomendadas

1. Gravações próprias em WAV/OGG (piso, rede, tabelas, apitos) com compressão e preload apropriados.
2. Ambiente de ginásio com camadas de torcida, intensidade proporcional ao contexto, sem mascarar os sons principais.
3. Sonoplastia de menus, All-Star, concursos de três pontos e enterradas, e variações de arenas.
4. Panning espacial discreto de quadra, efeitos de transição e mixagem dinâmica nas faltas e cestas decisivas.
5. Testes reais de usabilidade de áudio e desempenho em dispositivos móveis.

## Comandos

- `npm test` para regressão.
- `node --test tests/audio.test.mjs` para 25 testes específicos de sonoplastia.
- `npm start` e `http://localhost:5173` para jogar e ouvir.
