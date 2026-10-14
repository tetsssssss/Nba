// Configurações em abas: Geral · Interface · Partida 2D · Simulação · Dificuldade · Save · Acessibilidade · Carreira.
// Preferências do aplicativo ficam neste navegador; dificuldade e carreira ficam no save aberto.
import { h, mount } from '../dom.js';
import { parseHash, setQuery } from '../router.js';
import { card, chip, emptyState, pageHeader, segmented } from '../components/widgets.js';
import { confirmDialog, tabView, toast } from '../components/feedback.js';
import { applyUiPreferences, getSettings, resetSettings, setSetting } from '../../core/settings.js';
import { SLIDER_GROUP_BY_ID, activePreset, applyPreset, resetSliders, setSlider, sliderValues } from '../../core/sliders.js';
import { getWorld, hasWorld, markDirty, saveWorld } from '../../core/world.js';
import { closeCareer, duplicateCareer } from '../../core/saves.js';
import { DIFFICULTIES, DIFFICULTY_BY_ID, DIFFICULTY_SYSTEMS, ROLES, TOGGLEABLE_SYSTEMS } from '../../core/career-options.js';
import { MODE_BY_ID, careerRules } from '../../core/modes.js';
import { CAMERAS } from '../../match/renderer.js';
import { gameSound } from '../../audio/soundscape.js';
import { emit } from '../../core/events.js';

/** Linha de slider: rótulo com dica, controle, valor e marca do padrão. */
function sliderRow(def, value, onInput) {
  const out = h('output', { class: ['slider-value num', value !== def.default && 'changed'] }, `${value}${def.unit}`);
  const input = h('input', {
    type: 'range', min: def.min, max: def.max, step: def.step, value, 'aria-label': def.label,
    style: { '--mark': `${((def.default - def.min) / (def.max - def.min)) * 100}%` },
    oninput: (e) => {
      const v = Number(e.target.value);
      out.textContent = `${v}${def.unit}`;
      out.classList.toggle('changed', v !== def.default);
      onInput(v);
    },
  });
  return h('div', { class: 'slider-row' }, h('span', { class: 'slider-label', tip: def.tip }, def.label), input, out);
}

const check = (label, key, settings, { apply = false, tip = null, after = null } = {}) =>
  h('label', { class: 'check', tip }, h('input', { type: 'checkbox', checked: settings[key], onchange: (e) => (setSetting(key, e.target.checked), apply && applyUiPreferences(), after?.(e.target.checked)) }), label);

const select = (id, options, value, onChange) => h('select', { id, style: { maxWidth: '280px' }, onchange: (e) => onChange(e.target.value) }, options.map(([v, l]) => h('option', { value: v, selected: String(value) === String(v) }, l)));

