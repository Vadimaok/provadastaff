-- Provoda Staff: monthly employee story summaries and admin-only view history.
create table if not exists public.monthly_story_views (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references auth.users(id) on delete cascade,
  viewer_user_id uuid not null references auth.users(id) on delete cascade,
  month_start date not null,
  first_viewed_at timestamptz not null default now(),
  last_viewed_at timestamptz not null default now(),
  constraint monthly_story_views_month_start check (extract(day from month_start)=1),
  constraint monthly_story_views_unique unique(target_user_id, viewer_user_id, month_start)
);
create index if not exists monthly_story_views_target_month_idx on public.monthly_story_views(target_user_id, month_start, last_viewed_at desc);
alter table public.monthly_story_views enable row level security;
revoke all on public.monthly_story_views from public, anon, authenticated;

create or replace function public.admin_monthly_stories(p_month_start date default date_trunc('month', current_date)::date)
returns jsonb language plpgsql stable security definer set search_path = ''
as $monthly_stories$
declare
  v_month date := date_trunc('month', coalesce(p_month_start, current_date)::timestamp)::date;
  v_next date := (date_trunc('month', coalesce(p_month_start, current_date)::timestamp) + interval '1 month')::date;
  result jsonb;
begin
  if not public.is_current_admin() then raise exception 'Доступ запрещён: нужны права администратора' using errcode='42501'; end if;
  with expense_rows as (
    select u.id as user_id, x.item
    from auth.users u join public.user_data d on d.user_id=u.id
    cross join lateral (
      select value as item from jsonb_array_elements(case when jsonb_typeof(d.data->'current')='array' then d.data->'current' else '[]'::jsonb end)
      union all
      select item.value as item
      from jsonb_each(case when jsonb_typeof(d.data->'history')='object' then d.data->'history' else '{}'::jsonb end) h
      cross join lateral jsonb_array_elements(case when jsonb_typeof(h.value)='array' then h.value else '[]'::jsonb end) item(value)
    ) x
    where u.deleted_at is null
  ),
  expense_stats as (
    select er.user_id,
      coalesce(sum(case when coalesce(er.item->>'price','') ~ '^-?[0-9]+([.][0-9]+)?$'
        then (er.item->>'price')::numeric * case when coalesce(er.item->>'qty','') ~ '^-?[0-9]+([.][0-9]+)?$' then (er.item->>'qty')::numeric else 1 end
        else 0 end),0) as spent,
      count(distinct case when coalesce(er.item->>'date','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (er.item->>'date')::date else null end) as expense_days
    from expense_rows er
    where coalesce(er.item->>'date','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      and (er.item->>'date')::date >= v_month and (er.item->>'date')::date < v_next
    group by er.user_id
  ),
  task_rows as (
    select r.assigned_to as user_id, r.status from public.daily_task_runs r where r.task_date >= v_month and r.task_date < v_next
    union all
    select a.assigned_to as user_id, a.status from public.daily_task_assignments a where a.due_date >= v_month and a.due_date < v_next
    union all
    select t.assignee_id as user_id, t.status from public.admin_tasks t
      where t.assignee_id is not null and t.created_at >= v_month::timestamptz and t.created_at < v_next::timestamptz
  ),
  task_stats as (
    select tr.user_id, count(*)::integer as tasks_total,
      count(*) filter (where tr.status in ('approved','done'))::integer as tasks_done
    from task_rows tr group by tr.user_id
  ),
  report_stats as (
    select dr.submitted_by as user_id, count(*)::integer as shift_reports
    from public.daily_reports dr where dr.report_date >= v_month and dr.report_date < v_next group by dr.submitted_by
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',u.id,
    'name',coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'),''),nullif(trim(u.raw_user_meta_data->>'username'),''),nullif(trim(u.raw_user_meta_data->>'name'),''),u.email,'Сотрудник'),
    'email',u.email,
    'avatar_data',nullif(u.raw_user_meta_data->>'avatar_data',''),
    'spent',coalesce(es.spent,0),
    'budget',case when coalesce(d.data->>'budgetMonthly','') ~ '^[0-9]+([.][0-9]+)?$' then (d.data->>'budgetMonthly')::numeric else 0 end,
    'expense_days',coalesce(es.expense_days,0),
    'tasks_done',coalesce(ts.tasks_done,0),
    'tasks_total',coalesce(ts.tasks_total,0),
    'shift_reports',coalesce(rs.shift_reports,0),
    'viewers',coalesce(vw.viewers,'[]'::jsonb)
  ) order by coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'),''),nullif(trim(u.raw_user_meta_data->>'username'),''),nullif(trim(u.raw_user_meta_data->>'name'),''),u.email)),'[]'::jsonb)
  into result
  from auth.users u
  left join public.user_data d on d.user_id=u.id
  left join expense_stats es on es.user_id=u.id
  left join task_stats ts on ts.user_id=u.id
  left join report_stats rs on rs.user_id=u.id
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'user_id',viewer.id,
      'name',coalesce(nullif(trim(viewer.raw_user_meta_data->>'display_name'),''),nullif(trim(viewer.raw_user_meta_data->>'username'),''),nullif(trim(viewer.raw_user_meta_data->>'name'),''),viewer.email,'Администратор'),
      'email',viewer.email,'viewed_at',sv.last_viewed_at
    ) order by sv.last_viewed_at desc) as viewers
    from public.monthly_story_views sv join auth.users viewer on viewer.id=sv.viewer_user_id
    where sv.target_user_id=u.id and sv.month_start=v_month
  ) vw on true
  where u.deleted_at is null;
  return jsonb_build_object('month_start',v_month,'stories',result);
end;
$monthly_stories$;
revoke all on function public.admin_monthly_stories(date) from public, anon;
grant execute on function public.admin_monthly_stories(date) to authenticated;

create or replace function public.admin_monthly_story_mark_viewed(p_target_user_id uuid,p_month_start date default date_trunc('month', current_date)::date)
returns jsonb language plpgsql security definer set search_path = ''
as $mark_monthly_story$
declare
  v_viewer uuid := (select auth.uid());
  v_month date := date_trunc('month',coalesce(p_month_start,current_date)::timestamp)::date;
  v_name text;
  v_viewed_at timestamptz;
begin
  if not public.is_current_admin() then raise exception 'Доступ запрещён: нужны права администратора' using errcode='42501'; end if;
  if v_viewer is null then raise exception 'Нужна авторизация' using errcode='42501'; end if;
  if p_target_user_id is null or not exists(select 1 from auth.users where id=p_target_user_id and deleted_at is null) then raise exception 'Аккаунт не найден'; end if;
  insert into public.monthly_story_views(target_user_id,viewer_user_id,month_start) values(p_target_user_id,v_viewer,v_month)
  on conflict(target_user_id,viewer_user_id,month_start) do update set last_viewed_at=now()
  returning last_viewed_at into v_viewed_at;
  select coalesce(nullif(trim(raw_user_meta_data->>'display_name'),''),nullif(trim(raw_user_meta_data->>'username'),''),nullif(trim(raw_user_meta_data->>'name'),''),email,'Администратор')
    into v_name from auth.users where id=v_viewer;
  return jsonb_build_object('ok',true,'viewer_user_id',v_viewer,'viewer_name',v_name,'viewed_at',v_viewed_at);
end;
$mark_monthly_story$;
revoke all on function public.admin_monthly_story_mark_viewed(uuid,date) from public, anon;
grant execute on function public.admin_monthly_story_mark_viewed(uuid,date) to authenticated;
