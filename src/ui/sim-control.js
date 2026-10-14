// Controle de avanço do calendário (barra superior e Central): avançar um dia, jogar o próximo jogo
// ou simular até um marco, com progresso visível e possibilidade de parar.
import { h, icon } from './dom.js';
import { date as fmtDate } from './format.js';
import { navigate } from './router.js';
import { modal, toast } from './components/feedback.js';
import { menuButton } from './components/overlay.js';
import { playerAvatar, teamLogo } from '../media/photos.js';
import { getWorld, saveWorld } from '../core/world.js';
import { checkpointForNextDay } from '../core/checkpoint-events.js';
import { SIM_TARGETS, advanceDay, beginNextSeason, seasonGames, seasonOver, simulateUntil, userGameToday } from '../season/season.js';

/** Redesenha a tela atual depois que a data muda (a rolagem é preservada pelo roteador). */
const refreshView = () => window.dispatchEvent(new Event('hashchange'));

/** Anuncia o que aconteceu durante o avanço: Expansion Draft, início e fim da temporada. */
export function announce(events) {
  const world = getWorld();
  const draft = events.find((e) => e.type === 'expansion-draft');
  if (draft) {
    const { plan } = draft;
    const mine = plan.picks.filter((p) => p.fromTeamId === world.career.teamId || p.teamId === world.career.teamId);
    modal(
      (close) => [
        h('h2', null, 'Expansion Draft realizado'),
        h('p', { class: 'muted' }, `Para a temporada começar com 32 elencos, a liga realizou o Expansion Draft em formato automático: cada franquia protegeu ${world.league.expansion.protectedPerTeam} jogadores e perdeu no máximo ${world.league.expansion.maxLostPerTeam}. Preferências de proteção e prioridade configuradas antes do evento são consideradas quando válidas.`),
        mine.length ? h('div', { class: 'note warn', style: { margin: '12px 0' } }, h('strong', null, 'Sua franquia: '), mine.map((p) => `${world.players.get(p.playerId).name} ${p.teamId === world.career.teamId ? `chega do ${world.teams.get(p.fromTeamId).name}` : `foi escolhido pelo ${world.teams.get(p.teamId).name}`}`).join(' · ')) : null,
        h(
          'div',
          { class: 'grid cols-2', style: { marginTop: '12px' } },
          plan.order.map((teamId) => {
            const team = world.teams.get(teamId);
            return h('div', { class: 'card raised' }, h('div', { class: 'row', style: { marginBottom: '8px' } }, teamLogo(team, { size: 'sm' }), h('strong', null, team.fullName)), plan.picks.filter((p) => p.teamId === teamId).map((p) => {
              const player = world.players.get(p.playerId);
              return h('a', { class: 'lineup-row', href: `#/player/${player.id}`, onclick: close }, h('span', { class: 'micro faint pos-tag' }, p.pick), playerAvatar(player, { size: 'xs', color: team.colors[0] }), h('span', { class: 'grow name' }, player.name), h('span', { class: 'muted small' }, `${player.positions[0]} · ${player.ovr} · ex-${p.fromTeamId}`));
            }));
          }),
        ),
        h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: close }, 'Continuar')),
      ],
      { wide: true },
    );
  }
  if (events.some((e) => e.type === 'season-start')) toast('Começa a temporada regular.');
  if (events.some((e) => e.type === 'season-over')) toast('Temporada regular concluída. Play-in e playoffs iniciados.');
  if (events.some((e) => e.type === 'champion')) toast('Campeão definido! Abra a offseason: aposentadorias, loteria, Draft e free agency.');
  const market = events.filter((e) => e.type === 'market');
  if (market.length) toast(`Mercado: ${market.reduce((a, e) => a + e.offers, 0)} oferta(s) recebida(s), ${market.reduce((a, e) => a + e.trades, 0)} troca(s) entre franquias da IA${market.some((e) => e.review) ? ', trades aguardando sua revisão' : ''}.`, 'info');
  if (events.some((e) => e.type === 'playoff-round')) toast('Nova fase da pós-temporada.', 'info');
}

export async function advanceOne() {
  await checkpointForNextDay(getWorld());
  const { events, played } = advanceDay();
  await saveWorld();
  announce(events);
  if (played.length && !events.length) toast(`${played.length} jogo(s) disputado(s) na liga.`);
  refreshView();
}

