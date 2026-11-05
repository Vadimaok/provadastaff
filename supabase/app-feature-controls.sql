-- Provoda Staff: глобальные переключатели функций приложения.
-- Выполнить один раз в Supabase SQL Editor.
create table if not exists public.app_feature_flags (
  feature_key text primary key check (feature_key in ('messenger','global_stories','catalog','reports')),
  is_enabled boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.app_feature_flags enable row level security;
revoke all on public.app_feature_flags from anon, authenticated;
alter table public.role_feature_flags drop constraint if exists role_feature_flags_role_check;
alter table public.role_feature_flags add constraint role_feature_flags_role_check check (role in ('shift_senior','employee_knz','monthly_stories'));
insert into public.role_feature_flags(role,is_enabled) values ('monthly_stories',false) on conflict(role) do nothing;

create or replace function public.user_get_role_features()
returns jsonb language sql stable security definer set search_path=''
as $role_features$
 select jsonb_build_object(
  'shift_senior',coalesce((select f.is_enabled from public.role_feature_flags f where f.role='shift_senior'),true),
  'employee_knz',coalesce((select f.is_enabled from public.role_feature_flags f where f.role='employee_knz'),true),
  'monthly_stories',coalesce((select f.is_enabled from public.role_feature_flags f where f.role='monthly_stories'),false)
 );
$;
revoke all on function public.user_get_role_features() from public,anon;
grant execute on function public.user_get_role_features() to authenticated;

insert into public.app_feature_flags(feature_key,is_enabled) values
 ('messenger',true),('global_stories',true),('catalog',true),('reports',true)
on conflict(feature_key) do nothing;

create or replace function public.user_get_app_features()
returns jsonb language sql stable security definer set search_path=''
as $$
 select jsonb_build_object(
  'messenger',coalesce((select f.is_enabled from public.app_feature_flags f where f.feature_key='messenger'),true),
  'global_stories',coalesce((select f.is_enabled from public.app_feature_flags f where f.feature_key='global_stories'),true),
  'catalog',coalesce((select f.is_enabled from public.app_feature_flags f where f.feature_key='catalog'),true),
  'reports',coalesce((select f.is_enabled from public.app_feature_flags f where f.feature_key='reports'),true)
 );
$$;
revoke all on function public.user_get_app_features() from public,anon;
grant execute on function public.user_get_app_features() to authenticated;

create or replace function public.admin_set_app_feature(feature_key text,is_enabled boolean)
returns boolean language plpgsql security definer set search_path=''
as $set_app_feature$
begin
 if not public.is_current_admin() then
  raise exception 'Доступ запрещён: нужны права администратора' using errcode='42501';
 end if;
 if feature_key not in ('messenger','global_stories','catalog','reports') then
  raise exception 'Неизвестная функция приложения';
 end if;
 insert into public.app_feature_flags(feature_key,is_enabled,updated_by,updated_at)
 values(feature_key,is_enabled,(select auth.uid()),now())
 on conflict(feature_key) do update set is_enabled=excluded.is_enabled,updated_by=excluded.updated_by,updated_at=now();
 return true;
end;
$set_app_feature$;
revoke all on function public.admin_set_app_feature(text,boolean) from public,anon;
grant execute on function public.admin_set_app_feature(text,boolean) to authenticated;
