-- =====================================================================
-- SHOES OS — 0005_rpc.sql
-- The single write path for orders. The browser and the Shopify Edge
-- Function both call this; neither can insert an order any other way.
-- =====================================================================

create or replace function fn_create_order(
  p_input jsonb,
  p_org uuid default null
) returns orders
language plpgsql security definer as $$
declare
  v_org       uuid;
  v_customer  customers;
  v_order     orders;
  v_city      cities;
  v_settings  settings;
  v_phone     text;
  v_line      jsonb;
  v_variant   product_variants;
  v_product   products;
  v_qty       integer;
  v_price     numeric(14,2);
  v_cost      numeric(14,2);
  v_external  text;
  v_channel   sales_channel;
begin
  v_org := coalesce(p_org, fn_current_org());
  if v_org is null then raise exception 'NO_ORG'; end if;
  select * into v_settings from settings where org_id = v_org;

  -- ---------- validation -------------------------------------------
  v_phone := regexp_replace(coalesce(p_input->'customer'->>'phone',''), '[^0-9+]', '', 'g');
  v_phone := regexp_replace(v_phone, '^(\+?212)', '0');
  if v_phone !~ '^0[5-7][0-9]{8}$' then
    raise exception 'INVALID_PHONE: %', v_phone;
  end if;
  if jsonb_array_length(coalesce(p_input->'lines','[]'::jsonb)) = 0 then
    raise exception 'EMPTY_ORDER';
  end if;

  v_channel := coalesce((p_input->>'channel')::sales_channel, 'manual');
  v_external := nullif(p_input->>'external_id','');

  -- ---------- duplicate shield --------------------------------------
  if v_external is not null and exists (
    select 1 from orders
    where org_id = v_org and channel = v_channel and external_id = v_external
  ) then
    raise exception 'DUPLICATE_ORDER: % already imported', v_external;
  end if;

  -- ---------- customer (find or create) ------------------------------
  select * into v_customer from customers where org_id = v_org and phone = v_phone;
  select * into v_city from cities
   where org_id = v_org
     and (id = nullif(p_input->'customer'->>'city_id','')::uuid
          or name_ar = p_input->'customer'->>'city_name')
   limit 1;

  if v_customer is null then
    insert into customers(org_id, reference, full_name, phone, city_id, city_name, address)
    values (
      v_org,
      'CUS-' || lpad(((select count(*) from customers where org_id = v_org) + 1)::text, 4, '0'),
      coalesce(p_input->'customer'->>'full_name','عميل'),
      v_phone, v_city.id,
      coalesce(v_city.name_ar, p_input->'customer'->>'city_name'),
      p_input->'customer'->>'address'
    ) returning * into v_customer;
  end if;

  -- ---------- order --------------------------------------------------
  insert into orders(
    org_id, warehouse_id, order_number, customer_id, customer_name, phone,
    city_id, city_name, address, status, channel, source, ad_campaign_id,
    discount, shipping_cost, packaging_cost, ad_cost, other_cost,
    payment_method, external_id, notes, created_by
  ) values (
    v_org,
    (select id from warehouses where org_id = v_org and is_default order by created_at limit 1),
    fn_next_order_number(v_org),
    v_customer.id, v_customer.full_name, v_phone,
    v_city.id, coalesce(v_city.name_ar, v_customer.city_name),
    coalesce(p_input->'customer'->>'address', v_customer.address),
    coalesce((p_input->>'status')::order_status, 'new'),
    v_channel,
    p_input->>'source',
    nullif(p_input->>'ad_campaign_id','')::uuid,
    coalesce((p_input->>'discount')::numeric, 0),
    coalesce((p_input->>'shipping_cost')::numeric, v_city.default_shipping_cost, v_settings.default_shipping_cost),
    coalesce((p_input->>'packaging_cost')::numeric, v_settings.default_packaging_cost),
    coalesce((p_input->>'ad_cost')::numeric, 0),
    coalesce((p_input->>'other_cost')::numeric, 0),
    coalesce((p_input->>'payment_method')::payment_method, 'cod'),
    v_external,
    p_input->>'notes',
    auth.uid()
  ) returning * into v_order;

  -- ---------- lines ---------------------------------------------------
  for v_line in select * from jsonb_array_elements(p_input->'lines') loop
    select * into v_variant from product_variants
      where id = (v_line->>'variant_id')::uuid and org_id = v_org;
    if v_variant is null then raise exception 'VARIANT_NOT_FOUND: %', v_line->>'variant_id'; end if;
    select * into v_product from products where id = v_variant.product_id;

    v_qty   := coalesce((v_line->>'quantity')::integer, 1);
    v_price := coalesce((v_line->>'unit_price')::numeric, v_variant.selling_price);
    v_cost  := coalesce((v_line->>'unit_cost')::numeric, v_variant.cost_price);
    if v_qty <= 0 then raise exception 'INVALID_QTY'; end if;
    if v_price < 0 or v_cost < 0 then raise exception 'INVALID_PRICE'; end if;

    insert into order_items(org_id, order_id, variant_id, product_name, model,
                            size, sku, quantity, unit_price, unit_cost, discount)
    values (v_org, v_order.id, v_variant.id, v_product.name, v_product.model,
            v_variant.size, v_variant.sku, v_qty, v_price, v_cost,
            coalesce((v_line->>'discount')::numeric, 0));
  end loop;

  insert into order_status_history(org_id, order_id, to_status, note, changed_by)
  values (v_org, v_order.id, v_order.status, 'إنشاء الطلب', auth.uid());

  perform fn_audit(v_org, 'create', 'order', v_order.id, v_order.order_number, null, to_jsonb(v_order));
  perform fn_customer_refresh(v_customer.id);

  return fn_order_recalc(v_order.id);
