-- Provoda staff: per-account active browser/device sessions.
-- Run once in Supabase SQL Editor. This table is separate from expense data.
create table if not exists public.device_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null,
  device_name text not null default 'Устройство',
  device_type text not null default 'desktop'
    check (device_type in ('phone','tablet','desktop')),
  browser_name text not null default 'Браузер',
  user_agent text not null default '',
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, session_id)
);

create index if not exists device_sessions_user_last_seen_idx
  on public.device_sessions (user_id, last_seen_at desc);

alter table public.device_sessions enable row level security;

drop policy if exists "Users can view their own device sessions" on public.device_sessions;
create policy "Users can view their own device sessions"
  on public.device_sessions for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can add their own device sessions" on public.device_sessions;
create policy "Users can add their own device sessions"
  on public.device_sessions for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own device sessions" on public.device_sessions;
create policy "Users can update their own device sessions"
  on public.device_sessions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own device sessions" on public.device_sessions;
create policy "Users can delete their own device sessions"
  on public.device_sessions for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.device_sessions to authenticated;
