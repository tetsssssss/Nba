// Comparação lado a lado de 2 a 4 jogadores. Com dois, o centro mostra a diferença; com mais, a melhor marca de cada linha é destacada.
import { h, icon, mount } from '../dom.js';
import { height, money, number } from '../format.js';
import { navigate, parseHash } from '../router.js';
import { card, emptyState, ovrBadge, pageHeader, posLabel } from '../components/widgets.js';
import { tabView } from '../components/feedback.js';
import { normalizeSearch } from '../search.js';
import { playerAvatar } from '../../media/photos.js';
import { careerStatsOf, getWorld, playerAge } from '../../core/world.js';
import { contractSummary, seasonLabel } from '../../contracts/cap.js';
import { ATTRIBUTE_GROUPS } from '../../players/attributes.js';
import { TENDENCY_GROUPS } from '../../players/tendencies.js';
import { lastSeasonLine } from '../../players/statline.js';
import { playerFingerprint } from '../experience-insights.js';
import { duelRadar } from '../components/visuals.js';

const MAX = 4;

export async function compareView() {
  const world = getWorld();
  const ids = [...new Set((parseHash().query.get('ids') ?? '').split(',').map(Number).filter((id) => world.players.has(id)))].slice(0, MAX);
  const players = ids.map((id) => world.players.get(id));
  const lines = new Map(await Promise.all(players.map(async (p) => [p.id, lastSeasonLine(await careerStatsOf(p.id))])));
  const go = (next) => navigate(`/compare${next.length ? `?ids=${next.join(',')}` : ''}`);
  const colorOf = (p) => world.teams.get(p.teamId)?.colors?.[0];

  // ---- cabeçalho: os jogadores escolhidos + campo para adicionar
  function picker() {
    const results = h('div', { class: 'compare-results' });
    const input = h('input', { type: 'search', placeholder: players.length ? 'Adicionar jogador…' : 'Digite o nome de um jogador…', 'aria-label': 'Adicionar jogador à comparação', autocomplete: 'off' });
    input.addEventListener('input', () => {
      const q = normalizeSearch(input.value);
      if (q.length < 2) return mount(results);
      const hits = [...world.players.values()].filter((p) => !ids.includes(p.id) && normalizeSearch(p.name).includes(q)).sort((a, b) => b.ovr - a.ovr).slice(0, 6);
      mount(results, hits.length ? hits.map((p) => h('button', { type: 'button', class: 'menu-item', onclick: () => go([...ids, p.id]) }, playerAvatar(p, { size: 'xs' }), h('span', { class: 'grow' }, p.name, h('small', null, `${p.positions.join('/')} · ${world.teams.get(p.teamId)?.name ?? 'Sem time'} · ${p.ovr} OVR`)))) : h('p', { class: 'muted small', style: { padding: '8px' } }, 'Nenhum jogador com esse nome.'));
    });
    return h('div', { class: 'compare-slot add' }, h('span', { class: 'micro faint' }, `Vaga ${players.length + 1} de ${MAX}`), input, results);
  }
  const slots = h(
    'div',
    { class: 'compare-head', style: { '--n': Math.min(MAX, players.length + 1) } },
    players.map((p) =>
      h(
        'div',
        { class: 'compare-slot', style: { '--c1': colorOf(p) } },
        h('button', { class: 'btn icon ghost small remove', type: 'button', 'aria-label': `Remover ${p.name}`, tip: 'Remover da comparação', onclick: () => go(ids.filter((id) => id !== p.id)) }, icon('close')),
        playerAvatar(p, { size: 'lg', color: colorOf(p) }),
        h('a', { class: 'link compare-name', href: `#/player/${p.id}` }, p.name),
        h('div', { class: 'row', style: { gap: '8px' } }, ovrBadge(p.ovr), posLabel(p.positions), h('span', { class: 'muted small' }, world.teams.get(p.teamId)?.id ?? '—')),
      ),
    ),
    players.length < MAX ? picker() : null,
  );

  if (players.length < 2) {
    return h('div', { class: 'page' }, pageHeader('Comparar jogadores', { sub: 'Escolha de 2 a 4 jogadores para ver atributos, estatísticas, contrato e tendências lado a lado.' }), slots, card(null, emptyState(players.length ? 'Falta um jogador' : 'Nenhum jogador escolhido', 'Use o campo acima, ou marque jogadores na tabela do elenco e clique em Comparar.')));
  }

  // ---- linhas de comparação. higher=false → menor é melhor (idade não é "melhor": neutral)
  const duel = players.length === 2;
  function row(label, values, { fmt = (v) => v, max = 100, neutral = false, tip = null } = {}) {
    const nums = values.map((v) => (typeof v === 'number' && !Number.isNaN(v) ? v : null));
    const best = neutral ? null : Math.max(...nums.filter((v) => v != null));
    const isBest = (v) => !neutral && v != null && v === best && nums.filter((x) => x === best).length < nums.length;
    const cell = (v, i, flip) => h('div', { class: ['cmp-cell', isBest(v) && 'best', flip && 'flip'] }, h('span', { class: 'cmp-v' }, v == null ? '—' : fmt(v)), neutral ? null : h('span', { class: 'cmp-bar' }, h('i', { style: { width: `${v == null ? 0 : Math.max(3, Math.min(100, (v / max) * 100))}%`, background: colorOf(players[i]) } })));
    if (duel) {
      const diff = nums[0] != null && nums[1] != null && !neutral ? nums[0] - nums[1] : null;
      return h('div', { class: 'cmp-row duel' }, cell(nums[0], 0, true), h('div', { class: 'cmp-label', tip }, h('span', null, label), diff ? h('span', { class: 'cmp-diff' }, `${diff > 0 ? '◀ ' : ''}${fmt(Math.abs(diff))}${diff < 0 ? ' ▶' : ''}`) : null), cell(nums[1], 1, false));
    }
    return h('div', { class: 'cmp-row', style: { '--n': players.length } }, h('div', { class: 'cmp-label', tip }, label), nums.map((v, i) => cell(v, i, false)));
  }
  const section = (title, rows) => card(title, h('div', { class: 'cmp' }, rows));
  const one = (v) => number(v, 1);
  const stat = (label, key, max, tip) => row(label, players.map((p) => lines.get(p.id)?.[key] ?? null), { fmt: one, max, tip });
  const contract = (p) => contractSummary(world.contracts.get(p.id), world.calendar.season);

  const tabs = [
    {
      id: 'resumo', label: 'Resumo',
      render: () =>
        h(
          'div',
          { class: 'grid cols-2' },
          section('Perfil', [
            row('Overall', players.map((p) => p.ovr)),
            row('Potencial', players.map((p) => p.potential), { tip: 'Projeção atual do universo; no perfil ela aparece como faixa.' }),
            row('Idade', players.map((p) => playerAge(p)), { neutral: true, fmt: (v) => `${v} anos` }),
            row('Altura', players.map((p) => p.heightIn), { neutral: true, fmt: height }),
            ...ATTRIBUTE_GROUPS.map((g) => row(g.label, players.map((p) => Math.round(g.attributes.reduce((a, x) => a + p.attributes[x.key], 0) / g.attributes.length)), { tip: 'Média do grupo de atributos.' })),
          ]),
          h(
            'div',
            { class: 'stack' },
            section('Última temporada (por jogo)', [stat('Pontos', 'pts', 35), stat('Rebotes', 'reb', 15), stat('Assistências', 'ast', 12), stat('Roubos', 'stl', 2.5), stat('Tocos', 'blk', 3), stat('Minutos', 'min', 40), stat('FG%', 'fgPct', 70), stat('3P%', 'tpPct', 50)]),
            section('Contrato', [
              row('Salário atual', players.map((p) => contract(p)?.salary ?? null), { neutral: true, fmt: (v) => money(v) }),
              row('Anos restantes', players.map((p) => contract(p)?.yearsLeft ?? null), { neutral: true }),
              row('Até', players.map((p) => contract(p)?.endSeason ?? null), { neutral: true, fmt: seasonLabel }),
              row('Total restante', players.map((p) => contract(p)?.total ?? null), { neutral: true, fmt: (v) => money(v) }),
            ]),
          ),
        ),
    },
    { id: 'atributos', label: 'Atributos', render: () => h('div', { class: 'grid cols-2' }, ATTRIBUTE_GROUPS.map((g) => section(g.label, g.attributes.map((a) => row(a.label, players.map((p) => p.attributes[a.key]), { tip: a.tip }))))) },
    { id: 'tendencias', label: 'Tendências', render: () => h('div', { class: 'grid cols-2' }, TENDENCY_GROUPS.map((g) => section(g.label, g.tendencies.map((t) => row(t.label, players.map((p) => p.tendencies[t.key]), { tip: t.tip, neutral: false }))))) },
  ];

  const radar = duel ? duelRadar(playerFingerprint(players[0]), playerFingerprint(players[1]), { firstName: players[0].name, secondName: players[1].name }) : null;
  const visual = radar ? card('Estilos em confronto', h('div', { class: 'evo-compare-visual' }, radar,
    h('div', { class: 'evo-compare-legend' },
      h('span', { class: 'evo-radar-legend first' }, players[0].name),
      h('span', { class: 'evo-radar-legend second' }, players[1].name),
      h('p', { class: 'muted small' }, 'Comparação das médias dos cinco grupos de atributos, usando a mesma escala.')))) : null;
  return h('div', { class: 'page' }, pageHeader('Comparar jogadores', { sub: duel ? 'A coluna central mostra a diferença e aponta para quem leva vantagem.' : 'A melhor marca de cada linha aparece destacada.', actions: h('button', { class: 'btn ghost', type: 'button', onclick: () => go([]) }, 'Limpar') }), slots, visual, tabView(tabs));
}
