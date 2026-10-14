// Perfil de franquia: elenco, folha salarial, depth chart, estrutura e história.
import { h, icon, mount } from '../dom.js';
import { CONFERENCE_LABEL, height, money, number, record } from '../format.js';
import { navigate, parseHash, setQuery } from '../router.js';
import { card, emptyState, favStar, futureBox, ovrBadge, playerCell, posLabel, segmented, stat, statusBadge } from '../components/widgets.js';
import { dataTable } from '../components/table.js';
import { tabView, toast } from '../components/feedback.js';
import { menuButton } from '../components/overlay.js';
import { openPlayerQuick } from '../components/player-quick.js';
import { getSetting, setSetting } from '../../core/settings.js';
import { lastSeasonLine } from '../../players/statline.js';
import { playerAvatar, teamLogo } from '../../media/photos.js';
import { careerStatsOf, getWorld, markDirty, payrollOf, playerAge, teamRoster } from '../../core/world.js';
import { CAP_STATUS_LABEL, CONTRACT_TYPE_LABEL, capLines, contractSummary, salaryIn, seasonLabel } from '../../contracts/cap.js';
import { autoDepthChart } from '../../players/depth.js';
import { makeRotation, validateRotation } from '../../players/rotation.js';
import { executeTrade, evaluateTrade, signFreeAgent } from '../../contracts/market.js';
import { modeShows } from '../../core/modes.js';
import { seasonAwards, teamSeasonSummary } from '../../season/narrative.js';
import { POSITIONS, POSITION_LABELS } from '../../players/attributes.js';
import { ROLE_BY_ID } from '../../core/career-options.js';

const OWNER_PROFILE = { gastador: 'Gastador', pragmatico: 'Pragmático', economico: 'Econômico', impaciente: 'Impaciente' };

/** Barra de folha com as linhas de cap/tax/aprons. Reutilizada na Central. */
export function capBar(payroll, cap, capMode) {
  const lines = capLines(capMode);
  const marks = [['Cap', cap.salaryCap, false]];
  if (lines.luxuryTax) marks.push(['Tax', cap.luxuryTax, true]);
  if (lines.aprons) marks.push(['1º apron', cap.firstApron, false], ['2º apron', cap.secondApron, true]);
  const max = Math.max(payroll.total, marks.at(-1)[1]) * 1.06;
  const pctOf = (v) => `${(v / max) * 100}%`;
  return h(
    'div',
    { class: 'capbar' },
    h('div', { class: 'fill', style: { width: pctOf(payroll.live) } }),
    payroll.dead > 0 ? h('div', { class: 'fill dead', style: { left: pctOf(payroll.live), width: pctOf(payroll.dead) }, tip: `Dead money: ${money(payroll.dead)}` }) : null,
    marks.map(([label, value, below]) => h('div', { class: 'mark', style: { left: pctOf(value) }, tip: `${label}: ${money(value)}` }, h('span', { class: below && 'below' }, label))),
  );
}

