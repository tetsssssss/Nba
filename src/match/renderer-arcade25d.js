// Apresentação arcade 2.5D. Ela só lê MatchSim: placar, relógio, escalações e
// resultado continuam pertencendo ao motor esportivo e aos fluxos de carreira.
import { COURT, clamp, lerp } from './config.js';
import { courtTheme } from './courts.js';

export const ARCADE25D_CAMERAS = [
  ['broadcast', 'Arcade · transmissão'],
  ['close', 'Arcade · próximo'],
  ['follow', 'Arcade · acompanha a bola'],
  ['baseline', 'Arcade · atrás da cesta'],
];

const SPRITE_URL = new URL('../../assets/art/arcade-basketball-poses-v1.png', import.meta.url).href;
const readable = (colors = []) => colors[1] ?? '#f6f1df';
const hex = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value ?? '') ? value : fallback;
const jerseyNumber = (player) => String(player.data?.jersey ?? player.number ?? ((Number(String(player.id).replace(/\D/g, '')) || 22) % 98) + 1).slice(-2);

/** Escolhe uma pose do atlas sem alterar o jogador ou a simulação. */
export function arcadePoseFor(player, sim) {
  const age = player.anim ? sim.t - player.anim.t : Infinity;
  if (age >= 0 && age < 0.68) {
    if (player.anim.type === 'pass') return 2;
    if (['shot', 'dunk', 'contest', 'gather'].includes(player.anim.type)) return 3;
  }
  if (player.hasBall || (sim.ball?.owner === player && sim.ball?.state === 'held')) return 0;
  return Math.hypot(player.vx ?? 0, player.vy ?? 0) > 3.2 ? 1 : 0;
}

