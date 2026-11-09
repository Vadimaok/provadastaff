-- Employee stories for the Provoda Staff messenger.
-- Review and apply manually after the application PR is approved. This file is NOT executed by CI.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'provoda-user-stories',
  'provoda-user-stories',
  false,
  52428800,
  array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.messenger_user_stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_path text not null unique,
  media_type text not null check (media_type in ('image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime')),
  caption text check (caption is null or char_length(caption) <= 180),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint messenger_user_stories_expiry check (expires_at > created_at and expires_at <= created_at + interval '25 hours')
);

create index if not exists messenger_user_stories_active_idx
  on public.messenger_user_stories (expires_at desc, created_at desc);

alter table public.messenger_user_stories enable row level security;

drop policy if exists messenger_user_stories_read_active on public.messenger_user_stories;
create policy messenger_user_stories_read_active
  on public.messenger_user_stories for select to authenticated
  using (expires_at > now());

drop policy if exists messenger_user_stories_insert_own on public.messenger_user_stories;
create policy messenger_user_stories_insert_own
  on public.messenger_user_stories for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and expires_at > now()
    and expires_at <= now() + interval '25 hours'
    and media_path like (select auth.uid())::text || '/%'
  );

drop policy if exists messenger_user_stories_delete_own_or_admin on public.messenger_user_stories;
create policy messenger_user_stories_delete_own_or_admin
  on public.messenger_user_stories for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_current_admin());

drop policy if exists messenger_user_stories_storage_read_active on storage.objects;
create policy messenger_user_stories_storage_read_active
  on storage.objects for select to authenticated
  using (
    bucket_id = 'provoda-user-stories'
    and exists (
      select 1 from public.messenger_user_stories s
      where s.media_path = storage.objects.name and s.expires_at > now()
    )
  );

drop policy if exists messenger_user_stories_storage_insert_own on storage.objects;
create policy messenger_user_stories_storage_insert_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'provoda-user-stories'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists messenger_user_stories_storage_delete_own_or_admin on storage.objects;
create policy messenger_user_stories_storage_delete_own_or_admin
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'provoda-user-stories'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_current_admin()
    )
  );

commit;
