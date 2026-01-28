-- Business staff lookup by email + audit log for business admin actions

create table if not exists public.business_audit_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  detail jsonb,
  created_at timestamptz default now()
);

create index if not exists business_audit_log_business_id_idx
  on public.business_audit_log (business_id, created_at desc);

create index if not exists business_audit_log_actor_id_idx
  on public.business_audit_log (actor_id);

alter table public.business_audit_log enable row level security;

drop policy if exists "Business audit viewable by owner or staff" on public.business_audit_log;
create policy "Business audit viewable by owner or staff"
on public.business_audit_log
for select
using (
  auth.uid() = (select owner_id from public.businesses where id = business_id)
  or exists (
    select 1 from public.business_staff as bs
    where bs.business_id = business_audit_log.business_id
      and bs.user_id = auth.uid()
  )
  or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

create or replace function public.record_business_audit(
  p_business_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_detail jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.business_audit_log (
    business_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    detail
  ) values (
    p_business_id,
    auth.uid(),
    p_action,
    p_entity_type,
    p_entity_id,
    p_detail
  );
end;
$$;

create or replace function public.audit_business_staff_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    perform public.record_business_audit(
      new.business_id,
      'staff_added',
      'business_staff',
      new.id::text,
      jsonb_build_object('user_id', new.user_id, 'role', new.role, 'permissions', new.permissions)
    );
    return new;
  elsif (tg_op = 'UPDATE') then
    perform public.record_business_audit(
      new.business_id,
      'staff_updated',
      'business_staff',
      new.id::text,
      jsonb_build_object(
        'user_id', new.user_id,
        'role', new.role,
        'permissions', new.permissions,
        'previous_role', old.role,
        'previous_permissions', old.permissions
      )
    );
    return new;
  else
    perform public.record_business_audit(
      old.business_id,
      'staff_removed',
      'business_staff',
      old.id::text,
      jsonb_build_object('user_id', old.user_id, 'role', old.role, 'permissions', old.permissions)
    );
    return old;
  end if;
end;
$$;

drop trigger if exists business_staff_audit on public.business_staff;
create trigger business_staff_audit
after insert or update or delete on public.business_staff
for each row execute function public.audit_business_staff_change();

create or replace function public.audit_menu_item_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    perform public.record_business_audit(
      new.business_id,
      'menu_added',
      'menu_items',
      new.id::text,
      jsonb_build_object('name', new.name, 'price_cents', new.price_cents, 'available', new.available)
    );
    return new;
  elsif (tg_op = 'UPDATE') then
    perform public.record_business_audit(
      new.business_id,
      'menu_updated',
      'menu_items',
      new.id::text,
      jsonb_build_object(
        'name', new.name,
        'price_cents', new.price_cents,
        'available', new.available,
        'previous_name', old.name,
        'previous_price_cents', old.price_cents,
        'previous_available', old.available
      )
    );
    return new;
  else
    perform public.record_business_audit(
      old.business_id,
      'menu_removed',
      'menu_items',
      old.id::text,
      jsonb_build_object('name', old.name, 'price_cents', old.price_cents)
    );
    return old;
  end if;
end;
$$;

drop trigger if exists menu_items_audit on public.menu_items;
create trigger menu_items_audit
after insert or update or delete on public.menu_items
for each row execute function public.audit_menu_item_change();

create or replace function public.audit_offer_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    perform public.record_business_audit(
      new.business_id,
      'offer_added',
      'business_offers',
      new.id::text,
      jsonb_build_object('title', new.title, 'details', new.details)
    );
    return new;
  elsif (tg_op = 'UPDATE') then
    perform public.record_business_audit(
      new.business_id,
      'offer_updated',
      'business_offers',
      new.id::text,
      jsonb_build_object(
        'title', new.title,
        'details', new.details,
        'previous_title', old.title,
        'previous_details', old.details
      )
    );
    return new;
  else
    perform public.record_business_audit(
      old.business_id,
      'offer_removed',
      'business_offers',
      old.id::text,
      jsonb_build_object('title', old.title, 'details', old.details)
    );
    return old;
  end if;
end;
$$;

drop trigger if exists business_offers_audit on public.business_offers;
create trigger business_offers_audit
after insert or update or delete on public.business_offers
for each row execute function public.audit_offer_change();

create or replace function public.audit_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'UPDATE' and new.status is distinct from old.status) then
    perform public.record_business_audit(
      new.business_id,
      'order_status_updated',
      'orders',
      new.id::text,
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists orders_status_audit on public.orders;
create trigger orders_status_audit
after update on public.orders
for each row execute function public.audit_order_status_change();

create or replace function public.lookup_business_staff_by_email(
  p_business_id uuid,
  p_email text
)
returns table (user_id uuid, email text, current_handle text)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if p_email is null or length(trim(p_email)) = 0 then
    return;
  end if;

  if not public.has_business_permission(p_business_id, 'staff') then
    raise exception 'not authorized';
  end if;

  return query
  select u.id, u.email, p.current_handle
  from auth.users as u
  left join public.profiles as p on p.id = u.id
  where lower(u.email) = lower(p_email)
  limit 1;
end;
$$;
