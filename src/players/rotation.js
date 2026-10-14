// Rotação manual opcional. Dados armazenados na própria franquia, sem nova store.
export const SLOTS = ['PG', 'SG', 'SF', 'PF', 'C'];
export function validateRotation(rotation, roster) {
  const eligible = new Map((roster ?? []).filter((p) => p?.injury?.status !== 'Out').map((p) => [String(p.id), p]));
  const starters = rotation?.starters;
  if (!Array.isArray(starters) || starters.length !== 5 || new Set(starters.map(String)).size !== 5) return false;
  if (!starters.every((id) => eligible.has(String(id)))) return false;
  if (rotation.minutes && (typeof rotation.minutes !== 'object' || Object.entries(rotation.minutes).some(([id, min]) => !eligible.has(String(id)) || !Number.isFinite(min) || min < 0 || min > 48))) return false;
  return true;
}
export function resolveRotation(rotation, roster, fallback) {
  if (!validateRotation(rotation, roster)) return fallback;
  const map = new Map(roster.map((p) => [String(p.id), p]));
  const starters = rotation.starters.map((id) => map.get(String(id)));
  const bench = roster.filter((p) => !rotation.starters.map(String).includes(String(p.id))).sort((a, b) => b.ovr - a.ovr);
  return { starters, bench, minutes: rotation.minutes ?? {} };
}
export function makeRotation(starters, minutes, roster) {
  const data = { starters: [...starters], minutes: { ...minutes } };
  if (!validateRotation(data, roster)) throw new Error('Rotação inválida: escolha cinco titulares distintos e minutos entre 0 e 48.');
  return data;
}
