/**
 * SHOES OS — Analytics engine.
 * Pure functions over a DataSet. Mirrors the SQL views in 0003_views.sql.
 * The UI never invents a formula; it calls one of these.
 */
import { money, pct, safeDiv, sum } from './money';
import { dayKey, eachDay, inRange, type DateRange } from './dates';
import { RESOLVED_STATUSES } from './enums';
import type {
  DataSet, Order, OrderStatus, ExpenseCategory, AdPlatformCode,
} from './types';

/* ------------------------------------------------------------- filters */

export interface AnalyticsFilter {
  range: DateRange;
  cityName?: string;
  productId?: string;
  status?: OrderStatus;
  channel?: string;
  campaignId?: string;
}

export function filterOrders(db: DataSet, f: AnalyticsFilter): Order[] {
  return db.orders.filter((o) => {
    if (!inRange(o.created_at, f.range)) return false;
    if (f.cityName && o.city_name !== f.cityName) return false;
    if (f.status && o.status !== f.status) return false;
    if (f.channel && o.channel !== f.channel) return false;
    if (f.campaignId && o.ad_campaign_id !== f.campaignId) return false;
    if (f.productId) {
      const items = db.orderItems.filter((i) => i.order_id === o.id);
      if (!items.some((i) => i.product_id === f.productId)) return false;
    }
    return true;
  });
}

/* ------------------------------------------------------------ KPI core */

export interface SalesKpis {
  orders: number;
  newOrders: number;
  pendingConfirmation: number;
  confirmed: number;
  preparing: number;
  shipped: number;
  delivered: number;
  refused: number;
  returned: number;
  cancelled: number;
  confirmRate: number;
  deliveryRate: number;
  refusalRate: number;
  returnRate: number;
  revenue: number;             // recognised (delivered) revenue
  pipelineRevenue: number;     // still open, not recognised
  units: number;
}

export function salesKpis(db: DataSet, orders: Order[]): SalesKpis {
  const by = (s: OrderStatus) => orders.filter((o) => o.status === s).length;
  const delivered = by('delivered');
  const refused = by('refused');
  const returned = by('returned');
  const resolved = orders.filter((o) => RESOLVED_STATUSES.includes(o.status)).length;
  const confirmedPlus = orders.filter((o) =>
    ['confirmed', 'preparing', 'shipped', 'delivered', 'refused', 'returned'].includes(o.status),
  ).length;

  const orderIds = new Set(orders.map((o) => o.id));
  const units = db.orderItems
    .filter((i) => orderIds.has(i.order_id))
    .reduce((a, i) => a + i.quantity, 0);

  return {
    orders: orders.length,
    newOrders: by('new'),
    pendingConfirmation: by('to_confirm') + by('new'),
    confirmed: by('confirmed'),
    preparing: by('preparing'),
    shipped: by('shipped'),
    delivered, refused, returned,
    cancelled: by('cancelled'),
    confirmRate: pct(confirmedPlus, orders.length),
    deliveryRate: pct(delivered, resolved),
    refusalRate: pct(refused, resolved),
    returnRate: pct(returned, resolved),
    revenue: sum(orders.filter((o) => o.status === 'delivered').map((o) => o.revenue)),
    pipelineRevenue: sum(
      orders.filter((o) => ['new', 'to_confirm', 'confirmed', 'preparing', 'shipped'].includes(o.status))
        .map((o) => o.revenue),
    ),
    units,
  };
}

export interface FinanceKpis {
  revenue: number;
  productCost: number;
  shippingCost: number;
  returnCost: number;
  adSpend: number;
  otherExpenses: number;
  packagingCost: number;
  grossProfit: number;
  operatingExpenses: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;
  avgOrderValue: number;
  profitPerDeliveredOrder: number;
}

