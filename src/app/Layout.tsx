/**
 * SHOES OS — Application shell: sidebar, top bar, global search,
 * notifications, date range, AI assistant, toasts.
 */
import { useEffect, useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  LayoutDashboard, ShoppingCart, Users, Package, Boxes, Truck, Megaphone,
  Wallet, BarChart3, FileText, Target, Settings as SettingsIcon, Search,
  Bell, Menu, X, Sparkles, ChevronDown, Plus, CheckCheck,
} from 'lucide-react';
import { useApp, backendMode } from './store';
import { visibleModules, type Module } from '../core/permissions';
import { RANGE_LABELS, relativeTime, type RangeKey } from '../core/dates';
import { fmtMoney } from '../core/money';
import { ORDER_STATUS, USER_ROLE } from '../core/enums';
import { Avatar, Badge } from '../ui/kit';
import { AssistantPanel } from '../pages/Assistant';
import { NewOrderModal } from '../pages/NewOrder';

const NAV: { to: string; label: string; icon: typeof LayoutDashboard; module: Module }[] = [
  { to: '/', label: 'لوحة القيادة', icon: LayoutDashboard, module: 'dashboard' },
  { to: '/orders', label: 'الطلبات', icon: ShoppingCart, module: 'orders' },
  { to: '/customers', label: 'العملاء', icon: Users, module: 'customers' },
  { to: '/products', label: 'المنتجات', icon: Package, module: 'products' },
  { to: '/inventory', label: 'المخزون', icon: Boxes, module: 'inventory' },
  { to: '/shipping', label: 'الشحن', icon: Truck, module: 'shipping' },
  { to: '/marketing', label: 'التسويق', icon: Megaphone, module: 'marketing' },
  { to: '/finance', label: 'المالية', icon: Wallet, module: 'finance' },
  { to: '/analytics', label: 'التحليلات', icon: BarChart3, module: 'analytics' },
  { to: '/reports', label: 'التقارير', icon: FileText, module: 'reports' },
  { to: '/goals', label: 'الأهداف', icon: Target, module: 'goals' },
  { to: '/settings', label: 'الإعدادات', icon: SettingsIcon, module: 'settings' },
];

const RANGE_KEYS: RangeKey[] = [
  'today', 'yesterday', 'last7', 'last30', 'this_month', 'last_month', 'this_year', 'all',
];

/* ------------------------------------------------------------ sidebar */

