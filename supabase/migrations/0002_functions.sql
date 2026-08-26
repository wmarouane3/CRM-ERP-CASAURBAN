-- =====================================================================
-- SHOES OS — 0002_functions.sql
-- Business logic that MUST NOT be bypassable from the client:
-- stock movements, order state machine, profit recalculation,
-- customer aggregates, audit logging.
-- =====================================================================

-- ---------------------------------------------------------------------
-- generic: updated_at
-- ---------------------------------------------------------------------
create or replace function fn_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger trg_products_touch     before update on products     for each row execute function fn_touch_updated_at();
create trigger trg_customers_touch    before update on customers    for each row execute function fn_touch_updated_at();
create trigger trg_orders_touch       before update on orders       for each row execute function fn_touch_updated_at();

-- ---------------------------------------------------------------------
-- ROLE / PERMISSION MATRIX
--   permission strings: '<module>.<action>'
--   modules: dashboard orders customers products inventory shipping
--            marketing finance analytics reports goals settings users demo
-- ---------------------------------------------------------------------
create or replace function fn_role_has(p_role user_role, p_permission text)
returns boolean language sql immutable as $$
  -- A role owns some modules outright, and gets READ-ONLY access to a few
  -- more. Without the read-only extras the product breaks in real life:
  -- Marketing cannot measure a campaign without reading orders, and an
  -- Order Manager cannot fill a new order without reading the catalogue.
  select case
    when p_role = 'admin' then true

    when p_role = 'manager' then p_permission not in
         ('users.manage','settings.manage','demo.reset','audit.purge')

    when p_role = 'order_manager' then
         (split_part(p_permission,'.',1) in
            ('dashboard','orders','customers','shipping','reports','analytics')
          and p_permission not like '%.delete')
      or (split_part(p_permission,'.',2) = 'view'
          and split_part(p_permission,'.',1) in ('products','inventory','marketing'))

    when p_role = 'warehouse' then
         (split_part(p_permission,'.',1) in
            ('dashboard','products','inventory','shipping')
          and p_permission not like '%.delete')
      or (split_part(p_permission,'.',2) in ('view','edit')
          and split_part(p_permission,'.',1) = 'orders')

    when p_role = 'marketing' then
         (split_part(p_permission,'.',1) in
            ('dashboard','marketing','analytics','reports','customers')
          and p_permission not like '%.delete')
      or (split_part(p_permission,'.',2) = 'view'
          and split_part(p_permission,'.',1) in ('orders','shipping','products'))

    when p_role = 'viewer' then split_part(p_permission,'.',2) = 'view'

    else false
  end;
$$;

-- IMPORTANT — these three read app_users, and app_users itself is
-- protected by a policy that calls them. Without SECURITY DEFINER that is
-- infinite recursion ("stack depth limit exceeded") on every query.
-- SECURITY DEFINER makes them run as the table owner, who bypasses RLS,
-- which breaks the cycle. search_path is pinned so the definer rights
-- cannot be hijacked by a shadowing schema.
create or replace function fn_current_user_row()
returns app_users language sql stable
security definer set search_path = public, auth as $$
  select * from app_users where id = auth.uid();
$$;

create or replace function fn_current_org() returns uuid
language sql stable
security definer set search_path = public, auth as $$
  select org_id from app_users where id = auth.uid();
$$;

create or replace function fn_can(p_permission text) returns boolean
language plpgsql stable
security definer set search_path = public, auth as $$
declare
  v_user app_users;
  v_override boolean;
begin
  select * into v_user from app_users where id = auth.uid();
  if v_user is null or not v_user.is_active then return false; end if;
  select allowed into v_override from permission_overrides
    where user_id = v_user.id and permission = p_permission;
  if v_override is not null then return v_override; end if;
  return fn_role_has(v_user.role, p_permission);
end $$;

