/**
 * SHOES OS — Demo adapter.
 * Implements DataPort against an in-memory DataSet driven by the engine.
 * Used when VITE_SUPABASE_URL is not configured (offline demo / tests).
 */
import type {
  AdCampaign, AdSpend, AppNotification, AppUser, Customer, DataSet, Expense,
  Goal, Integration, Order, OrderStatus, Product, ProductVariant, Settings, UUID,
} from '../../core/types';
import { money } from '../../core/money';
import { DomainError } from '../../core/validation';
import type { DataPort, NewOrderInput, StockAdjustInput } from '../ports';
import { buildEmptyDataSet, seedDemo } from './seed';
import {
  allocateAdCost, applyStock, audit, createOrder, findOrCreateCustomer,
  setOrderStatus, uid, updateOrder, type Ctx,
} from './engine';
import { parseShopifyOrder } from '../../integrations/shopify/mapper';

const STORAGE_KEY = 'shoes-os.demo.v1';

function loadSnapshot(): DataSet | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version: number; data: DataSet };
    if (parsed?.version !== 1) return null;
    return parsed.data;
  } catch { return null; }
}

function saveSnapshot(db: DataSet) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data: db }));
  } catch { /* private mode / quota — the demo still works in memory */ }
}

export class DemoAdapter implements DataPort {
  private db: DataSet;
  private user: AppUser;

  constructor() {
    const restored = loadSnapshot();
    this.db = restored ?? seedDemo(buildEmptyDataSet());
    this.user = this.db.users[0];
    if (!restored) this.persist();
  }

  private ctx(): Ctx { return { db: this.db, actor: this.user }; }
  private persist() { saveSnapshot(this.db); }

  async load(): Promise<DataSet> { return this.db; }

  /* ------------------------------------------------------------- auth */
  async signIn(email: string): Promise<AppUser> {
    const u = this.db.users.find((x) => x.email.toLowerCase() === email.toLowerCase());
    if (!u) throw new DomainError('AUTH_FAILED', 'المستخدم غير موجود');
    u.last_login_at = new Date().toISOString();
    this.user = u;
    audit(this.ctx(), 'login', 'user', u.id, u.full_name);
    this.persist();
    return u;
  }
  async signOut() { /* demo session stays local */ }
  async currentUser() { return this.user; }
  switchUser(userId: UUID) {
    const u = this.db.users.find((x) => x.id === userId);
    if (u) this.user = u;
    return this.user;
  }

  /* ----------------------------------------------------------- orders */
  async createOrder(input: NewOrderInput): Promise<Order> {
    const o = createOrder(this.ctx(), input);
    this.persist();
    return o;
  }
  async updateOrder(id: UUID, patch: Partial<Order>): Promise<Order> {
    const o = updateOrder(this.ctx(), id, patch);
    this.persist();
    return o;
  }
  async setOrderStatus(id: UUID, status: OrderStatus, reason?: string, note?: string): Promise<Order> {
    const o = setOrderStatus(this.ctx(), id, status, reason, note);
    this.persist();
    return o;
  }
  async deleteOrder(id: UUID): Promise<void> {
    const o = this.db.orders.find((x) => x.id === id);
    if (!o) return;
    if (o.stock_committed && !o.stock_restored) {
      throw new DomainError('ORDER_LOCKED', 'لا يمكن حذف طلب خُصم مخزونه — ألغِه بدل ذلك');
    }
    this.db.orders = this.db.orders.filter((x) => x.id !== id);
    this.db.orderItems = this.db.orderItems.filter((x) => x.order_id !== id);
    audit(this.ctx(), 'delete', 'order', id, o.order_number, o, undefined);
    this.persist();
  }

  /* ---------------------------------------------------------- catalog */
  async upsertProduct(p: Partial<Product> & { variants?: Partial<ProductVariant>[] }): Promise<Product> {
    const db = this.db;
    let product = p.id ? db.products.find((x) => x.id === p.id) : undefined;
    const before = product ? { ...product } : undefined;
    if (!product) {
      product = {
        id: uid(), org_id: db.organization.id,
        reference: p.reference ?? `SHO-${String(db.products.length + 1).padStart(4, '0')}`,
        name: p.name ?? 'منتج جديد', model: p.model, brand: p.brand,
        category: p.category, supplier_id: p.supplier_id,
        description: p.description, image_url: p.image_url,
        cost_price: money(p.cost_price ?? 0), selling_price: money(p.selling_price ?? 0),
        status: p.status ?? 'active', created_at: new Date().toISOString(),
      };
      db.products.push(product);
    } else {
      Object.assign(product, {
        ...p,
        cost_price: money(p.cost_price ?? product.cost_price),
        selling_price: money(p.selling_price ?? product.selling_price),
      });
    }
    for (const v of p.variants ?? []) {
      await this.upsertVariant({ ...v, product_id: product.id });
    }
    audit(this.ctx(), before ? 'update' : 'create', 'product', product.id, product.name, before, product);
    this.persist();
    return product;
  }

