create table if not exists public.business_reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  author_handle text,
  rating int not null,
  body text not null,
  photo_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (business_id, user_id),
  constraint business_reviews_rating_range check (rating between 1 and 5),
  constraint business_reviews_body_length check (char_length(body) <= 400)
);

create index if not exists business_reviews_business_created_idx
  on public.business_reviews (business_id, created_at desc);

create index if not exists business_reviews_user_created_idx
  on public.business_reviews (user_id, created_at desc);

alter table public.business_reviews enable row level security;

drop policy if exists "Business reviews viewable by anyone" on public.business_reviews;
create policy "Business reviews viewable by anyone"
on public.business_reviews
for select
using (true);

drop policy if exists "Business reviews insertable by owner" on public.business_reviews;
create policy "Business reviews insertable by owner"
on public.business_reviews
for insert
with check (auth.uid() = user_id);

drop policy if exists "Business reviews updatable by owner or admin" on public.business_reviews;
create policy "Business reviews updatable by owner or admin"
on public.business_reviews
for update
using (
  auth.uid() = user_id
  or exists (
    select 1 from public.profiles where id = auth.uid() and is_admin = true
  )
)
with check (
  auth.uid() = user_id
  or exists (
    select 1 from public.profiles where id = auth.uid() and is_admin = true
  )
);

drop policy if exists "Business reviews deletable by owner or admin" on public.business_reviews;
create policy "Business reviews deletable by owner or admin"
on public.business_reviews
for delete
using (
  auth.uid() = user_id
  or exists (
    select 1 from public.profiles where id = auth.uid() and is_admin = true
  )
);
