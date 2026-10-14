# NBA Universe Manager | Evolução isolada Arcade, Street e WNBA
**Data:** 13/10/2026
**Referência auditada:** `NBA-Universe-Manager-TV-NETLIFY-XIAOMI-2026-10-12-NAVEGADOR-JOGAR.zip` (299 arquivos)

## 1. Objetivo e limites

Melhorar modos independentes sem modificar a Carreira NBA, o armazenamento do prompt 01, os playoffs/offseason do prompt 09 ou dados de saves. Não foi realizada fusão com versões privadas desconhecidas. Esta atualização foi construída **exclusivamente** sobre a referência recebida; se o projeto privado avançou depois dela, aplicar o patch com revisão, nunca sobrescrever automaticamente.

## 2. Mudanças efetivamente implementadas

1. **Street NBA:** corrigido erro reproduzível na troca de formato (`updateStreetSlots()` inexistente). Os seletores de atletas agora acompanham 1×1, 2×2 ou 3×3; seleções incompletas, repetidas e de atleta fora do roster são rejeitadas antes da partida. Erros aparecem em mensagem acessível, sem travar a interface.
2. **Motor Street:** rejeita atletas nulos/incompletos com mensagem explícita em vez de exceção indireta de acesso a `id`. Não houve alteração da fórmula de pontos, probabilidades, estatísticas ou calendário.
3. **Roster Studio NBA:** fantasy draft reproduzível por semente digitada; botões **Desfazer** e **Refazer** (até 30 alterações nesta sessão); restauração de escalações com confirmação; importação de JSON validada passa pelo histórico de alterações. Continua usando apenas `nba-arcade-rosters-v1` em `localStorage`, sem IndexedDB ou gravação na carreira.
4. **All-Star NBA:** ao selecionar draft de capitães, o controle passa a mostrar Time 1/Time 2 em vez de Leste/Oeste. Seleção de atletas e regras do torneio não foram modificadas.
5. **Street 2D WNBA:** resumo visível com aproveitamento de arremessos e roubos de bola extraídos das estatísticas reais do motor; anúncio resumido de posse e placar para tecnologias assistivas. O container completo deixou de ser anunciado a cada atualização, reduzindo leitura repetitiva.
6. **Interface e movimento reduzido:** estado narrado em região `role=status`; ações inertes desaparecem após o fim da partida Street; animações CSS da quadra/botões respeitam `prefers-reduced-motion`.
7. **PWA/Netlify:** nova versão de cache `nuv-arcade-accessibility-20261013-r1` tanto no `sw.js` quanto no catálogo offline. A ferramenta de verificação agora compara ambos dinamicamente, evitando deploys que misturem versões.

## 3. Testes executados

| Verificação | Resultado |
|---|---|
| Suíte original, antes das mudanças | **731/731 aprovados** |
| Testes novos da rodada | **13 testes adicionados** (12 em `tests/arcade-evolution-20261013.test.mjs`, 1 em `tests/pwa-static.test.mjs`) |
| Suíte completa após as mudanças | **744/744 aprovados, 0 falhas** |
| Testes de interface | DOM simulado: alternância Street 1×1/2×2, escolha duplicada, início/encerramento, histórico de roster, All-Star e WNBA |
| Verificação de PWA | **184 recursos** no catálogo offline e **3 ícones** |
| HTTP local | `GET /` responde **200 OK** |
| Navegador Chromium real | **Não homologado:** `net::ERR_BLOCKED_BY_ADMINISTRATOR` ao abrir localhost |
| Android Xiaomi físico | **Não testado:** não havia aparelho acessível |
| Babylon/Blender visual | **Não testado:** fora do escopo e runtime Babylon não incorporado |

As contagens referem-se aos testes realmente executados nesta rodada; não representam homologação completa do jogo em dispositivos reais.

## 4. Proteção e integridade

- Comparação SHA-256 com o ZIP de referência: **59/59 arquivos** dos diretórios `src/core/`, `src/season/`, `src/players/`, `src/contracts/` e `src/match/` preservados byte a byte.
- Nenhum arquivo original foi removido.
- Alterações limitadas a Arcade, interface WNBA, CSS, PWA, testes e documentação.
- Os modos WNBA/Street continuam independentes e não são incorporados aos registros de temporadas da carreira.
- Os arquivos ZIP fornecidos **não incluem saves pessoais do navegador**. Os saves permanecem no IndexedDB do origin em que foram criados.
- Não foram acessadas nem sobrescritas implementações privadas não fornecidas.

## 5. Entregáveis e aplicação

- **ZIP de código completo:** usar para uma instalação nova ou comparação com o seu repositório privado.
- **ZIP Netlify:** contém somente o site estático; extrair e publicar a pasta que possui `index.html` na raiz.
- **Patch Git:** aplicar preferencialmente no Codex após revisar diferenças, idealmente com `git apply --check` e `git apply` em uma branch, sobre a versão de referência exata.
- **ZIP de alterações:** apenas os arquivos modificados/adicionados, com seus caminhos relativos.
- **SHA-256:** arquivo de hashes para conferência dos pacotes.

**Não aplicar o ZIP completo por cima de um projeto privado mais recente sem comparação.** O patch foi gerado contra a versão pública de referência e pode exigir resolução de conflitos em código privado.

## 6. Próximos passos (roadmap, NÃO implementados)

1. Homologação visual e de acessibilidade no Chrome desktop, com capturas reais e navegação por teclado.
2. Testes físicos no Xiaomi (toque, FPS, rotação, PWA, offline, armazenamento persistente e reinstalação).
3. Testes de exportação/importação de saves reais entre origens com cópias de segurança.
4. Animações espaciais Street mais realistas e melhorias do replay 2D WNBA, com benchmark mobile.
5. Biblioteca local Babylon.js/GLB, validação de licenças e testes 3D em GPU real.
6. Integração de testes automatizados de navegador em CI com Playwright, sem depender de localhost bloqueado neste ambiente.

## 7. Conclusão

A rodada corrigiu um defeito efetivo, melhorou controles e segurança de seleções, acrescentou ferramentas práticas ao Roster Studio e aperfeiçoou a leitura das partidas WNBA. A regressão automatizada passou integralmente. **Não é correto declarar aprovação visual, FPS ou compatibilidade física com Xiaomi**, porque esses testes não foram realizados.
