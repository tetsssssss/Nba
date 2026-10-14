// Perfil completo de jogador.
import { h } from '../dom.js';
import { date as fmtDate, height, length, money, number, pct, tier, weight } from '../format.js';
import { parseHash, setQuery } from '../router.js';
import { attrRow, bar, bigStat, card, chip, emptyState, favStar, futureBox, injuryChip, ovrBadge, posLabel, ratingRow, stat, statusBadge, teamCell, tendencyRow, tierLabel } from '../components/widgets.js';
import { tabView } from '../components/feedback.js';
import { menuButton } from '../components/overlay.js';
import { potentialText } from '../components/player-quick.js';
import { playerPortrait } from '../../media/photos.js';
import { COL, lastSeasonLine } from '../../players/statline.js';
import { seasonLine } from '../../season/season.js';
import { careerStatsOf, getWorld, playerAge, recentTransactions } from '../../core/world.js';
import { CONTRACT_TYPE_LABEL, contractSummary, seasonLabel } from '../../contracts/cap.js';
import { ATTRIBUTE_BY_KEY, ATTRIBUTE_GROUPS, POSITIONS, POSITION_LABELS } from '../../players/attributes.js';
import { allPositionOveralls } from '../../players/overall.js';
import { careerStage, potentialEstimate } from '../../players/potential.js';
import { TENDENCY_GROUPS } from '../../players/tendencies.js';
import { playerFingerprint, fingerprintSummary, seasonPerformanceSeries } from '../experience-insights.js';
import { fingerprintRadar, multiLineChart } from '../components/visuals.js';

const CONFIDENCE = {
  high: ['Amostra ampla', 'good', 'Mais de 1.500 minutos ponderados nas duas últimas temporadas.'],
  medium: ['Amostra razoável', 'info', 'Entre 500 e 1.500 minutos ponderados.'],
  low: ['Amostra pequena', 'warn', 'Menos de 500 minutos: atributos puxados para a média da posição.'],
  none: ['Sem amostra NBA', 'warn', 'Novato ou estreante: perfil estimado por posição, combine e posição no draft.'],
};
const SOURCE_LABEL = { hoopshype: 'HoopsHype', espn: 'ESPN', estimated: 'Estimativa do jogo' };

const groupAverage = (player, group) => Math.round(group.attributes.reduce((a, x) => a + player.attributes[x.key], 0) / group.attributes.length);