  async upsertVariant(v: Partial<ProductVariant> & { product_id: UUID }): Promise<ProductVariant> {
    const db = this.db;
    const product = db.products.find((p) => p.id === v.product_id)!;
    let variant = v.id
      ? db.variants.find((x) => x.id === v.id)
      : db.variants.find((x) => x.product_id === v.product_id && x.size === v.size);
    if (!variant) {
      variant = {
        id: uid(), org_id: db.organization.id, product_id: v.product_id,
        size: v.size ?? '40', color: v.color,
        sku: v.sku ?? `${product.model ?? product.reference}-${v.size}`,
        barcode: v.barcode,
        cost_price: money(v.cost_price ?? product.cost_price),
        selling_price: money(v.selling_price ?? product.selling_price),
        min_stock: v.min_stock ?? db.settings.low_stock_threshold,
        is_active: v.is_active ?? true,
      };
      db.variants.push(variant);
    } else {
      Object.assign(variant, v, {
        cost_price: money(v.cost_price ?? variant.cost_price),
        selling_price: money(v.selling_price ?? variant.selling_price),
      });
    }
    this.persist();
    return variant;
  }

  async adjustStock(input: StockAdjustInput): Promise<void> {
    applyStock(this.ctx(), { ...input, reference_type: 'manual', reference_label: 'تعديل يدوي' });
    audit(this.ctx(), 'update', 'inventory', input.variant_id, 'تعديل مخزون');
    this.persist();
  }

  /* --------------------------------------------------------------- crm */
  async upsertCustomer(c: Partial<Customer>): Promise<Customer> {
    const existing = c.id ? this.db.customers.find((x) => x.id === c.id) : undefined;
    if (existing) {
      const before = { ...existing };
      Object.assign(existing, c);
      audit(this.ctx(), 'update', 'customer', existing.id, existing.full_name, before, existing);
      this.persist();
      return existing;
    }
    const created = findOrCreateCustomer(this.ctx(), {
      full_name: c.full_name ?? '', phone: c.phone ?? '',
      city_id: c.city_id, city_name: c.city_name, address: c.address,
    });
    this.persist();
    return created;
  }

  /* ----------------------------------------------------------- finance */
  async addExpense(e: Partial<Expense>): Promise<Expense> {
    const row: Expense = {
      id: uid(), org_id: this.db.organization.id,
      date: e.date ?? new Date().toISOString().slice(0, 10),
      category: e.category ?? 'other',
      amount: money(e.amount ?? 0), currency: 'MAD',
      description: e.description, payment_method: e.payment_method ?? 'cash',
      reference_type: e.reference_type, reference_id: e.reference_id,
      is_auto: false, notes: e.notes, created_at: new Date().toISOString(),
    };
    this.db.expenses.unshift(row);
    audit(this.ctx(), 'create', 'expense', row.id, row.description ?? row.category, undefined, row);
    this.persist();
    return row;
  }
  async deleteExpense(id: UUID): Promise<void> {
    const e = this.db.expenses.find((x) => x.id === id);
    if (e?.is_auto) throw new DomainError('AUTO_EXPENSE', 'مصروف تلقائي مرتبط بطلب — لا يمكن حذفه يدوياً');
    this.db.expenses = this.db.expenses.filter((x) => x.id !== id);
    audit(this.ctx(), 'delete', 'expense', id, e?.description ?? '', e, undefined);
    this.persist();
  }

  /* --------------------------------------------------------- marketing */
  async upsertCampaign(c: Partial<AdCampaign>): Promise<AdCampaign> {
    let row = c.id ? this.db.campaigns.find((x) => x.id === c.id) : undefined;
    if (!row) {
      row = {
        id: uid(), org_id: this.db.organization.id,
        platform_id: c.platform_id ?? this.db.platforms[0].id,
        name: c.name ?? 'حملة جديدة', objective: c.objective,
        status: c.status ?? 'active',
        started_at: c.started_at ?? new Date().toISOString().slice(0, 10),
        daily_budget: c.daily_budget,
      };
      this.db.campaigns.push(row);
    } else Object.assign(row, c);
    audit(this.ctx(), 'update', 'campaign', row.id, row.name);
    this.persist();
    return row;
  }

  async addAdSpend(s: Partial<AdSpend>): Promise<AdSpend> {
    const date = s.date ?? new Date().toISOString().slice(0, 10);
    const existing = this.db.adSpend.find(
      (x) => x.campaign_id === s.campaign_id && x.date === date && !x.ad_id);
    if (existing) {
      Object.assign(existing, {
        spend: money(s.spend ?? existing.spend),
        impressions: s.impressions ?? existing.impressions,
        clicks: s.clicks ?? existing.clicks,
        leads: s.leads ?? existing.leads,
      });
      this.persist();
      return existing;
    }
    const row: AdSpend = {
      id: uid(), org_id: this.db.organization.id, date,
      campaign_id: s.campaign_id!, spend: money(s.spend ?? 0),
      impressions: s.impressions ?? 0, clicks: s.clicks ?? 0,
      leads: s.leads ?? 0, currency: 'MAD',
    };
    this.db.adSpend.push(row);
    this.persist();
    return row;
  }

