// MatchRenderer: desenha o estado da simulação num Canvas 2D.
// Só LÊ o estado — nenhuma regra de jogo mora aqui. Toda animação é uma
// transformação visual de algo que a simulação registrou (p.anim, p.state, bola).
import { COURT, SLOTS, clamp, hoopOf, lerp, slotPos } from './config.js';
import { laneRisk } from './offense.js';
import { courtTheme } from './courts.js';
import { MARGIN, renderCourtArt } from './court-art.js';

export const CAMERAS = [
  { id: 'dynamic', label: 'Dinâmica', tilt: 1, follow: true },
  { id: 'full', label: 'Superior (quadra inteira)', tilt: 1, follow: false },
  { id: 'tv', label: 'TV', tilt: 0.62, follow: true },
  { id: 'side', label: 'Lateral', tilt: 0.42, follow: true },
];

/** Preferências visuais (Configurações → Partida 2D). Nenhuma delas altera a simulação. */
export const RENDER_DEFAULTS = { markerScale: 1, photoScale: 1, ballScale: 1, smoothing: 1, popups: true, trail: true, names: true };

const APRON = 9; // quanto do entorno (faixa pintada + primeiras fileiras da torcida) a câmera mostra, em pés
/** Cor do aviso por tipo de lance: defesa, erro/falta, espetáculo, leitura tática. */
const FX_COLOR = { ROUBO: '#58a6f2', 'INTERCEPTAÇÃO': '#58a6f2', TOCO: '#58a6f2', FALTA: '#f0564f', ERRO: '#f0564f', ENTERRADA: '#f4c84a', 'ANKLE BREAKER': '#f4c84a', LIVRE: '#35c98a' };

export class MatchRenderer {
  /**
   * @param imageOf (player) => HTMLImageElement | null (foto já resolvida pelo resolver central)
   * @param logoOf  (team)   => HTMLImageElement | null (logo já resolvido pelo resolver central)
   */
  constructor(canvas, sim, { imageOf = () => null, logoOf = () => null, options = {} } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sim = sim;
    this.imageOf = imageOf;
    this.logoOf = logoOf;
    this.opt = { ...RENDER_DEFAULTS, ...options };
    this.camera = 'dynamic';
    this.zoomUser = 1;
    this.autoZoom = true;
    this.debug = false;
    this.showStamina = true;
    this.pixelRatioCap = 1.5;
    this.cx = COURT.L / 2;
    this.view = COURT.L; // largura visível em pés
    this.trail = [];
    this.uiScale = Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
  }

  setOptions(options) {
    Object.assign(this.opt, options);
  }

