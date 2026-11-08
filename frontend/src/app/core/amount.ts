/** Montants : décimal (6 décimales max) <-> unités minimales entières (chaîne). Aucun flottant. */
export const TOKEN_DECIMALS = 6;
const MAX_DIGITS = 78; // numeric(78,0), cf. OpenAPI pattern ^[1-9][0-9]{0,77}$

export type AmountError = 'EMPTY' | 'FORMAT' | 'TOO_MANY_DECIMALS' | 'ZERO' | 'TOO_LARGE';
export type AmountResult = { ok: true; value: string } | { ok: false; error: AmountError };

export const AMOUNT_ERROR_LABELS: Record<AmountError, string> = {
  EMPTY: 'Saisissez un montant.',
  FORMAT: 'Format invalide : chiffres avec un séparateur décimal optionnel (ex. 12,5).',
  TOO_MANY_DECIMALS: 'Six décimales au maximum.',
  ZERO: 'Le montant doit être strictement positif.',
  TOO_LARGE: 'Montant trop grand.',
};

export function parseAmount(input: string): AmountResult {
  const text = input.trim().replace(',', '.');
  if (text === '') return { ok: false, error: 'EMPTY' };
  const m = /^(\d+)(?:\.(\d*))?$/.exec(text);
  if (!m) return { ok: false, error: 'FORMAT' };
  const whole = m[1];
  const frac = m[2] ?? '';
  if (frac.length > TOKEN_DECIMALS) return { ok: false, error: 'TOO_MANY_DECIMALS' };
  const digits = (whole + frac.padEnd(TOKEN_DECIMALS, '0')).replace(/^0+/, '');
  if (digits === '') return { ok: false, error: 'ZERO' };
  if (digits.length > MAX_DIGITS) return { ok: false, error: 'TOO_LARGE' };
  return { ok: true, value: digits };
}

/** Unités minimales -> affichage décimal (chaînes, sans flottant). Valeur invalide -> renvoyée telle quelle. */
export function formatAmount(raw: string | null | undefined): string {
  if (raw == null) return '—';
  if (!/^-?\d+$/.test(raw)) return raw;
  const neg = raw.startsWith('-');
  const digits = (neg ? raw.slice(1) : raw).replace(/^0+(?=\d)/, '').padStart(TOKEN_DECIMALS + 1, '0');
  const whole = digits.slice(0, -TOKEN_DECIMALS).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  let frac = digits.slice(-TOKEN_DECIMALS).replace(/0+$/, '');
  if (frac.length < 2) frac = frac.padEnd(2, '0');
  return `${neg ? '-' : ''}${whole},${frac}`;
}
