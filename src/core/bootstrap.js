// Inicialização idempotente dos sistemas de gestão ao abrir uma carreira (nova ou antiga):
// picks de Draft, classes de prospectos, documento do mercado e perfis dos GMs.
// Tudo é determinístico (semente = id do save) e só grava o que ainda não existe.
import { markDirty } from './world.js';
import { ensureDraftPicks, nextDraftSeason } from '../contracts/picks.js';
import { ensureProspectClasses } from '../draft/prospects.js';
import { ensureMarket } from '../contracts/market-state.js';
import { assignGmProfiles } from '../gm/personality.js';
import { ensureOffseason } from '../season/offseason.js';

export function ensureWorldSystems(world) {
  const report = { picks: 0, prospects: 0 };
  world.quiet = true; // um único aviso de "alterado" no fim
  try {
    ensureMarket(world);
    assignGmProfiles(world, { markDirty }); // só preenche quem ainda não tem perfil
    report.picks = ensureDraftPicks(world);
    report.prospects = ensureProspectClasses(world, nextDraftSeason(world), { markDirty });
    if (world.calendar.phase === 'offseason') ensureOffseason(world); // saves antigos parados na offseason
  } finally {
    world.quiet = false;
  }
  return report;
}
