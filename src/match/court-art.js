// Arte estática do ginásio (arquibancada, bancos, madeira, pintura e linhas), desenhada uma vez
// num canvas fora da tela, em coordenadas de quadra (pés). O renderer só copia esta imagem a cada
// quadro — é o que mantém a quadra nítida e o desenho barato. Nada aqui é lido pela simulação.
import { COURT, hoopOf } from './config.js';

export const APRON = 4; // faixa pintada em volta da quadra
export const STANDS = 13; // profundidade da arquibancada
export const MARGIN = APRON + STANDS; // quanto a arte se estende além das linhas

/** Ruído determinístico em [0,1): a torcida é sempre a mesma para o mesmo ginásio (nada de Math.random). */
const noise = (i, j) => {
  const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

function arcPoints(cx, cy, r, a0, a1, n = 48) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
}

function poly(c, points, close = false) {
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  if (close) c.closePath();
}

function threePointPath(c, dir) {
  const hoop = hoopOf(dir);
  const mid = COURT.W / 2;
  const bx = dir > 0 ? COURT.L : 0;
  const a = Math.asin(COURT.cornerLat / COURT.three);
  const cornerX = hoop.x - dir * Math.cos(a) * COURT.three;
  const base = dir > 0 ? Math.PI : 0;
  poly(c, [[bx, mid - COURT.cornerLat], [cornerX, mid - COURT.cornerLat], ...arcPoints(hoop.x, hoop.y, COURT.three, base - a * dir, base + a * dir), [cornerX, mid + COURT.cornerLat], [bx, mid + COURT.cornerLat]]);
}

function drawWood(c, theme) {
  const { L, W } = COURT;
  c.fillStyle = theme.floor;
  c.fillRect(0, 0, L, W);
  c.save();
  c.beginPath();
  c.rect(0, 0, L, W);
  c.clip();
  if (theme.wood === 'parquet') {
    // painéis quadrados com o veio alternado, como o piso clássico de Boston
    const size = 5;
    for (let i = 0; i * size < L; i++) {
      for (let j = 0; j * size < W; j++) {
        const dark = (i + j) % 2 === 0;
        c.fillStyle = dark ? 'rgba(95, 60, 20, 0.11)' : 'rgba(255, 235, 195, 0.08)';
        c.fillRect(i * size, j * size, size, size);
        c.strokeStyle = 'rgba(70, 40, 10, 0.12)';
        c.lineWidth = 0.05;
        for (let k = 1; k < 5; k++) {
          c.beginPath();
          if (dark) (c.moveTo(i * size + k, j * size), c.lineTo(i * size + k, (j + 1) * size));
          else (c.moveTo(i * size, j * size + k), c.lineTo((i + 1) * size, j * size + k));
          c.stroke();
        }
      }
    }
  } else if (theme.wood === 'herringbone') {
    // espinha de peixe: faixas diagonais alternadas
    const step = 3;
    c.lineWidth = 0.9;
    for (let k = -W; k < L + W; k += step) {
      const band = Math.round(k / step);
      c.strokeStyle = band % 2 ? 'rgba(60, 50, 40, 0.13)' : 'rgba(255, 250, 240, 0.10)';
      for (let j = 0; j * step < W; j++) {
        const up = (band + j) % 2 === 0;
        c.beginPath();
        c.moveTo(k, j * step + (up ? step : 0));
        c.lineTo(k + step, j * step + (up ? 0 : step));
        c.stroke();
      }
    }
  } else {
    // tábuas longas ao comprimento da quadra, com tons levemente diferentes e emendas
    const plank = 0.75;
    for (let j = 0; j * plank < W; j++) {
      const t = noise(j, 3);
      c.fillStyle = t > 0.5 ? `rgba(255, 238, 200, ${(t - 0.5) * 0.16})` : `rgba(90, 55, 15, ${(0.5 - t) * 0.18})`;
      c.fillRect(0, j * plank, L, plank);
      c.fillStyle = 'rgba(60, 35, 10, 0.16)';
      for (let x = noise(j, 9) * 9; x < L; x += 7 + noise(j, x) * 5) c.fillRect(x, j * plank, 0.06, plank);
    }
    c.fillStyle = 'rgba(60, 35, 10, 0.10)';
    for (let j = 1; j * plank < W; j++) c.fillRect(0, j * plank - 0.02, L, 0.04);
  }
  // brilho do verniz sob os refletores
  const shine = c.createRadialGradient(L / 2, W / 2, 4, L / 2, W / 2, L * 0.55);
  shine.addColorStop(0, 'rgba(255, 250, 235, 0.16)');
  shine.addColorStop(1, 'rgba(255, 250, 235, 0)');
  c.fillStyle = shine;
  c.fillRect(0, 0, L, W);
  // Duas faixas largas de refletores. São parte da arte em cache, sem custo por frame.
  for (const x of [L * 0.27, L * 0.74]) {
    const light = c.createLinearGradient(x - 8, 0, x + 8, W);
    light.addColorStop(0, 'rgba(255,255,245,0)');
    light.addColorStop(0.5, 'rgba(255,255,245,0.095)');
    light.addColorStop(1, 'rgba(255,255,245,0)');
    c.fillStyle = light;
    c.fillRect(x - 8, 0, 16, W);
  }
  c.restore();
}

