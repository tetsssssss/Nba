// Resolver central de imagens. NENHUM outro módulo monta URL de foto ou logo:
// todos chamam playerAvatar() / teamLogo() (ou os resolvers) daqui.
//
// Cadeia de uma foto de jogador: arquivo local (assets/photos) → CDN da NBA →
// ESPN → placeholder neutro. Uma imagem que falha nunca quebra a interface e
// nunca regride para iniciais.

const SOURCES = {
  local: (p) => `assets/photos/${p.id}.png`,
  nba: (p, size) => `https://cdn.nba.com/headshots/nba/latest/${size === 'large' ? '1040x760' : '260x190'}/${p.id}.png`,
  espn: (p, size) => {
    const [w, h] = size === 'large' ? [700, 508] : [350, 254];
    return `https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/${p.espnId}.png&w=${w}&h=${h}`;
  },
};

const PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 190"><rect width="260" height="190" fill="none"/><circle cx="130" cy="78" r="38" fill="#3a4152"/><path d="M52 190c4-46 34-70 78-70s74 24 78 70z" fill="#3a4152"/></svg>',
  );

let manifest = { players: {}, local: {} };
const failed = new Set(); // URLs que falharam nesta sessão — não são pedidas de novo
// Cache de sessão: a URL que já carregou para cada jogador/tamanho. Os próximos avatares
// vão direto nela (sem tentar fontes que falham, sem piscar). Os bytes ficam no cache HTTP
// do navegador; entre sessões, quem lembra qual fonte funciona é o manifesto de fotos.
const resolved = new Map();
const sizeKey = (player, size) => `${player?.id}:${size}`;

/** Carrega o manifesto gerado por `npm run photos:audit`. Sem ele, todas as fontes são tentadas. */
export async function loadPhotoManifest() {
  try {
    const res = await fetch('data/seed/photo-manifest.json');
    if (res.ok) manifest = { players: {}, local: {}, ...(await res.json()) };
  } catch {
    /* sem manifesto: segue tentando todas as fontes */
  }
  return manifest;
}

export const getPhotoManifest = () => manifest;

/** URLs candidatas, em ordem de preferência. Sempre termina no placeholder. */
export function resolvePlayerImage(player, size = 'small') {
  const out = [];
  if (player?.league === 'WNBA') {
    // Separate official WNBA CDN. Never attempt NBA IDs for WNBA athletes.
    return player.wnbaId ? [`https://cdn.wnba.com/headshots/wnba/latest/${size === 'large' ? '1040x760' : '260x190'}/${player.wnbaId}.png`, PLACEHOLDER] : [PLACEHOLDER];
  }
  if (player) {
    const flags = manifest.players?.[player.id];
    if (manifest.local?.[player.id]) out.push(SOURCES.local(player));
    if (player.photoSource !== 'none') {
      if (flags == null || flags.includes('n')) out.push(SOURCES.nba(player, size));
      if (player.espnId && (flags == null || flags.includes('e'))) out.push(SOURCES.espn(player, size));
    }
  }
  const known = resolved.get(sizeKey(player, size));
  const live = out.filter((u) => !failed.has(u));
  return [...(known && live.includes(known) ? [known, ...live.filter((u) => u !== known)] : live), PLACEHOLDER];
}

function chainedImage(urls, alt, key = null) {
  const img = document.createElement('img');
  img.alt = alt;
  img.loading = 'lazy';
  img.decoding = 'async';
  let i = 0;
  img.onerror = () => {
    failed.add(urls[i]);
    i++;
    if (i < urls.length) img.src = urls[i];
    else img.onerror = null;
  };
  img.onload = () => {
    if (key && urls[i] !== PLACEHOLDER) resolved.set(key, urls[i]);
    img.classList.add('loaded');
  };
  img.dataset.placeholder = String(urls.length === 1);
  img.src = urls[0];
  return img;
}