-- ---------------------------------------------------------------------
-- AUDIT
-- ---------------------------------------------------------------------
create or replace function fn_audit(
  p_org uuid, p_action text, p_entity text, p_entity_id uuid,
  p_label text, p_before jsonb, p_after jsonb
) returns void language plpgsql as $$
declare v_name text;
begin
  select full_name into v_name from app_users where id = auth.uid();
  insert into audit_logs(org_id, actor_id, actor_name, action, entity, entity_id, entity_label, before, after, diff)
  values (p_org, auth.uid(), coalesce(v_name,'system'), p_action, p_entity, p_entity_id, p_label,
          p_before, p_after,
          case when p_before is null or p_after is null then null
               else (select jsonb_object_agg(k, jsonb_build_object('from', p_before->k, 'to', p_after->k))
                     from jsonb_object_keys(p_after) k
                     where p_before->k is distinct from p_after->k) end);
end $$;

-- ---------------------------------------------------------------------
-- STOCK ENGINE
-- Single entry point for every stock change. Nothing writes to
-- `inventory` directly.
-- ---------------------------------------------------------------------
create or replace function fn_stock_apply(
  p_variant uuid,
  p_warehouse uuid,
  p_type movement_type,
  p_qty integer,                 -- always positive; sign derived from type
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_reference_label text default null,
  p_note text default null
) returns inventory_movements
language plpgsql security definer as $$
declare
  v_org uuid;
  v_sign integer;
  v_delta integer;
  v_inv inventory;
  v_allow_negative boolean;
  v_cost numeric(14,2);
  v_mv inventory_movements;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'STOCK_INVALID_QTY: quantity must be > 0';
  end if;

  select org_id, cost_price into v_org, v_cost from product_variants where id = p_variant;
  if v_org is null then raise exception 'STOCK_VARIANT_NOT_FOUND'; end if;

  v_sign := case p_type
    when 'purchase_in'    then  1
    when 'return_in'      then  1
    when 'refusal_in'     then  1
    when 'adjustment_in'  then  1
    when 'transfer_in'    then  1
    when 'sale_out'       then -1
    when 'adjustment_out' then -1
    when 'transfer_out'   then -1
    else 0 end;                          -- reserve / release do not move on_hand
  v_delta := v_sign * p_qty;

  select allow_negative_stock into v_allow_negative from settings where org_id = v_org;

  insert into inventory(org_id, variant_id, warehouse_id, on_hand, reserved)
  values (v_org, p_variant, p_warehouse, 0, 0)
  on conflict (variant_id, warehouse_id) do nothing;

  select * into v_inv from inventory
    where variant_id = p_variant and warehouse_id = p_warehouse for update;

  if p_type = 'reserve' then
    update inventory set reserved = reserved + p_qty, updated_at = now() where id = v_inv.id;
  elsif p_type = 'release' then
    update inventory set reserved = greatest(0, reserved - p_qty), updated_at = now() where id = v_inv.id;
  else
    if v_inv.on_hand + v_delta < 0 and not coalesce(v_allow_negative,false) then
      raise exception 'STOCK_INSUFFICIENT: variant % has % units, tried to move %',
        p_variant, v_inv.on_hand, v_delta;
    end if;
    update inventory set on_hand = on_hand + v_delta, updated_at = now() where id = v_inv.id;
  end if;

  select * into v_inv from inventory where id = v_inv.id;

  insert into inventory_movements(org_id, variant_id, warehouse_id, type, quantity,
      balance_after, reference_type, reference_id, reference_label, unit_cost, note, created_by)
  values (v_org, p_variant, p_warehouse, p_type, v_delta, v_inv.on_hand,
      p_reference_type, p_reference_id, p_reference_label, v_cost, p_note, auth.uid())
  returning * into v_mv;

  perform fn_check_low_stock(p_variant, p_warehouse);
  return v_mv;
end $$;

-- ---------------------------------------------------------------------
-- LOW STOCK NOTIFICATIONS
-- ---------------------------------------------------------------------
create or replace function fn_check_low_stock(p_variant uuid, p_warehouse uuid)
returns void language plpgsql as $$
declare
  v_on_hand integer; v_min integer; v_org uuid; v_label text;
