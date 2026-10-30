-- Provoda Staff: employee-controlled monthly story sharing and secure direct messenger.
-- Applied to Supabase project fwfqvitghlovefcwuznc on 2026-10-30.

create table if not exists public.monthly_story_shares (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.monthly_story_shares enable row level security;
revoke all on public.monthly_story_shares from anon, authenticated;

create or replace function public._provoda_monthly_story_payload(p_user_id uuid,p_month_start date)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
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
  where u.id=p_user_id and u.deleted_at is null;
  return coalesce(v_story,jsonb_build_object('enabled',false));
end;
$$;
revoke all on function public._provoda_monthly_story_payload(uuid,date) from public,anon,authenticated;

create or replace function public.user_set_monthly_story_sharing(p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Нужна авторизация' using errcode='42501'; end if;
  if not coalesce((select f.is_enabled from public.role_feature_flags f where f.role='monthly_stories'),false) then
    raise exception 'Сторис отключены администратором' using errcode='42501';
  end if;
  if public.is_current_admin() then raise exception 'Администратор не публикует личные сторис сотрудников'; end if;
  insert into public.monthly_story_shares(user_id,is_enabled,updated_at)
  values(v_user,p_enabled,now())
  on conflict(user_id) do update set is_enabled=excluded.is_enabled,updated_at=now();
  return jsonb_build_object('is_enabled',p_enabled);
end;
$$;

create or replace function public.user_get_monthly_story_sharing()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'available',coalesce((select f.is_enabled from public.role_feature_flags f where f.role='monthly_stories'),false),
    'is_enabled',coalesce((select s.is_enabled from public.monthly_story_shares s where s.user_id=(select auth.uid())),false),
    'can_share',not public.is_current_admin()
  );
$$;

create or replace function public.user_list_shared_monthly_stories()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_result jsonb;
begin
  if v_user is null then raise exception 'Нужна авторизация' using errcode='42501'; end if;
  if not coalesce((select f.is_enabled from public.role_feature_flags f where f.role='monthly_stories'),false) then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',u.id,
    'name',coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'),''),nullif(trim(u.raw_user_meta_data->>'username'),''),nullif(trim(u.raw_user_meta_data->>'name'),''),u.email,'Сотрудник'),
    'avatar_data',nullif(u.raw_user_meta_data->>'avatar_data',''),
    'role_label',case
      when au.user_id is not null then 'Администратор'
      when cr.title is not null then cr.title
      when ur.role='shift_senior' then 'Старший КНЗ'
      when ur.role='employee_knz' then 'Сотрудник КНЗ'
      else 'Сотрудник' end
  ) order by lower(coalesce(u.raw_user_meta_data->>'display_name',u.raw_user_meta_data->>'username',u.email))), '[]'::jsonb)
  into v_result
  from public.monthly_story_shares s
  join auth.users u on u.id=s.user_id and u.deleted_at is null
  left join public.admin_users au on au.user_id=u.id
  left join public.user_roles ur on ur.user_id=u.id
  left join public.custom_roles cr on cr.id=ur.custom_role_id and cr.is_active
  where s.is_enabled and u.id<>v_user and au.user_id is null;
  return v_result;
end;
$$;

create or replace function public.user_get_shared_monthly_story(p_target_user_id uuid,p_month_start date default date_trunc('month',current_date)::date)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_story jsonb;
begin
  if v_user is null then raise exception 'Нужна авторизация' using errcode='42501'; end if;
  if not coalesce((select f.is_enabled from public.role_feature_flags f where f.role='monthly_stories'),false) then return jsonb_build_object('enabled',false); end if;
  if not exists(select 1 from public.monthly_story_shares s where s.user_id=p_target_user_id and s.is_enabled) then
    raise exception 'Сотрудник не открыл доступ к своим итогам' using errcode='42501';
  end if;
  if public.is_current_admin() then raise exception 'Для просмотра историй сотрудников используй панель администратора'; end if;
  v_story := public._provoda_monthly_story_payload(p_target_user_id,p_month_start);
  return v_story;
end;
$$;

create or replace function public.user_get_my_monthly_story(p_month_start date default date_trunc('month',current_date)::date)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_story jsonb;
begin
  if v_user is null then raise exception 'Нужна авторизация' using errcode='42501'; end if;
  if not coalesce((select f.is_enabled from public.role_feature_flags f where f.role='monthly_stories'),false) or public.is_current_admin() then
    return jsonb_build_object('enabled',false);
  end if;
  v_story := public._provoda_monthly_story_payload(v_user,p_month_start);
  return v_story || jsonb_build_object('sharing_enabled',coalesce((select s.is_enabled from public.monthly_story_shares s where s.user_id=v_user),false));
end;
$$;

