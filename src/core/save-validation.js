// Validação de um arquivo de backup antes de importar. Função pura (sem IndexedDB),
// para poder ser testada e para dar ao usuário um erro que ele entenda.

export const SAVE_FORMAT = 'nba-universe-manager-save';
const REQUIRED_STORES = ['meta', 'teams', 'players', 'contracts'];
const REQUIRED_META = ['career', 'calendar', 'league'];

/**
 * @returns { ok, errors: [texto], warnings: [texto], info: { teams, players, season, teamName } }
 */
export function validateSavePayload(payload, { schemaVersion, storeNames }) {
  const errors = [];
  const warnings = [];
  const info = {};
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, errors: ['O arquivo não contém um save: o conteúdo não é um objeto JSON.'], warnings, info };
  if (payload.format !== SAVE_FORMAT) errors.push('Este arquivo não é um backup do NBA Universe Manager (campo "format" ausente ou diferente).');
  if (!Number.isInteger(payload.schemaVersion) || payload.schemaVersion < 1) errors.push('Versão do save ausente ou inválida.');
  else if (payload.schemaVersion > schemaVersion) errors.push(`Este save foi criado por uma versão mais nova do jogo (formato ${payload.schemaVersion}; este jogo lê até ${schemaVersion}). Atualize o jogo para importá-lo.`);
  if (!payload.stores || typeof payload.stores !== 'object') errors.push('O arquivo não tem os dados da carreira (bloco "stores").');
  if (errors.length) return { ok: false, errors, warnings, info };

  const { stores } = payload;
  for (const name of REQUIRED_STORES) {
    if (!Array.isArray(stores[name]) || !stores[name].length) errors.push(`Dados obrigatórios ausentes ou vazios: "${name}".`);
  }
  for (const [name, rows] of Object.entries(stores)) {
    if (!storeNames.includes(name)) warnings.push(`Bloco desconhecido "${name}" será ignorado.`);
    else if (!Array.isArray(rows)) errors.push(`O bloco "${name}" está corrompido (não é uma lista).`);
  }
  if (errors.length) return { ok: false, errors, warnings, info };

  const meta = new Map(stores.meta.map((m) => [m?.key, m?.value]));
  for (const key of REQUIRED_META) if (!meta.get(key)) errors.push(`Informação da carreira ausente: "${key}".`);
  const teamIds = new Set(stores.teams.map((t) => t?.id));
  if (teamIds.has(undefined) || teamIds.size !== stores.teams.length) errors.push('Franquias com ID ausente ou duplicado.');
  const league = meta.get('league');
  if (!league || typeof league !== 'object' || !Object.keys(league).length) errors.push('Regras da liga ausentes ou vazias.');
  const cal = meta.get('calendar');
  if (!cal || !Number.isInteger(cal.season) || !/^\d{4}-\d{2}-\d{2}$/.test(cal.date ?? '')) errors.push('Calendário da carreira incompleto ou inválido.');
  const expectedTeams = Array.isArray(league?.expansion?.teams) && league.startSeason ? 30 + league.expansion.teams.length : null;
  if (expectedTeams && stores.teams.length !== expectedTeams) errors.push(`A liga exige ${expectedTeams} franquias, mas o backup contém ${stores.teams.length}.`);
  if (Array.isArray(stores.games)) {
    const invalidGames = stores.games.filter((g) => !g?.id || !teamIds.has(g.home) || !teamIds.has(g.away) || g.home === g.away || !g.date);
    if (invalidGames.length) errors.push(`${invalidGames.length} jogo(s) com equipe, ID ou data inválidos.`);
    if (new Set(stores.games.map((g) => g.id)).size !== stores.games.length) errors.push('Jogos com IDs duplicados.');
  }
  const career = meta.get('career');
  if (career && !teamIds.has(career.teamId)) errors.push(`A franquia do usuário ("${career.teamId}") não existe entre as franquias do save.`);
  const broken = stores.players.filter((p) => p?.id == null || !p.attributes || !Array.isArray(p.positions)).length;
  if (broken) errors.push(`${broken} jogador(es) sem identificação, atributos ou posição.`);
  const ids = new Set(stores.players.map((p) => p?.id));
  if (ids.size !== stores.players.length) errors.push('Há jogadores duplicados no arquivo.');
  const orphan = stores.contracts.filter((c) => !ids.has(c?.playerId)).length;
  if (orphan) errors.push(`${orphan} contrato(s) apontam para jogadores que não estão no save.`);
  const lost = stores.players.filter((p) => p?.teamId && !teamIds.has(p.teamId)).length;
  if (lost) errors.push(`${lost} jogador(es) pertencem a franquias que não existem no save.`);
  if (payload.schemaVersion < schemaVersion) warnings.push(`Save de formato anterior (${payload.schemaVersion}): será migrado para o formato ${schemaVersion} ao importar.`);

  info.teams = stores.teams.length;
  info.players = stores.players.length;
  info.season = meta.get('calendar')?.season ?? null;
  info.teamName = stores.teams.find((t) => t.id === career?.teamId)?.fullName ?? null;
  return { ok: errors.length === 0, errors, warnings, info };
}
