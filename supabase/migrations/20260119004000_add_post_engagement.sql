create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  author_handle text,
  body text not null,
  created_at timestamptz default now(),
  constraint post_comments_body_length check (char_length(body) <= 280)
);

create table if not exists public.post_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  reaction text not null,
  created_at timestamptz default now(),
  unique (post_id, user_id),
  constraint post_reactions_reaction_length check (char_length(reaction) <= 16)
);

create table if not exists public.post_reposts (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz default now(),
  unique (post_id, user_id)
);

create table if not exists public.post_bookmarks (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz default now(),
  unique (post_id, user_id)
);

create index if not exists post_comments_post_created_idx
  on public.post_comments (post_id, created_at desc);

create index if not exists post_reactions_post_created_idx
  on public.post_reactions (post_id, created_at desc);

create index if not exists post_reposts_post_created_idx
  on public.post_reposts (post_id, created_at desc);

create index if not exists post_bookmarks_user_created_idx
  on public.post_bookmarks (user_id, created_at desc);

alter table public.post_comments enable row level security;
alter table public.post_reactions enable row level security;
alter table public.post_reposts enable row level security;
alter table public.post_bookmarks enable row level security;

drop policy if exists "Post comments viewable by anyone" on public.post_comments;
create policy "Post comments viewable by anyone"
on public.post_comments
for select
using (true);

drop policy if exists "Post comments insertable by owner" on public.post_comments;
create policy "Post comments insertable by owner"
on public.post_comments
for insert
with check (auth.uid() = user_id);

drop policy if exists "Post comments updatable by owner" on public.post_comments;
create policy "Post comments updatable by owner"
on public.post_comments
for update
using (auth.uid() = user_id);

drop policy if exists "Post comments deletable by owner" on public.post_comments;
create policy "Post comments deletable by owner"
on public.post_comments
for delete
using (auth.uid() = user_id);

drop policy if exists "Post reactions viewable by anyone" on public.post_reactions;
create policy "Post reactions viewable by anyone"
on public.post_reactions
for select
using (true);

drop policy if exists "Post reactions insertable by owner" on public.post_reactions;
create policy "Post reactions insertable by owner"
on public.post_reactions
for insert
with check (auth.uid() = user_id);

drop policy if exists "Post reactions updatable by owner" on public.post_reactions;
create policy "Post reactions updatable by owner"
on public.post_reactions
for update
using (auth.uid() = user_id);

drop policy if exists "Post reactions deletable by owner" on public.post_reactions;
create policy "Post reactions deletable by owner"
on public.post_reactions
for delete
using (auth.uid() = user_id);

drop policy if exists "Post reposts viewable by anyone" on public.post_reposts;
create policy "Post reposts viewable by anyone"
on public.post_reposts
for select
using (true);

drop policy if exists "Post reposts insertable by owner" on public.post_reposts;
create policy "Post reposts insertable by owner"
on public.post_reposts
for insert
with check (auth.uid() = user_id);

drop policy if exists "Post reposts deletable by owner" on public.post_reposts;
create policy "Post reposts deletable by owner"
on public.post_reposts
for delete
using (auth.uid() = user_id);

drop policy if exists "Post bookmarks viewable by owner" on public.post_bookmarks;
create policy "Post bookmarks viewable by owner"
on public.post_bookmarks
for select
using (auth.uid() = user_id);

drop policy if exists "Post bookmarks insertable by owner" on public.post_bookmarks;
create policy "Post bookmarks insertable by owner"
on public.post_bookmarks
for insert
with check (auth.uid() = user_id);

drop policy if exists "Post bookmarks deletable by owner" on public.post_bookmarks;
create policy "Post bookmarks deletable by owner"
on public.post_bookmarks
for delete
using (auth.uid() = user_id);
