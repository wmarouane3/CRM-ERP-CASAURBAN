/**
 * SHOES OS — In-memory engine.
 *
 * This is the TypeScript twin of supabase/migrations/0002_functions.sql.
 * Same state machine, same stock rules, same profit formula — so what you
 * click in the demo behaves exactly like what the database will do in
 * production. Every mutation goes through here; nothing mutates the
 * DataSet directly.
 */
import { money } from '../../core/money';
import { recalcOrder } from '../../core/profit';
import {
  assertPhone, assertPrice, assertQuantity, assertRequired, assertTransition,
  DomainError, isLikelyDuplicate, normalizePhone,
} from '../../core/validation';
import type {
  AppNotification, AppUser, Customer, DataSet, Expense, InventoryMovement,
  MovementType, Order, OrderItem, OrderStatus, ProductVariant, UUID,
} from '../../core/types';
import type { NewOrderInput, StockAdjustInput } from '../ports';

export const uid = (): UUID =>
  (globalThis.crypto?.randomUUID?.() ??
    `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

const nowISO = () => new Date().toISOString();

export interface Ctx {
  db: DataSet;
  actor?: AppUser | null;
  /** Lets the seeder backdate everything it creates. */
  clock?: () => string;
}

const at = (c: Ctx) => (c.clock ? c.clock() : nowISO());

/* ====================================================================== */
/* AUDIT                                                                  */
/* ====================================================================== */

export function audit(
  c: Ctx, action: string, entity: string,
  entityId: UUID | undefined, label: string,
  before?: unknown, after?: unknown,
) {
  c.db.auditLogs.unshift({
    id: uid(),
    org_id: c.db.organization.id,
    actor_id: c.actor?.id,
    actor_name: c.actor?.full_name ?? 'النظام',
    action, entity, entity_id: entityId, entity_label: label,
    before, after, created_at: at(c),
  });
  if (c.db.auditLogs.length > 4000) c.db.auditLogs.length = 4000;
}

export function notify(
  c: Ctx, severity: AppNotification['severity'],
  code: string, title: string, body?: string, link?: string,
) {
  // de-duplicate: same code + title still unread → don't spam
  const dup = c.db.notifications.find((n) => n.code === code && n.title === title && !n.is_read);
  if (dup) return;
  c.db.notifications.unshift({
    id: uid(), org_id: c.db.organization.id, severity, code, title, body, link,
    is_read: false, created_at: at(c),
  });
  if (c.db.notifications.length > 300) c.db.notifications.length = 300;
}

/* ====================================================================== */
/* STOCK ENGINE — the only door into `inventory`                          */
/* ====================================================================== */

const SIGN: Record<MovementType, number> = {
  purchase_in: 1, return_in: 1, refusal_in: 1, adjustment_in: 1, transfer_in: 1,
  sale_out: -1, adjustment_out: -1, transfer_out: -1,
  reserve: 0, release: 0,
};

export function defaultWarehouse(db: DataSet): UUID {
  return (db.warehouses.find((w) => w.is_default) ?? db.warehouses[0]).id;
}

export function inventoryOf(db: DataSet, variantId: UUID, warehouseId?: UUID) {
  const wh = warehouseId ?? defaultWarehouse(db);
  let row = db.inventory.find((i) => i.variant_id === variantId && i.warehouse_id === wh);
  if (!row) {
    row = {
      id: uid(), org_id: db.organization.id, variant_id: variantId,
      warehouse_id: wh, on_hand: 0, reserved: 0, updated_at: nowISO(),
    };
    db.inventory.push(row);
  }
  return row;
}

export function availableStock(db: DataSet, variantId: UUID, warehouseId?: UUID): number {
  const r = inventoryOf(db, variantId, warehouseId);
  return r.on_hand - r.reserved;
}

export function applyStock(c: Ctx, input: StockAdjustInput & {
  reference_type?: string; reference_id?: UUID; reference_label?: string;
}): InventoryMovement {
  const { db } = c;
  const qty = assertQuantity(input.quantity);
  const variant = db.variants.find((v) => v.id === input.variant_id);
  if (!variant) throw new DomainError('STOCK_VARIANT_NOT_FOUND', 'المقاس غير موجود');

  const row = inventoryOf(db, variant.id, input.warehouse_id);
  const sign = SIGN[input.type];
  const delta = sign * qty;

  if (input.type === 'reserve') row.reserved += qty;
  else if (input.type === 'release') row.reserved = Math.max(0, row.reserved - qty);
  else {
    if (row.on_hand + delta < 0 && !db.settings.allow_negative_stock) {
      const product = db.products.find((p) => p.id === variant.product_id);
      throw new DomainError(
        'STOCK_INSUFFICIENT',
        `المخزون غير كافٍ: ${product?.name ?? ''} مقاس ${variant.size} — المتوفر ${row.on_hand}`,
      );
    }
    row.on_hand += delta;
  }
  row.updated_at = at(c);

  const mv: InventoryMovement = {
    id: uid(), org_id: db.organization.id, variant_id: variant.id,
    warehouse_id: row.warehouse_id, type: input.type, quantity: delta,
    balance_after: row.on_hand,
    reference_type: input.reference_type, reference_id: input.reference_id,
    reference_label: input.reference_label,
    unit_cost: variant.cost_price, note: input.note,
    created_by: c.actor?.id, created_by_name: c.actor?.full_name,
    created_at: at(c),
  };
  db.movements.unshift(mv);
  checkLowStock(c, variant, row.on_hand);
  return mv;
}

function checkLowStock(c: Ctx, variant: ProductVariant, onHand: number) {
  const product = c.db.products.find((p) => p.id === variant.product_id);
  const label = `${product?.name ?? ''} — مقاس ${variant.size}`;
  if (onHand === 0) {
    notify(c, 'critical', 'stock.out', 'نفاد المخزون', `${label} — الكمية 0`, '/inventory');
    if (product) {
      const anyLeft = c.db.variants
        .filter((v) => v.product_id === product.id)
        .some((v) => inventoryOf(c.db, v.id).on_hand > 0);
      if (!anyLeft) product.status = 'out_of_stock';
    }
  } else if (onHand <= variant.min_stock) {
    notify(c, 'warning', 'stock.low', 'مخزون منخفض', `${label} — بقي ${onHand} قطع`, '/inventory');
  }
}

/* ====================================================================== */
/* CUSTOMERS                                                              */
/* ====================================================================== */

export function refreshCustomer(db: DataSet, customerId: UUID) {
  const c = db.customers.find((x) => x.id === customerId);
  if (!c) return;
  const orders = db.orders.filter((o) => o.customer_id === customerId);
  const delivered = orders.filter((o) => o.status === 'delivered');
  const refused = orders.filter((o) => o.status === 'refused');
  const returned = orders.filter((o) => o.status === 'returned');
  const cancelled = orders.filter((o) => o.status === 'cancelled');

  c.total_orders = orders.length;
  c.delivered_orders = delivered.length;
  c.refused_orders = refused.length;
  c.returned_orders = returned.length;
  c.cancelled_orders = cancelled.length;
  c.total_spent = money(delivered.reduce((a, o) => a + o.revenue, 0));
  c.total_profit = money(orders.reduce((a, o) => a + o.net_profit, 0));
  c.avg_order_value = delivered.length ? money(c.total_spent / delivered.length) : 0;
  c.lifetime_value = c.total_profit;
  const times = orders.map((o) => new Date(o.created_at).getTime());
  c.first_order_at = times.length ? new Date(Math.min(...times)).toISOString() : undefined;
  c.last_order_at = times.length ? new Date(Math.max(...times)).toISOString() : undefined;

  const bad = refused.length + returned.length;
  if (orders.length === 0) c.segment = 'new';
  else if (delivered.length >= 3 && c.total_spent >= 2000) c.segment = 'vip';
  else if (orders.length >= 2 && bad / orders.length >= 0.5) c.segment = 'high_risk';
  else if (delivered.length >= 2) c.segment = 'returning';
  else if (c.last_order_at && Date.now() - new Date(c.last_order_at).getTime() > 120 * 864e5) c.segment = 'inactive';
  else c.segment = 'new';
}

export function findOrCreateCustomer(
  c: Ctx,
  input: { id?: UUID; full_name: string; phone: string; city_id?: UUID; city_name?: string; address?: string },
): Customer {
  const { db } = c;
  const phone = assertPhone(input.phone);
  assertRequired(input.full_name, 'اسم العميل');

  const existing = input.id
    ? db.customers.find((x) => x.id === input.id)
    : db.customers.find((x) => normalizePhone(x.phone) === phone);

  if (existing) {
    existing.full_name = input.full_name || existing.full_name;
    if (input.city_id) existing.city_id = input.city_id;
    if (input.city_name) existing.city_name = input.city_name;
    if (input.address) existing.address = input.address;
    return existing;
  }

  const customer: Customer = {
    id: uid(), org_id: db.organization.id,
    reference: `CUS-${String(db.customers.length + 1).padStart(4, '0')}`,
    full_name: input.full_name, phone,
    city_id: input.city_id, city_name: input.city_name, address: input.address,
    segment: 'new',
    total_orders: 0, delivered_orders: 0, refused_orders: 0, returned_orders: 0,
    cancelled_orders: 0, total_spent: 0, total_profit: 0, avg_order_value: 0,
    lifetime_value: 0, tags: [], created_at: at(c),
  };
  db.customers.push(customer);
  audit(c, 'create', 'customer', customer.id, customer.full_name, undefined, customer);
  return customer;
}

/* ====================================================================== */
/* ORDERS                                                                 */
/* ====================================================================== */

export function nextOrderNumber(db: DataSet): string {
  const n = db.settings.order_number_next;
  db.settings.order_number_next = n + 1;
  return `${db.settings.order_number_prefix}${n}`;
}

export function orderItems(db: DataSet, orderId: UUID): OrderItem[] {
  return db.orderItems.filter((i) => i.order_id === orderId);
}

export function createOrder(c: Ctx, input: NewOrderInput): Order {
  const { db } = c;
  if (!input.lines?.length) throw new DomainError('EMPTY_ORDER', 'أضف منتجاً واحداً على الأقل');

  const customer = findOrCreateCustomer(c, input.customer);
  const createdAt = at(c);

  // ---- duplicate protection ------------------------------------------
  if (input.external_id) {
    const dup = db.orders.find(
      (o) => o.external_id === input.external_id && o.channel === (input.channel ?? 'manual'),
    );
    if (dup) throw new DomainError('DUPLICATE_ORDER', `الطلب ${input.external_id} مستورد مسبقاً`);
  }
  const recent = db.orders
    .filter((o) => o.customer_id === customer.id)
    .map((o) => ({
      phone: o.phone,
      variantIds: orderItems(db, o.id).map((i) => i.variant_id),
      createdAt: new Date(o.created_at),
    }));
  if (isLikelyDuplicate(
    { phone: customer.phone, variantIds: input.lines.map((l) => l.variant_id), createdAt: new Date(createdAt) },
    recent,
  )) {
    throw new DomainError('DUPLICATE_ORDER', 'طلب مطابق لنفس العميل خلال آخر ساعة — تحقق قبل الإنشاء');
  }

  const city = db.cities.find((x) => x.id === (input.customer.city_id ?? customer.city_id));
  const shipping = input.shipping_cost ?? city?.default_shipping_cost ?? db.settings.default_shipping_cost;

  const order: Order = {
    id: uid(), org_id: db.organization.id,
    warehouse_id: defaultWarehouse(db),
    order_number: nextOrderNumber(db),
    customer_id: customer.id,
    customer_name: customer.full_name,
    phone: customer.phone,
    city_id: city?.id ?? customer.city_id,
    city_name: city?.name_ar ?? customer.city_name,
    address: input.customer.address ?? customer.address,
    status: input.status ?? 'new',
    channel: (input.channel as Order['channel']) ?? 'manual',
    source: input.source,
    ad_campaign_id: input.ad_campaign_id,
    currency: db.settings.currency, fx_rate: 1,
    subtotal: 0, discount: money(input.discount ?? 0), revenue: 0,
    product_cost: 0,
    shipping_cost: money(assertPrice(shipping, 'تكلفة الشحن')),
    return_cost: 0,
    ad_cost: money(input.ad_cost ?? 0),
    packaging_cost: money(input.packaging_cost ?? db.settings.default_packaging_cost),
    other_cost: money(input.other_cost ?? 0),
    gross_profit: 0, net_profit: 0, profit_margin: 0,
    revenue_recognized: false, stock_committed: false, stock_restored: false,
    payment_method: (input.payment_method as Order['payment_method']) ?? 'cod',
    external_id: input.external_id,
    notes: input.notes, tags: [],
    created_by: c.actor?.id, created_at: createdAt, updated_at: createdAt,
  };

  for (const line of input.lines) {
    const variant = db.variants.find((v) => v.id === line.variant_id);
    if (!variant) throw new DomainError('VARIANT_NOT_FOUND', 'المقاس المطلوب غير موجود');
    const product = db.products.find((p) => p.id === variant.product_id)!;
    const qty = assertQuantity(line.quantity);
    const unit_price = assertPrice(line.unit_price ?? variant.selling_price, 'سعر البيع');
    const unit_cost = assertPrice(line.unit_cost ?? variant.cost_price, 'سعر التكلفة');

    db.orderItems.push({
      id: uid(), org_id: db.organization.id, order_id: order.id,
      variant_id: variant.id, product_id: product.id,
      product_name: product.name, model: product.model,
      size: variant.size, sku: variant.sku,
      quantity: qty, unit_price, unit_cost, discount: money(line.discount ?? 0),
      line_revenue: money(qty * unit_price - (line.discount ?? 0)),
      line_cost: money(qty * unit_cost),
    });
  }

  db.orders.unshift(order);
  const recalculated = recalcOrder(order, orderItems(db, order.id));
  Object.assign(order, recalculated);

  db.statusHistory.push({
    id: uid(), org_id: db.organization.id, order_id: order.id,
    to_status: order.status, note: 'إنشاء الطلب',
    changed_by: c.actor?.id, changed_by_name: c.actor?.full_name ?? 'النظام',
    created_at: createdAt,
  });

  refreshCustomer(db, customer.id);
  audit(c, 'create', 'order', order.id, order.order_number, undefined, order);
  notify(c, 'info', 'orders.new', 'طلب جديد',
    `${order.order_number} — ${order.customer_name} (${order.city_name ?? ''})`, '/orders');
  return order;
}

function commitStock(c: Ctx, order: Order) {
  if (order.stock_committed) return;
  for (const it of orderItems(c.db, order.id)) {
    applyStock(c, {
      variant_id: it.variant_id, warehouse_id: order.warehouse_id,
      type: 'sale_out', quantity: it.quantity,
      reference_type: 'order', reference_id: order.id,
      reference_label: `Order ${order.order_number}`,
      note: 'خصم المخزون عند تأكيد الطلب',
    });
  }
  order.stock_committed = true;
}

function restoreStock(c: Ctx, order: Order, type: MovementType, note: string) {
  if (!order.stock_committed || order.stock_restored) return;
  for (const it of orderItems(c.db, order.id)) {
    applyStock(c, {
      variant_id: it.variant_id, warehouse_id: order.warehouse_id,
      type, quantity: it.quantity,
      reference_type: 'order', reference_id: order.id,
      reference_label: `Return ${order.order_number}`,
      note,
    });
  }
  order.stock_restored = true;
}

function autoExpense(c: Ctx, e: Partial<Expense>) {
  c.db.expenses.unshift({
    id: uid(), org_id: c.db.organization.id,
    date: (e.date ?? at(c)).slice(0, 10),
    category: e.category ?? 'other',
    amount: money(e.amount ?? 0), currency: c.db.settings.currency,
    description: e.description, payment_method: e.payment_method ?? 'cash',
    reference_type: e.reference_type, reference_id: e.reference_id,
    is_auto: true, created_at: at(c),
  });
}

export function setOrderStatus(
  c: Ctx, orderId: UUID, status: OrderStatus, reason?: string, note?: string,
): Order {
  const { db } = c;
  const order = db.orders.find((o) => o.id === orderId);
  if (!order) throw new DomainError('ORDER_NOT_FOUND', 'الطلب غير موجود');
  if (order.status === status) return order;
  assertTransition(order.status, status);

  const from = order.status;
  const ts = at(c);
  const s = db.settings;

  if (status === 'confirmed') {
    commitStock(c, order);
    order.confirmed_at = order.confirmed_at ?? ts;
  }

  if (status === 'preparing' && !order.stock_committed) commitStock(c, order);

  if (status === 'shipped') {
    if (!order.stock_committed) commitStock(c, order);
    order.shipped_at = order.shipped_at ?? ts;
    order.tracking_number = order.tracking_number ?? `OZN${Math.floor(1e8 + Math.random() * 9e8)}`;
    let shipment = db.shipments.find((x) => x.order_id === order.id);
    if (!shipment) {
      shipment = {
        id: uid(), org_id: db.organization.id, order_id: order.id,
        carrier_code: 'ozonexpress',
        reference: `SHP-${String(db.shipments.length + 1).padStart(5, '0')}`,
        tracking_number: order.tracking_number, status: 'sent',
        city_name: order.city_name, address: order.address, phone: order.phone,
        cod_amount: order.revenue, shipping_cost: order.shipping_cost,
        return_cost: 0, sent_at: ts, created_at: ts,
      };
      db.shipments.unshift(shipment);
    } else {
      shipment.status = 'sent';
      shipment.sent_at = ts;
      shipment.tracking_number = order.tracking_number;
    }
  }

  if (status === 'delivered') {
    order.delivered_at = ts;
    order.closed_at = ts;
    const sh = db.shipments.find((x) => x.order_id === order.id);
    if (sh) { sh.status = 'delivered'; sh.delivered_at = ts; }
    db.payments.unshift({
      id: uid(), org_id: db.organization.id, order_id: order.id,
      date: ts.slice(0, 10), amount: order.revenue,
      method: order.payment_method, reference: `COD ${order.order_number}`,
    });
  }

  if (status === 'refused') {
    order.return_cost = order.return_cost || s.default_return_cost;
    order.closed_at = ts;
    const sh = db.shipments.find((x) => x.order_id === order.id);
    if (sh) { sh.status = 'refused'; sh.return_cost = order.return_cost; }
    if (s.restock_on_refused) restoreStock(c, order, 'refusal_in', 'رفض الطلب — إعادة القطع للمخزون');
    autoExpense(c, {
      date: ts, category: 'return_shipping', amount: order.return_cost,
      description: `تكلفة إرجاع الطلب ${order.order_number}`,
      reference_type: 'order', reference_id: order.id,
    });
    notify(c, 'warning', 'orders.refused', 'طلب مرفوض',
      `${order.order_number} — ${order.city_name ?? ''}`, '/orders');
  }

  if (status === 'returned') {
    order.return_cost = order.return_cost || s.default_return_cost;
    order.closed_at = ts;
    const sh = db.shipments.find((x) => x.order_id === order.id);
    if (sh) { sh.status = 'returned'; sh.return_cost = order.return_cost; }
    if (s.restock_on_returned) restoreStock(c, order, 'return_in', 'استرجاع الطلب — إعادة القطع للمخزون');
    db.returns.unshift({
      id: uid(), org_id: db.organization.id, order_id: order.id,
      reference: `RET-${String(db.returns.length + 1).padStart(5, '0')}`,
      reason, restock: s.restock_on_returned, return_cost: order.return_cost,
      received_at: ts, created_at: ts,
      items: orderItems(db, order.id).map((i) => ({
        variant_id: i.variant_id, quantity: i.quantity, restocked: s.restock_on_returned,
      })),
    });
    if (from !== 'refused') {
      autoExpense(c, {
        date: ts, category: 'return_shipping', amount: order.return_cost,
        description: `تكلفة استرجاع الطلب ${order.order_number}`,
        reference_type: 'order', reference_id: order.id,
      });
    }
  }

  if (status === 'cancelled') {
    if (order.stock_committed) restoreStock(c, order, 'adjustment_in', 'إلغاء الطلب — إعادة المخزون');
    order.closed_at = ts;
  }

  order.status = status;
  order.updated_at = ts;
  Object.assign(order, recalcOrder(order, orderItems(db, order.id)));

  db.statusHistory.push({
    id: uid(), org_id: db.organization.id, order_id: order.id,
    from_status: from, to_status: status, reason, note,
    changed_by: c.actor?.id, changed_by_name: c.actor?.full_name ?? 'النظام',
    created_at: ts,
  });

  refreshCustomer(db, order.customer_id);
  audit(c, 'status_change', 'order', order.id, order.order_number,
    { status: from }, { status });
  return order;
}

export function updateOrder(c: Ctx, orderId: UUID, patch: Partial<Order>): Order {
  const order = c.db.orders.find((o) => o.id === orderId);
  if (!order) throw new DomainError('ORDER_NOT_FOUND', 'الطلب غير موجود');
  const before = { ...order };
  const allowed: (keyof Order)[] = [
    'customer_name', 'phone', 'city_id', 'city_name', 'address', 'notes',
    'shipping_cost', 'ad_cost', 'packaging_cost', 'other_cost', 'discount',
    'tracking_number', 'source', 'ad_campaign_id', 'payment_method', 'return_cost',
  ];
  for (const k of allowed) {
    if (patch[k] !== undefined) (order as unknown as Record<string, unknown>)[k] = patch[k];
  }
  order.updated_at = at(c);
  Object.assign(order, recalcOrder(order, orderItems(c.db, order.id)));
  refreshCustomer(c.db, order.customer_id);
  audit(c, 'update', 'order', order.id, order.order_number, before, order);
  return order;
}

/* ====================================================================== */
/* AD COST ALLOCATION                                                     */
/* ====================================================================== */

export function allocateAdCost(c: Ctx, date: string): number {
  const { db } = c;
  const rows = db.adSpend.filter((s) => s.date === date);
  let touched = 0;
  const byCampaign = new Map<string, number>();
  for (const r of rows) byCampaign.set(r.campaign_id, money((byCampaign.get(r.campaign_id) ?? 0) + r.spend));

  for (const [campaignId, spend] of byCampaign) {
    const orders = db.orders.filter(
      (o) => o.ad_campaign_id === campaignId &&
        o.created_at.slice(0, 10) === date && o.status !== 'cancelled',
    );
    if (!orders.length) continue;
    const per = money(spend / orders.length);
    for (const o of orders) {
      o.ad_cost = per;
      Object.assign(o, recalcOrder(o, orderItems(db, o.id)));
      refreshCustomer(db, o.customer_id);
      touched++;
    }
  }
  return touched;
}
