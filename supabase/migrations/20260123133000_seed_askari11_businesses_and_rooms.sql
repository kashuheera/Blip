begin;

with seed_users as (
  select id, current_handle, row_number() over (order by current_handle) as rn
  from public.profiles
  where current_handle like 'lahore_user_%'
  order by current_handle
  limit 50
),
askari_businesses as (
  select
    rn,
    id as owner_id,
    ('Askari 11 ' || (array[
      'Grill House',
      'Cafe Point',
      'Biryani Corner',
      'Tandoor Hub',
      'Burger Joint',
      'Pizza Lab',
      'Chai Spot',
      'Breakfast Club',
      'Dessert Bar',
      'Spice Kitchen',
      'Kebab Express',
      'Garden Diner'
    ])[((rn - 1) % 12) + 1]) as name,
    (array[
      'Pakistani',
      'BBQ',
      'Cafe',
      'Fast Food',
      'Biryani',
      'Grill'
    ])[((rn - 1) % 6) + 1] as category,
    31.4865 + ((rn % 6) - 3) * 0.0015 as latitude,
    74.4180 + ((rn % 5) - 2) * 0.0015 as longitude
  from seed_users
  where rn <= 12
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
  array[category, 'Askari 11'],
  array['Wi-Fi', 'Parking'],
  '9:00 AM - 11:00 PM',
  '+92 42 3' || lpad((1000000 + rn * 137)::text, 7, '0'),
  'Lahore',
  array['Pickup', 'Dine-in'],
  latitude,
  longitude,
  false,
  'unverified'
from askari_businesses
on conflict do nothing;

with seed_users as (
  select id, current_handle, row_number() over (order by current_handle) as rn
  from public.profiles
  where current_handle like 'lahore_user_%'
  order by current_handle
  limit 50
),
askari_rooms as (
  select
    rn,
    gen_random_uuid() as id,
    id as created_by,
    ('Askari 11 ' || (array[
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
      'Wellness Hang'
    ])[((rn - 1) % 12) + 1]) as title,
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
      'Wellness'
    ])[((rn - 1) % 12) + 1] as category,
    31.4865 + ((rn % 6) - 3) * 0.0012 as latitude,
    74.4180 + ((rn % 5) - 2) * 0.0012 as longitude,
    140 as radius_meters
  from seed_users
  where rn <= 15
),
inserted_rooms as (
  insert into public.rooms (id, title, category, latitude, longitude, radius_meters, created_by)
  select id, title, category, latitude, longitude, radius_meters, created_by
  from askari_rooms
  on conflict do nothing
  returning id
)
insert into public.room_members (room_id, user_id)
select r.id, u.id
from inserted_rooms r
join askari_rooms ar on ar.id = r.id
join seed_users u on u.rn between ar.rn and ar.rn + 2
on conflict do nothing;

commit;