/**
 * Avatar de jogador (foto dentro de um marcador circular).
 * Tamanhos e uso: xs 24 (listas densas, busca) · sm 32 (tabelas) · md 44 (cartões, quintetos) ·
 * lg 72 (cartão de jogador, ficha rápida) · xl 120 (cabeçalhos) · hero 168 (abertura, destaque de jogo).
 * @param opts.size  'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero'
 * @param opts.color cor do anel (ex.: cor da franquia)
 */
export function playerAvatar(player, { size = 'sm', color = null } = {}) {
  const wrap = document.createElement('span');
  wrap.className = `avatar avatar-${size}`;
  if (color) wrap.style.setProperty('--ring', color);
  const quality = size === 'xl' || size === 'lg' || size === 'hero' ? 'large' : 'small';
  wrap.append(chainedImage(resolvePlayerImage(player, quality), player?.name ?? 'Jogador', sizeKey(player, quality)));
  return wrap;
}

/**
 * Pré-carrega as fotos de um grupo pequeno (elenco do usuário, próximo adversário, destaques da tela).
 * Limitado de propósito: nunca dispara centenas de downloads.
 */
export function preloadPlayers(players, { size = 'small', limit = 24 } = {}) {
  for (const player of players.slice(0, limit)) {
    const key = sizeKey(player, size);
    if (resolved.has(key)) continue;
    const urls = resolvePlayerImage(player, size).slice(0, -1);
    if (!urls.length) continue;
    const img = new Image();
    let i = 0;
    img.onload = () => resolved.set(key, urls[i]);
    img.onerror = () => {
      failed.add(urls[i]);
      i++;
      if (i < urls.length) img.src = urls[i];
    };
    img.src = urls[0];
  }
}

/** Números do cache de fotos desta sessão (Dev Tools / diagnóstico). */
export const photoCacheStats = () => ({ resolved: resolved.size, failed: failed.size, canvas: canvasImages.size });

// ------------------------------------------------------------------ logos
const EXPANSION_LOGOS = {
  // Seattle SuperSonics: disco verde com anel dourado e a Space Needle estilizada.
  SEA: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="47" fill="#00653A" stroke="#FFC200" stroke-width="5"/><path d="M26 44c7-6 15-9 24-9s17 3 24 9c-7 5-15 7-24 7s-17-2-24-7z" fill="#FFC200"/><path d="M47 51h6l5 34H42z" fill="#FFC200"/><rect x="49" y="15" width="2" height="21" fill="#FFC200"/><path d="M12 62c12 5 25 7 38 7s26-2 38-7" fill="none" stroke="#FFC200" stroke-width="3" stroke-linecap="round"/></svg>',
  // Las Vegas Jokers: losango de carta em preto-meia-noite, contorno neon e gorro de coringa em ouro.
  LVJ: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 4 92 50 50 96 8 50z" fill="#0D0B14" stroke="#7B2CFF" stroke-width="5" stroke-linejoin="round"/><path d="M28 56c1-12 6-20 12-25 2 6 5 10 10 13 5-3 8-7 10-13 6 5 11 13 12 25-7-4-14-6-22-6s-15 2-22 6z" fill="#F2C14E"/><circle cx="28" cy="57" r="4" fill="#FF2E88"/><circle cx="72" cy="57" r="4" fill="#FF2E88"/><circle cx="50" cy="28" r="4" fill="#FF2E88"/><path d="M34 64c5-2 10-3 16-3s11 1 16 3l-3 8c-4-1-8-2-13-2s-9 1-13 2z" fill="#7B2CFF"/></svg>',
};

/** URL do logo da franquia, ou null quando o logo é desenhado pelo jogo. */
export function resolveTeamLogo(team) {
  if (!team || EXPANSION_LOGOS[team.id]) return null;
  return team.logo && !failed.has(team.logo) ? team.logo : null;
}

