/**
 * SHOES OS — Inventory.
 * Live stock per size, the full movement ledger, and a restock list that
 * tells you what to buy and what it will cost.
 */
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Search, Download, ArrowUpDown, Boxes, AlertTriangle, PackageX } from 'lucide-react';
import { useApp } from '../app/store';
import { Badge, Card, Field, Modal, PageHeader, Select, Stat, Table, Tabs } from '../ui/kit';
import { fmtMoney } from '../core/money';
import { fmtDateTime } from '../core/dates';
import { inventoryKpis } from '../core/analytics';
import { MOVEMENT_TYPE } from '../core/enums';
import { availableStock } from '../data/demo/engine';
import { toCsv, download } from '../lib/export';
import type { MovementType } from '../core/types';

export default function Inventory() {
  const { db, allows, adjustStock } = useApp();
  const [tab, setTab] = useState('stock');
  const [q, setQ] = useState('');
  const [state, setState] = useState('');
  const [adjust, setAdjust] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (!db) return [];
    return db.variants.map((v) => {
      const p = db.products.find((x) => x.id === v.product_id)!;
      const on_hand = availableStock(db, v.id);
      const st = on_hand === 0 ? 'out' : on_hand <= v.min_stock ? 'low' : 'ok';
      return {
        variantId: v.id, product: p?.name ?? '', image: p?.image_url, size: v.size,
        sku: v.sku, on_hand, min: v.min_stock, cost: v.cost_price, price: v.selling_price,
        value: on_hand * v.cost_price, state: st,
        suggested: Math.max(v.min_stock * 3 - on_hand, 0),
      };
    }).filter((r) => {
      if (state && r.state !== state) return false;
      if (q && !`${r.product} ${r.sku}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    }).sort((a, b) => a.on_hand - b.on_hand);
  }, [db, q, state]);

  if (!db) return null;
  const kpi = inventoryKpis(db);
  const restock = rows.filter((r) => r.suggested > 0);

  return (
    <>
      <PageHeader
        title="المخزون"
        subtitle={`${kpi.totalVariants} مقاس عبر ${kpi.totalProducts} منتج`}
        actions={
          <button className="btn-ghost gap-1.5" onClick={() => download('inventory.csv', toCsv(rows.map((r) => ({
            'المنتج': r.product, 'المقاس': r.size, 'SKU': r.sku, 'الكمية': r.on_hand,
            'الحد الأدنى': r.min, 'التكلفة': r.cost, 'قيمة المخزون': r.value,
            'الحالة': r.state === 'out' ? 'نفد' : r.state === 'low' ? 'منخفض' : 'متوفر',
            'الكمية المقترحة': r.suggested,
          }))))}>
            <Download size={14} /> تصدير
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-3">
        <Stat label="إجمالي القطع" value={kpi.totalUnits} tone="blue" icon={<Boxes size={14} />} />
        <Stat label="قيمة المخزون" value={kpi.stockValue} money compact tone="emerald" sub={`بيعاً ${fmtMoney(kpi.retailValue)}`} />
        <Stat label="مقاسات منخفضة" value={kpi.lowStock} tone="amber" icon={<AlertTriangle size={14} />} />
        <Stat label="مقاسات نافدة" value={kpi.outOfStock} tone="rose" icon={<PackageX size={14} />} />
        <Stat label="قيمة إعادة التخزين" value={kpi.restockValue} money compact tone="violet" />
      </div>

      <Card padded={false}>
        <div className="px-3 pt-2">
          <Tabs
            tabs={[
              { id: 'stock', label: 'المخزون الحالي', count: rows.length },
              { id: 'restock', label: 'يحتاج إعادة شراء', count: restock.length },
              { id: 'movements', label: 'سجل الحركات', count: db.movements.length },
            ]}
            active={tab} onChange={setTab}
          />
        </div>

        {tab !== 'movements' && (
          <div className="flex flex-wrap gap-2 p-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-300" />
              <input className="input pr-9" placeholder="منتج أو SKU…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select value={state} onChange={setState} placeholder="كل الحالات" className="w-40" options={[
              { value: 'ok', label: 'متوفر' }, { value: 'low', label: 'منخفض' }, { value: 'out', label: 'نفد' },
            ]} />
          </div>
        )}

        {tab === 'stock' && (
          <Table head={['المنتج', 'المقاس', 'SKU', 'الكمية', 'الحد الأدنى', 'قيمة المخزون', 'الحالة', '']}>
            {rows.slice(0, 300).map((r) => (
              <tr key={r.variantId} className="tr">
                <td className="td">
                  <div className="flex items-center gap-2">
                    <img src={r.image} alt="" className="h-7 w-7 rounded-md object-cover" />
                    <span className="truncate max-w-[190px]">{r.product}</span>
                  </div>
                </td>
                <td className="td num font-medium">{r.size}</td>
                <td className="td num text-ink-400">{r.sku}</td>
                <td className={clsx('td num font-semibold',
                  r.state === 'out' ? 'text-rose-600' : r.state === 'low' ? 'text-saffron-700' : 'text-ink-800')}>
                  {r.on_hand}
                </td>
                <td className="td num text-ink-400">{r.min}</td>
                <td className="td num">{fmtMoney(r.value)}</td>
                <td className="td">
                  {r.state === 'out' ? <Badge tone="rose">نفد</Badge>
                    : r.state === 'low' ? <Badge tone="amber">منخفض</Badge>
                      : <Badge tone="emerald">متوفر</Badge>}
                </td>
                <td className="td">
                  {allows('inventory.edit') && (
                    <button className="text-[12px] text-brand-600 hover:underline flex items-center gap-1"
                      onClick={() => setAdjust(r.variantId)}>
                      <ArrowUpDown size={12} /> تعديل
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}

        {tab === 'restock' && (
          <>
            <Table head={['المنتج', 'المقاس', 'الكمية الحالية', 'الحد الأدنى', 'الكمية الموصى بشرائها', 'قيمة إعادة التخزين']}
              empty="كل المقاسات فوق الحد الأدنى 🎉">
              {restock.map((r) => (
                <tr key={r.variantId} className="tr">
                  <td className="td">{r.product}</td>
                  <td className="td num">{r.size}</td>
                  <td className={clsx('td num font-semibold', r.on_hand === 0 ? 'text-rose-600' : 'text-saffron-700')}>{r.on_hand}</td>
                  <td className="td num text-ink-400">{r.min}</td>
                  <td className="td num font-semibold text-brand-700">{r.suggested}</td>
                  <td className="td num">{fmtMoney(r.suggested * r.cost)}</td>
                </tr>
              ))}
            </Table>
            {restock.length > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-[#eef0f4] bg-[#fafbfc]">
                <span className="text-[13px] text-ink-500">إجمالي قيمة إعادة التخزين</span>
                <span className="num text-[15px] font-semibold">
                  {fmtMoney(restock.reduce((a, r) => a + r.suggested * r.cost, 0))}
                </span>
              </div>
            )}
          </>
        )}

        {tab === 'movements' && (
          <Table head={['النوع', 'المنتج', 'المقاس', 'الكمية', 'الرصيد', 'المرجع', 'المستخدم', 'الوقت']}>
            {db.movements.slice(0, 300).map((m) => {
              const v = db.variants.find((x) => x.id === m.variant_id);
              const p = db.products.find((x) => x.id === v?.product_id);
              return (
                <tr key={m.id} className="tr">
                  <td className="td"><Badge tone={MOVEMENT_TYPE[m.type].tone}>{MOVEMENT_TYPE[m.type].label}</Badge></td>
                  <td className="td truncate max-w-[190px]">{p?.name}</td>
                  <td className="td num">{v?.size}</td>
                  <td className={clsx('td num font-semibold', m.quantity > 0 ? 'text-emerald-600' : 'text-rose-600')}>
                    {m.quantity > 0 ? '+' : ''}{m.quantity}
                  </td>
                  <td className="td num">{m.balance_after}</td>
                  <td className="td text-[11.5px] text-ink-400">{m.reference_label ?? '—'}</td>
                  <td className="td text-[11.5px] text-ink-400">{m.created_by_name ?? 'النظام'}</td>
                  <td className="td text-[11.5px] text-ink-400">{fmtDateTime(m.created_at)}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <AdjustModal variantId={adjust} onClose={() => setAdjust(null)} onSubmit={adjustStock} />
    </>
  );
}

function AdjustModal({ variantId, onClose, onSubmit }: {
  variantId: string | null; onClose: () => void;
  onSubmit: (i: { variant_id: string; type: MovementType; quantity: number; note?: string }) => Promise<void>;
}) {
  const { db } = useApp();
  const [type, setType] = useState<MovementType>('purchase_in');
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');

  const v = db?.variants.find((x) => x.id === variantId);
  const p = db?.products.find((x) => x.id === v?.product_id);
  const current = db && v ? availableStock(db, v.id) : 0;

  return (
    <Modal
      open={!!variantId} onClose={onClose}
      title={`تعديل مخزون — ${p?.name ?? ''} مقاس ${v?.size ?? ''}`}
      footer={<>
        <button className="btn-primary" onClick={async () => {
          await onSubmit({ variant_id: variantId!, type, quantity: qty, note });
          setQty(1); setNote(''); onClose();
        }}>تطبيق</button>
        <button className="btn-ghost" onClick={onClose}>إلغاء</button>
      </>}
    >
      <div className="space-y-3">
        <div className="bg-ground rounded-lg px-3 py-2 text-[13px] flex justify-between">
          <span className="text-ink-500">الكمية الحالية</span>
          <span className="num font-semibold">{current}</span>
        </div>
        <Field label="نوع الحركة">
          <Select value={type} onChange={(x) => setType(x as MovementType)} options={[
            { value: 'purchase_in', label: 'توريد / شراء (+)' },
            { value: 'adjustment_in', label: 'تسوية زيادة (+)' },
            { value: 'adjustment_out', label: 'تسوية نقص (−)' },
            { value: 'return_in', label: 'إرجاع للمخزون (+)' },
          ]} />
        </Field>
        <Field label="الكمية">
          <input type="number" min={1} className="input num" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
        </Field>
        <Field label="ملاحظة" hint="تظهر في سجل الحركات">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="سبب التعديل" />
        </Field>
        <div className="text-[12.5px] text-ink-500 bg-brand-50 rounded-lg px-3 py-2">
          الرصيد بعد التطبيق:{' '}
          <b className="num">{type.endsWith('_out') ? current - qty : current + qty}</b>
        </div>
      </div>
    </Modal>
  );
}
