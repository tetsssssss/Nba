// Comandos do técnico durante a partida: táticas, substituições e pedido de tempo.
// Cada controle chama o motor (setTactic / setMatchup / requestSub); a IA dos jogadores passa a
// tentar executar a instrução — nenhum resultado é aplicado diretamente.
import { h, mount } from '../dom.js';
import { modal, tabView, toast } from '../components/feedback.js';
import { openDrawer } from '../components/overlay.js';
import { playerAvatar } from '../../media/photos.js';
import { TACTIC_OPTIONS } from '../../match/tactics.js';

const POS = ['PG', 'SG', 'SF', 'PF', 'C'];
const colorOf = (coach) => coach.sim.teams[coach.team].colors?.[0];

/** Grupo de opções excludentes de uma tática, cada uma com a explicação do que muda em quadra. */
function tacticGroup(coach, key) {
  const def = TACTIC_OPTIONS[key];
  const host = h('div', { class: 'tactic-group' });
  const current = () => (key === 'coverage' ? coach.sim.teams[coach.team].coverage : coach.sim.teams[coach.team].tactics[key]);
  const draw = () =>
    mount(
      host,
      h('h3', null, def.label),
      h(
        'div',
        { class: 'tactic-options', role: 'radiogroup', 'aria-label': def.label },
        def.options.map(([value, label, tip]) =>
          h(
            'button',
            {
              type: 'button', role: 'radio', 'aria-checked': String(current() === value), class: ['option-card', current() === value && 'selected'],
              onclick: () => {
                if (current() === value) return;
                toast(coach.sim.setTactic(coach.team, key, value));
                draw();
                coach.refresh();
              },
            },
            h('strong', null, label),
            h('span', null, tip),
          ),
        ),
      ),
    );
  draw();
  return host;
}

function starPicker(coach) {
  const t = coach.sim.teams[coach.team];
  return h(
    'div',
    { class: 'tactic-group' },
    h('h3', null, 'Jogador prioritário'),
    h('p', { class: 'muted small' }, 'Os companheiros procuram mais este jogador e ele assume mais arremessos. A defesa adversária também percebe.'),
    h(
      'select',
      {
        'aria-label': 'Jogador prioritário',
        onchange: (e) => {
          toast(coach.sim.setTactic(coach.team, 'star', e.target.value ? Number(e.target.value) : null));
          coach.refresh();
        },
      },
      h('option', { value: '' }, 'Sem prioridade — a leitura decide'),
      t.all.filter((p) => !p.fouledOut).map((p) => h('option', { value: p.id, selected: t.tactics.star === p.id }, `${p.name} · ${p.data.positions?.[0] ?? ''} · ${p.data.ovr ?? ''}${t.lineup.includes(p) ? '' : ' (banco)'}`)),
    ),
  );
}

function matchupsPanel(coach) {
  const { sim } = coach;
  const mine = sim.teams[coach.team];
  const theirs = sim.teams[1 - coach.team];
  return h(
    'div',
    { class: 'tactic-group' },
    h('h3', null, 'Quem marca quem'),
    h('p', { class: 'muted small' }, 'Escolha o alvo de cada defensor. A troca vale a partir da próxima posse e se desfaz quando um dos dois sai de quadra.'),
    mine.lineup.map((d) =>
      h(
        'div',
        { class: 'matchup-row' },
        playerAvatar(d.data, { size: 'sm', color: mine.colors?.[0] }),
        h('span', { class: 'grow name' }, d.short, h('small', { class: 'muted' }, ` ${d.data.positions?.[0] ?? ''}`)),
        h('span', { class: 'faint' }, 'marca'),
        h(
          'select',
          { 'aria-label': `Alvo de ${d.name}`, onchange: (e) => (sim.setMatchup(coach.team, d.id, Number(e.target.value)), toast(`${d.short} marca ${theirs.all.find((p) => p.id === Number(e.target.value))?.short}`), coach.refresh()) },
          theirs.lineup.map((o) => h('option', { value: o.id, selected: d.man === o }, `${o.short} · ${o.data.positions?.[0] ?? ''} · ${o.data.ovr ?? ''}`)),
        ),
      ),
    ),
  );
}

