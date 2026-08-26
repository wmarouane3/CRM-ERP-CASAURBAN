/**
 * SHOES OS — Data ports (hexagonal architecture).
 *
 * The application layer talks ONLY to these interfaces.
 * Two adapters implement them:
 *   • SupabaseAdapter  → production (PostgreSQL + RLS + RPC)
 *   • DemoAdapter      → offline demo / tests (in-memory, same rules)
 *
 * Swapping the backend later (self-hosted Postgres, Nest API, …) means
 * writing one new adapter — no page, no component, no formula changes.
 */
import type {
  AppUser, Customer, DataSet, Expense, Goal, Order, OrderStatus,
  Product, ProductVariant, Settings, UUID, MovementType, AdSpend,
  AdCampaign, Integration, AppNotification,
} from '../core/types';

export interface NewOrderLine {
  variant_id: UUID;
  quantity: number;
  unit_price?: number;   // defaults to variant.selling_price
  unit_cost?: number;    // defaults to variant.cost_price
  discount?: number;
}

export interface NewOrderInput {
  customer: {
    id?: UUID;
    full_name: string;
    phone: string;
    city_id?: UUID;
    city_name?: string;
    address?: string;
  };
  lines: NewOrderLine[];
  discount?: number;
  shipping_cost?: number;
  packaging_cost?: number;
  ad_cost?: number;
  other_cost?: number;
  channel?: string;
  source?: string;
  ad_campaign_id?: UUID;
  payment_method?: string;
  notes?: string;
  external_id?: string;
  status?: OrderStatus;
}

export interface StockAdjustInput {
  variant_id: UUID;
  warehouse_id?: UUID;
  type: MovementType;
  quantity: number;
  note?: string;
}

export interface DataPort {
  /** Full snapshot used by the analytics engine and the UI cache. */
  load(): Promise<DataSet>;

  /* auth / session */
  signIn(email: string, password: string): Promise<AppUser>;
  signOut(): Promise<void>;
  currentUser(): Promise<AppUser | null>;

  /* orders */
  createOrder(input: NewOrderInput): Promise<Order>;
  updateOrder(id: UUID, patch: Partial<Order>): Promise<Order>;
  setOrderStatus(id: UUID, status: OrderStatus, reason?: string, note?: string): Promise<Order>;
  deleteOrder(id: UUID): Promise<void>;

  /* catalog + stock */
  upsertProduct(p: Partial<Product> & { variants?: Partial<ProductVariant>[] }): Promise<Product>;
  upsertVariant(v: Partial<ProductVariant> & { product_id: UUID }): Promise<ProductVariant>;
  adjustStock(input: StockAdjustInput): Promise<void>;

  /* crm */
  upsertCustomer(c: Partial<Customer>): Promise<Customer>;

  /* finance */
  addExpense(e: Partial<Expense>): Promise<Expense>;
  deleteExpense(id: UUID): Promise<void>;

  /* marketing */
  upsertCampaign(c: Partial<AdCampaign>): Promise<AdCampaign>;
  addAdSpend(s: Partial<AdSpend>): Promise<AdSpend>;
  allocateAdCost(date: string): Promise<number>;

  /* goals / settings / notifications */
  upsertGoal(g: Partial<Goal>): Promise<Goal>;
  updateSettings(s: Partial<Settings>): Promise<Settings>;
  markNotificationRead(id: UUID): Promise<void>;
  listNotifications(): Promise<AppNotification[]>;

  /* integrations */
  upsertIntegration(i: Partial<Integration>): Promise<Integration>;
  ingestExternalOrder(provider: string, payload: unknown): Promise<{ status: string; order?: Order }>;

  /* admin */
  resetDemoData(): Promise<void>;
  seedDemoData(): Promise<void>;
}
