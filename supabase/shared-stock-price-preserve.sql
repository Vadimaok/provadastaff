-- Preserve the catalog's real category and price when stock is first initialized.
drop function if exists public.shared_stock_set(text,numeric,text,numeric);
create or replace function public.shared_stock_set(
 product_name text,
 new_quantity numeric,
 new_unit text default 'шт',
 new_low_stock_threshold numeric default null,
 new_category text default 'другое',
 new_price numeric default 0
)
returns boolean language plpgsql security definer set search_path='' as $$
declare existing_name text;
begin
 if not public.is_current_admin() and public.daily_report_my_role()<>'shift_senior' then
  raise exception 'Изменять остатки может только Админ или СТ' using errcode='42501';
 end if;
 if length(trim(coalesce(product_name,''))) not between 1 and 160 then raise exception 'Укажи товар'; end if;
 if new_quantity is not null and new_quantity<0 then raise exception 'Остаток не может быть отрицательным'; end if;
 if new_low_stock_threshold is not null and new_low_stock_threshold<0 then raise exception 'Порог остатка не может быть отрицательным'; end if;
 if coalesce(new_price,0)<0 then raise exception 'Цена не может быть отрицательной'; end if;
 select c.name into existing_name from public.product_catalog c where lower(trim(c.name))=lower(trim(product_name)) limit 1;
 if existing_name is null then
  insert into public.product_catalog(name,category,price,available,active,stock_quantity,stock_unit,low_stock_threshold,updated_at,updated_by)
  values(trim(product_name),coalesce(nullif(trim(new_category),''),'другое'),coalesce(new_price,0),true,true,new_quantity,coalesce(nullif(trim(new_unit),''),'шт'),new_low_stock_threshold,now(),(select auth.uid()));
 else
  update public.product_catalog set category=coalesce(nullif(trim(new_category),''),'другое'),price=coalesce(new_price,0),
   stock_quantity=new_quantity,stock_unit=coalesce(nullif(trim(new_unit),''),'шт'),low_stock_threshold=new_low_stock_threshold,
   updated_at=now(),updated_by=(select auth.uid()) where name=existing_name;
 end if;
 return true;
end $$;
revoke all on function public.shared_stock_set(text,numeric,text,numeric,text,numeric) from public,anon;
grant execute on function public.shared_stock_set(text,numeric,text,numeric,text,numeric) to authenticated;

create or replace function public.shared_product_issue(product_name text, quantity numeric, unit_price numeric default 0, note text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid := (select auth.uid()); nm text:=trim(coalesce(product_name,'')); un text:='шт'; stock numeric; tracked boolean:=false; price numeric(12,2):=coalesce(unit_price,0); issue_id uuid; who text:=''; db_name text; db_unit text; db_stock numeric; db_price numeric;
begin
 if actor is null then raise exception 'Нужно войти в аккаунт' using errcode='42501'; end if;
 if length(nm) not between 1 and 160 or quantity is null or quantity<=0 or quantity>100000 or price<0 then raise exception 'Проверь товар, количество и цену'; end if;
 select coalesce(nullif(trim(raw_user_meta_data->>'display_name'),''),nullif(trim(raw_user_meta_data->>'username'),''),nullif(trim(raw_user_meta_data->>'name'),''),email,'Сотрудник') into who from auth.users where id=actor;
 select c.name,c.stock_unit,c.stock_quantity,c.price into db_name,db_unit,db_stock,db_price
  from public.product_catalog c where lower(trim(c.name))=lower(trim(nm)) and c.active=true for update;
 if not found then raise exception 'Товар ещё не добавлен в общую товарную базу. Открой «Тов. база» и сохрани его остаток.'; end if;
 nm:=db_name; un:=coalesce(nullif(trim(db_unit),''),'шт'); stock:=db_stock; price:=coalesce(db_price,0);
 tracked:=stock is not null;
 if tracked and stock<quantity then raise exception 'Недостаточный остаток: доступно % %',stock,un; end if;
 if tracked then update public.product_catalog set stock_quantity=stock_quantity-quantity,updated_at=now(),updated_by=actor where lower(trim(name))=lower(trim(nm)); end if;
 insert into public.shared_product_issues(issued_by,employee_name,product_name,quantity,unit,unit_price,note)
 values(actor,coalesce(who,''),nm,quantity,coalesce(nullif(trim(un),''),'шт'),price,left(coalesce(note,''),1000)) returning id into issue_id;
 return jsonb_build_object('id',issue_id,'product_name',nm,'quantity',quantity,'unit',un,'unit_price',price,'total',round(quantity*price,2),'stock_tracked',tracked);
end $$;
revoke all on function public.shared_product_issue(text,numeric,numeric,text) from public,anon;
grant execute on function public.shared_product_issue(text,numeric,numeric,text) to authenticated;
