-- Core BLIP schema (MVP).
create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  birth_year int,
  current_handle text,
  handle_updated_at timestamptz,
  bio text,
  is_admin boolean default false,
  xp int default 0,
  level int default 1,
  chat_points int default 10,
  chat_points_day date default current_date,
  chat_penalty int default 0,
  chat_exhausted_day date,
  u2u_locked boolean default false,
  shadowbanned boolean default false,
  u2u_locked_at timestamptz,
  u2u_locked_reason text,
  created_at timestamptz default now()
);

create table if not exists public.handle_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  handle text not null,
  created_at timestamptz default now()
);

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id),
  name text,
  category text,
  hours text,
  phone text,
  flags text[],
  latitude double precision,
  longitude double precision,
  verified boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.business_messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses (id) on delete cascade,
  user_id uuid references auth.users (id),
  author_handle text,
  body text,
  is_business boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.business_offers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses (id) on delete cascade,
  title text,
  details text,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses (id) on delete cascade,
  name text,
  description text,
  price_cents int,
  available boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  status text,
  notes text,
  fulfillment_type text default 'pickup',
  delivery_status text,
  delivery_assignee_id uuid references auth.users (id) on delete set null,
  dropoff_area_key text,
  delivery_assigned_at timestamptz,
  delivery_picked_up_at timestamptz,
  delivery_delivered_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders (id) on delete cascade,
  menu_item_id uuid references public.menu_items (id) on delete set null,
  quantity int,
  price_cents int,
  created_at timestamptz default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  title text,
  category text,
  latitude double precision,
  longitude double precision,
  radius_meters int,
  created_by uuid references auth.users (id),
  created_at timestamptz default now()
);

create table if not exists public.room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms (id) on delete cascade,
  user_id uuid references auth.users (id),
  author_handle text,
  body text,
  created_at timestamptz default now()
);

create table if not exists public.room_members (
  room_id uuid references public.rooms (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  joined_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  primary key (room_id, user_id)
);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  thread_key text,
  sender_id uuid references auth.users (id),
  recipient_id uuid references auth.users (id),
  author_handle text,
  body text,
  created_at timestamptz default now(),
  expires_at timestamptz,
  constraint direct_messages_body_length check (char_length(body) <= 160),
  constraint direct_messages_no_url check (body !~* '(https?://|www\\.)')
);

create table if not exists public.direct_threads (
  id uuid primary key default gen_random_uuid(),
  thread_key text unique not null,
  requester_id uuid references auth.users (id) on delete cascade,
  recipient_id uuid references auth.users (id) on delete cascade,
  requester_handle text,
  recipient_handle text,
  status text default 'pending',
  request_message text not null,
  message_count int default 0,
  last_message text,
  last_message_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint direct_threads_request_length check (char_length(request_message) <= 160),
  constraint direct_threads_request_no_url check (request_message !~* '(https?://|www\\.)')
);

create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid references auth.users (id),
  blocked_id uuid references auth.users (id),
  created_at timestamptz default now(),
  unique (blocker_id, blocked_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users (id),
  target_type text,
  target_id text,
  reason text,
  status text default 'open',
  created_at timestamptz default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  author_handle text,
  body text not null,
  area_key text,
  created_at timestamptz default now(),
  constraint posts_body_length check (char_length(body) <= 280)
);

create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  email text,
  title text not null,
  body text not null,
  app_version text,
  platform text,
  route text,
  created_at timestamptz default now()
);

create table if not exists public.appeal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  reason text,
  payment_method text,
  payment_status text default 'pending',
  status text default 'open',
  created_at timestamptz default now()
);

-- Upgrade helpers for existing databases.
alter table if exists public.profiles
  add column if not exists xp int default 0,
  add column if not exists level int default 1,
  add column if not exists chat_points int default 10,
  add column if not exists chat_points_day date default current_date,
  add column if not exists chat_penalty int default 0,
  add column if not exists chat_exhausted_day date,
  add column if not exists u2u_locked boolean default false,
  add column if not exists shadowbanned boolean default false,
  add column if not exists u2u_locked_at timestamptz,
  add column if not exists u2u_locked_reason text;

alter table if exists public.direct_messages
  add column if not exists thread_key text,
  add column if not exists expires_at timestamptz;

