-- Privacy hardening: employee-facing names must never fall back to account email.
-- CREATE OR REPLACE preserves the current function grants and role checks.
-- This changes display labels only; it does not change tables or user data.
begin;

CREATE OR REPLACE FUNCTION public._provoda_monthly_story_payload(p_user_id uuid, p_month_start date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_month date := date_trunc('month',coalesce(p_month_start,current_date)::timestamp)::date;
  v_next date := (date_trunc('month',coalesce(p_month_start,current_date)::timestamp)+interval '1 month')::date;
  v_story jsonb;
begin
  with expense_rows as (
    select x.item from public.user_data d
    cross join lateral (
      select value as item from jsonb_array_elements(case when jsonb_typeof(d.data->'current')='array' then d.data->'current' else '[]'::jsonb end)
      union all
      select item.value as item from jsonb_each(case when jsonb_typeof(d.data->'history')='object' then d.data->'history' else '{}'::jsonb end) h
      cross join lateral jsonb_array_elements(case when jsonb_typeof(h.value)='array' then h.value else '[]'::jsonb end) item(value)
    ) x where d.user_id=p_user_id
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
    select r.status from public.daily_task_runs r where r.assigned_to=p_user_id and r.task_date>=v_month and r.task_date<v_next
    union all
    select a.status from public.daily_task_assignments a where a.assigned_to=p_user_id and a.due_date>=v_month and a.due_date<v_next
    union all
    select t.status from public.admin_tasks t where t.assignee_id=p_user_id and t.created_at>=v_month::timestamptz and t.created_at<v_next::timestamptz
  ),
  task_stats as (
    select count(*)::integer as tasks_total,count(*) filter(where status in ('approved','done'))::integer as tasks_done from task_rows
  ),
  report_stats as (
    select count(*)::integer as shift_reports from public.daily_reports dr where dr.submitted_by=p_user_id and dr.report_date>=v_month and dr.report_date<v_next
  )
  select jsonb_build_object(
    'enabled',true,'user_id',u.id,
    'name',coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'),''),nullif(trim(u.raw_user_meta_data->>'username'),''),nullif(trim(u.raw_user_meta_data->>'name'),''),'Сотрудник'),
    'email',u.email,'avatar_data',nullif(u.raw_user_meta_data->>'avatar_data',''),
    'month_start',v_month,'spent',coalesce(es.spent,0),
    'budget',case when coalesce(d.data->>'budgetMonthly','') ~ '^[0-9]+([.][0-9]+)?$' then (d.data->>'budgetMonthly')::numeric else 7000 end,
    'expense_days',coalesce(es.expense_days,0),'tasks_done',coalesce(ts.tasks_done,0),'tasks_total',coalesce(ts.tasks_total,0),
    'shift_reports',coalesce(rs.shift_reports,0)
  ) into v_story
  from auth.users u
  left join public.user_data d on d.user_id=u.id
  cross join expense_stats es cross join task_stats ts cross join report_stats rs
  where u.id=p_user_id and u.deleted_at is null;
  return coalesce(v_story,jsonb_build_object('enabled',false));
end;
$function$;

CREATE OR REPLACE FUNCTION public.user_list_shared_monthly_stories()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid := (select auth.uid()); v_result jsonb;
begin
  if v_user is null then raise exception 'Нужна авторизация' using errcode='42501'; end if;
  if not coalesce((select f.is_enabled from public.role_feature_flags f where f.role='monthly_stories'),false) then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',u.id,
    'name',coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'),''),nullif(trim(u.raw_user_meta_data->>'username'),''),nullif(trim(u.raw_user_meta_data->>'name'),''),'Сотрудник'),
    'avatar_data',nullif(u.raw_user_meta_data->>'avatar_data',''),
    'role_label',case when cr.title is not null then cr.title when ur.role='shift_senior' then 'Старший КНЗ' when ur.role='employee_knz' then 'Сотрудник КНЗ' else 'Сотрудник' end
  ) order by lower(coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'),''),nullif(trim(u.raw_user_meta_data->>'username'),''),nullif(trim(u.raw_user_meta_data->>'name'),''),'Сотрудник'))), '[]'::jsonb)
  into v_result
  from public.monthly_story_shares s
  join auth.users u on u.id=s.user_id and u.deleted_at is null
  left join public.admin_users au on au.user_id=u.id
  left join public.user_roles ur on ur.user_id=u.id
  left join public.custom_roles cr on cr.id=ur.custom_role_id and cr.is_active
  where s.is_enabled and u.id<>v_user and au.user_id is null;
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.messenger_list_users()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid := (select auth.uid()); v_result jsonb;
begin
  if v_user is null then raise exception 'Нужна авторизация' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',u.id,
    'name',coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'),''),nullif(trim(u.raw_user_meta_data->>'username'),''),nullif(trim(u.raw_user_meta_data->>'name'),''),'Сотрудник'),
    'avatar_data',nullif(u.raw_user_meta_data->>'avatar_data',''),
    'role_label',case when au.user_id is not null then 'Администратор' when cr.title is not null then cr.title when ur.role='shift_senior' then 'Старший КНЗ' when ur.role='employee_knz' then 'Сотрудник КНЗ' else 'Сотрудник' end,
    'shift_role',case when ur.shift_role='day' then 'Дневная смена' when ur.shift_role='night' then 'Ночная смена' else null end
  ) order by lower(coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'),''),nullif(trim(u.raw_user_meta_data->>'username'),''),nullif(trim(u.raw_user_meta_data->>'name'),''),'Сотрудник'))), '[]'::jsonb)
  into v_result
  from auth.users u
  left join public.admin_users au on au.user_id=u.id
  left join public.user_roles ur on ur.user_id=u.id
  left join public.custom_roles cr on cr.id=ur.custom_role_id and cr.is_active
  where u.id<>v_user and u.deleted_at is null;
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.messenger_list_conversations()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid := (select auth.uid()); v_result jsonb;
begin
  if v_user is null then raise exception 'Нужна авторизация' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'conversation_id',c.id,'user_id',u.id,
    'name',coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'),''),nullif(trim(u.raw_user_meta_data->>'username'),''),nullif(trim(u.raw_user_meta_data->>'name'),''),'Сотрудник'),
    'avatar_data',nullif(u.raw_user_meta_data->>'avatar_data',''),
    'role_label',case when au.user_id is not null then 'Администратор' when cr.title is not null then cr.title when ur.role='shift_senior' then 'Старший КНЗ' when ur.role='employee_knz' then 'Сотрудник КНЗ' else 'Сотрудник' end,
    'shift_role',case when ur.shift_role='day' then 'Дневная смена' when ur.shift_role='night' then 'Ночная смена' else null end,
    'last_message',coalesce((select nullif(m.body,'') from public.messenger_messages m where m.conversation_id=c.id order by m.created_at desc limit 1),case when exists(select 1 from public.messenger_messages m where m.conversation_id=c.id) then 'Фото' else 'Открыть личный чат' end),
    'last_message_at',(select m.created_at from public.messenger_messages m where m.conversation_id=c.id order by m.created_at desc limit 1)
  ) order by (select m.created_at from public.messenger_messages m where m.conversation_id=c.id order by m.created_at desc limit 1) desc nulls last), '[]'::jsonb)
  into v_result
  from public.messenger_conversations c
  join auth.users u on u.id=case when c.participant_a=v_user then c.participant_b else c.participant_a end
  left join public.admin_users au on au.user_id=u.id
  left join public.user_roles ur on ur.user_id=u.id
  left join public.custom_roles cr on cr.id=ur.custom_role_id and cr.is_active
  where v_user in(c.participant_a,c.participant_b) and u.deleted_at is null;
  return v_result;
end;
$function$;

commit;