export function financeKpis(db: DataSet, orders: Order[], range: DateRange): FinanceKpis {
  const delivered = orders.filter((o) => o.status === 'delivered');
  const revenue = sum(delivered.map((o) => o.revenue));
  const productCost = sum(delivered.map((o) => o.product_cost));
  const shippingCost = sum(delivered.map((o) => o.shipping_cost));
  const packagingCost = sum(delivered.map((o) => o.packaging_cost));
  // return costs come from ALL orders in range, not only delivered
  const returnCost = sum(orders.map((o) => o.return_cost));

  const spendRows = db.adSpend.filter((s) => inRange(s.date, range));
  const adSpend = spendRows.length
    ? sum(spendRows.map((s) => s.spend))
    : sum(orders.map((o) => o.ad_cost));

  // manual (non-auto, non-advertising) expenses only — auto ones are already
  // represented by the order-level costs above, counting them twice is the
  // classic way an ecommerce P&L ends up lying.
  const otherExpenses = sum(
    db.expenses
      .filter((e) => inRange(e.date, range) && !e.is_auto && e.category !== 'advertising')
      .map((e) => e.amount),
  );

  const grossProfit = money(revenue - productCost);
  const operatingExpenses = money(shippingCost + returnCost + adSpend + packagingCost + otherExpenses);
  const netProfit = money(grossProfit - operatingExpenses);

  return {
    revenue, productCost, shippingCost, returnCost, adSpend, otherExpenses,
    packagingCost, grossProfit, operatingExpenses,
    totalExpenses: money(productCost + operatingExpenses),
    netProfit,
    profitMargin: pct(netProfit, revenue, 2),
    avgOrderValue: delivered.length ? money(revenue / delivered.length) : 0,
    profitPerDeliveredOrder: delivered.length ? money(netProfit / delivered.length) : 0,
  };
}

export interface MarketingKpis {
  adSpend: number; roas: number; roi: number; cpa: number;
  costPerDelivered: number; cpc: number; ctr: number; cpl: number;
  impressions: number; clicks: number; leads: number;
  breakEvenPoint: number;
}

export function marketingKpis(db: DataSet, orders: Order[], range: DateRange): MarketingKpis {
  const rows = db.adSpend.filter((s) => inRange(s.date, range));
  const adSpend = sum(rows.map((r) => r.spend)) || sum(orders.map((o) => o.ad_cost));
  const impressions = rows.reduce((a, r) => a + r.impressions, 0);
  const clicks = rows.reduce((a, r) => a + r.clicks, 0);
  const leads = rows.reduce((a, r) => a + r.leads, 0);
  const delivered = orders.filter((o) => o.status === 'delivered');
  const revenue = sum(delivered.map((o) => o.revenue));
  const profit = sum(delivered.map((o) => o.net_profit));

  return {
    adSpend, impressions, clicks, leads,
    roas: safeDiv(revenue, adSpend),
    roi: adSpend ? Math.round((profit / adSpend) * 10000) / 100 : 0,
    cpa: safeDiv(adSpend, orders.length),
    costPerDelivered: safeDiv(adSpend, delivered.length),
    cpc: safeDiv(adSpend, clicks),
    ctr: impressions ? Math.round((clicks / impressions) * 10000) / 100 : 0,
    cpl: safeDiv(adSpend, leads),
    breakEvenPoint: delivered.length
      ? money(sum(delivered.map((o) => o.revenue - o.product_cost - o.shipping_cost)) / delivered.length)
      : 0,
  };
}

export interface InventoryKpis {
  totalProducts: number;
  totalVariants: number;
  totalUnits: number;
  stockValue: number;
  retailValue: number;
  lowStock: number;
  outOfStock: number;
  restockValue: number;
}

export function inventoryKpis(db: DataSet): InventoryKpis {
  let totalUnits = 0, stockValue = 0, retailValue = 0, lowStock = 0, outOfStock = 0, restockValue = 0;
  for (const inv of db.inventory) {
    const v = db.variants.find((x) => x.id === inv.variant_id);
    if (!v) continue;
    totalUnits += inv.on_hand;
    stockValue += inv.on_hand * v.cost_price;
    retailValue += inv.on_hand * v.selling_price;
    if (inv.on_hand === 0) { outOfStock++; restockValue += v.min_stock * 3 * v.cost_price; }
    else if (inv.on_hand <= v.min_stock) {
      lowStock++;
      restockValue += Math.max(v.min_stock * 3 - inv.on_hand, 0) * v.cost_price;
    }
  }
  return {
    totalProducts: db.products.filter((p) => p.status !== 'archived').length,
    totalVariants: db.variants.length,
    totalUnits,
    stockValue: money(stockValue),
    retailValue: money(retailValue),
    lowStock, outOfStock,
    restockValue: money(restockValue),
  };
}

export interface CustomerKpis {
  total: number; newCustomers: number; returning: number; vip: number;
  highRisk: number; avgOrderValue: number; avgLtv: number; repeatRate: number;
}

