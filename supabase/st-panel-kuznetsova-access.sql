-- Provoda Staff: allow the dedicated "Кузнецова" role to read shared purchase expenses.
-- Additive and safe: does not change existing roles, purchases, stock, or personal expenses.

begin;

create or replace function public.is_current_kuznetsova()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists (
    select 1
    from public.user_roles ur
    left join public.custom_roles cr on cr.id = ur.custom_role_id
    where ur.user_id = (select auth.uid())
      and (
        lower(trim(coalesce(cr.title, ''))) = 'кузнецова'
        or lower(trim(coalesce(cr.role_key, ''))) = 'kuznetsova'
        or lower(trim(coalesce(ur.role::text, ''))) in ('кузнецова', 'kuznetsova')
      )
  );
$$;

revoke all on function public.is_current_kuznetsova() from public, anon;
grant execute on function public.is_current_kuznetsova() to authenticated;

drop policy if exists shared_product_issues_read_reviewer on public.shared_product_issues;
create policy shared_product_issues_read_reviewer
on public.shared_product_issues
for select
to authenticated
using (
  public.is_current_admin()
  or public.daily_report_my_role() = 'shift_senior'
  or public.is_current_kuznetsova()
);

create or replace function public.shared_product_issues_list(
  date_from date default null,
  date_to date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  result jsonb;
begin
  if not public.is_current_admin()
     and public.daily_report_my_role() <> 'shift_senior'
     and not public.is_current_kuznetsova() then
    raise exception 'Общие траты доступны только Админу, СТ и роли Кузнецова'
      using errcode='42501';
  end if;

  select jsonb_build_object(
    'total', coalesce(sum(i.total), 0),
    'count', count(*),
    'items', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'employee_id', i.issued_by,
          'employee_name', i.employee_name,
          'product_name', i.product_name,
          'quantity', i.quantity,
          'unit', i.unit,
          'unit_price', i.unit_price,
          'total', i.total,
          'created_at', i.created_at,
          'note', i.note
        ) order by i.created_at desc
      ),
      '[]'::jsonb
    )
  )
  into result
  from public.shared_product_issues i
  where (date_from is null or i.created_at >= date_from::timestamptz)
    and (date_to is null or i.created_at < (date_to + 1)::timestamptz);

  return result;
end;
$$;

revoke all on function public.shared_product_issues_list(date, date) from public, anon;
grant execute on function public.shared_product_issues_list(date, date) to authenticated;

commit;