function overviewTab(player, ctx) {
  const { world, age, contract } = ctx;
  const all = allPositionOveralls(player.attributes);
  // forças e fraquezas: atributos de jogo (os de personalidade ficam em Desenvolvimento)
  const ranked = Object.entries(player.attributes).filter(([k]) => ATTRIBUTE_BY_KEY[k].group !== 'mental' || ['offensiveIQ', 'clutch', 'consistency'].includes(k)).sort((a, b) => b[1] - a[1]);
  const summary = contractSummary(contract, world.calendar.season);
  const fingerprint = playerFingerprint(player);
  const signature = fingerprintSummary(fingerprint);
  const style = TENDENCY_GROUPS.flatMap((g) => g.tendencies).map((t) => [t, player.tendencies[t.key]]).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return h(
    'div',
    { class: 'stack evo-player-overview' },
    card('DNA esportivo', h('div', { class: 'evo-profile-panel' },
      h('div', { class: 'evo-profile-chart' }, fingerprintRadar(fingerprint) ?? h('p', { class: 'muted' }, 'Dados insuficientes para o gráfico.')),
      h('div', { class: 'evo-profile-key' },
        h('span', { class: 'evo-kicker' }, 'RAIO-X TÉCNICO'),
        h('h3', null, signature.best?.label ?? 'Perfil em formação'),
        h('p', { class: 'muted small' }, 'Os eixos representam as médias dos atributos disponíveis, não uma previsão de desempenho.'),
        ...fingerprint.map((g) => h('div', { class: 'evo-trait' },
          h('span', null, g.label), h('strong', null, g.value == null ? '—' : Math.round(g.value)),
          h('span', { class: 'evo-trait-track' }, h('i', { style: { width: `${g.value ?? 0}%` } }))))))),
    h('div', { class: 'grid cols-3' },
    h(
      'div',
      { class: 'stack' },
      card('5 maiores forças', h('div', null, ranked.slice(0, 5).map(([k, v]) => ratingRow(ATTRIBUTE_BY_KEY[k].label, v, ATTRIBUTE_BY_KEY[k].tip))), { more: h('a', { class: 'more', href: `#/player/${player.id}?tab=atributos` }, 'Todos os atributos →') }),
      card('5 maiores fraquezas', h('div', null, ranked.slice(-5).reverse().map(([k, v]) => ratingRow(ATTRIBUTE_BY_KEY[k].label, v, ATTRIBUTE_BY_KEY[k].tip)))),
    ),
    h(
      'div',
      { class: 'stack' },
      card(
        'Overall por posição',
        h(
          'div',
          { class: 'stack', style: { gap: '12px' } },
          h('div', { class: 'pos-ovr' }, POSITIONS.map((pos) => h('div', { class: ['pos-ovr-cell', player.positions.includes(pos) && 'natural'], tip: `${POSITION_LABELS[pos]}${player.positions.includes(pos) ? ' — posição natural' : ' — improvisado'}` }, ovrBadge(all[pos]), h('span', { class: 'micro' }, pos)))),
          h('div', null, ATTRIBUTE_GROUPS.map((g) => ratingRow(g.label, groupAverage(player, g)))),
          h('div', { class: 'row wrap' }, chip(...CONFIDENCE[player.ratingConfidence]), h('span', { class: 'faint small' }, 'Confiabilidade da avaliação')),
        ),
      ),
      card('Como ele joga', h('div', null, style.map(([t, v]) => tendencyRow(t.label, v, t.tip))), { more: h('a', { class: 'more', href: `#/player/${player.id}?tab=tendencias` }, 'Todas as tendências →') }),
    ),
    h(
      'div',
      { class: 'stack' },
      card(
        'Contrato',
        summary?.endSeason
          ? h('div', { class: 'bigstat-row' }, bigStat(money(summary.salary), seasonLabel(world.calendar.season)), bigStat(summary.yearsLeft, summary.yearsLeft === 1 ? 'ano restante' : 'anos restantes'), bigStat(money(summary.total), 'total'))
          : emptyState('Sem contrato', 'Este jogador não tem vínculo ativo.'),
        { more: summary?.endSeason ? h('a', { class: 'more', href: `#/player/${player.id}?tab=contrato` }, 'Ano a ano →') : null },
      ),
      card(
        'Ficha',
        h(
          'dl',
          { class: 'facts' },
          h('dt', null, 'Nascimento'), h('dd', null, player.birthDate ? fmtDate(player.birthDate) : '—', player.birthPlace ? h('span', { class: 'faint' }, ` · ${player.birthPlace}`) : null),
          h('dt', null, 'País'), h('dd', null, player.country ?? '—'),
          h('dt', null, 'Formação'), h('dd', null, player.college || '—'),
          h('dt', null, 'Draft'), h('dd', null, player.draft ? `${player.draft.year} · ${player.draft.round}ª rodada, pick ${player.draft.pick}${player.draft.team ? ` (${player.draft.team})` : ''}` : 'Não draftado'),
          h('dt', null, 'Fase da carreira'), h('dd', null, careerStage(age).label),
        ),
      ),
      player.injury ? card('Saúde', h('div', { class: 'row' }, injuryChip(player.injury), h('span', { class: 'muted' }, `Status na fonte oficial desde ${fmtDate(player.injury.since)}.`))) : null,
      futureBox('Moral e últimos jogos', 'O humor do jogador e o desempenho recente aparecem aqui quando a temporada for simulada.', 4),
    ),
    ),
  );
}

