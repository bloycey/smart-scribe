-- Migrate from the old `meetings` table to the new `notes` naming.
-- Safe to run multiple times.

alter table if exists public.meetings rename to notes;
alter index if exists meetings_created_at_idx rename to notes_created_at_idx;
alter table public.notes alter column title set default 'Untitled note';
update public.notes set title = 'Untitled note' where title = 'Untitled meeting';
