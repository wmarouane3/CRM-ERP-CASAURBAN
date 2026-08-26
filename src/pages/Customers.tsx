/**
 * SHOES OS — Customers (CRM).
 * Segments are computed from behaviour, not typed by hand: a customer who
 * refuses half their orders is flagged before you ship the next one.
 */
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { Search, Download, MessageCircle, ArrowRight } from 'lucide-react';
import { useApp } from '../app/store';
import { Avatar, Badge, Card, Empty, PageHeader, Select, Stat, Table } from '../ui/kit';
import { CUSTOMER_SEGMENT, ORDER_STATUS } from '../core/enums';
import { fmtMoney, fmtPct, pct } from '../core/money';
import { fmtDate, fmtDateTime } from '../core/dates';
import { customerKpis } from '../core/analytics';
import { whatsappLink } from '../integrations/whatsapp';
import { toCsv, download } from '../lib/export';
import type { CustomerSegment } from '../core/types';

export default function Customers() {
  const { db, range } = useApp();
  const [q, setQ] = useState('');
  const [segment, setSegment] = useState('');
  const [city, setCity] = useState('');

  const list = useMemo(() => {
    if (!db) return [];
    return db.customers
      .filter((c) => {
        if (segment && c.segment !== segment) return false;
        if (city && c.city_name !== city) return false;
        if (q && !`${c.full_name} ${c.phone}`.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => b.total_spent - a.total_spent);
  }, [db, q, segment, city]);

  if (!db) return null;
  const kpi = customerKpis(db, range);
  const cities = [...new Set(db.customers.map((c) => c.city_name).filter(Boolean))] as string[];

  return (
    <>
      <PageHeader
        title="العملاء"
        subtitle={`${db.customers.length} عميل`}
        actions={
          <button className="btn-ghost gap-1.5" onClick={() => download('customers.csv', toCsv(list.map((c) => ({
            'المرجع': c.reference, 'الاسم': c.full_name, 'الهاتف': c.phone, 'المدينة': c.city_name ?? '',
            'الطلبات': c.total_orders, 'مسلّم': c.delivered_orders, 'مرفوض': c.refused_orders,
            'مُرتجع': c.returned_orders, 'إجمالي الإنفاق': c.total_spent,
            'متوسط الطلب': c.avg_order_value, 'القيمة الدائمة': c.lifetime_value,
            'التصنيف': CUSTOMER_SEGMENT[c.segment].label,
            'آخر طلب': c.last_order_at?.slice(0, 10) ?? '',
          }))))}>
            <Download size={14} /> تصدير
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-3">
        <Stat label="إجمالي العملاء" value={kpi.total} tone="blue" />
        <Stat label="عملاء جدد" value={kpi.newCustomers} tone="cyan" sub={range.label} />
        <Stat label="عملاء متكررون" value={kpi.returning} tone="emerald" sub={fmtPct(kpi.repeatRate)} />
        <Stat label="عملاء VIP" value={kpi.vip} tone="violet" />
        <Stat label="خطر مرتفع" value={kpi.highRisk} tone="rose" sub="نسبة رفض عالية" />
      </div>

      <Card padded={false}>
        <div className="flex flex-wrap gap-2 p-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-300" />
            <input className="input pr-9" placeholder="اسم أو هاتف…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={segment} onChange={setSegment} placeholder="كل التصنيفات" className="w-44"
            options={Object.entries(CUSTOMER_SEGMENT).map(([v, m]) => ({ value: v, label: m.label }))} />
          <Select value={city} onChange={setCity} placeholder="كل المدن" className="w-40"
            options={cities.map((c) => ({ value: c, label: c }))} />
        </div>

        <Table head={['العميل', 'المدينة', 'الطلبات', 'مسلّم', 'مرفوض', 'إجمالي الإنفاق', 'متوسط الطلب', 'التصنيف', 'آخر طلب', '']}>
          {list.slice(0, 200).map((c) => (
            <tr key={c.id} className="tr">
              <td className="td">
                <Link to={`/customers/${c.id}`} className="flex items-center gap-2 group">
                  <Avatar name={c.full_name} size={28} />
                  <div>
                    <div className="font-medium text-ink-800 group-hover:text-brand-700">{c.full_name}</div>
                    <div className="num text-[11px] text-ink-400">{c.phone}</div>
                  </div>
                </Link>
              </td>
              <td className="td">{c.city_name}</td>
              <td className="td num">{c.total_orders}</td>
              <td className="td num text-emerald-600">{c.delivered_orders}</td>
              <td className="td num text-rose-600">{c.refused_orders + c.returned_orders}</td>
              <td className="td num font-medium">{fmtMoney(c.total_spent)}</td>
              <td className="td num">{fmtMoney(c.avg_order_value)}</td>
              <td className="td"><Badge tone={CUSTOMER_SEGMENT[c.segment].tone}>{CUSTOMER_SEGMENT[c.segment].label}</Badge></td>
              <td className="td text-[11.5px] text-ink-400">{fmtDate(c.last_order_at)}</td>
              <td className="td">
                <a href={whatsappLink(c.phone, `مرحباً ${c.full_name} 👋`)} target="_blank" rel="noreferrer"
                  className="h-7 w-7 grid place-items-center rounded-lg text-emerald-600 hover:bg-emerald-50">
                  <MessageCircle size={14} />
                </a>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------- detail */

export function CustomerDetail() {
  const { id } = useParams();
  const { db } = useApp();
  const customer = db?.customers.find((c) => c.id === id);
  const orders = useMemo(
    () => (db?.orders.filter((o) => o.customer_id === id) ?? [])
      .sort((a, b) => b.created_at.localeCompare(a.created_at)), [db, id]);

  if (!db || !customer) return <Card><Empty title="العميل غير موجود" /></Card>;

  const deliveryRate = pct(
    customer.delivered_orders,
    customer.delivered_orders + customer.refused_orders + customer.returned_orders,
  );

  return (
    <>
      <PageHeader
        title={customer.full_name}
        subtitle={`${customer.reference} · ${customer.phone} · ${customer.city_name ?? ''}`}
        actions={<>
          <Link to="/customers" className="btn-ghost gap-1.5"><ArrowRight size={14} /> كل العملاء</Link>
          <a href={whatsappLink(customer.phone, `مرحباً ${customer.full_name} 👋`)} target="_blank" rel="noreferrer"
            className="btn-ghost gap-1.5 text-emerald-700"><MessageCircle size={14} /> واتساب</a>
        </>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-3">
        <Stat label="إجمالي الطلبات" value={customer.total_orders} tone="blue" />
        <Stat label="نسبة التسليم" value={fmtPct(deliveryRate)}
          tone={deliveryRate >= 70 ? 'emerald' : deliveryRate >= 50 ? 'amber' : 'rose'} />
        <Stat label="إجمالي الإنفاق" value={customer.total_spent} money compact tone="emerald" />
        <Stat label="متوسط قيمة الطلب" value={customer.avg_order_value} money tone="indigo" />
        <Stat label="القيمة الدائمة (LTV)" value={customer.lifetime_value} money compact tone="violet"
          sub="صافي الربح المتراكم" />
      </div>

      <div className="grid lg:grid-cols-3 gap-3">
        <Card title="بطاقة العميل" className="lg:col-span-1">
          <div className="flex items-center gap-3 mb-4">
            <Avatar name={customer.full_name} size={48} />
            <div>
              <div className="text-[15px] font-semibold">{customer.full_name}</div>
              <Badge tone={CUSTOMER_SEGMENT[customer.segment].tone}>{CUSTOMER_SEGMENT[customer.segment].label}</Badge>
            </div>
          </div>
          <div className="space-y-2 text-[13px]">
            {[
              ['الهاتف', customer.phone],
              ['المدينة', customer.city_name ?? '—'],
              ['العنوان', customer.address ?? '—'],
              ['أول طلب', fmtDate(customer.first_order_at)],
              ['آخر طلب', fmtDate(customer.last_order_at)],
              ['مسلّم', String(customer.delivered_orders)],
              ['مرفوض', String(customer.refused_orders)],
              ['مُرتجع', String(customer.returned_orders)],
              ['ملغى', String(customer.cancelled_orders)],
            ].map(([l, v]) => (
              <div key={l} className="flex justify-between gap-3 border-b border-[#f5f6f8] pb-1.5">
                <span className="text-ink-400">{l}</span>
                <span className="text-ink-800 text-left num">{v}</span>
              </div>
            ))}
          </div>
          {customer.segment === 'high_risk' && (
            <div className="mt-4 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-[12.5px] text-rose-800">
              ⚠️ هذا العميل يرفض أكثر من نصف طلباته. يُنصح بالتأكيد الهاتفي قبل الشحن أو طلب دفعة مقدمة.
            </div>
          )}
        </Card>

        <Card title="سجل الطلبات" subtitle={`${orders.length} طلب`} className="lg:col-span-2" padded={false}>
          <Table head={['الطلب', 'المنتجات', 'الحالة', 'المداخيل', 'الربح', 'التاريخ']}>
            {orders.map((o) => (
              <tr key={o.id} className="tr">
                <td className="td">
                  <Link to={`/orders/${o.id}`} className="num text-brand-700 hover:underline font-medium">
                    {o.order_number}
                  </Link>
                </td>
                <td className="td truncate max-w-[200px]">
                  {db.orderItems.filter((i) => i.order_id === o.id).map((i) => `${i.product_name} (${i.size})`).join('، ')}
                </td>
                <td className="td"><Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge></td>
                <td className="td num">{fmtMoney(o.revenue)}</td>
                <td className={clsx('td num', o.net_profit >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                  {fmtMoney(o.net_profit)}
                </td>
                <td className="td text-[11.5px] text-ink-400">{fmtDateTime(o.created_at)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}

export function segmentTone(s: CustomerSegment) { return CUSTOMER_SEGMENT[s].tone; }