function attributesTab(player) {
  return h(
    'div',
    { class: 'stack' },
    h('div', { class: 'tier-legend', 'aria-label': 'Faixas de avaliação' }, h('span', { class: 'val t-elite' }, 'Elite 90+'), h('span', { class: 'val t-great' }, 'Excelente 80–89'), h('span', { class: 'val t-good' }, 'Bom 70–79'), h('span', null, 'Regular 60–69'), h('span', { class: 'faint' }, 'Fraco abaixo de 60')),
    h(
      'div',
      { class: 'grid cols-5 attr-grid' },
      ATTRIBUTE_GROUPS.map((g) =>
        card(g.label, h('div', null, g.attributes.map((a) => ratingRow(a.label, player.attributes[a.key], a.tip))), { more: h('span', { class: ['ovr', tier(groupAverage(player, g))], tip: `Média do grupo — ${tierLabel(groupAverage(player, g))}` }, groupAverage(player, g)) }),
      ),
    ),
    h('p', { class: 'faint small' }, 'Não existe um Overall universal: cada posição pesa os atributos de um jeito. Ética de trabalho, liderança, competitividade e resistência física não entram no Overall.'),
  );
}

function statsTab(player, { world, career }) {
  if (!career?.rows.length) return card(null, emptyState(player.rookie ? 'Novato' : 'Sem estatísticas', player.rookie ? 'Ainda não disputou jogos na NBA. As estatísticas aparecem aqui quando a temporada for simulada.' : 'As fontes consultadas não trazem a carreira deste jogador.'));
  const rows = [...career.rows].sort((a, b) => b[COL.season] - a[COL.season]);
  const adv = career.advanced;
  const trend = seasonPerformanceSeries(career);
  const th = (label, tip) => h('th', { class: 'num', tip }, label);
  const table = h(
    'table',
    { class: 'data' },
    h('thead', null, h('tr', null, h('th', null, 'Temporada'), h('th', null, 'Time'), th('J'), th('Tit', 'Jogos como titular'), th('MIN'), th('PTS'), th('REB'), th('AST'), th('ROB'), th('TOC'), th('ERR', 'Desperdícios'), th('FG%'), th('3P%'), th('LL%'))),
    h(
      'tbody',
      null,
      rows.map((r) =>
        h(
          'tr',
          null,
          h('td', null, seasonLabel(r[COL.season])),
          h('td', null, r[COL.team] ? teamCell(world.teams.get(r[COL.team]), { size: 'xs', full: false }) : h('span', { class: 'muted' }, '—')),
          [r[COL.gp], r[COL.gs]].map((v) => h('td', { class: 'num' }, v)),
          [r[COL.min], r[COL.pts], r[COL.orb] + r[COL.drb], r[COL.ast], r[COL.stl], r[COL.blk], r[COL.tov]].map((v) => h('td', { class: 'num' }, number(v))),
          h('td', { class: 'num' }, pct(r[COL.fgm], r[COL.fga])),
          h('td', { class: 'num' }, pct(r[COL.tpm], r[COL.tpa])),
          h('td', { class: 'num' }, pct(r[COL.ftm], r[COL.fta])),
        ),
      ),
    ),
  );
  return h(
    'div',
    { class: 'stack' },
    trend.length ? card('Evolução histórica', h('div', { class: 'evo-trend-panel' },
      multiLineChart(trend, [
        { key: 'pts', label: 'Pontos', color: 'var(--evo-chart-primary)' },
        { key: 'reb', label: 'Rebotes', color: 'var(--evo-chart-secondary)' },
        { key: 'ast', label: 'Assistências', color: 'var(--evo-chart-third)' },
      ]),
      h('div', { class: 'evo-trend-legend' }, h('span', { class: 'pts' }, 'Pontos'), h('span', { class: 'reb' }, 'Rebotes'), h('span', { class: 'ast' }, 'Assistências')),
      h('p', { class: 'muted small' }, 'Médias por jogo em temporadas registradas; movimentações entre franquias são consolidadas no mesmo ano.'))) : null,
    adv
      ? h(
          'div',
          { class: 'grid cols-2' },
          card(
            'Avançadas — 2025-26',
            h(
              'div',
              { class: 'stats-row' },
              stat('USG%', number(adv.usg), 'uso de posses'), stat('TS%', number(adv.ts), 'eficiência real'), stat('AST%', number(adv.astPct)), stat('REB%', number(adv.rebPct)),
              stat('PIE', number(adv.pie), 'impacto'), stat('Net Rtg', number(adv.netRtg), 'com ele em quadra'),
            ),
          ),
          card(
            'Perfil de arremesso — 2025-26',
            h(
              'div',
              null,
              [['No aro', adv.shotProfile.rim], ['Garrafão (fora do aro)', adv.shotProfile.paint], ['Meia distância', adv.shotProfile.mid], ['Três pontos', adv.shotProfile.three]].map(([label, v]) =>
                h('div', { class: 'attr-row' }, h('span', null, label), h('span', { class: 'val' }, `${v ?? 0}%`), h('div', { class: 'bar' }, h('i', { style: { width: `${v ?? 0}%`, background: 'var(--team)' } }))),
              ),
            ),
          ),
        )
      : null,
    card('Carreira — temporada regular (médias por jogo)', h('div', { class: 'table-wrap' }, table), { flush: true }),
    h('p', { class: 'faint', style: { fontSize: '12px' } }, 'Fontes: ESPN (carreira) e stats.nba.com (avançadas). As estatísticas do universo simulado passam a ser registradas aqui a partir da Fase 4.'),
  );
}