end $$;

-- Seed a fresh organisation with the reference data it cannot work without.
create or replace function fn_bootstrap_org(p_name text, p_admin_email text)
returns uuid language plpgsql security definer as $$
declare v_org uuid;
begin
  insert into organizations(name) values (p_name) returning id into v_org;
  insert into warehouses(org_id, name, city, is_default)
    values (v_org, 'المستودع الرئيسي', 'الدار البيضاء', true);
  insert into settings(org_id) values (v_org);
  insert into ad_platforms(org_id, code, name) values
    (v_org,'meta','Meta Ads'), (v_org,'tiktok','TikTok Ads'), (v_org,'google','Google Ads');
  insert into shipping_carriers(org_id, code, name, default_shipping_cost, default_return_cost) values
    (v_org,'ozonexpress','Ozon Express',35,15),
    (v_org,'sendit','Sendit',32,14),
    (v_org,'inhouse','توصيل داخلي',20,10);
  insert into cities(org_id, name_ar, name_fr, default_shipping_cost, default_return_cost) values
    (v_org,'الدار البيضاء','Casablanca',30,14), (v_org,'الرباط','Rabat',30,14),
    (v_org,'مراكش','Marrakech',35,16),        (v_org,'فاس','Fès',35,16),
    (v_org,'طنجة','Tanger',35,16),            (v_org,'أكادير','Agadir',40,18),
    (v_org,'مكناس','Meknès',35,16),           (v_org,'وجدة','Oujda',45,20),
    (v_org,'القنيطرة','Kénitra',30,14),       (v_org,'تطوان','Tétouan',40,18),
    (v_org,'سلا','Salé',30,14),               (v_org,'الجديدة','El Jadida',35,16),
    (v_org,'بني ملال','Béni Mellal',40,18),   (v_org,'الناظور','Nador',45,20),
    (v_org,'خريبكة','Khouribga',35,16),       (v_org,'سطات','Settat',30,14),
    (v_org,'المحمدية','Mohammedia',30,14),    (v_org,'العيون','Laâyoune',60,27),
    (v_org,'تازة','Taza',45,20),              (v_org,'برشيد','Berrechid',30,14);
  perform p_admin_email;   -- the admin row is created by the auth trigger below
  return v_org;
end $$;

-- Every new auth user becomes an app_user in the single organisation.
create or replace function fn_handle_new_auth_user() returns trigger
language plpgsql security definer as $$
declare v_org uuid; v_count integer;
begin
  select id into v_org from organizations order by created_at limit 1;
  if v_org is null then return new; end if;
  select count(*) into v_count from app_users where org_id = v_org;
  insert into app_users(id, org_id, email, full_name, role)
  values (new.id, v_org, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          (case when v_count = 0 then 'admin' else 'viewer' end)::user_role);
  return new;
end $$;

drop trigger if exists trg_auth_user_created on auth.users;
create trigger trg_auth_user_created
after insert on auth.users
for each row execute function fn_handle_new_auth_user();