/** Projeção pública e pura para testes e para a camada de apresentação. */
export function projectArcadeCourt({ x, y, z = 0 }, view) {
  const nx = (x - view.cx) / view.width;
  const ny = (y - COURT.W / 2) / COURT.W;
  const depth = 0.72 + (ny + 0.5) * 0.42;
  return {
    x: view.w / 2 + nx * view.w * 1.05 * depth,
    y: view.h * 0.54 + ny * view.h * 0.44 + nx * view.h * 0.055 - z * view.scale,
    depth,
  };
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath(); c.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

export class MatchRendererArcade25D {
  constructor(canvas, sim, { quality = 'medium' } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sim = sim;
    this.camera = 'broadcast';
    this.quality = quality;
    this.cx = COURT.L / 2;
    this.viewWidth = COURT.L + 10;
    this.sprite = null;
    this.spriteReady = false;
    this._loadSprite();
  }

  _loadSprite() {
    if (typeof Image === 'undefined') return;
    const image = new Image();
    image.onload = () => { this.sprite = image; this.spriteReady = image.naturalWidth > 1; };
    image.onerror = () => { this.spriteReady = false; };
    image.src = SPRITE_URL;
  }

  setQuality(quality) { this.quality = quality; }

  resize() {
    const cap = this.quality === 'high' ? 2 : this.quality === 'low' ? 1 : 1.5;
    const dpr = Math.min(window.devicePixelRatio || 1, cap);
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    }
    this.w = w; this.h = h; this.dpr = dpr;
  }

  updateCamera(dt) {
    const ball = this.sim.ball ?? { x: COURT.L / 2 };
    const cam = this.camera;
    const target = cam === 'follow' ? ball.x : cam === 'baseline' ? (this.sim.dirOf?.(this.sim.offense) > 0 ? 75 : 19) : COURT.L / 2;
    const width = cam === 'close' ? 59 : cam === 'follow' ? 66 : cam === 'baseline' ? 54 : COURT.L + 10;
    const k = 1 - Math.exp(-Math.max(dt, 0.001) * 3.1);
    this.cx = lerp(this.cx, clamp(target, width / 2 - 4, COURT.L - width / 2 + 4), k);
    this.viewWidth = lerp(this.viewWidth, width, k);
    this.view = { w: this.w, h: this.h, cx: this.cx, width: this.viewWidth, scale: this.h / 38 };
  }

  P(x, y, z = 0) { return projectArcadeCourt({ x, y, z }, this.view); }

  polygon(points, fill, stroke = null, lineWidth = 1) {
    const c = this.ctx; c.beginPath();
    points.forEach((p, i) => { const q = this.P(p[0], p[1]); i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y); });
    c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lineWidth; c.stroke(); }
  }

  drawArena() {
    const c = this.ctx; const theme = courtTheme(this.sim.teams?.[0]);
    c.fillStyle = '#07111f'; c.fillRect(0, 0, this.w, this.h);
    // arquibancadas em camadas criam profundidade sem depender de WebGL.
    for (let row = 0; row < 5; row++) {
      const y = 10 + row * 14;
      c.fillStyle = row % 2 ? '#101d31' : '#0b1728'; c.fillRect(0, y, this.w, 15);
      for (let i = 0; i < Math.ceil(this.w / 13); i++) {
        const hue = (i * 17 + row * 43) % 3;
        c.fillStyle = ['#d9b18a', theme.apron, '#7f9bc2'][hue];
        c.globalAlpha = 0.3 + ((i + row) % 4) * 0.08;
        c.beginPath(); c.arc(i * 13 + 6 + (row % 2) * 4, y + 7, 3, 0, Math.PI * 2); c.fill();
      }
    }
    c.globalAlpha = 1;
    this.polygon([[-7, -8], [COURT.L + 7, -8], [COURT.L + 7, COURT.W + 8], [-7, COURT.W + 8]], theme.apron);
    this.polygon([[0, 0], [COURT.L, 0], [COURT.L, COURT.W], [0, COURT.W]], theme.floor, 'rgba(255,255,255,.35)', 1.4);
    // tábuas leves e a linha central, sempre derivadas da geometria real da quadra.
    c.save(); c.globalAlpha = 0.12; c.strokeStyle = '#6a3f20'; c.lineWidth = 1;
    for (let x = 2; x < COURT.L; x += 4) { const a = this.P(x, 0), b = this.P(x, COURT.W); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }
    c.restore();
    const midA = this.P(COURT.L / 2, 0), midB = this.P(COURT.L / 2, COURT.W);
    c.strokeStyle = 'rgba(255,255,255,.78)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(midA.x, midA.y); c.lineTo(midB.x, midB.y); c.stroke();
    const center = this.P(COURT.L / 2, COURT.W / 2); c.beginPath(); c.arc(center.x, center.y, Math.max(8, this.w / this.viewWidth * 5.5), 0, Math.PI * 2); c.stroke();
    for (const dir of [1, -1]) this.drawKey(dir, theme);
    this.drawBenches(theme);
  }

  drawKey(dir, theme) {
    const x0 = dir > 0 ? COURT.L - COURT.ft : 0, x1 = dir > 0 ? COURT.L : COURT.ft;
    this.polygon([[x0, COURT.W / 2 - COURT.paintHalf], [x1, COURT.W / 2 - COURT.paintHalf], [x1, COURT.W / 2 + COURT.paintHalf], [x0, COURT.W / 2 + COURT.paintHalf]], `${theme.paint}bb`, theme.trim, 1.3);
    const c = this.ctx; const hoop = this.P(dir > 0 ? COURT.L - COURT.hoop : COURT.hoop, COURT.W / 2, 5.1);
    c.strokeStyle = '#ff6a2a'; c.lineWidth = 3; c.beginPath(); c.ellipse(hoop.x, hoop.y, 11, 4, 0, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = '#f7fbff'; c.lineWidth = 2; c.beginPath(); c.moveTo(hoop.x - dir * 16, hoop.y - 34); c.lineTo(hoop.x - dir * 16, hoop.y + 5); c.stroke();
  }

  drawBenches(theme) {
    const c = this.ctx;
    for (const y of [-4, COURT.W + 4]) {
      const a = this.P(COURT.L * .28, y), b = this.P(COURT.L * .72, y);
      c.strokeStyle = '#151b25'; c.lineWidth = 11; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
      c.strokeStyle = theme.trim; c.lineWidth = 2; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    }
  }

  drawSprite(p, x, y, size, pose) {
    const c = this.ctx;
    if (!this.spriteReady) return false;
    const iw = this.sprite.naturalWidth / 2, ih = this.sprite.naturalHeight / 2;
    const sx = (pose % 2) * iw, sy = Math.floor(pose / 2) * ih;
    c.save(); c.imageSmoothingEnabled = false;
    c.drawImage(this.sprite, sx, sy, iw, ih, x - size * .68, y - size * 1.52, size * 1.36, size * 1.62);
    // Faixa da equipe sobre a camisa do sprite original; o número local é sempre legível.
    c.globalCompositeOperation = 'multiply'; c.globalAlpha = .65;
    c.fillStyle = hex(this.sim.teams[p.team]?.colors?.[0], '#29466b');
    roundRect(c, x - size * .22, y - size * .94, size * .44, size * .38, size * .08); c.fill();
    c.restore(); return true;
  }

  drawFallbackPlayer(p, x, y, size, defense) {
    const c = this.ctx, team = this.sim.teams[p.team], main = hex(team?.colors?.[0], '#29466b'), trim = readable(team?.colors);
    const swing = Math.sin(this.sim.t * (Math.hypot(p.vx ?? 0, p.vy ?? 0) > 2 ? 9 : 3) + String(p.id).length);
    c.save(); c.lineCap = 'round'; c.lineWidth = Math.max(2, size * .12); c.strokeStyle = '#8f5b43';
    c.beginPath(); c.moveTo(x - size * .16, y - size * .52); c.lineTo(x - size * (.23 + swing * .12), y - size * .1); c.moveTo(x + size * .16, y - size * .52); c.lineTo(x + size * (.23 + swing * .12), y - size * .1); c.stroke();
    c.strokeStyle = '#151a24'; c.lineWidth = Math.max(2, size * .16); c.beginPath(); c.moveTo(x - size * .16, y - size * .14); c.lineTo(x - size * (.26 - swing * .18), y); c.moveTo(x + size * .16, y - size * .14); c.lineTo(x + size * (.26 - swing * .18), y); c.stroke();
    c.fillStyle = '#b7795c'; c.beginPath(); c.arc(x, y - size * .85, size * .18, 0, Math.PI * 2); c.fill();
    c.fillStyle = main; roundRect(c, x - size * .27, y - size * .7, size * .54, size * .57, size * .12); c.fill();
    c.strokeStyle = trim; c.lineWidth = Math.max(1.5, size * .055); c.stroke();
    c.fillStyle = '#fff'; c.font = `900 ${Math.max(8, size * .17)}px monospace`; c.textAlign = 'center'; c.fillText(jerseyNumber(p), x, y - size * .36);
    if (defense) { c.strokeStyle = '#90c8ff'; c.lineWidth = 2; c.beginPath(); c.arc(x, y - size * .43, size * .43, Math.PI * .1, Math.PI * .9); c.stroke(); }
    c.restore();
  }

  drawPlayer(p) {
    const c = this.ctx, point = this.P(p.x, p.y), speed = Math.hypot(p.vx ?? 0, p.vy ?? 0);
    const defense = p.team !== this.sim.offense;
    const action = p.anim && this.sim.t - p.anim.t < .68 ? p.anim.type : '';
    const lift = ['shot', 'dunk', 'contest'].includes(action) ? Math.sin(Math.min(1, (this.sim.t - p.anim.t) * 1.7) * Math.PI) * 18 : 0;
    const size = clamp((24 + speed * 1.3) * point.depth, 23, 49);
    c.fillStyle = `rgba(0,0,0,${.2 + (defense ? .08 : 0)})`; c.beginPath(); c.ellipse(point.x, point.y + 3, size * .39, size * .13, 0, 0, Math.PI * 2); c.fill();
    if (p.hasBall) { c.strokeStyle = '#ffd966'; c.lineWidth = 2.5; c.shadowColor = '#ffd966'; c.shadowBlur = 10; c.beginPath(); c.arc(point.x, point.y, size * .46, 0, Math.PI * 2); c.stroke(); c.shadowBlur = 0; }
    const drawn = this.drawSprite(p, point.x, point.y - lift, size, arcadePoseFor(p, this.sim));
    if (!drawn) this.drawFallbackPlayer(p, point.x, point.y - lift, size, defense);
    // número contrastante e faixa em qualquer caminho, inclusive no atlas.
    const team = this.sim.teams[p.team]; c.font = `900 ${Math.max(8, size * .18)}px monospace`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = readable(team?.colors); c.fillText(jerseyNumber(p), point.x, point.y - lift - size * .57);
    if (defense) { c.fillStyle = 'rgba(94,171,255,.18)'; c.beginPath(); c.ellipse(point.x, point.y + 3, size * .55, size * .2, 0, 0, Math.PI * 2); c.fill(); }
  }

  drawBall() {
    const b = this.sim.ball; if (!b || b.state === 'dead') return;
    let { x, y, z = 0 } = b;
    if (b.state === 'held' && b.owner) { const o = b.owner; x = o.x + .75; y = o.y + (o.hand ?? 1) * .85; z = .7 + Math.abs(Math.sin(this.sim.t * 8)) * (o.dribbled ? 2.2 : .7); }
    const p = this.P(x, y, z); const g = this.P(x, y); const r = clamp(5 + z * .45, 5, 12);
    const c = this.ctx; c.fillStyle = `rgba(0,0,0,${clamp(.4 - z * .035, .12, .4)})`; c.beginPath(); c.ellipse(g.x, g.y + 3, r * 1.1, r * .36, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#f47e21'; c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#542006'; c.lineWidth = 1.2; c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2); c.moveTo(p.x-r, p.y); c.quadraticCurveTo(p.x, p.y-r*.6, p.x+r, p.y); c.stroke();
  }

  drawEffects() {
    const c = this.ctx;
    for (const e of this.sim.effects ?? []) { const age = this.sim.t - e.t; if (age < 0 || age > 1) continue; const p = this.P(e.x, e.y); c.globalAlpha = 1 - age; c.font = '900 12px monospace'; c.textAlign = 'center'; c.fillStyle = e.label === 'TOCO' ? '#8fd1ff' : '#fff2a8'; c.fillText(e.label, p.x, p.y - 42 - age * 14); }
    c.globalAlpha = 1;
  }

  draw(dt = 1 / 60) {
    this.resize(); if (!this.w || !this.h) return;
    const c = this.ctx; c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); this.updateCamera(dt); this.drawArena();
    [...(this.sim.court ?? [])].sort((a, b) => a.y - b.y).forEach((p) => this.drawPlayer(p)); this.drawBall(); this.drawEffects();
    const vignette = c.createRadialGradient(this.w / 2, this.h / 2, this.h * .15, this.w / 2, this.h / 2, this.w * .72); vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,0,0,.38)'); c.fillStyle = vignette; c.fillRect(0, 0, this.w, this.h);
  }

  dispose() { this.sprite = null; }
}