function contractTab(player, { world, contract }) {
  if (!contract) return card(null, emptyState('Sem contrato', 'Este jogador não tem vínculo ativo com nenhuma franquia.'));
  const season = world.calendar.season;
  const summary = contractSummary(contract, season);
  return h(
    'div',
    { class: 'grid cols-2' },
    card(
      'Ano a ano',
      h(
        'table',
        { class: 'data' },
        h('thead', null, h('tr', null, h('th', null, 'Temporada'), h('th', { class: 'num' }, 'Salário'), h('th', { class: 'num', tip: 'Parcela do salary cap atual.' }, '% do cap'), h('th', null, 'Condição'))),
        h(
          'tbody',
          null,
          contract.years.map((y) =>
            h(
              'tr',
              null,
              h('td', null, seasonLabel(y.season), y.season === season ? h('span', { class: 'chip', style: { marginLeft: '8px' } }, 'atual') : null),
              h('td', { class: 'num' }, money(y.salary, { compact: false })),
              h('td', { class: 'num muted' }, `${((y.salary / world.league.cap.salaryCap) * 100).toFixed(1)}%`),
              h('td', null, y.option === 'player' ? chip('Player option', 'info', 'O jogador decide se cumpre este ano.') : y.option === 'team' ? chip('Team option', 'info', 'A franquia decide se mantém este ano.') : y.estimated ? chip('Estimado', 'warn') : h('span', { class: 'muted' }, 'Garantido')),
            ),
          ),
          contract.qualifyingOffer ? h('tr', null, h('td', null, seasonLabel(contract.qualifyingOffer.season)), h('td', { class: 'num muted' }, money(contract.qualifyingOffer.amount, { compact: false })), h('td'), h('td', null, chip('Qualifying offer', '', 'Se a franquia fizer a oferta, o jogador vira agente livre restrito.'))) : null,
        ),
        h('tfoot', null, h('tr', null, h('td', null, 'Restante'), h('td', { class: 'num' }, money(summary.total, { compact: false })), h('td'), h('td', null, `${summary.yearsLeft} ano(s)`))),
      ),
      { flush: true },
    ),
    h(
      'div',
      { class: 'stack' },
      card(
        'Detalhes',
        h(
          'dl',
          { class: 'facts' },
          h('dt', null, 'Tipo'), h('dd', null, CONTRACT_TYPE_LABEL[contract.type] ?? contract.type),
          h('dt', null, 'Franquia'), h('dd', null, teamCell(world.teams.get(contract.teamId), { size: 'xs' })),
          h('dt', null, 'Temporadas seguidas no time'), h('dd', { tip: 'Base para os Bird Rights (3 = Bird completo, 2 = Early Bird, 1 = Non-Bird).' }, contract.yearsWithTeam ?? 0),
          h('dt', null, 'Fonte'), h('dd', null, SOURCE_LABEL[contract.source] ?? contract.source, contract.sourceUpdated ? h('span', { class: 'faint' }, ` · atualizado em ${fmtDate(contract.sourceUpdated)}`) : null),
        ),
      ),
      contract.sourceNote ? h('div', { class: 'note warn' }, contract.sourceNote) : null,
      futureBox('Negociação', 'Renovações, extensões, incentivos, cláusulas e conversas com o agente.', 2),
    ),
  );
}

