-- Atomic catalog checkout: all item issues and stock decrements succeed together or none do.
create or replace function public.shared_product_issue_batch(items jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb; result jsonb:='[]'::jsonb; issued jsonb; nm text; qty numeric; price numeric;
begin
 if (select auth.uid()) is null then raise exception 'Нужно войти в аккаунт' using errcode='42501'; end if;
 if jsonb_typeof(items)<>'array' or jsonb_array_length(items)<1 or jsonb_array_length(items)>100 then
  raise exception 'Корзина должна содержать от 1 до 100 позиций';
 end if;
 for item in select value from jsonb_array_elements(items) loop
  nm:=trim(coalesce(item->>'product_name',''));
  qty:=nullif(item->>'quantity','')::numeric;
  price:=coalesce(nullif(item->>'unit_price','')::numeric,0);
  issued:=public.shared_product_issue(nm,qty,price,coalesce(item->>'note','Выдача через каталог товаров'));
  result:=result||jsonb_build_array(issued);
 end loop;
 return result;
end $$;
revoke all on function public.shared_product_issue_batch(jsonb) from public,anon;
grant execute on function public.shared_product_issue_batch(jsonb) to authenticated;