begin
  select i.on_hand, v.min_stock, v.org_id, p.name || ' — ' || v.size
    into v_on_hand, v_min, v_org, v_label
  from inventory i
  join product_variants v on v.id = i.variant_id
  join products p on p.id = v.product_id
  where i.variant_id = p_variant and i.warehouse_id = p_warehouse;

  if v_on_hand is null then return; end if;

  if v_on_hand = 0 then
    insert into notifications(org_id, severity, code, title, body, link)
    values (v_org,'critical','stock.out','نفاد المخزون', v_label || ' — الكمية 0', '/inventory');
  elsif v_on_hand <= coalesce(v_min,3) then
    insert into notifications(org_id, severity, code, title, body, link)
    values (v_org,'warning','stock.low','مخزون منخفض', v_label || ' — بقي ' || v_on_hand, '/inventory');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- PROFIT ENGINE
--   revenue      = Σ line_revenue - order discount
--   gross_profit = revenue - product_cost
--   net_profit   = gross_profit - shipping - return - ad - packaging - other
--   Revenue is only *recognised* when the order is delivered; for every
--   other status net_profit still reflects the incurred costs so a
--   refused order correctly shows a loss.
-- ---------------------------------------------------------------------
create or replace function fn_order_recalc(p_order uuid) returns orders
language plpgsql as $$
declare o orders; v_sub numeric(14,2); v_cost numeric(14,2);
begin
  select coalesce(sum(line_revenue),0), coalesce(sum(line_cost),0)
    into v_sub, v_cost from order_items where order_id = p_order;

  select * into o from orders where id = p_order for update;
  if o is null then raise exception 'ORDER_NOT_FOUND'; end if;

  o.subtotal     := v_sub;
  o.revenue      := greatest(v_sub - o.discount, 0);
  o.product_cost := v_cost;

  if o.status = 'delivered' then
    o.revenue_recognized := true;
    o.gross_profit := o.revenue - o.product_cost;
    o.net_profit   := o.gross_profit - o.shipping_cost - o.return_cost
                      - o.ad_cost - o.packaging_cost - o.other_cost;
  elsif o.status in ('refused','returned') then
    -- goods came back: no revenue, but the money spent is gone
    o.revenue_recognized := false;
    o.gross_profit := 0;
    o.net_profit   := -1 * (o.shipping_cost + o.return_cost + o.ad_cost
                      + o.packaging_cost + o.other_cost);
  elsif o.status = 'cancelled' then
    o.revenue_recognized := false;
    o.gross_profit := 0;
    o.net_profit   := -1 * o.ad_cost;     -- ad money was still spent
  else
    -- pipeline: potential, not recognised
    o.revenue_recognized := false;
    o.gross_profit := o.revenue - o.product_cost;
    o.net_profit   := o.gross_profit - o.shipping_cost - o.ad_cost
                      - o.packaging_cost - o.other_cost;
  end if;

  o.profit_margin := case when o.revenue > 0
                          then round((o.net_profit / o.revenue) * 100, 2) else 0 end;

  update orders set
    subtotal = o.subtotal, revenue = o.revenue, product_cost = o.product_cost,
    gross_profit = o.gross_profit, net_profit = o.net_profit,
    profit_margin = o.profit_margin, revenue_recognized = o.revenue_recognized
  where id = p_order;

  return o;
end $$;

create or replace function fn_order_items_changed() returns trigger
language plpgsql as $$
begin
  perform fn_order_recalc(coalesce(new.order_id, old.order_id));
  return coalesce(new, old);
end $$;

create trigger trg_order_items_recalc
after insert or update or delete on order_items
for each row execute function fn_order_items_changed();

