-- Safety, push notifications, reputation, and community moderation roles

-- Device fingerprints (lightweight device ID tracking)
create table if not exists public.device_fingerprints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  device_id text not null,
  platform text,
  created_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  unique (user_id, device_id)
);

create index if not exists device_fingerprints_user_id_idx
  on public.device_fingerprints (user_id);

alter table public.device_fingerprints enable row level security;

drop policy if exists "Device fingerprints viewable by owner" on public.device_fingerprints;
create policy "Device fingerprints viewable by owner"
on public.device_fingerprints
for select
using (auth.uid() = user_id
  or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

drop policy if exists "Device fingerprints insertable by owner" on public.device_fingerprints;
create policy "Device fingerprints insertable by owner"
on public.device_fingerprints
for insert
with check (auth.uid() = user_id);

drop policy if exists "Device fingerprints updatable by owner" on public.device_fingerprints;
create policy "Device fingerprints updatable by owner"
on public.device_fingerprints
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Push device tokens
create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  device_id text,
  platform text,
  token text not null,
  created_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  unique (user_id, token)
);

create index if not exists device_tokens_user_id_idx
  on public.device_tokens (user_id);

alter table public.device_tokens enable row level security;

drop policy if exists "Device tokens viewable by owner" on public.device_tokens;
create policy "Device tokens viewable by owner"
on public.device_tokens
for select
using (auth.uid() = user_id
  or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

drop policy if exists "Device tokens insertable by owner" on public.device_tokens;
create policy "Device tokens insertable by owner"
on public.device_tokens
for insert
with check (auth.uid() = user_id);

drop policy if exists "Device tokens updatable by owner" on public.device_tokens;
create policy "Device tokens updatable by owner"
on public.device_tokens
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Room community moderation roles
create table if not exists public.room_roles (
  room_id uuid references public.rooms (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'moderator')),
  created_at timestamptz default now(),
  primary key (room_id, user_id)
);

create index if not exists room_roles_room_id_idx
  on public.room_roles (room_id);

alter table public.room_roles enable row level security;

drop policy if exists "Room roles viewable by room members" on public.room_roles;
create policy "Room roles viewable by room members"
on public.room_roles
for select
using (
  exists (
    select 1 from public.room_members
    where room_members.room_id = room_roles.room_id
      and room_members.user_id = auth.uid()
  )
  or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

drop policy if exists "Room roles manageable by owner" on public.room_roles;
create policy "Room roles manageable by owner"
on public.room_roles
for insert
with check (
  exists (
    select 1 from public.rooms
    where rooms.id = room_roles.room_id
      and rooms.created_by = auth.uid()
  )
  or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

drop policy if exists "Room roles updatable by owner" on public.room_roles;
create policy "Room roles updatable by owner"
on public.room_roles
for update
using (
  exists (
    select 1 from public.rooms
    where rooms.id = room_roles.room_id
      and rooms.created_by = auth.uid()
  )
  or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
)
with check (
  exists (
    select 1 from public.rooms
    where rooms.id = room_roles.room_id
      and rooms.created_by = auth.uid()
  )
  or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

drop policy if exists "Room roles deletable by owner" on public.room_roles;
create policy "Room roles deletable by owner"
on public.room_roles
for delete
using (
  exists (
    select 1 from public.rooms
    where rooms.id = room_roles.room_id
      and rooms.created_by = auth.uid()
  )
  or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

create or replace function public.assign_room_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into public.room_roles (room_id, user_id, role)
    values (new.id, new.created_by, 'owner')
    on conflict (room_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists rooms_assign_owner on public.rooms;
create trigger rooms_assign_owner
after insert on public.rooms
for each row execute function public.assign_room_owner();

-- Moderation audit trail
create table if not exists public.moderation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  content_type text not null,
  content_id text,
  status text not null,
  model text,
  categories jsonb,
  created_at timestamptz default now()
);

create index if not exists moderation_events_user_id_idx
  on public.moderation_events (user_id);

alter table public.moderation_events enable row level security;

drop policy if exists "Moderation events insertable by owner" on public.moderation_events;
create policy "Moderation events insertable by owner"
on public.moderation_events
for insert
with check (auth.uid() = user_id);

drop policy if exists "Moderation events viewable by owner or admin" on public.moderation_events;
create policy "Moderation events viewable by owner or admin"
on public.moderation_events
for select
using (
  auth.uid() = user_id
  or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

-- Reputation / trust score
alter table public.profiles
  add column if not exists reputation_score int default 0;

alter table public.profiles
  add column if not exists trust_score int default 0;

create or replace function public.award_reputation(p_delta int default 1)
returns table (reputation_score int, trust_score int)
language plpgsql
security definer
set search_path = public
as $$
declare
  next_rep int;
  next_trust int;
begin
  update public.profiles as p
  set reputation_score = coalesce(p.reputation_score, 0) + p_delta,
      trust_score = coalesce(p.trust_score, 0) + p_delta
  where p.id = auth.uid()
  returning p.reputation_score, p.trust_score into next_rep, next_trust;

  if not found then
    insert into public.profiles (id, reputation_score, trust_score)
    values (auth.uid(), greatest(p_delta, 0), greatest(p_delta, 0))
    returning public.profiles.reputation_score, public.profiles.trust_score
    into next_rep, next_trust;
  end if;

  return query select next_rep, next_trust;
end;
$$;

-- Keep reputation in sync when XP is awarded
create or replace function public.award_xp()
returns table (xp int, level int)
language plpgsql
security definer
set search_path = public
as $$
declare
  next_xp int;
  next_level int;
begin
  update public.profiles as p
  set xp = coalesce(p.xp, 0) + 1,
      level = public.compute_level(coalesce(p.xp, 0) + 1),
      reputation_score = coalesce(p.reputation_score, 0) + 1,
      trust_score = coalesce(p.trust_score, 0) + 1
  where p.id = auth.uid()
  returning p.xp, p.level into next_xp, next_level;

  if not found then
    insert into public.profiles (id, xp, level, reputation_score, trust_score)
    values (auth.uid(), 1, public.compute_level(1), 1, 1)
    returning public.profiles.xp, public.profiles.level into next_xp, next_level;
  end if;

  return query select next_xp, next_level;
end;
$$;
