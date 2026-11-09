-- Google Drive media migration registry for Provoda Staff.
-- Additive only: legacy Storage objects and application rows are not changed or deleted.
-- Run manually in Supabase SQL Editor after reviewing this file.

create table if not exists public.provoda_drive_media (
  id uuid primary key default gen_random_uuid(),
  source_bucket text not null check (source_bucket in ('provoda-messenger','provoda-global-stories','provoda-user-stories')),
  source_path text not null check (char_length(source_path) between 1 and 1024),
  drive_file_id text not null,
  drive_file_name text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  migration_status text not null default 'copied' check (migration_status in ('copied','verified','failed')),
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
  'SHA-256 of copied bytes; used to verify source and Drive content before any future cutover.';
comment on column public.provoda_drive_media.migration_status is
  'copied means upload completed; verified means a later byte-for-byte hash check passed. No source deletion is automated.';
