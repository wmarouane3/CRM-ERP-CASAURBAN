/**
 * SHOES OS — Profit engine.
 *
 * ONE formula, used by the order form, the order table, the dashboard,
 * the P&L and every report. Mirrors fn_order_recalc() in SQL.
 *
 *   revenue       = Σ (qty × unit_price) − line discounts − order discount
 *   gross_profit  = revenue − product_cost
 *   net_profit    = gross_profit − shipping − return − ads − packaging − other
 *   margin        = net_profit / revenue × 100
 *
 * Revenue is only RECOGNISED on `delivered`.
 * A refused/returned order keeps its costs → it shows a real loss.
 * A cancelled order only keeps the ad money that was already burnt.
 */
import { money, pct } from './money';
import type { Order, OrderItem, OrderStatus } from './types';

export interface ProfitInput {
  status: OrderStatus;
  items: { quantity: number; unit_price: number; unit_cost: number; discount?: number }[];
  discount?: number;
  shipping_cost?: number;
  return_cost?: number;
  ad_cost?: number;
  packaging_cost?: number;
  other_cost?: number;
}

export interface ProfitResult {
  subtotal: number;
  revenue: number;
  product_cost: number;
  shipping_cost: number;
  return_cost: number;
  ad_cost: number;
  packaging_cost: number;
  other_cost: number;
  total_cost: number;
  gross_profit: number;
  net_profit: number;
  profit_margin: number;
  revenue_recognized: boolean;
}

export function computeProfit(i: ProfitInput): ProfitResult {
  const subtotal = money(
    i.items.reduce((a, it) => a + it.quantity * it.unit_price - (it.discount ?? 0), 0),
  );
  const product_cost = money(i.items.reduce((a, it) => a + it.quantity * it.unit_cost, 0));
  const revenue = money(Math.max(subtotal - (i.discount ?? 0), 0));

  const shipping_cost = money(i.shipping_cost ?? 0);
  const return_cost = money(i.return_cost ?? 0);
  const ad_cost = money(i.ad_cost ?? 0);
  const packaging_cost = money(i.packaging_cost ?? 0);
  const other_cost = money(i.other_cost ?? 0);

  let gross_profit = 0;
  let net_profit = 0;
  let revenue_recognized = false;
  let recognisedRevenue = 0;

  if (i.status === 'delivered') {
    revenue_recognized = true;
    recognisedRevenue = revenue;
    gross_profit = money(revenue - product_cost);
    net_profit = money(
      gross_profit - shipping_cost - return_cost - ad_cost - packaging_cost - other_cost,
    );
  } else if (i.status === 'refused' || i.status === 'returned') {
    // The shoes came back. No revenue — but the money already left.
    gross_profit = 0;
    net_profit = money(
      -(shipping_cost + return_cost + ad_cost + packaging_cost + other_cost),
    );
  } else if (i.status === 'cancelled') {
    gross_profit = 0;
    net_profit = money(-ad_cost);
  } else {
    // Still in the pipeline → potential profit, not recognised.
    gross_profit = money(revenue - product_cost);
    net_profit = money(
      gross_profit - shipping_cost - ad_cost - packaging_cost - other_cost,
    );
  }

  const total_cost = money(
    product_cost + shipping_cost + return_cost + ad_cost + packaging_cost + other_cost,
  );

  return {
    subtotal, revenue, product_cost, shipping_cost, return_cost, ad_cost,
    packaging_cost, other_cost, total_cost, gross_profit, net_profit,
    profit_margin: pct(net_profit, recognisedRevenue || revenue, 2),
    revenue_recognized,
  };
}

/** Recompute an order object in place-safe (returns a new object). */
export function recalcOrder(order: Order, items: OrderItem[]): Order {
  const r = computeProfit({
    status: order.status,
    items: items.map((it) => ({
      quantity: it.quantity, unit_price: it.unit_price,
      unit_cost: it.unit_cost, discount: it.discount,
    })),
    discount: order.discount,
    shipping_cost: order.shipping_cost,
    return_cost: order.return_cost,
    ad_cost: order.ad_cost,
    packaging_cost: order.packaging_cost,
    other_cost: order.other_cost,
  });
  return {
    ...order,
    subtotal: r.subtotal,
    revenue: r.revenue,
    product_cost: r.product_cost,
    gross_profit: r.gross_profit,
    net_profit: r.net_profit,
    profit_margin: r.profit_margin,
    revenue_recognized: r.revenue_recognized,
  };
}

/* -------------------------------------------------------------------- */
/* Marketing maths — always on DELIVERED, never on raw orders.          */
/* -------------------------------------------------------------------- */

export interface AdMetricsInput {
  spend: number; impressions?: number; clicks?: number; leads?: number;
  orders: number; confirmedOrders: number; deliveredOrders: number;
  revenue: number;      // delivered revenue
  profit: number;       // delivered net profit (already includes ad cost)
}

export interface AdMetrics {
  spend: number; roas: number; roi: number; cpa: number;
  costPerDelivered: number; cpc: number; ctr: number; cpl: number;
  confirmRate: number; deliveryRate: number; breakEvenRoas: number;
}

export function computeAdMetrics(i: AdMetricsInput): AdMetrics {
  const d = (a: number, b: number, dec = 2) =>
    b ? Math.round((a / b) * 10 ** dec) / 10 ** dec : 0;
  return {
    spend: money(i.spend),
    roas: d(i.revenue, i.spend),
    roi: d(i.profit * 100, i.spend),
    cpa: d(i.spend, i.orders),
    costPerDelivered: d(i.spend, i.deliveredOrders),
    cpc: d(i.spend, i.clicks ?? 0),
    ctr: i.impressions ? Math.round((i.clicks ?? 0) / i.impressions * 10000) / 100 : 0,
    cpl: d(i.spend, i.leads ?? 0),
    confirmRate: pct(i.confirmedOrders, i.orders),
    deliveryRate: pct(i.deliveredOrders, i.confirmedOrders),
    breakEvenRoas: i.revenue ? d(i.revenue, Math.max(i.revenue - i.profit - i.spend, 1)) : 0,
  };
}