function developmentTab(player, { world, age }) {
  const est = potentialEstimate(player, age);
  const stage = careerStage(age);
  return h(
    'div',
    { class: 'grid cols-2' },
    card(
      'Projeção',
      h(
        'div',
        { class: 'stack', style: { gap: '14px' } },
        h('div', { class: 'stats-row' }, stat('Overall atual', player.ovr), stat('Potencial estimado', potentialText(player, age, world.career.godMode)), stat('Fase', stage.label, age != null ? `${age} anos` : null)),
        h('div', null, h('div', { class: 'row between', style: { marginBottom: '6px' } }, h('span', { class: 'muted' }, 'Espaço para evoluir'), h('span', { class: 'num' }, `+${Math.max(0, est.low - player.ovr)} a +${Math.max(0, est.high - player.ovr)}`)), bar(Math.min(100, ((est.high - player.ovr) / 20) * 100), { thick: true })),
        h('p', { class: 'muted', style: { fontSize: '12.5px' } }, 'O potencial é dinâmico: sobe ou cai conforme idade, minutos, treino, lesões, técnico, papel no time e ambiente. Um prospect mediano pode superar a projeção; uma grande promessa pode fracassar.'),
      ),
    ),
    h(
      'div',
      { class: 'stack' },
      card('Fatores pessoais', h('div', null, attrRow('Ética de trabalho', player.attributes.workEthic, ATTRIBUTE_BY_KEY.workEthic.tip), attrRow('Consistência', player.attributes.consistency), attrRow('Concentração', player.attributes.focus), attrRow('Resistência física', player.attributes.durability))),
      futureBox('Treinamento e evolução', 'Treino individual e coletivo com objetivos, mentoria de veteranos, aprendizado de novas habilidades e regressão por idade.', 6),
    ),
  );
}

function healthTab(player, { career }) {
  const bySeason = new Map();
  for (const r of career?.rows ?? []) bySeason.set(r[COL.season], (bySeason.get(r[COL.season]) ?? 0) + r[COL.gp]);
  const seasons = [...bySeason.entries()].sort((a, b) => b[0] - a[0]).slice(0, 6);
  return h(
    'div',
    { class: 'grid cols-2' },
    h(
      'div',
      { class: 'stack' },
      card(
        'Situação atual',
        player.injury
          ? h('div', { class: 'stack', style: { gap: '8px' } }, h('div', { class: 'row' }, injuryChip(player.injury), h('strong', null, player.injury.status === 'Out' ? 'Fora de combate' : 'Dúvida para os próximos jogos')), h('p', { class: 'muted' }, `Status informado pela fonte oficial em ${fmtDate(player.injury.since)}. Tipo, região e prazo de retorno serão detalhados pelo sistema médico.`))
          : h('p', { class: 'good' }, 'Disponível — sem lesão registrada.'),
      ),
      card('Robustez', h('div', null, attrRow('Resistência física', player.attributes.durability, 'Derivada da disponibilidade real nas últimas temporadas em que foi jogador de rotação.'), attrRow('Stamina', player.attributes.stamina))),
    ),
    h(
      'div',
      { class: 'stack' },
      card(
        'Disponibilidade por temporada',
        seasons.length
          ? h('div', null, seasons.map(([s, gp]) => h('div', { class: 'attr-row' }, h('span', null, seasonLabel(s)), h('span', { class: 'val' }, gp), bar(Math.min(100, (gp / 82) * 100)))))
          : h('div', { class: 'empty' }, 'Sem histórico de jogos.'),
      ),
      futureBox('Departamento médico', 'Tipo, região, gravidade e recorrência de lesões; tratamento; decisão de jogar lesionado; load management e sequelas.', 6),
    ),
  );
}