const TABS = (coach) => [
  { id: 'ataque', label: 'Ataque', render: () => h('div', { class: 'stack' }, tacticGroup(coach, 'focus'), starPicker(coach)) },
  { id: 'defesa', label: 'Defesa', render: () => h('div', { class: 'stack' }, tacticGroup(coach, 'coverage'), tacticGroup(coach, 'pressure'), tacticGroup(coach, 'paint')) },
  { id: 'ritmo', label: 'Ritmo', render: () => tacticGroup(coach, 'pace') },
  { id: 'rebote', label: 'Rebote', render: () => tacticGroup(coach, 'boards') },
  { id: 'transicao', label: 'Transição', render: () => tacticGroup(coach, 'transition') },
  { id: 'matchups', label: 'Matchups', render: () => matchupsPanel(coach) },
];

export function openTactics(coach) {
  if (coach.team == null) return;
  openDrawer(() => tabView(TABS(coach)), { title: `Táticas — ${coach.sim.teams[coach.team].name}`, wide: true });
}

// ------------------------------------------------------------------ substituições
/** Quadra (PG…C) em cima, banco embaixo: clique em quem SAI e depois em quem ENTRA. */
function subsPanel(coach) {
  const { sim } = coach;
  const t = sim.teams[coach.team];
  const pairs = t.pendingSubs.map((s) => ({ ...s }));
  let out = null;
  const host = h('div', { class: 'subs' });

  const card = (p, label, { role, pending }) =>
    h(
      'button',
      {
        type: 'button', disabled: p.fouledOut, class: ['sub-card', role, out === p.id && 'picked', pending && 'pending'],
        'aria-label': `${role === 'court' ? 'Sai' : 'Entra'}: ${p.name}`,
        onclick: () => (role === 'court' ? pickOut(p) : pickIn(p)),
      },
      h('span', { class: 'micro pos-tag' }, label),
      playerAvatar(p.data, { size: 'md', color: colorOf(coach) }),
      h('strong', null, p.short),
      h('span', { class: 'energy', tip: `Energia ${(p.energy * 100).toFixed(0)}%` }, h('i', { class: p.energy > 0.7 ? 'ok' : p.energy > 0.5 ? 'mid' : 'low', style: { width: `${Math.round(p.energy * 100)}%` } })),
      h('span', { class: 'muted small num' }, `${(p.secs / 60).toFixed(0)} min · ${p.stats.pts} pts · ${p.stats.pf} F`),
      pending ? h('span', { class: 'chip warn' }, pending) : p.fouledOut ? h('span', { class: 'chip bad' }, 'Eliminado') : null,
    );

  function pickOut(p) {
    const i = pairs.findIndex((s) => s.outId === p.id);
    if (i >= 0) pairs.splice(i, 1); // clicar de novo desfaz a troca agendada
    else out = out === p.id ? null : p.id;
    draw();
  }
  function pickIn(p) {
    const i = pairs.findIndex((s) => s.inId === p.id);
    if (i >= 0) pairs.splice(i, 1);
    else if (out == null) return toast('Escolha primeiro, na quadra, quem sai.', 'warn');
    else {
      pairs.push({ outId: out, inId: p.id });
      out = null;
    }
    draw();
  }
  function confirm() {
    for (const s of t.pendingSubs) sim.cancelSub(coach.team, s.outId);
    const failed = pairs.map((s) => sim.requestSub(coach.team, s.outId, s.inId)).filter((r) => !r.ok);
    if (failed.length) toast(failed[0].reason, 'warn');
    else if (pairs.length) toast(sim.state === 'dead' ? 'Substituições confirmadas.' : 'Substituições confirmadas: entram na próxima bola parada.');
    coach.refresh();
  }
  function draw() {
    const name = (id) => t.all.find((p) => p.id === id)?.short;
    const bench = t.all.filter((p) => !t.lineup.includes(p));
    mount(
      host,
      h('div', { class: 'row between' }, h('h3', null, 'Em quadra — clique em quem sai'), h('label', { class: 'check small', tip: 'Ligado: o assistente troca quem cansa ou se complica com faltas. Desligado: só você substitui.' }, h('input', { type: 'checkbox', checked: t.autoSubs, onchange: (e) => (toast(sim.setTactic(coach.team, 'autoSubs', e.target.checked)), coach.refresh()) }), 'Substituições automáticas')),
      h('div', { class: 'sub-grid court' }, t.lineup.map((p, i) => card(p, POS[i] ?? '', { role: 'court', pending: pairs.find((s) => s.outId === p.id) ? `Sai → ${name(pairs.find((s) => s.outId === p.id).inId)}` : null }))),
      h('h3', null, out != null ? `Banco — quem entra no lugar de ${name(out)}?` : 'Banco'),
      bench.length ? h('div', { class: 'sub-grid' }, bench.map((p) => card(p, p.data.positions?.[0] ?? '', { role: 'bench', pending: pairs.find((s) => s.inId === p.id) ? `Entra por ${name(pairs.find((s) => s.inId === p.id).outId)}` : null }))) : h('p', { class: 'muted' }, 'Não há jogadores no banco.'),
    );
  }
  draw();
  return { el: host, confirm, count: () => pairs.length };
}