  async allocateAdCost(date: string): Promise<number> {
    const n = allocateAdCost(this.ctx(), date);
    this.persist();
    return n;
  }

  /* --------------------------------------------- goals / settings / etc */
  async upsertGoal(g: Partial<Goal>): Promise<Goal> {
    let row = g.id ? this.db.goals.find((x) => x.id === g.id) : undefined;
    if (!row) {
      row = {
        id: uid(), org_id: this.db.organization.id,
        metric: g.metric ?? 'sales', period: g.period ?? 'month',
        period_start: g.period_start ?? new Date().toISOString().slice(0, 10),
        period_end: g.period_end ?? new Date().toISOString().slice(0, 10),
        target_value: money(g.target_value ?? 0), label: g.label, is_active: true,
      };
      this.db.goals.push(row);
    } else Object.assign(row, g);
    this.persist();
    return row;
  }

  async updateSettings(s: Partial<Settings>): Promise<Settings> {
    const before = { ...this.db.settings };
    Object.assign(this.db.settings, s);
    audit(this.ctx(), 'update', 'settings', undefined, 'إعدادات النظام', before, this.db.settings);
    this.persist();
    return this.db.settings;
  }

  async markNotificationRead(id: UUID): Promise<void> {
    const n = this.db.notifications.find((x) => x.id === id);
    if (n) n.is_read = true;
    this.persist();
  }
  async listNotifications(): Promise<AppNotification[]> { return this.db.notifications; }

  /* ------------------------------------------------------ integrations */
  async upsertIntegration(i: Partial<Integration>): Promise<Integration> {
    let row = i.id
      ? this.db.integrations.find((x) => x.id === i.id)
      : this.db.integrations.find((x) => x.provider === i.provider);
    if (!row) {
      row = {
        id: uid(), org_id: this.db.organization.id,
        provider: i.provider ?? 'custom', label: i.label,
        is_enabled: i.is_enabled ?? false, config: i.config ?? {},
      };
      this.db.integrations.push(row);
    } else Object.assign(row, i);
    audit(this.ctx(), 'update', 'integration', row.id, row.provider);
    this.persist();
    return row;
  }

  async ingestExternalOrder(provider: string, payload: unknown) {
    const db = this.db;
    const eventId = uid();
    const parsed = provider === 'shopify'
      ? parseShopifyOrder(payload, db)
      : null;

    if (!parsed) {
      db.integrationEvents.unshift({
        id: eventId, org_id: db.organization.id, provider,
        direction: 'inbound', event_type: 'orders/create',
        status: 'failed', error: 'PAYLOAD_NOT_SUPPORTED',
        created_at: new Date().toISOString(),
      });
      this.persist();
      return { status: 'failed' };
    }

    const dup = db.integrationEvents.find(
      (e) => e.provider === provider && e.idempotency_key === parsed.idempotencyKey);
    if (dup) {
      db.integrationEvents.unshift({
        id: eventId, org_id: db.organization.id, provider,
        direction: 'inbound', event_type: 'orders/create',
        external_id: parsed.externalId, idempotency_key: parsed.idempotencyKey,
        status: 'skipped', error: 'DUPLICATE', created_at: new Date().toISOString(),
      });
      this.persist();
      return { status: 'skipped' };
    }

    try {
      const order = createOrder(this.ctx(), parsed.input);
      db.integrationEvents.unshift({
        id: eventId, org_id: db.organization.id, provider,
        direction: 'inbound', event_type: 'orders/create',
        external_id: parsed.externalId, idempotency_key: parsed.idempotencyKey,
        status: 'processed', created_at: new Date().toISOString(),
      });
      this.persist();
      return { status: 'processed', order };
    } catch (err) {
      db.integrationEvents.unshift({
        id: eventId, org_id: db.organization.id, provider,
        direction: 'inbound', event_type: 'orders/create',
        external_id: parsed.externalId, idempotency_key: parsed.idempotencyKey,
        status: 'failed', error: (err as Error).message,
        created_at: new Date().toISOString(),
      });
      this.persist();
      return { status: 'failed' };
    }
  }

  /* ------------------------------------------------------------- admin */
  async resetDemoData(): Promise<void> {
    this.db = buildEmptyDataSet();
    this.user = this.db.users[0];
    this.persist();
  }
  async seedDemoData(): Promise<void> {
    this.db = seedDemo(buildEmptyDataSet());
    this.user = this.db.users[0];
    this.persist();
  }
}
