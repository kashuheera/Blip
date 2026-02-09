begin;

-- Fix PL/pgSQL variable/column ambiguity in rate-limit triggers.
-- Some environments run with plpgsql.variable_conflict = error, so unqualified
-- references like `owner_id` can be ambiguous (variable vs table column).

create or replace function public.check_business_offers_insert_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
  business_owner_id uuid;
begin
  new.created_at := coalesce(new.created_at, now());
  if new.business_id is null then
    raise exception 'business_id required';
  end if;
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select businesses.owner_id
  into business_owner_id
  from public.businesses
  where id = new.business_id;

  if business_owner_id is null then
    raise exception 'Business not found';
  end if;
  if auth.uid() <> business_owner_id then
    raise exception 'Not allowed';
  end if;

  select count(*)
  into recent_count
  from public.business_offers offers
  join public.businesses businesses on businesses.id = offers.business_id
  where businesses.owner_id = business_owner_id
    and offers.created_at > now() - interval '30 minutes';

  if recent_count >= 3 then
    raise exception 'Too many offers created. Try again later.';
  end if;
  return new;
end;
$$;

create or replace function public.check_menu_items_insert_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
  business_owner_id uuid;
begin
  new.created_at := coalesce(new.created_at, now());
  if new.business_id is null then
    raise exception 'business_id required';
  end if;
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select businesses.owner_id
  into business_owner_id
  from public.businesses
  where id = new.business_id;

  if business_owner_id is null then
    raise exception 'Business not found';
  end if;
  if auth.uid() <> business_owner_id then
    raise exception 'Not allowed';
  end if;

  select count(*)
  into recent_count
  from public.menu_items items
  join public.businesses businesses on businesses.id = items.business_id
  where businesses.owner_id = business_owner_id
    and items.created_at > now() - interval '30 minutes';

  if recent_count >= 8 then
    raise exception 'Too many menu items created. Try again later.';
  end if;
  return new;
end;
$$;

commit;

