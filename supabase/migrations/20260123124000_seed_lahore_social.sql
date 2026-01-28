begin;

with seed_users as (
  select id, current_handle, row_number() over (order by current_handle) as rn
  from public.profiles
  where current_handle like 'lahore_user_%'
  order by current_handle
  limit 50
),
room_candidates as (
  select
    rn,
    gen_random_uuid() as id,
    id as created_by,
    ('Lahore ' || (array[
      'Study Lounge',
      'Cafe Meetup',
      'Late Night Bites',
      'Gym Crew',
      'Market Walk',
      'Music Circle',
      'Gaming Hub',
      'Foodies Table',
      'Co-work Sprint',
      'Chai Stand',
      'Book Swap',
      'Wellness Hang'
    ])[((rn - 1) % 12) + 1]) as title,
    (array[
      'Study',
      'Cafe',
      'Food',
      'Fitness',
      'Market',
      'Music',
      'Gaming',
      'Dining',
      'Work',
      'Chai',
      'Books',
      'Wellness'
    ])[((rn - 1) % 12) + 1] as category,
    31.5204 + ((rn % 7) - 3) * 0.004 + ((rn % 3) - 1) * 0.001 as latitude,
    74.3587 + ((rn % 7) - 3) * 0.004 + ((rn % 4) - 2) * 0.001 as longitude,
    150 as radius_meters
  from seed_users
  where rn <= 18
),
inserted_rooms as (
  insert into public.rooms (id, title, category, latitude, longitude, radius_meters, created_by)
  select id, title, category, latitude, longitude, radius_meters, created_by
  from room_candidates
  on conflict do nothing
  returning id, created_by
)
insert into public.room_members (room_id, user_id)
select r.id, u.id
from inserted_rooms r
join room_candidates rc on rc.id = r.id
join seed_users u on u.rn between rc.rn and rc.rn + 2
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
  limit 18
)
insert into public.room_messages (room_id, user_id, author_handle, body, created_at)
select rm.id, u.id, u.current_handle,
  (array[
    'Anyone up for chai?',
    'Study group starts in 10.',
    'Who is joining for brunch?',
    'Meetup near Liberty in 20.',
    'Drop your best food spot.',
    'Late-night walk anyone?',
    'Need gym buddy for today.',
    'Good vibes only.'
  ])[((u.rn - 1) % 8) + 1] as body,
  now() - (rm.rn || ' minutes')::interval
from room_map rm
join seed_users u on u.rn = rm.rn
union all
select rm.id, u2.id, u2.current_handle,
  (array[
    'On my way.',
    'Pulling up in 5.',
    'Count me in.',
    'What time?',
    'Save me a spot.',
    'Sounds good.',
    'Let us roll.',
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
    'Best biryani in Lahore? Need recs.',
    'Looking for a late-night cafe.',
    'Anyone up for a Liberty walk?',
    'Trying to find a good study spot.',
    'Gym buddy in Johar Town?',
    'Favorite Gulberg brunch places?',
    'New to town, say hi!',
    'Where are the best kebabs?',
    'Any quiet cafes open late?',
    'Weekend food crawl ideas?',
    'Who is around Model Town?',
    'Rainy day chai meetup?'
  ])[((u.rn - 1) % 12) + 1] as body,
  '31.52:74.36',
  now() - (u.rn || ' minutes')::interval
from seed_users u
where u.rn <= 25;

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
  order by name
  limit 12
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
