-- Google Drive media migration registry for Provoda Staff.
-- Additive only: legacy Storage objects and application rows are not changed or deleted.
-- Run manually in Supabase SQL Editor after reviewing this file.

create table if not exists public.provoda_drive_media (
  id uuid primary key default gen_random_uuid(),
  source_bucket text not null check (source_bucket in ('provoda-messenger','provoda-global-stories','provoda-user-stories','admin-task-screenshots')),
  source_path text not null check (char_length(source_path) between 1 and 1024),
  drive_file_id text,
  drive_file_name text,
  mime_type text,
  byte_size bigint check (byte_size is null or byte_size > 0),
  sha256 text check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  migration_status text not null default 'pending' check (migration_status in ('pending','copied','verified','failed')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  unique (source_bucket, source_path),
  unique (drive_file_id)
);

alter table public.provoda_drive_media enable row level security;
revoke all on public.provoda_drive_media from anon, authenticated;
grant all on public.provoda_drive_media to service_role;

comment on table public.provoda_drive_media is
  'Private migration registry. Source Storage objects remain authoritative until a separately approved cutover.';
comment on column public.provoda_drive_media.sha256 is
  'SHA-256 of source and downloaded Drive bytes; migration is verified only when both match.';
comment on column public.provoda_drive_media.migration_status is
  'pending, verified, or failed. No source deletion is automated.';
