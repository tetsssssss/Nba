// Dev Tools: auditorias e ferramentas internas para acelerar o desenvolvimento.
import { h, mount } from '../dom.js';
import { addDays, date as fmtDate } from '../format.js';
import { card, chip, futureBox } from '../components/widgets.js';
import { confirmDialog, toast } from '../components/feedback.js';
import { normalizeSearch } from '../search.js';
import { auditPlayerImages, getPhotoManifest, playerAvatar } from '../../media/photos.js';
import { addNews, getWorld, markDirty, movePlayer, refreshPlayer, setCalendarDate } from '../../core/world.js';
import { deleteCareer, listSaves } from '../../core/saves.js';
import { resetSettings } from '../../core/settings.js';
import { ATTRIBUTES } from '../../players/attributes.js';
import { auditWorld } from '../../dev/audit.js';
import { runDbSelfTest } from '../../dev/selftest.js';

const checkList = (checks) =>
  h(
    'div',
    { class: 'list' },
    checks.map((c) => h('div', { class: 'item', style: { padding: '7px 0', alignItems: 'flex-start' } }, chip(c.ok ? 'OK' : c.level === 'warn' ? 'Atenção' : 'Falhou', c.ok ? 'good' : c.level === 'warn' ? 'warn' : 'bad'), h('div', { class: 'grow' }, h('div', null, c.name), c.detail ? h('div', { class: 'muted', style: { fontSize: '12px' } }, c.detail) : null))),
  );

/** Campo de busca que resolve para um jogador do universo. */
function playerPicker(onPick) {
  const world = getWorld();
  const select = h('select', { style: { minWidth: '260px' } }, h('option', { value: '' }, 'Digite para buscar…'));
  const input = h('input', {
    type: 'search',
    placeholder: 'Nome do jogador',
    oninput: () => {
      const q = normalizeSearch(input.value);
      const hits = q.length < 2 ? [] : [...world.players.values()].filter((p) => normalizeSearch(p.name).includes(q)).sort((a, b) => b.ovr - a.ovr).slice(0, 25);
      mount(select, hits.length ? hits.map((p) => h('option', { value: p.id }, `${p.name} — ${p.teamId} · ${p.positions[0]} · ${p.ovr}`)) : h('option', { value: '' }, q.length < 2 ? 'Digite para buscar…' : 'Nenhum jogador'));
      onPick(hits[0] ?? null);
    },
  });
  select.addEventListener('change', () => onPick(world.players.get(Number(select.value)) ?? null));
  return h('div', { class: 'row wrap' }, input, select);
}

function integritySection() {
  const out = h('div', null);
  const run = () => {
    const checks = auditWorld(getWorld());
    const failed = checks.filter((c) => !c.ok && c.level === 'error').length;
    const warned = checks.filter((c) => !c.ok && c.level === 'warn').length;
    mount(out, h('p', { class: failed ? 'bad' : 'good', style: { marginBottom: '8px', fontWeight: 600 } }, failed ? `${failed} verificação(ões) reprovada(s).` : `Universo íntegro: ${checks.length - warned} verificações OK, ${warned} ponto(s) de atenção.`), checkList(checks));
  };
  run();
  return card('Integridade do universo', out, { more: h('button', { class: 'btn small', onclick: run }, 'Verificar de novo') });
}

function photoSection() {
  const world = getWorld();
  const manifest = getPhotoManifest();
  const s = manifest.summary;
  const out = h('div', { class: 'stack', style: { gap: '10px' } });
  const button = h(
    'button',
    {
      class: 'btn small',
      onclick: async () => {
        button.disabled = true;
        const progress = h('p', { class: 'muted' }, 'Carregando fotos…');
        mount(out, progress);
        const result = await auditPlayerImages([...world.players.values()], { onProgress: (r) => (progress.textContent = `Verificadas ${r.checked} de ${r.total}…`) });
        mount(out, 
          h('p', { class: result.placeholder.length ? 'warn' : 'good', style: { fontWeight: 600 } }, `${result.total - result.placeholder.length} de ${result.total} jogadores com fotografia carregada (NBA: ${result.nba}, ESPN: ${result.espn}, local: ${result.local}).`),
          result.placeholder.length
            ? h('div', null, h('p', { class: 'muted', style: { marginBottom: '6px' } }, `${result.placeholder.length} com placeholder neutro:`), h('div', { class: 'row wrap' }, result.placeholder.map((p) => h('a', { class: 'chip', href: `#/player/${p.id}` }, `${p.name} · ${p.teamId}`))))
            : null,
        );
        button.disabled = false;
      },
    },
    'Auditar carregando as imagens',
  );
  return card(
    'Fotos',
    h(
      'div',
      { class: 'stack', style: { gap: '10px' } },
      s
        ? h('p', null, `Manifesto de ${manifest.generatedAt?.slice(0, 10)}: `, h('strong', null, `${s.total - s.none} de ${s.total}`), ` jogadores com fotografia real (NBA: ${s.nba}, ESPN: ${s.espn}); ${s.none} usam placeholder.`)
        : h('div', { class: 'note warn' }, 'Manifesto de fotos ausente. Rode "npm run photos:audit" para gerá-lo.'),
      h('div', { class: 'row wrap' }, [...world.players.values()].sort((a, b) => b.ovr - a.ovr).slice(0, 14).map((p) => h('a', { href: `#/player/${p.id}`, tip: p.name }, playerAvatar(p, { size: 'md' })))),
      h('p', { class: 'muted', style: { fontSize: '12.5px' } }, 'Toda imagem passa pelo resolver central (src/media/photos.js): arquivo local → CDN da NBA → ESPN → placeholder neutro. Nenhuma tela monta URL de foto.'),
      out,
    ),
    { more: button },
  );
}

