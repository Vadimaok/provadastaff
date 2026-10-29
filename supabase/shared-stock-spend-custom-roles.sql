-- Provoda Staff: shared stock, shared issue ledger, and administrator-created roles.
-- Additive only: existing rows and role values are preserved.
begin;
alter table public.product_catalog add column if not exists stock_quantity numeric(12,3);
alter table public.product_catalog add column if not exists stock_unit text not null default 'шт';
alter table public.product_catalog add column if not exists low_stock_threshold numeric(12,3);
do $$ begin
 if not exists(select 1 from pg_constraint where conname='product_catalog_stock_nonnegative') then
  alter table public.product_catalog add constraint product_catalog_stock_nonnegative check(stock_quantity is null or stock_quantity>=0);
 end if;
end $$;

create table if not exists public.shared_product_issues(
 id uuid primary key default gen_random_uuid(),
 issued_by uuid not null references auth.users(id) on delete restrict,
 employee_name text not null default '',
 product_name text not null check(length(trim(product_name)) between 1 and 160),
 quantity numeric(12,3) not null check(quantity>0),
 unit text not null default 'шт',
 unit_price numeric(12,2) not null default 0 check(unit_price>=0),
 total numeric(12,2) generated always as(round(quantity*unit_price,2)) stored,
 created_at timestamptz not null default now(),
 note text not null default ''
);
create index if not exists shared_product_issues_created_idx on public.shared_product_issues(created_at desc);
alter table public.shared_product_issues enable row level security;
revoke all on public.shared_product_issues from anon,authenticated;
grant select,insert on public.shared_product_issues to authenticated;
drop policy if exists shared_product_issues_read_reviewer on public.shared_product_issues;
create policy shared_product_issues_read_reviewer on public.shared_product_issues for select to authenticated
 using(public.is_current_admin() or public.daily_report_my_role()='shift_senior');
drop policy if exists shared_product_issues_insert_own on public.shared_product_issues;
create policy shared_product_issues_insert_own on public.shared_product_issues for insert to authenticated
 with check(issued_by=(select auth.uid()));