export function openSubstitutions(coach) {
  if (coach.team == null) return;
  const wasPaused = coach.sim.over;
  coach.pause();
  const panel = subsPanel(coach);
  modal(
    (close) => [
      h('h2', null, `Substituições — ${coach.sim.teams[coach.team].name}`),
      panel.el,
      h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: close }, 'Cancelar'), h('button', { class: 'btn primary', onclick: () => (panel.confirm(), close()) }, 'Confirmar')),
    ],
    { wide: true, onClose: () => !wasPaused && coach.resume() },
  );
}

// ------------------------------------------------------------------ pedido de tempo
/** Instruções prontas: cada uma é um conjunto de táticas reais, não um bônus. */
const INSTRUCTIONS = [
  { label: 'Acalmar o jogo', text: 'Ritmo cadenciado e subida de bola sem correria. Para esfriar uma sequência do adversário.', set: { pace: -1, transition: 'walk' } },
  { label: 'Acelerar', text: 'Ritmo alto e contra-ataque sempre que recuperar a bola.', set: { pace: 1, transition: 'push' } },
  { label: 'Defesa primeiro', text: 'Garrafão fechado e todos de volta depois do arremesso.', set: { paint: 1, boards: 'getback' } },
  { label: 'Buscar a virada', text: 'Pressão na bola, ritmo alto e arremessos de três para encurtar a diferença depressa.', set: { pressure: 1, pace: 1, focus: 'three' } },
  { label: 'Voltar ao plano', text: 'Desfaz as instruções e devolve o time ao jogo natural.', set: { pace: 0, transition: 'normal', paint: 0, pressure: 0, boards: 'balanced', focus: 'balanced' } },
];

export function openTimeout(coach) {
  const { sim } = coach;
  const t = sim.teams[coach.team];
  const subs = subsPanel(coach);
  const diff = sim.score[coach.team] - sim.score[1 - coach.team];
  modal(
    (close) => [
      h('div', { class: 'row between' }, h('h2', null, `Tempo — ${t.name}`), h('span', { class: 'muted' }, `${diff === 0 ? 'Empate' : diff > 0 ? `Vencendo por ${diff}` : `Perdendo por ${-diff}`} · restam ${t.timeouts} tempo(s)`)),
      tabView([
        { id: 'subs', label: 'Substituições', render: () => subs.el },
        { id: 'ataque', label: 'Ataque', render: () => h('div', { class: 'stack' }, tacticGroup(coach, 'focus'), tacticGroup(coach, 'pace'), starPicker(coach)) },
        { id: 'defesa', label: 'Defesa', render: () => h('div', { class: 'stack' }, tacticGroup(coach, 'coverage'), tacticGroup(coach, 'pressure'), tacticGroup(coach, 'paint'), matchupsPanel(coach)) },
        {
          id: 'instrucao', label: 'Instrução',
          render: () =>
            h(
              'div',
              { class: 'stack' },
              h('div', { class: 'tactic-options' }, INSTRUCTIONS.map((ins) => h('button', { type: 'button', class: 'option-card', onclick: () => (Object.entries(ins.set).forEach(([k, v]) => sim.setTactic(coach.team, k, v)), toast(`Instrução: ${ins.label.toLowerCase()}`), coach.refresh()) }, h('strong', null, ins.label), h('span', null, ins.text)))),
              h('p', { class: 'faint small' }, 'O descanso do tempo já foi aplicado (pequeno ganho de energia para quem está em quadra). Discurso motivacional depende do sistema de moral, previsto para a Fase 7.'),
            ),
        },
      ]),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: () => (subs.confirm(), close()) }, 'Voltar à quadra')),
    ],
    { wide: true, onClose: coach.resume },
  );
}
