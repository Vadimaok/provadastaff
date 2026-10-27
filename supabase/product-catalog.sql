-- Provoda Staff: shared editable product catalog
-- Run this file once in Supabase SQL Editor.
-- Read access is available to signed-in users; only accounts approved by is_current_admin() can change products.
create table if not exists public.product_catalog (
  name text primary key,
  category text not null default 'другое',
  supplier text not null default '',
  volume numeric,
  price numeric not null default 0 check (price >= 0),
  available boolean not null default true,
  active boolean not null default true,
  image_url text not null default '',
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.product_catalog enable row level security;

drop policy if exists "Authenticated users can read product catalog" on public.product_catalog;
create policy "Authenticated users can read product catalog"
  on public.product_catalog for select
  to authenticated
  using (true);

drop policy if exists "Admins can insert product catalog" on public.product_catalog;
create policy "Admins can insert product catalog"
  on public.product_catalog for insert
  to authenticated
  with check (public.is_current_admin());

drop policy if exists "Admins can update product catalog" on public.product_catalog;
create policy "Admins can update product catalog"
  on public.product_catalog for update
  to authenticated
  using (public.is_current_admin())
  with check (public.is_current_admin());

grant select, insert, update on public.product_catalog to authenticated;
