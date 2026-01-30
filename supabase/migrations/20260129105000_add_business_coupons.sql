create table if not exists public.business_coupons (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses (id) on delete cascade,
  code text not null,
  details text,
  active boolean default true,
  created_at timestamptz default now()
);

create index if not exists business_coupons_business_id_idx
  on public.business_coupons (business_id);

alter table public.business_coupons enable row level security;

drop policy if exists "Business coupons viewable" on public.business_coupons;
create policy "Business coupons viewable"
  on public.business_coupons for select
  using (true);

drop policy if exists "Business coupons insertable by owner" on public.business_coupons;
create policy "Business coupons insertable by owner"
  on public.business_coupons for insert
  with check (
    exists (
      select 1 from public.businesses
      where businesses.id = business_coupons.business_id
        and businesses.owner_id = auth.uid()
    )
  );

drop policy if exists "Business coupons updatable by owner" on public.business_coupons;
create policy "Business coupons updatable by owner"
  on public.business_coupons for update
  using (
    exists (
      select 1 from public.businesses
      where businesses.id = business_coupons.business_id
        and businesses.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.businesses
      where businesses.id = business_coupons.business_id
        and businesses.owner_id = auth.uid()
    )
  );

drop policy if exists "Business coupons deletable by owner" on public.business_coupons;
create policy "Business coupons deletable by owner"
  on public.business_coupons for delete
  using (
    exists (
      select 1 from public.businesses
      where businesses.id = business_coupons.business_id
        and businesses.owner_id = auth.uid()
    )
  );
