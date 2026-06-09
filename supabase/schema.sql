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
