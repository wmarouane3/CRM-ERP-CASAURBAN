/**
 * SHOES OS — Supabase adapter (production).
 *
 * Everything that changes money or stock goes through an RPC
 * (fn_order_set_status, fn_stock_apply, …) so the rules live in the
 * database and cannot be bypassed by a modified client.
 * Plain reads/writes go through PostgREST, guarded by RLS.
 */
import type {
  AdCampaign, AdSpend, AppNotification, AppUser, Customer, DataSet, Expense,
  Goal, Integration, Order, OrderStatus, Product, ProductVariant, Settings, UUID,
} from '../../core/types';
import type { DataPort, NewOrderInput, StockAdjustInput } from '../ports';
import { supabase } from './client';

const T = {
  users: 'app_users', warehouses: 'warehouses', cities: 'cities',
  suppliers: 'suppliers', carriers: 'shipping_carriers',
  products: 'products', variants: 'product_variants',
  inventory: 'inventory', movements: 'inventory_movements',
  customers: 'customers', orders: 'orders', orderItems: 'order_items',
  statusHistory: 'order_status_history', shipments: 'shipments', returns: 'returns',
  platforms: 'ad_platforms', campaigns: 'ad_campaigns', adSets: 'ad_sets',
  ads: 'ads', adSpend: 'ad_spend', expenses: 'expenses', payments: 'payments',
  goals: 'goals', notifications: 'notifications', settings: 'settings',
  auditLogs: 'audit_logs', integrations: 'integrations',
  integrationEvents: 'integration_events', organizations: 'organizations',
} as const;

async function all<T>(table: string, limit = 5000): Promise<T[]> {
  const { data, error } = await supabase().from(table).select('*').limit(limit);
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []) as T[];
}

export class SupabaseAdapter implements DataPort {
  async load(): Promise<DataSet> {
    const [
      organizations, users, warehouses, cities, suppliers, carriers, products,
      variants, inventory, movements, customers, orders, orderItems,
      statusHistory, shipments, returns, platforms, campaigns, adSets, ads,
      adSpend, expenses, payments, goals, notifications, settingsRows,
      auditLogs, integrations, integrationEvents,
    ] = await Promise.all([
      all(T.organizations), all(T.users), all(T.warehouses), all(T.cities),
      all(T.suppliers), all(T.carriers), all(T.products), all(T.variants),
      all(T.inventory), all(T.movements, 2000), all(T.customers), all(T.orders),
      all(T.orderItems), all(T.statusHistory, 4000), all(T.shipments),
      all(T.returns), all(T.platforms), all(T.campaigns), all(T.adSets),
      all(T.ads), all(T.adSpend), all(T.expenses), all(T.payments), all(T.goals),
      all(T.notifications, 300), all(T.settings), all(T.auditLogs, 1000),
      all(T.integrations), all(T.integrationEvents, 300),
    ]);

    return {
      organization: organizations[0] as DataSet['organization'],
      settings: settingsRows[0] as Settings,
      users: users as AppUser[],
      warehouses: warehouses as DataSet['warehouses'],
      cities: cities as DataSet['cities'],
      suppliers: suppliers as DataSet['suppliers'],
      carriers: carriers as DataSet['carriers'],
      products: products as Product[],
      variants: variants as ProductVariant[],
      inventory: inventory as DataSet['inventory'],
      movements: movements as DataSet['movements'],
      customers: customers as Customer[],
      orders: orders as Order[],
      orderItems: orderItems as DataSet['orderItems'],
      statusHistory: statusHistory as DataSet['statusHistory'],
      shipments: shipments as DataSet['shipments'],
      returns: returns as DataSet['returns'],
      platforms: platforms as DataSet['platforms'],
      campaigns: campaigns as AdCampaign[],
      adSets: adSets as DataSet['adSets'],
      ads: ads as DataSet['ads'],
      adSpend: adSpend as AdSpend[],
      expenses: expenses as Expense[],
      payments: payments as DataSet['payments'],
      goals: goals as Goal[],
      notifications: notifications as AppNotification[],
      auditLogs: auditLogs as DataSet['auditLogs'],
      integrations: integrations as Integration[],
      integrationEvents: integrationEvents as DataSet['integrationEvents'],
    };
  }

  /* -------------------------------------------------------------- auth */
  async signIn(email: string, password: string): Promise<AppUser> {
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    const user = await this.currentUser();
    if (!user) throw new Error('تعذر تحميل ملف المستخدم');
    return user;
  }

  async signOut(): Promise<void> { await supabase().auth.signOut(); }

  async currentUser(): Promise<AppUser | null> {
    const { data } = await supabase().auth.getUser();
    if (!data.user) return null;
    const { data: row } = await supabase()
      .from(T.users).select('*').eq('id', data.user.id).single();
    return (row as AppUser) ?? null;
  }

  /* ------------------------------------------------------------ orders */
  async createOrder(input: NewOrderInput): Promise<Order> {
    const { data, error } = await supabase().rpc('fn_create_order', { p_input: input });
    if (error) throw new Error(error.message);
    return data as Order;
  }

  async updateOrder(id: UUID, patch: Partial<Order>): Promise<Order> {
    const { data, error } = await supabase()
      .from(T.orders).update(patch).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    await supabase().rpc('fn_order_recalc', { p_order: id });
    return data as Order;
  }

