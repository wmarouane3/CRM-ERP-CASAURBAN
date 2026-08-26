-- =====================================================================
-- SHOES OS — 0004_rls.sql
-- Row Level Security.
--
-- Two rules everywhere:
--   1. you only ever see rows of YOUR organization
--   2. what you may do inside it is decided by fn_can(<permission>)
--
-- Three families of tables, because they are not all the same:
--   A. REFERENCE / CATALOG  — readable by anyone in the org (a person
--      taking orders must see cities, products and stock even if the
--      Products page is hidden from them); writable per module.
--   B. MODULE-GATED         — read and write both gated by the module.
--   C. CHILD TABLES         — no org_id of their own; tenancy is
--      inherited from the parent row (return_items, purchase_order_items).
--
-- This file is idempotent: it drops every existing policy on the tables
-- it manages before recreating them, so it can be re-run safely.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. helper
-- ---------------------------------------------------------------------
create or replace function fn_same_org(p_org uuid) returns boolean
language sql stable
security definer set search_path = public, auth as $$
  select p_org = fn_current_org();
$$;

-- ---------------------------------------------------------------------
-- 1. enable RLS + clear previous policies (re-runnable)
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  p record;
  tables text[] := array[
    'organizations','stores','warehouses','app_users','permission_overrides',
    'cities','suppliers','shipping_carriers','categories','brands',
    'products','product_variants','inventory','inventory_movements',
    'purchase_orders','purchase_order_items','customers','orders','order_items',
    'order_status_history','shipments','returns','return_items',
    'ad_platforms','ad_campaigns','ad_sets','ads','ad_spend',
    'expenses','payments','goals','notifications','settings','audit_logs',
    'integrations','integration_events'
  ];
begin
  foreach t in array tables loop
    execute format('alter table %I enable row level security', t);
    for p in select policyname from pg_policies
             where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on %I', p.policyname, t);
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. FAMILY A — reference & catalog
--    read: any member of the org · write: the owning module
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  m text;
  owners jsonb := jsonb_build_object(
    'cities','settings',            'suppliers','settings',
    'shipping_carriers','settings', 'stores','settings',
    'warehouses','settings',        'categories','products',
    'brands','products',            'products','products',
    'product_variants','products',  'inventory','inventory',
    'ad_platforms','marketing'
  );
begin
  for t, m in select key, value #>> '{}' from jsonb_each(owners) loop
    execute format($f$
      create policy %1$I_select on %1$I for select
        using (fn_same_org(org_id));
      create policy %1$I_insert on %1$I for insert
        with check (fn_same_org(org_id) and fn_can('%2$s.create'));
      create policy %1$I_update on %1$I for update
        using (fn_same_org(org_id) and fn_can('%2$s.edit'))
        with check (fn_same_org(org_id));
      create policy %1$I_delete on %1$I for delete
        using (fn_same_org(org_id) and fn_can('%2$s.delete'));
    $f$, t, m);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. FAMILY B — module-gated tables
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  m text;
  modules jsonb := jsonb_build_object(
    'inventory_movements','inventory', 'purchase_orders','inventory',
    'customers','customers',
    'orders','orders',                 'order_items','orders',
    'order_status_history','orders',
    'shipments','shipping',            'returns','shipping',
    'ad_campaigns','marketing',        'ad_sets','marketing',
    'ads','marketing',                 'ad_spend','marketing',
    'expenses','finance',              'payments','finance',
    'goals','goals',
    'integrations','settings',         'integration_events','settings'
  );
begin
  for t, m in select key, value #>> '{}' from jsonb_each(modules) loop
    execute format($f$
      create policy %1$I_select on %1$I for select
        using (fn_same_org(org_id) and fn_can('%2$s.view'));
      create policy %1$I_insert on %1$I for insert
        with check (fn_same_org(org_id) and fn_can('%2$s.create'));
      create policy %1$I_update on %1$I for update
        using (fn_same_org(org_id) and fn_can('%2$s.edit'))
        with check (fn_same_org(org_id));
      create policy %1$I_delete on %1$I for delete
        using (fn_same_org(org_id) and fn_can('%2$s.delete'));
    $f$, t, m);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. FAMILY C — child tables without org_id
--    Tenancy and permission are inherited from the parent row, which is
--    itself protected. Normalisation stays clean: no duplicated org_id.
-- ---------------------------------------------------------------------
create policy return_items_select on return_items for select
  using (exists (select 1 from returns r
                 where r.id = return_items.return_id
                   and fn_same_org(r.org_id) and fn_can('shipping.view')));
