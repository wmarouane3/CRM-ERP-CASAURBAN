/**
 * SHOES OS — Finance.
 * A real P&L: costs that the system already knows (product, shipping,
 * returns, ads) are never double-counted with the expenses you type in.
 */
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Plus, Download, Trash2 } from 'lucide-react';
import { useApp } from '../app/store';
import { Badge, Card, Field, Modal, PageHeader, Select, Stat, Table, Tabs } from '../ui/kit';
import { AreaTrend, Donut } from '../ui/charts';
import { expenseBreakdown, filterOrders, financeKpis, timeSeries } from '../core/analytics';
import { EXPENSE_CATEGORY, CHART_COLORS } from '../core/enums';
import { fmtMoney, fmtPct } from '../core/money';
import { fmtDate, inRange } from '../core/dates';
import { dataPort } from '../data';
import { toCsv, download } from '../lib/export';
import type { ExpenseCategory } from '../core/types';

export default function Finance() {
  const { db, range, run, allows } = useApp();
  const [tab, setTab] = useState('pnl');
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('');

  const data = useMemo(() => {
    if (!db) return null;
    const orders = filterOrders(db, { range });
    return {
      orders,
      f: financeKpis(db, orders, range),
      series: timeSeries(db, orders, range),
      breakdown: expenseBreakdown(db, range, orders),
      expenses: db.expenses
        .filter((e) => inRange(e.date, range))
        .filter((e) => !category || e.category === category)
        .sort((a, b) => b.date.localeCompare(a.date)),
    };
  }, [db, range, category]);

  if (!db || !data) return null;
  const { f, series, breakdown, expenses } = data;

  return (
    <>
      <PageHeader
        title="المالية"
        subtitle={`${range.label} — هامش ربح ${fmtPct(f.profitMargin)}`}
        actions={<>
          <button className="btn-ghost gap-1.5" onClick={() => download('expenses.csv', toCsv(expenses.map((e) => ({
            'التاريخ': e.date, 'الفئة': EXPENSE_CATEGORY[e.category].label, 'المبلغ': e.amount,
            'الوصف': e.description ?? '', 'طريقة الدفع': e.payment_method, 'تلقائي': e.is_auto ? 'نعم' : 'لا',
          }))))}><Download size={14} /> تصدير</button>
          {allows('finance.create') && (
            <button className="btn-primary gap-1.5" onClick={() => setOpen(true)}><Plus size={15} /> مصروف جديد</button>
          )}
        </>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-3">
        <Stat label="المداخيل" value={f.revenue} money compact tone="emerald" sub="الطلبات المسلّمة" />
        <Stat label="الربح الإجمالي" value={f.grossProfit} money compact tone="blue" />
        <Stat label="مصاريف التشغيل" value={f.operatingExpenses} money compact tone="amber" />
        <Stat label="الربح الصافي" value={f.netProfit} money compact
          tone={f.netProfit >= 0 ? 'emerald' : 'rose'} sub={`هامش ${fmtPct(f.profitMargin)}`} />
        <Stat label="الربح لكل طلب مسلّم" value={f.profitPerDeliveredOrder} money tone="indigo" />
      </div>

      <Card padded={false}>
        <div className="px-3 pt-2">
          <Tabs tabs={[
            { id: 'pnl', label: 'قائمة الدخل' },
            { id: 'expenses', label: 'المصاريف', count: expenses.length },
          ]} active={tab} onChange={setTab} />
        </div>

        {tab === 'pnl' && (
          <div className="p-4 grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1">
              <h4 className="text-[12px] font-semibold text-ink-500 uppercase tracking-wide mb-3">قائمة الدخل</h4>
              {[
                ['المداخيل المحققة', f.revenue, 'text-emerald-600 font-semibold'],
                ['− تكلفة البضاعة المباعة', -f.productCost, ''],
                ['= الربح الإجمالي', f.grossProfit, 'font-semibold border-y border-[#eef0f4]'],
                ['− الشحن', -f.shippingCost, ''],
                ['− التغليف', -f.packagingCost, ''],
                ['− المرتجعات والرفض', -f.returnCost, ''],
                ['− الإعلانات', -f.adSpend, ''],
                ['− مصاريف تشغيلية أخرى', -f.otherExpenses, ''],
                ['= مجموع مصاريف التشغيل', -f.operatingExpenses, 'font-semibold border-y border-[#eef0f4]'],
              ].map(([l, v, cls], i) => (
                <div key={i} className={clsx('flex items-center justify-between py-2 text-[13px]', cls as string)}>
                  <span className="text-ink-600">{l as string}</span>
                  <span className={clsx('num', (v as number) < 0 && 'text-rose-600')}>{fmtMoney(v as number)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-3 mt-2 border-t-2 border-ink-900">
                <span className="text-[14px] font-semibold">الربح الصافي</span>
                <span className={clsx('num text-[18px] font-bold', f.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                  {fmtMoney(f.netProfit)}
                </span>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-4">
              <div>
                <h4 className="text-[12px] font-semibold text-ink-500 uppercase tracking-wide mb-2">تطور الربح</h4>
                <AreaTrend data={series} x="label" height={200}
                  series={[
                    { key: 'revenue', name: 'المداخيل', color: '#10b981' },
                    { key: 'profit', name: 'الربح الصافي', color: '#5B55D9' },
                  ]} />
              </div>
              <div>
                <h4 className="text-[12px] font-semibold text-ink-500 uppercase tracking-wide mb-2">توزيع التكاليف</h4>
                <Donut height={200} data={breakdown.map((b, i) => ({
                  name: EXPENSE_CATEGORY[b.category].label, value: b.amount,
                  color: CHART_COLORS[i % CHART_COLORS.length],
                }))} />
              </div>
            </div>
          </div>
        )}

        {tab === 'expenses' && (
          <>
            <div className="p-3">
              <Select value={category} onChange={setCategory} placeholder="كل الفئات" className="w-52"
                options={Object.entries(EXPENSE_CATEGORY).map(([v, m]) => ({ value: v, label: m.label }))} />
            </div>
            <Table head={['التاريخ', 'الفئة', 'الوصف', 'طريقة الدفع', 'المصدر', 'المبلغ', '']}>
              {expenses.slice(0, 300).map((e) => (
                <tr key={e.id} className="tr">
                  <td className="td num">{fmtDate(e.date)}</td>
                  <td className="td"><Badge tone={EXPENSE_CATEGORY[e.category].tone}>{EXPENSE_CATEGORY[e.category].label}</Badge></td>
                  <td className="td">{e.description ?? '—'}</td>
                  <td className="td text-ink-400">{e.payment_method}</td>
                  <td className="td">
                    {e.is_auto ? <Badge tone="cyan" dot={false}>تلقائي</Badge> : <Badge tone="zinc" dot={false}>يدوي</Badge>}
                  </td>
                  <td className="td num font-medium text-rose-600">{fmtMoney(e.amount)}</td>
                  <td className="td">
                    {!e.is_auto && allows('finance.delete') && (
                      <button className="text-ink-300 hover:text-rose-600"
                        onClick={() => run(() => dataPort().deleteExpense(e.id), 'تم حذف المصروف')}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          </>
        )}
      </Card>

      <ExpenseModal open={open} onClose={() => setOpen(false)} onSave={run} />
    </>
  );
}

function ExpenseModal({ open, onClose, onSave }: {
  open: boolean; onClose: () => void;
  onSave: <T>(fn: () => Promise<T>, msg?: string) => Promise<T | undefined>;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<ExpenseCategory>('other');
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState('');
  const [method, setMethod] = useState('cash');

  return (
    <Modal
      open={open} onClose={onClose} title="مصروف جديد"
      footer={<>
        <button className="btn-primary" disabled={!amount} onClick={async () => {
          await onSave(() => dataPort().addExpense({
            date, category, amount, description,
            payment_method: method as 'cash',
          }), 'تمت إضافة المصروف');
          setAmount(0); setDescription(''); onClose();
        }}>حفظ</button>
        <button className="btn-ghost" onClick={onClose}>إلغاء</button>
      </>}
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="التاريخ">
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="الفئة">
          <Select value={category} onChange={(v) => setCategory(v as ExpenseCategory)}
            options={Object.entries(EXPENSE_CATEGORY).map(([v, m]) => ({ value: v, label: m.label }))} />
        </Field>
        <Field label="المبلغ (MAD)">
          <input type="number" className="input num" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </Field>
        <Field label="طريقة الدفع">
          <Select value={method} onChange={setMethod} options={[
            { value: 'cash', label: 'نقداً' }, { value: 'bank_transfer', label: 'تحويل بنكي' },
            { value: 'card', label: 'بطاقة' }, { value: 'other', label: 'أخرى' },
          ]} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="الوصف">
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="مثال: كراء المستودع — غشت" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
