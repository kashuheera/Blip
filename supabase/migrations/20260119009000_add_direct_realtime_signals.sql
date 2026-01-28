create table if not exists public.direct_presence (
  thread_key text not null,
  user_id uuid references auth.users (id) on delete cascade,
  last_seen_at timestamptz default now(),
  primary key (thread_key, user_id)
);

create table if not exists public.direct_typing (
  thread_key text not null,
  user_id uuid references auth.users (id) on delete cascade,
  updated_at timestamptz default now(),
  primary key (thread_key, user_id)
);

create table if not exists public.direct_reads (
  thread_key text not null,
  user_id uuid references auth.users (id) on delete cascade,
  last_read_at timestamptz default now(),
  primary key (thread_key, user_id)
);

create index if not exists direct_presence_thread_idx
  on public.direct_presence (thread_key, last_seen_at desc);

create index if not exists direct_presence_user_idx
  on public.direct_presence (user_id, last_seen_at desc);

create index if not exists direct_typing_thread_idx
  on public.direct_typing (thread_key, updated_at desc);

create index if not exists direct_reads_thread_idx
  on public.direct_reads (thread_key, last_read_at desc);

alter table public.direct_presence enable row level security;
alter table public.direct_typing enable row level security;
alter table public.direct_reads enable row level security;

drop policy if exists "Direct presence viewable by participants" on public.direct_presence;
create policy "Direct presence viewable by participants"
on public.direct_presence
for select
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.direct_threads
    where direct_threads.thread_key = direct_presence.thread_key
      and (direct_threads.requester_id = auth.uid() or direct_threads.recipient_id = auth.uid())
  )
);

drop policy if exists "Direct presence insertable by owner" on public.direct_presence;
create policy "Direct presence insertable by owner"
on public.direct_presence
for insert
with check (auth.uid() = user_id);

drop policy if exists "Direct presence updatable by owner" on public.direct_presence;
create policy "Direct presence updatable by owner"
on public.direct_presence
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Direct presence deletable by owner" on public.direct_presence;
create policy "Direct presence deletable by owner"
on public.direct_presence
for delete
using (auth.uid() = user_id);

drop policy if exists "Direct typing viewable by participants" on public.direct_typing;
create policy "Direct typing viewable by participants"
on public.direct_typing
for select
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.direct_threads
    where direct_threads.thread_key = direct_typing.thread_key
      and (direct_threads.requester_id = auth.uid() or direct_threads.recipient_id = auth.uid())
  )
);

drop policy if exists "Direct typing insertable by owner" on public.direct_typing;
create policy "Direct typing insertable by owner"
on public.direct_typing
for insert
with check (auth.uid() = user_id);

drop policy if exists "Direct typing updatable by owner" on public.direct_typing;
create policy "Direct typing updatable by owner"
on public.direct_typing
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Direct typing deletable by owner" on public.direct_typing;
create policy "Direct typing deletable by owner"
on public.direct_typing
for delete
using (auth.uid() = user_id);

drop policy if exists "Direct reads viewable by participants" on public.direct_reads;
create policy "Direct reads viewable by participants"
on public.direct_reads
for select
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.direct_threads
    where direct_threads.thread_key = direct_reads.thread_key
      and (direct_threads.requester_id = auth.uid() or direct_threads.recipient_id = auth.uid())
  )
);

drop policy if exists "Direct reads insertable by owner" on public.direct_reads;
create policy "Direct reads insertable by owner"
on public.direct_reads
for insert
with check (auth.uid() = user_id);

drop policy if exists "Direct reads updatable by owner" on public.direct_reads;
create policy "Direct reads updatable by owner"
on public.direct_reads
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Direct reads deletable by owner" on public.direct_reads;
create policy "Direct reads deletable by owner"
on public.direct_reads
for delete
using (auth.uid() = user_id);
