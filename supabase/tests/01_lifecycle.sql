\set ON_ERROR_STOP on
\pset pager off

-- 1. bootstrap ---------------------------------------------------------
select fn_bootstrap_org('متجر الأحذية', 'walid@shoesos.ma') as org \gset
insert into auth.users(id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111111', 'walid@shoesos.ma', '{"full_name":"وليد"}');

select 'A. bootstrap' as step,
       (select count(*) from cities)      as cities,
       (select count(*) from warehouses)  as warehouses,
       (select role::text from app_users) as first_user_role;

-- 2. become that user (RLS active) -------------------------------------
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select 'B. session' as step, fn_current_org() is not null as has_org,
       fn_can('orders.create') as can_create_order,
       fn_can('demo.reset')    as can_reset;

-- 3. product + sizes ----------------------------------------------------
insert into products(org_id, reference, name, model, cost_price, selling_price)
values (fn_current_org(), 'SHO-0001', 'Nike Dunk Low Panda', 'DNK-PND', 420, 799)
returning id as pid \gset
insert into product_variants(org_id, product_id, size, sku, cost_price, selling_price, min_stock)
select fn_current_org(), :'pid', s, 'DNK-PND-'||s, 420, 799, 3
from unnest(array['41','42','43']) s;
select 'C. catalog' as step, (select count(*) from product_variants) as variants;

-- 4. stock in -----------------------------------------------------------
select fn_stock_apply(v.id,
        (select id from warehouses where is_default limit 1),
        'purchase_in', 12, 'purchase', null, 'توريد أولي', 'مخزون افتتاحي')
from product_variants v where v.size = '42' \gset ignore
select id as v42 from product_variants where size='42' \gset
select 'D. stock in' as step, on_hand from inventory where variant_id = :'v42';

-- 5. create order -------------------------------------------------------
select (fn_create_order(jsonb_build_object(
  'customer', jsonb_build_object('full_name','ياسين العلوي','phone','0661234567',
                                 'city_name','الدار البيضاء','address','حي النخيل'),
  'lines', jsonb_build_array(jsonb_build_object('variant_id', :'v42', 'quantity', 1)),
  'channel','manual','status','new'
))).id as oid \gset
select 'E. order created' as step, order_number, status::text, revenue, product_cost,
       shipping_cost, packaging_cost, net_profit, revenue_recognized
from orders where id = :'oid';

-- 6. confirm → stock must drop -----------------------------------------
select fn_order_set_status(:'oid','confirmed') \gset ignore
select 'F. confirmed' as step,
       (select on_hand from inventory where variant_id = :'v42') as stock_now,
       (select stock_committed from orders where id = :'oid') as committed,
       (select count(*) from inventory_movements where reference_id = :'oid') as movements;

-- 7. ship → deliver -----------------------------------------------------
select fn_order_set_status(:'oid','preparing') \gset ignore
select fn_order_set_status(:'oid','shipped')   \gset ignore
select fn_order_set_status(:'oid','delivered') \gset ignore
select 'G. delivered' as step, revenue, product_cost, shipping_cost, ad_cost,
       packaging_cost, net_profit, profit_margin, revenue_recognized
from orders where id = :'oid';
select 'G2. side effects' as step,
       (select count(*) from shipments where order_id = :'oid') as shipments,
       (select count(*) from payments  where order_id = :'oid') as payments,
       (select count(*) from order_status_history where order_id = :'oid') as history;

-- 8. second order → refused --------------------------------------------
select (fn_create_order(jsonb_build_object(
  'customer', jsonb_build_object('full_name','عمر الحسني','phone','0683425777',
                                 'city_name','مراكش','address','حي المسيرة'),
  'lines', jsonb_build_array(jsonb_build_object('variant_id', :'v42', 'quantity', 2)),
  'channel','shopify','external_id','SHOP-777','status','to_confirm'
))).id as oid2 \gset
select fn_order_set_status(:'oid2','confirmed') \gset ignore
select fn_order_set_status(:'oid2','shipped')   \gset ignore
select fn_order_set_status(:'oid2','refused')   \gset ignore
select 'H. refused' as step,
       (select on_hand from inventory where variant_id = :'v42') as stock_back,
       (select net_profit from orders where id = :'oid2') as loss,
       (select return_cost from orders where id = :'oid2') as return_cost,
       (select count(*) from expenses where reference_id = :'oid2' and is_auto) as auto_expense;

-- 9. duplicate protection ----------------------------------------------
do $$ begin
  perform fn_create_order(jsonb_build_object(
    'customer', jsonb_build_object('full_name','عمر','phone','0683425777','city_name','مراكش'),
    'lines', jsonb_build_array(jsonb_build_object('variant_id','VARIANT','quantity',1)),
    'channel','shopify','external_id','SHOP-777'));
  raise notice 'I. duplicate: NOT BLOCKED (bug)';
exception when others then raise notice 'I. duplicate blocked: %', SQLERRM;
end $$;

-- 10. invalid transition -------------------------------------------------
do $$ begin
  perform fn_order_set_status((select id from orders where status='delivered' limit 1), 'shipped');
  raise notice 'J. invalid transition: NOT BLOCKED (bug)';
exception when others then raise notice 'J. invalid transition blocked: %', SQLERRM;
end $$;

-- 11. views --------------------------------------------------------------
select 'K. views' as step,
  (select count(*) from v_inventory_available)  as inv,
  (select count(*) from v_daily_pnl)            as pnl,
  (select count(*) from v_product_performance)  as prod,
  (select count(*) from v_city_performance)     as city,
  (select count(*) from v_campaign_performance) as camp,
  (select count(*) from v_restock_needs)        as restock;

-- 12. audit trail --------------------------------------------------------
select 'L. audit' as step, count(*) as entries from audit_logs;
