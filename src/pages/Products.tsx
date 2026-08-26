/**
 * SHOES OS — Products.
 * A product is a card; a size is a variant with its own SKU, price and
 * stock. Adding a product creates every size in one step.
 */
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Plus, Search, Package } from 'lucide-react';
import { useApp } from '../app/store';
import { Badge, Card, Field, Modal, PageHeader, Select, Empty } from '../ui/kit';
import { fmtMoney, pct } from '../core/money';
import { dataPort } from '../data';
import { availableStock } from '../data/demo/engine';
import type { Product } from '../core/types';

const DEFAULT_SIZES = ['39', '40', '41', '42', '43', '44', '45'];

export default function Products() {
  const { db, allows, run } = useApp();
  const [q, setQ] = useState('');
  const [brand, setBrand] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const list = useMemo(() => {
    if (!db) return [];
    return db.products.filter((p) => {
      if (brand && p.brand !== brand) return false;
      if (q && !`${p.name} ${p.model} ${p.brand}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [db, q, brand]);

  if (!db) return null;
  const brands = [...new Set(db.products.map((p) => p.brand).filter(Boolean))] as string[];

  return (
    <>
      <PageHeader
        title="المنتجات"
        subtitle={`${db.products.length} منتج · ${db.variants.length} مقاس`}
        actions={allows('products.create') && (
          <button className="btn-primary gap-1.5" onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus size={15} /> منتج جديد
          </button>
        )}
      />

      <Card padded={false} className="mb-3">
        <div className="flex flex-wrap gap-2 p-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-300" />
            <input className="input pr-9" placeholder="ابحث عن منتج…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={brand} onChange={setBrand} placeholder="كل العلامات" className="w-44"
            options={brands.map((b) => ({ value: b, label: b }))} />
        </div>
      </Card>

      {list.length === 0 ? (
        <Card><Empty title="لا توجد منتجات" hint="أضف أول منتج لتبدأ." /></Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
          {list.map((p) => {
            const variants = db.variants.filter((v) => v.product_id === p.id);
            const stock = variants.reduce((a, v) => a + availableStock(db, v.id), 0);
            const low = variants.filter((v) => availableStock(db, v.id) <= v.min_stock).length;
            const margin = pct(p.selling_price - p.cost_price, p.selling_price);
            return (
              <div key={p.id} className="card p-3 flex flex-col gap-3">
                <div className="flex gap-3">
                  <img src={p.image_url} alt="" className="h-14 w-14 rounded-xl object-cover shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-[13.5px] font-semibold text-ink-900 leading-tight">{p.name}</h3>
                      {stock === 0
                        ? <Badge tone="rose">نفد</Badge>
                        : low > 0 ? <Badge tone="amber">منخفض</Badge> : <Badge tone="emerald">متوفر</Badge>}
                    </div>
                    <p className="num text-[11px] text-ink-400 mt-0.5">{p.brand} · {p.model} · {p.reference}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-ground py-1.5">
                    <div className="num text-[13px] font-semibold text-ink-800">{fmtMoney(p.selling_price)}</div>
                    <div className="text-[10px] text-ink-400">سعر البيع</div>
                  </div>
                  <div className="rounded-lg bg-ground py-1.5">
                    <div className="num text-[13px] font-semibold text-ink-800">{fmtMoney(p.cost_price)}</div>
                    <div className="text-[10px] text-ink-400">التكلفة</div>
                  </div>
                  <div className="rounded-lg bg-ground py-1.5">
                    <div className="num text-[13px] font-semibold text-emerald-600">{margin.toFixed(0)}%</div>
                    <div className="text-[10px] text-ink-400">الهامش</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1">
                  {variants.map((v) => {
                    const s = availableStock(db, v.id);
                    return (
                      <span key={v.id} title={`SKU ${v.sku}`} className={clsx(
                        'num inline-flex flex-col items-center justify-center h-9 min-w-[40px] rounded-lg border text-[11.5px] leading-none gap-0.5',
                        s === 0 ? 'border-[#eef0f4] text-ink-200'
                          : s <= v.min_stock ? 'border-saffron-500/40 bg-saffron-100 text-saffron-700'
                            : 'border-[#e4e7ec] text-ink-700',
                      )}>
                        <b>{v.size}</b><span className="text-[9.5px] opacity-70">{s}</span>
                      </span>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between mt-auto pt-1">
                  <span className="num text-[11.5px] text-ink-400">{stock} قطعة · قيمة {fmtMoney(stock * p.cost_price)}</span>
                  {allows('products.edit') && (
                    <button className="text-[12px] text-brand-600 hover:underline"
                      onClick={() => { setEditing(p); setOpen(true); }}>تعديل</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ProductModal open={open} onClose={() => setOpen(false)} product={editing} onSaved={run} />
    </>
  );
}

function ProductModal({ open, onClose, product, onSaved }: {
  open: boolean; onClose: () => void; product: Product | null;
  onSaved: <T>(fn: () => Promise<T>, msg?: string) => Promise<T | undefined>;
}) {
  const { db } = useApp();
  const [form, setForm] = useState({
    name: '', brand: '', model: '', category: 'رياضي',
    cost_price: 0, selling_price: 0, min_stock: 3,
  });
  const [sizes, setSizes] = useState<Record<string, number>>(
    Object.fromEntries(DEFAULT_SIZES.map((s) => [s, 0])),
  );
  const [ready, setReady] = useState(false);

  // seed the form when the modal opens
  if (open && !ready) {
    setReady(true);
    if (product && db) {
      setForm({
        name: product.name, brand: product.brand ?? '', model: product.model ?? '',
        category: product.category ?? 'رياضي',
        cost_price: product.cost_price, selling_price: product.selling_price, min_stock: 3,
      });
      const map: Record<string, number> = {};
      for (const v of db.variants.filter((x) => x.product_id === product.id)) {
        map[v.size] = availableStock(db, v.id);
      }
      setSizes({ ...Object.fromEntries(DEFAULT_SIZES.map((s) => [s, 0])), ...map });
    }
  }
  if (!open && ready) setReady(false);

  const save = async () => {
    await onSaved(async () => {
      const port = dataPort();
      const saved = await port.upsertProduct({
        id: product?.id,
        name: form.name, brand: form.brand, model: form.model, category: form.category,
        cost_price: form.cost_price, selling_price: form.selling_price,
        image_url: product?.image_url,
        status: 'active',
      });
      for (const [size, qty] of Object.entries(sizes)) {
        const variant = await port.upsertVariant({
          product_id: saved.id, size,
          sku: `${form.model || saved.reference}-${size}`,
          cost_price: form.cost_price, selling_price: form.selling_price,
          min_stock: form.min_stock,
        });
        const current = db ? availableStock(db, variant.id) : 0;
        const diff = qty - current;
        if (diff !== 0) {
          await port.adjustStock({
            variant_id: variant.id,
            type: diff > 0 ? 'purchase_in' : 'adjustment_out',
            quantity: Math.abs(diff),
            note: product ? 'تعديل المخزون من صفحة المنتج' : 'مخزون افتتاحي',
          });
        }
      }
      return saved;
    }, product ? 'تم تحديث المنتج' : 'تمت إضافة المنتج والمقاسات');
    onClose();
  };

  return (
    <Modal
      open={open} onClose={onClose} wide
      title={product ? `تعديل — ${product.name}` : 'منتج جديد'}
      footer={<>
        <button className="btn-primary" disabled={!form.name || !form.selling_price} onClick={save}>
          {product ? 'حفظ التعديلات' : 'إضافة المنتج'}
        </button>
        <button className="btn-ghost" onClick={onClose}>إلغاء</button>
      </>}
    >
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="اسم المنتج">
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nike Air Force 1 Low" />
          </Field>
          <Field label="العلامة التجارية">
            <input className="input" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })}
              placeholder="Nike" />
          </Field>
          <Field label="الموديل / المرجع">
            <input className="input num" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}
              placeholder="AF1-WHT" />
          </Field>
          <Field label="التصنيف">
            <Select value={form.category} onChange={(v) => setForm({ ...form, category: v })}
              options={['رياضي', 'كلاسيكي', 'كاجوال', 'جري', 'بوت', 'تريل'].map((c) => ({ value: c, label: c }))} />
          </Field>
          <Field label="سعر التكلفة">
            <input type="number" className="input num" value={form.cost_price}
              onChange={(e) => setForm({ ...form, cost_price: Number(e.target.value) })} />
          </Field>
          <Field label="سعر البيع">
            <input type="number" className="input num" value={form.selling_price}
              onChange={(e) => setForm({ ...form, selling_price: Number(e.target.value) })} />
          </Field>
        </div>

        {form.selling_price > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-[12.5px] text-emerald-800">
            الهامش الإجمالي: <b className="num">{fmtMoney(form.selling_price - form.cost_price)}</b>
            {' '}({pct(form.selling_price - form.cost_price, form.selling_price).toFixed(0)}%) قبل الشحن والإعلان.
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="label mb-0 flex items-center gap-1.5"><Package size={13} /> المقاسات والكميات</span>
            <div className="flex items-center gap-2">
              <span className="text-[11.5px] text-ink-400">الحد الأدنى للتنبيه</span>
              <input type="number" className="input num w-16 h-8" value={form.min_stock}
                onChange={(e) => setForm({ ...form, min_stock: Number(e.target.value) })} />
            </div>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {DEFAULT_SIZES.map((s) => (
              <div key={s} className="text-center">
                <div className="num text-[12px] font-semibold text-ink-600 mb-1">{s}</div>
                <input type="number" min={0} value={sizes[s] ?? 0}
                  onChange={(e) => setSizes({ ...sizes, [s]: Math.max(0, Number(e.target.value)) })}
                  className="input num h-9 text-center px-1" />
              </div>
            ))}
          </div>
          <p className="text-[11.5px] text-ink-400 mt-2">
            كل مقاس يُنشأ كـ SKU مستقل. أي تغيير في الكمية يُسجَّل كحركة مخزون قابلة للتدقيق.
          </p>
        </div>
      </div>
    </Modal>
  );
}
