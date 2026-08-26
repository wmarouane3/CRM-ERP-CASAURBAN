/**
 * SHOES OS — Business goals.
 * Targets are compared against the same KPI functions the dashboard uses,
 * so a goal can never disagree with the number next to it.
 */
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Plus, Target } from 'lucide-react';
import { useApp } from '../app/store';
import { Card, Field, Modal, PageHeader, Progress, Select, Empty } from '../ui/kit';
import { GOAL_METRIC } from '../core/enums';
import { fmtMoney, fmtPct, pct } from '../core/money';
import { filterOrders, financeKpis, marketingKpis, salesKpis } from '../core/analytics';
import { resolveRange } from '../core/dates';
import { dataPort } from '../data';
import type { GoalMetric } from '../core/types';

export default function Goals() {
  const { db, run, allows } = useApp();
  const [open, setOpen] = useState(false);

  const monthRange = useMemo(() => resolveRange('this_month'), []);
  const current = useMemo(() => {
    if (!db) return null;
    const orders = filterOrders(db, { range: monthRange });
    return {
      s: salesKpis(db, orders),
      f: financeKpis(db, orders, monthRange),
      m: marketingKpis(db, orders, monthRange),
    };
  }, [db, monthRange]);

  if (!db || !current) return null;

  const valueOf = (metric: GoalMetric) => {
    switch (metric) {
      case 'sales': return current.f.revenue;
      case 'orders': return current.s.orders;
      case 'profit': return current.f.netProfit;
      case 'delivered_orders': return current.s.delivered;
      case 'roas': return current.m.roas;
      case 'delivery_rate': return current.s.deliveryRate;
    }
  };
  const format = (metric: GoalMetric, v: number) =>
    metric === 'sales' || metric === 'profit' ? fmtMoney(v)
      : metric === 'roas' ? v.toFixed(2)
        : metric === 'delivery_rate' ? fmtPct(v)
          : Math.round(v).toLocaleString('fr-MA');

  const goals = db.goals.filter((g) => g.is_active);

  return (
    <>
      <PageHeader
        title="أهداف العمل"
        subtitle={`${monthRange.label} — ${goals.length} هدف نشط`}
        actions={allows('goals.create') && (
          <button className="btn-primary gap-1.5" onClick={() => setOpen(true)}><Plus size={15} /> هدف جديد</button>
        )}
      />

      {goals.length === 0 ? (
        <Card><Empty title="لا توجد أهداف" hint="حدّد هدفاً شهرياً للمبيعات أو الربح لتتبع تقدمك." /></Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {goals.map((g) => {
            const cur = valueOf(g.metric);
            const p = pct(cur, g.target_value);
            const remaining = Math.max(g.target_value - cur, 0);
            return (
              <Card key={g.id} className="relative overflow-hidden">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-[13px] font-semibold text-ink-900">{g.label ?? GOAL_METRIC[g.metric].label}</div>
                    <div className="text-[11.5px] text-ink-400">{GOAL_METRIC[g.metric].label}</div>
                  </div>
                  <span className={clsx('num text-[20px] font-bold',
                    p >= 100 ? 'text-emerald-600' : p >= 60 ? 'text-brand-600' : 'text-saffron-700')}>
                    {Math.round(p)}%
                  </span>
                </div>
                <Progress value={p} tone={p >= 100 ? 'emerald' : p >= 60 ? 'brand' : 'saffron'} />
                <div className="flex items-center justify-between mt-3 text-[12.5px]">
                  <span className="text-ink-400">الحالي</span>
                  <span className="num font-semibold text-ink-800">{format(g.metric, cur)}</span>
                </div>
                <div className="flex items-center justify-between mt-1 text-[12.5px]">
                  <span className="text-ink-400">المستهدف</span>
                  <span className="num text-ink-600">{format(g.metric, g.target_value)}</span>
                </div>
                {p < 100 && (
                  <div className="mt-3 pt-2.5 border-t border-[#eef0f4] text-[12px] text-ink-500">
                    متبقٍ <b className="num text-ink-800">{format(g.metric, remaining)}</b> لبلوغ الهدف
                  </div>
                )}
                {p >= 100 && (
                  <div className="mt-3 pt-2.5 border-t border-[#eef0f4] text-[12px] text-emerald-700 flex items-center gap-1.5">
                    <Target size={13} /> تم تحقيق الهدف 🎉
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <GoalModal open={open} onClose={() => setOpen(false)} onSave={run} range={monthRange} />
    </>
  );
}

function GoalModal({ open, onClose, onSave, range }: {
  open: boolean; onClose: () => void; range: { from: Date; to: Date };
  onSave: <T>(fn: () => Promise<T>, msg?: string) => Promise<T | undefined>;
}) {
  const [metric, setMetric] = useState<GoalMetric>('sales');
  const [target, setTarget] = useState(100000);
  const [label, setLabel] = useState('');

  return (
    <Modal
      open={open} onClose={onClose} title="هدف جديد"
      footer={<>
        <button className="btn-primary" onClick={async () => {
          await onSave(() => dataPort().upsertGoal({
            metric, target_value: target, label: label || undefined, period: 'month',
            period_start: range.from.toISOString().slice(0, 10),
            period_end: range.to.toISOString().slice(0, 10),
          }), 'تمت إضافة الهدف');
          onClose();
        }}>حفظ</button>
        <button className="btn-ghost" onClick={onClose}>إلغاء</button>
      </>}
    >
      <div className="space-y-3">
        <Field label="المؤشر">
          <Select value={metric} onChange={(v) => setMetric(v as GoalMetric)}
            options={Object.entries(GOAL_METRIC).map(([v, m]) => ({ value: v, label: m.label }))} />
        </Field>
        <Field label="القيمة المستهدفة">
          <input type="number" className="input num" value={target} onChange={(e) => setTarget(Number(e.target.value))} />
        </Field>
        <Field label="التسمية" hint="اختياري">
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)}
            placeholder="مثال: هدف المبيعات الشهري" />
        </Field>
      </div>
    </Modal>
  );
}
