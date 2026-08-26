-- =====================================================================
-- SHOES OS — 0001_schema.sql
-- Core schema : extensions, enums, tables, indexes
-- PostgreSQL 15+ / Supabase
-- ---------------------------------------------------------------------
-- Design principles
--  * Multi-tenant ready  : every business row carries org_id
--  * Multi-store ready   : store_id on sales-facing rows
--  * Multi-warehouse     : stock lives on (variant_id, warehouse_id)
--  * Multi-currency      : currency + fx_rate captured at transaction time
--  * Money               : NUMERIC(14,2) — never floats
--  * Auditable           : audit_logs + *_history tables, append only
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";
create extension if not exists "unaccent";

-- =====================================================================
-- 1. ENUMS
-- =====================================================================

create type user_role as enum ('admin','manager','order_manager','warehouse','marketing','viewer');

create type order_status as enum (
  'new','to_confirm','confirmed','preparing','shipped',
  'delivered','refused','returned','cancelled'
);

create type shipment_status as enum (
  'ready','sent','in_transit','delivered','refused','returned'
);

create type movement_type as enum (
  'purchase_in','sale_out','return_in','refusal_in',
  'adjustment_in','adjustment_out','transfer_in','transfer_out',
  'reserve','release'
);

create type expense_category as enum (
  'advertising','product_purchase','shipping','return_shipping',
  'packaging','salaries','software','rent','other'
);

create type ad_platform_code as enum ('meta','facebook','instagram','tiktok','google','snapchat','other');

create type customer_segment as enum ('new','returning','vip','high_risk','inactive');

create type sales_channel as enum ('manual','shopify','youcan','whatsapp','instagram','phone','other');

create type goal_metric as enum ('sales','orders','profit','delivered_orders','roas','delivery_rate');

create type notification_severity as enum ('info','success','warning','critical');

create type payment_method as enum ('cod','bank_transfer','card','cash','paypal','other');

create type product_status as enum ('active','draft','archived','out_of_stock');

-- =====================================================================
-- 2. TENANCY & IDENTITY
-- =====================================================================

create table organizations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  country_code    char(2) not null default 'MA',
  base_currency   char(3) not null default 'MAD',
  timezone        text    not null default 'Africa/Casablanca',
  created_at      timestamptz not null default now()
);

create table stores (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  name            text not null,
  channel         sales_channel not null default 'manual',
  domain          text,
  currency        char(3) not null default 'MAD',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);
create index on stores(org_id);

create table warehouses (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  name            text not null,
  city            text,
  is_default      boolean not null default false,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);
create index on warehouses(org_id);

-- app_users mirrors auth.users (Supabase) and adds business attributes
create table app_users (
  id              uuid primary key,                 -- == auth.users.id
  org_id          uuid not null references organizations(id) on delete cascade,
  email           text not null,
  full_name       text not null,
  role            user_role not null default 'viewer',
  phone           text,
  avatar_url      text,
  is_active       boolean not null default true,
  last_login_at   timestamptz,
  created_at      timestamptz not null default now()
);
create unique index on app_users(org_id, email);
create index on app_users(org_id, role);

-- Fine grained overrides on top of the role matrix (see 0002_functions.sql)
create table permission_overrides (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references app_users(id) on delete cascade,
  permission      text not null,       -- e.g. 'orders.delete'
  allowed         boolean not null,
  created_at      timestamptz not null default now(),
  unique(user_id, permission)
);

-- =====================================================================
-- 3. REFERENCE DATA
-- =====================================================================

create table cities (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  name_ar         text not null,
  name_fr         text,
  region          text,
  default_shipping_cost numeric(14,2) not null default 0,
  default_return_cost   numeric(14,2) not null default 0,
  is_active       boolean not null default true,
  unique(org_id, name_ar)
);
create index on cities(org_id);

create table suppliers (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  name            text not null,
  phone           text,
  email           text,
  country         text,
  notes           text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);
create index on suppliers(org_id);