  async setOrderStatus(id: UUID, status: OrderStatus, reason?: string, note?: string): Promise<Order> {
    const { data, error } = await supabase().rpc('fn_order_set_status', {
      p_order: id, p_status: status, p_reason: reason ?? null, p_note: note ?? null,
    });
    if (error) throw new Error(error.message);
    return data as Order;
  }

  async deleteOrder(id: UUID): Promise<void> {
    const { error } = await supabase().from(T.orders).delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  /* ----------------------------------------------------------- catalog */
  async upsertProduct(p: Partial<Product> & { variants?: Partial<ProductVariant>[] }): Promise<Product> {
    const { variants, ...row } = p;
    const { data, error } = await supabase()
      .from(T.products).upsert(row).select().single();
    if (error) throw new Error(error.message);
    const product = data as Product;
    if (variants?.length) {
      const { error: vErr } = await supabase()
        .from(T.variants)
        .upsert(variants.map((v) => ({ ...v, product_id: product.id, org_id: product.org_id })));
      if (vErr) throw new Error(vErr.message);
    }
    return product;
  }

  async upsertVariant(v: Partial<ProductVariant> & { product_id: UUID }): Promise<ProductVariant> {
    const { data, error } = await supabase().from(T.variants).upsert(v).select().single();
    if (error) throw new Error(error.message);
    return data as ProductVariant;
  }

  async adjustStock(input: StockAdjustInput): Promise<void> {
    const { error } = await supabase().rpc('fn_stock_apply', {
      p_variant: input.variant_id,
      p_warehouse: input.warehouse_id,
      p_type: input.type,
      p_qty: input.quantity,
      p_reference_type: 'manual',
      p_note: input.note ?? null,
    });
    if (error) throw new Error(error.message);
  }

  /* --------------------------------------------------------------- crm */
  async upsertCustomer(c: Partial<Customer>): Promise<Customer> {
    const { data, error } = await supabase().from(T.customers).upsert(c).select().single();
    if (error) throw new Error(error.message);
    return data as Customer;
  }

  /* ----------------------------------------------------------- finance */
  async addExpense(e: Partial<Expense>): Promise<Expense> {
    const { data, error } = await supabase().from(T.expenses).insert(e).select().single();
    if (error) throw new Error(error.message);
    return data as Expense;
  }
  async deleteExpense(id: UUID): Promise<void> {
    const { error } = await supabase().from(T.expenses).delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  /* --------------------------------------------------------- marketing */
  async upsertCampaign(c: Partial<AdCampaign>): Promise<AdCampaign> {
    const { data, error } = await supabase().from(T.campaigns).upsert(c).select().single();
    if (error) throw new Error(error.message);
    return data as AdCampaign;
  }
  async addAdSpend(s: Partial<AdSpend>): Promise<AdSpend> {
    const { data, error } = await supabase()
      .from(T.adSpend)
      .upsert(s, { onConflict: 'campaign_id,ad_set_id,ad_id,date' })
      .select().single();
    if (error) throw new Error(error.message);
    return data as AdSpend;
  }
  async allocateAdCost(date: string): Promise<number> {
    const { data, error } = await supabase().rpc('fn_allocate_ad_cost', {
      p_org: null, p_date: date,
    });
    if (error) throw new Error(error.message);
    return (data as number) ?? 0;
  }

  /* ------------------------------------------------- goals / settings */
  async upsertGoal(g: Partial<Goal>): Promise<Goal> {
    const { data, error } = await supabase().from(T.goals).upsert(g).select().single();
    if (error) throw new Error(error.message);
    return data as Goal;
  }
  async updateSettings(s: Partial<Settings>): Promise<Settings> {
    const { data, error } = await supabase()
      .from(T.settings).update(s).eq('org_id', s.org_id!).select().single();
    if (error) throw new Error(error.message);
    return data as Settings;
  }
  async markNotificationRead(id: UUID): Promise<void> {
    await supabase().from(T.notifications).update({ is_read: true }).eq('id', id);
  }
  async listNotifications(): Promise<AppNotification[]> {
    return all<AppNotification>(T.notifications, 200);
  }

  /* ------------------------------------------------------ integrations */
  async upsertIntegration(i: Partial<Integration>): Promise<Integration> {
    const { data, error } = await supabase()
      .from(T.integrations).upsert(i, { onConflict: 'org_id,provider' }).select().single();
    if (error) throw new Error(error.message);
    return data as Integration;
  }

  /**
   * In production this path is the Edge Function `shopify-webhook`, which
   * verifies the HMAC signature before touching the database. Calling it
   * from the browser is only used by the built-in simulator.
   */
  async ingestExternalOrder(provider: string, payload: unknown) {
    const { data, error } = await supabase().functions.invoke(`${provider}-webhook`, {
      body: payload as Record<string, unknown>,
    });
    if (error) return { status: 'failed' };
    return data as { status: string; order?: Order };
  }

  /* ------------------------------------------------------------- admin */
  async resetDemoData(): Promise<void> {
    const { error } = await supabase().rpc('fn_reset_demo_data');
    if (error) throw new Error(error.message);
  }
  async seedDemoData(): Promise<void> {
    const { error } = await supabase().rpc('fn_seed_demo_data');
    if (error) throw new Error(error.message);
  }
}
