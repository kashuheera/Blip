begin;

-- Seed: Mahmood Pharmacy (Askari XI, Lahore)
-- Source: https://www.google.com/maps/place/Mahmood+Pharmacy/@31.4510126,74.4317545,... (coordinates from place pin)

-- Seed as an "authenticated" user so rate-limit triggers allow inserts (auth.uid() is used).
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'bde5ba1b-aa0d-401b-a3c1-6dc971b8f5fb', true);

insert into public.businesses (
  id,
  owner_id,
  name,
  category,
  categories,
  amenities,
  hours,
  phone,
  city,
  flags,
  latitude,
  longitude,
  verified,
  verification_status,
  description,
  hero_image_url,
  featured_item_name,
  featured_item_price_cents,
  pin_icon_url
)
select
  '2a2dfb6f-0b53-4ad2-a7d1-7e5c01902f6c',
  -- Use an existing seeded Lahore demo user so FK + triggers are satisfied.
  'bde5ba1b-aa0d-401b-a3c1-6dc971b8f5fb',
  'Mahmood Pharmacy',
  'Grocery',
  array['Pharmacy', 'Health', 'Askari 11'],
  array['Delivery', 'Pickup'],
  '24/7',
  null,
  'Lahore',
  array['Pickup', 'Delivery'],
  31.4525218,
  74.4331413,
  false,
  'unverified',
  'Local pharmacy for prescriptions and OTC essentials in Askari 11.',
  'https://images.unsplash.com/photo-1580281658628-bd1b1f1e5d0b?auto=format&fit=crop&w=1200&q=80',
  'Pain relief essentials',
  199,
  'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f48a.png'
where not exists (
  select 1 from public.businesses where id = '2a2dfb6f-0b53-4ad2-a7d1-7e5c01902f6c'
);

-- These triggers enforce per-user rate limits using auth.uid(), which is not set during migrations.
alter table public.menu_items disable trigger menu_items_insert_rate_limit;
alter table public.business_offers disable trigger business_offers_insert_rate_limit;

-- Seed a few "menu" items (pharmacy catalog for demo).
insert into public.menu_items (business_id, name, description, price_cents, available)
select
  '2a2dfb6f-0b53-4ad2-a7d1-7e5c01902f6c',
  entry.name,
  entry.description,
  entry.price_cents,
  true
from (
  values
    ('Paracetamol 500mg (10 tablets)', 'General pain & fever relief.', 120),
    ('Ibuprofen 200mg (10 tablets)', 'Anti-inflammatory pain relief.', 180),
    ('ORS Sachet', 'Hydration support.', 90),
    ('Vitamin C (30 tablets)', 'Everyday immunity support.', 450),
    ('Hand Sanitizer 250ml', 'Alcohol-based sanitizer.', 260),
    ('Digital Thermometer', 'Fast temperature readings.', 650)
) as entry(name, description, price_cents)
where not exists (
  select 1
  from public.menu_items
  where business_id = '2a2dfb6f-0b53-4ad2-a7d1-7e5c01902f6c'
    and name = entry.name
);

insert into public.business_offers (business_id, title, details, starts_at, ends_at)
select
  '2a2dfb6f-0b53-4ad2-a7d1-7e5c01902f6c',
  'Askari 11 quick pickup',
  'Order in-app and pick up in minutes (demo).',
  now(),
  now() + interval '30 days'
where not exists (
  select 1
  from public.business_offers
  where business_id = '2a2dfb6f-0b53-4ad2-a7d1-7e5c01902f6c'
    and title = 'Askari 11 quick pickup'
);

insert into public.business_coupons (business_id, code, details, active)
select
  '2a2dfb6f-0b53-4ad2-a7d1-7e5c01902f6c',
  'ASKARI11',
  'Demo coupon for Askari 11 orders (placeholder).',
  true
where not exists (
  select 1
  from public.business_coupons
  where business_id = '2a2dfb6f-0b53-4ad2-a7d1-7e5c01902f6c'
    and code = 'ASKARI11'
);

alter table public.menu_items enable trigger menu_items_insert_rate_limit;
alter table public.business_offers enable trigger business_offers_insert_rate_limit;

commit;