create table if not exists public.messenger_conversations (
  id uuid primary key default gen_random_uuid(),
  participant_a uuid not null references auth.users(id) on delete cascade,
  participant_b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint messenger_distinct_participants check(participant_a<>participant_b),
  constraint messenger_ordered_participants check(participant_a<participant_b),
  unique(participant_a,participant_b)
);
create table if not exists public.messenger_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.messenger_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null default '',
  attachment_path text,
  attachment_mime text,
  created_at timestamptz not null default now(),
  constraint messenger_message_has_content check(length(trim(body))>0 or attachment_path is not null),
  constraint messenger_body_size check(length(body)<=8000)
);
create index if not exists messenger_messages_conversation_created_idx on public.messenger_messages(conversation_id,created_at);
alter table public.messenger_conversations enable row level security;
alter table public.messenger_messages enable row level security;
revoke all on public.messenger_conversations,public.messenger_messages from anon,authenticated;
grant select on public.messenger_conversations,public.messenger_messages to authenticated;

drop policy if exists messenger_messages_member_read on public.messenger_messages;
drop policy if exists messenger_media_upload_member on storage.objects;
drop policy if exists messenger_media_read_member on storage.objects;
drop function if exists public.messenger_is_member(uuid,uuid);

create or replace function public.messenger_is_member(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select f.is_enabled from public.role_feature_flags f where f.role='internal_chat'),false)
    and exists(select 1 from public.messenger_conversations c where c.id=p_conversation_id and (select auth.uid()) in (c.participant_a,c.participant_b));
$$;
revoke all on function public.messenger_is_member(uuid) from public,anon;
grant execute on function public.messenger_is_member(uuid) to authenticated;

drop policy if exists messenger_conversations_member_read on public.messenger_conversations;
create policy messenger_conversations_member_read on public.messenger_conversations for select to authenticated
using ((select auth.uid()) in (participant_a,participant_b));
drop policy if exists messenger_messages_member_read on public.messenger_messages;
create policy messenger_messages_member_read on public.messenger_messages for select to authenticated
using (public.messenger_is_member(conversation_id));

create or replace function public.messenger_list_users()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_result jsonb;
begin
  if v_user is null then raise exception 'Нужна авторизация' using errcode='42501'; end if;
  if not coalesce((select f.is_enabled from public.role_feature_flags f where f.role='internal_chat'),false) then raise exception 'Мессенджер отключён администратором' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',u.id,
    'name',coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'),''),nullif(trim(u.raw_user_meta_data->>'username'),''),nullif(trim(u.raw_user_meta_data->>'name'),''),u.email,'Сотрудник'),
    'avatar_data',nullif(u.raw_user_meta_data->>'avatar_data',''),
    'role_label',case
      when coalesce(u.raw_app_meta_data->>'role','')='admin' or coalesce(u.raw_app_meta_data->>'is_admin','')='true' or ur.role='admin' then 'Администратор'
      when cr.title is not null then cr.title
      when ur.role='shift_senior' then 'Старший КНЗ'
      when ur.role='employee_knz' then 'Сотрудник КНЗ'
      else 'Сотрудник' end,
    'shift_role',case when ur.shift_role='day' then 'Дневная смена' when ur.shift_role='night' then 'Ночная смена' else null end
  ) order by lower(coalesce(u.raw_user_meta_data->>'display_name',u.raw_user_meta_data->>'username',u.email))), '[]'::jsonb)
  into v_result
  from auth.users u
  left join public.admin_users au on au.user_id=u.id
  left join public.user_roles ur on ur.user_id=u.id
  left join public.custom_roles cr on cr.id=ur.custom_role_id and cr.is_active
  where u.id<>v_user and u.deleted_at is null;
  return v_result;
end;
$$;

create or replace function public.messenger_open_conversation(p_target_user_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_a uuid; v_b uuid; v_id uuid;
begin
  if v_user is null then raise exception 'Нужна авторизация' using errcode='42501'; end if;
  if not coalesce((select f.is_enabled from public.role_feature_flags f where f.role='internal_chat'),false) then raise exception 'Мессенджер отключён администратором' using errcode='42501'; end if;
  if p_target_user_id is null or p_target_user_id=v_user or not exists(select 1 from auth.users u where u.id=p_target_user_id and u.deleted_at is null) then raise exception 'Пользователь не найден'; end if;
  v_a:=least(v_user,p_target_user_id);v_b:=greatest(v_user,p_target_user_id);
  insert into public.messenger_conversations(participant_a,participant_b) values(v_a,v_b)
  on conflict(participant_a,participant_b) do update set participant_a=excluded.participant_a
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.messenger_list_conversations()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_result jsonb;
begin
  if v_user is null then raise exception 'Нужна авторизация' using errcode='42501'; end if;
  if not coalesce((select f.is_enabled from public.role_feature_flags f where f.role='internal_chat'),false) then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'conversation_id',c.id,'user_id',u.id,
    'name',coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'),''),nullif(trim(u.raw_user_meta_data->>'username'),''),nullif(trim(u.raw_user_meta_data->>'name'),''),u.email,'Сотрудник'),
    'avatar_data',nullif(u.raw_user_meta_data->>'avatar_data',''),
    'role_label',case when coalesce(u.raw_app_meta_data->>'role','')='admin' or coalesce(u.raw_app_meta_data->>'is_admin','')='true' or ur.role='admin' then 'Администратор' when cr.title is not null then cr.title when ur.role='shift_senior' then 'Старший КНЗ' when ur.role='employee_knz' then 'Сотрудник КНЗ' else 'Сотрудник' end,
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
$$;

create or replace function public.messenger_list_messages(p_conversation_id uuid,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_result jsonb;
begin
  if v_user is null or not public.messenger_is_member(p_conversation_id) then raise exception 'Нет доступа к переписке' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'sender_id',m.sender_id,'body',m.body,'attachment_path',m.attachment_path,'attachment_mime',m.attachment_mime,'created_at',m.created_at) order by m.created_at), '[]'::jsonb)
  into v_result
  from (select id from public.messenger_messages where conversation_id=p_conversation_id order by created_at desc limit least(greatest(coalesce(p_limit,100),1),200)) q
  join public.messenger_messages m on m.id=q.id;
  return v_result;
