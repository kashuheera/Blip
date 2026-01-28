create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid references public.profiles (id) on delete cascade,
  followed_id uuid references public.profiles (id) on delete cascade,
  follower_handle text,
  followed_handle text,
  created_at timestamptz default now(),
  unique (follower_id, followed_id),
  constraint follows_no_self check (follower_id <> followed_id)
);

create index if not exists follows_follower_created_idx
  on public.follows (follower_id, created_at desc);

create index if not exists follows_followed_created_idx
  on public.follows (followed_id, created_at desc);

alter table public.follows enable row level security;

drop policy if exists "Follows viewable by anyone" on public.follows;
create policy "Follows viewable by anyone"
on public.follows
for select
using (true);

drop policy if exists "Follows insertable by follower" on public.follows;
create policy "Follows insertable by follower"
on public.follows
for insert
with check (auth.uid() = follower_id);

drop policy if exists "Follows updatable by participants" on public.follows;
create policy "Follows updatable by participants"
on public.follows
for update
using (auth.uid() = follower_id or auth.uid() = followed_id)
with check (auth.uid() = follower_id or auth.uid() = followed_id);

drop policy if exists "Follows deletable by follower" on public.follows;
create policy "Follows deletable by follower"
on public.follows
for delete
using (auth.uid() = follower_id);
