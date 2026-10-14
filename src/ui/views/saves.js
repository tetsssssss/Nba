// Saves: cartões de carreira com capa da franquia, slots manuais, pontos de restauração e backup em arquivo.
import { h, icon, mount } from '../dom.js';
import { date as fmtDate, record } from '../format.js';
import { navigate } from '../router.js';
import { confirmDialog, modal, toast } from '../components/feedback.js';
import { menuButton } from '../components/overlay.js';
import { chip, emptyState, pageHeader } from '../components/widgets.js';
import { teamLogo } from '../../media/photos.js';
import { checkBackup, deleteCareer, duplicateCareer, exportCareer, importCareer, listSaves, openCareer } from '../../core/saves.js';
import { getWorld, hasWorld, saveWorld } from '../../core/world.js';
import { buildTeams, loadSeed } from '../../core/universe.js';
import { DIFFICULTY_BY_ID, ROLE_BY_ID } from '../../core/career-options.js';
import { MODE_BY_ID } from '../../core/modes.js';
import { seasonLabel } from '../../contracts/cap.js';

const SLOT = { manual: ['Save manual', 'info', 'Cópia independente criada por você.'], checkpoint: ['Ponto de restauração', 'warn', 'Cópia de segurança criada antes de um momento importante.'] };

function download(filename, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function exportBackup(save) {
  try {
    if (getWorld()?.saveId === save.id) await saveWorld();
    download(`nba-universe-${save.name.replace(/[^\w-]+/g, '_')}.json`, await exportCareer(save.id));
    toast('Backup exportado.');
  } catch (err) {
    toast(`Falha ao exportar: ${err.message}`, 'error');
  }
}

/** Save que não abre: nada é apagado. O usuário escolhe tentar de novo, exportar ou voltar. */
export function openRecovery(save, err, onBack = () => {}) {
  console.error(err);
  modal(
    (close) => [
      h('h2', null, 'Não foi possível abrir esta carreira'),
      h('p', { class: 'muted' }, `"${save.name}" continua guardada neste navegador — nada foi apagado.`),
      h('div', { class: 'note warn', style: { margin: '12px 0' } }, h('strong', null, 'Motivo: '), err?.message ?? 'erro desconhecido'),
      h('p', { class: 'muted small' }, 'Feche outras abas do jogo e tente de novo. Se o problema continuar, exporte o backup para não perder a carreira.'),
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn', onclick: () => (close(), onBack()) }, 'Voltar'),
        h('button', { class: 'btn', onclick: () => exportBackup(save) }, icon('download'), 'Exportar backup'),
        h('button', { class: 'btn primary', onclick: async () => {
          close();
          try {
            await openCareer(save.id);
            navigate('/home');
          } catch (again) {
            openRecovery(save, again, onBack);
          }
        } }, 'Tentar novamente'),
      ),
    ],
    {},
  );
}