export function customerKpis(db: DataSet, range: DateRange): CustomerKpis {
  const all = db.customers;
  const created = all.filter((c) => inRange(c.created_at, range));
  const returning = all.filter((c) => c.delivered_orders >= 2);
  return {
    total: all.length,
    newCustomers: created.length,
    returning: returning.length,
    vip: all.filter((c) => c.segment === 'vip').length,
    highRisk: all.filter((c) => c.segment === 'high_risk').length,
    avgOrderValue: money(
      all.reduce((a, c) => a + c.avg_order_value, 0) / Math.max(all.filter((c) => c.avg_order_value > 0).length, 1),
    ),
    avgLtv: money(all.reduce((a, c) => a + c.lifetime_value, 0) / Math.max(all.length, 1)),
    repeatRate: pct(returning.length, all.filter((c) => c.delivered_orders > 0).length),
  };
}

/* ------------------------------------------------------------ time series */

export interface DayPoint {
  date: string;
  label: string;
  orders: number;
  delivered: number;
  revenue: number;
  profit: number;
  adSpend: number;
  units: number;
}

export function timeSeries(db: DataSet, orders: Order[], range: DateRange): DayPoint[] {
  const days = eachDay(range);
  const map = new Map<string, DayPoint>();
  for (const d of days) {
    map.set(d, {
      date: d, label: d.slice(5).replace('-', '/'),
      orders: 0, delivered: 0, revenue: 0, profit: 0, adSpend: 0, units: 0,
    });
  }
  const orderIds = new Map(orders.map((o) => [o.id, o]));
  for (const o of orders) {
    const k = dayKey(o.created_at);
    const p = map.get(k);
    if (!p) continue;
    p.orders++;
    if (o.status === 'delivered') {
      p.delivered++;
      p.revenue = money(p.revenue + o.revenue);
      p.profit = money(p.profit + o.net_profit);
    } else if (o.status === 'refused' || o.status === 'returned') {
      p.profit = money(p.profit + o.net_profit);
    }
  }
  for (const it of db.orderItems) {
    const o = orderIds.get(it.order_id);
    if (!o) continue;
    const p = map.get(dayKey(o.created_at));
    if (p) p.units += it.quantity;
  }
  for (const s of db.adSpend) {
    const p = map.get(s.date);
    if (p) p.adSpend = money(p.adSpend + s.spend);
  }
  return days.map((d) => map.get(d)!);
}

/* ----------------------------------------------------------- breakdowns */

export interface ProductPerf {
  productId: string; name: string; model?: string; image?: string;
  orders: number; units: number; unitsDelivered: number;
  revenue: number; cost: number; profit: number;
  refused: number; returned: number; deliveryRate: number; margin: number;
}

export function productPerformance(db: DataSet, orders: Order[]): ProductPerf[] {
  const byOrder = new Map(orders.map((o) => [o.id, o]));
  const acc = new Map<string, ProductPerf>();
  for (const it of db.orderItems) {
    const o = byOrder.get(it.order_id);
    if (!o) continue;
    const p = db.products.find((x) => x.id === it.product_id);
    let row = acc.get(it.product_id);
    if (!row) {
      row = {
        productId: it.product_id, name: p?.name ?? it.product_name, model: p?.model,
        image: p?.image_url, orders: 0, units: 0, unitsDelivered: 0,
        revenue: 0, cost: 0, profit: 0, refused: 0, returned: 0,
        deliveryRate: 0, margin: 0,
      };
      acc.set(it.product_id, row);
    }
    row.orders++;
    row.units += it.quantity;
    if (o.status === 'delivered') {
      row.unitsDelivered += it.quantity;
      row.revenue = money(row.revenue + it.line_revenue);
      row.cost = money(row.cost + it.line_cost);
    }
    if (o.status === 'refused') row.refused++;
    if (o.status === 'returned') row.returned++;
  }
  return [...acc.values()].map((r) => {
    const resolved = r.unitsDelivered + r.refused + r.returned;
    r.profit = money(r.revenue - r.cost);
    r.deliveryRate = pct(r.unitsDelivered, resolved || r.units);
    r.margin = pct(r.profit, r.revenue, 1);
    return r;
  }).sort((a, b) => b.revenue - a.revenue);
}

export interface SizePerf { size: string; units: number; delivered: number; revenue: number }