/** Colunas opcionais do elenco: o usuário escolhe quais ver e a escolha fica salva. */
const OPTIONAL_COLUMNS = [
  ['jersey', '#'], ['height', 'Altura'], ['exp', 'Experiência'], ['country', 'País'], ['min', 'MIN'], ['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['fg', 'FG%'], ['tp', '3P%'], ['total', 'Total do contrato'],
];
const DEFAULT_OPTIONAL = ['jersey', 'pts', 'reb', 'ast'];
const AVAILABILITY = [['', 'Todos'], ['ok', 'Disponíveis'], ['injured', 'Lesionados'], ['two-way', 'Two-way'], ['camp', 'Training camp'], ['expiring', 'Último ano de contrato']];

async function rosterTab(team, roster) {
  const { contracts, calendar } = getWorld();
  if (!roster.length) return emptyState('Elenco vazio', 'Franquia de expansão: os primeiros jogadores chegam no Expansion Draft (Fase 3).', h('a', { class: 'btn', href: '#/players' }, 'Ver jogadores da liga'));

  const lines = new Map(await Promise.all(roster.map(async (p) => [p.id, lastSeasonLine(await careerStatsOf(p.id))])));
  const line = (p) => lines.get(p.id);
  const summaryOf = (p) => contractSummary(contracts.get(p.id), calendar.season);
  const q = parseHash().query;
  const filters = { pos: q.get('pos') ?? '', status: q.get('status') ?? '' };
  const selected = new Set();
  let optional = new Set(getSetting('rosterColumns') ?? DEFAULT_OPTIONAL);
  const host = h('div', null);
  const count = h('span', { class: 'muted small' });
  const compareBtn = h('button', { class: 'btn', type: 'button', disabled: true, onclick: () => navigate(`/compare?ids=${[...selected].join(',')}`) }, icon('compare'), h('span', null, 'Comparar'));
  const statCol = (key, label, get, tip) => ({ key, label, tip, align: 'num', optional: true, sort: (p) => get(line(p)) ?? null, render: (p) => (get(line(p)) != null ? number(get(line(p))) : h('span', { class: 'faint' }, '—')) });

  function onSelect(p, box) {
    if (box.checked && selected.size >= 4) {
      box.checked = false;
      return toast('Compare no máximo 4 jogadores por vez.', 'warn');
    }
    if (box.checked) selected.add(p.id);
    else selected.delete(p.id);
    box.closest('tr').classList.toggle('selected', box.checked);
    paintCompare();
  }

  const ALL = [
    { key: 'sel', label: '', width: '34px', render: (p) => h('input', { type: 'checkbox', checked: selected.has(p.id), 'aria-label': `Selecionar ${p.name} para comparar`, onchange: (e) => onSelect(p, e.target) }) },
    { key: 'jersey', label: '#', align: 'num', width: '40px', optional: true, sort: (p) => Number(p.jersey) || 999, defaultDir: 'asc', render: (p) => h('span', { class: 'muted' }, p.jersey ?? '—') },
    { key: 'name', label: 'Jogador', sort: (p) => p.lastName, defaultDir: 'asc', render: (p) => playerCell(p) },
    { key: 'pos', label: 'Pos', sort: (p) => POSITIONS.indexOf(p.positions[0]), defaultDir: 'asc', render: (p) => posLabel(p.positions) },
    { key: 'age', label: 'Idade', align: 'num', sort: (p) => playerAge(p), render: (p) => playerAge(p) ?? '—' },
    { key: 'ovr', label: 'OVR', align: 'center', tip: 'Overall na posição natural principal.', sort: (p) => p.ovr, render: (p) => ovrBadge(p.ovr) },
    { key: 'pot', label: 'POT', align: 'center', tip: 'Potencial estimado (dinâmico).', sort: (p) => p.potential, render: (p) => ovrBadge(p.potential, { ghost: true }) },
    { key: 'salary', label: 'Salário', align: 'num', sort: (p) => salaryIn(contracts.get(p.id), calendar.season), render: (p) => money(salaryIn(contracts.get(p.id), calendar.season)) },
    {
      key: 'until', label: 'Contrato', align: 'num', tip: 'Última temporada do contrato. PO = player option · TO = team option.', sort: (p) => summaryOf(p)?.endSeason,
      render: (p) => {
        const c = summaryOf(p);
        if (!c?.endSeason) return '—';
        return h('span', { class: c.expiring && 'warn' }, seasonLabel(c.endSeason), c.finalOption ? h('span', { class: 'faint' }, c.finalOption === 'player' ? ' PO' : ' TO') : null);
      },
    },
    { key: 'status', label: 'Condição', sort: (p) => (p.injury ? (p.injury.status === 'Out' ? 2 : 1) : 0), render: (p) => statusBadge(p) ?? h('span', { class: 'good small' }, 'Disponível') },
    { key: 'height', label: 'Altura', align: 'num', optional: true, sort: (p) => p.heightIn, render: (p) => height(p.heightIn) },
    { key: 'exp', label: 'Exp', align: 'num', optional: true, tip: 'Temporadas na NBA (R = novato).', sort: (p) => p.exp ?? 0, render: (p) => (p.exp ? p.exp : 'R') },
    { key: 'country', label: 'País', optional: true, sort: (p) => p.country ?? 'zzz', defaultDir: 'asc', render: (p) => h('span', { class: 'muted' }, p.country ?? '—') },
    statCol('min', 'MIN', (l) => l?.min, 'Minutos por jogo na última temporada.'),
    statCol('pts', 'PTS', (l) => l?.pts, 'Pontos por jogo na última temporada.'),
    statCol('reb', 'REB', (l) => l?.reb, 'Rebotes por jogo na última temporada.'),
    statCol('ast', 'AST', (l) => l?.ast, 'Assistências por jogo na última temporada.'),
    statCol('fg', 'FG%', (l) => l?.fgPct, 'Aproveitamento de quadra na última temporada.'),
    statCol('tp', '3P%', (l) => l?.tpPct, 'Aproveitamento de três na última temporada.'),
    { key: 'total', label: 'Total', align: 'num', optional: true, tip: 'Valor restante do contrato.', sort: (p) => summaryOf(p)?.total ?? 0, render: (p) => money(summaryOf(p)?.total ?? null) },
    { key: 'fav', label: '', width: '34px', render: (p) => favStar(p) },
  ];

  function visible() {
    return roster.filter((p) => {
      if (filters.pos && !p.positions.includes(filters.pos)) return false;
      switch (filters.status) {
        case 'ok': return !p.injury;
        case 'injured': return Boolean(p.injury);
        case 'expiring': return Boolean(summaryOf(p)?.expiring);
        case '': return true;
        default: return p.rosterStatus === filters.status;
      }
    });
  }
  function paintCompare() {
    compareBtn.disabled = selected.size < 2;
    compareBtn.lastChild.textContent = selected.size ? `Comparar (${selected.size})` : 'Comparar';
    compareBtn.dataset.tip = selected.size < 2 ? 'Marque de 2 a 4 jogadores na tabela para comparar.' : 'Abrir comparação lado a lado.';
  }
  function draw() {
    const rows = visible();
    const table = dataTable(ALL.filter((c) => !c.optional || optional.has(c.key)), {
      rows, sortKey: 'ovr', stateKey: 'roster', pinFirst: 3, onRowClick: openPlayerQuick, rowClass: (p) => selected.has(p.id) && 'selected',
      emptyText: 'Nenhum jogador do elenco corresponde a esses filtros.',
    });
    mount(host, table.el);
    count.textContent = rows.length === roster.length ? `${roster.length} jogadores` : `${rows.length} de ${roster.length} jogadores`;
    setQuery({ pos: filters.pos, status: filters.status });
  }
  function toggleColumn(key) {
    if (!optional.delete(key)) optional.add(key);
    setSetting('rosterColumns', [...optional]);
    draw();
  }
  function resetColumns() {
    optional = new Set(DEFAULT_OPTIONAL);
    setSetting('rosterColumns', null);
    draw();
  }

  const columnsMenu = menuButton(
    () => [{ heading: 'Colunas opcionais' }, ...OPTIONAL_COLUMNS.map(([key, label]) => ({ label, checked: optional.has(key), keepOpen: true, onClick: () => toggleColumn(key) })), 'sep', { label: 'Restaurar padrão', onClick: resetColumns }],
    { label: 'Colunas', iconName: 'columns', cls: 'btn' },
  );

  paintCompare();
  draw();
  return h(
    'div',
    null,
    h(
      'div',
      { class: 'toolbar' },
      segmented([['', 'Todos'], ...POSITIONS.map((pos) => [pos, pos, POSITION_LABELS[pos]])], filters.pos, (v) => ((filters.pos = v), draw()), { label: 'Filtrar por posição' }),
      h('select', { 'aria-label': 'Filtrar por disponibilidade e vínculo', onchange: (e) => ((filters.status = e.target.value), draw()) }, AVAILABILITY.map(([value, label]) => h('option', { value, selected: filters.status === value }, label))),
      count,
      h('span', { class: 'grow' }),
      compareBtn,
      columnsMenu,
    ),
    h('section', { class: 'card flush' }, host),
    h('p', { class: 'faint small', style: { marginTop: '8px' } }, 'Clique em uma linha para abrir a ficha rápida; o nome leva ao perfil completo. Estatísticas: médias por jogo da última temporada disputada.'),
  );
}

function payrollTab(team, roster) {
  const world = getWorld();
  const { contracts, calendar, league } = world;
  const seasons = Array.from({ length: 5 }, (_, i) => calendar.season + i);
  const payroll = payrollOf(team.id);
  const lines = capLines(world.career.capMode);
  const rows = [...roster].sort((a, b) => salaryIn(contracts.get(b.id), calendar.season) - salaryIn(contracts.get(a.id), calendar.season));

  const cell = (contract, season) => {
    const year = contract?.years.find((y) => y.season === season);
    if (!year) {
      if (contract?.qualifyingOffer?.season === season) return h('span', { class: 'faint', tip: `Qualifying offer de ${money(contract.qualifyingOffer.amount)}: o time pode torná-lo agente livre restrito.` }, 'QO');
      return h('span', { class: 'faint' }, '—');
    }
    return h(
      'span',
      { class: year.estimated && 'muted', tip: year.estimated ? 'Valor estimado — precisa de validação.' : null },
      money(year.salary),
      year.option ? h('span', { class: 'chip', style: { marginLeft: '6px' }, tip: year.option === 'player' ? 'Player option: o jogador decide se cumpre este ano.' : 'Team option: a franquia decide se mantém este ano.' }, year.option === 'player' ? 'PO' : 'TO') : null,
      year.estimated ? ' *' : null,
    );
  };

  const table = h(
    'table',
    { class: 'data' },
    h('thead', null, h('tr', null, h('th', null, 'Jogador'), h('th', null, 'Tipo'), seasons.map((s) => h('th', { class: 'num' }, seasonLabel(s))))),
    h(
      'tbody',
      null,
      rows.map((p) => {
        const c = contracts.get(p.id);
        return h(
          'tr',
          null,
          h('td', null, playerCell(p, { sub: `${p.positions.join('/')} · ${playerAge(p) ?? '?'} anos`, size: 'xs' })),
          h('td', null, h('span', { class: 'muted' }, CONTRACT_TYPE_LABEL[c?.type] ?? '—')),
          seasons.map((s) => h('td', { class: 'num' }, cell(c, s))),
        );
      }),
      team.deadMoney.length ? h('tr', { class: 'group' }, h('td', { colSpan: 2 + seasons.length }, 'Dead money (jogadores dispensados que ainda contam na folha)')) : null,
      team.deadMoney.map((d) => h('tr', null, h('td', { colSpan: 2 }, h('span', { class: 'muted' }, d.name)), seasons.map((s) => h('td', { class: 'num muted' }, money(d.years.find((y) => y.season === s)?.amount ?? null))))),
    ),
    h(
      'tfoot',
      null,
      h('tr', null, h('td', { colSpan: 2 }, 'Total que conta para o cap'), seasons.map((s) => h('td', { class: 'num' }, money(payrollOf(team.id, s).total)))),
    ),
  );

  const estimatedCount = roster.filter((p) => contracts.get(p.id)?.source === 'estimated').length;
  return h(
    'div',
    { class: 'stack' },
    card(
      `Situação em ${seasonLabel(calendar.season)}`,
      h(
        'div',
        null,
        h(
          'div',
          { class: 'stats-row' },
          stat('Folha', money(payroll.total), CAP_STATUS_LABEL[payroll.status]),
          stat('Salary cap', money(league.cap.salaryCap), payroll.capSpace >= 0 ? `${money(payroll.capSpace)} de espaço` : `${money(-payroll.capSpace)} acima`),
          lines.luxuryTax ? stat('Luxury tax', money(league.cap.luxuryTax), payroll.taxRoom >= 0 ? `${money(payroll.taxRoom)} de folga` : `${money(-payroll.taxRoom)} acima`) : null,
          lines.aprons ? stat('1º apron', money(league.cap.firstApron), payroll.firstApronRoom >= 0 ? `${money(payroll.firstApronRoom)} de folga` : `${money(-payroll.firstApronRoom)} acima`) : null,
          lines.aprons ? stat('2º apron', money(league.cap.secondApron), payroll.secondApronRoom >= 0 ? `${money(payroll.secondApronRoom)} de folga` : `${money(-payroll.secondApronRoom)} acima`) : null,
          stat('Contratos', `${payroll.standardCount} + ${payroll.twoWayCount}`, 'padrão + two-way'),
        ),
        capBar(payroll, league.cap, world.career.capMode),
        h('p', { class: 'muted', style: { fontSize: '12px' } }, `Números oficiais de ${league.cap.season}. Contratos two-way não contam para o cap. PO = player option · TO = team option · QO = qualifying offer.`),
      ),
    ),
    card(null, h('div', { class: 'table-wrap' }, table), { flush: true }),
    estimatedCount ? h('div', { class: 'note warn' }, `* ${estimatedCount} contrato(s) deste elenco não constam nas fontes consultadas e foram estimados como mínimo não garantido (training camp). Precisam de validação.`) : null,
  );
}

function depthTab(team, roster) {
  if (!roster.length) return futureBox('Sem jogadores', 'O depth chart aparece quando a franquia tiver elenco.', 3);
  const { chart, unused } = autoDepthChart(roster, 3);
  const isMine = getWorld().career.teamId === team.id;
  const selected = validateRotation(team.rotation, roster) ? [...team.rotation.starters] : POSITIONS.map((p) => chart[p][0]?.player.id);
  const minuteChoice = Object.fromEntries(roster.map((p) => [p.id, team.rotation?.minutes?.[p.id] ?? 0]));
  const controls = isMine && roster.filter((p) => p.injury?.status !== 'Out').length >= 5 ? card('Rotação personalizada', h('div', { class: 'stack' },
    h('p', { class: 'muted small' }, 'Defina cinco titulares distintos. Minutos opcionais serão normalizados para o tempo regulamentar no motor rápido.'),
    h('div', { class: 'grid cols-5' }, POSITIONS.map((pos, i) => h('label', { class: 'field' }, pos, h('select', { onchange: (e) => (selected[i] = roster.find((p) => String(p.id) === e.target.value)?.id) }, roster.filter((p) => p.injury?.status !== 'Out').map((p) => h('option', { value: p.id, selected: String(selected[i]) === String(p.id) }, `${p.name} (${p.ovr})`)))))),
    h('div', { class: 'grid cols-3' }, roster.filter((p) => p.injury?.status !== 'Out').slice(0, 13).map((p) => h('label', { class: 'field' }, p.lastName ?? p.name, h('input', { type: 'number', min: 0, max: 48, step: 1, placeholder: 'Padrão', value: minuteChoice[p.id] || '', oninput: (e) => (minuteChoice[p.id] = e.target.value === '' ? 0 : Number(e.target.value)) })))),
    h('div', { class: 'row wrap' }, h('button', { class: 'btn primary', onclick: () => { try { const minutes = Object.fromEntries(Object.entries(minuteChoice).filter(([,v]) => v > 0)); team.rotation = makeRotation(selected, minutes, roster); markDirty('teams', team.id); toast('Rotação atualizada.'); } catch (err) { toast(err.message, 'warn'); } } }, 'Salvar rotação'), h('button', { class: 'btn', onclick: () => { delete team.rotation; markDirty('teams', team.id); toast('Rotação automática restaurada.'); } }, 'Usar automática')))) : null;
  const LINES = ['Titular', '2ª unidade', '3ª unidade'];
  return h(
    'div',
    { class: 'stack' },
    h('div', { class: 'note' }, 'Depth chart automático com opção de rotação personalizada para sua franquia.'),
    controls,
    h(
      'div',
      { class: 'grid cols-5' },
      POSITIONS.map((pos) =>
        card(
          `${pos} · ${POSITION_LABELS[pos]}`,
          h(
            'div',
            { class: 'stack', style: { gap: '10px' } },
            LINES.map((label, i) => {
              const slot = chart[pos][i];
              if (!slot) return h('div', { class: 'faint', style: { fontSize: '12px' } }, `${label}: —`);
              return h(
                'a',
                { class: 'row', href: `#/player/${slot.player.id}`, tip: slot.outOfPosition ? 'Improvisado: não é posição natural deste jogador.' : null },
                playerAvatar(slot.player, { size: i === 0 ? 'md' : 'sm', color: team.colors[0] }),
                h('span', { class: 'grow' }, h('span', { class: 'name link', style: { fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, slot.player.lastName), h('small', { class: 'muted' }, slot.outOfPosition ? `${label} · improvisado` : label)),
                ovrBadge(slot.ovr),
              );
            }),
          ),
        ),
      ),
    ),
    unused.length
      ? card('Fora da rotação automática', h('div', { class: 'row wrap' }, unused.map((p) => h('a', { class: 'chip', href: `#/player/${p.id}`, tip: p.injury?.status === 'Out' ? 'Lesionado' : null }, `${p.name} · ${p.positions[0]} · ${p.ovr}`))))
      : null,
  );
}

function expansionTab(team) {
  const world = getWorld();
  const rules = world.league.expansion;
  if (world.career.teamId !== team.id) return emptyState('Sem permissão', 'Apenas sua franquia pode configurar o draft.');
  if (world.career.expansionDraft?.picks) return card('Expansion Draft concluído', h('p', { class: 'muted' }, `${world.career.expansionDraft.picks.length} escolhas registradas. O evento não será executado novamente.`));
  if (rules.teams.includes(team.id)) {
    const choices = [...world.players.values()].filter((p) => p.teamId && !rules.teams.includes(p.teamId) && p.rosterStatus === 'standard').sort((a,b) => b.ovr-a.ovr).slice(0,70);
    const preference = [...(world.career.expansionPreferences?.[team.id] ?? [])];
    const list = h('div', { class: 'row wrap' });
    const draw = () => mount(list, preference.map((id) => { const p = world.players.get(id); return h('button', { class: 'chip', onclick: () => { preference.splice(preference.indexOf(id), 1); draw(); } }, `${p?.lastName ?? id} ×`); }));
    draw();
    return card('Preferências para Expansion Draft', h('div', { class: 'stack' }, h('p', { class: 'muted small' }, 'A ordem salva é usada como prioridade, respeitando proteções e limite de perdas das franquias. Não garante a escolha.'),
      list, h('select', { onchange: (e) => { const id = choices.find((p) => String(p.id) === e.target.value)?.id; if (id != null && !preference.includes(id) && preference.length < 14) preference.push(id); draw(); } }, [h('option', { value: '' }, 'Priorizar um atleta…'), ...choices.map((p) => h('option', { value: p.id }, `${p.name} · ${p.ovr}`))]),
      h('button', { class: 'btn primary', onclick: () => { world.career.expansionPreferences ??= {}; world.career.expansionPreferences[team.id] = preference; markDirty('meta', 'career'); toast('Preferências de escolha salvas.'); } }, 'Salvar prioridades')));
  }
  const roster = teamRoster(team.id).filter((p) => p.rosterStatus === 'standard').sort((a,b) => b.ovr-a.ovr);
  const count = Math.min(roster.length, rules.protectedPerTeam);
  const selection = new Set(world.career.expansionProtections?.[team.id] ?? roster.slice(0,count).map((p) => p.id));
  const label = h('p', { class: 'muted small' }, `Protegidos: ${selection.size}/${count}`);
  return card('Proteção do Expansion Draft', h('div', { class: 'stack' }, label,
    h('div', { class: 'grid cols-3' }, roster.map((p) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: selection.has(p.id), onchange: (e) => { if (e.target.checked) selection.add(p.id); else selection.delete(p.id); label.textContent = `Protegidos: ${selection.size}/${count}`; } }), `${p.name} · ${p.ovr}`))),
    h('button', { class: 'btn primary', onclick: () => { if (selection.size !== count) return toast(`Escolha exatamente ${count} protegidos.`, 'warn'); world.career.expansionProtections ??= {}; world.career.expansionProtections[team.id] = [...selection]; markDirty('meta', 'career'); toast('Proteções salvas.'); } }, 'Salvar proteção')));
}

