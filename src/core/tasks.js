// Pendências da franquia do usuário, geradas a partir do estado real do universo.
import { getWorld, payrollOf, teamRoster, userTeam } from './world.js';
import { contractSummary } from '../contracts/cap.js';
import { capSeason } from '../contracts/rules-config.js';

/** @returns [{ level: 'bad'|'warn'|'info'|'future', title, text, link? }] */
export function userTasks() {
  const world = getWorld();
  const team = userTeam();
  const { league, calendar, contracts } = world;
  const roster = teamRoster(team.id);
  const tasks = [];
  const teamLink = (tab) => `/team/${team.id}?tab=${tab}`;

  if (team.expansion && roster.length === 0) {
    tasks.push({ level: 'info', title: 'Expansion Draft na véspera da noite de abertura', text: `A liga realiza o Expansion Draft automaticamente quando o calendário chegar à temporada regular: cada franquia protege ${league.expansion.protectedPerTeam} jogadores e pode perder no máximo ${league.expansion.maxLostPerTeam}. A versão em que você escolhe as picks continua prevista (Fase 3).`, link: '/calendar' });
    tasks.push({ level: 'info', title: 'Contratar um técnico', text: 'A franquia ainda não tem comissão técnica. A contratação de staff chega na Fase 6.' });
    return tasks;
  }

  const payroll = payrollOf(team.id);
  const standard = payroll.standardCount;
  if (standard > league.roster.standardMax) {
    tasks.push({ level: 'warn', title: `Elenco com ${standard} contratos padrão`, text: `O limite na temporada regular é ${league.roster.standardMax} (+${league.roster.twoWayMax} two-way). Será preciso dispensar ou trocar ${standard - league.roster.standardMax} jogador(es) antes da noite de abertura.`, link: teamLink('elenco') });
  }
  if (payroll.twoWayCount > league.roster.twoWayMax) {
    tasks.push({ level: 'warn', title: `${payroll.twoWayCount} contratos two-way`, text: `O máximo permitido é ${league.roster.twoWayMax}.`, link: teamLink('elenco') });
  }
  const camp = roster.filter((p) => p.rosterStatus === 'camp');
  if (camp.length) {
    tasks.push({ level: 'info', title: `${camp.length} convidado(s) de training camp`, text: 'Contratos mínimos não garantidos (estimados): decida quem fica com as últimas vagas.', link: teamLink('elenco') });
  }

  if (payroll.status === 'second-apron') tasks.push({ level: 'bad', title: 'Folha acima do 2º apron', text: 'A franquia sofre as restrições mais duras do CBA: sem agregação de salários em trades e sem exceções.', link: teamLink('folha') });
  else if (payroll.status === 'first-apron') tasks.push({ level: 'warn', title: 'Folha acima do 1º apron', text: 'Restrições em trades e no uso de exceções.', link: teamLink('folha') });
  else if (payroll.status === 'tax') tasks.push({ level: 'warn', title: 'Franquia na luxury tax', text: 'O proprietário paga imposto sobre o excedente. A tolerância depende do perfil dele.', link: teamLink('folha') });

  const injured = roster.filter((p) => p.injury);
  if (injured.length) {
    const out = injured.filter((p) => p.injury.status === 'Out').length;
    tasks.push({ level: out ? 'warn' : 'info', title: `${injured.length} jogador(es) no departamento médico`, text: `${out} fora de combate, ${injured.length - out} em dúvida.`, link: teamLink('elenco') });
  }

  const expiring = roster.filter((p) => contractSummary(contracts.get(p.id), capSeason(world))?.expiring && p.rosterStatus === 'standard');
  if (expiring.length) {
    tasks.push({ level: 'info', title: `${expiring.length} contrato(s) no último ano`, text: 'Renovações e extensões estão na central de finanças.', link: '/finance?tab=contratos' });
  }

  if (!world.career.expansionDraft) tasks.push({ level: 'info', title: 'Expansion Draft na véspera da noite de abertura', text: `Os ${league.expansion.protectedPerTeam} jogadores mais valiosos do seu elenco serão protegidos automaticamente; você pode perder no máximo ${league.expansion.maxLostPerTeam}. Escolher os protegidos chega na Fase 3.`, link: '/calendar' });
  return tasks;
}
