// Babylon é opcional: o navegador precisa receber uma cópia local da distribuição UMD.
// Nenhuma biblioteca é obtida por CDN e nenhuma configuração de carreira é modificada.
const LOAD_PATH = 'assets/vendor/babylon.js';
let loading = null;
export const BABYLON_LOCAL_PATH = LOAD_PATH;

export function hasBabylonRuntime(scope = globalThis) {
  return Boolean(scope.BABYLON?.Engine && scope.BABYLON?.Scene && scope.BABYLON?.MeshBuilder);
}

export function loadBabylonRuntime({ scope = globalThis, documentRef = scope.document } = {}) {
  if (hasBabylonRuntime(scope)) return Promise.resolve(scope.BABYLON);
  if (!documentRef?.createElement || !documentRef?.head) return Promise.reject(new Error('Babylon.js não está disponível neste ambiente.'));
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = documentRef.createElement('script');
    script.src = LOAD_PATH;
    script.async = true;
    script.onload = () => hasBabylonRuntime(scope) ? resolve(scope.BABYLON) : reject(new Error('Arquivo Babylon local inválido ou incompleto.'));
    script.onerror = () => reject(new Error(`Babylon.js não encontrado em ${LOAD_PATH}. Copie a distribuição UMD local para habilitar o modo.`));
    documentRef.head.appendChild(script);
  }).catch((error) => { loading = null; throw error; });
  return loading;
}

export function mapBasketballCoordinates(x, y, height = 0) {
  const point = [Number(x), Number(y), Number(height)];
  if (point.some(v => !Number.isFinite(v))) return null;
  return { x: point[0] - 47, y: Math.max(0, point[2]), z: point[1] - 25 };
}

export function readVisualFrame(sim) {
  const players = Array.isArray(sim?.court) ? sim.court : [];
  const seen = new Set();
  const frame = { t: Number.isFinite(sim?.t) ? sim.t : 0, players: [], ball: null };
  for (const p of players) {
    const id = String(p?.id ?? '');
    const pos = mapBasketballCoordinates(p?.x, p?.y);
    if (!id || !pos || seen.has(id)) continue;
    seen.add(id);
    frame.players.push({
      id, team: p.team === 1 ? 1 : 0, position: pos,
      facing: Number.isFinite(p.facing) ? p.facing : 0,
      speed: Math.hypot(Number(p.vx) || 0, Number(p.vy) || 0),
      height: Math.max(0.82, Math.min(1.18, (p.data?.heightIn ?? 78) / 78)),
      action: String(p.act?.type ?? p.mode ?? 'idle'),
    });
  }
  if (sim?.ball?.state !== 'dead') frame.ball = mapBasketballCoordinates(sim?.ball?.x, sim?.ball?.y, sim?.ball?.z);
  return frame;
}

// glTF/GLB no UMD necessita do pacote de loaders distribuído separadamente.
let loadersLoading = null;
export function loadBabylonGltfLoader({ documentRef = globalThis.document } = {}) {
  if (loadersLoading) return loadersLoading;
  if (!documentRef?.createElement || !documentRef?.head) return Promise.reject(new Error('Documento indisponível para GLB.'));
  loadersLoading = new Promise((resolve, reject) => {
    const script = documentRef.createElement('script');
    script.src = 'assets/vendor/babylonjs.loaders.min.js';
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Loader GLB local não instalado.'));
    documentRef.head.appendChild(script);
  }).catch((error) => { loadersLoading = null; throw error; });
  return loadersLoading;
}
