-- Provoda Staff: daily/night shift reports
-- Run once in Supabase Dashboard -> SQL Editor.
create table if not exists public.daily_report_settings (
  key text primary key,
  enabled boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.daily_report_settings(key, enabled) values ('daily_reports', true)
on conflict (key) do nothing;
alter table public.daily_report_settings enable row level security;
drop policy if exists daily_report_settings_read on public.daily_report_settings;
create policy daily_report_settings_read on public.daily_report_settings for select to authenticated using (true);
drop policy if exists daily_report_settings_admin_write on public.daily_report_settings;
create policy daily_report_settings_admin_write on public.daily_report_settings for all to authenticated
using (public.is_current_admin()) with check (public.is_current_admin());

create table if not exists public.daily_report_categories (
  id uuid primary key default gen_random_uuid(),
  shift_type text not null check (shift_type in ('day','night')),
  title text not null check (length(trim(title)) between 1 and 180),
  position integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.daily_report_categories enable row level security;
drop policy if exists daily_report_categories_read on public.daily_report_categories;
create policy daily_report_categories_read on public.daily_report_categories for select to authenticated using (true);
drop policy if exists daily_report_categories_admin_write on public.daily_report_categories;
create policy daily_report_categories_admin_write on public.daily_report_categories for all to authenticated
using (public.is_current_admin()) with check (public.is_current_admin());

insert into public.daily_report_categories(shift_type,title,position) 
select v.shift_type,v.title,v.position from (values
 ('day','Фотография заполненного холодильника',1),
 ('day','Фотография кухни',2),
 ('day','Фотографии мусорок',3),
 ('day','Заполненные салфетницы',4),
 ('night','Заполненный холодильник',1),
 ('night','Фотография кухни',2),
 ('night','Чистая техника: аэрогриль, духовка, кофемашинка',3),
 ('night','Фотография бойлера',4),
 ('night','Фотография кружек',5),
 ('night','Общий план стойки администрации',6),
 ('night','Прибранные комнаты; где необходимо — кондиционеры выключены, пульты на месте',7),
 ('night','Беспроводные девайсы на зарядке',8),
 ('night','Дополнительные девайсы + сообщение от шефа',9)
) as v(shift_type,title,position)
where not exists(select 1 from public.daily_report_categories c where c.shift_type=v.shift_type and c.title=v.title);

create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references auth.users(id) on delete cascade,
  shift_type text not null check (shift_type in ('day','night')),
  report_date date not null default current_date,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  items jsonb not null default '[]'::jsonb,
  sender_comment text not null default '',
  reviewer_comment text not null default '',
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz
);
create index if not exists daily_reports_date_status_idx on public.daily_reports(report_date desc,status,submitted_at desc);
create index if not exists daily_reports_author_idx on public.daily_reports(submitted_by,submitted_at desc);
alter table public.daily_reports enable row level security;
drop policy if exists daily_reports_read_own_or_reviewer on public.daily_reports;
create policy daily_reports_read_own_or_reviewer on public.daily_reports for select to authenticated
using (submitted_by = (select auth.uid()) or public.is_current_admin() or exists (
  select 1 from public.user_roles r where r.user_id=(select auth.uid()) and r.role='shift_senior'
));
drop policy if exists daily_reports_insert_own on public.daily_reports;
create policy daily_reports_insert_own on public.daily_reports for insert to authenticated
with check (submitted_by=(select auth.uid()) and status='pending' and reviewed_by is null and reviewed_at is null);
drop policy if exists daily_reports_update_own_pending on public.daily_reports;
create policy daily_reports_update_own_pending on public.daily_reports for update to authenticated
using (submitted_by=(select auth.uid()) and status='pending')
with check (submitted_by=(select auth.uid()) and status='pending' and reviewed_by is null and reviewed_at is null);

create or replace function public.daily_report_review(report_id uuid, decision text, note text default '')
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.daily_report_is_reviewer() then raise exception 'Проверять отчёты может только Админ или СТ' using errcode='42501'; end if;
  if decision not in ('approved','rejected') then raise exception 'Недопустимый статус'; end if;
  update public.daily_reports set status=decision, reviewer_comment=coalesce(note,''), reviewed_by=(select auth.uid()), reviewed_at=now()
  where id=report_id;
  if not found then raise exception 'Отчёт не найден'; end if;
  return true;
end; $$;
revoke all on function public.daily_report_review(uuid,text,text) from public,anon;
grant execute on function public.daily_report_review(uuid,text,text) to authenticated;

create or replace function public.daily_report_admin_save_category(category_id uuid, new_shift_type text, new_title text, new_position integer, is_enabled boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare saved_id uuid;
begin
  if not public.daily_report_is_reviewer() then raise exception 'Редактировать категории может только Админ или СТ' using errcode='42501'; end if;
  if new_shift_type not in ('day','night') or length(trim(coalesce(new_title,''))) not between 1 and 180 then raise exception 'Проверь категорию'; end if;
  if category_id is null then
    insert into public.daily_report_categories(shift_type,title,position,enabled) values(new_shift_type,trim(new_title),coalesce(new_position,0),coalesce(is_enabled,true)) returning id into saved_id;
  else
    update public.daily_report_categories set shift_type=new_shift_type,title=trim(new_title),position=coalesce(new_position,0),enabled=coalesce(is_enabled,true),updated_at=now() where id=category_id returning id into saved_id;
    if not found then raise exception 'Категория не найдена'; end if;
  end if;
  return saved_id;
end; $$;
revoke all on function public.daily_report_admin_save_category(uuid,text,text,integer,boolean) from public,anon;
grant execute on function public.daily_report_admin_save_category(uuid,text,text,integer,boolean) to authenticated;

create or replace function public.daily_report_admin_set_enabled(is_enabled boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_current_admin() then raise exception 'Только Админ может менять настройки' using errcode='42501'; end if;
  insert into public.daily_report_settings(key,enabled,updated_by,updated_at) values('daily_reports',is_enabled,(select auth.uid()),now())
  on conflict(key) do update set enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=now();
  return true;
end; $$;
revoke all on function public.daily_report_admin_set_enabled(boolean) from public,anon;
grant execute on function public.daily_report_admin_set_enabled(boolean) to authenticated;

-- Separate primary account role from the additional shift-report role.
alter table public.user_roles add column if not exists shift_role text;
update public.user_roles set shift_role=role, role='employee' where role in ('shift_day','shift_night') and (shift_role is null or shift_role='');
alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check check (role in ('employee','employee_knz','shift_senior'));
alter table public.user_roles drop constraint if exists user_roles_shift_role_check;
alter table public.user_roles add constraint user_roles_shift_role_check check (shift_role is null or shift_role in ('shift_day','shift_night'));

create or replace function public.admin_set_user_role(target_user_id uuid, new_role text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_current_admin() then
    raise exception 'Доступ запрещён: нужны права администратора' using errcode = '42501';
  end if;
  if new_role not in ('employee','employee_knz','shift_senior','shift_day','shift_night') then
    raise exception 'Недопустимая роль';
  end if;
  if not exists(select 1 from auth.users where id=target_user_id) then
    raise exception 'Аккаунт не найден';
  end if;
  insert into public.user_roles(user_id,role,updated_by,updated_at)
  values(target_user_id,new_role,(select auth.uid()),now())
  on conflict(user_id) do update set role=excluded.role,updated_by=excluded.updated_by,updated_at=now();
  return true;
end; $$;
revoke all on function public.admin_set_user_role(uuid,text) from public,anon;
grant execute on function public.admin_set_user_role(uuid,text) to authenticated;

alter table public.daily_reports add column if not exists author_name text not null default '';


-- Safe role helpers: callers do not need direct SELECT permission on user_roles.
create or replace function public.daily_report_my_role()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select r.role from public.user_roles r where r.user_id=(select auth.uid()) limit 1),'employee');
$$;
revoke all on function public.daily_report_my_role() from public,anon;
grant execute on function public.daily_report_my_role() to authenticated;

create or replace function public.user_get_my_shift_role()
returns text language sql stable security definer set search_path = '' as $$
  select r.shift_role from public.user_roles r where r.user_id = (select auth.uid()) limit 1;
$$;
revoke all on function public.user_get_my_shift_role() from public,anon;
grant execute on function public.user_get_my_shift_role() to authenticated;

create or replace function public.daily_report_is_reviewer()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_current_admin() or public.daily_report_my_role()='shift_senior';
$$;
revoke all on function public.daily_report_is_reviewer() from public,anon;
grant execute on function public.daily_report_is_reviewer() to authenticated;

drop policy if exists daily_reports_read_own_or_reviewer on public.daily_reports;
create policy daily_reports_read_own_or_reviewer on public.daily_reports for select to authenticated
using (submitted_by=(select auth.uid()) or public.daily_report_is_reviewer());
drop policy if exists daily_report_categories_admin_write on public.daily_report_categories;
create policy daily_report_categories_admin_write on public.daily_report_categories for all to authenticated
using (public.daily_report_is_reviewer()) with check (public.daily_report_is_reviewer());

create or replace function public.admin_set_user_role(target_user_id uuid, new_role text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_current_admin() then raise exception 'Доступ запрещён: нужны права администратора' using errcode='42501'; end if;
  if new_role not in ('employee','employee_knz','shift_senior') then raise exception 'Основная роль должна быть: Сотрудник, Сотрудник КНЗ или СТ'; end if;
  if not exists(select 1 from auth.users where id=target_user_id) then raise exception 'Аккаунт не найден'; end if;
  insert into public.user_roles(user_id,role,updated_by,updated_at)
  values(target_user_id,new_role,(select auth.uid()),now())
  on conflict(user_id) do update set role=excluded.role,updated_by=excluded.updated_by,updated_at=now();
  return true;
end; $$;
revoke all on function public.admin_set_user_role(uuid,text) from public,anon;
grant execute on function public.admin_set_user_role(uuid,text) to authenticated;

create or replace function public.admin_set_user_shift_role(target_user_id uuid, new_shift_role text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor_role text;
begin
  actor_role := public.daily_report_my_role();
  if not public.is_current_admin() and actor_role <> 'shift_senior' then
    raise exception 'Доступ запрещён: нужны права Админа или СТ' using errcode='42501';
  end if;
  if new_shift_role is not null and new_shift_role not in ('shift_day','shift_night') then raise exception 'Дополнительная роль должна быть дневной или ночной сменой'; end if;
  if not exists(select 1 from auth.users where id=target_user_id) then raise exception 'Аккаунт не найден'; end if;
  insert into public.user_roles(user_id,role,shift_role,updated_by,updated_at)
  values(target_user_id,'employee',new_shift_role,(select auth.uid()),now())
  on conflict(user_id) do update set shift_role=excluded.shift_role,updated_by=excluded.updated_by,updated_at=now();
  return true;
end; $$;
revoke all on function public.admin_set_user_shift_role(uuid,text) from public,anon;
grant execute on function public.admin_set_user_shift_role(uuid,text) to authenticated;

create or replace function public.daily_report_list_users()
returns table(user_id uuid, display_name text, role text, shift_role text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_current_admin() and public.daily_report_my_role()<>'shift_senior' then
    raise exception 'Доступно только Админу и СТ' using errcode='42501';
  end if;
  return query select u.id,
    coalesce(nullif(u.raw_user_meta_data->>'display_name',''),nullif(u.raw_user_meta_data->>'username',''),u.email,'Сотрудник')::text,
    coalesce(r.role,'employee')::text, r.shift_role
  from auth.users u left join public.user_roles r on r.user_id=u.id order by 2;
end; $$;
revoke all on function public.daily_report_list_users() from public,anon;
grant execute on function public.daily_report_list_users() to authenticated;

alter table public.daily_reports add column if not exists yandex_disk_url text not null default '';
alter table public.daily_reports add column if not exists author_name text not null default '';


-- Admin / ST can remove approved or rejected rows from the Excel export.
-- Pending reports are intentionally never removed by this function.
create or replace function public.daily_report_delete_excel(report_ids uuid[] default '{}'::uuid[], delete_all boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $
declare deleted_count integer;
begin
  if not public.daily_report_is_reviewer() then
    raise exception 'Удалять записи Excel может только Админ или СТ' using errcode='42501';
  end if;

  if coalesce(delete_all, false) then
    delete from public.daily_reports
    where status in ('approved','rejected');
  else
    delete from public.daily_reports
    where status in ('approved','rejected')
      and id = any(coalesce(report_ids, '{}'::uuid[]));
  end if;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$;
revoke all on function public.daily_report_delete_excel(uuid[],boolean) from public, anon;
grant execute on function public.daily_report_delete_excel(uuid[],boolean) to authenticated;

-- Enable Supabase Realtime for shared app data and shift-report workflow.
-- Safe to rerun: only adds existing tables not already in the publication.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['user_data','user_roles','daily_reports','daily_report_categories','daily_report_settings'] loop
      if to_regclass('public.' || t) is not null
         and not exists (
           select 1 from pg_publication_tables
           where pubname='supabase_realtime' and schemaname='public' and tablename=t
         ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
