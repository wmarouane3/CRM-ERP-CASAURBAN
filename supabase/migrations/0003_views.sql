-- =====================================================================
-- SHOES OS — 0003_views.sql
-- Analytics read-model. The UI never re-implements these formulas.
-- =====================================================================

create or replace view v_inventory_available as
select i.org_id, i.variant_id, i.warehouse_id,
       i.on_hand, i.reserved, (i.on_hand - i.reserved) as available,
       v.sku, v.size, v.color, v.min_stock, v.cost_price, v.selling_price,
       p.id as product_id, p.name as product_name, p.model, p.image_url,
       case when i.on_hand = 0 then 'out_of_stock'
            when i.on_hand <= v.min_stock then 'low_stock'
            else 'in_stock' end as stock_state,
       (i.on_hand * v.cost_price) as stock_value
from inventory i
join product_variants v on v.id = i.variant_id
join products p on p.id = v.product_id;

-- Daily P&L ------------------------------------------------------------
create or replace view v_daily_pnl as
with o as (
  select org_id, created_at::date as d,
         count(*)                                              as orders,
         count(*) filter (where status='delivered')             as delivered,
         count(*) filter (where status='refused')               as refused,
         count(*) filter (where status='returned')              as returned,
         count(*) filter (where status='cancelled')             as cancelled,
         count(*) filter (where status in ('confirmed','preparing','shipped','delivered')) as confirmed,
         coalesce(sum(revenue)       filter (where status='delivered'),0) as revenue,
         coalesce(sum(product_cost)  filter (where status='delivered'),0) as product_cost,
         coalesce(sum(shipping_cost) filter (where status='delivered'),0) as shipping_cost,
         coalesce(sum(return_cost),0)                                     as return_cost,
         coalesce(sum(ad_cost),0)                                         as ad_cost,
         coalesce(sum(net_profit),0)                                      as net_profit
  from orders group by 1,2
),
e as (
  select org_id, date as d, sum(amount) filter (where not is_auto and category<>'advertising') as other_expenses
  from expenses group by 1,2
),
a as (
  select org_id, date as d, sum(spend) as ad_spend from ad_spend group by 1,2
)
select coalesce(o.org_id, e.org_id, a.org_id) as org_id,
       coalesce(o.d, e.d, a.d) as date,
       coalesce(o.orders,0) as orders, coalesce(o.delivered,0) as delivered,
       coalesce(o.confirmed,0) as confirmed,
       coalesce(o.refused,0) as refused, coalesce(o.returned,0) as returned,
       coalesce(o.cancelled,0) as cancelled,
       coalesce(o.revenue,0) as revenue,
       coalesce(o.product_cost,0) as product_cost,
       coalesce(o.shipping_cost,0) as shipping_cost,
       coalesce(o.return_cost,0) as return_cost,
       coalesce(a.ad_spend, o.ad_cost, 0) as ad_spend,
       coalesce(e.other_expenses,0) as other_expenses,
       coalesce(o.revenue,0) - coalesce(o.product_cost,0) as gross_profit,
       coalesce(o.revenue,0) - coalesce(o.product_cost,0) - coalesce(o.shipping_cost,0)
         - coalesce(o.return_cost,0) - coalesce(a.ad_spend, o.ad_cost, 0)
         - coalesce(e.other_expenses,0) as net_profit
from o full join e on e.org_id=o.org_id and e.d=o.d
       full join a on a.org_id=coalesce(o.org_id,e.org_id) and a.d=coalesce(o.d,e.d);

-- Product performance ---------------------------------------------------
create or replace view v_product_performance as
select p.org_id, p.id as product_id, p.name, p.model, p.image_url,
       count(distinct o.id)                                            as orders,
       sum(oi.quantity)                                                as units,
       sum(oi.quantity) filter (where o.status='delivered')            as units_delivered,
       coalesce(sum(oi.line_revenue) filter (where o.status='delivered'),0) as revenue,
       coalesce(sum(oi.line_cost)    filter (where o.status='delivered'),0) as cost,
       coalesce(sum(oi.line_revenue - oi.line_cost) filter (where o.status='delivered'),0) as gross_profit,
       count(distinct o.id) filter (where o.status='refused')          as refused,
       count(distinct o.id) filter (where o.status='returned')         as returned,
       case when count(distinct o.id) filter (where o.status in ('shipped','delivered','refused','returned')) > 0
            then round(100.0 * count(distinct o.id) filter (where o.status='delivered')
                 / count(distinct o.id) filter (where o.status in ('shipped','delivered','refused','returned')), 2)
            else 0 end                                                 as delivery_rate