function marketTab(team) {
  const world = getWorld();
  if (!modeShows(world.career, 'market')) return emptyState('Mercado indisponível', 'Seu cargo não permite negociações.');
  if (team.id !== world.career.teamId && !world.career.godMode) return emptyState('Sem permissão', 'Você só pode propor trocas pela sua franquia.');
  const candidates = teamRoster(team.id).filter((p) => p.rosterStatus === 'standard');
  const opponents = [...world.teams.values()].filter((t) => t.id !== team.id);
  let other = opponents[0]?.id;
  let own = candidates[0]?.id;
  let theirs = teamRoster(other).find((p) => p.rosterStatus === 'standard')?.id;
  const theirsHost = h('div', null);
  const outcome = h('p', { class: 'muted small' }, 'Esta interface oferece apenas trocas diretas 1 por 1. Não representa todo o CBA.');
  const free = [...world.players.values()].filter((p) => !p.teamId && p.rosterStatus !== 'two-way').sort((a,b) => b.ovr-a.ovr).slice(0,100);
  let freeId = free[0]?.id;
  let salaryOffer = 3000000;
  let yearsOffer = 1;
  const selectPlayer = (players, value, action) => h('select', { onchange: (e) => action(players.find((p) => String(p.id) === e.target.value)?.id) }, players.map((p) => h('option', { value: p.id, selected: String(p.id) === String(value) }, `${p.name} · ${p.ovr} OVR`)));
  const drawOther = () => {
    const arr = teamRoster(other).filter((p) => p.rosterStatus === 'standard');
    if (!arr.some((p) => p.id === theirs)) theirs = arr[0]?.id;
    mount(theirsHost, arr.length ? selectPlayer(arr, theirs, (id) => (theirs = id)) : h('span', { class: 'muted' }, 'Sem jogadores elegíveis'));
  };
  drawOther();
  return card('Troca direta 1 por 1 (experimental)', h('div', { class: 'stack' },
    h('label', { class: 'field' }, 'Enviar', selectPlayer(candidates, own, (id) => (own = id))),
    h('label', { class: 'field' }, 'Franquia adversária', h('select', { onchange: (e) => { other = e.target.value; drawOther(); } }, opponents.map((t) => h('option', { value: t.id }, t.fullName)))),
    h('label', { class: 'field' }, 'Receber', theirsHost), outcome,
    h('div', { class: 'row wrap' }, h('button', { class: 'btn', onclick: () => { const r = evaluateTrade(world, { fromTeamId: team.id, toTeamId: other, sendId: own, receiveId: theirs }); outcome.textContent = r.reason; } }, 'Avaliar proposta'),
    h('button', { class: 'btn primary', onclick: () => { try { executeTrade({ fromTeamId: team.id, toTeamId: other, sendId: own, receiveId: theirs }); toast('Troca registrada.'); window.dispatchEvent(new Event('hashchange')); } catch (err) { outcome.textContent = err.message; toast(err.message, 'warn'); } } }, 'Executar troca')),
    free.length ? h('div', { class: 'stack' }, h('h3', null, 'Contratação de free agent'),
      h('label', { class: 'field' }, 'Jogador livre', selectPlayer(free, freeId, (id) => (freeId = id))),
      h('label', { class: 'field' }, 'Salário inicial (US$)', h('input', { type: 'number', min: 1000000, step: 100000, value: salaryOffer, oninput: (e) => salaryOffer = Number(e.target.value) })),
      h('label', { class: 'field' }, 'Duração', h('select', { onchange: (e) => yearsOffer = Number(e.target.value) }, [1,2,3,4].map((n) => h('option', { value: n }, `${n} ano(s)`)))),
      h('button', { class: 'btn primary', onclick: () => { try { signFreeAgent({teamId: team.id, playerId:freeId,salary:salaryOffer,years:yearsOffer}); toast('Contratação registrada.'); window.dispatchEvent(new Event('hashchange')); } catch(err) { toast(err.message,'warn'); } } }, 'Oferecer contrato')) : h('p', { class: 'muted small' }, 'Não há atletas livres para contratação direta.')));
}

