alter table public.businesses
  add column if not exists description text,
  add column if not exists hero_image_url text;
