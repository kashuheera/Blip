-- Add media fields for room/business messages.

alter table if exists public.room_messages
  add column if not exists media_type text,
  add column if not exists media_url text,
  add column if not exists media_meta jsonb;

alter table if exists public.business_messages
  add column if not exists media_type text,
  add column if not exists media_url text,
  add column if not exists media_meta jsonb;

do $$
begin
  if to_regclass('public.room_messages') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'room_messages_media_type_check'
        and conrelid = to_regclass('public.room_messages')
    ) then
      alter table public.room_messages
        add constraint room_messages_media_type_check
        check (
          media_type is null
          or media_type in ('image', 'gif', 'video', 'audio', 'location')
        );
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'room_messages_media_url_length'
        and conrelid = to_regclass('public.room_messages')
    ) then
      alter table public.room_messages
        add constraint room_messages_media_url_length
        check (media_url is null or char_length(media_url) <= 500);
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'room_messages_media_url_format'
        and conrelid = to_regclass('public.room_messages')
    ) then
      alter table public.room_messages
        add constraint room_messages_media_url_format
        check (media_url is null or media_url ~* '^https?://');
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'room_messages_media_require_url'
        and conrelid = to_regclass('public.room_messages')
    ) then
      alter table public.room_messages
        add constraint room_messages_media_require_url
        check (
          (media_url is null and media_type is null)
          or (media_url is not null and media_type is not null)
        );
    end if;
  end if;

  if to_regclass('public.business_messages') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'business_messages_media_type_check'
        and conrelid = to_regclass('public.business_messages')
    ) then
      alter table public.business_messages
        add constraint business_messages_media_type_check
        check (
          media_type is null
          or media_type in ('image', 'gif', 'video', 'audio', 'location')
        );
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'business_messages_media_url_length'
        and conrelid = to_regclass('public.business_messages')
    ) then
      alter table public.business_messages
        add constraint business_messages_media_url_length
        check (media_url is null or char_length(media_url) <= 500);
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'business_messages_media_url_format'
        and conrelid = to_regclass('public.business_messages')
    ) then
      alter table public.business_messages
        add constraint business_messages_media_url_format
        check (media_url is null or media_url ~* '^https?://');
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'business_messages_media_require_url'
        and conrelid = to_regclass('public.business_messages')
    ) then
      alter table public.business_messages
        add constraint business_messages_media_require_url
        check (
          (media_url is null and media_type is null)
          or (media_url is not null and media_type is not null)
        );
    end if;
  end if;
end $$;