function seedSection() {
  const out = h('div', { class: 'muted' }, 'Carregando relatório…');
  fetch('data/seed/validation.json')
    .then((r) => r.json())
    .then((v) => {
      const label = { error: 'Erros', warn: 'Avisos', info: 'Informações' };
      let level = v.counts.error ? 'error' : v.counts.warn ? 'warn' : 'info';
      const listBox = h('pre', { class: 'log' });
      const buttons = h('div', { class: 'row' });
      const show = () => {
        mount(buttons, Object.keys(label).map((k) => h('button', { class: ['btn small', level === k && 'primary'], onclick: () => ((level = k), show()) }, `${label[k]} (${v.counts[k]})`)));
        const groups = new Map();
        for (const i of v.issues.filter((x) => x.level === level)) groups.set(i.code, [...(groups.get(i.code) ?? []), i.message]);
        listBox.textContent = [...groups.entries()].map(([code, msgs]) => `[${code}] ${msgs.length}\n${msgs.map((m) => `  • ${m}`).join('\n')}`).join('\n\n') || 'Nada neste nível.';
      };
      show();
      mount(out, h('div', { class: 'stack', style: { gap: '10px' } }, h('p', null, `Seed gerado em ${new Date(v.generatedAt).toLocaleString('pt-BR')}.`), buttons, listBox));
      out.className = '';
    })
    .catch((err) => (out.textContent = `Relatório indisponível: ${err.message}`));
  return card('Validação dos dados reais (seed)', out);
}

function toolsSection(rerender) {
  const world = getWorld();
  let attrPlayer = null;
  let movePlayerTarget = null;
  let injuryPlayer = null;
  const attrSelect = h('select', null, ATTRIBUTES.map((a) => h('option', { value: a.key }, a.label)));
  const attrValue = h('input', { type: 'number', min: 0, max: 100, value: 80, style: { width: '80px' } });
  const teamSelect = h('select', null, [...world.teams.values()].sort((a, b) => a.fullName.localeCompare(b.fullName)).map((t) => h('option', { value: t.id }, t.fullName)));
  const injurySelect = h('select', null, h('option', { value: 'Out' }, 'Fora (Out)'), h('option', { value: 'Day-To-Day' }, 'Dúvida (Day-To-Day)'), h('option', { value: '' }, 'Curar'));
  const dateLabel = h('strong', null, fmtDate(world.calendar.date));
  const advance = (days) => {
    setCalendarDate(addDays(world.calendar.date, days));
    dateLabel.textContent = fmtDate(world.calendar.date);
    toast(`Data avançada para ${fmtDate(world.calendar.date)}. (Ainda sem simulação de jogos — Fase 4.)`);
  };
  const tool = (title, ...content) => h('div', { class: 'stack', style: { gap: '8px', padding: '12px 0', borderBottom: '1px solid var(--border-soft)' } }, h('strong', null, title), ...content);

  return card(
    'Ferramentas',
    h(
      'div',
      null,
      h('div', { class: 'note warn' }, 'Estas ferramentas alteram o universo diretamente e ficam registradas como movimentações de desenvolvimento.'),
      tool('Avançar data', h('div', { class: 'row wrap' }, h('span', { class: 'muted' }, 'Hoje:'), dateLabel, h('button', { class: 'btn small', onclick: () => advance(1) }, '+1 dia'), h('button', { class: 'btn small', onclick: () => advance(7) }, '+7 dias'), h('button', { class: 'btn small', onclick: () => advance(30) }, '+30 dias'))),
      tool(
        'Alterar atributo',
        playerPicker((p) => {
          attrPlayer = p;
          if (p) attrValue.value = p.attributes[attrSelect.value];
        }),
        h(
          'div',
          { class: 'row wrap' },
          attrSelect,
          attrValue,
          h(
            'button',
            {
              class: 'btn small primary',
              onclick: () => {
                if (!attrPlayer) return toast('Escolha um jogador.', 'warn');
                const value = Math.max(0, Math.min(100, Math.round(Number(attrValue.value))));
                if (!Number.isFinite(value)) return toast('Valor inválido.', 'warn');
                const before = attrPlayer.ovr;
                attrPlayer.attributes = { ...attrPlayer.attributes, [attrSelect.value]: value };
                refreshPlayer(attrPlayer);
                toast(`${attrPlayer.name}: ${attrSelect.selectedOptions[0].textContent} = ${value}. Overall ${before} → ${attrPlayer.ovr}.`);
              },
            },
            'Aplicar',
          ),
        ),
      ),
      tool(
        'Transferir jogador',
        playerPicker((p) => (movePlayerTarget = p)),
        h(
          'div',
          { class: 'row wrap' },
          h('span', { class: 'muted' }, 'para'),
          teamSelect,
          h(
            'button',
            {
              class: 'btn small primary',
              onclick: () => {
                if (!movePlayerTarget) return toast('Escolha um jogador.', 'warn');
                if (movePlayerTarget.teamId === teamSelect.value) return toast('O jogador já está nessa franquia.', 'warn');
                const from = world.teams.get(movePlayerTarget.teamId);
                const to = world.teams.get(teamSelect.value);
                movePlayer(movePlayerTarget, to.id, { type: 'dev-transfer', note: 'Transferência via Dev Tools' });
                addNews({ category: 'trade', title: `${movePlayerTarget.name} agora é do ${to.name}`, body: `Movimentação administrativa: ${movePlayerTarget.name} deixa o ${from?.name ?? 'mercado'} e passa a integrar o elenco do ${to.fullName}.`, teamIds: [from?.id, to.id].filter(Boolean), playerIds: [movePlayerTarget.id] });
                toast(`${movePlayerTarget.name}: ${from?.id ?? '—'} → ${to.id}.`);
                rerender();
              },
            },
            'Transferir',
          ),
        ),
      ),
      tool(
        'Forçar ou curar lesão',
        playerPicker((p) => (injuryPlayer = p)),
        h(
          'div',
          { class: 'row wrap' },
          injurySelect,
          h(
            'button',
            {
              class: 'btn small primary',
              onclick: () => {
                if (!injuryPlayer) return toast('Escolha um jogador.', 'warn');
                injuryPlayer.injury = injurySelect.value ? { status: injurySelect.value, since: world.calendar.date, forced: true } : null;
                markDirty('players', injuryPlayer.id);
                toast(injurySelect.value ? `${injuryPlayer.name} marcado como ${injurySelect.value}.` : `${injuryPlayer.name} liberado pelo departamento médico.`);
              },
            },
            'Aplicar',
          ),
        ),
      ),
      h('div', { class: 'stack', style: { gap: '8px', paddingTop: '12px' } }, h('strong', null, 'Ainda não disponíveis'), h('div', { class: 'row wrap' }, [['Gerar trade', 2], ['Testar Free Agency', 3], ['Testar Draft', 3], ['Editar standings', 4]].map(([label, phase]) => chip(`${label} · Fase ${phase}`, 'future')))),
    ),
  );
}