alter table if exists public.orders
  add column if not exists fulfillment_type text default 'pickup',
  add column if not exists delivery_status text,
  add column if not exists delivery_assignee_id uuid references auth.users (id) on delete set null,
  add column if not exists dropoff_area_key text,
  add column if not exists delivery_assigned_at timestamptz,
  add column if not exists delivery_picked_up_at timestamptz,
  add column if not exists delivery_delivered_at timestamptz;

update public.orders
set fulfillment_type = 'pickup'
where fulfillment_type is null;

do $$
begin
  if to_regclass('public.direct_messages') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'direct_messages_body_length'
        and conrelid = to_regclass('public.direct_messages')
    ) then
      alter table public.direct_messages
        add constraint direct_messages_body_length check (char_length(body) <= 160);
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'direct_messages_no_url'
        and conrelid = to_regclass('public.direct_messages')
    ) then
      alter table public.direct_messages
        add constraint direct_messages_no_url check (body !~* '(https?://|www\\.)');
    end if;
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.direct_threads') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'direct_threads_request_length'
        and conrelid = to_regclass('public.direct_threads')
    ) then
      alter table public.direct_threads
        add constraint direct_threads_request_length check (char_length(request_message) <= 160);
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'direct_threads_request_no_url'
        and conrelid = to_regclass('public.direct_threads')
    ) then
      alter table public.direct_threads
        add constraint direct_threads_request_no_url check (request_message !~* '(https?://|www\\.)');
    end if;
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.posts') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'posts_body_length'
        and conrelid = to_regclass('public.posts')
    ) then
      alter table public.posts
        add constraint posts_body_length check (char_length(body) <= 280);
    end if;
  end if;
end;
$$;

create index if not exists posts_area_created_idx
  on public.posts (area_key, created_at desc);

create index if not exists posts_user_created_idx
  on public.posts (user_id, created_at desc);

create index if not exists direct_threads_recipient_status_idx
  on public.direct_threads (recipient_id, status, created_at desc);

create index if not exists direct_threads_requester_status_idx
  on public.direct_threads (requester_id, status, created_at desc);

create index if not exists direct_threads_recipient_updated_idx
  on public.direct_threads (recipient_id, updated_at desc);

create index if not exists direct_threads_requester_updated_idx
  on public.direct_threads (requester_id, updated_at desc);

create index if not exists direct_messages_thread_created_idx
  on public.direct_messages (thread_key, created_at desc);

create index if not exists room_messages_room_created_idx
  on public.room_messages (room_id, created_at desc);

create index if not exists room_messages_user_created_idx
  on public.room_messages (user_id, created_at desc);

create index if not exists business_messages_business_created_idx
  on public.business_messages (business_id, created_at desc);

create index if not exists business_messages_user_created_idx
  on public.business_messages (user_id, created_at desc);

create index if not exists direct_messages_sender_created_idx
  on public.direct_messages (sender_id, created_at desc);

create index if not exists rooms_location_idx
  on public.rooms (latitude, longitude);

create index if not exists businesses_location_idx
  on public.businesses (latitude, longitude);

create index if not exists rooms_creator_created_idx
  on public.rooms (created_by, created_at desc);

create index if not exists businesses_owner_created_idx
  on public.businesses (owner_id, created_at desc);

create index if not exists business_offers_business_created_idx
  on public.business_offers (business_id, created_at desc);

create index if not exists menu_items_business_created_idx
  on public.menu_items (business_id, created_at desc);

create index if not exists reports_reporter_created_idx
  on public.reports (reporter_id, created_at desc);

create index if not exists reports_created_idx
  on public.reports (created_at desc);

create index if not exists appeal_requests_status_created_idx
  on public.appeal_requests (status, created_at desc);

create index if not exists bug_reports_user_created_idx
  on public.bug_reports (user_id, created_at desc);

create index if not exists bug_reports_created_idx
  on public.bug_reports (created_at desc);

create index if not exists orders_user_created_idx
  on public.orders (user_id, created_at desc);

create index if not exists orders_business_created_idx
  on public.orders (business_id, created_at desc);

create index if not exists orders_dropoff_status_created_idx
  on public.orders (dropoff_area_key, delivery_status, created_at desc);

create index if not exists orders_delivery_assignee_status_idx
  on public.orders (delivery_assignee_id, delivery_status, created_at desc);

create or replace function public.compute_level(xp int)
returns int
language plpgsql
immutable
as $$
declare
  level int := 1;
  threshold int := 2;
  remaining int := greatest(0, xp);
begin
  while remaining >= threshold loop
    remaining := remaining - threshold;
    level := level + 1;
    threshold := threshold * 2;
  end loop;
  return level;
