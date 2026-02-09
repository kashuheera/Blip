-- Stories + voice rooms (presence-first)

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  author_handle text not null,
  caption text not null default '',
  media_url text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index if not exists stories_created_at_idx on public.stories (created_at desc);
create index if not exists stories_expires_at_idx on public.stories (expires_at desc);

alter table public.stories enable row level security;

drop policy if exists "Stories readable when active or owner/admin" on public.stories;
create policy "Stories readable when active or owner/admin"
on public.stories
for select
to public
using (
  expires_at > now()
  or user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  )
);

drop policy if exists "Stories insertable by owner" on public.stories;
create policy "Stories insertable by owner"
on public.stories
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Stories updatable by owner/admin" on public.stories;
create policy "Stories updatable by owner/admin"
on public.stories
for update
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  )
)
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  )
);

drop policy if exists "Stories deletable by owner/admin" on public.stories;
create policy "Stories deletable by owner/admin"
on public.stories
for delete
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  )
);

insert into storage.buckets (id, name, public)
values ('story-media', 'story-media', true)
on conflict (id) do nothing;

drop policy if exists "Story media upload by owner path" on storage.objects;
create policy "Story media upload by owner path"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'story-media'
  and split_part(name, '/', 2) = auth.uid()::text
);

drop policy if exists "Story media delete by owner path" on storage.objects;
create policy "Story media delete by owner path"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'story-media'
  and split_part(name, '/', 2) = auth.uid()::text
);

create table if not exists public.voice_rooms (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  topic text null,
  city text null,
  status text not null default 'live' check (status in ('live', 'scheduled', 'ended')),
  latitude double precision null,
  longitude double precision null,
  created_by uuid null references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists voice_rooms_started_at_idx on public.voice_rooms (started_at desc);
create index if not exists voice_rooms_status_idx on public.voice_rooms (status);

alter table public.voice_rooms enable row level security;

drop policy if exists "Voice rooms readable by everyone" on public.voice_rooms;
create policy "Voice rooms readable by everyone"
on public.voice_rooms
for select
to public
using (true);

drop policy if exists "Voice rooms insertable by creator" on public.voice_rooms;
create policy "Voice rooms insertable by creator"
on public.voice_rooms
for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "Voice rooms updatable by creator/admin" on public.voice_rooms;
create policy "Voice rooms updatable by creator/admin"
on public.voice_rooms
for update
to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  )
)
with check (
  created_by = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  )
);

drop policy if exists "Voice rooms deletable by creator/admin" on public.voice_rooms;
create policy "Voice rooms deletable by creator/admin"
on public.voice_rooms
for delete
to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  )
);

create table if not exists public.voice_room_participants (
  room_id uuid not null references public.voice_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'listener' check (role in ('host', 'speaker', 'listener')),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists voice_room_participants_room_idx on public.voice_room_participants (room_id);
create index if not exists voice_room_participants_user_idx on public.voice_room_participants (user_id);

alter table public.voice_room_participants enable row level security;

drop policy if exists "Voice room participants readable by everyone" on public.voice_room_participants;
create policy "Voice room participants readable by everyone"
on public.voice_room_participants
for select
to public
using (true);

drop policy if exists "Voice room participants insertable by self" on public.voice_room_participants;
create policy "Voice room participants insertable by self"
on public.voice_room_participants
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Voice room participants deletable by self_or_admin" on public.voice_room_participants;
create policy "Voice room participants deletable by self_or_admin"
on public.voice_room_participants
for delete
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  )
);

insert into public.voice_rooms (title, topic, city, status)
select 'Lahore Food Pulse', 'What is the best dinner option near Askari 11 tonight?', 'Lahore', 'live'
where not exists (
  select 1 from public.voice_rooms where title = 'Lahore Food Pulse' and city = 'Lahore'
);

insert into public.voice_rooms (title, topic, city, status)
select 'Grocery Deals Lahore', 'Daily grocery promotions and quick stock updates', 'Lahore', 'live'
where not exists (
  select 1 from public.voice_rooms where title = 'Grocery Deals Lahore' and city = 'Lahore'
);
