-- Add per-user keep-chat preferences for direct threads.

create table if not exists public.direct_thread_keeps (
  thread_key text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  keep_enabled boolean default false,
  updated_at timestamptz default now(),
  primary key (thread_key, user_id)
);

create index if not exists direct_thread_keeps_thread_idx
  on public.direct_thread_keeps (thread_key);

alter table public.direct_thread_keeps enable row level security;

drop policy if exists "Direct keeps viewable by participants" on public.direct_thread_keeps;
create policy "Direct keeps viewable by participants"
on public.direct_thread_keeps
for select
using (
  exists (
    select 1
    from public.direct_threads
    where direct_threads.thread_key = direct_thread_keeps.thread_key
      and (direct_threads.requester_id = auth.uid() or direct_threads.recipient_id = auth.uid())
  )
);

drop policy if exists "Direct keeps insertable by owner" on public.direct_thread_keeps;
create policy "Direct keeps insertable by owner"
on public.direct_thread_keeps
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.direct_threads
    where direct_threads.thread_key = direct_thread_keeps.thread_key
      and (direct_threads.requester_id = auth.uid() or direct_threads.recipient_id = auth.uid())
  )
);

drop policy if exists "Direct keeps updatable by owner" on public.direct_thread_keeps;
create policy "Direct keeps updatable by owner"
on public.direct_thread_keeps
for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.direct_threads
    where direct_threads.thread_key = direct_thread_keeps.thread_key
      and (direct_threads.requester_id = auth.uid() or direct_threads.recipient_id = auth.uid())
  )
);

drop policy if exists "Direct keeps deletable by owner" on public.direct_thread_keeps;
create policy "Direct keeps deletable by owner"
on public.direct_thread_keeps
for delete
using (auth.uid() = user_id);
