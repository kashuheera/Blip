-- Account types, KYC storage, delivery options, and post location privacy (coarse)

alter table public.profiles
  add column if not exists account_type text not null default 'personal';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_account_type_check'
  ) then
    alter table public.profiles
      add constraint profiles_account_type_check check (account_type in ('personal', 'business'));
  end if;
end $$;

create index if not exists profiles_account_type_idx
  on public.profiles (account_type);

create or replace function public.is_business_account(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = p_user_id and account_type = 'business'
  );
$$;

create or replace function public.is_personal_account(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = p_user_id and account_type = 'personal'
  );
$$;

create or replace function public.has_business_permission(p_business_id uuid, p_perm text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (
      public.is_business_account(auth.uid())
      and (
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
      )
    )
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true);
$$;

create table if not exists public.user_private (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  address text,
  cnic text,
  id_doc_url text,
  kyc_status text not null default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists user_private_user_id_idx
  on public.user_private (user_id);

alter table public.user_private enable row level security;

drop policy if exists "User private viewable by owner" on public.user_private;
create policy "User private viewable by owner"
  on public.user_private for select
  using (auth.uid() = user_id);

drop policy if exists "User private insertable by owner" on public.user_private;
create policy "User private insertable by owner"
  on public.user_private for insert
  with check (auth.uid() = user_id);

drop policy if exists "User private updatable by owner" on public.user_private;
create policy "User private updatable by owner"
  on public.user_private for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "User private viewable by business for orders" on public.user_private;
create policy "User private viewable by business for orders"
  on public.user_private for select
  using (
    public.is_business_account(auth.uid())
    and exists (
      select 1
      from public.orders o
      join public.businesses b on b.id = o.business_id
      left join public.business_staff bs
        on bs.business_id = b.id
        and bs.user_id = auth.uid()
      where o.user_id = user_private.user_id
        and (b.owner_id = auth.uid() or bs.user_id = auth.uid())
    )
  );

alter table public.orders
  add column if not exists delivery_method text not null default 'pickup';

alter table public.orders
  add column if not exists delivery_address text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_delivery_method_check'
  ) then
    alter table public.orders
      add constraint orders_delivery_method_check check (delivery_method in ('pickup', 'delivery'));
  end if;
end $$;

alter table public.posts
  add column if not exists latitude double precision;

alter table public.posts
  add column if not exists longitude double precision;

-- Enforce business-only access for business admin writes
drop policy if exists "Owners can insert businesses" on public.businesses;
create policy "Owners can insert businesses"
  on public.businesses for insert
  with check (auth.uid() = owner_id and public.is_business_account(auth.uid()));

drop policy if exists "Owners can update businesses" on public.businesses;
create policy "Owners can update businesses"
  on public.businesses for update
  using (auth.uid() = owner_id and public.is_business_account(auth.uid()))
  with check (auth.uid() = owner_id and public.is_business_account(auth.uid()));

