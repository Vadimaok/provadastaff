-- Fix Storage virtual-folder inserts and enable realtime reaction updates.

drop policy if exists messenger_media_upload_member on storage.objects;

create policy messenger_media_upload_member
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'provoda-messenger'
  and split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
  and public.messenger_is_member(split_part(name, '/', 1)::uuid)
  and (
    name = split_part(name, '/', 1)
    or (
      split_part(name, '/', 2) = (select auth.uid())::text
      and (
        name = split_part(name, '/', 1) || '/' || (select auth.uid())::text
        or name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]+$'
      )
    )
  )
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='messenger_message_reactions'
  ) then
    alter publication supabase_realtime add table public.messenger_message_reactions;
  end if;
end $$;
