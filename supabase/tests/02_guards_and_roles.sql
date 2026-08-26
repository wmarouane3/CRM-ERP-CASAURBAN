\set ON_ERROR_STOP on
\pset pager off
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select id as v42 from product_variants where size='42' \gset

-- M. refused → returned (creates return + return_items) -----------------
select id as oid2 from orders where external_id = 'SHOP-777' \gset
select fn_order_set_status(:'oid2','returned') \gset ignore
select 'M. returned' as step,
  (select count(*) from returns where order_id = :'oid2')       as returns,
  (select count(*) from return_items ri join returns r on r.id = ri.return_id
    where r.order_id = :'oid2')                                  as return_items,
  (select on_hand from inventory where variant_id = :'v42')      as stock,
  (select stock_restored from orders where id = :'oid2')         as restored_once;

-- N. stock guard --------------------------------------------------------
do $$ declare v uuid; o uuid; begin
  select id into v from product_variants where size='41';
  select (fn_create_order(jsonb_build_object(
    'customer', jsonb_build_object('full_name','اختبار','phone','0612345678','city_name','فاس'),
    'lines', jsonb_build_array(jsonb_build_object('variant_id', v, 'quantity', 5))))).id into o;
  perform fn_order_set_status(o, 'confirmed');
  raise notice 'N. stock guard: NOT BLOCKED (bug)';
exception when others then raise notice 'N. stock guard blocked: %', SQLERRM;
end $$;

-- O. phone validation ---------------------------------------------------
do $$ begin
  perform fn_create_order(jsonb_build_object(
    'customer', jsonb_build_object('full_name','خطأ','phone','12345'),
    'lines', jsonb_build_array(jsonb_build_object('variant_id',
      (select id from product_variants limit 1), 'quantity', 1))));
  raise notice 'O. phone: NOT BLOCKED (bug)';
exception when others then raise notice 'O. bad phone blocked: %', SQLERRM;
end $$;

-- P. campaign + spend + allocation --------------------------------------
insert into ad_campaigns(org_id, platform_id, name, status, daily_budget)
select fn_current_org(), p.id, 'Nike Dunk — Retargeting', 'active', 200
from ad_platforms p where p.code='meta' returning id as cid \gset
select (fn_create_order(jsonb_build_object(
  'customer', jsonb_build_object('full_name','سعيد لمريني','phone','0616584653','city_name','طنجة'),
  'lines', jsonb_build_array(jsonb_build_object('variant_id', :'v42','quantity',1)),
  'ad_campaign_id', :'cid'))).id as oid3 \gset
insert into ad_spend(org_id, date, campaign_id, spend, impressions, clicks)
values (fn_current_org(), current_date, :'cid', 240, 12000, 260);
select fn_allocate_ad_cost(fn_current_org(), current_date) as touched \gset
select 'P. ad allocation' as step, :'touched' as orders_touched,
  (select ad_cost from orders where id = :'oid3') as ad_cost_on_order,
  (select net_profit from orders where id = :'oid3') as net_after_ads;
select 'P2. campaign view' as step, campaign, spend, orders, delivered_orders, roas, cpa
from v_campaign_performance;

-- Q. cancel restores stock ----------------------------------------------
select (select on_hand from inventory where variant_id = :'v42') as before_cancel \gset
select fn_order_set_status(:'oid3','confirmed') \gset ignore
select fn_order_set_status(:'oid3','cancelled') \gset ignore
select 'Q. cancelled' as step, :'before_cancel' as before,
  (select on_hand from inventory where variant_id = :'v42') as after_cancel,
  (select net_profit from orders where id = :'oid3') as net;

-- R. role isolation: a marketing user must not read expenses ------------
reset role;
insert into auth.users(id, email, raw_user_meta_data)
values ('22222222-2222-2222-2222-222222222222','ads@shoesos.ma','{"full_name":"ليلى"}');
update app_users set role = 'marketing' where id = '22222222-2222-2222-2222-222222222222';
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select 'R. marketing role' as step,
  (select count(*) from expenses)          as expenses_visible,
  (select count(*) from orders)            as orders_visible,
  (select count(*) from products)          as products_visible,
  (select count(*) from cities)            as cities_visible,
  (select count(*) from ad_campaigns)      as campaigns_visible,
  fn_can('finance.view')                   as can_finance,
  fn_can('marketing.view')                 as can_marketing;

-- S. demo reset is admin-only -------------------------------------------
do $$ begin
  perform fn_reset_demo_data();
  raise notice 'S. reset by marketing: NOT BLOCKED (bug)';
exception when others then raise notice 'S. reset blocked for marketing: %', SQLERRM;
end $$;

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select fn_reset_demo_data() \gset ignore
select 'T. admin reset' as step,
  (select count(*) from orders) as orders, (select count(*) from customers) as customers,
  (select count(*) from products) as products_kept,
  (select sum(on_hand) from inventory) as stock_zeroed;
