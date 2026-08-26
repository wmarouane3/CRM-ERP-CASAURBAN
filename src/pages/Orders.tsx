/**
 * SHOES OS — Orders.
 * The operational heart: filter, scan, and move an order forward in one
 * click. Status changes go through the state machine, so stock, money and
 * history stay correct without anyone thinking about it.
 */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { Search, Download, MessageCircle, ChevronLeft } from 'lucide-react';
import { useApp } from '../app/store';
import { Badge, Card, PageHeader, Select, Table, Tabs } from '../ui/kit';
import { ORDER_STATUS, ORDER_STATUS_ORDER, SALES_CHANNEL, STATUS_TRANSITIONS } from '../core/enums';
import { fmtMoney } from '../core/money';
import { fmtDateTime } from '../core/dates';
import { filterOrders } from '../core/analytics';
import { orderWhatsappLink } from '../integrations/whatsapp';
import { toCsv, download } from '../lib/export';
import type { Order, OrderStatus } from '../core/types';

export default function Orders() {
  const { db, range, setOrderStatus, allows } = useApp();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [city, setCity] = useState('');
  const [channel, setChannel] = useState('');
  const status = (params.get('status') ?? '') as OrderStatus | '';

  const orders = useMemo(() => {
    if (!db) return [];
    let list = filterOrders(db, { range });
    if (status) list = list.filter((o) => o.status === status);
    if (city) list = list.filter((o) => o.city_name === city);
    if (channel) list = list.filter((o) => o.channel === channel);
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      list = list.filter((o) =>
        o.order_number.toLowerCase().includes(s) ||
        o.customer_name.toLowerCase().includes(s) ||
        o.phone.includes(s) ||
        (o.tracking_number ?? '').toLowerCase().includes(s));
    }
    return list;
  }, [db, range, status, city, channel, q]);

  if (!db) return null;
  const all = filterOrders(db, { range });

  const tabs = [
    { id: '', label: 'الكل', count: all.length },
    ...ORDER_STATUS_ORDER.map((s) => ({
      id: s, label: ORDER_STATUS[s].label, count: all.filter((o) => o.status === s).length,
    })).filter((t) => t.count > 0 || t.id === 'to_confirm'),
  ];

  const exportCsv = () => {
    download('orders.csv', toCsv(orders.map((o) => ({
      'رقم الطلب': o.order_number,
      'التاريخ': o.created_at.slice(0, 16).replace('T', ' '),
      'العميل': o.customer_name,
      'الهاتف': o.phone,
      'المدينة': o.city_name ?? '',
      'العنوان': o.address ?? '',
      'المنتجات': db.orderItems.filter((i) => i.order_id === o.id)
        .map((i) => `${i.product_name} (${i.size}) ×${i.quantity}`).join(' | '),
      'الحالة': ORDER_STATUS[o.status].label,
      'المداخيل': o.revenue,
      'تكلفة المنتج': o.product_cost,
      'الشحن': o.shipping_cost,
      'الإعلان': o.ad_cost,
      'الإرجاع': o.return_cost,
      'الربح الصافي': o.net_profit,
      'رقم التتبع': o.tracking_number ?? '',
      'القناة': SALES_CHANNEL[o.channel].label,
    }))));
  };

  return (
    <>
      <PageHeader
        title="الطلبات"
        subtitle={`${orders.length} طلب معروض — ${range.label}`}
        actions={<button className="btn-ghost gap-1.5" onClick={exportCsv}><Download size={14} /> تصدير CSV</button>}
      />

      <Card padded={false} className="mb-3">
        <div className="px-3 pt-2">
          <Tabs tabs={tabs} active={status} onChange={(id) => {
            if (id) setParams({ status: id }); else setParams({});
          }} />
        </div>
        <div className="flex flex-wrap gap-2 p-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-300" />
            <input className="input pr-9" placeholder="رقم الطلب، الاسم، الهاتف، التتبع…"
              value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={city} onChange={setCity} placeholder="كل المدن" className="w-40"
            options={[...new Set(all.map((o) => o.city_name).filter(Boolean))]
              .map((c) => ({ value: c!, label: c! }))} />
          <Select value={channel} onChange={setChannel} placeholder="كل القنوات" className="w-40"
            options={Object.entries(SALES_CHANNEL).map(([v, m]) => ({ value: v, label: m.label }))} />
        </div>
      </Card>

      <Card padded={false}>
        <Table
          head={['الطلب', 'العميل', 'المدينة', 'المنتجات', 'الحالة', 'المداخيل', 'الربح', 'التاريخ', '']}
          empty="لا توجد طلبات مطابقة للفلاتر"
        >
          {orders.slice(0, 200).map((o) => (
            <OrderRow key={o.id} order={o} onStatus={setOrderStatus} canEdit={allows('orders.edit')} />
          ))}
        </Table>
        {orders.length > 200 && (
          <p className="text-center text-[12px] text-ink-300 py-3 border-t border-[#eef0f4]">
            يعرض أول 200 طلب — استخدم الفلاتر لتضييق النتائج
          </p>
        )}
      </Card>
    </>
  );
}