-- ---------------------------------------------------------------------
-- ORDER STATE MACHINE
-- ---------------------------------------------------------------------
create or replace function fn_status_allowed(p_from order_status, p_to order_status)
returns boolean language sql immutable as $$
  select case p_from
    when 'new'        then p_to in ('to_confirm','confirmed','cancelled')
    when 'to_confirm' then p_to in ('confirmed','cancelled','new')
    when 'confirmed'  then p_to in ('preparing','shipped','cancelled')
    when 'preparing'  then p_to in ('shipped','cancelled','confirmed')
    when 'shipped'    then p_to in ('delivered','refused','returned')
    when 'delivered'  then p_to in ('returned')
    when 'refused'    then p_to in ('returned','cancelled')
    when 'returned'   then false
    when 'cancelled'  then false
    else false end;
$$;

-- Commit (deduct) stock for every line of an order
create or replace function fn_order_commit_stock(p_order uuid) returns void
language plpgsql as $$
declare o orders; it order_items; v_wh uuid;
begin
  select * into o from orders where id = p_order;
  if o.stock_committed then return; end if;
  v_wh := coalesce(o.warehouse_id, (select id from warehouses where org_id = o.org_id and is_default order by created_at limit 1));
  for it in select * from order_items where order_id = p_order loop
    perform fn_stock_apply(it.variant_id, v_wh, 'sale_out', it.quantity,
      'order', p_order, 'Order ' || o.order_number, 'خصم مخزون عند تأكيد الطلب');
  end loop;
  update orders set stock_committed = true where id = p_order;
end $$;

-- Give stock back (refused / returned / cancelled after commit)
create or replace function fn_order_restore_stock(p_order uuid, p_type movement_type, p_note text)
returns void
language plpgsql as $$
declare o orders; it order_items; v_wh uuid;
begin
  select * into o from orders where id = p_order;
  if not o.stock_committed or o.stock_restored then return; end if;
  v_wh := coalesce(o.warehouse_id, (select id from warehouses where org_id = o.org_id and is_default order by created_at limit 1));
  for it in select * from order_items where order_id = p_order loop
    perform fn_stock_apply(it.variant_id, v_wh, p_type, it.quantity,
      'order', p_order, 'Order ' || o.order_number, p_note);
  end loop;
  update orders set stock_restored = true where id = p_order;
end $$;

create or replace function fn_order_set_status(
  p_order uuid,
  p_status order_status,
  p_reason text default null,
  p_note text default null
) returns orders
language plpgsql security definer as $$
declare
  o orders; s settings; v_actor text; v_ret_id uuid; v_ref text; v_track text;
  v_carrier_id uuid; v_carrier_code text;