create or replace function public.shared_product_issue(product_name text, quantity numeric, unit_price numeric default 0, note text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid := (select auth.uid()); nm text:=trim(coalesce(product_name,'')); un text:='шт'; stock numeric; tracked boolean:=false; price numeric(12,2):=coalesce(unit_price,0); issue_id uuid; who text:='';
begin
 if actor is null then raise exception 'Нужно войти в аккаунт' using errcode='42501'; end if;
 if length(nm) not between 1 and 160 or quantity is null or quantity<=0 or quantity>100000 or price<0 then raise exception 'Проверь товар, количество и цену'; end if;
 select coalesce(nullif(trim(raw_user_meta_data->>'display_name'),''),nullif(trim(raw_user_meta_data->>'username'),''),nullif(trim(raw_user_meta_data->>'name'),''),email,'Сотрудник') into who from auth.users where id=actor;
 select c.name,c.stock_unit,c.stock_quantity,c.price into nm,un,stock,price from public.product_catalog c where lower(trim(c.name))=lower(trim(nm)) and c.active=true for update;
 if found then
  tracked:=stock is not null;
  if tracked and stock<quantity then raise exception 'Недостаточный остаток: доступно % %',stock,un; end if;
  if tracked then update public.product_catalog set stock_quantity=stock_quantity-quantity,updated_at=now(),updated_by=actor where lower(trim(name))=lower(trim(nm)); end if;
 end if;
 insert into public.shared_product_issues(issued_by,employee_name,product_name,quantity,unit,unit_price,note)
 values(actor,coalesce(who,''),nm,quantity,coalesce(nullif(trim(un),''),'шт'),price,left(coalesce(note,''),1000)) returning id into issue_id;
 return jsonb_build_object('id',issue_id,'product_name',nm,'quantity',quantity,'unit',un,'unit_price',price,'total',round(quantity*price,2),'stock_tracked',tracked);
end $$;
revoke all on function public.shared_product_issue(text,numeric,numeric,text) from public,anon;
grant execute on function public.shared_product_issue(text,numeric,numeric,text) to authenticated;

create or replace function public.shared_stock_set(product_name text,new_quantity numeric,new_unit text default 'шт',new_low_stock_threshold numeric default null)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not public.is_current_admin() and public.daily_report_my_role()<>'shift_senior' then raise exception 'Изменять остатки может только Админ или СТ' using errcode='42501'; end if;
 if new_quantity is not null and new_quantity<0 then raise exception 'Остаток не может быть отрицательным'; end if;
 update public.product_catalog set stock_quantity=new_quantity,stock_unit=coalesce(nullif(trim(new_unit),''),'шт'),low_stock_threshold=new_low_stock_threshold,updated_at=now(),updated_by=(select auth.uid()) where lower(trim(name))=lower(trim(product_name));
 if not found then raise exception 'Сначала сохрани товар в общем каталоге'; end if;
 return true;
end $$;
revoke all on function public.shared_stock_set(text,numeric,text,numeric) from public,anon;
grant execute on function public.shared_stock_set(text,numeric,text,numeric) to authenticated;

create or replace function public.shared_product_issues_list(date_from date default null,date_to date default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.is_current_admin() and public.daily_report_my_role()<>'shift_senior' then raise exception 'Общие траты доступны только Админу и СТ' using errcode='42501'; end if;
 select jsonb_build_object('total',coalesce(sum(i.total),0),'count',count(*),'items',coalesce(jsonb_agg(jsonb_build_object('id',i.id,'employee_id',i.issued_by,'employee_name',i.employee_name,'product_name',i.product_name,'quantity',i.quantity,'unit',i.unit,'unit_price',i.unit_price,'total',i.total,'created_at',i.created_at,'note',i.note) order by i.created_at desc),'[]'::jsonb))
 into result from public.shared_product_issues i
 where (date_from is null or i.created_at>=date_from::timestamptz) and (date_to is null or i.created_at<(date_to+1)::timestamptz);
 return result;
end $$;
revoke all on function public.shared_product_issues_list(date,date) from public,anon;
grant execute on function public.shared_product_issues_list(date,date) to authenticated;

create table if not exists public.custom_roles(
 id uuid primary key default gen_random_uuid(),
 role_key text not null unique check(role_key ~ '^[a-z][a-z0-9_]{2,39}$'),
 title text not null check(length(trim(title)) between 2 and 60),
 description text not null default '',
 color text not null default '#94a3b8' check(color ~ '^#[0-9A-Fa-f]{6}$'),
 permissions jsonb not null default '{}'::jsonb,
 is_active boolean not null default true,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.custom_roles enable row level security;
revoke all on public.custom_roles from anon,authenticated;
grant select on public.custom_roles to authenticated;
drop policy if exists custom_roles_read_authenticated on public.custom_roles;
create policy custom_roles_read_authenticated on public.custom_roles for select to authenticated using(true);
alter table public.user_roles add column if not exists custom_role_id uuid references public.custom_roles(id) on delete set null;
create index if not exists user_roles_custom_role_idx on public.user_roles(custom_role_id);

create or replace function public.admin_custom_role_save(role_id uuid,role_title text,role_description text default '',role_color text default '#94a3b8',role_permissions jsonb default '{}'::jsonb,is_active boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved public.custom_roles; slug text;
begin
 if not public.is_current_admin() then raise exception 'Создавать роли может только Администратор' using errcode='42501'; end if;
 if length(trim(coalesce(role_title,''))) not between 2 and 60 then raise exception 'Название роли: от 2 до 60 символов'; end if;
 if coalesce(role_color,'') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Некорректный цвет роли'; end if;
 slug:='custom_'||substr(md5(lower(trim(role_title))),1,16);
 if role_id is null then
  insert into public.custom_roles(role_key,title,description,color,permissions,is_active,created_by)
  values(slug,trim(role_title),left(coalesce(role_description,''),500),role_color,coalesce(role_permissions,'{}'::jsonb),coalesce(is_active,true),(select auth.uid())) returning * into saved;
 else
  update public.custom_roles set title=trim(role_title),description=left(coalesce(role_description,''),500),color=role_color,permissions=coalesce(role_permissions,'{}'::jsonb),is_active=coalesce(is_active,true),updated_at=now() where id=role_id returning * into saved;
  if not found then raise exception 'Роль не найдена'; end if;
 end if;
 return to_jsonb(saved);
end $$;
revoke all on function public.admin_custom_role_save(uuid,text,text,text,jsonb,boolean) from public,anon;
grant execute on function public.admin_custom_role_save(uuid,text,text,text,jsonb,boolean) to authenticated;

create or replace function public.admin_custom_roles_list()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_current_admin() then raise exception 'Доступ запрещён' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at) from public.custom_roles r),'[]'::jsonb);
end $$;
revoke all on function public.admin_custom_roles_list() from public,anon;
grant execute on function public.admin_custom_roles_list() to authenticated;

create or replace function public.admin_custom_role_assign(target_user_id uuid,target_role_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not public.is_current_admin() then raise exception 'Доступ запрещён' using errcode='42501'; end if;
 if not exists(select 1 from auth.users where id=target_user_id) then raise exception 'Аккаунт не найден'; end if;
 if target_role_id is not null and not exists(select 1 from public.custom_roles where id=target_role_id and is_active) then raise exception 'Выбери активную пользовательскую роль'; end if;
 insert into public.user_roles(user_id,role,custom_role_id,updated_by,updated_at) values(target_user_id,'employee',target_role_id,(select auth.uid()),now())
 on conflict(user_id) do update set custom_role_id=excluded.custom_role_id,updated_by=excluded.updated_by,updated_at=now();
 return true;
end $$;
revoke all on function public.admin_custom_role_assign(uuid,uuid) from public,anon;
grant execute on function public.admin_custom_role_assign(uuid,uuid) to authenticated;
create or replace function public.admin_custom_role_assignments_list()
returns jsonb language plpgsql stable security definer set search_path='' as $
begin
 if not public.is_current_admin() then raise exception 'Доступ запрещён' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('user_id',ur.user_id,'custom_role_id',cr.id,'title',cr.title,'color',cr.color) order by cr.title)
   from public.user_roles ur join public.custom_roles cr on cr.id=ur.custom_role_id),'[]'::jsonb);
end $;
revoke all on function public.admin_custom_role_assignments_list() from public,anon;
grant execute on function public.admin_custom_role_assignments_list() to authenticated;

commit;