drop policy if exists "Business staff insertable by owner" on public.business_staff;
create policy "Business staff insertable by owner"
  on public.business_staff for insert
  with check (
    (
      auth.uid() = (select owner_id from public.businesses where id = business_id)
      and public.is_business_account(auth.uid())
    )
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

drop policy if exists "Business staff updatable by owner" on public.business_staff;
create policy "Business staff updatable by owner"
  on public.business_staff for update
  using (
    (
      auth.uid() = (select owner_id from public.businesses where id = business_id)
      and public.is_business_account(auth.uid())
    )
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  )
  with check (
    (
      auth.uid() = (select owner_id from public.businesses where id = business_id)
      and public.is_business_account(auth.uid())
    )
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

drop policy if exists "Business staff deletable by owner" on public.business_staff;
create policy "Business staff deletable by owner"
  on public.business_staff for delete
  using (
    (
      auth.uid() = (select owner_id from public.businesses where id = business_id)
      and public.is_business_account(auth.uid())
    )
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

drop policy if exists "Business hours exceptions insertable by owner" on public.business_hours_exceptions;
create policy "Business hours exceptions insertable by owner"
  on public.business_hours_exceptions for insert
  with check (
    public.is_business_account(auth.uid())
    and exists (
      select 1 from public.businesses
      where businesses.id = business_hours_exceptions.business_id
        and businesses.owner_id = auth.uid()
    )
  );

drop policy if exists "Business hours exceptions updatable by owner" on public.business_hours_exceptions;
create policy "Business hours exceptions updatable by owner"
  on public.business_hours_exceptions for update
  using (
    public.is_business_account(auth.uid())
    and exists (
      select 1 from public.businesses
      where businesses.id = business_hours_exceptions.business_id
        and businesses.owner_id = auth.uid()
    )
  )
  with check (
    public.is_business_account(auth.uid())
    and exists (
      select 1 from public.businesses
      where businesses.id = business_hours_exceptions.business_id
        and businesses.owner_id = auth.uid()
    )
  );

drop policy if exists "Business hours exceptions deletable by owner" on public.business_hours_exceptions;
create policy "Business hours exceptions deletable by owner"
  on public.business_hours_exceptions for delete
  using (
    public.is_business_account(auth.uid())
    and exists (
      select 1 from public.businesses
      where businesses.id = business_hours_exceptions.business_id
        and businesses.owner_id = auth.uid()
    )
  );

drop policy if exists "Business coupons insertable by owner" on public.business_coupons;
create policy "Business coupons insertable by owner"
  on public.business_coupons for insert
  with check (
    public.is_business_account(auth.uid())
    and exists (
      select 1 from public.businesses
      where businesses.id = business_coupons.business_id
        and businesses.owner_id = auth.uid()
    )
  );

drop policy if exists "Business coupons updatable by owner" on public.business_coupons;
create policy "Business coupons updatable by owner"
  on public.business_coupons for update
  using (
    public.is_business_account(auth.uid())
    and exists (
      select 1 from public.businesses
      where businesses.id = business_coupons.business_id
        and businesses.owner_id = auth.uid()
    )
  )
  with check (
    public.is_business_account(auth.uid())
    and exists (
      select 1 from public.businesses
      where businesses.id = business_coupons.business_id
        and businesses.owner_id = auth.uid()
    )
  );

drop policy if exists "Business coupons deletable by owner" on public.business_coupons;
create policy "Business coupons deletable by owner"
  on public.business_coupons for delete
  using (
    public.is_business_account(auth.uid())
    and exists (
      select 1 from public.businesses
      where businesses.id = business_coupons.business_id
        and businesses.owner_id = auth.uid()
    )
  );

-- Orders: personal buyers only, business owners/staff via permission checks
drop policy if exists "Orders viewable by buyer or owner" on public.orders;
create policy "Orders viewable by buyer or owner"
  on public.orders for select
  using (
    (auth.uid() = user_id and public.is_personal_account(auth.uid()))
    or public.has_business_permission(business_id, 'orders')
  );

drop policy if exists "Orders insertable by buyer" on public.orders;
create policy "Orders insertable by buyer"
  on public.orders for insert
  with check (auth.uid() = user_id and public.is_personal_account(auth.uid()));

drop policy if exists "Orders updatable by buyer or owner" on public.orders;
create policy "Orders updatable by buyer or owner"
  on public.orders for update
  using (
    (auth.uid() = user_id and public.is_personal_account(auth.uid()))
    or public.has_business_permission(business_id, 'orders')
  )
  with check (
    (auth.uid() = user_id and public.is_personal_account(auth.uid()))
    or public.has_business_permission(business_id, 'orders')
  );

drop policy if exists "Order items viewable by buyer or owner" on public.order_items;
create policy "Order items viewable by buyer or owner"
  on public.order_items for select
  using (
    (auth.uid() = (select user_id from public.orders where id = order_id)
      and public.is_personal_account(auth.uid()))
    or public.has_business_permission((select business_id from public.orders where id = order_id), 'orders')
  );

drop policy if exists "Order items insertable by buyer" on public.order_items;
create policy "Order items insertable by buyer"
  on public.order_items for insert
  with check (
    auth.uid() = (select user_id from public.orders where id = order_id)
    and public.is_personal_account(auth.uid())
  );

-- Post engagement: likes for personal accounts, replies for business accounts
drop policy if exists "Post comments insertable by owner" on public.post_comments;
create policy "Post comments insertable by owner"
  on public.post_comments for insert
  with check (
    auth.uid() = user_id
    and public.is_business_account(auth.uid())
  );

drop policy if exists "Post comments updatable by owner" on public.post_comments;
create policy "Post comments updatable by owner"
  on public.post_comments for update
  using (
    auth.uid() = user_id
    and public.is_business_account(auth.uid())
  )
  with check (
    auth.uid() = user_id
    and public.is_business_account(auth.uid())
  );

drop policy if exists "Post comments deletable by owner" on public.post_comments;
create policy "Post comments deletable by owner"
  on public.post_comments for delete
  using (
    auth.uid() = user_id
    and public.is_business_account(auth.uid())
  );

drop policy if exists "Post reactions insertable by owner" on public.post_reactions;
create policy "Post reactions insertable by owner"
  on public.post_reactions for insert
  with check (
    auth.uid() = user_id
    and public.is_personal_account(auth.uid())
  );

drop policy if exists "Post reactions updatable by owner" on public.post_reactions;
create policy "Post reactions updatable by owner"
  on public.post_reactions for update
  using (
    auth.uid() = user_id
    and public.is_personal_account(auth.uid())
  )
  with check (
    auth.uid() = user_id
    and public.is_personal_account(auth.uid())
  );

drop policy if exists "Post reactions deletable by owner" on public.post_reactions;
create policy "Post reactions deletable by owner"
  on public.post_reactions for delete
  using (
    auth.uid() = user_id
    and public.is_personal_account(auth.uid())
  );
