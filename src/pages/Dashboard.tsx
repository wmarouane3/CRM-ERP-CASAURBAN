/**
 * SHOES OS — Dashboard.
 * Everything the owner needs before their first coffee: money, pipeline,
 * marketing efficiency, stock risk, and what needs attention right now.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Wallet, ShoppingCart, TrendingUp, Boxes, Users, Megaphone,
  ArrowLeft, AlertTriangle, CheckCircle2, Info,
} from 'lucide-react';
import clsx from 'clsx';
import { useApp } from '../app/store';
import { Card, Stat, PageHeader, Progress, Badge, Table } from '../ui/kit';
import { AreaTrend, Donut, SpendVsRevenue } from '../ui/charts';
import {
  cityPerformance, customerKpis, expenseBreakdown, filterOrders, financeKpis,
  generateInsights, inventoryKpis, marketingKpis, productPerformance,
  salesKpis, timeSeries,
} from '../core/analytics';
import { previousRange } from '../core/dates';
import { fmtMoney, fmtPct, pct } from '../core/money';
import { ORDER_STATUS, EXPENSE_CATEGORY, GOAL_METRIC, CHART_COLORS } from '../core/enums';
import type { OrderStatus } from '../core/types';

const PIPELINE: OrderStatus[] = [
  'new', 'to_confirm', 'confirmed', 'preparing', 'shipped',
  'delivered', 'refused', 'returned', 'cancelled',
];

export default function Dashboard() {
  const { db, range } = useApp();

  const data = useMemo(() => {
    if (!db) return null;
    const orders = filterOrders(db, { range });
    const prev = previousRange(range);
    const prevOrders = filterOrders(db, { range: prev });

    const s = salesKpis(db, orders);
    const f = financeKpis(db, orders, range);
    const m = marketingKpis(db, orders, range);
    const inv = inventoryKpis(db);
    const cust = customerKpis(db, range);
    const pf = financeKpis(db, prevOrders, prev);
    const ps = salesKpis(db, prevOrders);

    return {
      orders, s, f, m, inv, cust,
      delta: {
        revenue: pf.revenue ? pct(f.revenue - pf.revenue, pf.revenue) : 0,
        orders: ps.orders ? pct(s.orders - ps.orders, ps.orders) : 0,
        profit: pf.netProfit ? pct(f.netProfit - pf.netProfit, Math.abs(pf.netProfit)) : 0,
        delivered: ps.delivered ? pct(s.delivered - ps.delivered, ps.delivered) : 0,
      },
      series: timeSeries(db, orders, range),
      products: productPerformance(db, orders).slice(0, 6),
      cities: cityPerformance(orders).slice(0, 6),
      expenses: expenseBreakdown(db, range, orders),
      insights: generateInsights(db, orders, range),
    };
  }, [db, range]);

  if (!db || !data) return null;
  const { s, f, m, inv, cust, delta, series, products, cities, expenses, insights } = data;

  const statusCounts = PIPELINE.map((st) => ({
    name: ORDER_STATUS[st].label,
    value: data.orders.filter((o) => o.status === st).length,
    status: st,
  }));

  const goals = db.goals.filter((g) => g.is_active);
  const goalValue = (metric: string) => {
    switch (metric) {
      case 'sales': return f.revenue;
      case 'orders': return s.orders;
      case 'profit': return f.netProfit;
      case 'delivered_orders': return s.delivered;
      case 'roas': return m.roas;
      case 'delivery_rate': return s.deliveryRate;
      default: return 0;
    }
  };

  return (
    <>
      <PageHeader
        title="لوحة القيادة"
        subtitle={`${range.label} — ${s.orders} طلب، ${s.delivered} مسلّم`}
      />

      {/* money row ---------------------------------------------------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <Stat label="المداخيل المحققة" value={f.revenue} money compact delta={delta.revenue}
          tone="emerald" icon={<Wallet size={14} />} sub="الطلبات المسلّمة فقط" />
        <Stat label="الربح الصافي" value={f.netProfit} money compact delta={delta.profit}
          tone={f.netProfit >= 0 ? 'blue' : 'rose'} icon={<TrendingUp size={14} />}
          sub={`هامش ${fmtPct(f.profitMargin)}`} />
        <Stat label="عدد الطلبات" value={s.orders} delta={delta.orders}
          tone="indigo" icon={<ShoppingCart size={14} />} sub={`تأكيد ${fmtPct(s.confirmRate)}`} />
        <Stat label="الإنفاق الإعلاني" value={m.adSpend} money compact
          tone="violet" icon={<Megaphone size={14} />} sub={`ROAS ${m.roas}`} />
      </div>

      {/* what needs attention ----------------------------------------- */}
      {insights.length > 0 && (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 mb-3">
          {insights.slice(0, 6).map((i, k) => (
            <Link
              key={k} to={i.link ?? '#'}
              className={clsx(
                'card p-3 flex gap-3 items-start hover:shadow-pop transition-shadow',
                i.severity === 'critical' && 'border-r-[3px] border-r-rose-500',
                i.severity === 'warning' && 'border-r-[3px] border-r-saffron-500',
                i.severity === 'success' && 'border-r-[3px] border-r-emerald-500',
              )}
            >
              <span className={clsx('mt-0.5 shrink-0',
                i.severity === 'critical' ? 'text-rose-500'
                  : i.severity === 'warning' ? 'text-saffron-500'
                    : i.severity === 'success' ? 'text-emerald-500' : 'text-blue-500')}>
                {i.severity === 'success' ? <CheckCircle2 size={16} />
                  : i.severity === 'info' ? <Info size={16} /> : <AlertTriangle size={16} />}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink-800">{i.title}</p>
                <p className="text-[11.5px] text-ink-400 mt-0.5">{i.detail}</p>
              </div>
              <ArrowLeft size={14} className="mr-auto text-ink-200 shrink-0 mt-1" />
            </Link>
          ))}
        </div>
      )}

      {/* charts ------------------------------------------------------- */}
      <div className="grid xl:grid-cols-3 gap-3 mb-3">
        <Card title="المبيعات والأرباح" subtitle="المداخيل المحققة مقابل الربح الصافي" className="xl:col-span-2">
          <AreaTrend
            data={series} x="label" height={260}
            series={[
              { key: 'revenue', name: 'المداخيل', color: '#10b981' },
              { key: 'profit', name: 'الربح الصافي', color: '#5B55D9' },
            ]}
          />
        </Card>

        <Card title="الطلبات حسب الحالة" subtitle="خط أنابيب التشغيل">
          <div className="space-y-2">
            {statusCounts.filter((x) => x.value > 0).map((x) => (
              <Link key={x.status} to={`/orders?status=${x.status}`} className="flex items-center gap-3 group">
                <Badge tone={ORDER_STATUS[x.status].tone}>{x.name}</Badge>
                <div className="flex-1">
                  <Progress value={pct(x.value, s.orders || 1)} tone={
                    x.status === 'delivered' ? 'emerald'
                      : x.status === 'refused' || x.status === 'returned' ? 'rose'
                        : 'brand'} />
                </div>
                <span className="num text-[12.5px] font-medium text-ink-700 w-8 text-left">{x.value}</span>
              </Link>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-[#eef0f4]">
            {[
              ['التأكيد', s.confirmRate, 'text-blue-600'],
              ['التسليم', s.deliveryRate, 'text-emerald-600'],
              ['الرفض', s.refusalRate, 'text-rose-600'],
            ].map(([l, v, c]) => (
              <div key={l as string} className="text-center">
                <div className={clsx('num text-[16px] font-semibold', c as string)}>{fmtPct(v as number)}</div>
                <div className="text-[11px] text-ink-400">{l as string}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* finance + marketing ------------------------------------------ */}
      <div className="grid xl:grid-cols-3 gap-3 mb-3">
        <Card title="حساب الأرباح والخسائر" subtitle={range.label} className="xl:col-span-1">
          <div className="space-y-1.5">
            {[
              ['المداخيل', f.revenue, 'text-emerald-600'],
              ['تكلفة المنتجات', -f.productCost, ''],
              ['الربح الإجمالي', f.grossProfit, 'font-semibold'],
              ['الشحن', -f.shippingCost, ''],
              ['المرتجعات', -f.returnCost, ''],
              ['الإعلانات', -f.adSpend, ''],
              ['مصاريف تشغيل أخرى', -(f.otherExpenses + f.packagingCost), ''],
            ].map(([label, v, cls], i) => (
              <div key={i} className={clsx(
                'flex items-center justify-between py-1.5 text-[13px]',
                i === 2 && 'border-y border-[#eef0f4] my-1.5',
              )}>
                <span className="text-ink-500">{label as string}</span>
                <span className={clsx('num', cls as string, (v as number) < 0 && 'text-rose-600')}>
                  {fmtMoney(v as number)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2.5 mt-1 border-t-2 border-ink-900">
              <span className="text-[13px] font-semibold text-ink-900">الربح الصافي</span>
              <span className={clsx('num text-[17px] font-bold', f.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                {fmtMoney(f.netProfit)}
              </span>
            </div>
          </div>
        </Card>

        <Card title="الإنفاق الإعلاني مقابل المداخيل" subtitle="الربحية الحقيقية على أساس الطلبات المسلّمة" className="xl:col-span-2">
          <SpendVsRevenue data={series} height={230} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-3 border-t border-[#eef0f4]">
            {[
              ['ROAS', m.roas.toFixed(2)],
              ['ROI', `${m.roi.toFixed(0)}%`],
              ['CPA', fmtMoney(m.cpa)],
              ['تكلفة الطلب المسلّم', fmtMoney(m.costPerDelivered)],
            ].map(([l, v]) => (
              <div key={l}>
                <div className="text-[11px] text-ink-400">{l}</div>
                <div className="num text-[15px] font-semibold text-ink-800">{v}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* operational row ---------------------------------------------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <Stat label="قيمة المخزون" value={inv.stockValue} money compact tone="cyan"
          icon={<Boxes size={14} />} sub={`${inv.totalUnits} قطعة`} />
        <Stat label="مقاسات منخفضة/نافدة" value={`${inv.lowStock} / ${inv.outOfStock}`} tone="amber"
          icon={<AlertTriangle size={14} />} sub={`إعادة تخزين ${fmtMoney(inv.restockValue)}`} />
        <Stat label="العملاء" value={cust.total} tone="blue" icon={<Users size={14} />}
          sub={`${cust.newCustomers} جديد · ${cust.returning} متكرر`} />
        <Stat label="متوسط قيمة الطلب" value={f.avgOrderValue} money tone="indigo"
          icon={<Wallet size={14} />} sub={`LTV ${fmtMoney(cust.avgLtv)}`} />
      </div>

      {/* breakdowns --------------------------------------------------- */}
      <div className="grid xl:grid-cols-3 gap-3 mb-3">
        <Card title="أفضل المنتجات" subtitle="حسب المداخيل المحققة"
          actions={<Link to="/analytics" className="text-[12px] text-brand-600 hover:underline">التفاصيل</Link>}
          padded={false}>
          <Table head={['المنتج', 'مسلّم', 'المداخيل', 'الربح']}>
            {products.map((p) => (
              <tr key={p.productId} className="tr">
                <td className="td">
                  <div className="flex items-center gap-2">
                    <img src={p.image} alt="" className="h-7 w-7 rounded-md object-cover" />
                    <span className="truncate max-w-[150px]">{p.name}</span>
                  </div>
                </td>
                <td className="td num">{p.unitsDelivered}</td>
                <td className="td num">{fmtMoney(p.revenue)}</td>
                <td className="td num text-emerald-600">{fmtMoney(p.profit)}</td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title="أفضل المدن" subtitle="نسبة التسليم والربح" padded={false}>
          <Table head={['المدينة', 'طلبات', 'تسليم', 'الربح']}>
            {cities.map((c) => (
              <tr key={c.city} className="tr">
                <td className="td">{c.city}</td>
                <td className="td num">{c.orders}</td>
                <td className="td">
                  <span className={clsx('num', c.deliveryRate >= 70 ? 'text-emerald-600' : c.deliveryRate >= 50 ? 'text-saffron-700' : 'text-rose-600')}>
                    {fmtPct(c.deliveryRate)}
                  </span>
                </td>
                <td className="td num">{fmtMoney(c.profit)}</td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title="توزيع المصاريف" subtitle={range.label}>
          <Donut
            height={220}
            data={expenses.map((e, i) => ({
              name: EXPENSE_CATEGORY[e.category].label,
              value: e.amount,
              color: CHART_COLORS[i % CHART_COLORS.length],
            }))}
          />
        </Card>
      </div>

      {/* goals --------------------------------------------------------- */}
      {goals.length > 0 && (
        <Card title="أهداف الشهر" subtitle="التقدم الحالي مقابل المستهدف"
          actions={<Link to="/goals" className="text-[12px] text-brand-600 hover:underline">إدارة الأهداف</Link>}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {goals.map((g) => {
              const current = goalValue(g.metric);
              const p = pct(current, g.target_value);
              return (
                <div key={g.id}>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="text-[12px] text-ink-500">{GOAL_METRIC[g.metric].label}</span>
                    <span className={clsx('num text-[12px] font-semibold', p >= 100 ? 'text-emerald-600' : 'text-ink-700')}>
                      {fmtPct(Math.min(p, 999))}
                    </span>
                  </div>
                  <Progress value={p} tone={p >= 100 ? 'emerald' : p >= 60 ? 'brand' : 'saffron'} />
                  <div className="num text-[11px] text-ink-400 mt-1.5">
                    {g.metric === 'roas' ? current.toFixed(2) : Math.round(current).toLocaleString('fr-MA')}
                    {' / '}
                    {g.metric === 'roas' ? g.target_value.toFixed(2) : g.target_value.toLocaleString('fr-MA')}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </>
  );
}
