-- Migration: Add smart reminder notification logs and completed event history.
-- Run this in Supabase SQL Editor

-- Events are stored in dashboard_state.data as JSONB. The app writes
-- per-event notificationFlags there for quick state sync, and this table is
-- the authoritative duplicate-send guard for cron/server delivery.
create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  dashboard_id text not null,
  user_id uuid references auth.users(id) on delete cascade,
  event_id text not null,
  event_title text not null,
  event_date date,
  event_time time,
  notification_type text not null check (notification_type in ('2_days_before', '1_day_before', '3_hours_before', 'at_event_time', 'after_completion')),
  target_external_id text not null,
  onesignal_notification_id text,
  payload jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique(dashboard_id, event_id, notification_type)
);

create index if not exists notification_log_dashboard_event_idx on public.notification_log(dashboard_id, event_id);
create index if not exists notification_log_user_event_idx on public.notification_log(user_id, event_id) where user_id is not null;
create index if not exists notification_log_sent_at_idx on public.notification_log(sent_at);

alter table public.notification_log enable row level security;

drop policy if exists "notification_log_select_own" on public.notification_log;
create policy "notification_log_select_own"
on public.notification_log for select
to authenticated
using (user_id is not null and auth.uid() = user_id);

drop policy if exists "notification_log_insert_own" on public.notification_log;
create policy "notification_log_insert_own"
on public.notification_log for insert
to authenticated
with check (user_id is not null and auth.uid() = user_id);

drop policy if exists "notification_log_update_own" on public.notification_log;
create policy "notification_log_update_own"
on public.notification_log for update
to authenticated
using (user_id is not null and auth.uid() = user_id)
with check (user_id is not null and auth.uid() = user_id);

-- Optional relational history mirror. The UI reads dashboard_state.data.eventHistory
-- so shared/password-only dashboards work without auth, but this table remains
-- available for authenticated reporting or future exports.
create table if not exists public.event_history (
  id uuid primary key default gen_random_uuid(),
  dashboard_id text not null,
  user_id uuid references auth.users(id) on delete cascade,
  original_event_id text not null,
  title text not null,
  date date not null,
  time time,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  original_created_at timestamptz,
  unique(dashboard_id, original_event_id)
);

create index if not exists event_history_dashboard_completed_idx on public.event_history(dashboard_id, completed_at desc);
create index if not exists event_history_user_completed_idx on public.event_history(user_id, completed_at desc) where user_id is not null;

alter table public.event_history enable row level security;

drop policy if exists "event_history_select_own" on public.event_history;
create policy "event_history_select_own"
on public.event_history for select
to authenticated
using (user_id is not null and auth.uid() = user_id);

drop policy if exists "event_history_insert_own" on public.event_history;
create policy "event_history_insert_own"
on public.event_history for insert
to authenticated
with check (user_id is not null and auth.uid() = user_id);