export function sizePerformance(db: DataSet, orders: Order[]): SizePerf[] {
  const byOrder = new Map(orders.map((o) => [o.id, o]));
  const acc = new Map<string, SizePerf>();
  for (const it of db.orderItems) {
    const o = byOrder.get(it.order_id);
    if (!o) continue;
    const row = acc.get(it.size) ?? { size: it.size, units: 0, delivered: 0, revenue: 0 };
    row.units += it.quantity;
    if (o.status === 'delivered') {
      row.delivered += it.quantity;
      row.revenue = money(row.revenue + it.line_revenue);
    }
    acc.set(it.size, row);
  }
  return [...acc.values()].sort((a, b) => Number(a.size) - Number(b.size));
}

export interface CityPerf {
  city: string; orders: number; confirmed: number; shipped: number;
  delivered: number; refused: number; returned: number;
  revenue: number; profit: number; deliveryRate: number; refusalRate: number;
}

export function cityPerformance(orders: Order[]): CityPerf[] {
  const acc = new Map<string, CityPerf>();
  for (const o of orders) {
    const key = o.city_name ?? 'غير محدد';
    const row = acc.get(key) ?? {
      city: key, orders: 0, confirmed: 0, shipped: 0, delivered: 0,
      refused: 0, returned: 0, revenue: 0, profit: 0, deliveryRate: 0, refusalRate: 0,
    };
    row.orders++;
    if (['confirmed', 'preparing', 'shipped', 'delivered', 'refused', 'returned'].includes(o.status)) row.confirmed++;
    if (o.status === 'shipped') row.shipped++;
    if (o.status === 'delivered') {
      row.delivered++;
      row.revenue = money(row.revenue + o.revenue);
      row.profit = money(row.profit + o.net_profit);
    }
    if (o.status === 'refused') { row.refused++; row.profit = money(row.profit + o.net_profit); }
    if (o.status === 'returned') { row.returned++; row.profit = money(row.profit + o.net_profit); }
    acc.set(key, row);
  }
  return [...acc.values()].map((r) => {
    const resolved = r.delivered + r.refused + r.returned;
    r.deliveryRate = pct(r.delivered, resolved);
    r.refusalRate = pct(r.refused, resolved);
    return r;
  }).sort((a, b) => b.orders - a.orders);
}

export interface CampaignPerf {
  campaignId: string; campaign: string; platform: AdPlatformCode;
  spend: number; impressions: number; clicks: number;
  orders: number; confirmed: number; delivered: number;
  revenue: number; profit: number;
  roas: number; roi: number; cpa: number; costPerDelivered: number;
  ctr: number; cpc: number; deliveryRate: number;
}

export function campaignPerformance(
  db: DataSet, orders: Order[], range: DateRange,
): CampaignPerf[] {
  return db.campaigns.map((c) => {
    const platform = db.platforms.find((p) => p.id === c.platform_id)?.code ?? 'other';
    const spendRows = db.adSpend.filter((s) => s.campaign_id === c.id && inRange(s.date, range));
    const spend = sum(spendRows.map((s) => s.spend));
    const impressions = spendRows.reduce((a, s) => a + s.impressions, 0);
    const clicks = spendRows.reduce((a, s) => a + s.clicks, 0);
    const co = orders.filter((o) => o.ad_campaign_id === c.id);
    const delivered = co.filter((o) => o.status === 'delivered');
    const confirmed = co.filter((o) =>
      ['confirmed', 'preparing', 'shipped', 'delivered', 'refused', 'returned'].includes(o.status));
    const revenue = sum(delivered.map((o) => o.revenue));
    const profit = money(
      sum(delivered.map((o) => o.revenue - o.product_cost - o.shipping_cost - o.packaging_cost))
      - sum(co.map((o) => o.return_cost)) - spend,
    );
    const resolved = co.filter((o) => RESOLVED_STATUSES.includes(o.status)).length;
    return {
      campaignId: c.id, campaign: c.name, platform,
      spend, impressions, clicks,
      orders: co.length, confirmed: confirmed.length, delivered: delivered.length,
      revenue, profit,
      roas: safeDiv(revenue, spend),
      roi: spend ? Math.round((profit / spend) * 10000) / 100 : 0,
      cpa: safeDiv(spend, co.length),
      costPerDelivered: safeDiv(spend, delivered.length),
      ctr: impressions ? Math.round((clicks / impressions) * 10000) / 100 : 0,
      cpc: safeDiv(spend, clicks),
      deliveryRate: pct(delivered.length, resolved),
    };
  }).sort((a, b) => b.profit - a.profit);
}

