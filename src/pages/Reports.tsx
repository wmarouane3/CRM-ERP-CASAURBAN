/**
 * SHOES OS — Reports.
 * Ten prebuilt reports over the same filtered dataset, exportable to CSV
 * (Excel-safe, UTF-8 BOM) or printed to PDF through the browser.
 */
import { useMemo, useState } from 'react';
import { Download, Printer, FileText } from 'lucide-react';
import { useApp } from '../app/store';
import { Card, PageHeader, Select, Table } from '../ui/kit';
import {
  campaignPerformance, cityPerformance, filterOrders, financeKpis,
  productPerformance, salesKpis, timeSeries,
} from '../core/analytics';
import { ORDER_STATUS, EXPENSE_CATEGORY, AD_PLATFORM, CUSTOMER_SEGMENT, SALES_CHANNEL } from '../core/enums';
import { fmtMoney } from '../core/money';
import { fmtDate, inRange } from '../core/dates';
import { availableStock } from '../data/demo/engine';
import { toCsv, download, printElement } from '../lib/export';

type ReportId =
  | 'daily' | 'sales' | 'profit' | 'orders' | 'stock'
  | 'returns' | 'ads' | 'customers' | 'cities' | 'products';

const REPORTS: { id: ReportId; label: string; hint: string }[] = [
  { id: 'daily', label: 'التقرير اليومي', hint: 'الطلبات والمداخيل والربح لكل يوم' },
  { id: 'sales', label: 'تقرير المبيعات', hint: 'كل طلب مع تفاصيله المالية' },
  { id: 'profit', label: 'تقرير الأرباح', hint: 'المداخيل والتكاليف والربح الصافي' },
  { id: 'orders', label: 'تقرير الطلبات', hint: 'الحالات والقنوات والمدن' },
  { id: 'stock', label: 'تقرير المخزون', hint: 'الكميات والقيم والمقاسات المنخفضة' },
  { id: 'returns', label: 'تقرير المرتجعات', hint: 'المرفوض والمُرتجع وتكاليفه' },
  { id: 'ads', label: 'تقرير الإعلانات', hint: 'أداء الحملات و ROAS' },
  { id: 'customers', label: 'تقرير العملاء', hint: 'الإنفاق والتصنيف والقيمة الدائمة' },
  { id: 'cities', label: 'تقرير المدن', hint: 'نسب التسليم والربح لكل مدينة' },
  { id: 'products', label: 'تقرير المنتجات', hint: 'الأكثر مبيعاً والأكثر ربحاً' },
];

