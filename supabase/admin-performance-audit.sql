-- Provoda Staff: faster admin account summaries and auditable admin actions.
-- Run once in Supabase SQL Editor after admin.sql and device-sessions.sql.

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action_type text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_log_created_idx on public.admin_audit_log(created_at desc);
create index if not exists admin_audit_log_target_idx on public.admin_audit_log(target_user_id, created_at desc);
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;

create or replace function public.admin_list_accounts_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not public.is_current_admin() then
    raise exception 'Доступ запрещён: нужны права администратора' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', u.id,
    'email', u.email,
    'created_at', u.created_at,
    'last_sign_in_at', u.last_sign_in_at,
    'user_metadata', coalesce(u.raw_user_meta_data, '{}'::jsonb),
    'role', coalesce(r.role, 'employee'),
    'shift_role', r.shift_role,
    'display_name', coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'), ''), nullif(trim(u.raw_user_meta_data->>'username'), ''), nullif(trim(u.raw_user_meta_data->>'name'), ''), ''),
    'data_updated_at', d.updated_at,
    'last_seen_at', s.last_seen_at,
    'is_online', coalesce(s.last_seen_at > now() - interval '2 minutes', false)
  ) order by u.created_at desc), '[]'::jsonb)
  into result
  from auth.users u
  left join public.user_roles r on r.user_id = u.id
  left join public.user_data d on d.user_id = u.id
  left join lateral (
    select max(ds.last_seen_at) as last_seen_at
    from public.device_sessions ds
    where ds.user_id = u.id
  ) s on true;
  return result;
end;
$$;
revoke all on function public.admin_list_accounts_summary() from public, anon;
grant execute on function public.admin_list_accounts_summary() to authenticated;

create or replace function public.admin_log_action(action_type text, target_user_id uuid default null, details jsonb default '{}'::jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_current_admin() then
    raise exception 'Доступ запрещён: нужны права администратора' using errcode = '42501';
  end if;
  if length(trim(coalesce(action_type, ''))) = 0 or length(action_type) > 80 then
    raise exception 'Некорректный тип действия';
  end if;
  insert into public.admin_audit_log(actor_id, action_type, target_user_id, details)
  values ((select auth.uid()), trim(action_type), target_user_id, coalesce(details, '{}'::jsonb));
  return true;
end;
$$;
revoke all on function public.admin_log_action(text, uuid, jsonb) from public, anon;
grant execute on function public.admin_log_action(text, uuid, jsonb) to authenticated;

create or replace function public.admin_list_audit_log(limit_rows integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not public.is_current_admin() then
    raise exception 'Доступ запрещён: нужны права администратора' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id,
    'action_type', q.action_type,
    'target_user_id', q.target_user_id,
    'details', q.details,
    'created_at', q.created_at,
    'actor_email', actor.email,
    'target_email', target.email,
    'target_name', coalesce(nullif(trim(target.raw_user_meta_data->>'display_name'), ''), nullif(trim(target.raw_user_meta_data->>'username'), ''), nullif(trim(target.raw_user_meta_data->>'name'), ''), '')
  ) order by q.created_at desc), '[]'::jsonb)
  into result
  from (
    select * from public.admin_audit_log order by created_at desc limit greatest(1, least(coalesce(limit_rows,100),300))
  ) q
  left join auth.users actor on actor.id = q.actor_id
  left join auth.users target on target.id = q.target_user_id;
  return result;
end;
$$;
revoke all on function public.admin_list_audit_log(integer) from public, anon;
grant execute on function public.admin_list_audit_log(integer) to authenticated;

-- Record task lifecycle and role changes at the database boundary so actions
-- from both Admin and Shift Senior are captured (not only browser-side calls).
create or replace function public.audit_provoda_task_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target uuid;
  action_name text;
  detail jsonb;
begin
  if TG_OP = 'DELETE' then
    target := old.assignee_id;
    action_name := 'task_deleted';
    detail := jsonb_build_object('task_id',old.id,'title',old.title,'status',old.status);
  elsif TG_OP = 'INSERT' then
    target := new.assignee_id;
    action_name := 'task_created';
    detail := jsonb_build_object('task_id',new.id,'title',new.title,'status',new.status,'assignee_id',new.assignee_id);
  else
    target := new.assignee_id;
    if old.status is distinct from new.status and new.status = 'approved' then
      action_name := 'report_approved';
    elsif old.status is distinct from new.status and new.status = 'rejected' then
      action_name := 'report_rejected';
    else
      action_name := 'task_updated';
    end if;
    detail := jsonb_build_object('task_id',new.id,'title',new.title,'from_status',old.status,'to_status',new.status,'assignee_id',new.assignee_id);
  end if;
  if actor is null then
    actor := coalesce(case when TG_OP='DELETE' then old.created_by else new.created_by end, target);
  end if;
  insert into public.admin_audit_log(actor_id,action_type,target_user_id,details)
  values(actor,action_name,target,coalesce(detail,'{}'::jsonb));
  if TG_OP='DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists provoda_audit_task_changes on public.admin_tasks;
create trigger provoda_audit_task_changes
after insert or update or delete on public.admin_tasks
for each row execute function public.audit_provoda_task_change();

create or replace function public.audit_provoda_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid; old_role text; old_shift text;
begin
  actor := coalesce((select auth.uid()),new.updated_by);
  if TG_OP='INSERT' then
    old_role := null; old_shift := null;
  else
    old_role := old.role; old_shift := old.shift_role;
  end if;
  if TG_OP='INSERT' or old_role is distinct from new.role or old_shift is distinct from new.shift_role then
    insert into public.admin_audit_log(actor_id,action_type,target_user_id,details)
    values(actor,'role_changed',new.user_id,jsonb_build_object('from_role',old_role,'to_role',new.role,'from_shift_role',old_shift,'to_shift_role',new.shift_role));
  end if;
  return new;
end;
$$;
drop trigger if exists provoda_audit_role_changes on public.user_roles;
create trigger provoda_audit_role_changes
after insert or update on public.user_roles
for each row execute function public.audit_provoda_role_change();


-- Private notification center: users can read only their own notification history.
create or replace function public.user_list_notifications(limit_rows integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Нужна авторизация' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body,
    'created_at', n.created_at, 'read_at', n.read_at
  ) order by n.created_at desc), '[]'::jsonb)
  into result
  from (
    select id, kind, title, body, created_at, read_at
    from public.user_notifications
    where user_id = (select auth.uid())
    order by created_at desc
    limit greatest(1, least(coalesce(limit_rows,100),200))
  ) n;
  return result;
end;
$$;
revoke all on function public.user_list_notifications(integer) from public, anon;
grant execute on function public.user_list_notifications(integer) to authenticated;

create or replace function public.user_mark_notifications_read()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Нужна авторизация' using errcode = '42501';
  end if;
  update public.user_notifications set read_at = now()
  where user_id = (select auth.uid()) and read_at is null;
  return true;
end;
$$;
revoke all on function public.user_mark_notifications_read() from public, anon;
grant execute on function public.user_mark_notifications_read() to authenticated;
