// Formatação para exibição (pt-BR).
import { getSetting } from '../core/settings.js';

const nf = new Intl.NumberFormat('pt-BR');

/** US$ 58,5 mi · US$ 678 mil */
export function money(value, { compact = true } = {}) {
  if (value == null) return '—';
  if (!compact) return `US$ ${nf.format(Math.round(value))}`;
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}US$ ${(abs / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} bi`;
  if (abs >= 1e6) return `${sign}US$ ${(abs / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi`;
  if (abs >= 1e3) return `${sign}US$ ${Math.round(abs / 1e3)} mil`;
  return `${sign}US$ ${Math.round(abs)}`;
}

export function height(inches) {
  if (!inches) return '—';
  if (getSetting('units') === 'imperial') return `${Math.floor(inches / 12)}'${Math.round(inches % 12)}"`;
  return `${(inches * 0.0254).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
}

export function weight(lbs) {
  if (!lbs) return '—';
  if (getSetting('units') === 'imperial') return `${Math.round(lbs)} lb`;
  return `${Math.round(lbs * 0.45359237)} kg`;
}

/** Medidas do combine chegam em polegadas com decimais. */
export function length(inches) {
  if (inches == null) return '—';
  if (getSetting('units') === 'imperial') return `${Math.floor(inches / 12)}'${(inches % 12).toFixed(2)}"`;
  return `${(inches * 2.54).toFixed(1)} cm`;
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

/** '2026-10-05' → '5 out 2026' */
export function date(iso, { weekday = false } = {}) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const base = `${d} ${MONTHS[m - 1]} ${y}`;
  return weekday ? `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${base}` : base;
}

export const number = (v, digits = 1) => (v == null || Number.isNaN(v) ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits }));
export const pct = (made, att) => (att > 0 ? ((made / att) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—');
export const record = (r) => (r ? `${r.wins}-${r.losses}` : '—');

export const PHASE_LABEL = { preseason: 'Pré-temporada', regular: 'Temporada regular', playoffs: 'Playoffs', offseason: 'Offseason', complete: 'Carreira concluída' };
export const CONFERENCE_LABEL = { East: 'Leste', West: 'Oeste' };

/** Faixa de cor de um rating 0-100. */
export function tier(value) {
  if (value >= 90) return 't-elite';
  if (value >= 80) return 't-great';
  if (value >= 70) return 't-good';
  if (value >= 60) return 't-avg';
  return 't-low';
}

export function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