export default function Reports() {
  const { db, range } = useApp();
  const [report, setReport] = useState<ReportId>('daily');
  const [status, setStatus] = useState('');
  const [city, setCity] = useState('');

  const rows = useMemo<Record<string, string | number>[]>(() => {
    if (!db) return [];
    let orders = filterOrders(db, { range });
    if (status) orders = orders.filter((o) => o.status === status);
    if (city) orders = orders.filter((o) => o.city_name === city);

    switch (report) {
      case 'daily':
        return timeSeries(db, orders, range).map((d) => ({
          'التاريخ': d.date, 'الطلبات': d.orders, 'المسلّم': d.delivered,
          'القطع': d.units, 'المداخيل': d.revenue, 'الإنفاق الإعلاني': d.adSpend,
          'الربح الصافي': d.profit,
        }));
      case 'sales':
      case 'orders':
        return orders.map((o) => ({
          'رقم الطلب': o.order_number, 'التاريخ': o.created_at.slice(0, 10),
          'العميل': o.customer_name, 'الهاتف': o.phone, 'المدينة': o.city_name ?? '',
          'القناة': SALES_CHANNEL[o.channel].label, 'الحالة': ORDER_STATUS[o.status].label,
          'المنتجات': db.orderItems.filter((i) => i.order_id === o.id)
            .map((i) => `${i.product_name} (${i.size})`).join(' | '),
          'المداخيل': o.revenue, 'الربح الصافي': o.net_profit,
        }));
      case 'profit':
        return orders.filter((o) => o.status === 'delivered').map((o) => ({
          'رقم الطلب': o.order_number, 'التاريخ': o.created_at.slice(0, 10),
          'المداخيل': o.revenue, 'تكلفة المنتج': o.product_cost, 'الشحن': o.shipping_cost,
          'التغليف': o.packaging_cost, 'الإعلان': o.ad_cost, 'الإرجاع': o.return_cost,
          'الربح الإجمالي': o.gross_profit, 'الربح الصافي': o.net_profit,
          'الهامش %': o.profit_margin,
        }));
      case 'stock':
        return db.variants.map((v) => {
          const p = db.products.find((x) => x.id === v.product_id);
          const s = availableStock(db, v.id);
          return {
            'المنتج': p?.name ?? '', 'المقاس': v.size, 'SKU': v.sku,
            'الكمية': s, 'الحد الأدنى': v.min_stock, 'التكلفة': v.cost_price,
            'قيمة المخزون': s * v.cost_price,
            'الحالة': s === 0 ? 'نفد' : s <= v.min_stock ? 'منخفض' : 'متوفر',
          };
        }).sort((a, b) => (a['الكمية'] as number) - (b['الكمية'] as number));
      case 'returns':
        return orders.filter((o) => o.status === 'refused' || o.status === 'returned').map((o) => ({
          'رقم الطلب': o.order_number, 'التاريخ': o.created_at.slice(0, 10),
          'العميل': o.customer_name, 'المدينة': o.city_name ?? '',
          'الحالة': ORDER_STATUS[o.status].label,
          'قيمة الطلب': o.subtotal, 'تكلفة الشحن': o.shipping_cost,
          'تكلفة الإرجاع': o.return_cost, 'تكلفة الإعلان': o.ad_cost,
          'الخسارة': o.net_profit,
        }));
      case 'ads':
        return campaignPerformance(db, orders, range).map((c) => ({
          'الحملة': c.campaign, 'المنصة': AD_PLATFORM[c.platform].label,
          'الإنفاق': c.spend, 'الانطباعات': c.impressions, 'النقرات': c.clicks,
          'الطلبات': c.orders, 'مؤكد': c.confirmed, 'مسلّم': c.delivered,
          'المداخيل': c.revenue, 'ROAS': c.roas, 'ROI %': c.roi,
          'تكلفة الطلب المسلّم': c.costPerDelivered, 'الربح': c.profit,
        }));
      case 'customers':
        return db.customers.map((c) => ({
          'المرجع': c.reference, 'الاسم': c.full_name, 'الهاتف': c.phone,
          'المدينة': c.city_name ?? '', 'الطلبات': c.total_orders,
          'مسلّم': c.delivered_orders, 'مرفوض': c.refused_orders,
          'الإنفاق': c.total_spent, 'متوسط الطلب': c.avg_order_value,
          'LTV': c.lifetime_value, 'التصنيف': CUSTOMER_SEGMENT[c.segment].label,
        })).sort((a, b) => (b['الإنفاق'] as number) - (a['الإنفاق'] as number));
      case 'cities':
        return cityPerformance(orders).map((c) => ({
          'المدينة': c.city, 'الطلبات': c.orders, 'مؤكد': c.confirmed,
          'مسلّم': c.delivered, 'مرفوض': c.refused, 'مُرتجع': c.returned,
          'المداخيل': c.revenue, 'الربح': c.profit, 'نسبة التسليم %': c.deliveryRate,
        }));
      case 'products':
        return productPerformance(db, orders).map((p) => ({
          'المنتج': p.name, 'الطلبات': p.orders, 'القطع': p.units,
          'مسلّم': p.unitsDelivered, 'المداخيل': p.revenue, 'التكلفة': p.cost,
          'الربح': p.profit, 'الهامش %': p.margin, 'نسبة التسليم %': p.deliveryRate,
        }));
      default:
        return [];
    }
  }, [db, range, report, status, city]);

  if (!db) return null;
  const orders = filterOrders(db, { range });
  const s = salesKpis(db, orders);
  const f = financeKpis(db, orders, range);
  const meta = REPORTS.find((r) => r.id === report)!;
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  const cities = [...new Set(db.orders.map((o) => o.city_name).filter(Boolean))] as string[];

  return (
    <>
      <PageHeader
        title="التقارير"
        subtitle={`${meta.label} — ${range.label}`}
        actions={<>
          <button className="btn-ghost gap-1.5" onClick={() => printElement('report-print', meta.label)}>
            <Printer size={14} /> طباعة / PDF
          </button>
          <button className="btn-primary gap-1.5" onClick={() => download(`${report}.csv`, toCsv(rows))}>
            <Download size={14} /> تصدير CSV
          </button>
        </>}
      />

      <div className="grid lg:grid-cols-4 gap-3">
        <Card title="اختر التقرير" className="lg:col-span-1" padded={false}>
          <div className="p-2 space-y-0.5">
            {REPORTS.map((r) => (
              <button
                key={r.id} onClick={() => setReport(r.id)}
                className={`w-full text-right px-3 py-2 rounded-lg transition-colors ${
                  report === r.id ? 'bg-brand-50 text-brand-700' : 'hover:bg-ground text-ink-700'}`}
              >
                <div className="text-[13px] font-medium flex items-center gap-2">
                  <FileText size={13} /> {r.label}
                </div>
                <div className="text-[11px] text-ink-400 mt-0.5">{r.hint}</div>
              </button>
            ))}
          </div>
          <div className="p-3 border-t border-[#eef0f4] space-y-2">
            <Select value={status} onChange={setStatus} placeholder="كل الحالات"
              options={Object.entries(ORDER_STATUS).map(([v, m]) => ({ value: v, label: m.label }))} />
            <Select value={city} onChange={setCity} placeholder="كل المدن"
              options={cities.map((c) => ({ value: c, label: c }))} />
          </div>
        </Card>

        <Card className="lg:col-span-3" padded={false}
          title={meta.label} subtitle={`${rows.length} سطر`}>
          <div id="report-print">
            <div className="hidden print:block">
              <h1>{meta.label}</h1>
              <p className="muted">SHOES OS — {range.label} — {fmtDate(new Date())}</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 border-b border-[#eef0f4] bg-[#fafbfc]">
              {[
                ['الطلبات', String(s.orders)],
                ['المسلّم', String(s.delivered)],
                ['المداخيل', fmtMoney(f.revenue)],
                ['الربح الصافي', fmtMoney(f.netProfit)],
              ].map(([l, v]) => (
                <div key={l}>
                  <div className="text-[11px] text-ink-400">{l}</div>
                  <div className="num text-[15px] font-semibold text-ink-800">{v}</div>
                </div>
              ))}
            </div>
            <Table head={headers}>
              {rows.slice(0, 300).map((r, i) => (
                <tr key={i} className="tr">
                  {headers.map((h) => (
                    <td key={h} className={`td ${typeof r[h] === 'number' ? 'num' : ''}`}>
                      {typeof r[h] === 'number'
                        ? (h.includes('%') ? `${(r[h] as number).toFixed(1)}%`
                          : /المداخيل|الربح|التكلفة|الإنفاق|القيمة|الشحن|الإرجاع|الخسارة|LTV|قيمة|سعر|متوسط/.test(h)
                            ? fmtMoney(r[h] as number) : r[h])
                        : String(r[h] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </Table>
            {rows.length > 300 && (
              <p className="text-center text-[12px] text-ink-300 py-3">
                يعرض أول 300 سطر — التصدير يشمل كل السطور ({rows.length})
              </p>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

export function expenseCategoryLabel(c: keyof typeof EXPENSE_CATEGORY) {
  return EXPENSE_CATEGORY[c].label;
}

export function isInRange(d: string, r: Parameters<typeof inRange>[1]) { return inRange(d, r); }