function selfTestSection() {
  const out = h('div', { class: 'muted' }, 'Cria um banco temporário, grava, lê, pagina, reabre e apaga.');
  return card(
    'Autoteste do banco (IndexedDB)',
    out,
    {
      more: h(
        'button',
        {
          class: 'btn small',
          onclick: async (e) => {
            const button = e.currentTarget;
            button.disabled = true;
            const results = await runDbSelfTest();
            out.className = '';
            mount(out, checkList(results.map((r) => ({ ...r, level: 'error' }))));
            button.disabled = false;
          },
        },
        'Executar',
      ),
    },
  );
}

function resetSection() {
  return card(
    'Resetar sistemas',
    h(
      'div',
      { class: 'row wrap' },
      h(
        'button',
        {
          class: 'btn',
          onclick: () => {
            resetSettings();
            toast('Configurações restauradas para o padrão.');
          },
        },
        'Restaurar configurações',
      ),
      h(
        'button',
        {
          class: 'btn danger',
          onclick: async () => {
            const saves = await listSaves();
            const ok = await confirmDialog({ title: 'Apagar todas as carreiras?', message: `${saves.length} carreira(s) serão excluídas definitivamente deste navegador, incluindo a que está aberta.`, confirmLabel: 'Apagar tudo', danger: true });
            if (!ok) return;
            for (const s of saves) await deleteCareer(s.id);
            toast('Todas as carreiras foram apagadas.');
            location.hash = '#/start';
          },
        },
        'Apagar todas as carreiras',
      ),
    ),
  );
}

export function devToolsView() {
  const root = h('div', { class: 'page' });
  const render = () => {
    mount(root, 
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Dev Tools'), h('p', { class: 'sub' }, 'Auditorias obrigatórias antes de cada entrega e ferramentas para testar sistemas.'))),
      h('div', { class: 'grid cols-2' }, h('div', { class: 'stack' }, integritySection(), photoSection(), selfTestSection()), h('div', { class: 'stack' }, toolsSection(render), seedSection(), resetSection())),
      h('div', { style: { marginTop: '16px' } }, futureBox('Mais ferramentas', 'Geração de trades, testes de Draft e Free Agency, edição de classificação e reinício de sistemas individuais entram junto com cada módulo.', '2-4')),
    );
  };
  render();
  return root;
}
