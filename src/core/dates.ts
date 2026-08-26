/**
 * SHOES OS — date range helpers (Africa/Casablanca business calendar).
 */
export type RangeKey =
  | 'today' | 'yesterday' | 'last7' | 'last30' | 'this_month'
  | 'last_month' | 'this_year' | 'all' | 'custom';

export interface DateRange { from: Date; to: Date; key: RangeKey; label: string }

export const RANGE_LABELS: Record<RangeKey, string> = {
  today: 'اليوم',
  yesterday: 'أمس',
  last7: 'آخر 7 أيام',
  last30: 'آخر 30 يوماً',
  this_month: 'هذا الشهر',
  last_month: 'الشهر الماضي',
  this_year: 'هذه السنة',
  all: 'كل الفترات',
  custom: 'فترة مخصصة',
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

export function resolveRange(key: RangeKey, custom?: { from: string; to: string }): DateRange {
  const now = new Date();
  const mk = (from: Date, to: Date): DateRange =>
    ({ from, to, key, label: RANGE_LABELS[key] });

  switch (key) {
    case 'today':
      return mk(startOfDay(now), endOfDay(now));
    case 'yesterday': {
      const y = new Date(now); y.setDate(now.getDate() - 1);
      return mk(startOfDay(y), endOfDay(y));
    }
    case 'last7': {
      const f = new Date(now); f.setDate(now.getDate() - 6);
      return mk(startOfDay(f), endOfDay(now));
    }
    case 'last30': {
      const f = new Date(now); f.setDate(now.getDate() - 29);
      return mk(startOfDay(f), endOfDay(now));
    }
    case 'this_month':
      return mk(new Date(now.getFullYear(), now.getMonth(), 1), endOfDay(now));
    case 'last_month': {
      const f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const t = new Date(now.getFullYear(), now.getMonth(), 0);
      return mk(f, endOfDay(t));
    }
    case 'this_year':
      return mk(new Date(now.getFullYear(), 0, 1), endOfDay(now));
    case 'custom':
      return mk(
        custom?.from ? startOfDay(new Date(custom.from)) : startOfDay(now),
        custom?.to ? endOfDay(new Date(custom.to)) : endOfDay(now),
      );
    case 'all':
    default:
      return mk(new Date(2000, 0, 1), endOfDay(now));
  }
}

/** Previous period of the same length — for the "vs previous" deltas. */
export function previousRange(r: DateRange): DateRange {
  const span = r.to.getTime() - r.from.getTime();
  return {
    from: new Date(r.from.getTime() - span - 1),
    to: new Date(r.from.getTime() - 1),
    key: r.key,
    label: 'الفترة السابقة',
  };
}

export function inRange(value: string | Date, r: DateRange): boolean {
  const t = (value instanceof Date ? value : new Date(value)).getTime();
  return t >= r.from.getTime() && t <= r.to.getTime();
}

export function dayKey(d: string | Date): string {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function eachDay(r: DateRange, maxPoints = 120): string[] {
  const out: string[] = [];
  const cur = new Date(r.from.getFullYear(), r.from.getMonth(), r.from.getDate());
  while (cur <= r.to && out.length < maxPoints) {
    out.push(dayKey(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

const AR_MONTHS = ['يناير','فبراير','مارس','أبريل','ماي','يونيو','يوليوز','غشت','شتنبر','أكتوبر','نونبر','دجنبر'];

export function fmtDate(d?: string | Date | null): string {
  if (!d) return '—';
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return '—';
  return `${x.getDate()} ${AR_MONTHS[x.getMonth()]} ${x.getFullYear()}`;
}

export function fmtDateTime(d?: string | Date | null): string {
  if (!d) return '—';
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return '—';
  const hh = String(x.getHours()).padStart(2, '0');
  const mm = String(x.getMinutes()).padStart(2, '0');
  return `${x.getDate()} ${AR_MONTHS[x.getMonth()]} — ${hh}:${mm}`;
}

export function fmtShortDay(key: string): string {
  const [, m, d] = key.split('-');
  return `${Number(d)}/${Number(m)}`;
}

export function relativeTime(d?: string | Date | null): string {
  if (!d) return '—';
  const x = d instanceof Date ? d : new Date(d);
  const diff = Date.now() - x.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `منذ ${h} ساعة`;
  const days = Math.floor(h / 24);
  if (days < 30) return `منذ ${days} يوم`;
  return fmtDate(x);
}