function franchiseTab(team) {
  const world = getWorld();
  const owner = world.owners.get(team.ownerId);
  const arena = world.arenas.get(team.arenaId);
  const coach = world.coaches.get(team.headCoachId);
  const isUser = team.id === world.career.teamId;
  const you = (role) => (isUser && world.career.role === role ? `${world.career.managerName} (você)` : null);
  return h(
    'div',
    { class: 'grid cols-2' },
    card(
      'Diretoria e comissão técnica',
      h(
        'div',
        { class: 'stack' },
        h(
          'dl',
          { class: 'facts' },
          h('dt', null, 'Proprietário'), h('dd', null, you('owner') ?? owner?.name ?? '—', owner?.fictional ? h('span', { class: 'chip', style: { marginLeft: '8px' }, tip: owner.note }, 'Fictício') : null, owner?.profile ? h('span', { class: 'chip info', style: { marginLeft: '6px' } }, OWNER_PROFILE[owner.profile] ?? owner.profile) : null),
          h('dt', null, 'General Manager'), h('dd', null, you('gm') ?? you('pobo') ?? you('president') ?? team.generalManager ?? 'A contratar'),
          h('dt', null, 'Técnico'), h('dd', null, you('coach') ?? (coach ? `${coach.name}${coach.experienceYears != null ? ` · ${coach.experienceYears} temporada(s) como técnico principal` : ''}` : 'A contratar')),
          h('dt', null, 'Afiliada na G League'), h('dd', null, team.gLeagueAffiliate ?? '—'),
        ),
        isUser ? h('p', { class: 'muted', style: { fontSize: '12.5px' } }, `Seu cargo: ${ROLE_BY_ID[world.career.role].label}. ${ROLE_BY_ID[world.career.role].description}`) : null,
        futureBox('Staff completo', 'Assistentes, scouts, médicos, fisioterapeutas e preparadores — com atributos, especializações e contratação.', 6),
      ),
    ),
    h(
      'div',
      { class: 'stack' },
      card(
        'Arena e mercado',
        h(
          'dl',
          { class: 'facts' },
          h('dt', null, 'Arena'), h('dd', null, arena?.name ?? '—'),
          h('dt', null, 'Capacidade'), h('dd', null, arena?.capacity ? arena.capacity.toLocaleString('pt-BR') : '—'),
          arena?.note ? [h('dt', null, 'Observação'), h('dd', { class: 'muted' }, arena.note)] : null,
          h('dt', null, 'Tamanho do mercado'), h('dd', { tip: 'Índice do jogo (0-100): alimentará receitas, patrocínios e atração de free agents.' }, `${team.market} / 100`),
          h('dt', null, 'Rivais'), h('dd', null, team.rivals.map((id) => world.teams.get(id)?.name).filter(Boolean).join(', ') || '—'),
        ),
      ),
      card(
        'Torcida',
        h(
          'div',
          { class: 'stack', style: { gap: '10px' } },
          h('p', { class: 'muted' }, team.fans.note),
          h('div', { class: 'stats-row' }, stat('Exigência', team.fans.expectation), stat('Paixão', team.fans.passion), stat('Paciência', team.fans.patience)),
        ),
      ),
      futureBox('Finanças da franquia', 'Receitas, bilheteria, patrocínios, reformas de arena e pressão do proprietário.', 8),
    ),
  );
}