function drawStands(c, theme) {
  const { L, W } = COURT;
  // concreto escuro sob a arquibancada
  c.fillStyle = '#0b0d12';
  c.fillRect(-MARGIN, -MARGIN, L + 2 * MARGIN, W + 2 * MARGIN);
  const ROW = 1.22; // distância entre fileiras
  const rows = Math.floor((STANDS - 1.2) / ROW);
  const palette = [theme.crowd[0], theme.crowd[1], '#e8e6e1', '#2a2f3a', '#7c8597', '#c7a17a', '#3b4050', '#b9412f'];
  for (let r = 0; r < rows; r++) {
    const off = APRON + 1.3 + r * ROW; // distância desta fileira até a linha da quadra
    // degrau: cada fileira um pouco mais clara (mais alta, mais luz)
    c.strokeStyle = `rgba(255,255,255,${0.03 + r * 0.004})`;
    c.lineWidth = ROW * 0.92;
    c.strokeRect(-off, -off, L + 2 * off, W + 2 * off);
    const seat = 1.12;
    const dot = (x, y, i) => {
      const n = noise(i, r * 7 + 1);
      if (n < 0.07) return; // cadeira vazia
      const shade = 0.5 + 0.5 * noise(i * 3, r + 11);
      c.globalAlpha = Math.max(0.22, 0.34 + 0.34 * shade - r * 0.012);
      c.fillStyle = palette[Math.floor(noise(i, r + 5) * (n < 0.55 ? 2 : palette.length))];
      c.beginPath();
      c.arc(x, y, 0.46, 0, Math.PI * 2);
      c.fill();
    };
    let i = 0;
    for (let x = -off + 0.8; x <= L + off - 0.8; x += seat) {
      // corredores de acesso atrás das linhas de fundo e no meio da quadra
      if (Math.abs(x - L / 2) < 1.6) continue;
      dot(x, -off, i++);
      dot(x, W + off, i++);
    }
    for (let y = -off + seat; y <= W + off - seat; y += seat) {
      if (Math.abs(y - W / 2) < 1.6) continue;
      dot(-off, y, i++);
      dot(L + off, y, i++);
    }
  }
  c.globalAlpha = 1;
}

