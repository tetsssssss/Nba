// Partida 2D: preparação dos três modos avulsos — jogo rápido (você comanda um time),
// espectador (a IA comanda os dois) e sandbox (uma posse em situação controlada).
// Funciona com ou sem carreira aberta; a tela ao vivo fica em match-live.js.
import { h, icon, mount } from '../dom.js';
import { card, ovrBadge, pageHeader, segmented } from '../components/widgets.js';
import { toast } from '../components/feedback.js';
import { renderLive } from './match-live.js';
import { loadPlayerImage, playerAvatar, teamLogo } from '../../media/photos.js';
import { MatchSim } from '../../match/sim.js';
import { SCENARIOS, createSandbox } from '../../match/scenarios.js';
import { TACTIC_OPTIONS } from '../../match/tactics.js';
import { matchUniverse } from '../../match/exhibition.js';
import { getSetting, setSetting } from '../../core/settings.js';
import { activePreset, simSliders, SLIDER_GROUP_BY_ID } from '../../core/sliders.js';
import { hasWorld } from '../../core/world.js';
import { navigate, parseHash } from '../router.js';
import { getWorld, saveWorld } from '../../core/world.js';
import { applyResult, userGameToday } from '../../season/season.js';
import { date as fmtDate } from '../format.js';

const MODES = [['quick', 'Jogo rápido', 'Você comanda um dos times.'], ['spectator', 'Espectador', 'A IA comanda os dois times.'], ['sandbox', 'Sandbox', 'Uma posse em situação controlada.']];
const SUB = {
  quick: 'Escolha os times e jogue agora. Você pede tempo, substitui e muda a tática durante a partida.',
  spectator: 'A IA comanda os dois times. Você controla câmera e velocidade e acompanha as estatísticas.',
  sandbox: 'Laboratório do motor: monte uma posse, escolha quem ataca e quem defende e repita com a mesma semente.',
};
/** Semente sugerida para a partida. É só um rótulo inicial: a simulação inteira deriva dela, não de Math.random. */
const freshSeed = () => `jogo-${String(Date.now() % 100000).padStart(5, '0')}`;
const strength = (roster) => Math.round(roster.slice(0, 8).reduce((a, p, i) => a + p.ovr * (i < 5 ? 1.4 : 0.6), 0) / (5 * 1.4 + Math.min(3, Math.max(0, roster.length - 5)) * 0.6));
/** Cópia do jogador com todos os atributos deslocados (só no sandbox, para testar "e se ele fosse melhor?"). */
const tweak = (player, delta) => (delta ? { ...player, attributes: Object.fromEntries(Object.entries(player.attributes).map(([k, v]) => [k, Math.max(25, Math.min(99, v + delta))])) } : player);