function badge(team) {
  const el = document.createElement('span');
  el.className = 'logo-badge';
  el.style.background = team?.colors?.[0] ?? '#3a4152';
  el.textContent = team?.id ?? '?';
  return el;
}

export function teamLogo(team, { size = 'sm' } = {}) {
  const wrap = document.createElement('span');
  wrap.className = `logo logo-${size}`;
  if (team && EXPANSION_LOGOS[team.id]) {
    wrap.innerHTML = EXPANSION_LOGOS[team.id];
    return wrap;
  }
  const url = resolveTeamLogo(team);
  if (!url) {
    wrap.append(badge(team));
    return wrap;
  }
  const img = document.createElement('img');
  img.alt = team.fullName ?? team.id;
  img.loading = 'lazy';
  img.onerror = () => {
    failed.add(url);
    img.replaceWith(badge(team));
  };
  img.src = url;
  wrap.append(img);
  return wrap;
}

/**
 * Auditoria em tempo de execução: tenta carregar a foto de cada jogador e
 * informa qual fonte respondeu. Usada pelas Dev Tools antes de qualquer entrega.
 */
export async function auditPlayerImages(players, { concurrency = 8, onProgress } = {}) {
  const result = { total: players.length, nba: 0, espn: 0, local: 0, placeholder: [], checked: 0 };
  const tryLoad = (url) =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth > 1);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < players.length) {
        const player = players[next++];
        const urls = resolvePlayerImage(player).slice(0, -1);
        let hit = null;
        for (const url of urls) {
          if (await tryLoad(url)) {
            hit = url;
            break;
          }
          failed.add(url);
        }
        if (!hit) result.placeholder.push(player);
        else if (hit.includes('cdn.nba.com')) result.nba++;
        else if (hit.includes('espncdn')) result.espn++;
        else result.local++;
        result.checked++;
        onProgress?.(result);
      }
    }),
  );
  return result;
}

// ------------------------------------------------------------------ Canvas (partida 2D)
const canvasImages = new Map();

/**
 * Imagem da foto do jogador para desenhar em Canvas, com a mesma cadeia de fontes
 * do avatar. Devolve o HTMLImageElement imediatamente; ele carrega em segundo plano
 * (o renderer desenha a silhueta neutra até `complete`).
 */
export function loadPlayerImage(player) {
  if (canvasImages.has(player.id)) return canvasImages.get(player.id);
  // retrato grande (1040×760): o marcador mostra só o rosto, e a foto pequena ficava borrada ao ampliar
  const urls = resolvePlayerImage(player, 'large').slice(0, -1);
  const img = new Image();
  let i = 0;
  img.onload = () => resolved.set(sizeKey(player, 'large'), urls[i]);
  img.onerror = () => {
    failed.add(urls[i]);
    i++;
    if (i < urls.length) img.src = urls[i];
    else img.onerror = null;
  };
  if (urls.length) img.src = urls[0];
  canvasImages.set(player.id, img);
  return img;
}

const logoImages = new Map();

/** Logo da franquia como imagem para Canvas (círculo central da quadra). Mesmo resolver dos logos de tela. */
export function loadTeamLogoImage(team) {
  if (!team) return null;
  if (logoImages.has(team.id)) return logoImages.get(team.id);
  const img = new Image();
  const url = EXPANSION_LOGOS[team.id] ? `data:image/svg+xml,${encodeURIComponent(EXPANSION_LOGOS[team.id])}` : resolveTeamLogo(team);
  if (url) {
    img.onerror = () => failed.add(url);
    img.src = url;
  }
  logoImages.set(team.id, img);
  return img;
}

/** Retrato grande (recorte retangular, sem círculo) para cabeçalhos de perfil. */
export function playerPortrait(player) {
  const wrap = document.createElement('span');
  wrap.className = 'portrait';
  wrap.append(chainedImage(resolvePlayerImage(player, 'large'), player?.name ?? 'Jogador', sizeKey(player, 'large')));
  wrap.firstChild.loading = 'eager';
  return wrap;
}
