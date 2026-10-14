// Abertura do jogo (sem carreira aberta): continuar, nova carreira, modos avulsos, saves e configurações.
import { h, icon, mount } from '../dom.js';
import { date as fmtDate, record } from '../format.js';
import { navigate } from '../router.js';
import { toast } from '../components/feedback.js';
import { openRecovery } from './saves.js';
import { GAME_MODES, MODE_BY_ID, STATUS_LABEL } from '../../core/modes.js';
import { listSaves, openCareer } from '../../core/saves.js';
import { buildTeams, loadSeed } from '../../core/universe.js';
import { ROLE_BY_ID } from '../../core/career-options.js';
import { seasonLabel } from '../../contracts/cap.js';
import { getPhotoManifest, playerAvatar, teamLogo } from '../../media/photos.js';

export function startView() {
  const stage = h('div', { class: 'title-stage' });
  const menu = h('nav', { class: 'title-menu', 'aria-label': 'Menu principal' });
  const dataLine = h('p', { class: 'faint small' }, 'Verificando banco de dados…');
  const root = h(
    'div',
    { class: 'title-screen' },
    h(
      'div',
      { class: 'title-main' },
      h('div', { class: 'title-left' }, h('div', { class: 'wordmark' }, h('span', { class: 'micro' }, 'Temporada 2026-27 · 32 franquias'), h('h1', null, 'NBA ', h('em', null, 'Universe'), h('br'), 'Manager')), menu, dataLine),
      stage,
    ),
    h(
      'section',
      { class: 'title-modes' },
      h('div', { class: 'title-modes-heading' }, h('span', { class: 'eyebrow' }, 'NBA UNIVERSE MANAGER'), h('h2', null, 'Escolha o modo'), h('span', { class: 'title-modes-line' })),
      h(
        'div',
        { class: 'mode-grid' },
        [...GAME_MODES, { id:'nba-arcade', kind:'instant', status:'functional', label:'NBA Arcade', icon:'star', path:'/arcade/hub', tagline:'All-Star · Street · Roster Studio', description:'Partidas All-Star, concursos, rosters personalizados, Street 3×3 e Copa Relâmpago independentes da Carreira.' },
          { id:'nbb', kind:'instant', status:'functional', label:'NBB', icon:'court', path:'/international/nbb', tagline:'20 clubes · 9 elencos jogáveis', description:'Novo Basquete Brasil 2025/26: clubes, atletas reais verificados, atributos e amistosos 2D e copas.' },
          { id:'euroleague', kind:'instant', status:'functional', label:'EuroLeague', icon:'star', path:'/international/euroleague', tagline:'20 clubes · copa e partidas', description:'Clubes europeus reais: atletas, retratos identificados, jogo rápido, 2D e torneios avulsos.' },
          { id:'eurobasket', kind:'instant', status:'functional', label:'EuroBasket', icon:'league', path:'/international/eurobasket', tagline:'24 seleções · grupos e mata-mata', description:'EuroBasket 2025 com seleções reais, elencos, partidas e torneio completo simulado.' },
          { id:'wnba', kind:'instant', status:'functional', label:'WNBA Universe', icon:'players', path:'/wnba/hub', tagline:'15 franquias · 182 atletas · jogos avulsos', description:'WNBA independente: elencos de 2026, fotos identificadas, atributos estimados, jogo rápido, 2D e copa. Sem Carreira.' }].map((m) => {
          const href = m.kind === 'career' ? `#/new?modo=${m.id}` : m.path ? `#${m.path}` : null;
          return h(
            href ? 'a' : 'div',
            { class: ['mode-card', m.status === 'planned' && 'planned'], href },
            h('span', { class: 'mode-art', 'aria-hidden': 'true' }, icon(m.icon)),
            h('span', { class: 'grow' }, h('span', { class: 'micro' }, m.tagline), h('strong', null, m.label), h('span', { class: 'mode-text' }, m.description)),
            h('span', { class: ['chip', m.status === 'functional' ? 'good' : m.status === 'partial' ? 'warn' : 'future'], tip: m.missing ?? (m.status === 'planned' ? 'Reservado na arquitetura; ainda não jogável.' : 'Completo no que promete.') }, STATUS_LABEL[m.status]),
          );
        }),
      ),
    ),
  );

  const item = (label, sub, href, { primary = false, iconName = null, onclick = null } = {}) =>
    h(href ? 'a' : 'button', { class: ['title-item', primary && 'primary'], href: href ? `#${href}` : null, type: href ? null : 'button', onclick }, iconName ? icon(iconName) : null, h('span', { class: 'grow' }, h('strong', null, label), sub ? h('small', null, sub) : null), icon('chevron'));

  async function build() {
    const [saves, seed] = await Promise.all([listSaves(), loadSeed().catch(() => null)]);
    const teams = seed ? new Map(buildTeams(seed).map((t) => [t.id, t])) : new Map();
    const last = saves[0] ?? null;
    const team = last ? teams.get(last.teamId) : null;

    if (seed) {
      const photos = getPhotoManifest().summary;
      dataLine.textContent = `${seed.meta.counts.players} jogadores reais${photos ? ` (${photos.total - photos.none} com fotografia)` : ''} · elencos e contratos de ${fmtDate(seed.meta.snapshotDate)} · modelo de ratings ${seed.meta.ratingModel.version}`;
    } else {
      dataLine.className = 'note warn';
      dataLine.textContent = 'Banco de dados indisponível. Gere o seed com "npm run data:all" e recarregue.';
    }

    async function resume(e) {
      e.currentTarget.disabled = true;
      try {
        await openCareer(last.id);
        navigate('/home');
      } catch (err) {
        e.currentTarget.disabled = false;
        openRecovery(last, err, build);
      }
    }

    mount(
      menu,
      last
        ? h(
            'button',
            { class: 'title-continue', type: 'button', onclick: resume, style: { '--c1': last.teamColor, '--c2': last.teamColor2 ?? last.teamColor } },
            h('span', { class: 'micro' }, 'Continuar'),
            h('span', { class: 'row' }, team ? teamLogo(team, { size: 'md' }) : null, h('span', { class: 'grow' }, h('strong', null, last.teamName), h('small', null, `${seasonLabel(last.season)}${last.record ? ` · ${record(last.record)}` : ''} · ${ROLE_BY_ID[last.role]?.label ?? last.role} ${last.managerName}`))),
            h('span', { class: 'faint small' }, `${MODE_BY_ID[last.mode ?? 'universe'].label} · ${fmtDate(last.date)} no universo · último acesso ${new Date(last.updatedAt).toLocaleDateString('pt-BR')}`),
          )
        : null,
      item('Nova carreira', 'Escolha o modo, a franquia e a experiência', '/new', { primary: !last, iconName: 'plus' }),
      item('Jogo rápido', 'Dois times, uma partida — você comanda um deles', '/play/quick', { iconName: 'court' }),
      item('Modo 2D', 'Espectador ou sandbox de uma posse', '/play/spectator', { iconName: 'eye' }),
      item('NBA Arcade · All-Star / Street', 'Novos modos avulsos, editor de rosters e copas', '/arcade/hub', { iconName: 'star' }),
      item('WNBA Universe', '15 franquias · elenco feminino · partidas independentes', '/wnba/hub', { iconName: 'players' }),
      item('NBB · Basquete brasileiro', 'Clubes e partidas FIBA', '/international/nbb', { iconName: 'league' }),
      item('EuroLeague · Clubes europeus', 'Liga e copas europeias', '/international/euroleague', { iconName: 'league' }),
      item('EuroBasket · Seleções', '24 seleções, grupos e mata-mata', '/international/eurobasket', { iconName: 'league' }),
      item('Commissioner', 'God Mode: edite o universo e controle qualquer time', '/new?modo=commissioner', { iconName: 'dev' }),
      item('Saves', saves.length ? `${saves.length} carreira(s) neste navegador` : 'Nenhuma carreira salva ainda', '/saves', { iconName: 'save' }),
      item('Configurações', 'Interface, partida 2D, sliders e acessibilidade', '/settings', { iconName: 'settings' }),
    );

    // palco: a franquia do último save (cores, logo e a estrela do elenco); sem save, as duas novas franquias
    if (last && team) {
      root.style.setProperty('--c1', last.teamColor);
      root.style.setProperty('--c2', last.teamColor2 ?? last.teamColor);
      root.dataset.team = last.teamId;
      mount(stage, h('div', { class: 'stage-logo' }, teamLogo(team, { size: 'xl' })), last.star ? h('div', { class: 'stage-star' }, playerAvatar(last.star, { size: 'hero', color: last.teamColor }), h('strong', null, last.star.name), h('span', { class: 'muted small' }, `${last.star.position ?? ''} · ${last.star.ovr} OVR`)) : null);
    } else {
      const expansion = ['SEA', 'LVJ'].map((id) => teams.get(id)).filter(Boolean);
      mount(stage, h('div', { class: 'stage-duo' }, expansion.map((t) => h('div', { class: 'stage-team', style: { '--c1': t.colors[0] } }, teamLogo(t, { size: 'xl' }), h('strong', null, t.fullName), h('span', { class: 'muted small' }, t.id === 'SEA' ? 'De volta à NBA' : 'A estreia de Las Vegas')))));
    }
  }

  build().catch((err) => {
    console.error(err);
    toast(`Não foi possível montar a tela inicial: ${err.message}`, 'error');
  });
  return root;
}
