create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  session_id text not null,
  event_name text not null,
  event_props jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists analytics_events_name_created_idx
  on public.analytics_events (event_name, created_at desc);

create index if not exists analytics_events_user_created_idx
  on public.analytics_events (user_id, created_at desc);

create index if not exists analytics_events_session_created_idx
  on public.analytics_events (session_id, created_at desc);

alter table public.analytics_events enable row level security;

drop policy if exists "Analytics events insertable by owner" on public.analytics_events;
create policy "Analytics events insertable by owner"
on public.analytics_events
for insert
with check (auth.uid() = user_id);

drop policy if exists "Analytics events viewable by admin" on public.analytics_events;
create policy "Analytics events viewable by admin"
on public.analytics_events
for select
using (
  exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);
