/**
 * SHOES OS — Order detail.
 * Timeline, line items, live P&L, stock movements caused by this order,
 * and the state-machine actions available right now.
 */
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowRight, MessageCircle, Truck, Package2, Receipt, History } from 'lucide-react';
import { useApp } from '../app/store';
import { Badge, Card, Field, PageHeader, Table } from '../ui/kit';
import { ORDER_STATUS, ORDER_PIPELINE, STATUS_TRANSITIONS, MOVEMENT_TYPE, SALES_CHANNEL } from '../core/enums';
import { fmtMoney } from '../core/money';
import { fmtDateTime } from '../core/dates';
import { TEMPLATES, orderWhatsappLink, type TemplateKey } from '../integrations/whatsapp';

export default function OrderDetail() {
  const { id } = useParams();
  const { db, setOrderStatus, updateOrder, allows } = useApp();
  const [editing, setEditing] = useState(false);
  const [costs, setCosts] = useState<{ shipping_cost: number; ad_cost: number; other_cost: number; discount: number } | null>(null);
  const [tpl, setTpl] = useState<TemplateKey>('confirmation');

  const order = db?.orders.find((o) => o.id === id);
  const items = useMemo(() => db?.orderItems.filter((i) => i.order_id === id) ?? [], [db, id]);
  const history = useMemo(
    () => (db?.statusHistory.filter((h) => h.order_id === id) ?? [])
      .sort((a, b) => a.created_at.localeCompare(b.created_at)), [db, id]);
  const movements = useMemo(
    () => db?.movements.filter((m) => m.reference_id === id) ?? [], [db, id]);
  const shipment = db?.shipments.find((s) => s.order_id === id);
  const customer = db?.customers.find((c) => c.id === order?.customer_id);

  if (!db || !order) {
    return <Card><p className="py-10 text-center text-ink-400">الطلب غير موجود</p></Card>;
  }

  const next = STATUS_TRANSITIONS[order.status];
  const pipelineIndex = ORDER_PIPELINE.indexOf(order.status);

  const startEdit = () => {
    setCosts({
      shipping_cost: order.shipping_cost, ad_cost: order.ad_cost,
      other_cost: order.other_cost, discount: order.discount,
    });
    setEditing(true);
  };

  return (
    <>
      <PageHeader
        title={`الطلب ${order.order_number}`}
        subtitle={`${SALES_CHANNEL[order.channel].label} · ${fmtDateTime(order.created_at)}`}
        actions={
          <>
            <Link to="/orders" className="btn-ghost gap-1.5"><ArrowRight size={14} /> كل الطلبات</Link>
            <a href={orderWhatsappLink(order, tpl)} target="_blank" rel="noreferrer" className="btn-ghost gap-1.5 text-emerald-700">
              <MessageCircle size={14} /> واتساب
            </a>
            <select value={tpl} onChange={(e) => setTpl(e.target.value as TemplateKey)} className="input w-36 h-9">
              {Object.entries(TEMPLATES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </>
        }
      />

      {/* status bar --------------------------------------------------- */}
      <Card className="mb-3">
        <div className="flex flex-wrap items-center gap-4 justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            {ORDER_PIPELINE.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={clsx(
                  'flex items-center gap-1.5 px-2.5 h-7 rounded-full text-[12px] font-medium',
                  pipelineIndex >= i && pipelineIndex !== -1
                    ? 'bg-brand-600 text-white'
                    : 'bg-ground text-ink-300',
                )}>
                  {ORDER_STATUS[s].label}
                </div>
                {i < ORDER_PIPELINE.length - 1 && <div className="h-px w-4 bg-[#e4e7ec]" />}
              </div>
            ))}
            {['refused', 'returned', 'cancelled'].includes(order.status) && (
              <Badge tone={ORDER_STATUS[order.status].tone}>{ORDER_STATUS[order.status].label}</Badge>
            )}
          </div>
          {allows('orders.edit') && next.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {next.map((s, i) => (
                <button
                  key={s} onClick={() => setOrderStatus(order.id, s)}
                  className={i === 0 ? 'btn-primary' : 'btn-ghost'}
                >{ORDER_STATUS[s].label}</button>
              ))}
            </div>
          )}
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 space-y-3">
          {/* items --------------------------------------------------- */}
          <Card title="المنتجات" padded={false}>
            <Table head={['المنتج', 'المقاس', 'SKU', 'الكمية', 'سعر البيع', 'التكلفة', 'الإجمالي']}>
              {items.map((it) => {
                const product = db.products.find((p) => p.id === it.product_id);
                return (
                  <tr key={it.id} className="tr">
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <img src={product?.image_url} alt="" className="h-8 w-8 rounded-lg object-cover" />
                        <span>{it.product_name}</span>
                      </div>
                    </td>
                    <td className="td num">{it.size}</td>
                    <td className="td num text-ink-400">{it.sku}</td>
                    <td className="td num">{it.quantity}</td>
                    <td className="td num">{fmtMoney(it.unit_price)}</td>
                    <td className="td num text-ink-400">{fmtMoney(it.unit_cost)}</td>
                    <td className="td num font-medium">{fmtMoney(it.line_revenue)}</td>
                  </tr>
                );
              })}
            </Table>
          </Card>

          {/* P&L ----------------------------------------------------- */}
          <Card
            title="حساب الربح" subtitle="يُحتسب تلقائياً حسب حالة الطلب"
            actions={allows('orders.edit') && !editing
              ? <button className="btn-ghost h-8" onClick={startEdit}>تعديل التكاليف</button>
              : editing
                ? <>
                  <button className="btn-primary h-8" onClick={async () => { await updateOrder(order.id, costs!); setEditing(false); }}>حفظ</button>
                  <button className="btn-ghost h-8" onClick={() => setEditing(false)}>إلغاء</button>
                </>
                : undefined}
          >
            {editing && costs ? (
              <div className="grid sm:grid-cols-4 gap-3 mb-4">
                <Field label="تكلفة الشحن">
                  <input type="number" className="input num" value={costs.shipping_cost}
                    onChange={(e) => setCosts({ ...costs, shipping_cost: Number(e.target.value) })} />
                </Field>
                <Field label="تكلفة الإعلان">
                  <input type="number" className="input num" value={costs.ad_cost}
                    onChange={(e) => setCosts({ ...costs, ad_cost: Number(e.target.value) })} />
                </Field>
                <Field label="تكاليف أخرى">
                  <input type="number" className="input num" value={costs.other_cost}
                    onChange={(e) => setCosts({ ...costs, other_cost: Number(e.target.value) })} />
                </Field>
                <Field label="الخصم">
                  <input type="number" className="input num" value={costs.discount}
                    onChange={(e) => setCosts({ ...costs, discount: Number(e.target.value) })} />
                </Field>
              </div>
            ) : null}

            <div className="grid sm:grid-cols-2 gap-x-8">
              {[
                ['سعر البيع الإجمالي', order.subtotal, ''],
                ['الخصم', -order.discount, ''],
                ['المداخيل', order.revenue, 'font-semibold'],
                ['تكلفة المنتج', -order.product_cost, ''],
                ['تكلفة الشحن', -order.shipping_cost, ''],
                ['تكلفة التغليف', -order.packaging_cost, ''],
                ['تكلفة الإعلان', -order.ad_cost, ''],
                ['تكلفة الإرجاع', -order.return_cost, ''],
                ['تكاليف أخرى', -order.other_cost, ''],
              ].map(([l, v, cls], i) => (
                <div key={i} className="flex items-center justify-between py-1.5 text-[13px] border-b border-[#f5f6f8]">
                  <span className="text-ink-500">{l as string}</span>
                  <span className={clsx('num', cls as string, (v as number) < 0 && 'text-rose-600')}>
                    {fmtMoney(v as number)}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 grid sm:grid-cols-3 gap-3">
              <div className="rounded-xl bg-ground p-3">
                <div className="text-[11px] text-ink-400">الربح الإجمالي</div>
                <div className="num text-[16px] font-semibold">{fmtMoney(order.gross_profit)}</div>
              </div>
              <div className={clsx('rounded-xl p-3', order.net_profit >= 0 ? 'bg-emerald-50' : 'bg-rose-50')}>
                <div className="text-[11px] text-ink-400">الربح الصافي</div>
                <div className={clsx('num text-[16px] font-bold', order.net_profit >= 0 ? 'text-emerald-700' : 'text-rose-700')}>
                  {fmtMoney(order.net_profit)}
                </div>
              </div>
              <div className="rounded-xl bg-ground p-3">
                <div className="text-[11px] text-ink-400">هامش الربح</div>
                <div className="num text-[16px] font-semibold">{order.profit_margin.toFixed(1)}%</div>
              </div>
            </div>
            {!order.revenue_recognized && (
              <p className="text-[11.5px] text-ink-400 mt-3">
                ⓘ المداخيل لا تُحتسب فعلياً إلا بعد حالة «تم التسليم». القيم أعلاه تمثل التوقع الحالي.
              </p>
            )}
          </Card>

          {/* stock movements ----------------------------------------- */}
          <Card title="حركات المخزون الناتجة عن هذا الطلب" padded={false}
            actions={<Package2 size={15} className="text-ink-300" />}>
            <Table head={['النوع', 'المقاس', 'الكمية', 'الرصيد بعدها', 'الوقت']} empty="لم يُخصم المخزون بعد">
              {movements.map((m) => {
                const v = db.variants.find((x) => x.id === m.variant_id);
                const p = db.products.find((x) => x.id === v?.product_id);
                return (
                  <tr key={m.id} className="tr">
                    <td className="td"><Badge tone={MOVEMENT_TYPE[m.type].tone}>{MOVEMENT_TYPE[m.type].label}</Badge></td>
                    <td className="td">{p?.name} — {v?.size}</td>
                    <td className={clsx('td num font-medium', m.quantity > 0 ? 'text-emerald-600' : 'text-rose-600')}>
                      {m.quantity > 0 ? '+' : ''}{m.quantity}
                    </td>
                    <td className="td num">{m.balance_after}</td>
                    <td className="td text-[11.5px] text-ink-400">{fmtDateTime(m.created_at)}</td>
                  </tr>
                );
              })}
            </Table>
          </Card>
        </div>

        {/* side ------------------------------------------------------ */}
        <div className="space-y-3">
          <Card title="العميل">
            <div className="space-y-2 text-[13px]">
              <Row label="الاسم" value={
                customer
                  ? <Link to={`/customers/${customer.id}`} className="text-brand-700 hover:underline">{order.customer_name}</Link>
                  : order.customer_name} />
              <Row label="الهاتف" value={<span className="num">{order.phone}</span>} />
              <Row label="المدينة" value={order.city_name ?? '—'} />
              <Row label="العنوان" value={order.address ?? '—'} />
              {customer && (
                <>
                  <Row label="طلبات سابقة" value={<span className="num">{customer.total_orders}</span>} />
                  <Row label="مسلّم / مرفوض" value={<span className="num">{customer.delivered_orders} / {customer.refused_orders}</span>} />
                </>
              )}
            </div>
          </Card>

          <Card title="الشحن" actions={<Truck size={15} className="text-ink-300" />}>
            <div className="space-y-2 text-[13px]">
              <Row label="رقم التتبع" value={<span className="num">{order.tracking_number ?? '—'}</span>} />
              <Row label="شركة الشحن" value={shipment?.carrier_code ?? '—'} />
              <Row label="حالة الشحنة" value={shipment ? shipment.status : '—'} />
              <Row label="مبلغ التحصيل" value={<span className="num">{fmtMoney(shipment?.cod_amount ?? order.revenue)}</span>} />
            </div>
          </Card>

          <Card title="سجل الحالة" actions={<History size={15} className="text-ink-300" />}>
            <ol className="relative pr-4">
              {history.map((h, i) => (
                <li key={h.id} className="relative pb-4 last:pb-0">
                  <span className="absolute right-[-13px] top-1 h-2.5 w-2.5 rounded-full bg-brand-500 ring-4 ring-brand-50" />
                  {i < history.length - 1 && <span className="absolute right-[-8.5px] top-4 bottom-0 w-px bg-[#e4e7ec]" />}
                  <div className="text-[12.5px] font-medium text-ink-800">
                    {h.from_status ? `${ORDER_STATUS[h.from_status].label} ← ` : ''}
                    {ORDER_STATUS[h.to_status].label}
                  </div>
                  <div className="text-[11px] text-ink-400">{fmtDateTime(h.created_at)} · {h.changed_by_name}</div>
                  {h.note && <div className="text-[11.5px] text-ink-500 mt-0.5">{h.note}</div>}
                </li>
              ))}
            </ol>
          </Card>

          {order.notes && (
            <Card title="ملاحظات" actions={<Receipt size={15} className="text-ink-300" />}>
              <p className="text-[13px] text-ink-600">{order.notes}</p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-ink-400 shrink-0">{label}</span>
      <span className="text-ink-800 text-left">{value}</span>
    </div>
  );
}
