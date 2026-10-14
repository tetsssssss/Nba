// Assistente de nova carreira: modo → identidade → franquia → experiência → confirmação.
import { CAREER_MODES, MODE_BY_ID, STATUS_LABEL } from '../../core/modes.js';
import { SLIDER_GROUP_BY_ID, activePreset, applyPreset } from '../../core/sliders.js';
import { h, icon, mount } from '../dom.js';
import { CONFERENCE_LABEL, record } from '../format.js';
import { navigate, parseHash } from '../router.js';
import { toast } from '../components/feedback.js';
import { chip } from '../components/widgets.js';
import { teamLogo } from '../../media/photos.js';
import { DIFFICULTIES, DIFFICULTY_BY_ID, DIFFICULTY_SYSTEMS, ROLES, ROLE_BY_ID, TOGGLEABLE_SYSTEMS, defaultCareerOptions } from '../../core/career-options.js';
import { buildTeams, loadSeed } from '../../core/universe.js';
import { createCareer } from '../../core/saves.js';

const STEPS = ['Modo', 'Você', 'Franquia', 'Experiência', 'Confirmar'];

export async function newCareerView() {
  const seed = await loadSeed();
  const teams = buildTeams(seed);
  const rosterSize = new Map();
  for (const p of seed.players) rosterSize.set(p.teamId, (rosterSize.get(p.teamId) ?? 0) + 1);
  const options = defaultCareerOptions();
  // a tela inicial pode chegar com o modo já escolhido (#/new?modo=commissioner)
  const asked = parseHash().query.get('modo');
  options.mode = CAREER_MODES.some((m) => m.id === asked) ? asked : 'universe';
  const applyMode = () => {
    const rules = MODE_BY_ID[options.mode].career;
    if (!rules.roles.includes(options.role)) options.role = rules.defaultRole;
    options.godMode = rules.godMode;
  };
  applyMode();
  let step = asked && options.mode === asked ? 1 : 0;
  const body = h('div', null);
  const root = h('div', { class: 'landing' }, h('div', { class: 'landing-inner' }, body));

  const optionCard = (selected, title, text, onclick, extra = null) => h('button', { type: 'button', class: ['option-card', selected && 'selected'], onclick }, h('strong', null, title, extra), h('span', null, text));

  const validators = [
    () => null,
    () => (options.managerName.trim().length >= 2 ? null : 'Informe o seu nome (mínimo de 2 letras).'),
    () => (options.teamId ? null : 'Escolha uma franquia.'),
    () => (options.careerLength >= 1 && options.careerLength <= 30 ? null : 'A duração da carreira deve ficar entre 1 e 30 temporadas.'),
    () => null,
  ];

  function stepMode() {
    return h(
      'div',
      { class: 'stack' },
      h('p', { class: 'muted' }, 'O modo define o que fica sob o seu comando. Todos usam o mesmo universo, os mesmos jogadores reais e o mesmo motor de partida.'),
      h(
        'div',
        { class: 'grid cols-2' },
        CAREER_MODES.map((m) =>
          h(
            'button',
            { type: 'button', class: ['mode-card', options.mode === m.id && 'selected'], 'aria-pressed': String(options.mode === m.id), onclick: () => ((options.mode = m.id), applyMode(), render()) },
            h('span', { class: 'mode-icon' }, icon(m.icon)),
            h('span', { class: 'grow' }, h('span', { class: 'micro' }, m.tagline), h('strong', null, m.label), h('span', { class: 'mode-text' }, m.description)),
            h('span', { class: ['chip', m.status === 'functional' ? 'good' : 'warn'], tip: m.missing }, STATUS_LABEL[m.status]),
          ),
        ),
      ),
      h('p', { class: 'faint small' }, 'Para uma partida avulsa, sem carreira, use Jogo rápido, Espectador ou Sandbox na tela inicial.'),
    );
  }

  function stepIdentity() {
    return h(
      'div',
      { class: 'stack' },
      h(
        'div',
        { class: 'grid cols-2' },
        h('div', { class: 'field' }, h('label', { for: 'nc-name' }, 'Seu nome'), h('input', { id: 'nc-name', type: 'text', maxLength: 40, value: options.managerName, placeholder: 'Como você será chamado na liga', oninput: (e) => (options.managerName = e.target.value) })),
        h('div', { class: 'field' }, h('label', { for: 'nc-save' }, 'Nome do save (opcional)'), h('input', { id: 'nc-save', type: 'text', maxLength: 50, value: options.saveName, placeholder: 'Ex.: Reconstrução em Seattle', oninput: (e) => (options.saveName = e.target.value) })),
      ),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Cargo inicial'), h('span', { class: 'hint' }, MODE_BY_ID[options.mode].career.roles.length > 1 ? 'Você poderá assumir outros cargos durante a carreira.' : `No modo ${MODE_BY_ID[options.mode].label} o cargo é fixo.`)),
      h(
        'div',
        { class: 'grid cols-3' },
        ROLES.filter((r) => MODE_BY_ID[options.mode].career.roles.includes(r.id)).map((r) =>
          optionCard(options.role === r.id, r.label, r.description, () => {
            options.role = r.id;
            render();
          }),
        ),
      ),
    );
  }

  function stepTeam() {
    const selected = teams.find((t) => t.id === options.teamId);
    const column = (conference) =>
      h(
        'div',
        { class: 'stack' },
        h('h2', null, `Conferência ${CONFERENCE_LABEL[conference]}`),
        Object.entries(seed.franchises.alignment[conference]).map(([division, ids]) =>
          h(
            'div',
            null,
            h('h3', { style: { marginBottom: '8px' } }, division),
            h(
              'div',
              { class: 'stack', style: { gap: '6px' } },
              ids.map((id) => {
                const t = teams.find((x) => x.id === id);
                return h(
                  'div',
                  { class: ['team-tile', options.teamId === id && 'selected'], style: { '--c1': t.colors[0] }, onclick: () => ((options.teamId = id), render()) },
                  teamLogo(t, { size: 'sm' }),
                  h('span', { class: 'grow' }, h('span', { class: 'name' }, t.fullName), h('small', null, t.expansion ? 'Expansão · elenco a montar' : `${record(t.lastSeason)} em 2025-26 · ${t.lastSeason.playoffs}`)),
                  t.expansion ? chip('Expansão', 'info') : null,
                );
              }),
            ),
          ),
        ),
      );
    return h(
      'div',
      { class: 'stack' },
      selected
        ? h(
            'div',
            { class: 'hero-card', style: { '--c1': selected.colors[0], '--c2': selected.colors[1], marginBottom: 0 } },
            teamLogo(selected, { size: 'lg' }),
            h(
              'div',
              null,
              h('div', { class: 'title' }, selected.fullName),
              h('div', { class: 'subtitle' }, `Conferência ${CONFERENCE_LABEL[selected.conference]} · Divisão ${selected.division}`, h('span', null, `Mercado ${selected.market}/100`), h('span', null, `${selected.championships.length} título(s)`), h('span', null, `${rosterSize.get(selected.id) ?? 0} jogadores`)),
              h('p', { class: 'muted', style: { marginTop: '8px', maxWidth: '760px' } }, selected.identity?.summary ?? selected.fans.note),
            ),
          )
        : h('div', { class: 'note' }, 'Escolha qualquer uma das 32 franquias. Seattle e Las Vegas começam sem elenco e montam o time no Expansion Draft.'),
      h('div', { class: 'grid cols-2' }, column('East'), column('West')),
    );
  }

  function stepRules() {
    const custom = options.difficulty === 'custom';
    return h(
      'div',
      { class: 'stack' },
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Dificuldade da gestão'), h('span', { class: 'hint' }, 'Preferências de regras de gestão para sistemas futuros; ainda não alteram negociações, scouting e lesões.')),
      h(
        'div',
        { class: 'grid cols-3' },
        DIFFICULTIES.map((d) =>
          optionCard(options.difficulty === d.id, d.label, d.description, () => {
            options.difficulty = d.id;
            if (d.id !== 'custom') options.modifiers = { ...d.modifiers };
            render();
          }),
        ),
      ),
      custom
        ? h(
            'div',
            { class: 'card' },
            h('div', { class: 'card-head' }, h('h3', null, 'Ajuste por sistema'), h('span', { class: 'muted small' }, 'Preferências guardadas para funcionalidades futuras; ainda sem efeito esportivo')),
            h(
              'div',
              { class: 'grid cols-2' },
              DIFFICULTY_SYSTEMS.map((s) => {
                const out = h('strong', { class: 'num' }, `${Math.round(options.modifiers[s.key] * 100)}%`);
                return h('div', { class: 'field' }, h('label', { tip: s.tip }, s.label, ' ', out), h('input', { type: 'range', min: 0.5, max: 1.5, step: 0.05, value: options.modifiers[s.key], oninput: (e) => ((options.modifiers[s.key] = Number(e.target.value)), (out.textContent = `${Math.round(options.modifiers[s.key] * 100)}%`)) }));
              }),
            ),
            h('h3', { style: { margin: '18px 0 10px' } }, 'Sistemas ativos'),
            h('div', { class: 'grid cols-2' }, TOGGLEABLE_SYSTEMS.map((s) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: options.systems[s.key], onchange: (e) => (options.systems[s.key] = e.target.checked) }), s.label))),
          )
        : null,
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Estilo das partidas'), h('span', { class: 'hint' }, 'Preset dos sliders de simulação do motor 2D. Vale para todas as partidas e pode ser refinado em Configurações → Simulação.')),
      h('div', { class: 'grid cols-3' }, SLIDER_GROUP_BY_ID.simulation.presets.map((pr) => optionCard(activePreset('simulation') === pr.id, pr.label, pr.description, () => (applyPreset('simulation', pr.id), render()))), activePreset('simulation') === 'custom' ? optionCard(true, 'Personalizado', 'Você já ajustou os sliders manualmente; eles serão mantidos.', () => {}) : null),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Salary cap'), h('span', { class: 'hint' }, 'Define a profundidade das regras financeiras. Todas as regras complexas terão explicações na interface.')),
      h('div', { class: 'grid cols-4' }, seed.league.capModes.map((m) => optionCard(options.capMode === m.id, m.label, m.description, () => ((options.capMode = m.id), render())))),
      h(
        'div',
        { class: 'card' },
        h('div', { class: 'card-head' }, h('h3', null, 'Avançado')),
        h(
          'div',
          { class: 'grid cols-3' },
          h('div', { class: 'field' }, h('label', { for: 'nc-len' }, 'Duração da carreira (temporadas)'), h('input', { id: 'nc-len', type: 'number', min: 1, max: 30, value: options.careerLength, oninput: (e) => (options.careerLength = Number(e.target.value)) }), h('span', { class: 'hint' }, 'Padrão: 10 temporadas.')),
          h('div', { class: 'field' }, h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: options.godMode, disabled: options.mode !== 'universe', onchange: (e) => (options.godMode = e.target.checked) }), 'God Mode / Commissioner'), h('span', { class: 'hint' }, 'Libera edição livre do universo (jogadores, contratos, times). Fica claramente separado do modo normal e pode ser alterado depois.')),
          h('div', { class: 'field' }, h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: options.autoApproveAiTrades, onchange: (e) => (options.autoApproveAiTrades = e.target.checked) }), 'Aprovar automaticamente trades da IA'), h('span', { class: 'hint' }, 'Desligado, o comissário aprova ou rejeita cada troca entre franquias da IA (Fase 2).')),
        ),
      ),
    );
  }

  function stepConfirm() {
    const team = teams.find((t) => t.id === options.teamId);
    const diff = DIFFICULTY_BY_ID[options.difficulty];
    const cap = seed.league.capModes.find((m) => m.id === options.capMode);
    return h(
      'div',
      { class: 'stack' },
      h(
        'div',
        { class: 'hero-card', style: { '--c1': team.colors[0], '--c2': team.colors[1], marginBottom: 0 } },
        teamLogo(team, { size: 'lg' }),
        h('div', null, h('div', { class: 'title' }, team.fullName), h('div', { class: 'subtitle' }, `${options.managerName.trim()} · ${ROLE_BY_ID[options.role].label}`)),
      ),
      h(
        'div',
        { class: 'card' },
        h(
          'dl',
          { class: 'facts' },
          h('dt', null, 'Início'), h('dd', null, `Pré-temporada ${seed.league.startSeasonLabel}, com os elencos reais de ${seed.league.snapshotDate.split('-').reverse().join('/')}`),
          h('dt', null, 'Modo'), h('dd', null, MODE_BY_ID[options.mode].label, ' ', h('span', { class: 'muted' }, `— ${MODE_BY_ID[options.mode].tagline.toLowerCase()}`)),
          h('dt', null, 'Dificuldade'), h('dd', null, diff.label),
          h('dt', null, 'Estilo das partidas'), h('dd', null, activePreset('simulation') === 'custom' ? 'Sliders personalizados' : SLIDER_GROUP_BY_ID.simulation.presets.find((x) => x.id === activePreset('simulation')).label),
          h('dt', null, 'Salary cap'), h('dd', null, `${cap.label} — ${cap.description}`),
          h('dt', null, 'Duração'), h('dd', null, `${options.careerLength} temporadas`),
          h('dt', null, 'God Mode'), h('dd', null, options.godMode ? 'Ativado' : 'Desativado'),
          h('dt', null, 'Universo'), h('dd', null, `${seed.meta.counts.players} jogadores reais, 32 franquias (Seattle e Las Vegas no Oeste, New Orleans no Leste)`),
        ),
      ),
      team.expansion ? h('div', { class: 'note warn' }, 'Franquia de expansão: o elenco é montado no Expansion Draft automático na abertura da temporada; você pode configurar preferências antes do evento.') : null,
    );
  }

  const renderers = [stepMode, stepIdentity, stepTeam, stepRules, stepConfirm];

  function goto(next) {
    if (next > step) {
      const problem = validators[step]();
      if (problem) return toast(problem, 'warn');
    }
    step = next;
    render();
    root.scrollTop = 0;
  }

  async function create(button) {
    button.disabled = true;
    button.textContent = 'Criando universo…';
    try {
      await createCareer(options);
      navigate('/home');
    } catch (err) {
      console.error(err);
      toast(`Não foi possível criar a carreira: ${err.message}`, 'error');
      button.disabled = false;
      button.textContent = 'Criar carreira';
    }
  }

  function render() {
    mount(body, 
      h('div', { class: 'row between', style: { marginBottom: '14px' } }, h('div', null, h('h1', null, 'Nova carreira'), h('p', { class: 'muted', style: { marginTop: '4px' } }, `Passo ${step + 1} de ${STEPS.length} — ${STEPS[step]}`)), h('a', { class: 'btn ghost', href: '#/start' }, 'Cancelar')),
      h('div', { class: 'steps' }, STEPS.map((_, i) => h('div', { class: ['step', i <= step && 'done'] }))),
      renderers[step](),
      h(
        'div',
        { class: 'row between', style: { marginTop: '24px' } },
        h('button', { class: 'btn large', disabled: step === 0, onclick: () => goto(step - 1) }, 'Voltar'),
        step < STEPS.length - 1 ? h('button', { class: 'btn primary large', onclick: () => goto(step + 1) }, 'Continuar') : h('button', { class: 'btn primary large', onclick: (e) => create(e.currentTarget) }, 'Criar carreira'),
      ),
    );
  }

  render();
  return root;
}