function OrderRow({ order, onStatus, canEdit }: {
  order: Order; onStatus: (id: string, s: OrderStatus) => void; canEdit: boolean;
}) {
  const { db } = useApp();
  const items = db!.orderItems.filter((i) => i.order_id === order.id);
  const next = STATUS_TRANSITIONS[order.status];

  return (
    <tr className="tr">
      <td className="td">
        <Link to={`/orders/${order.id}`} className="num font-medium text-brand-700 hover:underline">
          {order.order_number}
        </Link>
        <div className="text-[10.5px] text-ink-300">{SALES_CHANNEL[order.channel].label}</div>
      </td>
      <td className="td">
        <div className="font-medium text-ink-800">{order.customer_name}</div>
        <div className="num text-[11px] text-ink-400">{order.phone}</div>
      </td>
      <td className="td">{order.city_name}</td>
      <td className="td">
        <div className="max-w-[190px] truncate">{items.map((i) => i.product_name).join('، ')}</div>
        <div className="num text-[11px] text-ink-400">
          {items.map((i) => `${i.size}×${i.quantity}`).join(' · ')}
        </div>
      </td>
      <td className="td">
        <Badge tone={ORDER_STATUS[order.status].tone}>{ORDER_STATUS[order.status].label}</Badge>
      </td>
      <td className="td num">{fmtMoney(order.revenue)}</td>
      <td className={clsx('td num font-medium', order.net_profit >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
        {fmtMoney(order.net_profit)}
      </td>
      <td className="td text-[11.5px] text-ink-400">{fmtDateTime(order.created_at)}</td>
      <td className="td">
        <div className="flex items-center gap-1 justify-end">
          <a href={orderWhatsappLink(order)} target="_blank" rel="noreferrer"
            className="h-7 w-7 grid place-items-center rounded-lg text-emerald-600 hover:bg-emerald-50" title="مراسلة واتساب">
            <MessageCircle size={14} />
          </a>
          {canEdit && next.length > 0 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onStatus(order.id, next[0])}
                className="h-7 px-2 rounded-lg bg-brand-50 text-brand-700 text-[11.5px] font-medium hover:bg-brand-100 whitespace-nowrap"
              >
                {ORDER_STATUS[next[0]].label}
              </button>
              {next.length > 1 && (
                <select
                  value="" onChange={(e) => e.target.value && onStatus(order.id, e.target.value as OrderStatus)}
                  className="h-7 w-7 rounded-lg border border-[#e4e7ec] text-[11px] bg-white cursor-pointer"
                  title="حالات أخرى"
                >
                  <option value="">⋯</option>
                  {next.slice(1).map((s) => (
                    <option key={s} value={s}>{ORDER_STATUS[s].label}</option>
                  ))}
                </select>
              )}
            </div>
          )}
          <Link to={`/orders/${order.id}`} className="h-7 w-7 grid place-items-center rounded-lg text-ink-300 hover:bg-ground">
            <ChevronLeft size={15} />
          </Link>
        </div>
      </td>
    </tr>
  );
}
