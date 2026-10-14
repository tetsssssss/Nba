# NBA Universe Manager | Versão pronta para jogar (referência)

## Atualização isolada de 14/10/2026

Street NBA e WNBA agora mostram box scores de 1 e 2 pontos, FG%, roubos e perdas. A quadra Street NBA destaca o atleta associado ao evento real da última posse, sem inventar posições. Mudanças de configuração descartam partidas Street obsoletas. O All-Star informa bolas convertidas e aproveitamento no concurso de três pontos. Consulte `docs/EVOLUCAO-STREET-2026-10-14.md` para escopo, testes e limitações. Carreira, playoffs/offseason, contratos e saves não foram alterados nesta rodada.


## Visual de partida 2D/2.5D/3D (etapa experimental)

Na partida ao vivo, **Visual** alterna entre o Canvas tático, **2.5D Arcade** e a arena WebGL2. O 2.5D Arcade usa um atlas original de poses, silhuetas de reserva desenhadas em Canvas, uniformes/números por equipe, sombras, banco, torcida, quatro câmeras e animações lidas dos eventos reais de drible, passe, arremesso e defesa. **Câmera** oferece os ângulos de cada visual; **Replay 3D** revê quadros registrados no WebGL2. Em Configurações → Partida 2D/3D é possível escolher o visual inicial. Nenhum dos visuais altera placar, relógio, substituições, estatísticas, resultado ou save. O 3D exige WebGL2 e retorna ao 2D se não puder ser iniciado. Consulte [o relatório gráfico](docs/NEXT-GEN-GRAPHICS.md) para implementação, testes e limites.

Esta versão integra as evoluções Arcade, WNBA e Street 2D experimental com **uma implementação nova dos prompts 01 (salvamento seguro) e 09 (play-in, playoffs, campeão e temporadas seguintes)**. Sua instalação particular pode ter outras implementações desses prompts: **não substitua seus dados ou arquivos privados sem comparar e resolver os conflitos**.

## Abrir o jogo

- **Windows:** instale Node.js 20 ou superior e dê dois cliques em `JOGAR - Windows.bat`.
- **macOS:** instale Node.js 20 ou superior e execute `JOGAR - macOS.command` (ou rode o arquivo com bash no Terminal).
- **Linux:** instale Node.js 20 ou superior e execute `bash "JOGAR - Linux.sh"`.
- **Qualquer plataforma:** `npm start` abre o servidor na porta 5173; visite `http://localhost:5173`. Para porta dinâmica e abertura automática, execute `node launch.mjs`.

Não abra `index.html` diretamente pelo protocolo `file://`, pois os módulos JS e os dados exigem um servidor local. **Não precisa de `npm install`**: o servidor usa apenas bibliotecas nativas do Node.js. O jogo roda no navegador do seu computador.

Se o iniciador não conseguir abrir o navegador, copie o endereço `http://localhost:PORTA` exibido no terminal. Mantenha a janela de terminal aberta enquanto estiver jogando. Ctrl+C encerra o servidor.

## Testes e limitações

- Execute `npm test` na pasta extraída para rodar a suíte automatizada.
- Validação manual recente no navegador integrado: menu principal, criação e recarga de uma carreira salva, jogo NBA 2D completo e uma posse Street WNBA 2D; também foram abertas telas Arcade, WNBA, NBB, EuroLeague, EuroBasket e configurações. Isso não cobre todos os fluxos, navegadores, tamanhos de tela nem uma avaliação subjetiva de áudio.
- Fotos oficiais podem depender de recursos externos. Os dados e os módulos do jogo estão incluídos no pacote.
- Este ZIP é um **pacote web para execução local**, não um aplicativo nativo compilado (.exe/.app).

---


## Evolution 2001+: WNBA Arcade (sem Carreira)

Foram adicionados `#/wnba/creator` (criador de jogadoras fictícias e amistosos), `#/wnba/academy` (treino de habilidades) e `#/wnba/duels` (torneio Street 1x1). Os três modos usam apenas dados Arcade, mantendo separadas a Carreira NBA e as equipes WNBA oficiais.

