-- Business staff roles + permissions for admin portal

create table if not exists public.business_staff (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  role text not null check (role in ('manager', 'staff')),
  permissions text[] not null default '{}',
  invited_by uuid references auth.users (id),
  created_at timestamptz default now(),
  unique (business_id, user_id),
  check (permissions <@ array['menu','offers','orders','messages','staff']::text[])
);

create index if not exists business_staff_business_id_idx
  on public.business_staff (business_id);

create index if not exists business_staff_user_id_idx
  on public.business_staff (user_id);

alter table public.business_staff enable row level security;

drop policy if exists "Business staff viewable by owner or staff" on public.business_staff;
create policy "Business staff viewable by owner or staff"
on public.business_staff
for select
using (
  auth.uid() = user_id
  or auth.uid() = (select owner_id from public.businesses where id = business_id)
  or exists (
    select 1 from public.business_staff as bs
    where bs.business_id = business_staff.business_id
      and bs.user_id = auth.uid()
  )
  or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

drop policy if exists "Business staff insertable by owner" on public.business_staff;
create policy "Business staff insertable by owner"
on public.business_staff
for insert
with check (
  auth.uid() = (select owner_id from public.businesses where id = business_id)
  or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

drop policy if exists "Business staff updatable by owner" on public.business_staff;
create policy "Business staff updatable by owner"
on public.business_staff
for update
using (
  auth.uid() = (select owner_id from public.businesses where id = business_id)
  or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
)
with check (
  auth.uid() = (select owner_id from public.businesses where id = business_id)
  or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

drop policy if exists "Business staff deletable by owner" on public.business_staff;
create policy "Business staff deletable by owner"
on public.business_staff
for delete
using (
  auth.uid() = (select owner_id from public.businesses where id = business_id)
  or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

create or replace function public.has_business_permission(p_business_id uuid, p_perm text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() = (select owner_id from public.businesses where id = p_business_id)
    or exists (
      select 1 from public.business_staff
      where business_id = p_business_id
        and user_id = auth.uid()
        and (
          role = 'manager'
          or permissions @> array[p_perm]::text[]
        )
    )
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true);
$$;

-- Extend policies for staff permissions

drop policy if exists "Business offers editable by owner" on public.business_offers;
create policy "Business offers editable by owner"
on public.business_offers
for insert
with check (public.has_business_permission(business_id, 'offers'));

drop policy if exists "Business offers updatable by owner" on public.business_offers;
create policy "Business offers updatable by owner"
on public.business_offers
for update
using (public.has_business_permission(business_id, 'offers'))
with check (public.has_business_permission(business_id, 'offers'));

drop policy if exists "Business offers deletable by owner" on public.business_offers;
create policy "Business offers deletable by owner"
on public.business_offers
for delete
using (public.has_business_permission(business_id, 'offers'));

drop policy if exists "Menu items insertable by owner" on public.menu_items;
create policy "Menu items insertable by owner"
on public.menu_items
for insert
with check (public.has_business_permission(business_id, 'menu'));

drop policy if exists "Menu items updatable by owner" on public.menu_items;
create policy "Menu items updatable by owner"
on public.menu_items
for update
using (public.has_business_permission(business_id, 'menu'))
with check (public.has_business_permission(business_id, 'menu'));

drop policy if exists "Menu items deletable by owner" on public.menu_items;
create policy "Menu items deletable by owner"
on public.menu_items
for delete
using (public.has_business_permission(business_id, 'menu'));

drop policy if exists "Orders viewable by buyer or owner" on public.orders;
create policy "Orders viewable by buyer or owner"
on public.orders
for select
using (
  auth.uid() = user_id
  or auth.uid() = (select owner_id from public.businesses where id = business_id)
  or public.has_business_permission(business_id, 'orders')
);

drop policy if exists "Orders updatable by buyer or owner" on public.orders;
create policy "Orders updatable by buyer or owner"
on public.orders
for update
using (
  auth.uid() = user_id
  or auth.uid() = (select owner_id from public.businesses where id = business_id)
  or public.has_business_permission(business_id, 'orders')
)
with check (
  auth.uid() = user_id
  or auth.uid() = (select owner_id from public.businesses where id = business_id)
  or public.has_business_permission(business_id, 'orders')
);

drop policy if exists "Order items viewable by buyer or owner" on public.order_items;
create policy "Order items viewable by buyer or owner"
on public.order_items
for select
using (
  auth.uid() = (select user_id from public.orders where id = order_id)
  or auth.uid() = (select owner_id from public.businesses where id = (select business_id from public.orders where id = order_id))
  or public.has_business_permission((select business_id from public.orders where id = order_id), 'orders')
);