  resize() {
    // a escala da interface amplia o canvas na tela: desenha com a mesma densidade para não borrar
    const dpr = Math.min((window.devicePixelRatio || 1) * this.uiScale, this.pixelRatioCap);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      // iluminação de ginásio: centro claro, cantos escurecidos (gradiente criado uma vez por tamanho)
      this.vignette = this.ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.38, w / 2, h / 2, Math.max(w, h) * 0.78);
      this.vignette.addColorStop(0, 'rgba(0,0,0,0)');
      this.vignette.addColorStop(1, 'rgba(0,0,0,0.42)');
    }
    this.w = w;
    this.h = h;
    this.dpr = dpr;
  }

  /** Câmera suave: zona morta + interpolação. Nunca recentraliza de golpe a cada passe. */
  updateCamera(dt) {
    const cam = CAMERAS.find((c) => c.id === this.camera) ?? CAMERAS[0];
    this.tilt = cam.tilt;
    const b = this.sim.ball;
    let targetView = COURT.L + 2 * APRON;
    let targetX = COURT.L / 2;
    if (cam.follow) {
      // meia quadra: fecha o enquadramento; transição: abre
      let minX = b.x;
      let maxX = b.x;
      for (const p of this.sim.court) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
      }
      const spread = maxX - minX;
      targetView = this.autoZoom ? clamp(spread + 22, 54, COURT.L + 2 * APRON) : 62;
      const focus = (minX + maxX) / 2 * 0.6 + b.x * 0.4;
      targetX = Math.abs(focus - this.cx) > 4 ? focus : this.cx; // zona morta
    }
    targetView = clamp(targetView / this.zoomUser, 30, COURT.L + 2 * APRON);
    // suavização configurável: valores maiores deixam a câmera mais lenta e estável
    const k = 1 - Math.exp((-dt * 2.2) / clamp(this.opt.smoothing, 0.3, 3));
    this.cx = lerp(this.cx, targetX, k);
    this.view = lerp(this.view, targetView, k * 0.8);
    const half = this.view / 2;
    this.cx = clamp(this.cx, Math.min(half - APRON, COURT.L / 2), Math.max(COURT.L + APRON - half, COURT.L / 2));
    // escala limitada também pela altura disponível
    this.s = Math.min(this.w / this.view, this.h / ((COURT.W + 2 * APRON + 2) * this.tilt + 10 * (1 - this.tilt)));
    this.zk = this.tilt < 1 ? 0.85 : 0; // quanto a altura (z) sobe na tela
  }

  P(x, y, z = 0) {
    return [(x - this.cx) * this.s + this.w / 2, (y - COURT.W / 2) * this.s * this.tilt + this.h / 2 + (this.tilt < 1 ? 14 : 0) - z * this.s * this.zk];
  }

  path(points, close = false) {
    const c = this.ctx;
    c.beginPath();
    points.forEach(([x, y], i) => {
      const [sx, sy] = this.P(x, y);
      if (i) c.lineTo(sx, sy);
      else c.moveTo(sx, sy);
    });
    if (close) c.closePath();
  }

  rect(x0, y0, x1, y1) {
    this.path([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true);
  }

  arc(cx, cy, r, a0, a1, n = 40) {
    return Array.from({ length: n + 1 }, (_, i) => {
      const a = a0 + ((a1 - a0) * i) / n;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    });
  }

  /** Arte do ginásio em cache: refeita só se o zoom pedir mais resolução ou o logo terminar de carregar. */
  courtArt() {
    const home = this.sim.teams[0];
    const logo = this.logoOf(home);
    const ready = Boolean(logo && logo.complete && logo.naturalWidth > 1);
    // resolução alvo: a da tela no zoom atual, em degraus, com teto para não estourar memória
    const want = clamp(Math.ceil((this.s * this.dpr) / 6) * 6, 12, 30);
    if (!this.art || this.artPpf < want || this.artLogo !== ready) {
      this.artPpf = Math.max(want, this.artPpf ?? 0);
      this.artLogo = ready;
      this.art = renderCourtArt(this.artPpf, courtTheme(home), logo);
    }
    return this.art;
  }

  drawCourt() {
    const c = this.ctx;
    c.fillStyle = '#05070a';
    c.fillRect(0, 0, this.w, this.h);
    const [dx, dy] = this.P(-MARGIN, -MARGIN);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(this.courtArt(), dx, dy, (COURT.L + 2 * MARGIN) * this.s, (COURT.W + 2 * MARGIN) * this.s * this.tilt);
  }

  /** Tabela, aro e rede: desenhados por cima dos jogadores (ficam a 3 m de altura) e maiores que a escala real, para leitura. */
  drawHoops() {
    const c = this.ctx;
    const mid = COURT.W / 2;
    for (const dir of [1, -1]) {
      const hoop = hoopOf(dir);
      const sx = (d) => (dir > 0 ? COURT.L - d : d);
      const z = this.zk ? 10 : 0;
      const [hx, hy] = this.P(hoop.x, hoop.y, z);
      const [b0x, b0y] = this.P(sx(4), mid - 3, z ? 9.5 : 0);
      const [b1x, b1y] = this.P(sx(4), mid + 3, z ? 9.5 : 0);
      const rr = Math.max(7, 1.2 * this.s);
      c.lineCap = 'round';
      // suporte até a linha de fundo
      const [px, py] = this.P(sx(0) + (dir > 0 ? 2 : -2), mid, 0);
      c.strokeStyle = 'rgba(40,46,58,0.8)';
      c.lineWidth = Math.max(2.5, this.s * 0.3);
      c.beginPath();
      c.moveTo(px, py);
      c.lineTo((b0x + b1x) / 2, (b0y + b1y) / 2);
      c.stroke();
      // tabela
      const top = this.zk ? 3.5 * this.s * this.zk : 0;
      if (top) {
        // câmera lateral: a tabela é vista de perfil — uma placa vertical acima do aro
        const [tx, ty] = this.P(sx(4), mid, 13.2);
        const [ux, uy] = this.P(sx(4), mid, 9.2);
        c.strokeStyle = '#0c1016';
        c.lineWidth = Math.max(7, this.s * 0.7);
        c.beginPath();
        c.moveTo(ux, uy);
        c.lineTo(tx, ty);
        c.stroke();
        c.strokeStyle = '#ffffff';
        c.lineWidth = Math.max(4, this.s * 0.42);
        c.beginPath();
        c.moveTo(ux, uy);
        c.lineTo(tx, ty);
        c.stroke();
      } else {
        c.strokeStyle = '#0c1016';
        c.lineWidth = Math.max(5, this.s * 0.62);
        c.beginPath();
        c.moveTo(b0x, b0y);
        c.lineTo(b1x, b1y);
        c.stroke();
        c.strokeStyle = '#ffffff';
        c.lineWidth = Math.max(3, this.s * 0.38);
        c.beginPath();
        c.moveTo(b0x, b0y);
        c.lineTo(b1x, b1y);
        c.stroke();
      }
      // haste entre a tabela e o aro
      c.strokeStyle = '#ff5a1f';
      c.lineWidth = Math.max(2.5, this.s * 0.3);
      c.beginPath();
      c.moveTo((b0x + b1x) / 2, (b0y + b1y) / 2 - top * 0.15);
      c.lineTo(hx - dir * rr * 0.95, hy);
      c.stroke();
      // rede (trama clara) e aro com contorno branco: visível sobre qualquer cor de garrafão
      c.save();
      c.beginPath();
      c.ellipse(hx, hy, rr, rr * this.tilt, 0, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.22)';
      c.fill();
      c.clip();
      c.strokeStyle = 'rgba(255,255,255,0.7)';
      c.lineWidth = 1;
      for (let k = -3; k <= 3; k++) {
        c.beginPath();
        c.moveTo(hx + (k * rr) / 2 - rr, hy - rr);
        c.lineTo(hx + (k * rr) / 2 + rr, hy + rr);
        c.moveTo(hx + (k * rr) / 2 + rr, hy - rr);
        c.lineTo(hx + (k * rr) / 2 - rr, hy + rr);
        c.stroke();
      }
      c.restore();
      c.beginPath();
      c.ellipse(hx, hy, rr, rr * this.tilt, 0, 0, Math.PI * 2);
      c.strokeStyle = '#ffffff';
      c.lineWidth = Math.max(5, this.s * 0.5);
      c.stroke();
      c.strokeStyle = '#ff5a1f';
      c.lineWidth = Math.max(3, this.s * 0.32);
      c.stroke();
      c.lineCap = 'butt';
    }
  }

  drawPlayer(p) {
    const c = this.ctx;
    const sim = this.sim;
    const team = sim.teams[p.team];
    const speed = Math.hypot(p.vx, p.vy);
    const an = p.anim && sim.t - p.anim.t < 0.7 ? p.anim : null;
    const at = an ? (sim.t - an.t) / 0.7 : 0;
    // altura visual: salto no arremesso/contest/enterrada, passada na corrida
    let z = 0;
    if (an && (an.type === 'shot' || an.type === 'contest' || an.type === 'dunk')) z = Math.sin(Math.min(1, at * 1.6) * Math.PI) * (an.type === 'dunk' ? 2.6 : 1.5);
    const bob = speed > 3 ? Math.abs(Math.sin(sim.t * (5 + speed * 0.5) + p.id)) * 0.18 : 0;
    const [sx, sy0] = this.P(p.x, p.y);
    const r = clamp(this.s * 1.45 * this.opt.markerScale, 8, 42);
    const lift = (z + bob) * this.s * (this.zk || 0.45);
    const sy = sy0 - lift - (this.tilt < 1 ? r * 0.55 : 0);
    const fallen = p.stun > 0;
    const stance = p.team !== sim.offense && (p.state === 'contain' || p.state === 'contest' || p.state === 'stance' || p.state === 'post');
    const ring = readable(team.colors);

    // sombra no chão: encolhe e clareia quando o jogador salta
    c.fillStyle = `rgba(0,0,0,${0.32 - Math.min(0.14, z * 0.05)})`;
    c.beginPath();
    c.ellipse(sx, sy0 + (this.tilt < 1 ? 2 : r * 0.14), r * (1 - Math.min(0.3, z * 0.08)), r * 0.45 * (this.tilt < 1 ? 0.8 : 1), 0, 0, Math.PI * 2);
    c.fill();

    c.save();
    c.translate(sx, sy);
    if (fallen) c.rotate(0.6);
    else if (speed > 6) c.rotate(clamp((p.vx / 26) * 0.22, -0.22, 0.22)); // inclina na corrida
    c.scale(stance ? 1.08 : 1, stance ? 0.94 : 1);

    // Deslocamento legível sem alterar a trajetória usada pelo simulador.
    if (speed > 4 && !fallen && document.documentElement.dataset.motion !== 'off') {
      c.strokeStyle = `rgba(255,255,255,${Math.min(0.36, speed / 45)})`;
      c.lineWidth = Math.max(1, r * 0.075);
      c.lineCap = 'round';
      for (const offset of [-0.35, 0.2]) {
        c.beginPath();
        c.moveTo(-Math.cos(p.facing) * r * (1.25 + offset), -Math.sin(p.facing) * r * (1.25 + offset));
        c.lineTo(-Math.cos(p.facing) * r * (1.8 + offset), -Math.sin(p.facing) * r * (1.8 + offset));
        c.stroke();
      }
      c.lineCap = 'butt';
    }

    // indicador de orientação corporal
    c.fillStyle = ring;
    c.beginPath();
    c.arc(0, 0, r + 3, p.facing - 0.45, p.facing + 0.45);
    c.lineTo(Math.cos(p.facing) * (r + 8), Math.sin(p.facing) * (r + 8) * this.tilt);
    c.closePath();
    c.fill();

    // marcador: anel da franquia (dourado e com brilho para quem tem a bola) + foto
    if (p.hasBall) {
      c.shadowColor = 'rgba(255, 211, 77, 0.9)';
      c.shadowBlur = 14;
    }
    c.beginPath();
    c.arc(0, 0, r + 3, 0, Math.PI * 2);
    c.fillStyle = p.hasBall ? '#ffd34d' : ring;
    c.fill();
    c.shadowBlur = 0;
    c.beginPath();
    c.arc(0, 0, r + 0.8, 0, Math.PI * 2);
    c.fillStyle = '#0c1016';
    c.fill();
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fillStyle = team.colors?.[0] ?? '#1b2231';
    c.fill();
    c.fillStyle = 'rgba(8,10,16,0.45)';
    c.fill();
    c.save();
    c.clip();
    const img = this.imageOf(p);
    if (img && img.complete && img.naturalWidth > 1) {
      const iw = r * 2.9 * this.opt.photoScale;
      const ih = iw * (img.naturalHeight / img.naturalWidth);
      c.globalAlpha = fallen ? 0.55 : 1;
      c.imageSmoothingQuality = 'high';
      c.drawImage(img, -iw / 2, -r * 1.02 * this.opt.photoScale, iw, ih);
      c.globalAlpha = 1;
    } else {
      // Corpo estilizado do próprio time quando não há fotografia disponível.
      c.fillStyle = '#252d39';
      c.beginPath();
      c.ellipse(0, r * 0.8, r * 0.77, r * 0.62, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = team.colors?.[1] ?? '#e5e9ef';
      c.fillRect(-r * 0.55, r * 0.43, r * 1.1, r * 0.12);
      c.fillStyle = team.colors?.[0] ?? '#677488';
      c.beginPath();
      c.ellipse(0, r * 0.83, r * 0.63, r * 0.58, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#b58b6f';
      c.beginPath();
      c.arc(0, -r * 0.23, r * 0.39, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    if (p.planted === 'screen') {
      c.strokeStyle = '#fff';
      c.lineWidth = 2;
      c.setLineDash([4, 3]);
      c.strokeRect(-r - 5, -r - 5, (r + 5) * 2, (r + 5) * 2);
      c.setLineDash([]);
    }
    c.restore();

    // energia (arco discreto) e nome
    if (this.showStamina) {
      c.strokeStyle = p.energy > 0.7 ? '#35c98a' : p.energy > 0.5 ? '#f2b53d' : '#f0564f';
      c.lineWidth = 2.5;
      c.lineCap = 'round';
      c.beginPath();
      c.arc(sx, sy, r + 6.5, Math.PI * 0.65, Math.PI * 0.65 + Math.PI * 0.7 * p.energy);
      c.stroke();
      c.lineCap = 'butt';
    }
    if (this.opt.names && r >= 10) {
      const size = clamp(r * 0.6, 10, 14);
      c.font = `700 ${size}px Bahnschrift, 'Segoe UI', sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'alphabetic';
      const w = c.measureText(p.short).width + 10;
      const ly = sy + r + 9;
      c.fillStyle = 'rgba(7,9,13,0.78)';
      c.beginPath();
      c.roundRect(sx - w / 2, ly, w, size + 5, 3);
      c.fill();
      c.fillStyle = p.hasBall ? '#ffd34d' : '#fff';
      c.fillText(p.short, sx, ly + size);
    }
  }

  drawBall() {
    const c = this.ctx;
    const sim = this.sim;
    const b = sim.ball;
    if (b.state === 'dead') return;
    let { x, y, z } = b;
    if (b.state === 'held' && b.owner) {
      const o = b.owner;
      const dribbling = o.act.type !== 'gather' && sim.state === 'play' && o.dribbled;
      if (dribbling) {
        // drible: a bola oscila entre a mão e o chão; o ritmo acompanha a velocidade do portador
        const speed = Math.hypot(o.vx, o.vy);
        const cross = o.anim && sim.t - o.anim.t < 0.35 && ['crossover', 'between', 'behind', 'spin'].includes(o.anim.type);
        z = 0.5 + Math.abs(Math.sin(sim.t * (6.5 + speed * 0.35))) * (cross ? 1.6 : 2.7);
        if (cross) {
          // a bola cruza o corpo durante a troca de mão
          const u = (sim.t - o.anim.t) / 0.35;
          const side = lerp(-o.hand, o.hand, u) * 0.9;
          const back = o.anim.type === 'behind' ? -0.8 : 0.9;
          x = o.x + Math.cos(o.facing) * back - Math.sin(o.facing) * side;
          y = o.y + Math.sin(o.facing) * back + Math.cos(o.facing) * side;
        } else {
          // bola ao lado do corpo, na mão do drible (não escondida atrás da foto)
          x = o.x + Math.cos(o.facing) * 1.1 - Math.sin(o.facing) * o.hand * 1.3;
          y = o.y + Math.sin(o.facing) * 1.1 + Math.cos(o.facing) * o.hand * 1.3;
        }
      } else if (o.act.type === 'gather') z = 5 + Math.min(1, (sim.t - o.act.t0) / 0.4) * 3;
      else z = 4;
    }
    this.trail.push([x, y, z]);
    if (this.trail.length > 9) this.trail.shift();
    const flying = b.state === 'pass' || b.state === 'shot';
    const r = clamp(this.s * 0.72 * this.opt.ballScale, 4.5, 18) * (this.tilt === 1 ? 1 + z * 0.035 : 1);
    const [gx, gy] = this.P(x, y, 0);
    const [sx, sy] = this.tilt === 1 ? [gx - z * this.s * 0.12, gy - z * this.s * 0.3] : this.P(x, y, z);
    // sombra no chão: quanto mais alta a bola, mais afastada e difusa
    c.fillStyle = `rgba(0,0,0,${clamp(0.45 - z * 0.02, 0.14, 0.45)})`;
    c.beginPath();
    c.ellipse(gx, gy, r * (1 + z * 0.02), r * 0.55, 0, 0, Math.PI * 2);
    c.fill();
    if (flying && this.opt.trail) {
      c.strokeStyle = 'rgba(255,190,110,0.4)';
      c.lineWidth = r * 0.8;
      c.lineCap = 'round';
      c.beginPath();
      this.trail.forEach(([tx, ty, tz], i) => {
        const [px, py] = this.tilt === 1 ? [this.P(tx, ty)[0] - tz * this.s * 0.12, this.P(tx, ty)[1] - tz * this.s * 0.3] : this.P(tx, ty, tz);
        if (i) c.lineTo(px, py);
        else c.moveTo(px, py);
      });
      c.stroke();
      c.lineCap = 'butt';
    }
    // contorno claro: a bola nunca se confunde com a madeira
    c.beginPath();
    c.arc(sx, sy, r + 1.6, 0, Math.PI * 2);
    c.fillStyle = flying ? '#fff' : 'rgba(255,255,255,0.75)';
    c.fill();
    c.fillStyle = '#f0731c';
    c.beginPath();
    c.arc(sx, sy, r, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#4a2008';
    c.lineWidth = 1.1;
    c.stroke();
    // gomos: dão a leitura de rotação
    c.beginPath();
    c.ellipse(sx, sy, r, r * Math.abs(Math.cos(b.spin)), b.spin * 0.3, 0, Math.PI * 2);
    c.stroke();
  }

  /** Avisos curtos de lance (ROUBO, TOCO, TROCA…): somem em pouco mais de um segundo. */
  drawEffects() {
    if (!this.opt.popups) return;
    const c = this.ctx;
    const sim = this.sim;
    for (const e of sim.effects) {
      const age = sim.t - e.t;
      if (age > 1.3 || age < 0) continue;
      const [sx, sy0] = this.P(e.x, e.y);
      const sy = sy0 - 38 - Math.min(1, age * 2.2) * 14;
      c.globalAlpha = clamp((1.3 - age) * 2.5, 0, 1);
      c.font = `700 12px Bahnschrift, 'Segoe UI', sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const w = c.measureText(e.label).width + 14;
      c.fillStyle = 'rgba(7,9,13,0.88)';
      c.beginPath();
      c.roundRect(sx - w / 2, sy - 10, w, 20, 4);
      c.fill();
      c.fillStyle = FX_COLOR[e.label] ?? '#fff';
      c.fillRect(sx - w / 2, sy + 8, w, 2);
      c.fillText(e.label, sx, sy);
      c.globalAlpha = 1;
    }
    c.textBaseline = 'alphabetic';
  }

  /** Só no modo Debug: alvos, vetores, marcações, linhas de passe, espaços e leitura do portador. */
  drawDebug() {
    const c = this.ctx;
    const sim = this.sim;
    const line = (a, b, color, dash = []) => {
      c.strokeStyle = color;
      c.setLineDash(dash);
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(...this.P(a.x, a.y));
      c.lineTo(...this.P(b.x, b.y));
      c.stroke();
      c.setLineDash([]);
    };
    const dir = sim.dirOf(sim.offense);
    c.font = '10px Consolas, monospace';
    c.textAlign = 'center';
    for (const name of Object.keys(SLOTS)) {
      const s = slotPos(dir, name);
      const [x, y] = this.P(s.x, s.y);
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.fillRect(x - 2, y - 2, 4, 4);
      c.fillText(name, x, y - 5);
    }
    const handler = sim.ball.owner;
    for (const p of sim.court) {
      line(p, { x: p.tx, y: p.ty }, p.team === sim.offense ? 'rgba(80,220,140,0.8)' : 'rgba(120,170,255,0.8)', [3, 3]);
      line(p, { x: p.x + p.vx * 0.5, y: p.y + p.vy * 0.5 }, '#fff');
      if (p.team !== sim.offense && p.man) line(p, p.man, 'rgba(255,90,90,0.45)');
      const [x, y] = this.P(p.x, p.y);
      c.fillStyle = '#fff';
      c.fillText(`${p.x.toFixed(0)},${p.y.toFixed(0)} ${Math.hypot(p.vx, p.vy).toFixed(0)}p/s ${p.team === sim.offense ? p.act.type : p.state}`, x, y - 26);
      if (p.team !== sim.offense) {
        c.strokeStyle = 'rgba(120,170,255,0.3)';
        c.beginPath();
        c.ellipse(x, y, p.prof.def.length * 0.5 * this.s, p.prof.def.length * 0.5 * this.s * this.tilt, 0, 0, Math.PI * 2);
        c.stroke();
      }
    }
    if (handler && sim.ball.state === 'held') {
      for (const m of sim.court) {
        if (m.team !== handler.team || m === handler) continue;
        const risk = laneRisk(sim, handler, m);
        line(handler, m, `rgba(${Math.round(80 + risk * 175)},${Math.round(220 - risk * 170)},90,0.7)`);
      }
    }
    if (sim.help) {
      const [x, y] = this.P(sim.help.spot.x, sim.help.spot.y);
      c.strokeStyle = '#ff5a5a';
      c.strokeRect(x - 5, y - 5, 10, 10);
    }
    if (sim.reb?.live) {
      const [x, y] = this.P(sim.reb.x, sim.reb.y);
      c.strokeStyle = '#ffd34d';
      c.beginPath();
      c.arc(x, y, 8, 0, Math.PI * 2);
      c.stroke();
    }
  }

  draw(dt = 1 / 60) {
    this.resize();
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.updateCamera(dt);
    this.drawCourt();
    const order = [...this.sim.court].sort((a, b) => a.y - b.y);
    for (const p of order) this.drawPlayer(p);
    this.drawHoops();
    this.drawBall();
    if (this.vignette) {
      c.fillStyle = this.vignette;
      c.fillRect(0, 0, this.w, this.h);
    }
    this.drawEffects();
    if (this.debug) this.drawDebug();
  }
}

/** Cor legível sobre fundo escuro: usa a secundária quando a principal é quase preta. */
function readable(colors) {
  const hex = colors?.[0] ?? '#8a93a7';
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum < 0.2 ? colors?.[1] ?? '#8a93a7' : hex;
}
