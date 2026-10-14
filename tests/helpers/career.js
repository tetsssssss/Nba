// Cria carreiras reais (createCareer → IndexedDB em memória → loadWorld) para os testes.
import './env.js';

let counter = 0;

/** Abre uma carreira nova. `options` sobrescreve as opções padrão do assistente de nova carreira. */
export async function newCareer(options = {}) {
  const { createCareer } = await import('../../src/core/saves.js');
  const { defaultCareerOptions } = await import('../../src/core/career-options.js');
  const { ensureSchedule } = await import('../../src/season/season.js');
  const base = defaultCareerOptions();
  const world = await createCareer({ ...base, managerName: `Teste ${++counter}`, teamId: 'BOS', saveName: `teste-${counter}`, ...options });
  ensureSchedule();
  return world;
}

export async function closeAll() {
  const { closeCareer } = await import('../../src/core/saves.js');
  await closeCareer();
}
