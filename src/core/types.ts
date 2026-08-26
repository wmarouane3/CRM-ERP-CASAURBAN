/**
 * SHOES OS — Domain types
 * Mirrors the PostgreSQL schema (supabase/migrations/0001_schema.sql).
 * Pure TypeScript: no React, no Supabase, no side effects.
 */

export type UUID = string;
export type ISODate = string;      // 'YYYY-MM-DD'
export type ISODateTime = string;  // full ISO timestamp

export type UserRole =
  | 'admin' | 'manager' | 'order_manager' | 'warehouse' | 'marketing' | 'viewer';

export type OrderStatus =
  | 'new' | 'to_confirm' | 'confirmed' | 'preparing' | 'shipped'
  | 'delivered' | 'refused' | 'returned' | 'cancelled';

export type ShipmentStatus =
  | 'ready' | 'sent' | 'in_transit' | 'delivered' | 'refused' | 'returned';

export type MovementType =
  | 'purchase_in' | 'sale_out' | 'return_in' | 'refusal_in'
  | 'adjustment_in' | 'adjustment_out' | 'transfer_in' | 'transfer_out'
  | 'reserve' | 'release';

export type ExpenseCategory =
  | 'advertising' | 'product_purchase' | 'shipping' | 'return_shipping'
  | 'packaging' | 'salaries' | 'software' | 'rent' | 'other';

export type AdPlatformCode =
  | 'meta' | 'facebook' | 'instagram' | 'tiktok' | 'google' | 'snapchat' | 'other';

export type CustomerSegment = 'new' | 'returning' | 'vip' | 'high_risk' | 'inactive';

export type SalesChannel =
  | 'manual' | 'shopify' | 'youcan' | 'whatsapp' | 'instagram' | 'phone' | 'other';

export type GoalMetric =
  | 'sales' | 'orders' | 'profit' | 'delivered_orders' | 'roas' | 'delivery_rate';

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical';
export type PaymentMethod = 'cod' | 'bank_transfer' | 'card' | 'cash' | 'paypal' | 'other';
export type ProductStatus = 'active' | 'draft' | 'archived' | 'out_of_stock';

export interface Organization {
  id: UUID; name: string; country_code: string;
  base_currency: string; timezone: string;
}

export interface Warehouse {
  id: UUID; org_id: UUID; name: string; city?: string;
  is_default: boolean; is_active: boolean;
}

export interface AppUser {
  id: UUID; org_id: UUID; email: string; full_name: string;
  role: UserRole; phone?: string; avatar_url?: string;
  is_active: boolean; last_login_at?: ISODateTime; created_at: ISODateTime;
}

export interface City {
  id: UUID; org_id: UUID; name_ar: string; name_fr?: string; region?: string;
  default_shipping_cost: number; default_return_cost: number; is_active: boolean;
}

export interface Supplier {
  id: UUID; org_id: UUID; name: string; phone?: string;
  email?: string; country?: string; is_active: boolean;
}

export interface ShippingCarrier {
  id: UUID; org_id: UUID; code: string; name: string;
  api_base_url?: string; is_active: boolean;
  default_shipping_cost: number; default_return_cost: number;
}

export interface Product {
  id: UUID; org_id: UUID; reference: string; name: string; model?: string;
  brand?: string; category?: string; supplier_id?: UUID;
  description?: string; image_url?: string;
  cost_price: number; selling_price: number;
  status: ProductStatus; created_at: ISODateTime;
}

export interface ProductVariant {
  id: UUID; org_id: UUID; product_id: UUID;
  size: string; color?: string; sku: string; barcode?: string;
  cost_price: number; selling_price: number; min_stock: number; is_active: boolean;
}

export interface InventoryRow {
  id: UUID; org_id: UUID; variant_id: UUID; warehouse_id: UUID;
  on_hand: number; reserved: number; updated_at: ISODateTime;
}

export interface InventoryMovement {
  id: UUID; org_id: UUID; variant_id: UUID; warehouse_id: UUID;
  type: MovementType; quantity: number; balance_after: number;
  reference_type?: string; reference_id?: UUID; reference_label?: string;
  unit_cost?: number; note?: string;
  created_by?: UUID; created_by_name?: string; created_at: ISODateTime;
}

export interface Customer {
  id: UUID; org_id: UUID; reference: string; full_name: string;
  phone: string; phone_alt?: string; email?: string;
  city_id?: UUID; city_name?: string; address?: string;
  segment: CustomerSegment;
  total_orders: number; delivered_orders: number; refused_orders: number;
  returned_orders: number; cancelled_orders: number;
  total_spent: number; total_profit: number;
  avg_order_value: number; lifetime_value: number;
  first_order_at?: ISODateTime; last_order_at?: ISODateTime;
  notes?: string; tags: string[]; created_at: ISODateTime;
}

export interface OrderItem {
  id: UUID; org_id: UUID; order_id: UUID; variant_id: UUID;
  product_id: UUID; product_name: string; model?: string;
  size: string; sku: string;
  quantity: number; unit_price: number; unit_cost: number; discount: number;
  line_revenue: number; line_cost: number;
}

