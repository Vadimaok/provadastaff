-- Internal messenger is always available to authenticated users.
-- The feature flag no longer controls messenger access; participant membership remains enforced.

create or replace function public.messenger_is_member(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(
    select 1 from public.messenger_conversations c
    where c.id=p_conversation_id and (select auth.uid()) in (c.participant_a,c.participant_b)
  );
$$;
revoke all on function public.messenger_is_member(uuid) from public,anon;
grant execute on function public.messenger_is_member(uuid) to authenticated;

create or replace function public.messenger_list_users()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_result jsonb;
begin
  if v_user is null then raise exception 'Нужна авторизация' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',u.id,
    'name',coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'),''),nullif(trim(u.raw_user_meta_data->>'username'),''),nullif(trim(u.raw_user_meta_data->>'name'),''),u.email,'Сотрудник'),
    'avatar_data',nullif(u.raw_user_meta_data->>'avatar_data',''),
    'role_label',case when au.user_id is not null then 'Администратор' when cr.title is not null then cr.title when ur.role='shift_senior' then 'Старший КНЗ' when ur.role='employee_knz' then 'Сотрудник КНЗ' else 'Сотрудник' end,
    'shift_role',case when ur.shift_role='day' then 'Дневная смена' when ur.shift_role='night' then 'Ночная смена' else null end
  ) order by lower(coalesce(u.raw_user_meta_data->>'display_name',u.raw_user_meta_data->>'username',u.email))), '[]'::jsonb)
  into v_result
  from auth.users u
  left join public.admin_users au on au.user_id=u.id
  left join public.user_roles ur on ur.user_id=u.id
  left join public.custom_roles cr on cr.id=ur.custom_role_id and cr.is_active
  where u.id<>v_user and u.deleted_at is null;
  return v_result;
end;
$$;

create or replace function public.messenger_open_conversation(p_target_user_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_a uuid; v_b uuid; v_id uuid;
begin
  if v_user is null then raise exception 'Нужна авторизация' using errcode='42501'; end if;
  if p_target_user_id is null or p_target_user_id=v_user or not exists(select 1 from auth.users u where u.id=p_target_user_id and u.deleted_at is null) then raise exception 'Пользователь не найден'; end if;
  v_a:=least(v_user,p_target_user_id);v_b:=greatest(v_user,p_target_user_id);
  insert into public.messenger_conversations(participant_a,participant_b) values(v_a,v_b)
  on conflict(participant_a,participant_b) do update set participant_a=excluded.participant_a
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.messenger_list_conversations()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_result jsonb;
begin
  if v_user is null then raise exception 'Нужна авторизация' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'conversation_id',c.id,'user_id',u.id,
    'name',coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'),''),nullif(trim(u.raw_user_meta_data->>'username'),''),nullif(trim(u.raw_user_meta_data->>'name'),''),u.email,'Сотрудник'),
    'avatar_data',nullif(u.raw_user_meta_data->>'avatar_data',''),
    'role_label',case when au.user_id is not null then 'Администратор' when cr.title is not null then cr.title when ur.role='shift_senior' then 'Старший КНЗ' when ur.role='employee_knz' then 'Сотрудник КНЗ' else 'Сотрудник' end,
    'shift_role',case when ur.shift_role='day' then 'Дневная смена' when ur.shift_role='night' then 'Ночная смена' else null end,
    'last_message',coalesce((select nullif(m.body,'') from public.messenger_messages m where m.conversation_id=c.id order by m.created_at desc limit 1),case when exists(select 1 from public.messenger_messages m where m.conversation_id=c.id) then 'Фото' else 'Открыть личный чат' end),
    'last_message_at',(select m.created_at from public.messenger_messages m where m.conversation_id=c.id order by m.created_at desc limit 1)
  ) order by (select m.created_at from public.messenger_messages m where m.conversation_id=c.id order by m.created_at desc limit 1) desc nulls last), '[]'::jsonb)
  into v_result
  from public.messenger_conversations c
  join auth.users u on u.id=case when c.participant_a=v_user then c.participant_b else c.participant_a end
  left join public.admin_users au on au.user_id=u.id
  left join public.user_roles ur on ur.user_id=u.id
  left join public.custom_roles cr on cr.id=ur.custom_role_id and cr.is_active
  where v_user in(c.participant_a,c.participant_b) and u.deleted_at is null;
  return v_result;
end;
$$;

update public.role_feature_flags set is_enabled=true,updated_at=now() where role='internal_chat';
