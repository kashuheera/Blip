create table if not exists public.business_reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  author_handle text,
  rating int not null check (rating >= 1 and rating <= 5),
  body text,
  created_at timestamptz default now()
);

create index if not exists business_reviews_business_id_idx on public.business_reviews (business_id);

alter table public.business_reviews enable row level security;

drop policy if exists "Business reviews are viewable" on public.business_reviews;
create policy "Business reviews are viewable"
  on public.business_reviews for select
  using (true);

drop policy if exists "Business reviews are insertable by author" on public.business_reviews;
create policy "Business reviews are insertable by author"
  on public.business_reviews for insert
  with check (auth.uid() = user_id);
