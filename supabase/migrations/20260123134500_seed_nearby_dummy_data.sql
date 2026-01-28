begin;

with seed_users as (
  select id, current_handle, row_number() over (order by current_handle) as rn
  from public.profiles
  where current_handle like 'lahore_user_%'
  order by current_handle
  limit 50
),
nearby_businesses as (
  select
    rn,
    id as owner_id,
    ('Nearby ' || (array[
      'Cafe',
      'Grill',
      'Biryani',
      'Burger',
      'Pizza',
      'Chai',
      'Bakery',
      'Kitchen',
      'Tandoor',
      'BBQ',
      'Dessert',
      'Diner',
      'Corner',
      'Spot',
      'Eatery',
      'Wok',
      'Wraps',
      'Bistro',
      'Station',
      'Hub'
    ])[((rn - 1) % 20) + 1]) as name,
    (array[
      'Pakistani',
      'BBQ',
      'Cafe',
      'Fast Food',
      'Biryani',
      'Grill'
    ])[((rn - 1) % 6) + 1] as category,
    31.4498226 + ((rn % 7) - 3) * 0.0012 as latitude,
    74.4353615 + ((rn % 6) - 3) * 0.0012 as longitude
  from seed_users
  where rn <= 20
)
insert into public.businesses (
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
  verification_status
)
select
  owner_id,
  name,
  category,
  array[category, 'Nearby'],
  array['Wi-Fi', 'Parking'],
  '9:00 AM - 11:00 PM',
  '+92 42 4' || lpad((1000000 + rn * 119)::text, 7, '0'),
  'Lahore',
  array['Pickup', 'Dine-in'],
  latitude,
  longitude,
  false,
  'unverified'
from nearby_businesses
on conflict do nothing;

with seed_users as (
  select id, current_handle, row_number() over (order by current_handle) as rn
  from public.profiles
  where current_handle like 'lahore_user_%'
  order by current_handle
  limit 50
),
nearby_rooms as (
  select
    rn,
    gen_random_uuid() as id,
    id as created_by,
    ('Nearby ' || (array[
      'Study Lounge',
      'Cafe Meetup',
      'Evening Walk',
      'Gym Crew',
      'Chai Stand',
      'Foodies Table',
      'Market Walk',
      'Music Circle',
      'Gaming Hub',
      'Book Swap',
      'Late Night Bites',
      'Wellness Hang',
      'Photo Walk',
      'Pickup Crew',
      'Late Snack',
      'Rooftop Chat',
      'Lan Party',
      'Dessert Run',
      'Tea Talk',
      'Workout'
    ])[((rn - 1) % 20) + 1]) as title,
    (array[
      'Study',
      'Cafe',
      'Food',
      'Fitness',
      'Chai',
      'Dining',
      'Market',
      'Music',
      'Gaming',
      'Books',
      'Food',
      'Wellness',
      'Photo',
      'Pickup',
      'Snack',
      'Chat',
      'Gaming',
      'Dessert',
      'Tea',
      'Workout'
    ])[((rn - 1) % 20) + 1] as category,
    31.4498226 + ((rn % 7) - 3) * 0.0011 as latitude,
    74.4353615 + ((rn % 6) - 3) * 0.0011 as longitude,
    140 as radius_meters
  from seed_users
  where rn <= 20
),
inserted_rooms as (
  insert into public.rooms (id, title, category, latitude, longitude, radius_meters, created_by)
  select id, title, category, latitude, longitude, radius_meters, created_by
  from nearby_rooms
  on conflict do nothing
  returning id
)
insert into public.room_members (room_id, user_id)
select r.id, u.id
from inserted_rooms r
join nearby_rooms nr on nr.id = r.id
join seed_users u on u.rn between nr.rn and nr.rn + 2
on conflict do nothing;

with seed_users as (
  select id, current_handle, row_number() over (order by current_handle) as rn
  from public.profiles
  where current_handle like 'lahore_user_%'
  order by current_handle
  limit 50
),
room_map as (
  select r.id, row_number() over (order by r.created_at desc) as rn
  from public.rooms r
  where r.created_by in (select id from seed_users)
  order by r.created_at desc
  limit 20
)
insert into public.room_messages (room_id, user_id, author_handle, body, created_at)
select rm.id, u.id, u.current_handle,
  (array[
    'Who is nearby?',
    'Coffee run in 10.',
    'Anyone free for a walk?',
    'Let us meet at the corner.',
    'Drop your best food spot.',
    'Late-night snack?',
    'Gym partner today?',
    'See you all soon.'
  ])[((u.rn - 1) % 8) + 1] as body,
  now() - (rm.rn || ' minutes')::interval
from room_map rm
join seed_users u on u.rn = rm.rn
union all
select rm.id, u2.id, u2.current_handle,
  (array[
    'On the way.',
    'Pulling up in 5.',
    'Count me in.',
    'What time?',
    'Save me a spot.',
    'Sounds good.',
    'Let us go.',
    'See you there.'
  ])[((u2.rn - 1) % 8) + 1] as body,
  now() - ((rm.rn + 3) || ' minutes')::interval
from room_map rm
join seed_users u2 on u2.rn = rm.rn + 1;

with seed_users as (
  select id, current_handle, row_number() over (order by current_handle) as rn
  from public.profiles
  where current_handle like 'lahore_user_%'
  order by current_handle
  limit 50
)
insert into public.posts (user_id, author_handle, body, area_key, created_at)
select
  u.id,
  u.current_handle,
  (array[
    'Best place nearby for chai?',
    'Any good brunch spots around here?',
    'Looking for a late-night cafe.',
    'Where can I get quick pickup?',
    'Any study spots close by?',
    'Craving kebabs, recs?',
    'Who is around for a walk?',
    'Need a gym buddy.',
    'Favorite pizza in the area?',
    'Rainy day chai meetup?'
  ])[((u.rn - 1) % 10) + 1] as body,
  '31.45:74.44',
  now() - (u.rn || ' minutes')::interval
from seed_users u
where u.rn <= 20;

with seed_users as (
  select id, current_handle, row_number() over (order by current_handle) as rn
  from public.profiles
  where current_handle like 'lahore_user_%'
  order by current_handle
  limit 50
),
seed_businesses as (
  select id, name, row_number() over (order by name) as rn
  from public.businesses
  where city ilike 'Lahore'
    and name ilike 'Nearby %'
  order by name
  limit 10
)
insert into public.business_messages (business_id, user_id, author_handle, body, created_at)
select
  b.id,
  u.id,
  u.current_handle,
  ('Is pickup available at ' || b.name || '?'),
  now() - (b.rn || ' minutes')::interval
from seed_businesses b
join seed_users u on u.rn = b.rn;

commit;
