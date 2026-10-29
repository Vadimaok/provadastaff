-- Provoda Staff: permit catalog purchases even when stock is zero or insufficient.
-- The full purchase is recorded in shared_product_issues.
-- Tracked stock is reduced but clamped at zero, so existing nonnegative stock constraints remain valid.

create or replace function public.shared_product_issue(product_name text, quantity numeric, unit_price numeric default 0, note text default '')
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
 actor uuid := (select auth.uid());
 nm text := trim(coalesce(product_name,''));
 un text := 'шт';
 stock numeric;
 tracked boolean := false;
 price numeric(12,2) := coalesce(unit_price,0);
 issue_id uuid;
 who text := '';
 db_name text;
 db_unit text;
 db_stock numeric;
 db_price numeric;
begin
 if actor is null then
  raise exception 'Нужно войти в аккаунт' using errcode='42501';
 end if;
 if length(nm) not between 1 and 160 or quantity is null or quantity<=0 or quantity>100000 or price<0 then
  raise exception 'Проверь товар, количество и цену';
 end if;

 select coalesce(
   nullif(trim(raw_user_meta_data->>'display_name'),''),
   nullif(trim(raw_user_meta_data->>'username'),''),
   nullif(trim(raw_user_meta_data->>'name'),''),
   email,
   'Сотрудник'
 ) into who
 from auth.users where id=actor;

 select c.name,c.stock_unit,c.stock_quantity,c.price
 into db_name,db_unit,db_stock,db_price
 from public.product_catalog c
 where lower(trim(c.name))=lower(trim(nm)) and c.active=true
 for update;

 if found then
  nm:=db_name;
  un:=coalesce(nullif(trim(db_unit),''),'шт');
  stock:=db_stock;
  price:=coalesce(db_price,price);
  tracked:=stock is not null;

  -- Purchases are always allowed. Tracked stock is reduced when possible,
  -- but never below zero; the full requested quantity is kept in the issue ledger.
  if tracked then
   update public.product_catalog
   set stock_quantity=greatest(0,coalesce(stock_quantity,0)-quantity),
       updated_at=now(),
       updated_by=actor
   where lower(trim(name))=lower(trim(nm));
  end if;
 end if;

 insert into public.shared_product_issues(
   issued_by,employee_name,product_name,quantity,unit,unit_price,note
 )
 values(
   actor,coalesce(who,''),nm,quantity,coalesce(nullif(trim(un),''),'шт'),
   price,left(coalesce(note,''),1000)
 )
 returning id into issue_id;

 return jsonb_build_object(
   'id',issue_id,
   'product_name',nm,
   'quantity',quantity,
   'unit',un,
   'unit_price',price,
   'total',round(quantity*price,2),
   'stock_tracked',tracked
 );
end;
$$;

revoke all on function public.shared_product_issue(text,numeric,numeric,text) from public,anon;
grant execute on function public.shared_product_issue(text,numeric,numeric,text) to authenticated;
