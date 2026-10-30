-- Allow Supabase Storage to create the virtual folders used by messenger uploads.
-- The actual file remains restricted to the sender's own subfolder and conversation membership.

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
