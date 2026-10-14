Babylon.js é opcional e não foi empacotado nesta entrega.

Para ativar sem CDN, copie os arquivos UMD de sua instalação Babylon.js:
  assets/vendor/babylon.js                   -> distribuição Babylon.js UMD (babylon.js ou babylon.min.js)
  assets/vendor/babylonjs.loaders.min.js     -> distribuição UMD Babylon.js Loaders (para .glb)

Instalação típica em um projeto Node:
  npm install --no-save babylonjs babylonjs-loaders

Copie os scripts de node_modules/babylonjs e node_modules/babylonjs-loaders
para os dois caminhos acima. Evite versões diferentes entre runtime e loaders.
O jogo possui fallback WebGL2/2D quando Babylon.js está ausente.