create table shipping_carriers (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  code            text not null,        -- 'ozonexpress', 'sendit', 'inhouse'
  name            text not null,
  api_base_url    text,
  is_active       boolean not null default true,
  default_shipping_cost numeric(14,2) not null default 35,
  default_return_cost   numeric(14,2) not null default 15,
  unique(org_id, code)
);

-- =====================================================================
-- 4. CATALOG
-- =====================================================================

create table categories (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  name            text not null,
  parent_id       uuid references categories(id) on delete set null,
  unique(org_id, name)
);

create table brands (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  name            text not null,
  unique(org_id, name)
);

create table products (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  reference       text not null,                 -- human readable: SHO-0001
  name            text not null,
  model           text,
  brand_id        uuid references brands(id) on delete set null,
  category_id     uuid references categories(id) on delete set null,
  supplier_id     uuid references suppliers(id) on delete set null,
  description     text,
  image_url       text,
  cost_price      numeric(14,2) not null default 0,   -- default variant cost
  selling_price   numeric(14,2) not null default 0,   -- default variant price
  status          product_status not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(org_id, reference)
);
create index on products(org_id, status);
create index products_name_trgm on products using gin (name gin_trgm_ops);

-- A variant = one sellable SKU (product + size [+ color])
create table product_variants (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  product_id      uuid not null references products(id) on delete cascade,
  size            text not null,                 -- '40','41','42'…
  color           text,
  sku             text not null,
  barcode         text,
  cost_price      numeric(14,2) not null default 0,
  selling_price   numeric(14,2) not null default 0,
  min_stock       integer not null default 3,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  unique(org_id, sku),
  unique(product_id, size, color)
);
create index on product_variants(org_id, product_id);

-- =====================================================================
-- 5. INVENTORY
-- =====================================================================

create table inventory (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  variant_id      uuid not null references product_variants(id) on delete cascade,
  warehouse_id    uuid not null references warehouses(id) on delete cascade,
  on_hand         integer not null default 0,     -- physically present
  reserved        integer not null default 0,     -- allocated to open orders
  updated_at      timestamptz not null default now(),
  unique(variant_id, warehouse_id),
  constraint inventory_non_negative check (on_hand >= 0)
);
create index on inventory(org_id, warehouse_id);
-- available = on_hand - reserved  (exposed via view v_inventory_available)

