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
