// PWA progressivo: não toca saves, IndexedDB ou estado da simulação.
// O botão só é mostrado quando o navegador confirma a instalação disponível.
let deferredInstall = null;
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const button = document.getElementById('nuv-install-app');
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' })
        .catch((err) => console.info('Modo offline opcional não disponível:', err?.message ?? err));
    });
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstall = event;
    if (button) button.hidden = false;
  });
  button?.addEventListener('click', async () => {
    if (!deferredInstall) return;
    const prompt = deferredInstall;
    deferredInstall = null;
    button.hidden = true;
    try { await prompt.prompt(); } catch (err) { console.info('Instalação PWA cancelada ou indisponível:', err); }
  });
  window.addEventListener('appinstalled', () => { deferredInstall = null; if (button) button.hidden = true; });
}
