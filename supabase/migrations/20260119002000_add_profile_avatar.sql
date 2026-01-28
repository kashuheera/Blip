-- Add avatar URL to profiles.

alter table public.profiles
  add column if not exists avatar_url text;

