-- Smart Scribe — single table.
-- Run this in the Supabase SQL editor for a fresh project.
-- If you already ran the old `meetings` version, run db/migrate-rename.sql instead.

create extension if not exists "pgcrypto";

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Untitled note',
  created_at timestamptz not null default now(),
  transcript text not null default '',
  realtime_insights jsonb not null default '[]'::jsonb,
  final_summary jsonb,
  custom_instructions text not null default ''
);

create index if not exists notes_created_at_idx
  on public.notes (created_at desc);

-- RLS is off: the secret key bypasses it anyway, and there are no other
-- clients. If you ever enable RLS, also add policies.
alter table public.notes disable row level security;
