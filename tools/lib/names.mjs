// Normalização de nomes para casar o mesmo jogador entre fontes diferentes.
const FOLD = { đ: 'd', ø: 'o', ł: 'l', ı: 'i', ß: 'ss', æ: 'ae' };

export function normalizeName(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[đøłıßæ]/g, (c) => FOLD[c])
    .replace(/[.,'’`]/g, '')
    .replace(/-/g, ' ')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "6-8" → 80 polegadas. */
export function parseHeight(text) {
  const m = /^(\d+)-(\d+)$/.exec(String(text ?? ''));
  return m ? Number(m[1]) * 12 + Number(m[2]) : null;
}

export function ageOn(dateOfBirth, onDate) {
  if (!dateOfBirth) return null;
  const b = new Date(dateOfBirth);
  const d = new Date(onDate);
  let age = d.getUTCFullYear() - b.getUTCFullYear();
  if (d.getUTCMonth() < b.getUTCMonth() || (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate())) age--;
  return age;
}
