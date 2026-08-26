/**
 * SHOES OS — Analytics.
 * Four lenses on the same data: products, sizes, cities, customers.
 */
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { useApp } from '../app/store';
import { Badge, Card, PageHeader, Table, Tabs } from '../ui/kit';
import { AreaTrend, Bars } from '../ui/charts';
import {
  cityPerformance, customerKpis, filterOrders, productPerformance,
  salesKpis, sizePerformance, timeSeries,
} from '../core/analytics';
import { fmtMoney, fmtPct } from '../core/money';
import { CUSTOMER_SEGMENT } from '../core/enums';
import { Link } from 'react-router-dom';

export default function Analytics() {
  const { db, range } = useApp();
  const [tab, setTab] = useState('products');

  const data = useMemo(() => {
    if (!db) return null;
    const orders = filterOrders(db, { range });
    return {
      orders,
      s: salesKpis(db, orders),
      products: productPerformance(db, orders),
      sizes: sizePerformance(db, orders),
      cities: cityPerformance(orders),
      series: timeSeries(db, orders, range),
      cust: customerKpis(db, range),
    };
  }, [db, range]);

  if (!db || !data) return null;
  const { products, sizes, cities, series, s } = data;

  const topCustomers = [...db.customers]
    .filter((c) => c.delivered_orders > 0)
    .sort((a, b) => b.total_spent - a.total_spent).slice(0, 12);
  const riskyCustomers = [...db.customers]
    .filter((c) => c.total_orders >= 2)
    .map((c) => ({ ...c, risk: (c.refused_orders + c.returned_orders) / c.total_orders }))
    .sort((a, b) => b.risk - a.risk).slice(0, 10);

  return (
    <>
      <PageHeader title="التحليلات" subtitle={`${range.label} — ${s.orders} طلب`} />

      <div className="grid xl:grid-cols-3 gap-3 mb-3">
        <Card title="الطلبات مقابل المسلّم" className="xl:col-span-2">
          <AreaTrend data={series} x="label" height={230} currency={false}
            series={[
              { key: 'orders', name: 'الطلبات', color: '#5B55D9' },
              { key: 'delivered', name: 'المسلّم', color: '#10b981' },
            ]} />
        </Card>
        <Card title="معدلات التحويل" subtitle="من طلب إلى تسليم">
          <div className="space-y-3.5 pt-1">
            {[
              ['نسبة التأكيد', s.confirmRate, 'bg-blue-500'],
              ['نسبة التسليم', s.deliveryRate, 'bg-emerald-500'],
              ['نسبة الرفض', s.refusalRate, 'bg-rose-500'],
              ['نسبة الإرجاع', s.returnRate, 'bg-orange-500'],
            ].map(([l, v, c]) => (
              <div key={l as string}>
                <div className="flex justify-between text-[12.5px] mb-1">
                  <span className="text-ink-500">{l as string}</span>
                  <span className="num font-semibold">{fmtPct(v as number)}</span>
                </div>
                <div className="h-2 rounded-full bg-[#eef0f4] overflow-hidden">
                  <div className={clsx('h-full rounded-full', c as string)} style={{ width: `${Math.min(100, v as number)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card padded={false}>
        <div className="px-3 pt-2">
          <Tabs
            tabs={[
              { id: 'products', label: 'المنتجات', count: products.length },
              { id: 'sizes', label: 'المقاسات', count: sizes.length },
              { id: 'cities', label: 'المدن', count: cities.length },
              { id: 'customers', label: 'العملاء' },
            ]}
            active={tab} onChange={setTab}
          />
        </div>

        {tab === 'products' && (
          <Table head={['المنتج', 'طلبات', 'قطع', 'مسلّم', 'المداخيل', 'التكلفة', 'الربح', 'الهامش', 'نسبة التسليم']}>
            {products.map((p) => (
              <tr key={p.productId} className="tr">
                <td className="td">
                  <div className="flex items-center gap-2">
                    <img src={p.image} alt="" className="h-7 w-7 rounded-md object-cover" />
                    <span className="truncate max-w-[200px]">{p.name}</span>
                  </div>
                </td>
                <td className="td num">{p.orders}</td>
                <td className="td num">{p.units}</td>
                <td className="td num text-emerald-600">{p.unitsDelivered}</td>
                <td className="td num">{fmtMoney(p.revenue)}</td>
                <td className="td num text-ink-400">{fmtMoney(p.cost)}</td>
                <td className="td num font-medium text-emerald-600">{fmtMoney(p.profit)}</td>
                <td className="td num">{fmtPct(p.margin)}</td>
                <td className="td">
                  <span className={clsx('num', p.deliveryRate >= 70 ? 'text-emerald-600' : p.deliveryRate >= 50 ? 'text-saffron-700' : 'text-rose-600')}>
                    {fmtPct(p.deliveryRate)}
                  </span>
                </td>
              </tr>
            ))}
          </Table>
        )}

        {tab === 'sizes' && (
          <div className="p-4 grid lg:grid-cols-2 gap-4">
            <Bars data={sizes.map((s2) => ({ size: `مقاس ${s2.size}`, delivered: s2.delivered, units: s2.units }))}
              x="size" height={280} layout="vertical"
              series={[{ key: 'units', name: 'القطع المطلوبة', color: '#5B55D9' },
              { key: 'delivered', name: 'القطع المسلّمة', color: '#10b981' }]} />
            <Table head={['المقاس', 'القطع', 'المسلّم', 'المداخيل', 'حصة المبيعات']}>
              {sizes.map((s2) => {
                const total = sizes.reduce((a, x) => a + x.units, 0);
                return (
                  <tr key={s2.size} className="tr">
                    <td className="td num font-medium">{s2.size}</td>
                    <td className="td num">{s2.units}</td>
                    <td className="td num text-emerald-600">{s2.delivered}</td>
                    <td className="td num">{fmtMoney(s2.revenue)}</td>
                    <td className="td num">{fmtPct((s2.units / (total || 1)) * 100)}</td>
                  </tr>
                );
              })}
            </Table>
          </div>
        )}

        {tab === 'cities' && (
          <Table head={['المدينة', 'طلبات', 'مؤكد', 'مسلّم', 'مرفوض', 'مُرتجع', 'المداخيل', 'الربح', 'نسبة التسليم']}>
            {cities.map((c) => (
              <tr key={c.city} className="tr">
                <td className="td font-medium">{c.city}</td>
                <td className="td num">{c.orders}</td>
                <td className="td num">{c.confirmed}</td>
                <td className="td num text-emerald-600">{c.delivered}</td>
                <td className="td num text-rose-600">{c.refused}</td>
                <td className="td num text-orange-600">{c.returned}</td>
                <td className="td num">{fmtMoney(c.revenue)}</td>
                <td className={clsx('td num font-medium', c.profit >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                  {fmtMoney(c.profit)}
                </td>
                <td className="td">
                  <span className={clsx('num font-semibold',
                    c.deliveryRate >= 70 ? 'text-emerald-600' : c.deliveryRate >= 50 ? 'text-saffron-700' : 'text-rose-600')}>
                    {fmtPct(c.deliveryRate)}
                  </span>
                </td>
              </tr>
            ))}
          </Table>
        )}

        {tab === 'customers' && (
          <div className="p-4 grid lg:grid-cols-2 gap-4">
            <div>
              <h4 className="text-[12px] font-semibold text-ink-500 uppercase tracking-wide mb-2">أفضل العملاء</h4>
              <Table head={['العميل', 'طلبات', 'الإنفاق', 'LTV', 'التصنيف']}>
                {topCustomers.map((c) => (
                  <tr key={c.id} className="tr">
                    <td className="td">
                      <Link to={`/customers/${c.id}`} className="text-brand-700 hover:underline">{c.full_name}</Link>
                    </td>
                    <td className="td num">{c.delivered_orders}</td>
                    <td className="td num">{fmtMoney(c.total_spent)}</td>
                    <td className="td num">{fmtMoney(c.lifetime_value)}</td>
                    <td className="td"><Badge tone={CUSTOMER_SEGMENT[c.segment].tone}>{CUSTOMER_SEGMENT[c.segment].label}</Badge></td>
                  </tr>
                ))}
              </Table>
            </div>
            <div>
              <h4 className="text-[12px] font-semibold text-ink-500 uppercase tracking-wide mb-2">أعلى نسب رفض</h4>
              <Table head={['العميل', 'طلبات', 'رفض/إرجاع', 'النسبة']}>
                {riskyCustomers.map((c) => (
                  <tr key={c.id} className="tr">
                    <td className="td">
                      <Link to={`/customers/${c.id}`} className="text-brand-700 hover:underline">{c.full_name}</Link>
                    </td>
                    <td className="td num">{c.total_orders}</td>
                    <td className="td num text-rose-600">{c.refused_orders + c.returned_orders}</td>
                    <td className="td num font-semibold text-rose-600">{fmtPct(c.risk * 100)}</td>
                  </tr>
                ))}
              </Table>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