async function historyTab(player, { world, career }) {
  const transactions = (await recentTransactions(300)).filter((t) => t.playerIds?.includes(player.id));
  const cb = player.combine;
  const stints = [];
  for (const r of career?.rows ?? []) {
    const last = stints.at(-1);
    if (last && last.teamId === r[COL.team]) last.to = r[COL.season];
    else stints.push({ teamId: r[COL.team], from: r[COL.season], to: r[COL.season] });
  }
  return h(
    'div',
    { class: 'grid cols-2' },
    h(
      'div',
      { class: 'stack' },
      card(
        'Trajetória na NBA',
        stints.length
          ? h('div', { class: 'list' }, stints.reverse().map((s) => h('div', { class: 'item', style: { padding: '7px 0' } }, h('div', { class: 'grow' }, s.teamId ? teamCell(world.teams.get(s.teamId), { size: 'xs' }) : h('span', { class: 'muted' }, 'Franquia não identificada')), h('span', { class: 'num muted' }, s.from === s.to ? seasonLabel(s.from) : `${seasonLabel(s.from)} a ${seasonLabel(s.to)}`))))
          : h('div', { class: 'empty' }, 'Ainda sem temporadas disputadas.'),
      ),
      card(
        'Movimentações no universo',
        transactions.length
          ? h('div', { class: 'list' }, transactions.map((t) => h('div', { class: 'item' }, h('span', { class: 'num faint' }, fmtDate(t.date)), h('span', null, `${world.teams.get(t.fromTeamId)?.name ?? '—'} → ${world.teams.get(t.toTeamId)?.name ?? '—'}`), t.note ? h('span', { class: 'muted' }, t.note) : null)))
          : h('div', { class: 'empty' }, 'Nenhuma movimentação desde o início da carreira.'),
      ),
    ),
    h(
      'div',
      { class: 'stack' },
      card(
        'Draft',
        h('p', null, player.draft ? `Escolhido em ${player.draft.year}, ${player.draft.round}ª rodada, pick ${player.draft.pick}${player.draft.team ? ` pelo ${player.draft.team}` : ''}.` : 'Entrou na liga sem ser draftado.', player.college ? h('span', { class: 'muted' }, ` Formação: ${player.college}.`) : null),
      ),
      cb
        ? card(
            `Draft Combine ${cb.year}`,
            h(
              'div',
              { class: 'stats-row' },
              cb.heightNoShoes ? stat('Altura descalço', length(cb.heightNoShoes)) : null,
              cb.wingspan ? stat('Envergadura', length(cb.wingspan)) : null,
              cb.standingReach ? stat('Alcance', length(cb.standingReach)) : null,
              cb.maxVertical ? stat('Impulsão máx.', `${(cb.maxVertical * 2.54).toFixed(0)} cm`) : null,
              cb.standingVertical ? stat('Impulsão parado', `${(cb.standingVertical * 2.54).toFixed(0)} cm`) : null,
              cb.laneAgility ? stat('Lane agility', `${cb.laneAgility.toFixed(2)} s`) : null,
              cb.sprint ? stat('Sprint ¾ quadra', `${cb.sprint.toFixed(2)} s`) : null,
              cb.bench != null ? stat('Supino', `${cb.bench} rep.`) : null,
              cb.bodyFat ? stat('Gordura corporal', `${cb.bodyFat}%`) : null,
            ),
          )
        : card('Draft Combine', h('div', { class: 'empty' }, 'Sem medições oficiais de combine para este jogador.')),
    ),
  );
}

