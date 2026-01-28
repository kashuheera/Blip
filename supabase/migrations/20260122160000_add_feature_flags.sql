-- Feature flags for Blip Admin Portal

create table if not exists public.feature_flags (
  key text primary key,
  enabled boolean not null default true,
  description text,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz default now()
);

alter table public.feature_flags enable row level security;

drop policy if exists "Feature flags readable by all" on public.feature_flags;
create policy "Feature flags readable by all"
on public.feature_flags
for select
using (true);

drop policy if exists "Feature flags insertable by admin" on public.feature_flags;
create policy "Feature flags insertable by admin"
on public.feature_flags
for insert
with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

drop policy if exists "Feature flags updatable by admin" on public.feature_flags;
create policy "Feature flags updatable by admin"
on public.feature_flags
for update
using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

drop policy if exists "Feature flags deletable by admin" on public.feature_flags;
create policy "Feature flags deletable by admin"
on public.feature_flags
for delete
using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

create or replace function public.touch_feature_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists feature_flags_touch on public.feature_flags;
create trigger feature_flags_touch
before insert or update on public.feature_flags
for each row execute function public.touch_feature_flag();

insert into public.feature_flags (key, enabled, description) values
  ('feed_enabled', true, 'Enable the Discover feed.'),
  ('create_enabled', true, 'Enable creation (posts/rooms/businesses).'),
  ('messages_enabled', true, 'Enable room/business/DM messaging.'),
  ('orders_enabled', true, 'Enable ordering flow and order views.'),
  ('rooms_enabled', true, 'Enable room creation and visibility.'),
  ('businesses_enabled', true, 'Enable business creation and visibility.'),
  ('reviews_enabled', true, 'Enable business reviews and ratings.')
on conflict (key) do nothing;
