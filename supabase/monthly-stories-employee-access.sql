-- Monthly stories visibility + future internal chat feature flag.
alter table public.role_feature_flags drop constraint if exists role_feature_flags_role_check;
alter table public.role_feature_flags add constraint role_feature_flags_role_check
  check (role = any (array['shift_senior','employee_knz','monthly_stories','internal_chat']::text[]));

insert into public.role_feature_flags(role,is_enabled)
values ('monthly_stories',false),('internal_chat',false)
on conflict(role) do nothing;

create or replace function public.user_get_role_features()
returns jsonb language sql stable security definer set search_path = ''
as $role_features$
  select jsonb_build_object(
    'shift_senior',coalesce((select f.is_enabled from public.role_feature_flags f where f.role='shift_senior'),true),
    'employee_knz',coalesce((select f.is_enabled from public.role_feature_flags f where f.role='employee_knz'),true),
    'monthly_stories',coalesce((select f.is_enabled from public.role_feature_flags f where f.role='monthly_stories'),false),
    'internal_chat',coalesce((select f.is_enabled from public.role_feature_flags f where f.role='internal_chat'),false)
  );
$role_features$;

create or replace function public.admin_set_role_feature(target_role text,is_enabled boolean)
returns boolean language plpgsql security definer set search_path = ''
as $set_role_feature$
begin
  if not public.is_current_admin() then raise exception 'Доступ запрещён: нужны права администратора' using errcode='42501'; end if;
  if target_role not in ('shift_senior','employee_knz','monthly_stories','internal_chat') then raise exception 'Недопустимая функция'; end if;
  insert into public.role_feature_flags(role,is_enabled,updated_by,updated_at)
  values(target_role,is_enabled,(select auth.uid()),now())
  on conflict(role) do update set is_enabled=excluded.is_enabled,updated_by=excluded.updated_by,updated_at=now();
  return true;
end;
$set_role_feature$;

create or replace function public.user_get_my_monthly_story(p_month_start date default date_trunc('month',current_date)::date)
returns jsonb language plpgsql stable security definer set search_path = ''
as $my_monthly_story$
declare
  v_user uuid := (select auth.uid());
  v_month date := date_trunc('month',coalesce(p_month_start,current_date)::timestamp)::date;
  v_next date := (date_trunc('month',coalesce(p_month_start,current_date)::timestamp)+interval '1 month')::date;
  v_story jsonb;
begin
  if v_user is null then raise exception 'Нужна авторизация' using errcode='42501'; end if;
  if not coalesce((select f.is_enabled from public.role_feature_flags f where f.role='monthly_stories'),false) then
    return jsonb_build_object('enabled',false);
  end if;
  if public.is_current_admin() then return jsonb_build_object('enabled',false); end if;

  with expense_rows as (
    select x.item from public.user_data d
    cross join lateral (
      select value as item from jsonb_array_elements(case when jsonb_typeof(d.data->'current')='array' then d.data->'current' else '[]'::jsonb end)
      union all
      select item.value as item from jsonb_each(case when jsonb_typeof(d.data->'history')='object' then d.data->'history' else '{}'::jsonb end) h
      cross join lateral jsonb_array_elements(case when jsonb_typeof(h.value)='array' then h.value else '[]'::jsonb end) item(value)
    ) x where d.user_id=v_user
  ),
  expense_stats as (
    select coalesce(sum(case
      when coalesce(er.item->>'price','') ~ '^-?[0-9]+([.][0-9]+)?$'
      then (er.item->>'price')::numeric * case when coalesce(er.item->>'qty','') ~ '^-?[0-9]+([.][0-9]+)?$' then (er.item->>'qty')::numeric else 1 end
      else 0 end),0) as spent,
      count(distinct case when coalesce(er.item->>'date','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (er.item->>'date')::date else null end) as expense_days
    from expense_rows er
    where coalesce(er.item->>'date','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      and (er.item->>'date')::date>=v_month and (er.item->>'date')::date<v_next
  ),
  task_rows as (
    select r.status from public.daily_task_runs r where r.assigned_to=v_user and r.task_date>=v_month and r.task_date<v_next
    union all
    select a.status from public.daily_task_assignments a where a.assigned_to=v_user and a.due_date>=v_month and a.due_date<v_next
    union all
    select t.status from public.admin_tasks t where t.assignee_id=v_user and t.created_at>=v_month::timestamptz and t.created_at<v_next::timestamptz
  ),
  task_stats as (
    select count(*)::integer as tasks_total,count(*) filter(where status in ('approved','done'))::integer as tasks_done from task_rows
  ),
  report_stats as (
    select count(*)::integer as shift_reports from public.daily_reports dr where dr.submitted_by=v_user and dr.report_date>=v_month and dr.report_date<v_next
  )
  select jsonb_build_object(
    'enabled',true,'user_id',u.id,
    'name',coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'),''),nullif(trim(u.raw_user_meta_data->>'username'),''),nullif(trim(u.raw_user_meta_data->>'name'),''),u.email,'Сотрудник'),
    'email',u.email,'avatar_data',nullif(u.raw_user_meta_data->>'avatar_data',''),
    'month_start',v_month,'spent',coalesce(es.spent,0),
    'budget',case when coalesce(d.data->>'budgetMonthly','') ~ '^[0-9]+([.][0-9]+)?$' then (d.data->>'budgetMonthly')::numeric else 7000 end,
    'expense_days',coalesce(es.expense_days,0),'tasks_done',coalesce(ts.tasks_done,0),'tasks_total',coalesce(ts.tasks_total,0),
    'shift_reports',coalesce(rs.shift_reports,0)
  ) into v_story
  from auth.users u
  left join public.user_data d on d.user_id=u.id
  cross join expense_stats es cross join task_stats ts cross join report_stats rs
  where u.id=v_user and u.deleted_at is null;
  return coalesce(v_story,jsonb_build_object('enabled',false));
end;
$my_monthly_story$;

revoke all on function public.user_get_role_features() from public,anon;
grant execute on function public.user_get_role_features() to authenticated;
revoke all on function public.admin_set_role_feature(text,boolean) from public,anon;
grant execute on function public.admin_set_role_feature(text,boolean) to authenticated;
revoke all on function public.user_get_my_monthly_story(date) from public,anon;
grant execute on function public.user_get_my_monthly_story(date) to authenticated;