end;
$$;

create or replace function public.messenger_send_message(p_conversation_id uuid,p_body text default '',p_attachment_path text default null,p_attachment_mime text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_message public.messenger_messages%rowtype;
begin
  if v_user is null or not public.messenger_is_member(p_conversation_id) then raise exception 'Нет доступа к переписке' using errcode='42501'; end if;
  if length(coalesce(p_body,''))>8000 then raise exception 'Сообщение слишком длинное'; end if;
  if length(trim(coalesce(p_body,'')))=0 and p_attachment_path is null then raise exception 'Добавь текст или фото'; end if;
  if p_attachment_path is not null and (split_part(p_attachment_path,'/',1)<>p_conversation_id::text or split_part(p_attachment_path,'/',2)<>v_user::text or p_attachment_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]+$') then raise exception 'Недопустимый путь вложения'; end if;
  insert into public.messenger_messages(conversation_id,sender_id,body,attachment_path,attachment_mime)
  values(p_conversation_id,v_user,coalesce(p_body,''),p_attachment_path,p_attachment_mime)
  returning * into v_message;
  return jsonb_build_object('id',v_message.id,'sender_id',v_message.sender_id,'body',v_message.body,'attachment_path',v_message.attachment_path,'attachment_mime',v_message.attachment_mime,'created_at',v_message.created_at);
end;
$$;

drop policy if exists messenger_media_upload_member on storage.objects;
create policy messenger_media_upload_member on storage.objects for insert to authenticated
with check (bucket_id='provoda-messenger' and split_part(name,'/',1) ~ '^[0-9a-f-]{36}$' and split_part(name,'/',2)=(select auth.uid())::text and public.messenger_is_member(split_part(name,'/',1)::uuid));
drop policy if exists messenger_media_read_member on storage.objects;
create policy messenger_media_read_member on storage.objects for select to authenticated
using (bucket_id='provoda-messenger' and split_part(name,'/',1) ~ '^[0-9a-f-]{36}$' and public.messenger_is_member(split_part(name,'/',1)::uuid));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('provoda-messenger','provoda-messenger',false,12582912,array['image/jpeg','image/png','image/webp','image/heic'])
on conflict(id) do update set public=false,file_size_limit=12582912,allowed_mime_types=excluded.allowed_mime_types;

do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messenger_messages') then
    alter publication supabase_realtime add table public.messenger_messages;
  end if;
end $$;

revoke all on function public.user_set_monthly_story_sharing(boolean) from public,anon;
grant execute on function public.user_set_monthly_story_sharing(boolean) to authenticated;
revoke all on function public.user_get_monthly_story_sharing() from public,anon;
grant execute on function public.user_get_monthly_story_sharing() to authenticated;
revoke all on function public.user_list_shared_monthly_stories() from public,anon;
grant execute on function public.user_list_shared_monthly_stories() to authenticated;
revoke all on function public.user_get_shared_monthly_story(uuid,date) from public,anon;
grant execute on function public.user_get_shared_monthly_story(uuid,date) to authenticated;
revoke all on function public.user_get_my_monthly_story(date) from public,anon;
grant execute on function public.user_get_my_monthly_story(date) to authenticated;
revoke all on function public.messenger_list_users() from public,anon;
grant execute on function public.messenger_list_users() to authenticated;
revoke all on function public.messenger_open_conversation(uuid) from public,anon;
grant execute on function public.messenger_open_conversation(uuid) to authenticated;
revoke all on function public.messenger_list_conversations() from public,anon;
grant execute on function public.messenger_list_conversations() to authenticated;
revoke all on function public.messenger_list_messages(uuid,integer) from public,anon;
grant execute on function public.messenger_list_messages(uuid,integer) to authenticated;
revoke all on function public.messenger_send_message(uuid,text,text,text) from public,anon;
grant execute on function public.messenger_send_message(uuid,text,text,text) to authenticated;

update public.role_feature_flags set is_enabled=true,updated_at=now() where role in ('monthly_stories','internal_chat');
