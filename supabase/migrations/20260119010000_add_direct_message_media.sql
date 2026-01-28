-- Add media fields for direct messages + update preview logic.

alter table if exists public.direct_messages
  add column if not exists media_type text,
  add column if not exists media_url text,
  add column if not exists media_meta jsonb;

do $$
begin
  if to_regclass('public.direct_messages') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'direct_messages_media_type_check'
        and conrelid = to_regclass('public.direct_messages')
    ) then
      alter table public.direct_messages
        add constraint direct_messages_media_type_check
        check (
          media_type is null
          or media_type in ('image', 'gif', 'video', 'audio', 'location')
        );
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'direct_messages_media_url_length'
        and conrelid = to_regclass('public.direct_messages')
    ) then
      alter table public.direct_messages
        add constraint direct_messages_media_url_length
        check (media_url is null or char_length(media_url) <= 500);
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'direct_messages_media_url_format'
        and conrelid = to_regclass('public.direct_messages')
    ) then
      alter table public.direct_messages
        add constraint direct_messages_media_url_format
        check (media_url is null or media_url ~* '^https?://');
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'direct_messages_media_require_url'
        and conrelid = to_regclass('public.direct_messages')
    ) then
      alter table public.direct_messages
        add constraint direct_messages_media_require_url
        check (
          (media_url is null and media_type is null)
          or (media_url is not null and media_type is not null)
        );
    end if;
  end if;
end $$;

create or replace function public.handle_direct_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  preview text;
begin
  if new.body is not null and length(btrim(new.body)) > 0 then
    preview := new.body;
  elsif new.media_type = 'image' then
    preview := '[Photo]';
  elsif new.media_type = 'gif' then
    preview := '[GIF]';
  elsif new.media_type = 'video' then
    preview := '[Video]';
  elsif new.media_type = 'audio' then
    preview := '[Voice note]';
  elsif new.media_type = 'location' then
    preview := '[Location]';
  else
    preview := null;
  end if;

  update public.direct_threads
  set message_count = message_count + 1,
      last_message = preview,
      last_message_at = coalesce(new.created_at, now()),
      updated_at = now()
  where thread_key = new.thread_key;
  return new;
end;
$$;
