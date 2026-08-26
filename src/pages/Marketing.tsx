/**
 * SHOES OS — Ads Manager.
 * The rule of this page: a campaign is judged on DELIVERED orders and real
 * profit, never on raw order count. That is the difference between a
 * dashboard and a decision.
 */
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Plus, Download, Megaphone, TrendingUp, Target, Wallet } from 'lucide-react';
import { useApp } from '../app/store';
import { Badge, Card, Field, Modal, PageHeader, Select, Stat, Table, Autocomplete } from '../ui/kit';
import { Bars } from '../ui/charts';
import { campaignPerformance, filterOrders, marketingKpis } from '../core/analytics';
import { fmtMoney, fmtPct } from '../core/money';
import { AD_PLATFORM } from '../core/enums';
import { dataPort } from '../data';
import { toCsv, download } from '../lib/export';

export default function Marketing() {
  const { db, range, run, allows } = useApp();
  const [open, setOpen] = useState(false);

  const perf = useMemo(() => {
    if (!db) return [];
    return campaignPerformance(db, filterOrders(db, { range }), range);
  }, [db, range]);

  if (!db) return null;
  const orders = filterOrders(db, { range });
  const m = marketingKpis(db, orders, range);
  const active = perf.filter((p) => p.spend > 0);

  const byPlatform = Object.entries(
    active.reduce<Record<string, { spend: number; revenue: number; profit: number; delivered: number }>>((acc, c) => {
      const k = AD_PLATFORM[c.platform].label;
      acc[k] ??= { spend: 0, revenue: 0, profit: 0, delivered: 0 };
      acc[k].spend += c.spend; acc[k].revenue += c.revenue;
      acc[k].profit += c.profit; acc[k].delivered += c.delivered;
      return acc;
    }, {}),
  ).map(([name, v]) => ({ name, ...v }));

  return (
    <>
      <PageHeader
        title="إدارة الإعلانات"
        subtitle={`${active.length} حملة نشطة — ${range.label}`}
        actions={<>
          <button className="btn-ghost gap-1.5" onClick={() => download('campaigns.csv', toCsv(perf.map((c) => ({
            'الحملة': c.campaign, 'المنصة': AD_PLATFORM[c.platform].label,
            'الإنفاق': c.spend, 'الطلبات': c.orders, 'مؤكد': c.confirmed, 'مسلّم': c.delivered,
            'المداخيل': c.revenue, 'الربح': c.profit, 'ROAS': c.roas, 'ROI %': c.roi,
            'CPA': c.cpa, 'تكلفة الطلب المسلّم': c.costPerDelivered, 'CTR %': c.ctr, 'CPC': c.cpc,
          }))))}><Download size={14} /> تصدير</button>
          {allows('marketing.create') && (
            <button className="btn-primary gap-1.5" onClick={() => setOpen(true)}>
              <Plus size={15} /> تسجيل إنفاق
            </button>
          )}
        </>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-3">
        <Stat label="الإنفاق الإعلاني" value={m.adSpend} money compact tone="violet" icon={<Megaphone size={14} />} />
        <Stat label="ROAS" value={m.roas.toFixed(2)} tone={m.roas >= 2 ? 'emerald' : 'rose'}
          icon={<TrendingUp size={14} />} sub="مداخيل ÷ إنفاق" />
        <Stat label="ROI" value={`${m.roi.toFixed(0)}%`} tone={m.roi >= 0 ? 'emerald' : 'rose'} />
        <Stat label="CPA" value={m.cpa} money tone="blue" icon={<Target size={14} />} sub="لكل طلب" />
        <Stat label="تكلفة الطلب المسلّم" value={m.costPerDelivered} money tone="indigo"
          icon={<Wallet size={14} />} sub="المقياس الحقيقي" />
      </div>

      <div className="grid xl:grid-cols-3 gap-3 mb-3">
        <Card title="الأداء حسب المنصة" subtitle="الإنفاق مقابل الربح" className="xl:col-span-2">
          <Bars
            data={byPlatform} x="name" height={230} currency
            series={[
              { key: 'spend', name: 'الإنفاق', color: '#8b5cf6' },
              { key: 'revenue', name: 'المداخيل', color: '#10b981' },
              { key: 'profit', name: 'الربح', color: '#4f46e5' },
            ]}
          />
        </Card>
        <Card title="مقاييس التحويل" subtitle="من النقرة إلى التسليم">
          <div className="space-y-3">
            {[
              ['الانطباعات', m.impressions.toLocaleString('fr-MA')],
              ['النقرات', m.clicks.toLocaleString('fr-MA')],
              ['CTR', fmtPct(m.ctr, 2)],
              ['CPC', fmtMoney(m.cpc, 'MAD', 2)],
              ['CPL', fmtMoney(m.cpl, 'MAD', 2)],
              ['نقطة التعادل للطلب', fmtMoney(m.breakEvenPoint)],
            ].map(([l, v]) => (
              <div key={l} className="flex items-center justify-between border-b border-[#f5f6f8] pb-2">
                <span className="text-[12.5px] text-ink-500">{l}</span>
                <span className="num text-[13.5px] font-medium text-ink-800">{v}</span>
              </div>
            ))}
          </div>
          <p className="text-[11.5px] text-ink-400 mt-3 leading-relaxed">
            «نقطة التعادل للطلب» هي أقصى تكلفة إعلان يمكن تحملها لكل طلب مسلّم قبل أن يتحول الربح إلى خسارة.
          </p>
        </Card>
      </div>

      <Card title="أداء الحملات" subtitle="مرتبة حسب الربح الحقيقي" padded={false}>
        <Table head={['الحملة', 'المنصة', 'الإنفاق', 'طلبات', 'مؤكد', 'مسلّم', 'المداخيل', 'ROAS', 'تكلفة المسلّم', 'الربح']}>
          {perf.map((c) => (
            <tr key={c.campaignId} className="tr">
              <td className="td font-medium max-w-[220px] truncate">{c.campaign}</td>
              <td className="td"><Badge tone={AD_PLATFORM[c.platform].tone} dot={false}>{AD_PLATFORM[c.platform].label}</Badge></td>
              <td className="td num">{fmtMoney(c.spend)}</td>
              <td className="td num">{c.orders}</td>
              <td className="td num">{c.confirmed}</td>
              <td className="td num text-emerald-600 font-medium">{c.delivered}</td>
              <td className="td num">{fmtMoney(c.revenue)}</td>
              <td className="td">
                <span className={clsx('num font-semibold',
                  c.roas >= 2.5 ? 'text-emerald-600' : c.roas >= 1.5 ? 'text-saffron-700' : 'text-rose-600')}>
                  {c.roas.toFixed(2)}
                </span>
              </td>
              <td className="td num">{fmtMoney(c.costPerDelivered)}</td>
              <td className={clsx('td num font-semibold', c.profit >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                {fmtMoney(c.profit)}
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <SpendModal open={open} onClose={() => setOpen(false)} onSave={run} />
    </>
  );
}

function SpendModal({ open, onClose, onSave }: {
  open: boolean; onClose: () => void;
  onSave: <T>(fn: () => Promise<T>, msg?: string) => Promise<T | undefined>;
}) {
  const { db } = useApp();
  const [campaignId, setCampaignId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [spend, setSpend] = useState(0);
  const [impressions, setImpressions] = useState(0);
  const [clicks, setClicks] = useState(0);
  const [newName, setNewName] = useState('');
  const [platformId, setPlatformId] = useState('');

  if (!db) return null;

  const save = async () => {
    await onSave(async () => {
      const port = dataPort();
      let id = campaignId;
      if (!id && newName) {
        const c = await port.upsertCampaign({
          name: newName, platform_id: platformId || db.platforms[0].id, status: 'active',
        });
        id = c.id;
      }
      if (!id) throw new Error('اختر حملة أو أنشئ واحدة');
      await port.addAdSpend({ campaign_id: id, date, spend, impressions, clicks });
      await port.allocateAdCost(date);
      return true;
    }, 'تم تسجيل الإنفاق وتوزيعه على طلبات اليوم');
    onClose();
  };

  return (
    <Modal
      open={open} onClose={onClose} title="تسجيل إنفاق إعلاني"
      footer={<>
        <button className="btn-primary" onClick={save}>حفظ</button>
        <button className="btn-ghost" onClick={onClose}>إلغاء</button>
      </>}
    >
      <div className="space-y-3">
        <Field label="الحملة">
          <Autocomplete value={campaignId} onChange={setCampaignId} placeholder="اختر حملة موجودة"
            options={db.campaigns.map((c) => ({ value: c.id, label: c.name }))} />
        </Field>
        {!campaignId && (
          <div className="grid sm:grid-cols-2 gap-3 border border-dashed border-[#e4e7ec] rounded-lg p-3">
            <Field label="أو أنشئ حملة جديدة">
              <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="اسم الحملة" />
            </Field>
            <Field label="المنصة">
              <Select value={platformId} onChange={setPlatformId} placeholder="اختر المنصة"
                options={db.platforms.map((p) => ({ value: p.id, label: p.name }))} />
            </Field>
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="التاريخ">
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="الإنفاق (MAD)">
            <input type="number" className="input num" value={spend} onChange={(e) => setSpend(Number(e.target.value))} />
          </Field>
          <Field label="الانطباعات" hint="اختياري">
            <input type="number" className="input num" value={impressions} onChange={(e) => setImpressions(Number(e.target.value))} />
          </Field>
          <Field label="النقرات" hint="اختياري">
            <input type="number" className="input num" value={clicks} onChange={(e) => setClicks(Number(e.target.value))} />
          </Field>
        </div>
        <p className="text-[12px] text-ink-400 bg-ground rounded-lg px-3 py-2">
          بعد الحفظ يوزّع النظام الإنفاق تلقائياً على طلبات نفس اليوم المرتبطة بالحملة،
          فيصبح لكل طلب تكلفة إعلان حقيقية وربح صافٍ دقيق.
        </p>
      </div>
    </Modal>
  );
}
