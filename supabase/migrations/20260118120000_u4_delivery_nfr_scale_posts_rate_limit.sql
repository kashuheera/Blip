-- U4 + NFR-Scale: delivery fields, indexes, and posts rate limiting.

alter table public.orders
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

create index if not exists posts_user_created_idx
  on public.posts (user_id, created_at desc);

create index if not exists rooms_location_idx
  on public.rooms (latitude, longitude);

create index if not exists businesses_location_idx
  on public.businesses (latitude, longitude);

create index if not exists direct_messages_thread_created_idx
  on public.direct_messages (thread_key, created_at desc);

create index if not exists direct_threads_recipient_updated_idx
  on public.direct_threads (recipient_id, updated_at desc);

create index if not exists direct_threads_requester_updated_idx
  on public.direct_threads (requester_id, updated_at desc);

create index if not exists orders_dropoff_status_created_idx
  on public.orders (dropoff_area_key, delivery_status, created_at desc);

create index if not exists orders_delivery_assignee_status_idx
  on public.orders (delivery_assignee_id, delivery_status, created_at desc);

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