function drawApron(c, theme) {
  const { L, W } = COURT;
  c.fillStyle = theme.apron;
  c.fillRect(-APRON, -APRON, L + 2 * APRON, W + 2 * APRON);
  c.fillStyle = 'rgba(0,0,0,0.18)';
  c.fillRect(-APRON, -APRON, L + 2 * APRON, W + 2 * APRON);
  const text = (label, x, y, size, rot) => {
    if (!label) return;
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    c.font = `700 ${size}px Bahnschrift, 'Arial Narrow', Arial, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = 'rgba(255,255,255,0.92)';
    c.fillText(label, 0, 0.1);
    c.restore();
  };
  // nome nas linhas de fundo, cidade nas laterais
  text(theme.baseline, -APRON / 2, W / 2, 2.5, -Math.PI / 2);
  text(theme.baseline, L + APRON / 2, W / 2, 2.5, Math.PI / 2);
  text(theme.sideline, L * 0.25, W + APRON / 2, 2.1, 0);
  text(theme.sideline, L * 0.75, W + APRON / 2, 2.1, 0);
  // lado de cima: mesa do placar no centro e os dois bancos
  c.fillStyle = '#11141b';
  c.fillRect(L / 2 - 9, -APRON + 0.5, 18, 1.5);
  c.fillStyle = 'rgba(255,255,255,0.85)';
  c.fillRect(L / 2 - 9, -APRON + 1.75, 18, 0.25);
  for (const x0 of [L / 2 - 34, L / 2 + 12]) {
    for (let k = 0; k < 14; k++) {
      c.fillStyle = '#161a22';
      c.fillRect(x0 + k * 1.6, -APRON + 0.6, 1.25, 1.25);
      c.fillStyle = theme.trim;
      c.globalAlpha = 0.75;
      c.fillRect(x0 + k * 1.6, -APRON + 0.6, 1.25, 0.3);
      c.globalAlpha = 1;
    }
  }
}

function drawMarkings(c, theme, logo) {
  const { L, W } = COURT;
  const mid = W / 2;
  const LINE = '#ffffff';
  const lw = 0.17;

  // área tingida dentro do arco (pisos de dois tons)
  if (theme.stain) {
    for (const dir of [1, -1]) {
      threePointPath(c, dir);
      c.fillStyle = theme.stain;
      c.fill();
    }
  }

  // círculo central com a identidade do mandante
  poly(c, arcPoints(L / 2, mid, 6, 0, Math.PI * 2), true);
  c.fillStyle = theme.center;
  c.fill();
  if (logo && logo.complete && logo.naturalWidth > 1) {
    const size = 9.4;
    const ratio = logo.naturalHeight / logo.naturalWidth;
    c.drawImage(logo, L / 2 - size / 2, mid - (size * ratio) / 2, size, size * ratio);
  }

  c.strokeStyle = LINE;
  c.lineWidth = lw;
  c.lineJoin = 'round';
  c.strokeRect(0, 0, L, W);
  poly(c, [[L / 2, 0], [L / 2, W]]);
  c.stroke();
  poly(c, arcPoints(L / 2, mid, 6, 0, Math.PI * 2), true);
  c.stroke();
  poly(c, arcPoints(L / 2, mid, 2, 0, Math.PI * 2), true);
  c.stroke();

  for (const dir of [1, -1]) {
    const hoop = hoopOf(dir);
    const bx = dir > 0 ? L : 0;
    const sx = (d) => (dir > 0 ? L - d : d);
    const x0 = Math.min(bx, sx(COURT.ft));
    // garrafão pintado, com a borda na cor de contraste
    c.fillStyle = theme.paint;
    c.fillRect(x0, mid - COURT.paintHalf, COURT.ft, COURT.paintHalf * 2);
    c.strokeStyle = theme.trim;
    c.lineWidth = 0.42;
    c.strokeRect(x0 + 0.2, mid - COURT.paintHalf + 0.2, COURT.ft - 0.4, COURT.paintHalf * 2 - 0.4);
    c.strokeStyle = LINE;
    c.lineWidth = lw;
    c.strokeRect(x0, mid - COURT.paintHalf, COURT.ft, COURT.paintHalf * 2);
    // marcas de posição no garrafão
    for (const d of [7, 8, 11, 14]) {
      for (const side of [-1, 1]) {
        poly(c, [[sx(d), mid + side * COURT.paintHalf], [sx(d), mid + side * (COURT.paintHalf + 0.7)]]);
        c.stroke();
      }
    }
    // círculo do lance livre: metade cheia para fora, tracejada para dentro
    const out = dir > 0 ? [Math.PI / 2, (Math.PI * 3) / 2] : [-Math.PI / 2, Math.PI / 2];
    poly(c, arcPoints(sx(COURT.ft), mid, 6, out[0], out[1]));
    c.stroke();
    c.setLineDash([0.9, 0.9]);
    poly(c, arcPoints(sx(COURT.ft), mid, 6, out[1], out[0] + Math.PI * 2));
    c.stroke();
    c.setLineDash([]);
    // linha de três e área restrita
    threePointPath(c, dir);
    c.stroke();
    const base = dir > 0 ? Math.PI : 0;
    poly(c, [[sx(4), mid - COURT.ra], ...arcPoints(hoop.x, hoop.y, COURT.ra, base - Math.PI / 2, base + Math.PI / 2), [sx(4), mid + COURT.ra]]);
    c.stroke();
  }
}

/**
 * @param ppf   pixels por pé (resolução da arte)
 * @param theme tema de courts.js
 * @param logo  HTMLImageElement do logo do mandante (pode ainda estar carregando)
 */
export function renderCourtArt(ppf, theme, logo) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round((COURT.L + 2 * MARGIN) * ppf);
  canvas.height = Math.round((COURT.W + 2 * MARGIN) * ppf);
  const c = canvas.getContext('2d');
  c.scale(ppf, ppf);
  c.translate(MARGIN, MARGIN);
  drawStands(c, theme);
  drawApron(c, theme);
  drawWood(c, theme);
  drawMarkings(c, theme, logo);
  return canvas;
}