function historyTab(team) {
  const id = team.identity;
  const simulated = [...getWorld().games.values()].filter((g) => g.type === 'regular' && g.season === getWorld().calendar.season);
  const story = teamSeasonSummary(team.id, simulated);
  const award = seasonAwards(getWorld().seasonStats.values(), getWorld().players).bestStatisticalSeason;
  const awardPlayer = award ? getWorld().players.get(award.playerId) : null;
  const yearChips = (years) => (years?.length ? h('div', { class: 'row wrap' }, [...years].sort((a, b) => b - a).map((y) => h('span', { class: 'chip' }, y))) : h('span', { class: 'muted' }, 'Nenhum'));
  return h(
    'div',
    { class: 'grid cols-2' },
    h(
      'div',
      { class: 'stack' },
      card(
        'Títulos',
        h(
          'div',
          { class: 'stack', style: { gap: '12px' } },
          h(
            'div',
            { class: 'stats-row' },
            stat('NBA', team.championships.length),
            team.finalsAppearances ? stat('Finais', team.finalsAppearances.length) : stat('Conferência', team.conferenceTitles.length),
            // Seattle: o cadastro oficial traz apenas a contagem da era original
            stat('Divisão', team.divisionTitles.length || team.allTimeRecord?.divisionTitles || 0),
          ),
          h('div', null, h('h3', { style: { marginBottom: '6px' } }, 'Campeão da NBA'), yearChips(team.championships)),
        ),
      ),
      card(
        'Trajetória',
        h(
          'dl',
          { class: 'facts' },
          h('dt', null, 'Fundação'), h('dd', null, team.founded ?? '—'),
          h('dt', null, 'Retrospecto histórico'), h('dd', null, team.allTimeRecord ? `${team.allTimeRecord.wins}-${team.allTimeRecord.losses} (${team.allTimeRecord.from}–${team.allTimeRecord.to ?? 2026}) · ${team.allTimeRecord.playoffAppearances} playoffs` : 'Franquia estreante'),
          team.lastSeason ? [h('dt', null, 'Temporada 2025-26'), h('dd', null, `${record(team.lastSeason)} · ${team.lastSeason.conferenceRank}º do ${CONFERENCE_LABEL[team.lastSeason.conference]} · ${team.lastSeason.playoffs}`)] : null,
        ),
      ),
      id?.milestones ? card('Linha do tempo', h('div', { class: 'list' }, id.milestones.map((m) => h('div', { class: 'item' }, h('strong', { class: 'num', style: { minWidth: '44px' } }, m.year), h('span', { class: 'muted' }, m.text))))) : null,
    ),
    h(
      'div',
      { class: 'stack' },
      card(
        'Números aposentados',
        team.retiredNumbers.length
          ? h('div', { class: 'list' }, team.retiredNumbers.map((r) => h('div', { class: 'item', style: { padding: '6px 0' } }, h('strong', { class: 'num', style: { minWidth: '44px' } }, r.number ?? '—'), h('span', { class: 'grow' }, r.name), r.seasons ? h('span', { class: 'faint' }, r.seasons) : null)))
          : h('div', { class: 'empty' }, 'Nenhum número aposentado.'),
      ),
      id?.legends?.length ? card('Lendas da franquia', h('div', { class: 'row wrap' }, id.legends.map((n) => h('span', { class: 'chip' }, n)))) : null,
      awardPlayer && awardPlayer.teamId === team.id ? card('Destaque estatístico da liga', h('p', { class: 'muted' }, `${awardPlayer.name} lidera o índice estatístico combinado da temporada atual. Este índice não representa um prêmio oficial.`)) : null,
      card('Temporada simulada atual', h('dl', { class: 'facts' }, h('dt', null, 'Campanha'), h('dd', null, `${story.wins}-${story.losses}`), h('dt', null, 'Jogos decididos por até 5 pontos'), h('dd', null, story.closeGames), h('dt', null, 'Prorrogações'), h('dd', null, story.overtimeGames), h('dt', null, 'Maior vitória (diferença)'), h('dd', null, story.bestWin), h('dt', null, 'Maior derrota (diferença)'), h('dd', null, story.worstLoss))),
    ),
  );
}