export interface Order {
  id: UUID; org_id: UUID; store_id?: UUID; warehouse_id?: UUID;
  order_number: string; customer_id: UUID;
  customer_name: string; phone: string;
  city_id?: UUID; city_name?: string; address?: string;
  status: OrderStatus; channel: SalesChannel; source?: string;
  ad_campaign_id?: UUID;
  currency: string; fx_rate: number;
  subtotal: number; discount: number; revenue: number;
  product_cost: number; shipping_cost: number; return_cost: number;
  ad_cost: number; packaging_cost: number; other_cost: number;
  gross_profit: number; net_profit: number; profit_margin: number;
  revenue_recognized: boolean; stock_committed: boolean; stock_restored: boolean;
  payment_method: PaymentMethod; tracking_number?: string;
  external_id?: string; notes?: string; tags: string[];
  confirmed_at?: ISODateTime; shipped_at?: ISODateTime;
  delivered_at?: ISODateTime; closed_at?: ISODateTime;
  created_by?: UUID; created_at: ISODateTime; updated_at: ISODateTime;
}

export interface OrderStatusHistory {
  id: UUID; org_id: UUID; order_id: UUID;
  from_status?: OrderStatus; to_status: OrderStatus;
  reason?: string; note?: string;
  changed_by?: UUID; changed_by_name?: string; created_at: ISODateTime;
}

export interface Shipment {
  id: UUID; org_id: UUID; order_id: UUID; carrier_code?: string;
  reference: string; tracking_number?: string; status: ShipmentStatus;
  city_name?: string; address?: string; phone?: string;
  cod_amount: number; shipping_cost: number; return_cost: number;
  sent_at?: ISODateTime; delivered_at?: ISODateTime; created_at: ISODateTime;
}

export interface ReturnRecord {
  id: UUID; org_id: UUID; order_id: UUID; reference: string;
  reason?: string; restock: boolean; return_cost: number;
  received_at?: ISODateTime; created_at: ISODateTime;
  items: { variant_id: UUID; quantity: number; restocked: boolean }[];
}

export interface AdPlatform { id: UUID; org_id: UUID; code: AdPlatformCode; name: string; }

export interface AdCampaign {
  id: UUID; org_id: UUID; platform_id: UUID; name: string;
  objective?: string; product_id?: UUID; status: 'active' | 'paused' | 'ended';
  started_at?: ISODate; ended_at?: ISODate; daily_budget?: number;
}

export interface AdSet { id: UUID; org_id: UUID; campaign_id: UUID; name: string; audience?: string; }
export interface Ad { id: UUID; org_id: UUID; ad_set_id: UUID; name: string; creative_url?: string; }

export interface AdSpend {
  id: UUID; org_id: UUID; date: ISODate; campaign_id: UUID;
  ad_set_id?: UUID; ad_id?: UUID;
  spend: number; impressions: number; clicks: number; leads: number; currency: string;
}

export interface Expense {
  id: UUID; org_id: UUID; date: ISODate; category: ExpenseCategory;
  amount: number; currency: string; description?: string;
  payment_method: PaymentMethod; reference_type?: string; reference_id?: UUID;
  is_auto: boolean; notes?: string; created_at: ISODateTime;
}

export interface Payment {
  id: UUID; org_id: UUID; order_id?: UUID; date: ISODate;
  amount: number; method: PaymentMethod; reference?: string;
}

export interface Goal {
  id: UUID; org_id: UUID; metric: GoalMetric; period: string;
  period_start: ISODate; period_end: ISODate;
  target_value: number; label?: string; is_active: boolean;
}

export interface AppNotification {
  id: UUID; org_id: UUID; user_id?: UUID; severity: NotificationSeverity;
  code: string; title: string; body?: string; link?: string;
  is_read: boolean; created_at: ISODateTime;
}

export interface Settings {
  org_id: UUID;
  default_shipping_cost: number;
  default_return_cost: number;
  default_packaging_cost: number;
  restock_on_refused: boolean;
  restock_on_returned: boolean;
  allow_negative_stock: boolean;
  auto_allocate_ad_cost: boolean;
  low_stock_threshold: number;
  order_number_prefix: string;
  order_number_next: number;
  currency: string;
}

export interface AuditLog {
  id: string; org_id: UUID; actor_id?: UUID; actor_name?: string;
  action: string; entity: string; entity_id?: UUID; entity_label?: string;
  before?: unknown; after?: unknown; created_at: ISODateTime;
}

export interface Integration {
  id: UUID; org_id: UUID; provider: string; label?: string;
  is_enabled: boolean; config: Record<string, unknown>;
  last_sync_at?: ISODateTime; last_status?: string;
}

export interface IntegrationEvent {
  id: string; org_id: UUID; provider: string;
  direction: 'inbound' | 'outbound'; event_type: string;
  external_id?: string; idempotency_key?: string;
  status: 'received' | 'processed' | 'failed' | 'skipped';
  error?: string; created_at: ISODateTime;
}

/** Everything the app holds in one place (demo adapter / cache shape). */
export interface DataSet {
  organization: Organization;
  settings: Settings;
  users: AppUser[];
  warehouses: Warehouse[];
  cities: City[];
  suppliers: Supplier[];
  carriers: ShippingCarrier[];
  products: Product[];
  variants: ProductVariant[];
  inventory: InventoryRow[];
  movements: InventoryMovement[];
  customers: Customer[];
  orders: Order[];
  orderItems: OrderItem[];
  statusHistory: OrderStatusHistory[];
  shipments: Shipment[];
  returns: ReturnRecord[];
  platforms: AdPlatform[];
  campaigns: AdCampaign[];
  adSets: AdSet[];
  ads: Ad[];
  adSpend: AdSpend[];
  expenses: Expense[];
  payments: Payment[];
  goals: Goal[];
  notifications: AppNotification[];
  auditLogs: AuditLog[];
  integrations: Integration[];
  integrationEvents: IntegrationEvent[];
}