/** Simula até um marco, com janela de progresso e botão de parar. */
export async function runUntil(target) {
  const total = seasonGames().length;
  let stop = false;
  const label = h('strong', { class: 'num' }, fmtDate(getWorld().calendar.date));
  const fill = h('i');
  const count = h('span', { class: 'muted small num' });
  const paint = () => {
    const done = seasonGames().filter((g) => g.status === 'final').length;
    label.textContent = fmtDate(getWorld().calendar.date);
    fill.style.width = `${total ? (done / total) * 100 : 0}%`;
    count.textContent = `${done} de ${total} jogos da temporada`;
  };
  paint();
  const close = modal((c) => [h('h2', null, 'Simulando…'), h('p', { class: 'muted' }, `Até: ${SIM_TARGETS[target].label.toLowerCase()}.`), h('div', { class: 'row between', style: { margin: '14px 0 6px' } }, label, count), h('div', { class: 'progress' }, fill), h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => ((stop = true), c()) }, 'Parar'))], { onClose: () => (stop = true) });
  let result;
  try { result = await simulateUntil(target, { onDay: paint, shouldStop: () => stop, beforeDay: checkpointForNextDay }); }
  catch (err) { console.error(err); toast(`Não foi possível simular: ${err.message}`, 'error'); return; }
  finally { close(); }
  const { events, days } = result;
  announce(events);
  if (!events.length) toast(`${days} dia(s) simulado(s).`);
  refreshView();
}

/** Botão da barra superior. Com jogo do usuário hoje, a ação principal é jogar. */
export function advanceControl() {
  const world = getWorld();
  if (world.calendar.phase === 'complete') return h('span', { class: 'chip' }, 'Carreira concluída');
  if (world.calendar.phase === 'offseason') return h('div', { class: 'advance-group' },
    h('a', { class: 'btn', href: '#/playoffs' }, 'Ver campeão'),
    (world.career.completedSeasons?.length ?? 0) >= (world.career.careerLength ?? 10)
      ? h('button', { class: 'btn primary', type: 'button', onclick: async (e) => {
          const button = e.currentTarget; button.disabled = true;
          try { beginNextSeason(); await saveWorld(); toast('Limite de temporadas atingido. A carreira foi concluída.'); refreshView(); }
          catch (err) { toast(`Falha ao concluir a carreira: ${err.message}`, 'error'); button.disabled = false; }
        } }, 'Concluir carreira')
      : h('a', { class: 'btn primary', href: '#/offseason' }, 'Abrir a offseason'));
  if (seasonOver()) return h('span', { class:'chip' }, 'Temporada concluída');
  const game = userGameToday();
  const busy = async (button, fn) => {
    button.disabled = true;
    try {
      await fn();
    } catch (err) {
      console.error(err);
      toast(`Não foi possível avançar: ${err.message}`, 'error');
      button.disabled = false;
    }
  };
  const until = menuButton(
    [
      { heading: 'Simular até…' },
      ...Object.entries(SIM_TARGETS).map(([id, t]) => ({ label: t.label, onClick: () => runUntil(id) })),
      game ? 'sep' : null,
      game ? { label: 'Simular meu jogo de hoje e avançar', icon: 'forward', onClick: advanceOne, tip: 'O jogo é resolvido pelo modelo rápido, sem a quadra 2D.' } : null,
    ].filter(Boolean),
    { iconName: 'chevron', title: 'Simular até…', cls: 'btn icon' },
  );
  if (game) {
    const opp = world.teams.get(game.home === world.career.teamId ? game.away : game.home);
    return h('div', { class: 'advance-group' }, h('button', { class: 'btn primary', type: 'button', tip: 'Jogar no motor 2D  (G)', onclick: () => navigate(`/match?jogo=${game.id}`) }, icon('court'), h('span', null, `Jogar ${game.home === world.career.teamId ? 'vs' : '@'} ${opp.id}`)), until);
  }
  return h('div', { class: 'advance-group' }, h('button', { class: 'btn primary', type: 'button', tip: world.calendar.phase === 'preseason' ? 'Avança a pré-temporada em um dia.' : 'Disputa os jogos de hoje e vira a data.', onclick: (e) => busy(e.currentTarget, advanceOne) }, icon('forward'), h('span', null, 'Avançar dia')), until);
}