create policy return_items_insert on return_items for insert
  with check (exists (select 1 from returns r
                      where r.id = return_items.return_id
                        and fn_same_org(r.org_id) and fn_can('shipping.create')));
create policy return_items_update on return_items for update
  using (exists (select 1 from returns r
                 where r.id = return_items.return_id
                   and fn_same_org(r.org_id) and fn_can('shipping.edit')));
create policy return_items_delete on return_items for delete
  using (exists (select 1 from returns r
                 where r.id = return_items.return_id
                   and fn_same_org(r.org_id) and fn_can('shipping.delete')));

create policy poi_select on purchase_order_items for select
  using (exists (select 1 from purchase_orders po
                 where po.id = purchase_order_items.purchase_order_id
                   and fn_same_org(po.org_id) and fn_can('inventory.view')));
create policy poi_insert on purchase_order_items for insert
  with check (exists (select 1 from purchase_orders po
                      where po.id = purchase_order_items.purchase_order_id
                        and fn_same_org(po.org_id) and fn_can('inventory.create')));
create policy poi_update on purchase_order_items for update
  using (exists (select 1 from purchase_orders po
                 where po.id = purchase_order_items.purchase_order_id
                   and fn_same_org(po.org_id) and fn_can('inventory.edit')));
create policy poi_delete on purchase_order_items for delete
  using (exists (select 1 from purchase_orders po
                 where po.id = purchase_order_items.purchase_order_id
                   and fn_same_org(po.org_id) and fn_can('inventory.delete')));

-- ---------------------------------------------------------------------
-- 5. identity, settings, notifications, audit
-- ---------------------------------------------------------------------
create policy org_select on organizations for select
  using (id = fn_current_org());
create policy org_update on organizations for update
  using (id = fn_current_org() and fn_can('settings.manage'));

create policy users_select on app_users for select
  using (fn_same_org(org_id));
create policy users_update on app_users for update
  using (id = auth.uid() or fn_can('users.manage'));
create policy users_insert on app_users for insert
  with check (fn_can('users.manage'));
create policy users_delete on app_users for delete
  using (fn_can('users.manage'));

create policy perm_all on permission_overrides for all
  using (fn_can('users.manage')) with check (fn_can('users.manage'));

-- every member reads the settings (default shipping cost, restock rules…)
create policy settings_select on settings for select
  using (fn_same_org(org_id));
create policy settings_update on settings for update
  using (fn_same_org(org_id) and fn_can('settings.manage'));
create policy settings_insert on settings for insert
  with check (fn_same_org(org_id) and fn_can('settings.manage'));

-- own notifications + org-wide broadcasts
create policy notifications_select on notifications for select
  using (fn_same_org(org_id) and (user_id is null or user_id = auth.uid()));
create policy notifications_insert on notifications for insert
  with check (fn_same_org(org_id));
create policy notifications_update on notifications for update
  using (fn_same_org(org_id) and (user_id is null or user_id = auth.uid()));

-- append-only audit log: no update, no delete policy at all,
-- so the trail cannot be rewritten — not even by an admin.
create policy audit_select on audit_logs for select
  using (fn_same_org(org_id) and fn_can('audit.view'));
create policy audit_insert on audit_logs for insert
  with check (fn_same_org(org_id));

-- ---------------------------------------------------------------------
-- 6. admin-only maintenance
-- ---------------------------------------------------------------------
create or replace function fn_reset_demo_data() returns void
language plpgsql security definer as $$
declare v_org uuid;
begin
  if not fn_can('demo.reset') then raise exception 'FORBIDDEN'; end if;
  v_org := fn_current_org();
  delete from integration_events where org_id = v_org;
  delete from payments   where org_id = v_org;
  delete from return_items where return_id in (select id from returns where org_id = v_org);
  delete from returns    where org_id = v_org;
  delete from shipments  where org_id = v_org;
  delete from order_items where org_id = v_org;
  delete from order_status_history where org_id = v_org;
  delete from orders     where org_id = v_org;
  delete from expenses   where org_id = v_org;
  delete from ad_spend   where org_id = v_org;
  delete from inventory_movements where org_id = v_org;
  update inventory set on_hand = 0, reserved = 0 where org_id = v_org;
  delete from customers  where org_id = v_org;
  delete from notifications where org_id = v_org;
  perform fn_audit(v_org,'delete','demo',null,'reset demo data',null,null);
end $$;

-- ---------------------------------------------------------------------
-- 7. grants — RLS decides the rows, these decide who may ask at all
-- ---------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;
