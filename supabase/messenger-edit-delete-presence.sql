-- Provoda Staff messenger: edit/delete messages and online presence.
-- Additive and idempotent: existing conversations and messages are preserved.

alter table public.messenger_messages
  add column if not exists edited_at timestamptz;

create or replace function public.messenger_update_message(
  p_message_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_message public.messenger_messages%rowtype;
begin
  if v_user is null then
    raise exception 'Нужна авторизация' using errcode='42501';
  end if;
  if length(coalesce(p_body,'')) > 8000 then
    raise exception 'Сообщение слишком длинное';
  end if;
  select * into v_message
  from public.messenger_messages
  where id=p_message_id
    and sender_id=v_user
    and public.messenger_is_member(conversation_id)
  for update;
  if not found then
    raise exception 'Сообщение не найдено или его нельзя изменить' using errcode='42501';
  end if;
  if length(trim(coalesce(p_body,'')))=0 and v_message.attachment_path is null then
    raise exception 'Сообщение не может быть пустым';
  end if;
  update public.messenger_messages
  set body=coalesce(p_body,''), edited_at=now()
  where id=p_message_id
  returning * into v_message;
  return jsonb_build_object(
    'id',v_message.id,'body',v_message.body,'edited_at',v_message.edited_at
  );
end;
$$;

create or replace function public.messenger_delete_message(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_message public.messenger_messages%rowtype;
begin
  if v_user is null then
    raise exception 'Нужна авторизация' using errcode='42501';
  end if;
  select * into v_message
  from public.messenger_messages
  where id=p_message_id
    and sender_id=v_user
    and public.messenger_is_member(conversation_id)
  for update;
  if not found then
    raise exception 'Сообщение не найдено или его нельзя удалить' using errcode='42501';
  end if;
  delete from public.messenger_messages where id=p_message_id;
  return jsonb_build_object('id',v_message.id,'attachment_path',v_message.attachment_path);
end;
$$;

create table if not exists public.messenger_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
alter table public.messenger_presence enable row level security;
revoke all on public.messenger_presence from public,anon,authenticated;

create or replace function public.messenger_presence_ping()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Нужна авторизация' using errcode='42501';
  end if;
  insert into public.messenger_presence(user_id,last_seen_at)
  values(v_user,now())
  on conflict(user_id) do update set last_seen_at=excluded.last_seen_at;
end;
$$;

create or replace function public.messenger_list_presence()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_result jsonb;
begin
  if v_user is null then
    raise exception 'Нужна авторизация' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',u.id,
    'online',coalesce(p.last_seen_at > now()-interval '65 seconds',false)
  )),'[]'::jsonb)
  into v_result
  from auth.users u
  left join public.messenger_presence p on p.user_id=u.id
  where u.id<>v_user and u.deleted_at is null;
  return v_result;
end;
$$;

revoke all on function public.messenger_update_message(uuid,text) from public,anon;
grant execute on function public.messenger_update_message(uuid,text) to authenticated;
revoke all on function public.messenger_delete_message(uuid) from public,anon;
grant execute on function public.messenger_delete_message(uuid) to authenticated;
revoke all on function public.messenger_presence_ping() from public,anon;
grant execute on function public.messenger_presence_ping() to authenticated;
revoke all on function public.messenger_list_presence() from public,anon;
grant execute on function public.messenger_list_presence() to authenticated;

-- Allow the sender to remove their own uploaded attachment after deleting a message.
drop policy if exists messenger_media_delete_own on storage.objects;
create policy messenger_media_delete_own on storage.objects
for delete to authenticated
using (
  bucket_id='provoda-messenger'
  and split_part(name,'/',1) ~ '^[0-9a-f-]{36}$'
  and split_part(name,'/',2)=(select auth.uid())::text
  and public.messenger_is_member(split_part(name,'/',1)::uuid)
);