/** Painel de saves: usado dentro e fora da carreira. */
export function savesPanel() {
  const grid = h('div', { class: 'save-grid' });
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', class: 'hidden' });
  let teams = new Map();

  function saveCard(s, openId) {
    const isOpen = s.id === openId;
    const team = teams.get(s.teamId);
    const mode = MODE_BY_ID[s.mode ?? 'universe'];
    const slot = SLOT[s.slot];
    async function open(e) {
      if (isOpen) return navigate('/home');
      e.currentTarget.disabled = true;
      try {
        await openCareer(s.id);
        navigate('/home');
      } catch (err) {
        e.currentTarget.disabled = false;
        openRecovery(s, err, refresh);
      }
    }
    async function copy(kind) {
      try {
        const made = await duplicateCareer(s.id, { kind });
        toast(kind === 'checkpoint' ? 'Ponto de restauração criado.' : `Cópia criada: "${made.name}".`);
        refresh();
      } catch (err) {
        toast(`Não foi possível copiar: ${err.message}`, 'error');
      }
    }
    async function remove() {
      const ok = await confirmDialog({ title: 'Excluir carreira?', message: `"${s.name}" será apagada definitivamente deste navegador. Exporte um backup antes se quiser guardá-la.`, confirmLabel: 'Excluir', danger: true });
      if (!ok) return;
      try {
        await deleteCareer(s.id);
        toast('Carreira excluída.');
        if (isOpen) navigate('/start');
        else refresh();
      } catch (err) {
        toast(`Falha ao excluir: ${err.message}`, 'error');
      }
    }
    return h(
      'article',
      { class: ['save-card', isOpen && 'open'], style: { '--c1': s.teamColor ?? 'var(--surface-3)', '--c2': s.teamColor2 ?? s.teamColor ?? 'var(--surface-3)' }, dataset: { team: s.teamId } },
      h('div', { class: 'save-cover' }, team ? teamLogo(team, { size: 'lg' }) : null, h('div', { class: 'save-season' }, h('span', { class: 'micro' }, 'Temporada'), h('strong', null, seasonLabel(s.season)), s.record ? h('span', { class: 'num' }, record(s.record)) : null)),
      h(
        'div',
        { class: 'save-body' },
        h('div', { class: 'row wrap', style: { gap: '6px' } }, isOpen ? chip('Aberta', 'good') : null, slot ? chip(slot[0], slot[1], slot[2]) : chip('Carreira', '', 'Save principal: é o que o autosave atualiza.'), chip(mode.label, '', mode.tagline), s.godMode && mode.id !== 'commissioner' ? chip('God Mode', 'warn') : null),
        h('h3', { class: 'save-name' }, s.name),
        h('p', { class: 'muted small' }, `${s.teamName} · ${ROLE_BY_ID[s.role]?.label ?? s.role} ${s.managerName}`),
        h('dl', { class: 'save-facts' }, h('dt', null, 'No universo'), h('dd', null, fmtDate(s.date)), h('dt', null, 'Dificuldade'), h('dd', null, DIFFICULTY_BY_ID[s.difficulty]?.label ?? '—'), h('dt', null, 'Último acesso'), h('dd', null, new Date(s.updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }))),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn primary grow', onclick: open }, isOpen ? 'Voltar à carreira' : 'Continuar'),
          menuButton([
            { label: 'Salvar cópia em novo slot', icon: 'copy', onClick: () => copy('manual'), tip: 'Cria um save independente a partir deste.' },
            { label: 'Criar ponto de restauração', icon: 'history', onClick: () => copy('checkpoint'), tip: 'Cópia de segurança; o jogo guarda as 3 mais recentes.' },
            { label: 'Exportar backup (.json)', icon: 'download', onClick: () => exportBackup(s) },
            'sep',
            { label: 'Excluir', icon: 'trash', danger: true, onClick: remove },
          ]),
        ),
      ),
    );
  }

  async function refresh() {
    const [saves, seed] = await Promise.all([listSaves(), loadSeed().catch(() => null)]);
    if (seed) teams = new Map(buildTeams(seed).map((t) => [t.id, t]));
    const openId = getWorld()?.saveId;
    mount(grid, saves.length ? saves.map((s) => saveCard(s, openId)) : h('div', { class: 'card', style: { gridColumn: '1 / -1' } }, emptyState('Nenhuma carreira salva', 'Cada carreira é um universo independente guardado neste navegador. Crie a primeira ou importe um backup.', h('a', { class: 'btn primary', href: '#/new' }, 'Nova carreira'))));
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    let payload;
    try {
      payload = JSON.parse(await file.text());
    } catch {
      return toast('O arquivo escolhido não é um JSON válido. Escolha um backup exportado pelo jogo (.json).', 'error');
    }
    const check = checkBackup(payload);
    if (!check.ok) {
      return modal((close) => [
        h('h2', null, 'Este backup não pode ser importado'),
        h('p', { class: 'muted' }, `Arquivo: ${file.name}`),
        h('ul', { class: 'problem-list' }, check.errors.map((e) => h('li', null, e))),
        h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: close }, 'Entendi')),
      ]);
    }
    try {
      const summary = await importCareer(payload);
      toast(`Importado como "${summary.name}".${summary.warnings.length ? ` ${summary.warnings.length} aviso(s): ${summary.warnings[0]}` : ''}`, summary.warnings.length ? 'warn' : '');
      refresh();
    } catch (err) {
      toast(`Importação falhou: ${err.message}`, 'error');
    }
  });

  refresh();
  return {
    el: h('div', { class: 'stack' }, grid, fileInput),
    importBackup: () => fileInput.click(),
    refresh,
  };
}

export function savesView() {
  const panel = savesPanel();
  const inCareer = hasWorld();
  return h(
    'div',
    { class: 'page' },
    pageHeader('Saves', {
      sub: 'Cada carreira é um universo independente, guardado neste navegador. O autosave atualiza a carreira aberta; cópias manuais e pontos de restauração ficam em slots próprios.',
      actions: [
        h('button', { class: 'btn', onclick: panel.importBackup, tip: 'Carrega um arquivo .json exportado pelo jogo como uma nova carreira.' }, icon('upload'), 'Importar backup'),
        inCareer ? h('button', { class: 'btn', onclick: async () => (await saveWorld(), toast('Carreira salva.'), panel.refresh()) }, icon('save'), 'Salvar agora') : null,
        h('a', { class: 'btn primary', href: '#/new' }, icon('plus'), 'Nova carreira'),
      ],
    }),
    panel.el,
  );
}
