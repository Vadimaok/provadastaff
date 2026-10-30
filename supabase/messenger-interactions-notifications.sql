-- Provoda Staff messenger: replies, forwarding, reactions and message notifications.
-- Safe additive upgrade; existing conversations and messages are preserved.

alter table public.messenger_messages
  add column if not exists reply_to_message_id uuid references public.messenger_messages(id) on delete set null,
  add column if not exists forwarded_from_message_id uuid references public.messenger_messages(id) on delete set null;

alter table public.user_notifications
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.messenger_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messenger_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('❤️','👍','😂','🔥','😮','😢','👏','👎')),
  created_at timestamptz not null default now(),
  unique(message_id,user_id,emoji)
);
alter table public.messenger_message_reactions enable row level security;
revoke all on public.messenger_message_reactions from anon,authenticated;
grant select on public.messenger_message_reactions to authenticated;
drop policy if exists messenger_reactions_member_read on public.messenger_message_reactions;
create policy messenger_reactions_member_read on public.messenger_message_reactions
 for select to authenticated using (
   exists(select 1 from public.messenger_messages m where m.id=message_id and public.messenger_is_member(m.conversation_id))
 );

create or replace function public.messenger_list_messages(p_conversation_id uuid,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_result jsonb;
begin
  if v_user is null or not public.messenger_is_member(p_conversation_id) then
    raise exception 'Нет доступа к переписке' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'sender_id',m.sender_id,'body',m.body,
    'attachment_path',m.attachment_path,'attachment_mime',m.attachment_mime,
    'created_at',m.created_at,'reply_to_message_id',m.reply_to_message_id,
    'reply_preview',case when parent.id is null then null else jsonb_build_object(
      'sender_id',parent.sender_id,'body',left(parent.body,220),
      'has_attachment',parent.attachment_path is not null
    ) end,'forwarded_from_message_id',m.forwarded_from_message_id,
    'reactions',coalesce((
      select jsonb_agg(jsonb_build_object('emoji',r.emoji,'count',r.cnt,'mine',r.mine))
      from (select emoji,count(*)::integer cnt,bool_or(user_id=v_user) mine
            from public.messenger_message_reactions where message_id=m.id group by emoji) r
    ),'[]'::jsonb)
  ) order by m.created_at),'[]'::jsonb)
  into v_result
  from (
    select * from public.messenger_messages where conversation_id=p_conversation_id
    order by created_at desc limit least(greatest(coalesce(p_limit,100),1),200)
  ) m left join public.messenger_messages parent on parent.id=m.reply_to_message_id;
  return v_result;
end;
$$;

drop function if exists public.messenger_send_message(uuid,text,text,text);
create or replace function public.messenger_send_message(
  p_conversation_id uuid,p_body text default '',p_attachment_path text default null,
  p_attachment_mime text default null,p_reply_to_message_id uuid default null,
  p_forwarded_from_message_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_message public.messenger_messages%rowtype;
begin
  if v_user is null or not public.messenger_is_member(p_conversation_id) then
    raise exception 'Нет доступа к переписке' using errcode='42501';
  end if;
  if length(coalesce(p_body,''))>8000 then raise exception 'Сообщение слишком длинное'; end if;
  if length(trim(coalesce(p_body,'')))=0 and p_attachment_path is null then raise exception 'Добавь текст или вложение'; end if;
  if p_attachment_path is not null and (
    split_part(p_attachment_path,'/',1)<>p_conversation_id::text
    or split_part(p_attachment_path,'/',2)<>v_user::text
    or p_attachment_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]+$'
  ) then raise exception 'Недопустимый путь вложения'; end if;
  if p_reply_to_message_id is not null and not exists(
    select 1 from public.messenger_messages m where m.id=p_reply_to_message_id and m.conversation_id=p_conversation_id
  ) then raise exception 'Сообщение для ответа не найдено'; end if;
  if p_forwarded_from_message_id is not null and not exists(
    select 1 from public.messenger_messages m where m.id=p_forwarded_from_message_id and public.messenger_is_member(m.conversation_id)
  ) then raise exception 'Исходное сообщение недоступно'; end if;
  insert into public.messenger_messages(conversation_id,sender_id,body,attachment_path,attachment_mime,reply_to_message_id,forwarded_from_message_id)
  values(p_conversation_id,v_user,coalesce(p_body,''),p_attachment_path,p_attachment_mime,p_reply_to_message_id,p_forwarded_from_message_id)
  returning * into v_message;
  return jsonb_build_object('id',v_message.id,'sender_id',v_message.sender_id,'body',v_message.body,
    'attachment_path',v_message.attachment_path,'attachment_mime',v_message.attachment_mime,
    'created_at',v_message.created_at,'reply_to_message_id',v_message.reply_to_message_id,
    'forwarded_from_message_id',v_message.forwarded_from_message_id);
