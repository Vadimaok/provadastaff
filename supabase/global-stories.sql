-- Provoda Staff: administrator-published global stories.
-- Run once in Supabase Dashboard -> SQL Editor.
create table if not exists public.global_stories (
  id uuid primary key default gen_random_uuid(),
  caption text not null default '' check (char_length(caption) <= 180),
  media_type text not null check (media_type in ('image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime')),
  storage_path text not null unique,
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists global_stories_active_idx on public.global_stories(expires_at, created_at desc);
alter table public.global_stories enable row level security;
revoke all on public.global_stories from anon, authenticated;
grant select, insert, delete on public.global_stories to authenticated;
drop policy if exists global_stories_read_active on public.global_stories;
create policy global_stories_read_active on public.global_stories for select to authenticated using (expires_at > now());
drop policy if exists global_stories_admin_insert on public.global_stories;
create policy global_stories_admin_insert on public.global_stories for insert to authenticated
with check (public.is_current_admin() and created_by=(select auth.uid()) and expires_at>now() and expires_at<=now()+interval '73 hours');
drop policy if exists global_stories_admin_delete on public.global_stories;
create policy global_stories_admin_delete on public.global_stories for delete to authenticated using (public.is_current_admin());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('provoda-global-stories','provoda-global-stories',false,104857600,
array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists global_stories_storage_read on storage.objects;
create policy global_stories_storage_read on storage.objects for select to authenticated using(bucket_id='provoda-global-stories');
drop policy if exists global_stories_storage_admin_insert on storage.objects;
create policy global_stories_storage_admin_insert on storage.objects for insert to authenticated with check(bucket_id='provoda-global-stories' and public.is_current_admin());
drop policy if exists global_stories_storage_admin_delete on storage.objects;
create policy global_stories_storage_admin_delete on storage.objects for delete to authenticated using(bucket_id='provoda-global-stories' and public.is_current_admin());
