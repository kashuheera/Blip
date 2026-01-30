-- Add media fields for posts.

alter table if exists public.posts
  add column if not exists media_type text,
  add column if not exists media_url text,
  add column if not exists media_meta jsonb;

do $$
begin
  if to_regclass('public.posts') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'posts_media_type_check'
        and conrelid = to_regclass('public.posts')
    ) then
      alter table public.posts
        add constraint posts_media_type_check
        check (
          media_type is null
          or media_type in ('image', 'gif', 'video', 'audio', 'location')
        );
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'posts_media_url_length'
        and conrelid = to_regclass('public.posts')
    ) then
      alter table public.posts
        add constraint posts_media_url_length
        check (media_url is null or char_length(media_url) <= 500);
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'posts_media_url_format'
        and conrelid = to_regclass('public.posts')
    ) then
      alter table public.posts
        add constraint posts_media_url_format
        check (media_url is null or media_url ~* '^https?://');
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'posts_media_require_url'
        and conrelid = to_regclass('public.posts')
    ) then
      alter table public.posts
        add constraint posts_media_require_url
        check (
          (media_url is null and media_type is null)
          or (media_url is not null and media_type is not null)
        );
    end if;
  end if;
end $$;
