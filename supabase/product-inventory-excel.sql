-- Full PROVODA inventory fields and safe bulk import from Excel.
begin;
alter table public.product_catalog add column if not exists purchase_price numeric(12,2);
alter table public.product_catalog add column if not exists warehouse_quantity numeric(12,3);
alter table public.product_catalog add column if not exists cold_quantity numeric(12,3);
alter table public.product_catalog add column if not exists shelf_quantity numeric(12,3);
alter table public.product_catalog add column if not exists total_quantity numeric(12,3);
alter table public.product_catalog add column if not exists plan_quantity numeric(12,3);
alter table public.product_catalog add column if not exists total_deviation numeric(12,3);
alter table public.product_catalog add column if not exists tg_writeoffs numeric(12,3);
alter table public.product_catalog add column if not exists inventory_value numeric(14,2);
alter table public.product_catalog add column if not exists stock_imported_at timestamptz;

create or replace function public.admin_inventory_bulk_import(rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; n integer:=0; nm text; cat text; v numeric; pp numeric; retail numeric;
begin
 if (select auth.uid()) is null then raise exception 'Нужно войти в аккаунт' using errcode='42501'; end if;
 if not public.is_current_admin() and public.daily_report_my_role()<>'shift_senior' then
  raise exception 'Импортировать товарную базу может только Админ или СТ' using errcode='42501';
 end if;
 if jsonb_typeof(rows)<>'array' or jsonb_array_length(rows)>5000 then raise exception 'Файл должен содержать не более 5000 строк'; end if;
 for r in select value from jsonb_array_elements(rows) loop
  nm:=left(trim(coalesce(r->>'name','')),200);
  if nm='' then continue; end if;
  cat:=left(coalesce(nullif(trim(r->>'category'),''),'другое'),80);
  v:=nullif(r->>'volume','')::numeric;
  pp:=nullif(r->>'purchase_price','')::numeric;
  retail:=nullif(r->>'retail_price','')::numeric;
  if v<0 or pp<0 or retail<0 then raise exception 'Отрицательные значения недопустимы: %',nm; end if;
  insert into public.product_catalog(
   name,category,volume,purchase_price,price,
   warehouse_quantity,cold_quantity,shelf_quantity,total_quantity,plan_quantity,total_deviation,tg_writeoffs,inventory_value,
   available,active,stock_quantity,stock_unit,updated_at,updated_by,stock_imported_at
  ) values(
   nm,cat,v,pp,coalesce(retail,0),
   nullif(r->>'warehouse_quantity','')::numeric,
   nullif(r->>'cold_quantity','')::numeric,
   nullif(r->>'shelf_quantity','')::numeric,
   nullif(r->>'total_quantity','')::numeric,
   nullif(r->>'plan_quantity','')::numeric,
   nullif(r->>'total_deviation','')::numeric,
   nullif(r->>'tg_writeoffs','')::numeric,
   nullif(r->>'inventory_value','')::numeric,
   true,true,nullif(r->>'total_quantity','')::numeric,'шт',now(),(select auth.uid()),now()
  )
  on conflict(name) do update set
   category=excluded.category,
   volume=coalesce(excluded.volume,public.product_catalog.volume),
   purchase_price=coalesce(excluded.purchase_price,public.product_catalog.purchase_price),
   price=case when r ? 'retail_price' then coalesce(excluded.price,0) else public.product_catalog.price end,
   warehouse_quantity=excluded.warehouse_quantity,cold_quantity=excluded.cold_quantity,shelf_quantity=excluded.shelf_quantity,
   total_quantity=excluded.total_quantity,plan_quantity=excluded.plan_quantity,total_deviation=excluded.total_deviation,
   tg_writeoffs=excluded.tg_writeoffs,inventory_value=excluded.inventory_value,
   stock_quantity=excluded.total_quantity,stock_unit='шт',available=true,active=true,updated_at=now(),updated_by=(select auth.uid()),stock_imported_at=now();
  n:=n+1;
 end loop;
 return jsonb_build_object('imported',n);
end $$;
revoke all on function public.admin_inventory_bulk_import(jsonb) from public,anon;
grant execute on function public.admin_inventory_bulk_import(jsonb) to authenticated;
commit;
