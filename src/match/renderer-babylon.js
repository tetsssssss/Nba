// Arena Babylon.js inteiramente visual. Não altera o estado do MatchSim, seu relógio nem saves.
// Quando a biblioteca UMD local não está instalada, match-live conserva o WebGL2 existente.
import { readVisualFrame } from './babylon-adapter.js';
import { GRAPHICS_QUALITY } from './renderer3d.js';

export const BABYLON_CAMERAS = Object.freeze([
  ['broadcast', 'Babylon · TV lateral'], ['diagonal', 'Babylon · diagonal'],
  ['follow', 'Babylon · acompanha a posse'], ['basket', 'Babylon · cesta'],
]);

const COLOR = ['#2963ce', '#d75d40'];

export class MatchRendererBabylon {
  constructor(canvas, sim, { BABYLON, quality = 'medium' } = {}) {
    if (!BABYLON?.Engine || !BABYLON?.Scene || !BABYLON?.MeshBuilder) throw Error('Runtime Babylon.js inválido.');
    this.B = BABYLON;
    this.canvas = canvas;
    this.sim = sim;
    this.camera = 'broadcast';
    this.disposed = false;
    this.avatars = new Map();
    this.engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: false, stencil: false });
    this.scene = new BABYLON.Scene(this.engine);
    this.scene.clearColor = new BABYLON.Color4(0.035, 0.05, 0.085, 1);
    this.pivot = new BABYLON.Vector3(0, 0, 0);
    this.cam = new BABYLON.ArcRotateCamera('broadcast-camera', -Math.PI / 2, 1.02, 96, this.pivot, this.scene);
    this.cam.lowerRadiusLimit = 20;
    this.cam.upperRadiusLimit = 160;
    this.cam.fov = 0.62;
    this.cam.inputs.clear(); // câmera controlada apenas pela transmissão, não pelo mouse.
    new BABYLON.HemisphericLight('ambient', new BABYLON.Vector3(0, 1, 0), this.scene).intensity = 0.88;
    const lamp = new BABYLON.DirectionalLight('arena', new BABYLON.Vector3(-0.4, -1, 0.35), this.scene);
    lamp.intensity = 0.58;
    this.wood = this.material('court-wood', '#bf9669');
    this.paint = this.material('court-paint', '#294a80');
    this.line = this.material('court-markings', '#f4ede0');
    this.ballMaterial = this.material('basketball', '#d2732f');
    this.uniforms = COLOR.map((c, i) => this.material(`team-${i}`, c));
    this.skin = this.material('skin', '#bf8a65');
    this.createCourt();
    this.ball = BABYLON.MeshBuilder.CreateSphere('ball', { diameter: 0.8, segments: 12 }, this.scene);
    this.ball.material = this.ballMaterial;
    this.setQuality(quality);
  }

  material(name, hex) {
    const c = this.B.Color3.FromHexString(hex);
    const m = new this.B.StandardMaterial(name, this.scene);
    m.diffuseColor = c;
    m.specularColor = new this.B.Color3(0.10, 0.10, 0.10);
    return m;
  }

  createCourt() {
    const B = this.B;
    const ground = B.MeshBuilder.CreateGround('hardwood', { width: 94, height: 50 }, this.scene);
    ground.material = this.wood;
    const key = (x) => {
      const paint = B.MeshBuilder.CreateGround(`paint-${x}`, { width: 19, height: 16 }, this.scene);
      paint.position.x = x;
      paint.position.y = 0.018;
      paint.material = this.paint;
    };
    key(-37.5); key(37.5);
    const line = (name, pts, closed = false) => {
      const path = closed ? [...pts, pts[0]] : pts;
      const mesh = B.MeshBuilder.CreateLines(name, { points: path.map(p => new B.Vector3(p[0], 0.055, p[1])) }, this.scene);
      mesh.color = B.Color3.FromHexString('#fff8e8');
    };
    line('boundary', [[-47,-25],[47,-25],[47,25],[-47,25]], true);
    line('midcourt', [[0,-25],[0,25]]);
    const ring = (name, x, z, r) => {
      const ps = Array.from({length: 65}, (_, k) => [x + Math.cos(k * Math.PI / 32) * r, z + Math.sin(k * Math.PI / 32) * r]);
      line(name, ps);
    };
    ring('center-circle', 0, 0, 6);
    for (const direction of [-1, 1]) {
      const hoopX = direction * (47 - 5.25);
      ring(`restricted-${direction}`, hoopX, 0, 4);
      const rim = B.MeshBuilder.CreateTorus(`rim-${direction}`, { diameter: 1.5, thickness: 0.13, tessellation: 24 }, this.scene);
      // O torus Babylon já repousa no plano horizontal (normal em Y).
      rim.position.set(hoopX, 10, 0);
      rim.material = this.ballMaterial;
      const board = B.MeshBuilder.CreateBox(`board-${direction}`, { width: 0.18, height: 3.5, depth: 6 }, this.scene);
      board.position.set(hoopX + direction * 1.3, 11.5, 0);
      board.material = this.line;
    }
  }

  makeAvatar(data) {
    const B = this.B;
    const root = new B.TransformNode(`athlete-${data.id}`, this.scene);
    const torso = B.MeshBuilder.CreateCylinder(`torso-${data.id}`, { height: 2.1, diameterTop: 1.3, diameterBottom: 1.05, tessellation: 10 }, this.scene);
    torso.parent = root;
    torso.position.y = 3.65;
    torso.material = this.uniforms[data.team];
    const head = B.MeshBuilder.CreateSphere(`head-${data.id}`, { diameter: 1.02, segments: 10 }, this.scene);
    head.parent = root;
    head.position.y = 5.42;
    head.material = this.skin;
    const legs = [];
    for (const side of [-1, 1]) {
      const leg = B.MeshBuilder.CreateCylinder(`leg-${data.id}-${side}`, { height: 2.45, diameter: 0.45, tessellation: 8 }, this.scene);
      leg.parent = root;
      leg.position.set(side * 0.37, 1.33, 0);
      leg.material = this.skin;
      legs.push(leg);
      const arm = B.MeshBuilder.CreateCylinder(`arm-${data.id}-${side}`, { height: 1.8, diameter: 0.31, tessellation: 8 }, this.scene);
      arm.parent = root;
      arm.position.set(side * 0.94, 3.47, 0);
      arm.material = this.skin;
    }
    return { root, legs, team: data.team };
  }

  // Opcional: importa o GLB de um atleta criado no Blender. Nunca altera MatchSim.
  // O modelo contém todos os componentes visuais como uma hierarquia sob uma raiz.
  async loadPlayerGLB(url = 'assets/models/nba-player.glb') {
    if (!this.B.SceneLoader?.ImportMeshAsync) throw Error('Copie babylonjs.loaders.min.js para assets/vendor/babylon-loaders.js.');
    if (!/^assets\/models\/[a-z0-9_.-]+\.glb$/i.test(url)) throw Error('GLB deve ser um arquivo local de assets/models.');
    const { meshes } = await this.B.SceneLoader.ImportMeshAsync('', '', url, this.scene);
    if (this.disposed) { for (const mesh of meshes) mesh.dispose(); return false; }
    const template = meshes[0];
    if (!template) throw Error('GLB sem nós importáveis.');
    for (const mesh of meshes) if (mesh !== template && !mesh.parent) mesh.parent = template;
    template.setEnabled(false);
    this.gltfTemplate?.dispose(false, true);
    this.gltfTemplate = template;
    this.gltfClones = new Map();
    return true;
  }

  setQuality(quality) {
    this.quality = GRAPHICS_QUALITY[quality] ? quality : 'medium';
    const dpr = GRAPHICS_QUALITY[this.quality].dpr;
    this.engine.setHardwareScalingLevel(Math.max(1, (globalThis.devicePixelRatio || 1) / dpr));
  }

  updateCamera(frame) {
    const ball = frame.ball || {x:0,z:0};
    let alpha = 0, beta = 1.02, radius = 96, target = new this.B.Vector3(0, 0, 0);
    if (this.camera === 'diagonal') {alpha = 0.76; beta = 0.92; radius = 90;}
    if (this.camera === 'basket') {alpha = -Math.PI / 2; beta = 1.14; radius = 76; target = new this.B.Vector3(ball.x,0,ball.z);}
    if (this.camera === 'follow') {alpha = 0; beta = 1.0; radius = 65; target = new this.B.Vector3(ball.x * 0.64,0,ball.z * 0.5);}
    this.cam.alpha += (alpha - this.cam.alpha) * 0.12;
    this.cam.beta += (beta - this.cam.beta) * 0.12;
    this.cam.radius += (radius - this.cam.radius) * 0.10;
    this.cam.target = this.B.Vector3.Lerp(this.cam.target, target, 0.13);
  }

  draw(_elapsed) {
    if (this.disposed) return;
    const frame = readVisualFrame(this.sim);
    const ids = new Set();
    for (const p of frame.players) {
      ids.add(p.id);
      let avatar = this.avatars.get(p.id);
      if (!avatar) { avatar = this.makeAvatar(p); this.avatars.set(p.id, avatar); }
      avatar.root.position.set(p.position.x, 0, p.position.z);
      avatar.root.rotation.y = -p.facing;
      avatar.root.scaling.setAll(p.height);
      if (this.gltfTemplate && !this.gltfClones?.has(p.id)) {
        const clone = this.gltfTemplate.clone(`blender-${p.id}`, avatar.root, false);
        if (clone) { clone.setEnabled(true); this.gltfClones.set(p.id, clone); for (const part of avatar.root.getChildMeshes(false)) if (!part.isDescendantOf(clone)) part.setEnabled(false); }
      }
      const stride = Math.min(1, p.speed / 10) * Math.sin(frame.t * 11);
      avatar.legs[0].rotation.x = stride * 0.37;
      avatar.legs[1].rotation.x = -stride * 0.37;
      if (avatar.team !== p.team) {avatar.team = p.team; avatar.root.getChildMeshes()[0].material = this.uniforms[p.team];}
    }
    for (const [id, avatar] of this.avatars) if (!ids.has(id)) {avatar.root.dispose(false, true); this.avatars.delete(id); this.gltfClones?.delete(id);}
    this.ball.setEnabled(Boolean(frame.ball));
    if (frame.ball) this.ball.position.set(frame.ball.x, frame.ball.y, frame.ball.z);
    this.updateCamera(frame);
    this.engine.resize();
    this.scene.render();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.avatars.clear();
    this.scene.dispose();
    this.engine.dispose();
  }
}
