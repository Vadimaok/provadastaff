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
  cat:=left(nullif(trim(coalesce(r->>'category','')),''),80);
  v:=nullif(r->>'volume','')::numeric;
  pp:=nullif(r->>'purchase_price','')::numeric;
  retail:=nullif(r->>'retail_price','')::numeric;
  if v<0 or pp<0 or retail<0 then raise exception 'Отрицательные значения недопустимы: %',nm; end if;
  insert into public.product_catalog(
   name,category,volume,purchase_price,price,
   warehouse_quantity,cold_quantity,shelf_quantity,total_quantity,plan_quantity,total_deviation,tg_writeoffs,inventory_value,
   available,active,stock_quantity,stock_unit,updated_at,updated_by,stock_imported_at
  ) values(
   nm,coalesce(cat,'другое'),v,pp,coalesce(retail,0),
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
   category=coalesce(cat,public.product_catalog.category),
   volume=coalesce(v,public.product_catalog.volume),
   purchase_price=coalesce(pp,public.product_catalog.purchase_price),
   price=coalesce(retail,public.product_catalog.price),
   warehouse_quantity=coalesce(excluded.warehouse_quantity,public.product_catalog.warehouse_quantity),
   cold_quantity=coalesce(excluded.cold_quantity,public.product_catalog.cold_quantity),
   shelf_quantity=coalesce(excluded.shelf_quantity,public.product_catalog.shelf_quantity),
   total_quantity=coalesce(excluded.total_quantity,public.product_catalog.total_quantity),
   plan_quantity=coalesce(excluded.plan_quantity,public.product_catalog.plan_quantity),
   total_deviation=coalesce(excluded.total_deviation,public.product_catalog.total_deviation),
   tg_writeoffs=coalesce(excluded.tg_writeoffs,public.product_catalog.tg_writeoffs),
   inventory_value=coalesce(excluded.inventory_value,public.product_catalog.inventory_value),
   stock_quantity=coalesce(excluded.total_quantity,public.product_catalog.stock_quantity),stock_unit='шт',available=true,active=true,updated_at=now(),updated_by=(select auth.uid()),stock_imported_at=now();
  n:=n+1;
 end loop;
 return jsonb_build_object('imported',n);
end $$;
revoke all on function public.admin_inventory_bulk_import(jsonb) from public,anon;
grant execute on function public.admin_inventory_bulk_import(jsonb) to authenticated;

-- Keep the legacy stock field and the inventory total in sync for manual corrections.
create or replace function public.shared_stock_set(
 product_name text,new_quantity numeric,new_unit text default 'шт',
 new_low_stock_threshold numeric default null,new_category text default 'другое',new_price numeric default 0
)
returns boolean language plpgsql security definer set search_path='' as $$
declare existing_name text;
begin
 if (select auth.uid()) is null then raise exception 'Нужно войти в аккаунт' using errcode='42501'; end if;
 if not public.is_current_admin() and public.daily_report_my_role()<>'shift_senior' then raise exception 'Изменять остатки может только Админ или СТ' using errcode='42501'; end if;
 if length(trim(coalesce(product_name,''))) not between 1 and 160 then raise exception 'Укажи товар'; end if;
 if new_quantity is not null and new_quantity<0 then raise exception 'Остаток не может быть отрицательным'; end if;
 if new_low_stock_threshold is not null and new_low_stock_threshold<0 then raise exception 'Порог остатка не может быть отрицательным'; end if;
 select c.name into existing_name from public.product_catalog c where lower(trim(c.name))=lower(trim(product_name)) limit 1;
 if existing_name is null then
  insert into public.product_catalog(name,category,price,available,active,stock_quantity,total_quantity,stock_unit,low_stock_threshold,updated_at,updated_by)
  values(trim(product_name),coalesce(nullif(trim(new_category),''),'другое'),coalesce(new_price,0),true,true,new_quantity,new_quantity,coalesce(nullif(trim(new_unit),''),'шт'),new_low_stock_threshold,now(),(select auth.uid()));
 else
  update public.product_catalog set category=coalesce(nullif(trim(new_category),''),'другое'),price=coalesce(new_price,0),
   stock_quantity=new_quantity,total_quantity=new_quantity,stock_unit=coalesce(nullif(trim(new_unit),''),'шт'),
   low_stock_threshold=new_low_stock_threshold,updated_at=now(),updated_by=(select auth.uid()) where name=existing_name;
 end if;
 return true;
end $$;
revoke all on function public.shared_stock_set(text,numeric,text,numeric,text,numeric) from public,anon;
grant execute on function public.shared_stock_set(text,numeric,text,numeric,text,numeric) to authenticated;

commit;

-- Secure inline editing for inventory rows in the ST panel.
create or replace function public.admin_inventory_update_item(product_name text, item jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare actor uuid := (select auth.uid()); nm text := trim(coalesce(product_name,''));
begin
 if actor is null then raise exception 'Нужно войти в аккаунт' using errcode='42501'; end if;
 if not public.is_current_admin() and public.daily_report_my_role()<>'shift_senior' then raise exception 'Редактировать товарную базу может только Админ или СТ' using errcode='42501'; end if;
 if length(nm) not between 1 and 200 or jsonb_typeof(item)<>'object' then raise exception 'Некорректные данные товара'; end if;
 if exists(select 1 from jsonb_each_text(item) e where e.key in ('volume','purchase_price','price','warehouse_quantity','cold_quantity','shelf_quantity','total_quantity','plan_quantity','tg_writeoffs','inventory_value') and nullif(trim(e.value),'') is not null and trim(e.value)::numeric<0) then raise exception 'Количество и цены не могут быть отрицательными'; end if;
 update public.product_catalog c set
  category=case when item ? 'category' and nullif(trim(item->>'category'),'') is not null then left(trim(item->>'category'),80) else c.category end,
  volume=coalesce(nullif(item->>'volume','')::numeric,c.volume),purchase_price=coalesce(nullif(item->>'purchase_price','')::numeric,c.purchase_price),price=coalesce(nullif(item->>'price','')::numeric,c.price),
  warehouse_quantity=coalesce(nullif(item->>'warehouse_quantity','')::numeric,c.warehouse_quantity),cold_quantity=coalesce(nullif(item->>'cold_quantity','')::numeric,c.cold_quantity),shelf_quantity=coalesce(nullif(item->>'shelf_quantity','')::numeric,c.shelf_quantity),
  total_quantity=coalesce(nullif(item->>'total_quantity','')::numeric,c.total_quantity),plan_quantity=coalesce(nullif(item->>'plan_quantity','')::numeric,c.plan_quantity),total_deviation=coalesce(nullif(item->>'total_deviation','')::numeric,c.total_deviation),tg_writeoffs=coalesce(nullif(item->>'tg_writeoffs','')::numeric,c.tg_writeoffs),inventory_value=coalesce(nullif(item->>'inventory_value','')::numeric,c.inventory_value),
  stock_quantity=coalesce(nullif(item->>'total_quantity','')::numeric,c.stock_quantity),updated_at=now(),updated_by=actor
 where lower(trim(c.name))=lower(nm) and c.active=true;
 if not found then raise exception 'Товар не найден или отключён'; end if;
 return true;
end $$;
revoke all on function public.admin_inventory_update_item(text,jsonb) from public,anon;
grant execute on function public.admin_inventory_update_item(text,jsonb) to authenticated;