function scoutingTab(player, { world }) {
  const [label, kind, tip] = CONFIDENCE[player.ratingConfidence];
  return h(
    'div',
    { class: 'grid cols-2' },
    card(
      'Confiabilidade da avaliação',
      h(
        'div',
        { class: 'stack', style: { gap: '12px' } },
        h('div', { class: 'row' }, chip(label, kind), h('span', { class: 'muted' }, tip)),
        h('dl', { class: 'facts' }, h('dt', null, 'Minutos ponderados'), h('dd', null, player.sampleMinutes.toLocaleString('pt-BR')), h('dt', null, 'Modelo'), h('dd', null, world.seedInfo.ratingModel), h('dt', null, 'Dados de'), h('dd', null, fmtDate(world.seedInfo.snapshotDate))),
        h('p', { class: 'muted', style: { fontSize: '12.5px' } }, 'Os atributos iniciais são derivados de dados reais: box score, tracking (drives, toques, velocidade), play types, zonas de arremesso, hustle, defesa e combine. Enterrada, ética de trabalho e liderança não têm medição direta e são estimativas.'),
      ),
    ),
    h(
      'div',
      { class: 'stack' },
      card('Fontes', h('div', { class: 'list' }, world.seedInfo.sources.map((s) => h('div', { class: 'item', style: { padding: '7px 0', display: 'block' } }, h('strong', null, s.name), h('div', { class: 'muted', style: { fontSize: '12.5px' } }, s.use))))),
      futureBox('Relatórios de scouting', 'Scouts com margem de erro, entrevistas, workouts e comparação entre avaliadores — essencial para prospects.', 3),
    ),
  );
}

function tendenciesTab(player) {
  return h(
    'div',
    { class: 'stack' },
    h('div', { class: 'note' }, 'Tendências descrevem COMO o jogador joga (frequências reais de play types, tracking e zonas de arremesso), não o quão bem. São elas que orientam as decisões dele no motor de partida 2D.'),
    h('div', { class: 'grid cols-3' }, TENDENCY_GROUPS.map((g) => card(g.label, h('div', null, g.tendencies.map((t) => tendencyRow(t.label, player.tendencies[t.key], t.tip)))))),
  );
}

