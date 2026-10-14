// Permissões do God Mode — UM só sistema (career.godMode). Modos que bloqueiam o God Mode
// (Franchise, Coach: `lockGodMode`) nunca recebem poderes de comissário, mesmo que o save tenha
// godMode=true por edição manual do arquivo.
import { careerRules } from './modes.js';

/** O usuário tem poderes de God Mode neste save? */
export function godModeAllowed(career) {
  return Boolean(career?.godMode) && !careerRules(career).lockGodMode;
}

/** "Override Total" só vale com ativação explícita (career.godOverride.active). */
export function overrideActive(career) {
  return godModeAllowed(career) && Boolean(career.godOverride?.active);
}

/** Pode trocar de franquia (Commissioner, ou Universe com God Mode ligado)? */
export function canSwitchTeams(career) {
  return godModeAllowed(career) && (Boolean(careerRules(career).switchTeams) || career.mode === 'universe' || !career.mode);
}

/** Pode revisar/aprovar trades entre franquias da IA? */
export function canReviewAiTrades(career) {
  return godModeAllowed(career) || career?.mode === 'commissioner';
}
