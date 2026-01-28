alter table profiles
  add column if not exists interests text[] default '{}'::text[];

update profiles
set interests = '{}'::text[]
where interests is null;
