# NBA Universe Manager: Netlify + navegador + Android Xiaomi (12/10/2026)

## 1. Distribuições separadas
- **NETLIFY.zip**: site estático já preparado. **Extraia o ZIP**; arraste a pasta extraída que contém `index.html`, `manifest.webmanifest`, `sw.js`, `src/`, `css/`, `data/` e `assets/` para a área de deploy do Netlify. Não publique diretamente a pasta de código-fonte com `server.mjs`, testes e ferramentas.
- **NAVEGADOR-XIAOMI.zip**: código completo e scripts de inicialização para Windows, macOS e Linux. Extrair e executar `JOGAR - Windows.bat` no Windows. Exige Node.js 20+. O arquivo `index.html` não funciona corretamente via `file://`.
- **Android Xiaomi**: não é APK. Instale como PWA a partir da URL HTTPS do projeto publicado no Netlify. É o mesmo jogo, sem build nativa.

## 2. Publicação no Netlify
1. Extraia o pacote NETLIFY.zip numa pasta, por exemplo `NBA-UNIVERSE-NETLIFY`.
2. Abra https://app.netlify.com/ e selecione a equipe e o projeto que deseja atualizar.
3. Entre em **Deploys**, localize a área de publicação manual e arraste a **pasta extraída**, não o arquivo ZIP compactado.
4. Para novo projeto, use https://app.netlify.com/drop. Espere o deploy concluir.
5. Abra a URL `https://<nome>.netlify.app` gerada e entre em **Partida rápida** ou **Espectador**.
6. Atualizações futuras: envie a **nova pasta de distribuição** ao mesmo projeto, sem criar outro domínio. Assim, os saves do navegador preservam o mesmo origin, desde que os dados do site não sejam apagados.

## 3. Instalação no Xiaomi
1. No Xiaomi, abra **Google Chrome** (preferível ao navegador Mi para PWA).
2. Navegue até a URL **HTTPS** do jogo publicada no Netlify.
3. Aguarde o primeiro carregamento com internet. O service worker armazena módulos JS, dados JSON, CSS, ícones e sprites locais.
4. Se o botão flutuante **Instalar NBA Universe** aparecer, toque nele e confirme. Caso contrário: menu ⋮ do Chrome → **Instalar app** ou **Adicionar à tela inicial** (a opção pode mudar conforme a versão do Chrome/HyperOS/MIUI).
5. Inicie pela tela inicial. Para testar offline, carregue online pelo menos uma vez, feche o aplicativo, desligue a conexão e abra novamente. Recursos que dependem de URLs externas, inclusive algumas fotografias, não estarão disponíveis offline.

### Limites e cuidados
- Carreiras são salvas no **IndexedDB local do origin**. `http://localhost:5173` e `https://seusite.netlify.app` têm bancos de dados diferentes. Não existe sincronização entre computadores e celulares neste pacote.
- Antes de mudar domínio, limpar armazenamento ou trocar de celular, **exporte a carreira** pelo recurso de backup do jogo. Importe no novo navegador.
- Instalação PWA não é um APK nem um aplicativo da Play Store; depende das regras do navegador Android.
- O Babylon.js permanece opcional: os arquivos UMD não estão incluídos na base recebida. Sem eles, o jogo mantém 2D/WebGL2. Para ativar 3D Babylon no Netlify, copie `assets/vendor/babylon.js` e `assets/vendor/babylonjs.loaders.min.js` para o projeto ANTES de reconstruir a distribuição.
- A mesma distribuição serve para desktop e Android, mas **não houve teste físico em Xiaomi** nesta entrega.

## 4. Desenvolvimento e testes
- `npm start`: servidor local fixo (porta 5173, se disponível).
- `node launch.mjs`: inicia em porta livre, útil quando várias versões estiverem abertas.
- `npm test`: suíte automatizada.
- `npm run build:netlify`: gera `dist/netlify` e catálogo offline.
- `npm run pwa:verify`: verifica os arquivos e ícones do PWA.
- `npm run release:verify`: verifica o manifesto SHA do código-fonte.

## 5. Pacote Broadcast Next Gen
- **Vinhetas**: apresentação, resumo de período, tempo técnico, final.
- **Narração TV**: opt-in por SpeechSynthesis (voz português-BR se houver no sistema). Narra eventos registrados; pode estar indisponível no navegador. Em velocidade acelerada acima de 2× não fala.
- **Placar TV**: permanece disponível em 2D, 2.5D, WebGL2, Babylon opcional e fullscreen.
- **Replays e diretor de câmera**: preservadas as ferramentas existentes, sem inventar novos quadros nem manipular o motor de resultados.
- **WNBA e All-Star**: títulos próprios quando as telas usam `renderLive`; telas em motores separados não receberam nova renderização.

## 6. Estado de validação
- Contratos puros e renderização DOM simulada foram testados.
- Verificação de catálogo PWA, MIME e respostas HTTP foram executadas.
- O navegador Chromium deste ambiente apresentou `ERR_BLOCKED_BY_ADMINISTRATOR` ao abrir localhost. A homologação visual e a instalação em Xiaomi requerem execução externa.
