-- Provoda Staff: Daily Tasks (additive migration; preserves existing task tables)
-- Run once in Supabase SQL Editor. Existing admin_tasks and daily reports are untouched.

create table if not exists public.daily_task_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 140),
  description text not null default '',
  enabled boolean not null default true,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.daily_task_assignments (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 140),
  description text not null default '',
  assigned_to uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid not null references auth.users(id) on delete cascade,
  due_date date not null default (now() at time zone 'utc')::date,
  status text not null default 'new' check (status in ('new','submitted','approved','rejected')),
  completion_note text not null default '',
  reviewer_note text not null default '',
  submitted_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.daily_task_runs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.daily_task_templates(id) on delete cascade,
  task_date date not null default (now() at time zone 'utc')::date,
  assigned_to uuid not null references auth.users(id) on delete cascade,
  status text not null default 'new' check (status in ('new','submitted','approved','rejected')),
  completion_note text not null default '',
  reviewer_note text not null default '',
  submitted_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(template_id,task_date,assigned_to)
);
create index if not exists daily_task_assignments_user_idx on public.daily_task_assignments(assigned_to,due_date desc,status);
create index if not exists daily_task_runs_user_idx on public.daily_task_runs(assigned_to,task_date desc,status);
alter table public.daily_task_templates enable row level security;
alter table public.daily_task_assignments enable row level security;
alter table public.daily_task_runs enable row level security;
revoke all on public.daily_task_templates, public.daily_task_assignments, public.daily_task_runs from anon, authenticated;

create or replace function public.daily_tasks_is_reviewer()
returns boolean language sql stable security definer set search_path = '' as $$
 select public.is_current_admin() or exists (
   select 1 from public.user_roles r where r.user_id=(select auth.uid()) and r.role='shift_senior'
 );
$$;
revoke all on function public.daily_tasks_is_reviewer() from public,anon;
grant execute on function public.daily_tasks_is_reviewer() to authenticated;

create or replace function public.daily_tasks_list_my()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); d date := (now() at time zone 'utc')::date; result jsonb;
begin
 if uid is null then raise exception 'Нужна авторизация' using errcode='42501'; end if;
 insert into public.daily_task_runs(template_id,task_date,assigned_to)
 select t.id,d,uid from public.daily_task_templates t where t.enabled
 on conflict(template_id,task_date,assigned_to) do nothing;
 select jsonb_build_object(
  'date',d,
  'items',coalesce((select jsonb_agg(jsonb_build_object(
   'id',r.id,'kind','daily','template_id',t.id,'title',t.title,'description',t.description,
   'status',r.status,'completion_note',r.completion_note,'reviewer_note',r.reviewer_note,
   'submitted_at',r.submitted_at,'reviewed_at',r.reviewed_at,'created_at',r.created_at
  ) order by t.created_at,t.title) from public.daily_task_runs r join public.daily_task_templates t on t.id=r.template_id
   where r.assigned_to=uid and r.task_date=d and t.enabled), '[]'::jsonb)
  || coalesce((select jsonb_agg(jsonb_build_object(
   'id',a.id,'kind','assigned','title',a.title,'description',a.description,'status',a.status,
   'completion_note',a.completion_note,'reviewer_note',a.reviewer_note,'submitted_at',a.submitted_at,
   'reviewed_at',a.reviewed_at,'created_at',a.created_at,'due_date',a.due_date
  ) order by a.due_date,a.created_at) from public.daily_task_assignments a
   where a.assigned_to=uid and a.due_date<=d and a.status<>'approved'), '[]'::jsonb)
 ) into result;
 return result;
end; $$;
revoke all on function public.daily_tasks_list_my() from public,anon;
grant execute on function public.daily_tasks_list_my() to authenticated;

create or replace function public.daily_tasks_submit(task_id uuid, task_kind text, note text default '')
returns boolean language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
 if uid is null then raise exception 'Нужна авторизация' using errcode='42501'; end if;
 if length(coalesce(note,''))>2000 then raise exception 'Комментарий слишком длинный'; end if;
 if task_kind='daily' then
  update public.daily_task_runs set status='submitted',completion_note=coalesce(note,''),reviewer_note='',submitted_at=now(),reviewed_by=null,reviewed_at=null,updated_at=now()
  where id=task_id and assigned_to=uid and status in ('new','rejected') and task_date=(now() at time zone 'utc')::date;
 elsif task_kind='assigned' then
  update public.daily_task_assignments set status='submitted',completion_note=coalesce(note,''),reviewer_note='',submitted_at=now(),reviewed_by=null,reviewed_at=null,updated_at=now()
  where id=task_id and assigned_to=uid and status in ('new','rejected');
 else raise exception 'Неизвестный тип задачи'; end if;
 if not found then raise exception 'Задача не найдена или уже отправлена на проверку'; end if;
 return true;
end; $$;
revoke all on function public.daily_tasks_submit(uuid,text,text) from public,anon;
grant execute on function public.daily_tasks_submit(uuid,text,text) to authenticated;