from products p
left join product_variants v on v.product_id = p.id
left join order_items oi on oi.variant_id = v.id
left join orders o on o.id = oi.order_id
group by p.org_id, p.id;

-- City performance -------------------------------------------------------
create or replace view v_city_performance as
select o.org_id, o.city_name,
       count(*)                                            as orders,
       count(*) filter (where o.status in ('confirmed','preparing','shipped','delivered')) as confirmed,
       count(*) filter (where o.status='shipped')          as shipped,
       count(*) filter (where o.status='delivered')        as delivered,
       count(*) filter (where o.status='refused')          as refused,
       count(*) filter (where o.status='returned')         as returned,
       coalesce(sum(o.revenue)    filter (where o.status='delivered'),0) as revenue,
       coalesce(sum(o.net_profit) filter (where o.status='delivered'),0) as profit,
       case when count(*) filter (where o.status in ('delivered','refused','returned')) > 0
            then round(100.0 * count(*) filter (where o.status='delivered')
                 / count(*) filter (where o.status in ('delivered','refused','returned')), 2)
            else 0 end                                     as delivery_rate
from orders o group by o.org_id, o.city_name;

-- Campaign performance ---------------------------------------------------
create or replace view v_campaign_performance as
select c.org_id, c.id as campaign_id, c.name as campaign, pl.code as platform,
       coalesce(sp.spend,0)                                as spend,
       coalesce(sp.impressions,0)                          as impressions,
       coalesce(sp.clicks,0)                               as clicks,
       coalesce(od.orders,0)                               as orders,
       coalesce(od.confirmed,0)                            as confirmed_orders,
       coalesce(od.delivered,0)                            as delivered_orders,
       coalesce(od.revenue,0)                              as revenue,
       coalesce(od.profit,0)                               as profit,
       case when coalesce(sp.spend,0) > 0 then round(coalesce(od.revenue,0)/sp.spend, 2) else 0 end as roas,
       case when coalesce(sp.spend,0) > 0 then round(100.0*(coalesce(od.profit,0))/sp.spend, 2) else 0 end as roi,
       case when coalesce(od.orders,0) > 0 then round(coalesce(sp.spend,0)/od.orders, 2) else 0 end as cpa,
       case when coalesce(od.delivered,0) > 0 then round(coalesce(sp.spend,0)/od.delivered, 2) else 0 end as cost_per_delivered,
       case when coalesce(sp.clicks,0) > 0 then round(coalesce(sp.spend,0)/sp.clicks, 2) else 0 end as cpc,
       case when coalesce(sp.impressions,0) > 0 then round(100.0*sp.clicks/sp.impressions, 2) else 0 end as ctr
from ad_campaigns c
join ad_platforms pl on pl.id = c.platform_id
left join (select campaign_id, sum(spend) spend, sum(impressions) impressions, sum(clicks) clicks
           from ad_spend group by 1) sp on sp.campaign_id = c.id
left join (select ad_campaign_id,
                  count(*) orders,
                  count(*) filter (where status in ('confirmed','preparing','shipped','delivered')) confirmed,
                  count(*) filter (where status='delivered') delivered,
                  coalesce(sum(revenue)    filter (where status='delivered'),0) revenue,
                  coalesce(sum(net_profit) filter (where status='delivered'),0) profit
           from orders group by 1) od on od.ad_campaign_id = c.id;

-- Restock suggestions ----------------------------------------------------
create or replace view v_restock_needs as
select a.org_id, a.product_id, a.product_name, a.size, a.sku, a.on_hand,
       a.min_stock, a.cost_price,
       greatest(a.min_stock * 3 - a.on_hand, 0)               as suggested_qty,
       greatest(a.min_stock * 3 - a.on_hand, 0) * a.cost_price as restock_value,
       a.stock_state
from v_inventory_available a
where a.on_hand <= a.min_stock;