export async function playerView({ id }) {
  const world = getWorld();
  const player = world.players.get(Number(id));
  if (!player) return h('div', { class: 'page' }, emptyState('Jogador não encontrado', `Não existe jogador com o código "${id}" neste universo.`, h('a', { class: 'btn', href: '#/players' }, 'Buscar jogadores')));
  const team = world.teams.get(player.teamId);
  const age = playerAge(player);
  const ctx = { world, age, contract: world.contracts.get(player.id), career: await careerStatsOf(player.id) };
  const line = seasonLine(player.id) ?? lastSeasonLine(ctx.career); // temporada em curso, se ele já jogou
  const summary = contractSummary(ctx.contract, world.calendar.season);
  const fact = (label, value) => h('div', { class: 'fact' }, h('span', { class: 'micro' }, label), h('strong', null, value));

  const actions = menuButton([
    { label: 'Comparar com outro jogador', icon: 'compare', href: `/compare?ids=${player.id}` },
    team ? { label: `Elenco do ${team.name}`, icon: 'roster', href: `/team/${team.id}` } : null,
    { label: 'Jogadores da mesma posição', icon: 'players', href: `/players?pos=${player.positions[0]}` },
    'sep',
    world.career.godMode ? { label: 'Editar no God Mode', icon: 'dev', href: '/dev' } : { label: 'Editar (exige God Mode)', icon: 'dev', disabled: true, tip: 'Ative o God Mode em Configurações para editar jogadores.' },
  ].filter(Boolean));

  const hero = h(
    'header',
    { class: 'player-hero', dataset: { team: team?.id ?? '' }, style: { '--c1': team?.colors[0], '--c2': team?.colors[1] } },
    player.jersey ? h('span', { class: 'jersey-bg', 'aria-hidden': 'true' }, player.jersey) : null,
    playerPortrait(player),
    h(
      'div',
      { class: 'player-id' },
      h('div', { class: 'row wrap', style: { gap: '6px 12px' } }, team ? teamCell(team, { size: 'xs' }) : h('span', { class: 'muted' }, 'Sem time'), player.jersey ? h('span', { class: 'muted' }, `#${player.jersey}`) : null, posLabel(player.positions), statusBadge(player) ?? chip('Disponível', 'good'), player.rookie ? chip('Novato') : null),
      h('h1', null, h('small', null, player.firstName), player.lastName),
      h(
        'div',
        { class: 'fact-row' },
        fact('Idade', age != null ? `${age} anos` : '—'),
        fact('Altura', height(player.heightIn)),
        fact('Peso', weight(player.weight)),
        fact('Experiência', player.exp ? `${player.exp} temp.` : 'Novato'),
        fact('Salário', summary?.endSeason ? money(summary.salary) : '—'),
        fact('Contrato até', summary?.endSeason ? seasonLabel(summary.endSeason) : '—'),
      ),
    ),
    h(
      'div',
      { class: 'player-rating' },
      h('div', { class: 'row', style: { justifyContent: 'flex-end', gap: '4px' } }, favStar(player), actions),
      h(
        'div',
        { class: 'row', style: { gap: '14px' } },
        h('div', { class: 'center' }, h('span', { class: ['ovr-xl', tier(player.ovr)], tip: `Overall como ${player.positions[0]} — ${tierLabel(player.ovr)}` }, player.ovr), h('div', { class: 'micro faint' }, 'Overall')),
        h('div', { class: 'center' }, h('span', { class: 'ovr-xl ghost', tip: 'Potencial estimado. A faixa reflete a incerteza: jovens e jogadores com pouca amostra são menos previsíveis.' }, potentialText(player, age, world.career.godMode)), h('div', { class: 'micro faint' }, 'Potencial')),
      ),
    ),
    h(
      'div',
      { class: 'player-statline' },
      line
        ? [h('span', { class: 'micro faint statline-label' }, `Temporada ${seasonLabel(line.season)} · ${line.gp} jogos`), bigStat(number(line.pts), 'PTS'), bigStat(number(line.reb), 'REB'), bigStat(number(line.ast), 'AST'), bigStat(number(line.stl), 'ROB'), bigStat(number(line.blk), 'TOC'), bigStat(number(line.min), 'MIN'), bigStat(line.fgPct != null ? number(line.fgPct) : '—', 'FG%'), bigStat(line.tpPct != null ? number(line.tpPct) : '—', '3P%'), bigStat(line.ftPct != null ? number(line.ftPct) : '—', 'LL%')]
        : h('span', { class: 'muted' }, player.rookie ? 'Novato: ainda sem jogos na NBA.' : 'Sem estatísticas de carreira nas fontes consultadas.'),
    ),
  );

  const tabs = [
    { id: 'geral', label: 'Visão geral', render: () => overviewTab(player, ctx) },
    { id: 'atributos', label: 'Atributos', render: () => attributesTab(player) },
    { id: 'estatisticas', label: 'Estatísticas', render: () => statsTab(player, ctx) },
    { id: 'tendencias', label: 'Tendências', render: () => tendenciesTab(player) },
    { id: 'desenvolvimento', label: 'Desenvolvimento', render: () => developmentTab(player, ctx) },
    { id: 'contrato', label: 'Contrato', render: () => contractTab(player, ctx) },
    { id: 'saude', label: 'Saúde', render: () => healthTab(player, ctx) },
    { id: 'relacionamentos', label: 'Relacionamentos', render: () => futureBox('Relacionamentos', 'Amizades, mentoria, rivalidades e conflitos com colegas, técnicos e dirigentes; vínculo com a franquia, a cidade e a torcida; personalidade e papel prometido.', 7) },
    { id: 'historico', label: 'Histórico', render: () => historyTab(player, ctx) },
    { id: 'scouting', label: 'Scouting', render: () => scoutingTab(player, ctx) },
  ];
  const active = parseHash().query.get('tab') ?? 'geral';
  return h('div', { class: 'page' }, hero, tabView(tabs, { active, onChange: (tab) => setQuery({ tab: tab === 'geral' ? null : tab }) }));
}
