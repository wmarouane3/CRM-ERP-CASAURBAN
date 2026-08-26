/**
 * SHOES OS — money utilities.
 * All money is handled as a number of MAD with 2 decimals, rounded at
 * every boundary so that totals never drift (no float accumulation bugs).
 */

/** Round to 2 decimals, half-up, immune to 0.1+0.2 style errors. */
export function money(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function sum(values: number[]): number {
  return money(values.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0));
}

export function pct(part: number, whole: number, decimals = 1): number {
  if (!whole) return 0;
  const f = 10 ** decimals;
  return Math.round((part / whole) * 100 * f) / f;
}

export function safeDiv(a: number, b: number, decimals = 2): number {
  if (!b) return 0;
  const f = 10 ** decimals;
  return Math.round((a / b) * f) / f;
}

const nf = new Intl.NumberFormat('fr-MA', {
  minimumFractionDigits: 0, maximumFractionDigits: 2,
});
const nf2 = new Intl.NumberFormat('fr-MA', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

/**
 * Numbers are wrapped in a Unicode LTR isolate (U+2066 … U+2069) so that a
 * minus sign or a currency code never jumps to the wrong side inside the
 * Arabic RTL layout. Display only — exports always use raw numbers.
 */
const ltr = (s: string) => `\u2066${s}\u2069`;

export function fmtMoney(n: number, currency = 'MAD', decimals: 0 | 2 = 0): string {
  const v = money(n);
  const s = decimals === 2 ? nf2.format(v) : nf.format(v);
  return ltr(`${s} ${currency}`);
}

export function fmtNumber(n: number): string {
  return ltr(nf.format(n ?? 0));
}

export function fmtPct(n: number, decimals = 1): string {
  return ltr(`${(n ?? 0).toFixed(decimals)}%`);
}

/** Compact money for KPI tiles — currency stays inside the LTR isolate. */
export function fmtMoneyCompact(n: number, currency = 'MAD'): string {
  const a = Math.abs(n);
  const s = a >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
    : a >= 10_000 ? `${(n / 1000).toFixed(1)}K`
      : nf.format(money(n));
  return ltr(`${s} ${currency}`);
}

/** Compact display for KPI tiles: 12 450 → 12.5K */
export function fmtCompact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return ltr(`${(n / 1_000_000).toFixed(1)}M`);
  if (a >= 10_000) return ltr(`${(n / 1000).toFixed(1)}K`);
  return ltr(nf.format(money(n)));
}
