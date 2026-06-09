create table if not exists public.dashboard_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.dashboard_state enable row level security;

drop policy if exists "dashboard_state_select_own" on public.dashboard_state;
create policy "dashboard_state_select_own"
on public.dashboard_state for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "dashboard_state_insert_own" on public.dashboard_state;
create policy "dashboard_state_insert_own"
on public.dashboard_state for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "dashboard_state_update_own" on public.dashboard_state;
create policy "dashboard_state_update_own"
on public.dashboard_state for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.tomorrow_picks (
  id text primary key,
  symbol text not null,
  source text not null default 'ai',
  score numeric,
  signal text,
  scanner text,
  mode text,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create unique index if not exists tomorrow_picks_symbol_source_idx
on public.tomorrow_picks (symbol, source);

alter table public.tomorrow_picks enable row level security;

drop policy if exists "tomorrow_picks_public_read" on public.tomorrow_picks;
create policy "tomorrow_picks_public_read"
on public.tomorrow_picks for select
to anon, authenticated
using (true);

insert into storage.buckets (id, name, public, file_size_limit)
values ('dashboard-files', 'dashboard-files', false, 104857600)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "dashboard_files_select_own" on storage.objects;
create policy "dashboard_files_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'dashboard-files'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "dashboard_files_insert_own" on storage.objects;
create policy "dashboard_files_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'dashboard-files'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "dashboard_files_update_own" on storage.objects;
create policy "dashboard_files_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'dashboard-files'
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'dashboard-files'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "dashboard_files_delete_own" on storage.objects;
create policy "dashboard_files_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'dashboard-files'
  and split_part(name, '/', 1) = auth.uid()::text
);
