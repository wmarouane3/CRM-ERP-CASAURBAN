/**
 * SHOES OS — Quick Order.
 * Minimum typing: pick product → sizes with live stock appear, prices and
 * shipping fill themselves, profit is computed as you type.
 */
import { useMemo, useState } from 'react';
import { Trash2, Plus, UserCheck } from 'lucide-react';
import { useApp } from '../app/store';
import { Autocomplete, Field, Modal, Select } from '../ui/kit';
import { computeProfit } from '../core/profit';
import { fmtMoney } from '../core/money';
import { normalizePhone } from '../core/validation';
import { availableStock } from '../data/demo/engine';

interface Line { variant_id: string; quantity: number; unit_price: number }

export function NewOrderModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, createOrder } = useApp();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [cityId, setCityId] = useState('');
  const [address, setAddress] = useState('');
  const [productId, setProductId] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [campaignId, setCampaignId] = useState('');
  const [channel, setChannel] = useState('manual');
  const [discount, setDiscount] = useState(0);
  const [shipping, setShipping] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const city = db?.cities.find((c) => c.id === cityId);
  const shippingCost = shipping === '' ? (city?.default_shipping_cost ?? db?.settings.default_shipping_cost ?? 35) : Number(shipping);

  // known customer auto-fill
  const known = useMemo(() => {
    if (!db || normalizePhone(phone).length < 9) return undefined;
    return db.customers.find((c) => normalizePhone(c.phone) === normalizePhone(phone));
  }, [db, phone]);

  const variants = useMemo(() => {
    if (!db || !productId) return [];
    return db.variants
      .filter((v) => v.product_id === productId && v.is_active)
      .map((v) => ({
        ...v,
        stock: availableStock(db, v.id),
      }));
  }, [db, productId]);

  const profit = useMemo(() => computeProfit({
    status: 'new',
    items: lines.map((l) => {
      const v = db?.variants.find((x) => x.id === l.variant_id);
      return { quantity: l.quantity, unit_price: l.unit_price, unit_cost: v?.cost_price ?? 0 };
    }),
    discount,
    shipping_cost: shippingCost,
    packaging_cost: db?.settings.default_packaging_cost ?? 0,
  }), [lines, db, discount, shippingCost]);

  if (!db) return null;

  const addLine = (variantId: string) => {
    const v = db.variants.find((x) => x.id === variantId)!;
    if (lines.some((l) => l.variant_id === variantId)) return;
    setLines([...lines, { variant_id: variantId, quantity: 1, unit_price: v.selling_price }]);
  };

  const reset = () => {
    setName(''); setPhone(''); setCityId(''); setAddress('');
    setProductId(''); setLines([]); setDiscount(0); setShipping('');
    setNotes(''); setCampaignId(''); setChannel('manual');
  };

  const submit = async () => {
    setBusy(true);
    const order = await createOrder({
      customer: {
        id: known?.id,
        full_name: name || known?.full_name || '',
        phone,
        city_id: cityId || known?.city_id,
        city_name: city?.name_ar ?? known?.city_name,
        address: address || known?.address,
      },
      lines: lines.map((l) => ({ variant_id: l.variant_id, quantity: l.quantity, unit_price: l.unit_price })),
      discount,
      shipping_cost: shippingCost,
      channel,
      ad_campaign_id: campaignId || undefined,
      source: db.campaigns.find((c) => c.id === campaignId)?.name,
      notes,
    });
    setBusy(false);
    if (order) { reset(); onClose(); }
  };

  const valid = phone.length >= 9 && (name || known) && lines.length > 0 && cityId;

  return (
    <Modal
      open={open} onClose={onClose} title="طلب جديد" wide
      footer={
        <>
          <button className="btn-primary" disabled={!valid || busy} onClick={submit}>
            {busy ? 'جارٍ الإنشاء…' : 'إنشاء الطلب'}
          </button>
          <button className="btn-ghost" onClick={onClose}>إلغاء</button>
          <div className="mr-auto flex items-center gap-4 text-[12px]">
            <span className="text-ink-400">الإجمالي <b className="num text-ink-800">{fmtMoney(profit.revenue)}</b></span>
            <span className="text-ink-400">الربح المتوقع <b className={`num ${profit.net_profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtMoney(profit.net_profit)}</b></span>
          </div>
        </>
      }
    >
      <div className="space-y-5">
        {/* customer ------------------------------------------------ */}
        <div>
          <h4 className="text-[12px] font-semibold text-ink-500 uppercase tracking-wide mb-2.5">العميل</h4>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="الهاتف" hint="06XXXXXXXX">
              <input className="input num" value={phone} inputMode="tel"
                onChange={(e) => setPhone(e.target.value)} placeholder="0612345678" />
            </Field>
            <Field label="الاسم الكامل">
              <input className="input" value={name || known?.full_name || ''}
                onChange={(e) => setName(e.target.value)} placeholder="اسم العميل" />
            </Field>
            <Field label="المدينة">
              <Autocomplete
                value={cityId || known?.city_id || ''}
                onChange={setCityId}
                placeholder="اختر المدينة"
                options={db.cities.map((c) => ({
                  value: c.id, label: c.name_ar, hint: `${c.default_shipping_cost} MAD`,
                }))}
              />
            </Field>
            <Field label="العنوان">
              <input className="input" value={address || known?.address || ''}
                onChange={(e) => setAddress(e.target.value)} placeholder="الحي، الزنقة، الرقم" />
            </Field>
          </div>
          {known && (
            <div className="mt-2 flex items-center gap-2 text-[12px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <UserCheck size={14} />
              عميل معروف: {known.full_name} — {known.total_orders} طلب سابق، {known.delivered_orders} مسلّم
              {known.segment === 'high_risk' && <b className="text-rose-600">⚠ خطر مرتفع</b>}
            </div>
          )}
        </div>

        {/* products ------------------------------------------------ */}
        <div>
          <h4 className="text-[12px] font-semibold text-ink-500 uppercase tracking-wide mb-2.5">المنتجات</h4>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="المنتج">
              <Autocomplete
                value={productId} onChange={setProductId} placeholder="ابحث عن منتج"
                options={db.products.filter((p) => p.status !== 'archived').map((p) => ({
                  value: p.id, label: p.name, hint: fmtMoney(p.selling_price),
                }))}
              />
            </Field>
            <Field label="المقاس" hint="المخزون المتوفر بجانب كل مقاس">
              <div className="flex flex-wrap gap-1.5">
                {!productId && <span className="text-[12px] text-ink-300 py-2">اختر منتجاً أولاً</span>}
                {variants.map((v) => {
                  const added = lines.some((l) => l.variant_id === v.id);
                  return (
                    <button
                      key={v.id} type="button" disabled={v.stock <= 0 || added}
                      onClick={() => addLine(v.id)}
                      className={`num h-9 min-w-[52px] px-2 rounded-lg border text-[12.5px] transition-colors
                        ${v.stock <= 0 ? 'border-[#eef0f4] text-ink-200 line-through cursor-not-allowed'
                          : added ? 'border-brand-500 bg-brand-50 text-brand-700'
                            : 'border-[#e4e7ec] hover:border-brand-400 hover:bg-brand-50'}`}
                      title={v.stock <= 0 ? 'نفد المخزون' : `متوفر ${v.stock}`}
                    >
                      {v.size}
                      <span className={`block text-[9.5px] leading-none ${v.stock <= v.min_stock && v.stock > 0 ? 'text-saffron-700' : 'text-ink-300'}`}>
                        {v.stock}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>

          {lines.length > 0 && (
            <div className="mt-3 border border-[#e4e7ec] rounded-xl overflow-hidden">
              {lines.map((l) => {
                const v = db.variants.find((x) => x.id === l.variant_id)!;
                const p = db.products.find((x) => x.id === v.product_id)!;
                const stock = availableStock(db, v.id);
                return (
                  <div key={l.variant_id} className="flex items-center gap-2 px-3 py-2 border-b border-[#eef0f4] last:border-0">
                    <img src={p.image_url} alt="" className="h-9 w-9 rounded-lg object-cover shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-medium text-ink-800 truncate">{p.name}</div>
                      <div className="num text-[11px] text-ink-400">مقاس {v.size} · متوفر {stock} · تكلفة {fmtMoney(v.cost_price)}</div>
                    </div>
                    <input
                      type="number" min={1} max={stock} value={l.quantity}
                      onChange={(e) => setLines(lines.map((x) => x.variant_id === l.variant_id
                        ? { ...x, quantity: Math.max(1, Math.min(stock, Number(e.target.value))) } : x))}
                      className="input num w-16 h-8 text-center px-1"
                    />
                    <input
                      type="number" value={l.unit_price}
                      onChange={(e) => setLines(lines.map((x) => x.variant_id === l.variant_id
                        ? { ...x, unit_price: Number(e.target.value) } : x))}
                      className="input num w-24 h-8 text-center px-1"
                    />
                    <button onClick={() => setLines(lines.filter((x) => x.variant_id !== l.variant_id))}
                      className="h-8 w-8 grid place-items-center rounded-lg text-ink-300 hover:text-rose-600 hover:bg-rose-50">
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* commercials --------------------------------------------- */}
        <div>
          <h4 className="text-[12px] font-semibold text-ink-500 uppercase tracking-wide mb-2.5">التفاصيل التجارية</h4>
          <div className="grid sm:grid-cols-4 gap-3">
            <Field label="الخصم">
              <input type="number" className="input num" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
            </Field>
            <Field label="تكلفة الشحن" hint="من المدينة">
              <input type="number" className="input num" value={shipping === '' ? shippingCost : shipping}
                onChange={(e) => setShipping(Number(e.target.value))} />
            </Field>
            <Field label="القناة">
              <Select value={channel} onChange={setChannel} options={[
                { value: 'manual', label: 'يدوي' }, { value: 'shopify', label: 'Shopify' },
                { value: 'instagram', label: 'Instagram' }, { value: 'whatsapp', label: 'WhatsApp' },
                { value: 'phone', label: 'هاتف' },
              ]} />
            </Field>
            <Field label="الحملة الإعلانية">
              <Autocomplete value={campaignId} onChange={setCampaignId} placeholder="بدون"
                options={db.campaigns.map((c) => ({ value: c.id, label: c.name }))} />
            </Field>
          </div>
          <Field label="ملاحظات">
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="اختياري" />
          </Field>
        </div>

        {/* live P&L ------------------------------------------------- */}
        <div className="bg-ground border border-[#e4e7ec] rounded-xl p-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            ['المداخيل', profit.revenue],
            ['تكلفة المنتج', -profit.product_cost],
            ['الشحن + التغليف', -(profit.shipping_cost + profit.packaging_cost)],
            ['الربح المتوقع', profit.net_profit],
          ].map(([label, v], i) => (
            <div key={i}>
              <div className="text-[11px] text-ink-400">{label as string}</div>
              <div className={`num text-[15px] font-semibold ${(v as number) < 0 ? 'text-rose-600' : i === 3 ? 'text-emerald-600' : 'text-ink-800'}`}>
                {fmtMoney(v as number)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export function QuickOrderButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn-primary gap-1.5" onClick={() => setOpen(true)}>
        <Plus size={15} /> طلب جديد
      </button>
      <NewOrderModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
