-- Provoda Staff: feedback intake and missing global-story Storage policies.
-- Additive migration: does not alter or delete existing user data.
create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('idea','bug','other')),
  message text not null check (char_length(btrim(message)) between 10 and 2000),
  page text not null default '/' check (char_length(page) <= 200),
  status text not null default 'new' check (status in ('new','reviewing','accepted','rejected','done')),
  admin_notes text not null default '' check (char_length(admin_notes) <= 2000),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);
create index if not exists user_feedback_created_idx on public.user_feedback(created_at desc);
create index if not exists user_feedback_status_created_idx on public.user_feedback(status, created_at desc);
alter table public.user_feedback enable row level security;
revoke all on public.user_feedback from anon, authenticated;
grant select, insert, update on public.user_feedback to authenticated;
drop policy if exists user_feedback_insert_own on public.user_feedback;
create policy user_feedback_insert_own on public.user_feedback
  for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists user_feedback_admin_read on public.user_feedback;
create policy user_feedback_admin_read on public.user_feedback
  for select to authenticated
  using (public.is_current_admin());
drop policy if exists user_feedback_admin_update on public.user_feedback;
create policy user_feedback_admin_update on public.user_feedback
  for update to authenticated
  using (public.is_current_admin())
  with check (public.is_current_admin());

-- The bucket already exists. The live project was missing all three policies.
drop policy if exists global_stories_storage_read on storage.objects;
create policy global_stories_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'provoda-global-stories'
    and exists (
      select 1 from public.global_stories s
      where s.storage_path = storage.objects.name
        and s.expires_at > now()
    )
  );
drop policy if exists global_stories_storage_admin_insert on storage.objects;
create policy global_stories_storage_admin_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'provoda-global-stories'
    and public.is_current_admin()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop policy if exists global_stories_storage_admin_delete on storage.objects;
create policy global_stories_storage_admin_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'provoda-global-stories'
    and public.is_current_admin()
  );