Veja `docs/EVOLUTION-2001-15000-PROGRESSO.md` para implementações e testes, `docs/EVOLUTION-2001-15000-ROADMAP.md` para funcionalidades ainda pendentes e `docs/EVOLUTION-2001-15000-PROMPT-MESTRE.md` para continuidade.

## Continuidade: Street WNBA 2D experimental

Acesse `#/wnba/street-2d` para jogar Street 1x1/2x2/3x3 com movimentação e marcação espacial simplificadas, replay de quadros e resultados avulsos. O Street clássico e a Carreira não são alterados. Veja `docs/EVOLUTION-STREET-SPATIAL-RELATORIO.md` para testes, limitações e integração.


## Integration 01 + 09 (versão de referência)

- `#/playoffs`: quadro de play-in e séries melhor de sete; jogos podem ser simulados rapidamente ou disputados no 2D quando sua franquia jogar.
- O avanço após o fim da temporada regular inicia a pós-temporada automaticamente; o botão da barra superior libera a temporada seguinte depois das finais.
- `src/core/save-snapshot.js` preserva alterações pendentes quando uma transação de escrita ou índice falha, com possibilidade de tentar novamente. Requer IndexedDB do navegador.
- A **virada de temporada é simplificada**: novas datas e calendários, estatísticas anuais separadas, registros históricos e elencos mantidos. Não realiza draft de novatos, mercado, negociação automática de contratos, realinhamento de liga ou novos valores salariais anuais.
- Esta implementação não substitui a offseason mais profunda que você tenha implementado no Codex. Veja `docs/CODEX-INTEGRACAO-01-09-EVOLUCAO-80000.md`.
- "Evolution 80000" é um horizonte de desenvolvimento. **Esta distribuição não afirma ter executado 80.000 incrementos.**

## NBB, EuroLeague e EuroBasket (modos avulsos)

Acesse `#/international/nbb`, `#/international/euroleague` ou `#/international/eurobasket`: clubes/seleções reais, fichas e atributos estimados, fotos individuais disponíveis, amistosos rápidos/2D e copas. EuroBasket inclui torneio de grupos até a final. Sem Carreira internacional. **NBB: nove dos vinte clubes cadastrados têm elenco nominal suficiente para jogar; onze aguardam complementação verificada.** Ver `docs/EXPANSAO-NBB-EUROLEAGUE-EUROBASKET.md` para detalhes, fontes, testes e limitações.

## Sonoplastia 01 (efeitos de áudio Web Audio)

Durante uma partida 2D, clique em **Ativar som** para desbloquear o áudio do navegador. Em **Configurações → Partida 2D → Sonoplastia**, ajuste os volumes ou ouça os efeitos de demonstração. Os efeitos não modificam partidas, estatísticas nem saves. O Street WNBA espacial possui botão de som no replay. Leia `docs/EVOLUTION-SONOPLASTIA-01.md` para escopo, testes e limitações.

### Babylon.js e Blender (opcional)
Veja `docs/BABYLON-BLENDER-BROADCAST-2026-10-12.md` para copiar as bibliotecas locais Babylon para `assets/vendor/`, ativar o botão **Babylon 3D** em uma partida e gerar um modelo GLB de demonstração pelo Blender. O jogo mantém WebGL2/2D sem esses arquivos.

## Publicação Netlify e Android Xiaomi (PWA)

O pacote **NETLIFY** já contém uma versão estática com manifest PWA, ícones, `sw.js` e
cache dos arquivos locais. Descompacte o ZIP de Netlify e arraste a pasta com
`index.html` para os Deploys do seu site. A pasta não precisa executar Node.js.
No Chrome Android, abra a URL HTTPS e use **Instalar app** ou **Adicionar à tela inicial**.
Em Windows/macOS/Linux, este ZIP de código completo também mantém os inicializadores
locais existentes. Consulte `docs/NETLIFY-ANDROID-XIAOMI-BROADCAST-2026-10-12.md`.

**Transmissão Next Gen:** `Vinhetas`, `Apresentação TV`, `Narração TV` e `Placar TV`
atuam somente na interface. Não modificam simulação, saves, Carreira ou offseason.
A narração exige SpeechSynthesis no navegador e é opcional. O Babylon.js UMD ainda
precisa ser fornecido localmente caso queira esse renderizador.
