// Roteador por hash: #/player/2544?tab=contrato
const routes = [];
let onRoute = null;

/** defineRoute('/player/:id', view) — view(params, query) devolve Node ou Promise<Node>. */
export function defineRoute(pattern, view, meta = {}) {
  const keys = [];
  const regex = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)'))}$`);
  routes.push({ pattern, regex, keys, view, meta });
}

export function parseHash(hash = location.hash) {
  const raw = hash.replace(/^#/, '') || '/';
  const [path, search = ''] = raw.split('?');
  return { path, query: new URLSearchParams(search) };
}

export function matchRoute(path) {
  for (const route of routes) {
    const m = route.regex.exec(path);
    if (m) return { route, params: Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

export function navigate(path, { replace = false } = {}) {
  const target = `#${path}`;
  if (location.hash === target) return onRoute?.();
  if (replace) history.replaceState(null, '', target);
  else location.hash = target;
  if (replace) onRoute?.();
}

/** Atualiza a query da rota atual sem recarregar a tela (ex.: aba ou filtro selecionado). */
export function setQuery(values) {
  const { path, query } = parseHash();
  for (const [k, v] of Object.entries(values)) {
    if (v == null || v === '') query.delete(k);
    else query.set(k, v);
  }
  const qs = query.toString();
  history.replaceState(null, '', `#${path}${qs ? `?${qs}` : ''}`);
  window.dispatchEvent(new Event('querychange')); // o menu lateral reflete a aba atual
}

export function startRouter(handler) {
  onRoute = handler;
  window.addEventListener('hashchange', handler);
  handler();
}