export async function matchView({ mode: routeMode } = {}) {
  const uni = await matchUniverse();
  const teams = uni.teams;
  const root = h('div', { class: 'page match-page' });
  const query = parseHash().query;
  const user = uni.userTeamId && teams.some((t) => t.id === uni.userTeamId) ? uni.team(uni.userTeamId) : null;
  const home = user ?? teams[0];
  const setup = {
    mode: MODES.some(([m]) => m === routeMode) ? routeMode : MODES.some(([m]) => m === query.get('modo')) ? query.get('modo') : 'quick',
    home: home.id,
    away: (teams.find((t) => home.rivals?.includes(t.id)) ?? teams.find((t) => t.id !== home.id)).id,
    control: 0,
    seed: freshSeed(),
    quarter: getSetting('matchQuarter'),
    scenario: 'iso', attacker: null, defender: null, force: '', coverage: 'auto', gap: 3.5, atkBoost: 0, defBoost: 0,
  };
  // jogo oficial da carreira (#/match?jogo=id): times e mando fixos, 12 minutos por quarto, resultado vale
  const official = hasWorld() && query.get('jogo') ? userGameToday() : null;
  const career = official && official.id === query.get('jogo') ? official : null;
  if (query.get('jogo') && !career) toast('Este jogo não está disponível para jogar agora. Abrindo um amistoso.', 'warn');
  if (career) Object.assign(setup, { mode: 'quick', home: career.home, away: career.away, control: career.home === getWorld().career.teamId ? 0 : 1, quarter: 12 });
  let cleanup = null;

  function stop() {
    cleanup?.();
    cleanup = null;
  }

  // ------------------------------------------------------------------ preparação
  function teamPick(key, label) {
    const team = uni.team(setup[key]);
    const roster = uni.rosterOf(team.id);
    for (const p of roster.slice(0, 10)) loadPlayerImage(p); // fotos prontas antes do salto inicial
    const index = key === 'home' ? 0 : 1;
    const mine = setup.mode === 'quick' && setup.control === index;
    return h(
      'div',
      { class: ['team-pick', mine && 'mine'], style: { '--c1': team.colors[0], '--c2': team.colors[1] }, dataset: { team: team.id } },
      h('span', { class: 'micro' }, label, mine ? ' · você comanda' : ''),
      teamLogo(team, { size: 'lg' }),
      h('select', { class: 'team-select', 'aria-label': label, disabled: Boolean(career), onchange: (e) => ((setup[key] = e.target.value), (setup.attacker = setup.defender = null), renderSetup()) }, teams.map((t) => h('option', { value: t.id, selected: t.id === team.id }, t.fullName))),
      h('div', { class: 'row', style: { justifyContent: 'center' } }, h('span', { tip: 'Força do núcleo: média ponderada dos 8 melhores disponíveis.' }, ovrBadge(strength(roster))), h('span', { class: 'muted small' }, `${roster.length} disponíveis`)),
      h('div', { class: 'team-pick-stars' }, roster.slice(0, 3).map((p) => h('div', { class: 'star' }, playerAvatar(p, { size: 'md', color: team.colors[0] }), h('small', null, p.lastName), ovrBadge(p.ovr)))),
      setup.mode === 'quick' && !career ? h('button', { type: 'button', class: ['btn small', mine ? 'primary' : ''], onclick: () => ((setup.control = index), renderSetup()) }, mine ? 'Seu time' : 'Comandar este time') : null,
    );
  }

  function sandboxOptions() {
    const sc = SCENARIOS.find((s) => s.id === setup.scenario);
    const playerSelect = (key, teamId) => {
      const roster = uni.rosterOf(teamId);
      setup[key] ??= roster[0].id;
      return h('select', { onchange: (e) => (setup[key] = Number(e.target.value)) }, roster.map((p) => h('option', { value: p.id, selected: setup[key] === p.id }, `${p.name} — ${p.positions[0]} · ${p.ovr}`)));
    };
    const range = (key, min, max, step, fmt) => {
      const out = h('strong', { class: 'num' }, fmt(setup[key]));
      return h('div', { class: 'row' }, h('input', { type: 'range', min, max, step, value: setup[key], class: 'grow', oninput: (e) => ((setup[key] = Number(e.target.value)), (out.textContent = fmt(setup[key]))) }), out);
    };
    const signed = (v) => (v > 0 ? `+${v}` : `${v}`);
    return card(
      'Situação',
      h(
        'div',
        { class: 'stack' },
        h(
          'div',
          { class: 'grid cols-4' },
          h('div', { class: 'field' }, h('span', { class: 'label' }, 'Cenário'), h('select', { onchange: (e) => ((setup.scenario = e.target.value), renderSetup()) }, SCENARIOS.map((s) => h('option', { value: s.id, selected: setup.scenario === s.id }, `${s.label} (${s.off}×${s.def})`)))),
          h('div', { class: 'field' }, h('span', { class: 'label' }, 'Atacante com a bola'), playerSelect('attacker', setup.home)),
          h('div', { class: 'field' }, h('span', { class: 'label' }, 'Defensor'), playerSelect('defender', setup.away)),
          h('div', { class: 'field' }, h('span', { class: 'label' }, 'Ação inicial'), h('select', { onchange: (e) => (setup.force = e.target.value) }, [['', 'Livre (a IA decide)'], ['drive', 'Infiltrar'], ['post', 'Jogar de costas'], ['shoot', 'Arremessar']].map(([v, l]) => h('option', { value: v, selected: setup.force === v }, l)))),
        ),
        h(
          'div',
          { class: 'grid cols-4' },
          h('div', { class: 'field' }, h('span', { class: 'label', tip: 'Como a defesa reage ao bloqueio. Só importa em cenários com pick and roll.' }, 'Cobertura do bloqueio'), h('select', { onchange: (e) => (setup.coverage = e.target.value) }, [['auto', 'Automática (pelo pivô)'], ...TACTIC_OPTIONS.coverage.options.map(([v, l]) => [v, l])].map(([v, l]) => h('option', { value: v, selected: setup.coverage === v }, l)))),
          h('div', { class: 'field' }, h('span', { class: 'label', tip: 'Distância inicial entre o marcador e o atacante com a bola.' }, 'Distância do marcador'), range('gap', 1.5, 9, 0.5, (v) => `${v.toLocaleString('pt-BR')} pés`)),
          h('div', { class: 'field' }, h('span', { class: 'label', tip: 'Soma este valor a todos os atributos do atacante, só nesta posse.' }, 'Atributos do atacante'), range('atkBoost', -20, 20, 5, signed)),
          h('div', { class: 'field' }, h('span', { class: 'label', tip: 'Soma este valor a todos os atributos do defensor, só nesta posse.' }, 'Atributos do defensor'), range('defBoost', -20, 20, 5, signed)),
        ),
        h('p', { class: 'faint small' }, sc.off > 1 || sc.def > 1 ? `Os companheiros (${sc.off - 1} no ataque, ${sc.def - 1} na defesa) são os melhores disponíveis de cada elenco${sc.id === 'pnr' ? ', com um pivô como bloqueador' : ''}.` : 'Um contra um: sem companheiros em quadra.'),
      ),
    );
  }

  function renderSetup() {
    stop();
    const game = setup.mode !== 'sandbox';
    const preset = activePreset('simulation');
    const presetLabel = preset === 'custom' ? 'personalizados' : `preset ${SLIDER_GROUP_BY_ID.simulation.presets.find((p) => p.id === preset).label}`;
    mount(
      root,
      career
        ? pageHeader('Jogo oficial', { sub: `Temporada regular · ${fmtDate(career.date, { weekday: true })}. O resultado vale para a campanha e as estatísticas. Se preferir, volte e deixe a simulação rápida resolver.`, actions: h('a', { class: 'btn ghost', href: '#/home' }, 'Voltar') })
        : pageHeader('Partida 2D', { sub: SUB[setup.mode], actions: segmented(MODES, setup.mode, (v) => ((setup.mode = v), renderSetup()), { label: 'Modo' }) }),
      h('div', { class: 'matchup' }, teamPick('home', game ? 'Mandante' : 'Ataque'), h('div', { class: 'vs' }, h('span', { class: 'display' }, 'VS'), game ? h('span', { class: 'muted small' }, uni.source === 'career' ? 'Elencos da sua carreira' : 'Elencos reais do banco de dados') : null), teamPick('away', game ? 'Visitante' : 'Defesa')),
      game
        ? card(
            'Regras da partida',
            h(
              'div',
              { class: 'row wrap', style: { gap: '12px 28px' } },
              career
                ? h('div', { class: 'field' }, h('span', { class: 'label' }, 'Duração do quarto'), h('strong', null, '12 minutos (jogo oficial)'))
                : h('div', { class: 'field' }, h('span', { class: 'label' }, 'Duração do quarto'), segmented([[12, '12 min'], [8, '8 min'], [5, '5 min'], [3, '3 min']], setup.quarter, (v) => ((setup.quarter = Number(v)), setSetting('matchQuarter', setup.quarter)), { label: 'Duração do quarto' })),
              h('div', { class: 'field' }, h('label', { for: 'match-seed', tip: 'A mesma semente reproduz exatamente a mesma partida — desde que as suas decisões de técnico também se repitam.' }, 'Semente'), h('div', { class: 'row' }, h('input', { id: 'match-seed', type: 'text', value: setup.seed, style: { width: '150px' }, oninput: (e) => (setup.seed = e.target.value) }), h('button', { class: 'btn ghost small', type: 'button', onclick: () => ((setup.seed = freshSeed()), renderSetup()) }, 'Nova'))),
              h('div', { class: 'field' }, h('span', { class: 'label' }, 'Sliders de simulação'), h('a', { class: 'btn ghost small', href: '#/settings?tab=simulacao', tip: 'Ritmo, volume de três, erros, faltas… Ajuste em Configurações → Simulação.' }, icon('settings'), `Usando ${presetLabel}`)),
            ),
          )
        : sandboxOptions(),
      h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '18px' } }, h('button', { class: 'btn primary large start', onclick: start }, icon('court'), setup.mode === 'quick' ? 'Jogar' : setup.mode === 'spectator' ? 'Assistir' : 'Iniciar posse')),
      !hasWorld() && game ? h('p', { class: 'faint small center', style: { marginTop: '10px' } }, 'Sem carreira aberta: a partida não é gravada. Dentro de uma carreira, os amistosos ficam no histórico.') : null,
    );
  }

  function start() {
    if (setup.home === setup.away) return toast('Escolha duas franquias diferentes.', 'warn');
    const control = setup.mode === 'quick' ? setup.control : null;
    const info = (id, i) => {
      const t = uni.team(id);
      return { id, name: t.name, fullName: t.fullName, colors: t.colors, roster: uni.rosterOf(id), rotation: t.rotation, team: t, aiCoach: control !== i };
    };
    const a = info(setup.home, 0);
    const b = info(setup.away, 1);
    if (setup.mode !== 'sandbox' && [a, b].some((t) => t.roster.length < 5)) return toast('Partida impossível: uma das equipes tem menos de cinco atletas aptos.', 'warn');
    let sim;
    if (setup.mode !== 'sandbox') {
      sim = new MatchSim([a, b], { seed: setup.seed, quarterSeconds: setup.quarter * 60, recordReplay: true, sliders: simSliders() });
    } else {
      const sc = SCENARIOS.find((s) => s.id === setup.scenario);
      const pickN = (roster, firstId, n, boost) => {
        const first = roster.find((p) => p.id === firstId) ?? roster[0];
        // completa com bons arremessadores/pivôs do mesmo time, sem repetir
        const rest = roster.filter((p) => p !== first);
        const bigs = rest.filter((p) => ['C', 'PF'].includes(p.positions[0]));
        const order = sc.id === 'pnr' ? [...bigs, ...rest.filter((p) => !bigs.includes(p))] : rest;
        return [tweak(first, boost), ...order].slice(0, n);
      };
      sim = createSandbox({ offense: pickN(a.roster, setup.attacker, sc.off, setup.atkBoost), defense: pickN(b.roster, setup.defender, sc.def, setup.defBoost), scenario: sc.id, seed: setup.seed, force: setup.force || null, gap: setup.gap, coverage: setup.coverage, sliders: simSliders() });
      sim.teams[0] = { ...sim.teams[0], name: a.name, colors: a.colors, team: a.team };
      sim.teams[1] = { ...sim.teams[1], name: b.name, colors: b.colors, team: b.team };
    }
    stop();
    cleanup = renderLive(root, sim, [a, b], {
      control, mode: career ? 'official' : setup.mode, competition: career?.type, onRestart: start,
      onNew: career ? () => navigate('/home') : () => ((setup.seed = freshSeed()), renderSetup()),
      // jogo oficial: o registro do motor 2D entra na temporada (campanha, estatísticas, box score)
      onFinish: career ? async (record) => (applyResult(career, { ...record, type: career.type }), await saveWorld()) : null,
    });
  }

  renderSetup();
  return root;
}

/** Rotas /play/quick, /play/spectator e /play/sandbox (funcionam sem carreira aberta). */
export const playView = ({ mode }) => matchView({ mode });
