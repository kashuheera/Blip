-- N1: Server-side rate limiting + paging support (indexes + triggers).

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
