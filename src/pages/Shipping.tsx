/**
 * SHOES OS — Shipping.
 * Shipments follow orders automatically. The module is written against the
 * CarrierAdapter contract so Ozon Express (or any carrier) can be plugged
 * in without touching this page.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Search, Download, Truck, PackageCheck, RotateCcw } from 'lucide-react';
import { useApp } from '../app/store';
import { Badge, Card, PageHeader, Select, Stat, Table, Tabs } from '../ui/kit';
import { SHIPMENT_STATUS, ORDER_STATUS } from '../core/enums';
import { fmtMoney, pct, sum } from '../core/money';
import { fmtDateTime } from '../core/dates';
import { inRange } from '../core/dates';
import { toCsv, download } from '../lib/export';

export default function Shipping() {
  const { db, range, setOrderStatus, allows } = useApp();
  const [tab, setTab] = useState('shipments');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');

  const shipments = useMemo(() => {
    if (!db) return [];
    return db.shipments
      .filter((s) => inRange(s.created_at, range))
      .filter((s) => (status ? s.status === status : true))
      .filter((s) => !q || `${s.reference} ${s.tracking_number} ${s.city_name}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [db, range, status, q]);

  const returns = useMemo(() => {
    if (!db) return [];
    return db.returns.filter((r) => inRange(r.created_at, range));
  }, [db, range]);

  if (!db) return null;

  const ready = db.orders.filter((o) => o.status === 'confirmed' || o.status === 'preparing');
  const inTransit = shipments.filter((s) => s.status === 'sent' || s.status === 'in_transit');
  const delivered = shipments.filter((s) => s.status === 'delivered');
  const failed = shipments.filter((s) => s.status === 'refused' || s.status === 'returned');
  const deliveryRate = pct(delivered.length, delivered.length + failed.length);

  return (
    <>
      <PageHeader title="الشحن" subtitle={`${shipments.length} شحنة — ${range.label}`}
        actions={
          <button className="btn-ghost gap-1.5" onClick={() => download('shipments.csv', toCsv(shipments.map((s) => {
            const o = db.orders.find((x) => x.id === s.order_id);
            return {
              'المرجع': s.reference, 'الطلب': o?.order_number ?? '', 'العميل': o?.customer_name ?? '',
              'الهاتف': s.phone ?? '', 'المدينة': s.city_name ?? '', 'العنوان': s.address ?? '',
              'المبلغ': s.cod_amount, 'رقم التتبع': s.tracking_number ?? '',
              'الحالة': SHIPMENT_STATUS[s.status].label,
              'تكلفة الشحن': s.shipping_cost, 'تكلفة الإرجاع': s.return_cost,
            };
          })))}>
            <Download size={14} /> تصدير
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-3">
        <Stat label="جاهز للشحن" value={ready.length} tone="slate" icon={<Truck size={14} />} />
        <Stat label="في الطريق" value={inTransit.length} tone="indigo" />
        <Stat label="تم التسليم" value={delivered.length} tone="emerald" icon={<PackageCheck size={14} />} />
        <Stat label="مرفوض / مُرتجع" value={failed.length} tone="rose" icon={<RotateCcw size={14} />} />
        <Stat label="نسبة التسليم" value={`${deliveryRate.toFixed(1)}%`}
          tone={deliveryRate >= 70 ? 'emerald' : 'amber'}
          sub={`تكلفة المرتجعات ${fmtMoney(sum(returns.map((r) => r.return_cost)))}`} />
      </div>

      <Card padded={false}>
        <div className="px-3 pt-2">
          <Tabs
            tabs={[
              { id: 'shipments', label: 'الشحنات', count: shipments.length },
              { id: 'ready', label: 'جاهز للشحن', count: ready.length },
              { id: 'returns', label: 'المرتجعات', count: returns.length },
            ]}
            active={tab} onChange={setTab}
          />
        </div>

        {tab === 'shipments' && (
          <>
            <div className="flex flex-wrap gap-2 p-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-300" />
                <input className="input pr-9" placeholder="رقم التتبع، المرجع، المدينة…"
                  value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <Select value={status} onChange={setStatus} placeholder="كل الحالات" className="w-40"
                options={Object.entries(SHIPMENT_STATUS).map(([v, m]) => ({ value: v, label: m.label }))} />
            </div>
            <Table head={['الشحنة', 'الطلب', 'العميل', 'المدينة', 'المبلغ', 'رقم التتبع', 'الحالة', 'التاريخ']}>
              {shipments.slice(0, 200).map((s) => {
                const o = db.orders.find((x) => x.id === s.order_id);
                return (
                  <tr key={s.id} className="tr">
                    <td className="td num">{s.reference}</td>
                    <td className="td">
                      {o && <Link to={`/orders/${o.id}`} className="num text-brand-700 hover:underline">{o.order_number}</Link>}
                    </td>
                    <td className="td">{o?.customer_name}</td>
                    <td className="td">{s.city_name}</td>
                    <td className="td num">{fmtMoney(s.cod_amount)}</td>
                    <td className="td num text-[11.5px]">{s.tracking_number ?? '—'}</td>
                    <td className="td"><Badge tone={SHIPMENT_STATUS[s.status].tone}>{SHIPMENT_STATUS[s.status].label}</Badge></td>
                    <td className="td text-[11.5px] text-ink-400">{fmtDateTime(s.sent_at ?? s.created_at)}</td>
                  </tr>
                );
              })}
            </Table>
          </>
        )}

        {tab === 'ready' && (
          <Table head={['الطلب', 'العميل', 'المدينة', 'المنتجات', 'المبلغ', 'الحالة', '']}
            empty="لا توجد طلبات جاهزة للشحن">
            {ready.map((o) => (
              <tr key={o.id} className="tr">
                <td className="td">
                  <Link to={`/orders/${o.id}`} className="num text-brand-700 hover:underline">{o.order_number}</Link>
                </td>
                <td className="td">{o.customer_name}<div className="num text-[11px] text-ink-400">{o.phone}</div></td>
                <td className="td">{o.city_name}</td>
                <td className="td truncate max-w-[200px]">
                  {db.orderItems.filter((i) => i.order_id === o.id).map((i) => `${i.product_name} (${i.size})`).join('، ')}
                </td>
                <td className="td num">{fmtMoney(o.revenue)}</td>
                <td className="td"><Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge></td>
                <td className="td">
                  {allows('shipping.edit') && (
                    <button className="btn-soft h-7" onClick={() => setOrderStatus(o.id, o.status === 'confirmed' ? 'preparing' : 'shipped')}>
                      {o.status === 'confirmed' ? 'بدء التحضير' : 'إرسال للشحن'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}

        {tab === 'returns' && (
          <Table head={['المرجع', 'الطلب', 'العميل', 'السبب', 'أُعيد للمخزون', 'تكلفة الإرجاع', 'التاريخ']}
            empty="لا توجد مرتجعات في هذه الفترة">
            {returns.map((r) => {
              const o = db.orders.find((x) => x.id === r.order_id);
              return (
                <tr key={r.id} className="tr">
                  <td className="td num">{r.reference}</td>
                  <td className="td">
                    {o && <Link to={`/orders/${o.id}`} className="num text-brand-700 hover:underline">{o.order_number}</Link>}
                  </td>
                  <td className="td">{o?.customer_name}</td>
                  <td className="td text-ink-400">{r.reason ?? '—'}</td>
                  <td className="td">
                    {r.restock ? <Badge tone="emerald">نعم</Badge> : <Badge tone="zinc">لا</Badge>}
                  </td>
                  <td className={clsx('td num text-rose-600')}>{fmtMoney(r.return_cost)}</td>
                  <td className="td text-[11.5px] text-ink-400">{fmtDateTime(r.created_at)}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Card title="جاهزية الربط مع شركات الشحن" className="mt-3">
        <p className="text-[13px] text-ink-500 leading-relaxed">
          كل شحنة تُنشأ تلقائياً عند الانتقال إلى حالة «تم الشحن»، وتحمل رقم تتبع وحالة مستقلة عن حالة الطلب.
          طبقة <code className="num text-[12px] bg-ground px-1.5 py-0.5 rounded">CarrierAdapter</code> تعرّف ثلاث دوال فقط:
          إنشاء بوليصة، مزامنة الحالة، وتحويل حالة الشركة إلى حالة النظام — لذلك إضافة Ozon Express أو Sendit
          لا تتطلب أي تعديل في هذه الصفحة.
        </p>
      </Card>
    </>
  );
}