end;
$$;

create or replace function public.messenger_toggle_reaction(p_message_id uuid,p_emoji text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_conversation uuid; v_removed boolean;
begin
  if v_user is null then raise exception 'Нужна авторизация' using errcode='42501'; end if;
  if p_emoji not in ('❤️','👍','😂','🔥','😮','😢','👏','👎') then raise exception 'Недопустимая реакция'; end if;
  select conversation_id into v_conversation from public.messenger_messages where id=p_message_id;
  if v_conversation is null or not public.messenger_is_member(v_conversation) then raise exception 'Нет доступа к сообщению' using errcode='42501'; end if;
  delete from public.messenger_message_reactions where message_id=p_message_id and user_id=v_user and emoji=p_emoji;
  v_removed := found;
  if not v_removed then insert into public.messenger_message_reactions(message_id,user_id,emoji) values(p_message_id,v_user,p_emoji); end if;
  return jsonb_build_object('removed',v_removed);
end;
$$;

create or replace function public.notify_messenger_message()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_recipient uuid; v_sender_name text; v_preview text;
begin
  select case when c.participant_a=new.sender_id then c.participant_b else c.participant_a end
    into v_recipient from public.messenger_conversations c where c.id=new.conversation_id;
  if v_recipient is null or v_recipient=new.sender_id then return new; end if;
  select coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'),''),nullif(trim(u.raw_user_meta_data->>'username'),''),nullif(trim(u.raw_user_meta_data->>'name'),''),u.email,'Сотрудник')
    into v_sender_name from auth.users u where u.id=new.sender_id;
  v_preview:=case when nullif(trim(new.body),'') is not null then left(trim(new.body),180)
    when new.attachment_path is not null then 'Отправил(а) фотографию' else 'Новое сообщение' end;
  insert into public.user_notifications(user_id,kind,title,body,metadata)
  values(v_recipient,'new_message','Новое сообщение · '||coalesce(v_sender_name,'Сотрудник'),v_preview,
    jsonb_build_object('conversation_id',new.conversation_id,'sender_id',new.sender_id,'message_id',new.id));
  return new;
end;
$$;
drop trigger if exists messenger_message_notification on public.messenger_messages;
create trigger messenger_message_notification after insert on public.messenger_messages
for each row execute function public.notify_messenger_message();

revoke all on function public.messenger_list_messages(uuid,integer) from public,anon;
grant execute on function public.messenger_list_messages(uuid,integer) to authenticated;
revoke all on function public.messenger_send_message(uuid,text,text,text,uuid,uuid) from public,anon;
grant execute on function public.messenger_send_message(uuid,text,text,text,uuid,uuid) to authenticated;
revoke all on function public.messenger_toggle_reaction(uuid,text) from public,anon;
grant execute on function public.messenger_toggle_reaction(uuid,text) to authenticated;

create or replace function public.user_list_notifications(limit_rows integer default 100)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare result jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Нужна авторизация' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',n.id,'kind',n.kind,'title',n.title,'body',n.body,
    'created_at',n.created_at,'read_at',n.read_at,'metadata',n.metadata
  ) order by n.created_at desc),'[]'::jsonb)
  into result
  from (
    select id,kind,title,body,created_at,read_at,metadata from public.user_notifications
    where user_id=(select auth.uid()) order by created_at desc
    limit greatest(1,least(coalesce(limit_rows,100),200))
  ) n;
  return result;
end;
$$;
revoke all on function public.user_list_notifications(integer) from public,anon;
grant execute on function public.user_list_notifications(integer) to authenticated;