end;
$$;

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
  update public.profiles
  set xp = coalesce(xp, 0) + 1,
      level = public.compute_level(coalesce(xp, 0) + 1)
  where id = auth.uid()
  returning xp, level into next_xp, next_level;

  if not found then
    insert into public.profiles (id, xp, level)
    values (auth.uid(), 1, public.compute_level(1))
    returning xp, level into next_xp, next_level;
  end if;

  return query select next_xp, next_level;
end;
$$;

create or replace function public.consume_chat_point()
returns table (
  ok boolean,
  remaining int,
  max_points int,
  shadowbanned boolean,
  u2u_locked boolean,
  notice text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_row public.profiles%rowtype;
  max_points_local int;
begin
  select * into profile_row
  from public.profiles
  where id = auth.uid()
  for update;

  if not found then
    return query select false, 0, 0, false, false, 'Profile not found.';
    return;
  end if;

  if profile_row.shadowbanned or profile_row.u2u_locked then
    max_points_local := greatest(0, 10 - coalesce(profile_row.chat_penalty, 0));
    return query select false, coalesce(profile_row.chat_points, 0), max_points_local, profile_row.shadowbanned, profile_row.u2u_locked, 'User-to-user access is locked.';
    return;
  end if;

  if profile_row.chat_points_day is null or profile_row.chat_points_day < current_date then
    if profile_row.chat_exhausted_day is not null and profile_row.chat_exhausted_day < current_date then
      profile_row.chat_penalty := least(10, coalesce(profile_row.chat_penalty, 0) + 1);
      profile_row.chat_exhausted_day := null;
    end if;
    max_points_local := greatest(0, 10 - coalesce(profile_row.chat_penalty, 0));
    profile_row.chat_points := max_points_local;
    profile_row.chat_points_day := current_date;
  end if;

  max_points_local := greatest(0, 10 - coalesce(profile_row.chat_penalty, 0));

  if coalesce(profile_row.chat_points, 0) <= 0 then
    if profile_row.chat_exhausted_day is null then
      profile_row.chat_exhausted_day := current_date;
    end if;
    if profile_row.chat_penalty >= 10 then
      profile_row.shadowbanned := true;
      profile_row.u2u_locked := true;
      profile_row.u2u_locked_at := now();
      profile_row.u2u_locked_reason := 'chat_points';
    end if;
    update public.profiles
    set chat_points = profile_row.chat_points,
        chat_points_day = profile_row.chat_points_day,
        chat_penalty = profile_row.chat_penalty,
        chat_exhausted_day = profile_row.chat_exhausted_day,
        shadowbanned = profile_row.shadowbanned,
        u2u_locked = profile_row.u2u_locked,
        u2u_locked_at = profile_row.u2u_locked_at,
        u2u_locked_reason = profile_row.u2u_locked_reason
    where id = profile_row.id;

    return query select false, coalesce(profile_row.chat_points, 0), max_points_local, profile_row.shadowbanned, profile_row.u2u_locked, 'No chat points left today.';
    return;
  end if;

  profile_row.chat_points := coalesce(profile_row.chat_points, 0) - 1;
  if profile_row.chat_points = 0 then
    profile_row.chat_exhausted_day := current_date;
  end if;

  update public.profiles
  set chat_points = profile_row.chat_points,
      chat_points_day = profile_row.chat_points_day,
      chat_penalty = profile_row.chat_penalty,
      chat_exhausted_day = profile_row.chat_exhausted_day
  where id = profile_row.id;

  return query select true, profile_row.chat_points, max_points_local, profile_row.shadowbanned, profile_row.u2u_locked, null;
end;
$$;

create or replace function public.accept_chat_request(p_thread_id uuid)
returns table (thread_id uuid, status text, message_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  thread_row public.direct_threads%rowtype;
  requester_row public.profiles%rowtype;
  max_points_local int;
begin
  select * into thread_row
  from public.direct_threads
  where id = p_thread_id
  for update;

  if not found then
    raise exception 'Thread not found';
  end if;

  if thread_row.recipient_id <> auth.uid() then
    raise exception 'Not allowed';
  end if;

  if thread_row.status <> 'pending' then
    return query select thread_row.id, thread_row.status, thread_row.message_count;
    return;
  end if;

  update public.direct_threads
  set status = 'accepted',
      accepted_at = now(),
      updated_at = now()
  where id = thread_row.id;

  insert into public.direct_messages (
    thread_key,
    sender_id,
    recipient_id,
    author_handle,
    body,
    created_at,
    expires_at
  )
  values (
    thread_row.thread_key,
    thread_row.requester_id,
    thread_row.recipient_id,
    thread_row.requester_handle,
    thread_row.request_message,
    now(),
    now() + interval '1 hour'
  );

  select * into requester_row
  from public.profiles
  where id = thread_row.requester_id
  for update;

  if found then
    if requester_row.chat_points_day is null or requester_row.chat_points_day < current_date then
      if requester_row.chat_exhausted_day is not null and requester_row.chat_exhausted_day < current_date then
        requester_row.chat_penalty := least(10, coalesce(requester_row.chat_penalty, 0) + 1);
        requester_row.chat_exhausted_day := null;
      end if;
      max_points_local := greatest(0, 10 - coalesce(requester_row.chat_penalty, 0));
      requester_row.chat_points := max_points_local;
      requester_row.chat_points_day := current_date;
    end if;

    max_points_local := greatest(0, 10 - coalesce(requester_row.chat_penalty, 0));
    requester_row.chat_points := least(max_points_local, coalesce(requester_row.chat_points, 0) + 1);

    update public.profiles
    set chat_points = requester_row.chat_points,
        chat_points_day = requester_row.chat_points_day,
        chat_penalty = requester_row.chat_penalty,
        chat_exhausted_day = requester_row.chat_exhausted_day
    where id = requester_row.id;
  end if;

  return query select thread_row.id, 'accepted', thread_row.message_count + 1;
end;
$$;

create or replace function public.reject_chat_request(p_thread_id uuid)
returns table (thread_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  thread_row public.direct_threads%rowtype;
begin
  select * into thread_row
  from public.direct_threads
  where id = p_thread_id
  for update;

  if not found then
    raise exception 'Thread not found';
  end if;

  if thread_row.recipient_id <> auth.uid() then
    raise exception 'Not allowed';
  end if;

  if thread_row.status <> 'pending' then
    return query select thread_row.id, thread_row.status;
    return;
  end if;

  update public.direct_threads
  set status = 'rejected',
      rejected_at = now(),
      updated_at = now()
  where id = thread_row.id;

  return query select thread_row.id, 'rejected';
end;
$$;

create or replace function public.approve_appeal(p_appeal_id uuid)
returns table (appeal_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  appeal_row public.appeal_requests%rowtype;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin = true) then
    raise exception 'Not allowed';
  end if;

  select * into appeal_row
  from public.appeal_requests
  where id = p_appeal_id
  for update;

  if not found then
    raise exception 'Appeal not found';
  end if;

  update public.appeal_requests
  set status = 'approved'
  where id = appeal_row.id;

  if appeal_row.user_id is not null then
    update public.profiles
    set u2u_locked = false,
        shadowbanned = false,
        chat_penalty = 0,
        chat_exhausted_day = null,
        chat_points = 10,
        chat_points_day = current_date,
        u2u_locked_at = null,
        u2u_locked_reason = null
    where id = appeal_row.user_id;
  end if;

  return query select appeal_row.id, 'approved';
end;
$$;

create or replace function public.reject_appeal(p_appeal_id uuid)
returns table (appeal_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  appeal_row public.appeal_requests%rowtype;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin = true) then
    raise exception 'Not allowed';
  end if;

  select * into appeal_row
  from public.appeal_requests
  where id = p_appeal_id
  for update;

  if not found then
    raise exception 'Appeal not found';
  end if;

  update public.appeal_requests
  set status = 'rejected'
  where id = appeal_row.id;

  return query select appeal_row.id, 'rejected';
end;
$$;

create or replace function public.handle_direct_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.direct_threads
  set message_count = message_count + 1,
      last_message = new.body,
      last_message_at = coalesce(new.created_at, now()),
      updated_at = now()
  where thread_key = new.thread_key;
  return new;
end;
$$;

drop trigger if exists direct_message_thread_update on public.direct_messages;
create trigger direct_message_thread_update
after insert on public.direct_messages
for each row
execute function public.handle_direct_message_insert();

create or replace function public.lock_user_u2u_from_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.target_type = 'user' then
    begin
      update public.profiles
      set u2u_locked = true,
          u2u_locked_at = now(),
          u2u_locked_reason = 'report'
      where id = new.target_id::uuid;
    exception when others then
      null;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists report_lock_u2u on public.reports;
create trigger report_lock_u2u
after insert on public.reports
for each row
execute function public.lock_user_u2u_from_report();

create or replace function public.check_rooms_insert_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  new.created_at := coalesce(new.created_at, now());
  if new.created_by is null then
    raise exception 'created_by required';
  end if;
  if auth.uid() is not null and auth.uid() <> new.created_by then
    raise exception 'Not allowed';
  end if;

  select count(*)
  into recent_count
  from public.rooms
  where created_by = new.created_by
    and created_at > now() - interval '10 minutes';

  if recent_count >= 2 then
    raise exception 'Too many rooms created. Try again later.';
  end if;
  return new;
end;
$$;

drop trigger if exists rooms_insert_rate_limit on public.rooms;
create trigger rooms_insert_rate_limit
before insert on public.rooms
for each row
execute function public.check_rooms_insert_rate_limit();

create or replace function public.check_businesses_insert_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  new.created_at := coalesce(new.created_at, now());
  if new.owner_id is null then
    raise exception 'owner_id required';
  end if;
  if auth.uid() is not null and auth.uid() <> new.owner_id then
    raise exception 'Not allowed';
  end if;

  select count(*)
  into recent_count
  from public.businesses
  where owner_id = new.owner_id
    and created_at > now() - interval '20 minutes';

  if recent_count >= 2 then
    raise exception 'Too many businesses created. Try again later.';
  end if;
  return new;
end;
$$;

drop trigger if exists businesses_insert_rate_limit on public.businesses;
create trigger businesses_insert_rate_limit
before insert on public.businesses
for each row
execute function public.check_businesses_insert_rate_limit();

create or replace function public.check_room_messages_insert_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  new.created_at := coalesce(new.created_at, now());
  if new.user_id is null then
    raise exception 'user_id required';
  end if;
  if auth.uid() is not null and auth.uid() <> new.user_id then
    raise exception 'Not allowed';
  end if;

  select count(*)
  into recent_count
  from public.room_messages
  where user_id = new.user_id
    and created_at > now() - interval '1 minute';

  if recent_count >= 6 then
    raise exception 'Slow down for a moment.';
  end if;
  return new;
end;
$$;

drop trigger if exists room_messages_insert_rate_limit on public.room_messages;
create trigger room_messages_insert_rate_limit
before insert on public.room_messages
for each row
execute function public.check_room_messages_insert_rate_limit();

create or replace function public.check_business_messages_insert_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  new.created_at := coalesce(new.created_at, now());
  if new.user_id is null then
    raise exception 'user_id required';
  end if;
  if auth.uid() is not null and auth.uid() <> new.user_id then
    raise exception 'Not allowed';
  end if;

  select count(*)
  into recent_count
  from public.business_messages
  where user_id = new.user_id
    and created_at > now() - interval '1 minute';

  if recent_count >= 6 then
    raise exception 'Slow down for a moment.';
  end if;
  return new;
end;
$$;

drop trigger if exists business_messages_insert_rate_limit on public.business_messages;
create trigger business_messages_insert_rate_limit
before insert on public.business_messages
for each row
execute function public.check_business_messages_insert_rate_limit();

create or replace function public.check_direct_messages_insert_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  new.created_at := coalesce(new.created_at, now());
  if new.sender_id is null then
    raise exception 'sender_id required';
  end if;
  if auth.uid() is not null and auth.uid() <> new.sender_id and auth.uid() <> new.recipient_id then
    raise exception 'Not allowed';
  end if;

  if auth.uid() is not null and auth.uid() = new.sender_id then
    select count(*)
    into recent_count
    from public.direct_messages
    where sender_id = new.sender_id
      and created_at > now() - interval '1 minute';

    if recent_count >= 6 then
      raise exception 'Slow down for a moment.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists direct_messages_insert_rate_limit on public.direct_messages;
create trigger direct_messages_insert_rate_limit
before insert on public.direct_messages
for each row
execute function public.check_direct_messages_insert_rate_limit();

create or replace function public.check_business_offers_insert_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
  owner_id uuid;
begin
  new.created_at := coalesce(new.created_at, now());
  if new.business_id is null then
    raise exception 'business_id required';
  end if;
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select businesses.owner_id
  into owner_id
  from public.businesses
  where id = new.business_id;

  if owner_id is null then
    raise exception 'Business not found';
  end if;
  if auth.uid() <> owner_id then
    raise exception 'Not allowed';
  end if;

  select count(*)
  into recent_count
  from public.business_offers offers
  join public.businesses businesses on businesses.id = offers.business_id
  where businesses.owner_id = owner_id
    and offers.created_at > now() - interval '30 minutes';

  if recent_count >= 3 then
    raise exception 'Too many offers created. Try again later.';
  end if;
  return new;
end;
$$;

drop trigger if exists business_offers_insert_rate_limit on public.business_offers;
create trigger business_offers_insert_rate_limit
before insert on public.business_offers
for each row
execute function public.check_business_offers_insert_rate_limit();

create or replace function public.check_menu_items_insert_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
  owner_id uuid;
begin
  new.created_at := coalesce(new.created_at, now());
  if new.business_id is null then
    raise exception 'business_id required';
  end if;
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select businesses.owner_id
  into owner_id
  from public.businesses
  where id = new.business_id;

  if owner_id is null then
    raise exception 'Business not found';
  end if;
  if auth.uid() <> owner_id then
    raise exception 'Not allowed';
  end if;

  select count(*)
  into recent_count
  from public.menu_items items
  join public.businesses businesses on businesses.id = items.business_id
  where businesses.owner_id = owner_id
    and items.created_at > now() - interval '30 minutes';

  if recent_count >= 8 then
    raise exception 'Too many menu items created. Try again later.';
  end if;
  return new;
end;
$$;

drop trigger if exists menu_items_insert_rate_limit on public.menu_items;
create trigger menu_items_insert_rate_limit
before insert on public.menu_items
for each row
execute function public.check_menu_items_insert_rate_limit();

create or replace function public.check_reports_insert_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  new.created_at := coalesce(new.created_at, now());
  if new.reporter_id is null then
    raise exception 'reporter_id required';
  end if;
  if auth.uid() is not null and auth.uid() <> new.reporter_id then
    raise exception 'Not allowed';
  end if;

  select count(*)
  into recent_count
  from public.reports
  where reporter_id = new.reporter_id
    and created_at > now() - interval '10 minutes';

  if recent_count >= 3 then
    raise exception 'Slow down for a moment.';
  end if;
  return new;
end;
$$;

drop trigger if exists reports_insert_rate_limit on public.reports;
create trigger reports_insert_rate_limit
before insert on public.reports
for each row
execute function public.check_reports_insert_rate_limit();

create or replace function public.check_posts_insert_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  new.created_at := coalesce(new.created_at, now());
  if new.user_id is null then
    raise exception 'user_id required';
  end if;
  if auth.uid() is not null and auth.uid() <> new.user_id then
    raise exception 'Not allowed';
  end if;

  select count(*)
  into recent_count
  from public.posts
  where user_id = new.user_id
    and created_at > now() - interval '10 minutes';

  if recent_count >= 4 then
    raise exception 'Too many posts created. Try again later.';
  end if;
  return new;
end;
$$;

drop trigger if exists posts_insert_rate_limit on public.posts;
create trigger posts_insert_rate_limit
before insert on public.posts
for each row
execute function public.check_posts_insert_rate_limit();

create or replace function public.check_orders_insert_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  new.created_at := coalesce(new.created_at, now());
  if new.user_id is null then
    raise exception 'user_id required';
  end if;
  if auth.uid() is not null and auth.uid() <> new.user_id then
    raise exception 'Not allowed';
  end if;

  select count(*)
  into recent_count
  from public.orders
  where user_id = new.user_id
    and created_at > now() - interval '30 minutes';

  if recent_count >= 5 then
    raise exception 'Too many orders created. Try again later.';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_insert_rate_limit on public.orders;
create trigger orders_insert_rate_limit
before insert on public.orders
for each row
execute function public.check_orders_insert_rate_limit();

create or replace function public.check_bug_reports_insert_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  new.created_at := coalesce(new.created_at, now());
  if new.user_id is null then
    return new;
  end if;
  if auth.uid() is not null and auth.uid() <> new.user_id then
    raise exception 'Not allowed';
  end if;

  select count(*)
  into recent_count
  from public.bug_reports
  where user_id = new.user_id
    and created_at > now() - interval '30 minutes';

  if recent_count >= 3 then
    raise exception 'Slow down for a moment.';
  end if;
  return new;
end;
$$;

drop trigger if exists bug_reports_insert_rate_limit on public.bug_reports;
create trigger bug_reports_insert_rate_limit
before insert on public.bug_reports
for each row
execute function public.check_bug_reports_insert_rate_limit();
