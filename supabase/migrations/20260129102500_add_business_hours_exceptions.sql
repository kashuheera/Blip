create table if not exists public.business_hours_exceptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses (id) on delete cascade,
  date date not null,
  is_closed boolean default false,
  open_time text,
  close_time text,
  note text,
  created_at timestamptz default now()
);

create index if not exists business_hours_exceptions_business_id_idx
  on public.business_hours_exceptions (business_id);

alter table public.business_hours_exceptions enable row level security;

drop policy if exists "Business hours exceptions viewable" on public.business_hours_exceptions;
create policy "Business hours exceptions viewable"
  on public.business_hours_exceptions for select
  using (true);

drop policy if exists "Business hours exceptions insertable by owner" on public.business_hours_exceptions;
create policy "Business hours exceptions insertable by owner"
  on public.business_hours_exceptions for insert
  with check (
    exists (
      select 1 from public.businesses
      where businesses.id = business_hours_exceptions.business_id
        and businesses.owner_id = auth.uid()
    )
  );

drop policy if exists "Business hours exceptions updatable by owner" on public.business_hours_exceptions;
create policy "Business hours exceptions updatable by owner"
  on public.business_hours_exceptions for update
  using (
    exists (
      select 1 from public.businesses
      where businesses.id = business_hours_exceptions.business_id
        and businesses.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.businesses
      where businesses.id = business_hours_exceptions.business_id
        and businesses.owner_id = auth.uid()
    )
  );

drop policy if exists "Business hours exceptions deletable by owner" on public.business_hours_exceptions;
create policy "Business hours exceptions deletable by owner"
  on public.business_hours_exceptions for delete
  using (
    exists (
      select 1 from public.businesses
      where businesses.id = business_hours_exceptions.business_id
        and businesses.owner_id = auth.uid()
    )
  );
