-- Add city column for city-scoped business filtering

alter table public.businesses
  add column if not exists city text;

create index if not exists businesses_city_idx
  on public.businesses (city);