export function expenseBreakdown(db: DataSet, range: DateRange, orders: Order[]) {
  const map = new Map<ExpenseCategory, number>();
  const add = (c: ExpenseCategory, v: number) => map.set(c, money((map.get(c) ?? 0) + v));

  const delivered = orders.filter((o) => o.status === 'delivered');
  add('product_purchase', sum(delivered.map((o) => o.product_cost)));
  add('shipping', sum(delivered.map((o) => o.shipping_cost)));
  add('return_shipping', sum(orders.map((o) => o.return_cost)));
  add('packaging', sum(delivered.map((o) => o.packaging_cost)));
  const spendRows = db.adSpend.filter((s) => inRange(s.date, range));
  add('advertising', spendRows.length ? sum(spendRows.map((s) => s.spend)) : sum(orders.map((o) => o.ad_cost)));

  for (const e of db.expenses) {
    if (!inRange(e.date, range)) continue;
    if (e.is_auto) continue;
    if (e.category === 'advertising') continue;
    add(e.category, e.amount);
  }
  return [...map.entries()]
    .filter(([, v]) => v > 0)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/* ------------------------------------------------------------ intelligence */

export interface Insight {
  severity: 'info' | 'success' | 'warning' | 'critical';
  title: string;
  detail: string;
  link?: string;
}

/** The rules that power both the notification centre and the AI assistant. */
export function generateInsights(db: DataSet, orders: Order[], range: DateRange): Insight[] {
  const out: Insight[] = [];
  const s = salesKpis(db, orders);
  const f = financeKpis(db, orders, range);
  const inv = inventoryKpis(db);
  const camps = campaignPerformance(db, orders, range);

  if (inv.outOfStock > 0) {
    out.push({
      severity: 'critical',
      title: `${inv.outOfStock} مقاس نفد من المخزون`,
      detail: `قيمة إعادة التخزين المقترحة ${Math.round(inv.restockValue)} MAD`,
      link: '/inventory',
    });
  }
  if (inv.lowStock > 0) {
    out.push({
      severity: 'warning',
      title: `${inv.lowStock} مقاس وصل للحد الأدنى`,
      detail: 'راجع صفحة إعادة التخزين قبل نفاد الكمية.',
      link: '/inventory',
    });
  }
  if (s.pendingConfirmation > 0) {
    out.push({
      severity: 'warning',
      title: `${s.pendingConfirmation} طلب ينتظر التأكيد`,
      detail: 'كل ساعة تأخير تقلل نسبة التأكيد.',
      link: '/orders?status=to_confirm',
    });
  }
  if (s.refusalRate > 20 && s.orders > 10) {
    out.push({
      severity: 'critical',
      title: `نسبة الرفض مرتفعة: ${s.refusalRate}%`,
      detail: 'راجع جودة الاستهداف والمدن ذات الرفض العالي.',
      link: '/analytics',
    });
  }
  const losing = camps.filter((c) => c.spend > 200 && c.profit < 0);
  for (const c of losing.slice(0, 2)) {
    out.push({
      severity: 'critical',
      title: `حملة خاسرة: ${c.campaign}`,
      detail: `أنفقت ${Math.round(c.spend)} MAD وخسارتها ${Math.round(Math.abs(c.profit))} MAD (ROAS ${c.roas}).`,
      link: '/marketing',
    });
  }
  const best = camps.find((c) => c.spend > 100 && c.roas >= 2.5);
  if (best) {
    out.push({
      severity: 'success',
      title: `أفضل حملة: ${best.campaign}`,
      detail: `ROAS ${best.roas} — تكلفة الطلب المسلّم ${Math.round(best.costPerDelivered)} MAD.`,
      link: '/marketing',
    });
  }
  if (f.netProfit < 0) {
    out.push({
      severity: 'critical',
      title: 'الربح الصافي سالب في هذه الفترة',
      detail: `الخسارة ${Math.round(Math.abs(f.netProfit))} MAD — أكبر بند مصاريف: الإعلانات ${Math.round(f.adSpend)} MAD.`,
      link: '/finance',
    });
  }
  return out;
}