begin
  select * into o from orders where id = p_order for update;
  if o is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.status = p_status then return o; end if;
  if not fn_status_allowed(o.status, p_status) then
    raise exception 'INVALID_TRANSITION: % -> %', o.status, p_status;
  end if;

  select * into s from settings where org_id = o.org_id;
  select full_name into v_actor from app_users where id = auth.uid();

  -- ---- side effects -------------------------------------------------
  if p_status = 'confirmed' then
    perform fn_order_commit_stock(p_order);
    update orders set confirmed_at = coalesce(confirmed_at, now()) where id = p_order;

  elsif p_status = 'shipped' then
    if not o.stock_committed then perform fn_order_commit_stock(p_order); end if;
    -- a shipment is created the moment the parcel leaves, not before
    if not exists (select 1 from shipments where order_id = p_order) then
      select * into o from orders where id = p_order;   -- refresh totals
      v_ref := 'SHP-' || lpad((select count(*)+1 from shipments where org_id = o.org_id)::text, 5, '0');
      select id, code into v_carrier_id, v_carrier_code
        from shipping_carriers
       where org_id = o.org_id and is_active
       order by (code = 'ozonexpress') desc, name
       limit 1;
      v_track := coalesce(o.tracking_number,
                          'TRK' || lpad((floor(random() * 1e9))::bigint::text, 9, '0'));
      insert into shipments(org_id, order_id, carrier_id, carrier_code, reference,
                            tracking_number, status, city_name, address, phone,
                            cod_amount, shipping_cost, sent_at)
      values (o.org_id, p_order, v_carrier_id, coalesce(v_carrier_code, 'inhouse'), v_ref,
              v_track, 'sent', o.city_name, o.address, o.phone,
              o.revenue, o.shipping_cost, now());
      update orders set tracking_number = v_track where id = p_order;
    else
      update shipments set status = 'sent', sent_at = coalesce(sent_at, now()) where order_id = p_order;
    end if;
    update orders set shipped_at = coalesce(shipped_at, now()) where id = p_order;

  elsif p_status = 'delivered' then
    update orders set delivered_at = coalesce(delivered_at, now()), closed_at = now() where id = p_order;
    update shipments set status = 'delivered', delivered_at = now() where order_id = p_order;
    insert into payments(org_id, order_id, date, amount, method, reference)
      values (o.org_id, p_order, current_date, o.revenue, o.payment_method, 'COD ' || o.order_number);

  elsif p_status = 'refused' then
    update orders set return_cost = coalesce(nullif(o.return_cost,0), s.default_return_cost),
                      closed_at = now()
      where id = p_order;
    update shipments set status = 'refused' where order_id = p_order;
    if coalesce(s.restock_on_refused, true) then
      perform fn_order_restore_stock(p_order, 'refusal_in', 'إرجاع المخزون بعد رفض الطلب');
    end if;
    insert into expenses(org_id, date, category, amount, description, reference_type, reference_id, is_auto)
      select o.org_id, current_date, 'return_shipping',
             coalesce(nullif(o.return_cost,0), s.default_return_cost),
             'تكلفة إرجاع الطلب ' || o.order_number, 'order', p_order, true;

  elsif p_status = 'returned' then
    v_ref := 'RET-' || lpad((select count(*)+1 from returns where org_id = o.org_id)::text, 5, '0');
    insert into returns(org_id, order_id, reference, reason, restock, return_cost, received_at, created_by)
      values (o.org_id, p_order, v_ref, p_reason, coalesce(s.restock_on_returned,true),
              coalesce(nullif(o.return_cost,0), s.default_return_cost), now(), auth.uid())
      returning id into v_ret_id;
    insert into return_items(return_id, order_item_id, variant_id, quantity, restocked)
      select v_ret_id, oi.id, oi.variant_id, oi.quantity, coalesce(s.restock_on_returned,true)
      from order_items oi where oi.order_id = p_order;
    update orders set return_cost = coalesce(nullif(o.return_cost,0), s.default_return_cost),
                      closed_at = now()
      where id = p_order;
    update shipments set status = 'returned' where order_id = p_order;
    if coalesce(s.restock_on_returned, true) then
      perform fn_order_restore_stock(p_order, 'return_in', 'إرجاع المخزون بعد استرجاع الطلب');
    end if;
    insert into expenses(org_id, date, category, amount, description, reference_type, reference_id, is_auto)
      select o.org_id, current_date, 'return_shipping',
             coalesce(nullif(o.return_cost,0), s.default_return_cost),
             'تكلفة استرجاع الطلب ' || o.order_number, 'order', p_order, true;

  elsif p_status = 'cancelled' then
    if o.stock_committed then
      perform fn_order_restore_stock(p_order, 'adjustment_in', 'إلغاء الطلب — إعادة المخزون');
    end if;
    update orders set closed_at = now() where id = p_order;
  end if;

  update orders set status = p_status where id = p_order;

  insert into order_status_history(org_id, order_id, from_status, to_status, reason, note, changed_by, changed_by_name)
    values (o.org_id, p_order, o.status, p_status, p_reason, p_note, auth.uid(), coalesce(v_actor,'system'));

  perform fn_audit(o.org_id, 'status_change', 'order', p_order, o.order_number,
                   jsonb_build_object('status', o.status), jsonb_build_object('status', p_status));

  return fn_order_recalc(p_order);
end $$;

