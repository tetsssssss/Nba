// Auditoria de integridade do universo aberto. Roda nas Dev Tools e deve passar
// antes de qualquer entrega que mexa em jogadores, contratos ou franquias.
import { ATTRIBUTE_KEYS, POSITIONS } from '../players/attributes.js';
import { positionOverall } from '../players/overall.js';
import { TENDENCY_KEYS } from '../players/tendencies.js';
import { getPhotoManifest } from '../media/photos.js';

/** @returns [{ name, ok, detail, level }] — level 'error' reprova; 'warn' apenas informa. */
export function auditWorld(world) {
  const checks = [];
  const add = (name, ok, detail = '', level = 'error') => checks.push({ name, ok, detail, level });
  const teams = [...world.teams.values()];
  const players = [...world.players.values()];
  const list = (items, map = (x) => x.name) => items.slice(0, 6).map(map).join(', ') + (items.length > 6 ? ` e mais ${items.length - 6}` : '');

  add('32 franquias', teams.length === 32, `${teams.length} encontradas`);
  const byConf = { East: 0, West: 0 };
  const byDiv = new Map();
  for (const t of teams) {
    byConf[t.conference] = (byConf[t.conference] ?? 0) + 1;
    byDiv.set(`${t.conference}/${t.division}`, (byDiv.get(`${t.conference}/${t.division}`) ?? 0) + 1);
  }
  add('16 equipes por conferência', byConf.East === 16 && byConf.West === 16, `Leste ${byConf.East}, Oeste ${byConf.West}`);
  add('8 divisões de 4 equipes', byDiv.size === 8 && [...byDiv.values()].every((n) => n === 4), [...byDiv.entries()].map(([k, n]) => `${k}: ${n}`).join(' · '));
  add('Expansão no Oeste e Pelicans no Leste', world.teams.get('SEA')?.conference === 'West' && world.teams.get('LVJ')?.conference === 'West' && world.teams.get('NOP')?.conference === 'East' && world.teams.get('MIN')?.conference === 'West');

  const orphans = players.filter((p) => !world.teams.has(p.teamId));
  add('Todo jogador pertence a uma franquia existente', orphans.length === 0, orphans.length ? list(orphans) : `${players.length} jogadores`);

  const badAttrs = players.filter((p) => ATTRIBUTE_KEYS.some((k) => !Number.isInteger(p.attributes?.[k]) || p.attributes[k] < 0 || p.attributes[k] > 100));
  add(`${ATTRIBUTE_KEYS.length} atributos válidos (0-100) por jogador`, badAttrs.length === 0, badAttrs.length ? list(badAttrs) : '');
  const badTend = players.filter((p) => TENDENCY_KEYS.some((k) => !Number.isInteger(p.tendencies?.[k]) || p.tendencies[k] < 0 || p.tendencies[k] > 100));
  add(`${TENDENCY_KEYS.length} tendências válidas por jogador`, badTend.length === 0, badTend.length ? list(badTend) : '');
  const badPos = players.filter((p) => !p.positions?.length || p.positions.some((x) => !POSITIONS.includes(x)));
  add('Posições naturais válidas', badPos.length === 0, badPos.length ? list(badPos) : '');
  const staleOvr = players.filter((p) => p.ovr !== positionOverall(p.attributes, p.positions[0]));
  add('Overall em cache igual ao da fórmula', staleOvr.length === 0, staleOvr.length ? list(staleOvr) : '');
  const badPot = players.filter((p) => p.potential < p.ovr || p.potential > 99);
  add('Potencial entre o Overall e 99', badPot.length === 0, badPot.length ? list(badPot) : '');

  const noContract = players.filter((p) => !world.contracts.has(p.id));
  add('Todo jogador tem contrato', noContract.length === 0, noContract.length ? list(noContract) : `${world.contracts.size} contratos`);
  const mismatched = [...world.contracts.values()].filter((c) => world.players.get(c.playerId)?.teamId !== c.teamId);
  add('Contratos apontam para o time atual do jogador', mismatched.length === 0, mismatched.length ? `${mismatched.length} divergentes` : '');
  const emptyContracts = [...world.contracts.values()].filter((c) => !c.years?.length || c.years.some((y) => !(y.salary > 0)));
  add('Contratos com anos e salários positivos', emptyContracts.length === 0, emptyContracts.length ? `${emptyContracts.length} inválidos` : '');

  const sizes = teams.map((t) => [t, players.filter((p) => p.teamId === t.id).length]);
  const badSize = sizes.filter(([t, n]) => (t.expansion ? false : n < 13 || n > world.league.roster.offseasonMax + 1));
  add('Elencos dentro do tamanho esperado', badSize.length === 0, badSize.length ? badSize.map(([t, n]) => `${t.id}: ${n}`).join(', ') : `${Math.min(...sizes.filter(([t]) => !t.expansion).map(([, n]) => n))} a ${Math.max(...sizes.map(([, n]) => n))} jogadores`);

  const noAge = players.filter((p) => p.age == null && !p.birthDate);
  add('Idade conhecida', noAge.length === 0, noAge.length ? list(noAge) : '', 'warn');
  const estimated = [...world.contracts.values()].filter((c) => c.source === 'estimated').length;
  add('Contratos confirmados em fonte', estimated === 0, `${estimated} estimados (convidados de training camp) precisam de validação`, 'warn');

  const manifest = getPhotoManifest();
  const audited = Object.keys(manifest.players ?? {}).length > 0;
  const noPhoto = players.filter((p) => manifest.players?.[p.id] === '');
  add('Manifesto de fotos carregado', audited, audited ? `gerado em ${manifest.generatedAt?.slice(0, 10)}` : 'rode "npm run photos:audit"', 'warn');
  add('Fotografia real disponível', noPhoto.length === 0, noPhoto.length ? `${players.length - noPhoto.length} de ${players.length} com foto; placeholder para: ${list(noPhoto)}` : `${players.length} de ${players.length}`, 'warn');

  const coachless = teams.filter((t) => !t.expansion && !world.coaches.has(t.headCoachId));
  add('Franquias reais com técnico', coachless.length === 0, coachless.length ? list(coachless, (t) => t.id) : '');
  return checks;
}
