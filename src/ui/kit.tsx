/**
 * SHOES OS — UI kit.
 * Small, reusable, unopinionated pieces. Every page is built from these
 * so the system looks like one product and a new page costs minutes.
 */
import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { X, ChevronDown, Search, Check } from 'lucide-react';
import { TONE_CLASSES, TONE_DOT, type Tone } from '../core/enums';
import { fmtCompact, fmtMoney, fmtMoneyCompact } from '../core/money';

/* ------------------------------------------------------------- badges */

export function Badge({ tone = 'slate', children, dot = true }: {
  tone?: Tone; children: React.ReactNode; dot?: boolean;
}) {
  return (
    <span className={clsx('pill', TONE_CLASSES[tone])}>
      {dot && <span className={clsx('h-1.5 w-1.5 rounded-full', TONE_DOT[tone])} />}
      {children}
    </span>
  );
}

/* --------------------------------------------------------------- card */

export function Card({ title, subtitle, actions, children, className, padded = true }: {
  title?: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode;
  children: React.ReactNode; className?: string; padded?: boolean;
}) {
  return (
    <section className={clsx('card', className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-4 py-3 border-b border-[#eef0f4]">
          <div className="min-w-0">
            {title && <h3 className="text-[14px] font-semibold text-ink-900 truncate">{title}</h3>}
            {subtitle && <p className="text-[12px] text-ink-400 mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

/* ----------------------------------------------------------- stat tile */

export function Stat({ label, value, sub, delta, tone = 'slate', icon, money, compact }: {
  label: string; value: number | string; sub?: string;
  delta?: number; tone?: Tone; icon?: React.ReactNode;
  money?: boolean; compact?: boolean;
}) {
  const display = typeof value === 'number'
    ? money
      ? (compact ? fmtMoneyCompact(value) : fmtMoney(value))
      : fmtCompact(value)
    : value;
  return (
    <div className="card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-ink-400 truncate">{label}</span>
        {icon && <span className={clsx('h-7 w-7 grid place-items-center rounded-lg', TONE_CLASSES[tone])}>{icon}</span>}
      </div>
      <div className="num text-[22px] font-semibold text-ink-900 leading-none tracking-tight">{display}</div>
      <div className="flex items-center gap-2 min-h-[18px]">
        {delta !== undefined && Number.isFinite(delta) && (
          <span className={clsx(
            'num text-[11.5px] font-medium px-1.5 rounded',
            delta >= 0 ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50',
          )}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {sub && <span className="text-[11.5px] text-ink-400 truncate">{sub}</span>}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- table */

export function Table({ head, children, empty }: {
  head: React.ReactNode[]; children: React.ReactNode; empty?: string;
}) {
  const rows = React.Children.count(children);
  return (
    <div className="scroll-x">
      <table className="w-full min-w-[640px] border-collapse">
        <thead className="bg-[#fafbfc]">
          <tr>{head.map((h, i) => <th key={i} className="th">{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {rows === 0 && (
        <div className="py-12 text-center text-[13px] text-ink-300">{empty ?? 'لا توجد بيانات'}</div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- modal */

export function Modal({ open, onClose, title, children, footer, wide }: {
  open: boolean; onClose: () => void; title: string;
  children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 fadein">
      <div className="absolute inset-0 bg-ink-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className={clsx(
        'relative bg-white w-full rounded-t-2xl sm:rounded-2xl shadow-pop rise flex flex-col max-h-[92vh]',
        wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
      )}>
        <header className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[#eef0f4]">
          <h3 className="text-[15px] font-semibold text-ink-900">{title}</h3>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-ground text-ink-400" aria-label="إغلاق">
            <X size={16} />
          </button>
        </header>
        <div className="p-5 overflow-y-auto">{children}</div>
        {footer && <footer className="px-5 py-3.5 border-t border-[#eef0f4] flex justify-start gap-2 bg-[#fafbfc] rounded-b-2xl">{footer}</footer>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- drawer */

export function Drawer({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title: React.ReactNode;
  children: React.ReactNode; footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 fadein">
      <div className="absolute inset-0 bg-ink-900/40" onClick={onClose} />
      <aside className="absolute inset-y-0 left-0 w-full sm:w-[560px] bg-white shadow-pop flex flex-col rise">
        <header className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[#eef0f4] shrink-0">
          <div className="min-w-0 text-[15px] font-semibold text-ink-900">{title}</div>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-ground text-ink-400" aria-label="إغلاق">
            <X size={16} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <footer className="px-5 py-3 border-t border-[#eef0f4] bg-[#fafbfc] shrink-0">{footer}</footer>}
      </aside>
    </div>
  );
}

/* -------------------------------------------------------------- field */

export function Field({ label, hint, children, error }: {
  label: string; hint?: string; children: React.ReactNode; error?: string;
}) {
  return (
    <div>
      <label className="label">{label}{hint && <span className="text-ink-300 font-normal"> — {hint}</span>}</label>
      {children}
      {error && <p className="text-[11.5px] text-rose-600 mt-1">{error}</p>}
    </div>
  );
}

export function Select({ value, onChange, options, placeholder, className }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string; className?: string;
}) {
  return (
    <div className={clsx('relative', className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input appearance-none pl-8 cursor-pointer"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none" />
    </div>
  );
}

/* ------------------------------------------------------- autocomplete */

export interface AutoOption { value: string; label: string; hint?: string; disabled?: boolean }

export function Autocomplete({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void;
  options: AutoOption[]; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filtered = q
    ? options.filter((o) => (o.label + (o.hint ?? '')).toLowerCase().includes(q.toLowerCase()))
    : options;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen(!open); setQ(''); }}
        className="input flex items-center justify-between text-right"
      >
        <span className={clsx('truncate', !selected && 'text-ink-300')}>
          {selected?.label ?? placeholder ?? 'اختر…'}
        </span>
        <ChevronDown size={14} className="text-ink-300 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-[#e4e7ec] rounded-xl shadow-pop overflow-hidden">
          <div className="p-2 border-b border-[#eef0f4] relative">
            <Search size={13} className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-300" />
            <input
              autoFocus value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="بحث…" className="input pr-8 h-8"
            />
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && <div className="px-3 py-6 text-center text-[12px] text-ink-300">لا نتائج</div>}
            {filtered.map((o) => (
              <button
                key={o.value} type="button" disabled={o.disabled}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={clsx(
                  'w-full text-right px-3 py-2 text-[13px] flex items-center justify-between gap-2',
                  o.disabled ? 'text-ink-300 cursor-not-allowed' : 'hover:bg-brand-50',
                  o.value === value && 'bg-brand-50 text-brand-700',
                )}
              >
                <span className="truncate">{o.label}</span>
                <span className="flex items-center gap-2 shrink-0">
                  {o.hint && <span className="num text-[11px] text-ink-400">{o.hint}</span>}
                  {o.value === value && <Check size={13} />}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ progress */

export function Progress({ value, tone = 'brand' }: { value: number; tone?: 'brand' | 'emerald' | 'rose' | 'saffron' }) {
  const map = { brand: 'bg-brand-500', emerald: 'bg-emerald-500', rose: 'bg-rose-500', saffron: 'bg-saffron-500' };
  return (
    <div className="h-2 w-full rounded-full bg-[#eef0f4] overflow-hidden">
      <div className={clsx('h-full rounded-full transition-all duration-500', map[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

/* --------------------------------------------------------------- misc */

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="py-14 text-center">
      <p className="text-[14px] font-medium text-ink-500">{title}</p>
      {hint && <p className="text-[12.5px] text-ink-300 mt-1">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: {
  title: string; subtitle?: string; actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div>
        <h1 className="text-[19px] font-semibold text-ink-900 leading-tight">{title}</h1>
        {subtitle && <p className="text-[12.5px] text-ink-400 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Money({ value, className, bold }: { value: number; className?: string; bold?: boolean }) {
  return (
    <span className={clsx(
      'num', bold && 'font-semibold',
      value < 0 ? 'text-rose-600' : className ?? 'text-ink-700',
    )}>
      {fmtMoney(value)}
    </span>
  );
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('');
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <span
      className="grid place-items-center rounded-full font-semibold text-white shrink-0"
      style={{
        width: size, height: size, fontSize: size * 0.36,
        background: `linear-gradient(135deg, hsl(${hue} 45% 48%), hsl(${(hue + 40) % 360} 45% 38%))`,
      }}
    >{initials}</span>
  );
}

export function Tabs({ tabs, active, onChange }: {
  tabs: { id: string; label: string; count?: number }[];
  active: string; onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-[#e4e7ec] -mx-1 px-1">
      {tabs.map((t) => (
        <button
          key={t.id} onClick={() => onChange(t.id)}
          className={clsx(
            'px-3 py-2 text-[13px] font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
            active === t.id
              ? 'border-brand-500 text-brand-700'
              : 'border-transparent text-ink-400 hover:text-ink-700',
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className="num mr-1.5 text-[11px] text-ink-300">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