-- ---------------------------------------------------------------------
-- CUSTOMER AGGREGATES  (recomputed on any order write)
-- ---------------------------------------------------------------------
create or replace function fn_customer_refresh(p_customer uuid) returns void
language plpgsql as $$
declare r record;
begin
  select
    count(*)                                                          as total_orders,
    count(*) filter (where status = 'delivered')                      as delivered_orders,
    count(*) filter (where status = 'refused')                        as refused_orders,
    count(*) filter (where status = 'returned')                       as returned_orders,
    count(*) filter (where status = 'cancelled')                      as cancelled_orders,
    coalesce(sum(revenue)    filter (where status = 'delivered'),0)   as total_spent,
    coalesce(sum(net_profit) filter (where status = 'delivered'),0)   as total_profit,
    min(created_at) as first_order_at,
    max(created_at) as last_order_at
  into r from orders where customer_id = p_customer;

  update customers set
    total_orders     = r.total_orders,
    delivered_orders = r.delivered_orders,
    refused_orders   = r.refused_orders,
    returned_orders  = r.returned_orders,
    cancelled_orders = r.cancelled_orders,
    total_spent      = r.total_spent,
    total_profit     = r.total_profit,
    avg_order_value  = case when r.delivered_orders > 0 then round(r.total_spent / r.delivered_orders, 2) else 0 end,
    lifetime_value   = r.total_profit,
    first_order_at   = r.first_order_at,
    last_order_at    = r.last_order_at,
    segment = (case
      when r.total_orders = 0 then 'new'
      when r.delivered_orders >= 3 and r.total_spent >= 2000 then 'vip'
      when r.total_orders >= 2
           and (r.refused_orders + r.returned_orders)::numeric / nullif(r.total_orders,0) >= 0.5 then 'high_risk'
      when r.delivered_orders >= 2 then 'returning'
      when r.last_order_at < now() - interval '120 days' then 'inactive'
      else 'new' end)::customer_segment
  where id = p_customer;
end $$;

create or replace function fn_orders_after_write() returns trigger
language plpgsql as $$
begin
  perform fn_customer_refresh(coalesce(new.customer_id, old.customer_id));
  return coalesce(new, old);
end $$;

create trigger trg_orders_customer_refresh
after insert or update of status, revenue, net_profit or delete on orders
for each row execute function fn_orders_after_write();

-- ---------------------------------------------------------------------
-- ORDER NUMBER GENERATOR
-- ---------------------------------------------------------------------
create or replace function fn_next_order_number(p_org uuid) returns text
language plpgsql as $$
declare n integer; p text;
begin
  update settings set order_number_next = order_number_next + 1
    where org_id = p_org
    returning order_number_next - 1, order_number_prefix into n, p;
  return coalesce(p,'#') || n::text;
end $$;

-- ---------------------------------------------------------------------
-- AD COST ALLOCATION
--  Spreads a campaign's daily spend across the orders it generated that
--  day, so every order carries its real acquisition cost.
-- ---------------------------------------------------------------------
create or replace function fn_allocate_ad_cost(p_org uuid, p_date date) returns integer
language plpgsql as $$
declare r record; v_count integer := 0;
begin
  for r in
    select s.campaign_id, sum(s.spend) as spend,
           (select count(*) from orders o
             where o.org_id = p_org and o.ad_campaign_id = s.campaign_id
               and o.created_at::date = p_date
               and o.status <> 'cancelled') as orders_count
    from ad_spend s
    where s.org_id = p_org and s.date = p_date
    group by s.campaign_id
  loop
    if r.orders_count > 0 then
      update orders set ad_cost = round(r.spend / r.orders_count, 2)
        where org_id = p_org and ad_campaign_id = r.campaign_id
          and created_at::date = p_date and status <> 'cancelled';
      v_count := v_count + r.orders_count;
    end if;
  end loop;

  perform fn_order_recalc(o.id) from orders o
    where o.org_id = p_org and o.created_at::date = p_date;
  return v_count;
end $$;