create table inventory_movements (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  variant_id      uuid not null references product_variants(id) on delete restrict,
  warehouse_id    uuid not null references warehouses(id) on delete restrict,
  type            movement_type not null,
  quantity        integer not null,               -- signed: +in / -out
  balance_after   integer,
  reference_type  text,                           -- 'order','return','purchase','manual'
  reference_id    uuid,
  reference_label text,                           -- 'Order #1024'
  unit_cost       numeric(14,2),
  note            text,
  created_by      uuid references app_users(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index on inventory_movements(org_id, created_at desc);
create index on inventory_movements(variant_id, created_at desc);
create index on inventory_movements(reference_type, reference_id);

create table purchase_orders (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  supplier_id     uuid references suppliers(id) on delete set null,
  warehouse_id    uuid not null references warehouses(id),
  reference       text not null,
  status          text not null default 'draft',  -- draft|ordered|received|cancelled
  total_cost      numeric(14,2) not null default 0,
  ordered_at      date,
  received_at     date,
  notes           text,
  created_at      timestamptz not null default now(),
  unique(org_id, reference)
);

create table purchase_order_items (
  id              uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  variant_id      uuid not null references product_variants(id),
  quantity        integer not null check (quantity > 0),
  unit_cost       numeric(14,2) not null
);

-- =====================================================================
-- 6. CRM — CUSTOMERS
-- =====================================================================

create table customers (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  reference       text not null,                  -- CUS-0001
  full_name       text not null,
  phone           text not null,                  -- normalized E.164-ish: 06XXXXXXXX
  phone_alt       text,
  email           text,
  city_id         uuid references cities(id) on delete set null,
  city_name       text,                           -- denormalized for speed/history
  address         text,
  segment         customer_segment not null default 'new',
  -- rolling aggregates, maintained by trigger (see 0002)
  total_orders        integer not null default 0,
  delivered_orders    integer not null default 0,
  refused_orders      integer not null default 0,
  returned_orders     integer not null default 0,
  cancelled_orders    integer not null default 0,
  total_spent         numeric(14,2) not null default 0,   -- delivered revenue only
  total_profit        numeric(14,2) not null default 0,
  avg_order_value     numeric(14,2) not null default 0,
  lifetime_value      numeric(14,2) not null default 0,
  first_order_at      timestamptz,
  last_order_at       timestamptz,
  notes           text,
  tags            text[] default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(org_id, phone)
);
create index on customers(org_id, segment);
create index on customers(org_id, city_id);
create index customers_name_trgm on customers using gin (full_name gin_trgm_ops);

-- =====================================================================
-- 7. ORDERS
-- =====================================================================

create table orders (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  store_id        uuid references stores(id) on delete set null,
  warehouse_id    uuid references warehouses(id) on delete set null,
  order_number    text not null,                  -- #1024
  customer_id     uuid not null references customers(id) on delete restrict,

  -- shipping snapshot (kept on the order: addresses change over time)
  customer_name   text not null,
  phone           text not null,
  city_id         uuid references cities(id) on delete set null,
  city_name       text,
  address         text,

  status          order_status not null default 'new',
  channel         sales_channel not null default 'manual',
  source          text,                            -- campaign / ad / referral label
  ad_campaign_id  uuid,                            -- FK added in 0001 tail

  currency        char(3) not null default 'MAD',
  fx_rate         numeric(14,6) not null default 1,

  -- money (all in order currency)
  subtotal            numeric(14,2) not null default 0,   -- Σ line selling price
  discount            numeric(14,2) not null default 0,
  revenue             numeric(14,2) not null default 0,   -- subtotal - discount
  product_cost        numeric(14,2) not null default 0,   -- Σ line cost
  shipping_cost       numeric(14,2) not null default 0,
  return_cost         numeric(14,2) not null default 0,
  ad_cost             numeric(14,2) not null default 0,
  packaging_cost      numeric(14,2) not null default 0,
  other_cost          numeric(14,2) not null default 0,
  gross_profit        numeric(14,2) not null default 0,   -- revenue - product_cost
  net_profit          numeric(14,2) not null default 0,   -- see 0002 fn_order_recalc
  profit_margin       numeric(6,2)  not null default 0,   -- %

  -- accounting flags
  revenue_recognized  boolean not null default false,     -- true only on delivered
  stock_committed     boolean not null default false,     -- stock deducted?
  stock_restored      boolean not null default false,     -- stock given back?

  payment_method  payment_method not null default 'cod',
  tracking_number text,
  external_id     text,                            -- shopify/youcan order id
  external_ref    text,
  notes           text,
  tags            text[] default '{}',

  confirmed_at    timestamptz,
  shipped_at      timestamptz,
  delivered_at    timestamptz,
  closed_at       timestamptz,

  created_by      uuid references app_users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique(org_id, order_number)
);
create index on orders(org_id, status, created_at desc);
create index on orders(org_id, created_at desc);
create index on orders(customer_id, created_at desc);
create index on orders(org_id, city_id);
create index on orders(org_id, ad_campaign_id);
create index on orders(org_id, tracking_number);
-- Duplicate protection for imported orders
create unique index orders_external_uniq on orders(org_id, channel, external_id)
  where external_id is not null;

create table order_items (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  order_id        uuid not null references orders(id) on delete cascade,
  variant_id      uuid not null references product_variants(id) on delete restrict,
  -- snapshot at time of sale (prices change; history must not)
  product_name    text not null,
  model           text,
  size            text not null,
  sku             text not null,
  quantity        integer not null check (quantity > 0),
  unit_price      numeric(14,2) not null,
  unit_cost       numeric(14,2) not null,
  discount        numeric(14,2) not null default 0,
  line_revenue    numeric(14,2) generated always as (quantity * unit_price - discount) stored,
  line_cost       numeric(14,2) generated always as (quantity * unit_cost) stored,
  created_at      timestamptz not null default now()
);
create index on order_items(order_id);
create index on order_items(variant_id);

create table order_status_history (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  order_id        uuid not null references orders(id) on delete cascade,
  from_status     order_status,
  to_status       order_status not null,
  reason          text,
  note            text,
  changed_by      uuid references app_users(id) on delete set null,
  changed_by_name text,
  created_at      timestamptz not null default now()
);
create index on order_status_history(order_id, created_at);

-- =====================================================================
-- 8. SHIPPING & RETURNS
-- =====================================================================

create table shipments (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  order_id        uuid not null references orders(id) on delete cascade,
  carrier_id      uuid references shipping_carriers(id) on delete set null,
  carrier_code    text,
  reference       text not null,                 -- SHP-0001
  tracking_number text,
  status          shipment_status not null default 'ready',
  city_name       text,
  address         text,
  phone           text,
  cod_amount      numeric(14,2) not null default 0,
  shipping_cost   numeric(14,2) not null default 0,
  return_cost     numeric(14,2) not null default 0,
  sent_at         timestamptz,
  delivered_at    timestamptz,
  last_sync_at    timestamptz,
  external_payload jsonb,
  created_at      timestamptz not null default now(),
  unique(org_id, reference)
);
create index on shipments(org_id, status);
create index on shipments(order_id);

create table returns (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  order_id        uuid not null references orders(id) on delete cascade,
  reference       text not null,                 -- RET-0001
  reason          text,
  restock         boolean not null default true,
  return_cost     numeric(14,2) not null default 0,
  received_at     timestamptz,
  created_by      uuid references app_users(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique(org_id, reference)
);
create index on returns(org_id, created_at desc);

create table return_items (
  id              uuid primary key default gen_random_uuid(),
  return_id       uuid not null references returns(id) on delete cascade,
  order_item_id   uuid references order_items(id) on delete set null,
  variant_id      uuid not null references product_variants(id),
  quantity        integer not null check (quantity > 0),
  restocked       boolean not null default false
);

-- =====================================================================
-- 9. ADVERTISING
-- =====================================================================

create table ad_platforms (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  code            ad_platform_code not null,
  name            text not null,
  is_active       boolean not null default true,
  unique(org_id, code)
);

create table ad_campaigns (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  platform_id     uuid not null references ad_platforms(id) on delete cascade,
  name            text not null,
  objective       text,
  product_id      uuid references products(id) on delete set null,
  external_id     text,
  status          text not null default 'active', -- active|paused|ended
  started_at      date,
  ended_at        date,
  daily_budget    numeric(14,2),
  created_at      timestamptz not null default now()
);
create index on ad_campaigns(org_id, platform_id);

create table ad_sets (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  campaign_id     uuid not null references ad_campaigns(id) on delete cascade,
  name            text not null,
  audience        text,
  external_id     text
);

create table ads (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  ad_set_id       uuid not null references ad_sets(id) on delete cascade,
  name            text not null,
  creative_url    text,
  external_id     text
);

-- Daily spend fact table (grain: day × ad (or ad_set/campaign if ad is null))
create table ad_spend (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  date            date not null,
  campaign_id     uuid not null references ad_campaigns(id) on delete cascade,
  ad_set_id       uuid references ad_sets(id) on delete cascade,
  ad_id           uuid references ads(id) on delete cascade,
  spend           numeric(14,2) not null default 0,
  impressions     bigint not null default 0,
  clicks          bigint not null default 0,
  leads           bigint not null default 0,
  currency        char(3) not null default 'MAD',
  created_at      timestamptz not null default now(),
  unique(campaign_id, ad_set_id, ad_id, date)
);
create index on ad_spend(org_id, date desc);

alter table orders
  add constraint orders_ad_campaign_fk
  foreign key (ad_campaign_id) references ad_campaigns(id) on delete set null;

-- =====================================================================
-- 10. FINANCE
-- =====================================================================

create table expenses (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  date            date not null,
  category        expense_category not null,
  amount          numeric(14,2) not null check (amount >= 0),
  currency        char(3) not null default 'MAD',
  description     text,
  payment_method  payment_method not null default 'cash',
  reference_type  text,                          -- 'order','purchase','campaign'
  reference_id    uuid,
  is_auto         boolean not null default false, -- generated by the system
  notes           text,
  created_by      uuid references app_users(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index on expenses(org_id, date desc);
create index on expenses(org_id, category, date desc);

create table payments (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  order_id        uuid references orders(id) on delete cascade,
  date            date not null default current_date,
  amount          numeric(14,2) not null,
  method          payment_method not null default 'cod',
  reference       text,
  notes           text,
  created_at      timestamptz not null default now()
);
create index on payments(org_id, date desc);

-- =====================================================================
-- 11. GOALS, NOTIFICATIONS, SETTINGS, AUDIT
-- =====================================================================

create table goals (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  metric          goal_metric not null,
  period          text not null default 'month',   -- day|week|month|quarter|year
  period_start    date not null,
  period_end      date not null,
  target_value    numeric(14,2) not null,
  label           text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);
create index on goals(org_id, period_start);

create table notifications (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  user_id         uuid references app_users(id) on delete cascade,  -- null = broadcast
  severity        notification_severity not null default 'info',
  code            text not null,                  -- 'stock.low','orders.pending', …
  title           text not null,
  body            text,
  link            text,
  is_read         boolean not null default false,
  created_at      timestamptz not null default now()
);
create index on notifications(org_id, is_read, created_at desc);

create table settings (
  org_id          uuid primary key references organizations(id) on delete cascade,
  default_shipping_cost   numeric(14,2) not null default 35,
  default_return_cost     numeric(14,2) not null default 15,
  default_packaging_cost  numeric(14,2) not null default 5,
  restock_on_refused      boolean not null default true,
  restock_on_returned     boolean not null default true,
  reserve_stock_on_confirm boolean not null default true,
  allow_negative_stock    boolean not null default false,
  auto_allocate_ad_cost   boolean not null default true,
  low_stock_threshold     integer not null default 3,
  order_number_prefix     text not null default '#',
  order_number_next       integer not null default 1000,
  vat_rate                numeric(5,2) not null default 0,
  data                    jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now()
);

create table audit_logs (
  id              bigserial primary key,
  org_id          uuid not null references organizations(id) on delete cascade,
  actor_id        uuid references app_users(id) on delete set null,
  actor_name      text,
  action          text not null,                  -- 'create','update','delete','status_change','login'
  entity          text not null,                  -- 'order','product','expense'…
  entity_id       uuid,
  entity_label    text,
  before          jsonb,
  after           jsonb,
  diff            jsonb,
  ip              inet,
  user_agent      text,
  created_at      timestamptz not null default now()
);
create index on audit_logs(org_id, created_at desc);
create index on audit_logs(entity, entity_id);

-- =====================================================================
-- 12. INTEGRATIONS
-- =====================================================================

create table integrations (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  provider        text not null,                  -- 'shopify','youcan','google_sheets','meta_ads','ozonexpress','whatsapp'
  label           text,
  is_enabled      boolean not null default false,
  config          jsonb not null default '{}'::jsonb, -- non-secret config only
  -- secrets live in Supabase Vault / Edge Function env, never here and never in the browser
  secret_ref      text,
  last_sync_at    timestamptz,
  last_status     text,
  created_at      timestamptz not null default now(),
  unique(org_id, provider)
);

create table integration_events (
  id              bigserial primary key,
  org_id          uuid not null references organizations(id) on delete cascade,
  integration_id  uuid references integrations(id) on delete cascade,
  provider        text not null,
  direction       text not null,                  -- 'inbound'|'outbound'
  event_type      text not null,                  -- 'orders/create'
  external_id     text,
  idempotency_key text,
  status          text not null default 'received', -- received|processed|failed|skipped
  payload         jsonb,
  error           text,
  created_at      timestamptz not null default now(),
  processed_at    timestamptz
);
-- Idempotency: the same webhook can never create two orders
create unique index integration_events_idem
  on integration_events(org_id, provider, idempotency_key)
  where idempotency_key is not null;
create index on integration_events(org_id, created_at desc);