create or replace function public.daily_tasks_review(task_id uuid, task_kind text, decision text, note text default '')
returns boolean language plpgsql security definer set search_path = '' as $$
begin
 if not public.daily_tasks_is_reviewer() then raise exception 'Подтверждать задачи может только СТ или администратор' using errcode='42501'; end if;
 if decision not in ('approved','rejected') then raise exception 'Недопустимое решение'; end if;
 if length(coalesce(note,''))>2000 then raise exception 'Комментарий слишком длинный'; end if;
 if task_kind='daily' then
  update public.daily_task_runs set status=decision,reviewer_note=coalesce(note,''),reviewed_by=(select auth.uid()),reviewed_at=now(),updated_at=now()
  where id=task_id and status='submitted';
 elsif task_kind='assigned' then
  update public.daily_task_assignments set status=decision,reviewer_note=coalesce(note,''),reviewed_by=(select auth.uid()),reviewed_at=now(),updated_at=now()
  where id=task_id and status='submitted';
 else raise exception 'Неизвестный тип задачи'; end if;
 if not found then raise exception 'Задача не найдена или уже проверена'; end if;
 return true;
end; $$;
revoke all on function public.daily_tasks_review(uuid,text,text,text) from public,anon;
grant execute on function public.daily_tasks_review(uuid,text,text,text) to authenticated;

create or replace function public.daily_tasks_create_template(task_title text, task_description text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
 if not public.daily_tasks_is_reviewer() then raise exception 'Создавать ежедневные задачи может только СТ или администратор' using errcode='42501'; end if;
 if length(trim(coalesce(task_title,''))) not between 1 and 140 then raise exception 'Название должно быть от 1 до 140 символов'; end if;
 if length(coalesce(task_description,''))>2000 then raise exception 'Описание слишком длинное'; end if;
 insert into public.daily_task_templates(title,description,created_by)
 values(trim(task_title),coalesce(task_description,''),(select auth.uid())) returning id into new_id;
 return new_id;
end; $$;
revoke all on function public.daily_tasks_create_template(text,text) from public,anon;
grant execute on function public.daily_tasks_create_template(text,text) to authenticated;

create or replace function public.daily_tasks_create_assignment(task_title text, task_description text, target_user_id uuid, target_due_date date default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
 if not public.daily_tasks_is_reviewer() then raise exception 'Назначать поручения может только СТ или администратор' using errcode='42501'; end if;
 if length(trim(coalesce(task_title,''))) not between 1 and 140 then raise exception 'Название должно быть от 1 до 140 символов'; end if;
 if target_user_id is null or not exists(select 1 from auth.users where id=target_user_id) then raise exception 'Сотрудник не найден'; end if;
 if length(coalesce(task_description,''))>2000 then raise exception 'Описание слишком длинное'; end if;
 insert into public.daily_task_assignments(title,description,assigned_to,assigned_by,due_date)
 values(trim(task_title),coalesce(task_description,''),target_user_id,(select auth.uid()),coalesce(target_due_date,(now() at time zone 'utc')::date))
 returning id into new_id;
 insert into public.user_notifications(user_id,kind,title,body)
 values(target_user_id,'new_task','Новое поручение: '||trim(task_title),coalesce(nullif(trim(task_description),''),'СТ назначил тебе поручение.'));
 return new_id;
end; $$;
revoke all on function public.daily_tasks_create_assignment(text,text,uuid,date) from public,anon;
grant execute on function public.daily_tasks_create_assignment(text,text,uuid,date) to authenticated;

create or replace function public.daily_tasks_list_review()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
 if not public.daily_tasks_is_reviewer() then raise exception 'Доступ запрещён' using errcode='42501'; end if;
 select coalesce(jsonb_agg(item order by created_at desc),'[]'::jsonb) into result from (
  select jsonb_build_object('id',r.id,'kind','daily','title',t.title,'description',t.description,'status',r.status,
   'completion_note',r.completion_note,'reviewer_note',r.reviewer_note,'submitted_at',r.submitted_at,
   'created_at',r.created_at,'task_date',r.task_date,'employee_id',r.assigned_to,
   'employee_name',coalesce(nullif(u.raw_user_meta_data->>'display_name',''),nullif(u.raw_user_meta_data->>'username',''),u.email))
   as item,r.created_at as created_at
  from public.daily_task_runs r join public.daily_task_templates t on t.id=r.template_id join auth.users u on u.id=r.assigned_to
  where r.status='submitted'
  union all
  select jsonb_build_object('id',a.id,'kind','assigned','title',a.title,'description',a.description,'status',a.status,
   'completion_note',a.completion_note,'reviewer_note',a.reviewer_note,'submitted_at',a.submitted_at,
   'created_at',a.created_at,'task_date',a.due_date,'employee_id',a.assigned_to,
   'employee_name',coalesce(nullif(u.raw_user_meta_data->>'display_name',''),nullif(u.raw_user_meta_data->>'username',''),u.email))
   as item,a.created_at as created_at
  from public.daily_task_assignments a join auth.users u on u.id=a.assigned_to where a.status='submitted'
 ) s;
 return result;
end; $$;
revoke all on function public.daily_tasks_list_review() from public,anon;
grant execute on function public.daily_tasks_list_review() to authenticated;

create or replace function public.daily_tasks_list_employees()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
 if not public.daily_tasks_is_reviewer() then raise exception 'Доступ запрещён' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'email',u.email,'name',coalesce(nullif(u.raw_user_meta_data->>'display_name',''),nullif(u.raw_user_meta_data->>'username',''),nullif(u.raw_user_meta_data->>'name',''),u.email)) order by u.email),'[]'::jsonb)
 into result from auth.users u where u.deleted_at is null;
 return result;
end; $$;
revoke all on function public.daily_tasks_list_employees() from public,anon;
grant execute on function public.daily_tasks_list_employees() to authenticated;