export function settingsView() {
  const root = h('div', { class: 'page narrow' });
  const setUi = (key, value) => {
    setSetting(key, value);
    applyUiPreferences();
    if (hasWorld()) emit('career:changed'); // o shell relê a cor da franquia
  };

  /** Grupo de sliders do aplicativo (core/sliders.js), com presets e "restaurar padrão". */
  function sliderGroup(groupId, { apply = false } = {}) {
    const group = SLIDER_GROUP_BY_ID[groupId];
    const host = h('div', { class: 'stack' });
    const draw = () => {
      const values = sliderValues(groupId);
      const preset = activePreset(groupId, values);
      mount(
        host,
        h('p', { class: 'muted' }, group.description),
        group.presets.length
          ? h(
              'div',
              { class: 'preset-row' },
              group.presets.map((p) => h('button', { type: 'button', class: ['option-card', preset === p.id && 'selected'], onclick: () => (applyPreset(groupId, p.id), apply && applyUiPreferences(), toast(`Preset aplicado: ${p.label}.`), draw()) }, h('strong', null, p.label), h('span', null, p.description))),
              h('div', { class: ['option-card static', preset === 'custom' && 'selected'] }, h('strong', null, 'Personalizado'), h('span', null, preset === 'custom' ? 'Valores ajustados por você.' : 'Mova qualquer slider para personalizar.')),
            )
          : null,
        h('div', { class: 'slider-list' }, group.sliders.map((def) => sliderRow(def, values[def.key], (v) => (setSlider(groupId, def.key, v), apply && applyUiPreferences(), group.presets.length && preset !== activePreset(groupId) && draw())))),
        h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => (resetSliders(groupId), apply && applyUiPreferences(), toast('Padrão restaurado.'), draw()) }, 'Restaurar padrão')),
      );
    };
    draw();
    return host;
  }

  const tabs = [
    {
      id: 'geral', label: 'Geral',
      render: () => {
        const s = getSettings();
        return card(
          'Geral',
          h(
            'div',
            { class: 'stack' },
            h('div', { class: 'field' }, h('label', { for: 'set-units' }, 'Unidades'), select('set-units', [['metric', 'Métrico (m, kg)'], ['imperial', 'Imperial (pés, lb)']], s.units, (v) => (setSetting('units', v), toast('Unidades atualizadas.')))),
            h('div', { class: 'field' }, h('label', { for: 'set-page' }, 'Jogadores por página'), select('set-page', [25, 50, 100].map((n) => [n, n]), s.playersPageSize, (v) => setSetting('playersPageSize', Number(v)))),
            h('div', { class: 'field' }, h('span', { class: 'label' }, 'Velocidade padrão da partida'), segmented([[0.75, '0,75x'], [0.8, '0,80x'], [0.9, '0,90x'], [1, '1x'], [2, '2x'], [4, '4x'], [8, '8x']], s.matchSpeed, (v) => setSetting('matchSpeed', Number(v)), { label: 'Velocidade padrão' })),
            h('div', { class: 'field' }, h('span', { class: 'label' }, 'Duração do quarto no jogo rápido'), segmented([[12, '12 min'], [8, '8 min'], [5, '5 min'], [3, '3 min']], s.matchQuarter, (v) => setSetting('matchQuarter', Number(v)), { label: 'Duração do quarto' })),
            h('div', { class: 'row' }, h('button', { class: 'btn danger', type: 'button', onclick: async () => {
              if (!(await confirmDialog({ title: 'Restaurar todas as preferências?', message: 'Interface, partida 2D, sliders e atalhos voltam ao padrão. Suas carreiras não são afetadas.', confirmLabel: 'Restaurar', danger: true }))) return;
              const last = getSettings().lastSaveId;
              resetSettings();
              setSetting('lastSaveId', last);
              applyUiPreferences();
              toast('Preferências restauradas.');
              render();
            } }, 'Restaurar todas as preferências')),
          ),
        );
      },
    },
    {
      id: 'interface', label: 'Interface',
      render: () => {
        const s = getSettings();
        return h(
          'div',
          { class: 'stack' },
          card(
            'Aparência',
            h(
              'div',
              { class: 'stack' },
              h('div', { class: 'field' }, h('span', { class: 'label' }, 'Densidade das tabelas e cartões'), segmented([['compact', 'Compacto', 'Mais linhas por tela — para quem já domina o jogo.'], ['normal', 'Normal'], ['comfortable', 'Confortável', 'Mais respiro entre as linhas.']], s.density, (v) => setUi('density', v), { label: 'Densidade' })),
              h('div', { class: 'field' }, h('span', { class: 'label' }, 'Tamanho do texto'), segmented([['normal', 'Normal'], ['large', 'Grande']], s.fontSize, (v) => setUi('fontSize', v), { label: 'Tamanho do texto' })),
              check('Cor da franquia nos destaques (desligado: usa a cor do jogo)', 'teamAccent', s, { after: () => setUi('teamAccent', getSettings().teamAccent) }),
              check('Animações e transições', 'animations', s, { apply: true }),
              check('Menu lateral recolhido (atalho: tecla [ )', 'sidebarCollapsed', s, { after: () => hasWorld() && emit('career:changed') }),
            ),
          ),
          card('Escala', sliderGroup('visual', { apply: true })),
        );
      },
    },
    {
      id: 'partida', label: 'Partida 2D/3D',
      render: () => {
        const s = getSettings();
        return h(
          'div',
          { class: 'stack' },
          card('Motor gráfico', h('div', { class: 'stack' },
            h('div', { class: 'field' }, h('label', { for: 'set-graphics' }, 'Visual inicial da partida'), select('set-graphics', [['2d', '2D Premium'], ['arcade', '2.5D Arcade (Carreira)'], ['3d', '3D Broadcast (WebGL2)'], ['babylon', 'Babylon 3D (biblioteca local)']], s.matchGraphics, (v) => setSetting('matchGraphics', v))),
            h('div', { class: 'field' }, h('label', { for: 'set-quality' }, 'Qualidade gráfica'), select('set-quality', [['low', 'Baixa'], ['medium', 'Média'], ['high', 'Alta']], s.graphicsQuality, (v) => setSetting('graphicsQuality', v))),
            h('p', { class: 'muted small' }, 'A partida mantém um único motor esportivo. O 2.5D Arcade usa sprites estilizados e Canvas; você pode trocar o visual e a câmera durante o jogo. Se WebGL2 falhar, o 2D assume automaticamente.'),
          )),
          card(
            'Câmera e avisos',
            h(
              'div',
              { class: 'stack' },
              h('div', { class: 'field' }, h('label', { for: 'set-cam' }, 'Câmera padrão'), select('set-cam', CAMERAS.map((c) => [c.id, c.label]), s.matchCamera, (v) => setSetting('matchCamera', v))),
              check('Zoom automático (fecha em meia quadra, abre na transição)', 'matchAutoZoom', s),
              check('Avisos de lance sobre a quadra (ROUBO, TOCO, TROCA…)', 'matchPopups', s),
              check('Rastro da bola em passes e arremessos', 'matchTrail', s),
              check('Nome sob cada jogador', 'matchNames', s),
              check('Arco de energia em volta do marcador', 'matchStamina', s),
              check('Destaques da partida (sequências, double-double, faltas)', 'matchNotes', s),
            ),
          ),
          card('Tamanhos e câmera', sliderGroup('match2d', { apply: true })),
          card('Sonoplastia',
            h('div', { class: 'stack' },
              check('Ativar efeitos durante as partidas (clique em Ativar som na quadra na primeira vez)', 'audioEnabled', s),
              ...[['audioMaster', 'Volume geral'], ['audioCourt', 'Quadra e árbitro'], ['audioArena', 'Torcida e arena']].map(([key, label]) =>
                h('label', { class: 'audio-slider' },
                  h('span', null, label),
                  h('input', { type: 'range', min: 0, max: 100, step: 5, value: Math.round(100 * (s[key] ?? 0.5)),
                    'aria-label': label, oninput: (e) => { setSetting(key, Number(e.target.value) / 100); } }),
                )
              ),
              h('div', { class: 'row wrap' },
                ...[['bounce','Bola'], ['rim','Aro'], ['swish','Cesta'], ['whistle','Apito'], ['buzzer','Buzina'], ['crowd','Torcida']].map(([kind,label]) =>
                  h('button', { type: 'button', class: 'btn small', onclick: async () => {
                    const ok = await gameSound.unlock();
                    if (!ok) { toast('Ative o áudio ou verifique as permissões do navegador.', 'warn'); return; }
                    gameSound.setActive(true);
                    gameSound.play(kind);
                  } }, `Ouvir: ${label}`)
                )
              ),
              h('p', { class: 'muted small' }, 'Efeitos sintetizados pelo navegador, sem downloads de MP3. Áudio começa após interação do usuário; pode ficar indisponível em alguns navegadores.'),
            )),
        );
      },
    },
    { id: 'simulacao', label: 'Simulação', render: () => card('Sliders de simulação', sliderGroup('simulation')) },
    { id: 'dificuldade', label: 'Dificuldade', render: difficultyTab },
    {
      id: 'save', label: 'Save',
      render: () => {
        const s = getSettings();
        return h(
          'div',
          { class: 'stack' },
          card(
            'Gravação',
            h(
              'div',
              { class: 'stack' },
              check('Autosave (grava alguns segundos depois de cada alteração)', 'autosave', s, { after: (on) => toast(on ? 'Autosave ligado.' : 'Autosave desligado — use Salvar (tecla S).') }),
              check('Avisar a cada gravação automática', 'saveToasts', s, { tip: 'O indicador "Salvando… / Salvo" da barra superior aparece sempre; este aviso é adicional.' }),
              check('Pontos de restauração antes de eventos importantes', 'checkpoints', s, { tip: 'Início de temporada, trade deadline, playoffs, Draft e free agency. Esses eventos ainda não existem: por enquanto, crie pontos de restauração manualmente.' }),
            ),
          ),
          card(
            'Backups',
            hasWorld()
              ? h(
                  'div',
                  { class: 'row wrap' },
                  h('button', { class: 'btn', type: 'button', onclick: async () => (await saveWorld(), toast('Carreira salva.')) }, 'Salvar agora'),
                  h('button', { class: 'btn', type: 'button', onclick: async () => (await duplicateCareer(getWorld().saveId, { kind: 'manual' }), toast('Cópia criada em um novo slot.')) }, 'Salvar cópia em novo slot'),
                  h('button', { class: 'btn', type: 'button', onclick: async () => (await duplicateCareer(getWorld().saveId, { kind: 'checkpoint' }), toast('Ponto de restauração criado.')) }, 'Criar ponto de restauração'),
                  h('a', { class: 'btn ghost', href: '#/saves' }, 'Gerenciar saves e exportar backup →'),
                )
              : h('a', { class: 'btn', href: '#/saves' }, 'Gerenciar saves, importar e exportar backup'),
          ),
          h('p', { class: 'faint small' }, 'Salvar uma partida em andamento ainda não é possível: partidas são gravadas quando terminam. Veja docs/MEGA-EVOLUCAO.md para o que falta.'),
        );
      },
    },
    {
      id: 'acessibilidade', label: 'Acessibilidade',
      render: () => {
        const s = getSettings();
        return card(
          'Acessibilidade',
          h(
            'div',
            { class: 'stack' },
            check('Reduzir movimento (desliga animações da interface)', 'reduceMotion', s, { apply: true }),
            check('Alto contraste (textos secundários e bordas mais fortes)', 'highContrast', s, { apply: true }),
            h('div', { class: 'field' }, h('span', { class: 'label' }, 'Tamanho do texto'), segmented([['normal', 'Normal'], ['large', 'Grande']], s.fontSize, (v) => setUi('fontSize', v), { label: 'Tamanho do texto' })),
            h('p', { class: 'muted small' }, 'Todo o jogo pode ser usado pelo teclado: Tab percorre os controles, Ctrl+K abre a busca e ? lista os atalhos. Faixas de avaliação e status nunca dependem só de cor.'),
          ),
        );
      },
    },
    { id: 'carreira', label: 'Carreira', render: careerTab },
  ];

  function difficultyTab() {
    if (!hasWorld()) return card(null, emptyState('Sem carreira aberta', 'A dificuldade pertence a cada carreira. Abra ou crie uma para ajustar; ao criar, você escolhe o preset no passo "Experiência".', h('a', { class: 'btn', href: '#/start' }, 'Voltar ao menu inicial')));
    const { career } = getWorld();
    const host = h('div', { class: 'stack' });
    const commit = () => {
      markDirty('meta', 'career');
      emit('career:changed');
    };
    const draw = () => {
      const active = DIFFICULTIES.find((d) => d.id !== 'custom' && DIFFICULTY_SYSTEMS.every((s) => Math.abs(d.modifiers[s.key] - career.modifiers[s.key]) < 0.001))?.id ?? 'custom';
      if (career.difficulty !== active) {
        career.difficulty = active;
        commit();
      }
      mount(
        host,
        h('p', { class: 'muted' }, 'Multiplicadores da gestão. 100% é o equilíbrio; acima disso o jogo fica mais duro com você. Cada um passa a valer quando o sistema correspondente existir — nenhum afeta a partida 2D (veja a aba Simulação).'),
        h('div', { class: 'preset-row' }, DIFFICULTIES.filter((d) => d.id !== 'custom').map((d) => h('button', { type: 'button', class: ['option-card', active === d.id && 'selected'], onclick: () => ((career.modifiers = { ...d.modifiers }), commit(), toast(`Dificuldade: ${d.label}.`), draw()) }, h('strong', null, d.label), h('span', null, d.description))), h('div', { class: ['option-card static', active === 'custom' && 'selected'] }, h('strong', null, 'Customizado'), h('span', null, 'Cada sistema com o seu valor.'))),
        h('div', { class: 'slider-list' }, DIFFICULTY_SYSTEMS.map((s) => sliderRow({ key: s.key, label: s.label, tip: s.tip, min: 50, max: 150, step: 5, default: 100, unit: '%' }, Math.round(career.modifiers[s.key] * 100), (v) => ((career.modifiers[s.key] = v / 100), commit(), active !== 'custom' && draw())))),
        h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => ((career.modifiers = { ...DIFFICULTY_BY_ID.normal.modifiers }), commit(), toast('Dificuldade restaurada para Normal.'), draw()) }, 'Restaurar padrão')),
        h('h3', { style: { marginTop: '8px' } }, 'Sistemas ativos'),
        h('div', { class: 'row wrap' }, TOGGLEABLE_SYSTEMS.map((s) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: career.systems[s.key], onchange: (e) => ((career.systems[s.key] = e.target.checked), commit()) }), s.label))),
      );
    };
    draw();
    return card('Dificuldade da carreira', host);
  }

  function careerTab() {
    if (!hasWorld()) return card(null, emptyState('Sem carreira aberta', 'Cargo, duração e God Mode pertencem a cada carreira.', h('a', { class: 'btn', href: '#/start' }, 'Voltar ao menu inicial')));
    const world = getWorld();
    const { career, league } = world;
    const rules = careerRules(career);
    const mode = MODE_BY_ID[career.mode ?? 'universe'];
    const capMode = league.capModes.find((m) => m.id === career.capMode);
    const updateCareer = (patch, message) => {
      Object.assign(career, patch);
      markDirty('meta', 'career');
      emit('career:changed');
      if (message) toast(message);
      render('carreira');
    };
    return h(
      'div',
      { class: 'stack' },
      card(
        'Carreira',
        h(
          'div',
          { class: 'stack' },
          h(
            'dl',
            { class: 'facts' },
            h('dt', null, 'Modo'), h('dd', null, mode.label, ' ', h('span', { class: 'muted' }, `— ${mode.description}`)),
            h('dt', null, 'Salary cap'), h('dd', null, `${capMode.label} — ${capMode.description}`),
            h('dt', null, 'Duração'), h('dd', null, `${career.careerLength} temporadas (começou em ${career.startedOn.split('-').reverse().join('/')})`),
            h('dt', null, 'Picks futuras em trades'), h('dd', null, `até ${league.trade.futurePickYearsAhead} ano(s) à frente`),
          ),
          h('div', { class: 'field' }, h('label', { for: 'set-role' }, 'Seu cargo'), select('set-role', ROLES.filter((r) => rules.roles.includes(r.id)).map((r) => [r.id, r.label]), career.role, (v) => updateCareer({ role: v }, 'Cargo alterado.')), h('span', { class: 'hint' }, rules.roles.length > 1 ? 'Você pode assumir outro cargo a qualquer momento.' : `No modo ${mode.label} o cargo é fixo.`)),
          h('div', { class: 'field' }, h('label', { for: 'set-len' }, 'Limite de temporadas'), h('input', { id: 'set-len', type: 'number', min: 1, max: 30, value: career.careerLength, style: { maxWidth: '120px' }, onchange: (e) => updateCareer({ careerLength: Math.max(1, Math.min(30, Number(e.target.value) || 10)) }, 'Duração da carreira atualizada.') })),
        ),
      ),
      card(
        h('span', null, 'God Mode / Commissioner ', career.godMode ? chip('Ativo', 'warn') : chip('Desligado')),
        h(
          'div',
          { class: 'stack' },
          h('p', { class: 'muted' }, 'Com ele ativo, o potencial exato dos jogadores fica visível e as ferramentas de edição do universo (Dev Tools) valem como decisões de comissário. Forçar trades e editar contratos entram na Fase 2.'),
          rules.lockGodMode
            ? h('p', { class: 'faint small' }, `O modo ${mode.label} não permite God Mode. Para editar o universo, crie uma carreira Commissioner.`)
            : mode.id === 'commissioner'
              ? h('p', { class: 'faint small' }, 'No modo Commissioner o God Mode fica sempre ligado. Para trocar de franquia, use o selo COMMISSIONER MODE na barra superior.')
              : h('div', { class: 'row wrap' }, h('button', { class: 'btn', onclick: async () => {
                  if (!career.godMode && !(await confirmDialog({ title: 'Ativar God Mode?', message: 'A carreira passa a ser marcada como God Mode na lista de saves. Você pode desligar depois.', confirmLabel: 'Ativar' }))) return;
                  updateCareer({ godMode: !career.godMode }, career.godMode ? 'God Mode desligado.' : 'God Mode ativado.');
                } }, career.godMode ? 'Desligar God Mode' : 'Ativar God Mode')),
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: career.autoApproveAiTrades, onchange: (e) => updateCareer({ autoApproveAiTrades: e.target.checked }) }), 'Aprovar automaticamente trades da IA'),
        ),
      ),
      card('Sessão', h('div', { class: 'row wrap' }, h('button', { class: 'btn', onclick: async () => (await duplicateCareer(getWorld().saveId, { kind: 'checkpoint' }), toast('Ponto de restauração criado.')), tip: 'Cópia de segurança desta carreira num slot à parte.' }, 'Criar ponto de restauração'), h('button', { class: 'btn', onclick: async () => (await closeCareer(), (location.hash = '#/start')) }, 'Salvar e voltar ao menu inicial'))),
    );
  }

  function render(active = parseHash().query.get('tab') ?? 'geral') {
    mount(
      root,
      pageHeader('Configurações', { sub: 'Preferências do aplicativo ficam neste navegador; dificuldade e carreira ficam no save.' }),
      tabView(tabs, { active, onChange: (tab) => setQuery({ tab: tab === 'geral' ? null : tab }) }),
    );
  }

  render();
  return root;
}