function Sidebar() {
  const { user, sidebarOpen, setSidebar, db } = useApp();
  const allowed = user ? visibleModules(user.role) : [];
  const pending = db?.orders.filter((o) => o.status === 'new' || o.status === 'to_confirm').length ?? 0;

  return (
    <>
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-ink-900/40 lg:hidden" onClick={() => setSidebar(false)} />
      )}
      <aside className={clsx(
        'fixed lg:sticky top-0 z-40 h-screen w-[240px] shrink-0 bg-ink-900 text-white flex flex-col transition-transform duration-200',
        sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0',
      )}>
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-white/[.07]">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 grid place-items-center text-[13px] font-bold">
            S
          </div>
          <div className="leading-tight">
            <div className="text-[14px] font-semibold tracking-tight">SHOES OS</div>
            <div className="text-[10px] text-white/40">نظام تشغيل المتجر</div>
          </div>
          <button className="mr-auto lg:hidden text-white/50" onClick={() => setSidebar(false)} aria-label="إغلاق">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV.filter((n) => allowed.includes(n.module)).map((n) => (
            <NavLink
              key={n.to} to={n.to} end={n.to === '/'}
              onClick={() => setSidebar(false)}
              className={({ isActive }) => clsx(
                'flex items-center gap-2.5 px-3 h-9 rounded-lg text-[13px] transition-colors',
                isActive ? 'bg-white/[.10] text-white font-medium' : 'text-white/55 hover:text-white hover:bg-white/[.05]',
              )}
            >
              <n.icon size={16} className="shrink-0" />
              <span>{n.label}</span>
              {n.to === '/orders' && pending > 0 && (
                <span className="num mr-auto text-[10.5px] bg-saffron-500 text-ink-900 rounded px-1.5 font-semibold">{pending}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-white/[.07]">
          <div className="flex items-center gap-2.5">
            <Avatar name={user?.full_name ?? '?'} size={30} />
            <div className="min-w-0 leading-tight">
              <div className="text-[12.5px] font-medium truncate">{user?.full_name}</div>
              <div className="text-[10.5px] text-white/40">{user ? USER_ROLE[user.role].label : ''}</div>
            </div>
          </div>
          <div className="mt-2 text-[10px] text-white/30 flex items-center gap-1.5">
            <span className={clsx('h-1.5 w-1.5 rounded-full', backendMode === 'supabase' ? 'bg-emerald-400' : 'bg-saffron-500')} />
            {backendMode === 'supabase' ? 'متصل بـ Supabase' : 'وضع تجريبي محلي'}
          </div>
        </div>
      </aside>
    </>
  );
}

/* ------------------------------------------------------- global search */

function GlobalSearch() {
  const { db } = useApp();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => document.getElementById('gsearch')?.focus(), 30);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const results = useMemo(() => {
    if (!db || q.trim().length < 2) return [];
    const s = q.trim().toLowerCase();
    const out: { type: string; label: string; hint: string; to: string }[] = [];
    for (const o of db.orders) {
      if (o.order_number.toLowerCase().includes(s) || o.phone.includes(s) ||
          o.customer_name.toLowerCase().includes(s) || (o.tracking_number ?? '').toLowerCase().includes(s)) {
        out.push({
          type: 'طلب', label: `${o.order_number} — ${o.customer_name}`,
          hint: `${ORDER_STATUS[o.status].label} · ${fmtMoney(o.revenue)}`, to: `/orders/${o.id}`,
        });
      }
      if (out.length > 24) break;
    }
    for (const c of db.customers) {
      if (c.full_name.toLowerCase().includes(s) || c.phone.includes(s)) {
        out.push({ type: 'عميل', label: c.full_name, hint: `${c.phone} · ${c.city_name ?? ''}`, to: `/customers/${c.id}` });
      }
      if (out.length > 34) break;
    }
    for (const p of db.products) {
      if (p.name.toLowerCase().includes(s) || (p.model ?? '').toLowerCase().includes(s)) {
        out.push({ type: 'منتج', label: p.name, hint: `${p.model ?? ''} · ${fmtMoney(p.selling_price)}`, to: `/products` });
      }
      if (out.length > 44) break;
    }
    return out.slice(0, 12);
  }, [db, q]);

  return (
    <>
      <button
        onClick={() => { setOpen(true); setTimeout(() => document.getElementById('gsearch')?.focus(), 30); }}
        className="flex items-center gap-2 h-9 px-3 rounded-lg border border-[#e4e7ec] bg-white text-ink-300 text-[13px] hover:border-ink-200 transition-colors w-full max-w-[320px]"
      >
        <Search size={14} />
        <span className="truncate">بحث عن طلب، عميل، هاتف…</span>
        <kbd className="num mr-auto hidden sm:block text-[10px] bg-ground border border-[#e4e7ec] rounded px-1.5 py-0.5">⌘K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4 fadein">
          <div className="absolute inset-0 bg-ink-900/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-pop overflow-hidden rise">
            <div className="flex items-center gap-2.5 px-4 h-12 border-b border-[#eef0f4]">
              <Search size={16} className="text-ink-300" />
              <input
                id="gsearch" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="رقم الطلب، اسم العميل، الهاتف، رقم التتبع…"
                className="flex-1 outline-none text-[14px] bg-transparent"
              />
              <button onClick={() => setOpen(false)} className="text-ink-300 hover:text-ink-500"><X size={16} /></button>
            </div>
            <div className="max-h-[52vh] overflow-y-auto">
              {q.length < 2 && <p className="px-4 py-8 text-center text-[12.5px] text-ink-300">اكتب حرفين على الأقل للبحث</p>}
              {q.length >= 2 && results.length === 0 && <p className="px-4 py-8 text-center text-[12.5px] text-ink-300">لا نتائج مطابقة</p>}
              {results.map((r, i) => (
                <button
                  key={i}
                  onClick={() => { nav(r.to); setOpen(false); setQ(''); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-brand-50 text-right border-b border-[#f5f6f8] last:border-0"
                >
                  <span className="text-[10.5px] text-ink-300 bg-ground rounded px-1.5 py-0.5 shrink-0">{r.type}</span>
                  <span className="text-[13px] text-ink-800 truncate">{r.label}</span>
                  <span className="num mr-auto text-[11.5px] text-ink-400 truncate shrink-0">{r.hint}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------- notifications */

function Notifications() {
  const { db, refresh } = useApp();
  const [open, setOpen] = useState(false);
  const list = db?.notifications ?? [];
  const unread = list.filter((n) => !n.is_read).length;

  const toneMap = { critical: 'rose', warning: 'amber', success: 'emerald', info: 'blue' } as const;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative h-9 w-9 grid place-items-center rounded-lg border border-[#e4e7ec] bg-white text-ink-500 hover:bg-ground"
        aria-label="الإشعارات"
      >
        <Bell size={15} />
        {unread > 0 && (
          <span className="num absolute -top-1.5 -left-1.5 min-w-[17px] h-[17px] px-1 rounded-full bg-rose-500 text-white text-[10px] grid place-items-center font-semibold">
            {unread > 99 ? '99' : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 mt-2 w-[340px] max-w-[92vw] bg-white border border-[#e4e7ec] rounded-xl shadow-pop z-50 overflow-hidden rise">
            <div className="flex items-center justify-between px-4 h-11 border-b border-[#eef0f4]">
              <span className="text-[13px] font-semibold">مركز الإشعارات</span>
              <button
                onClick={async () => { list.forEach((n) => { n.is_read = true; }); await refresh(); }}
                className="text-[11.5px] text-brand-600 hover:underline flex items-center gap-1"
              >
                <CheckCheck size={12} /> تعليم الكل كمقروء
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {list.length === 0 && <p className="px-4 py-8 text-center text-[12.5px] text-ink-300">لا توجد إشعارات</p>}
              {list.slice(0, 40).map((n) => (
                <div key={n.id} className={clsx(
                  'px-4 py-2.5 border-b border-[#f5f6f8] last:border-0 flex gap-2.5',
                  !n.is_read && 'bg-brand-50/40',
                )}>
                  <span className={clsx('mt-1.5 h-1.5 w-1.5 rounded-full shrink-0',
                    n.severity === 'critical' ? 'bg-rose-500'
                      : n.severity === 'warning' ? 'bg-saffron-500'
                        : n.severity === 'success' ? 'bg-emerald-500' : 'bg-blue-500')} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12.5px] font-medium text-ink-800">{n.title}</span>
                      <Badge tone={toneMap[n.severity]} dot={false}>{n.severity === 'critical' ? 'حرج' : n.severity === 'warning' ? 'تنبيه' : 'معلومة'}</Badge>
                    </div>
                    {n.body && <p className="text-[11.5px] text-ink-400 mt-0.5">{n.body}</p>}
                    <p className="text-[10.5px] text-ink-300 mt-0.5">{relativeTime(n.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- date range */

function DateRangePicker() {
  const { rangeKey, setRange, customRange } = useApp();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(customRange.from);
  const [to, setTo] = useState(customRange.to);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 h-9 px-3 rounded-lg border border-[#e4e7ec] bg-white text-[13px] text-ink-700 hover:bg-ground"
      >
        {RANGE_LABELS[rangeKey]}
        <ChevronDown size={14} className="text-ink-300" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 mt-2 w-[240px] bg-white border border-[#e4e7ec] rounded-xl shadow-pop z-50 p-1.5 rise">
            {RANGE_KEYS.map((k) => (
              <button
                key={k}
                onClick={() => { setRange(k); setOpen(false); }}
                className={clsx(
                  'w-full text-right px-3 h-8 rounded-lg text-[13px] hover:bg-brand-50',
                  rangeKey === k && 'bg-brand-50 text-brand-700 font-medium',
                )}
              >{RANGE_LABELS[k]}</button>
            ))}
            <div className="border-t border-[#eef0f4] mt-1.5 pt-2 px-2 pb-1">
              <p className="text-[11px] text-ink-400 mb-1.5">فترة مخصصة</p>
              <div className="flex gap-1.5">
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input h-8 text-[11.5px] px-2" />
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input h-8 text-[11.5px] px-2" />
              </div>
              <button
                className="btn-soft w-full mt-1.5 h-8"
                onClick={() => { if (from && to) { setRange('custom', { from, to }); setOpen(false); } }}
              >تطبيق</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- toasts */

function Toasts() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="fixed bottom-4 left-4 z-[70] flex flex-col gap-2 w-[340px] max-w-[92vw]">
      {toasts.map((t) => (
        <div key={t.id} className={clsx(
          'card shadow-pop px-4 py-3 flex items-start gap-3 rise',
          t.tone === 'error' && 'border-rose-200 bg-rose-50',
          t.tone === 'success' && 'border-emerald-200 bg-emerald-50',
        )}>
          <span className={clsx('mt-1.5 h-2 w-2 rounded-full shrink-0',
            t.tone === 'error' ? 'bg-rose-500' : t.tone === 'success' ? 'bg-emerald-500' : 'bg-blue-500')} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-ink-800">{t.title}</p>
            {t.body && <p className="text-[11.5px] text-ink-500 mt-0.5">{t.body}</p>}
          </div>
          <button onClick={() => dismissToast(t.id)} className="text-ink-300 hover:text-ink-500"><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- shell */

export function Shell({ children }: { children: React.ReactNode }) {
  const { setSidebar, allows } = useApp();
  const [assistant, setAssistant] = useState(false);
  const [newOrder, setNewOrder] = useState(false);

  return (
    <div className="flex min-h-screen" dir="rtl">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-14 bg-white/85 backdrop-blur border-b border-[#e4e7ec] flex items-center gap-2 px-3 sm:px-5">
          <button className="lg:hidden h-9 w-9 grid place-items-center rounded-lg border border-[#e4e7ec] text-ink-500"
            onClick={() => setSidebar(true)} aria-label="القائمة">
            <Menu size={16} />
          </button>
          <div className="flex-1 min-w-0 max-w-[320px]"><GlobalSearch /></div>
          <div className="mr-auto flex items-center gap-2">
            <button onClick={() => setAssistant(true)} className="btn-ghost gap-1.5 hidden sm:inline-flex">
              <Sparkles size={14} className="text-brand-500" /> المساعد
            </button>
            <DateRangePicker />
            <Notifications />
            {allows('orders.create') && (
              <button onClick={() => setNewOrder(true)} className="btn-primary gap-1.5">
                <Plus size={15} /> <span className="hidden sm:inline">طلب جديد</span>
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-3 sm:p-5 max-w-[1600px] w-full mx-auto">{children}</main>
      </div>

      <AssistantPanel open={assistant} onClose={() => setAssistant(false)} />
      <NewOrderModal open={newOrder} onClose={() => setNewOrder(false)} />
      <Toasts />
    </div>
  );
}
