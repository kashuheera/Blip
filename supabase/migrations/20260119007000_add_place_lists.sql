create table if not exists public.place_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  title text not null,
  is_default boolean not null default false,
  is_shareable boolean not null default false,
  created_at timestamptz default now(),
  unique (user_id, title)
);

create table if not exists public.place_saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  list_id uuid references public.place_lists (id) on delete cascade,
  entity_id uuid not null,
  entity_kind text not null,
  entity_title text not null,
  entity_category text,
  created_at timestamptz default now(),
  unique (user_id, entity_kind, entity_id),
  constraint place_saves_kind_check check (entity_kind in ('room', 'business'))
);

create index if not exists place_lists_user_idx
  on public.place_lists (user_id, created_at desc);

create index if not exists place_saves_user_idx
  on public.place_saves (user_id, created_at desc);

create index if not exists place_saves_list_idx
  on public.place_saves (list_id, created_at desc);

alter table public.place_lists enable row level security;
alter table public.place_saves enable row level security;

drop policy if exists "Place lists viewable by owner or shareable" on public.place_lists;
create policy "Place lists viewable by owner or shareable"
on public.place_lists
for select
using (auth.uid() = user_id or is_shareable);

drop policy if exists "Place lists insertable by owner" on public.place_lists;
create policy "Place lists insertable by owner"
on public.place_lists
for insert
with check (auth.uid() = user_id);

drop policy if exists "Place lists updatable by owner" on public.place_lists;
create policy "Place lists updatable by owner"
on public.place_lists
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Place lists deletable by owner" on public.place_lists;
create policy "Place lists deletable by owner"
on public.place_lists
for delete
using (auth.uid() = user_id);

drop policy if exists "Place saves viewable by owner or shareable list" on public.place_saves;
create policy "Place saves viewable by owner or shareable list"
on public.place_saves
for select
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.place_lists
    where place_lists.id = place_saves.list_id
      and place_lists.is_shareable = true
  )
);

drop policy if exists "Place saves insertable by owner" on public.place_saves;
create policy "Place saves insertable by owner"
on public.place_saves
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.place_lists
    where place_lists.id = place_saves.list_id
      and place_lists.user_id = auth.uid()
  )
);

drop policy if exists "Place saves updatable by owner" on public.place_saves;
create policy "Place saves updatable by owner"
on public.place_saves
for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.place_lists
    where place_lists.id = place_saves.list_id
      and place_lists.user_id = auth.uid()
  )
);

drop policy if exists "Place saves deletable by owner" on public.place_saves;
create policy "Place saves deletable by owner"
on public.place_saves
for delete
using (auth.uid() = user_id);