export function teamView({ id }) {
  const world = getWorld();
  const team = world.teams.get(id);
  if (!team) return h('div', { class: 'page' }, emptyState('Franquia não encontrada', `Não existe franquia com a sigla "${id}" neste universo.`, h('a', { class: 'btn', href: '#/league' }, 'Ver todas as franquias')));
  const roster = teamRoster(team.id);
  const payroll = payrollOf(team.id);
  const avgAge = roster.length ? roster.reduce((a, p) => a + (playerAge(p) ?? 26), 0) / roster.length : null;
  const top = roster[0];

  const hero = h(
    'div',
    { class: 'hero-card', dataset: { team: team.id }, style: { '--c1': team.colors[0], '--c2': team.colors[1] } },
    teamLogo(team, { size: 'xl' }),
    h(
      'div',
      null,
      h('div', { class: 'title' }, team.fullName, team.id === world.career.teamId ? h('span', { class: 'chip good', style: { marginLeft: '12px', verticalAlign: 'middle' } }, 'Sua franquia') : null, team.expansion ? h('span', { class: 'chip info', style: { marginLeft: '8px', verticalAlign: 'middle' } }, 'Expansão') : null),
      h('div', { class: 'subtitle' }, `Conferência ${CONFERENCE_LABEL[team.conference]} · Divisão ${team.division}`, h('span', null, world.arenas.get(team.arenaId)?.name ?? ''), h('span', null, `${team.championships.length} título(s)`)),
    ),
    h(
      'div',
      { class: 'aside' },
      stat('Campanha', record(team.record)),
      stat('Elenco', roster.length, avgAge ? `média ${number(avgAge)} anos` : null),
      stat('Folha', money(payroll.total), CAP_STATUS_LABEL[payroll.status]),
      top ? stat('Destaque', top.lastName, `${top.ovr} OVR`) : null,
    ),
  );

  const tabs = [
    { id: 'elenco', label: 'Elenco', render: () => rosterTab(team, roster) },
    { id: 'folha', label: 'Folha salarial', render: () => payrollTab(team, roster) },
    { id: 'depth', label: 'Depth chart', render: () => depthTab(team, roster) },
    { id: 'mercado', label: 'Mercado', render: () => marketTab(team) },
    { id: 'expansion', label: 'Expansion Draft', render: () => expansionTab(team) },
    { id: 'franquia', label: 'Franquia', render: () => franchiseTab(team) },
    { id: 'historia', label: 'História', render: () => historyTab(team) },
    { id: 'picks', label: 'Picks', render: () => futureBox('Picks de draft', 'Escolhas próprias e adquiridas, proteções (Top 1/3/5/10, loteria), swaps e conversões. Os dados reais de posse de picks serão importados na Fase 3.', 3) },
  ];
  const active = parseHash().query.get('tab') ?? 'elenco';
  return h('div', { class: 'page' }, hero, tabView(tabs, { active, onChange: (tab) => setQuery({ tab: tab === 'elenco' ? null : tab, ...(tab === 'elenco' ? {} : { pos: null, status: null }) }) }));
}
