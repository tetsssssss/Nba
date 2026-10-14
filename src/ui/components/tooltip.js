// Dica flutuante única para todo elemento com data-tip. Fica fora do fluxo (position: fixed),
// então não é cortada por tabelas, cartões ou pelo menu recolhido.
let tip = null;
let timer = null;
let anchor = null;

function hide() {
  clearTimeout(timer);
  tip?.remove();
  tip = null;
  anchor = null;
}

function show(el) {
  const text = el.dataset.tip;
  if (!text || !el.isConnected) return;
  // item de menu com o rótulo visível não precisa repetir o nome
  if (el.matches('.nav-item[data-nav]') && el.querySelector('.nav-label')?.offsetWidth) return;
  tip = document.createElement('div');
  tip.className = 'tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.textContent = text;
  document.body.append(tip);
  // com a escala da interface (zoom no <body>), os retângulos vêm em pixels de tela: converte para pixels de CSS
  const z = Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
  const scale = (b) => ({ left: b.left / z, right: b.right / z, top: b.top / z, bottom: b.bottom / z, width: b.width / z, height: b.height / z });
  const r = scale(el.getBoundingClientRect());
  const t = scale(tip.getBoundingClientRect());
  const vw = innerWidth / z;
  const vh = innerHeight / z;
  const side = el.closest('.sidebar') && r.width < 80; // trilho de ícones: a dica abre ao lado
  let left = side ? r.right + 8 : r.left + r.width / 2 - t.width / 2;
  let top = side ? r.top + r.height / 2 - t.height / 2 : r.top - t.height - 8;
  if (!side && top < 6) top = r.bottom + 8;
  left = Math.max(6, Math.min(left, vw - t.width - 6));
  top = Math.max(6, Math.min(top, vh - t.height - 6));
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

function enter(e) {
  const el = e.target instanceof Element ? e.target.closest('[data-tip]') : null;
  if (el === anchor) return;
  hide();
  if (!el) return;
  anchor = el;
  timer = setTimeout(() => show(el), e.type === 'focusin' ? 0 : 320);
}

export function installTooltips() {
  document.addEventListener('mouseover', enter);
  document.addEventListener('focusin', enter);
  document.addEventListener('focusout', hide);
  document.addEventListener('mousedown', hide);
  document.addEventListener('scroll', hide, true);
  window.addEventListener('hashchange', hide);
}
