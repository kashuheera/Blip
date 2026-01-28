-- BLIP business ownership policies.
-- Apply after creating public.businesses and auth.users.

alter table public.businesses
  add column if not exists owner_id uuid references auth.users (id);

alter table public.businesses enable row level security;

drop policy if exists "Businesses are viewable by anyone" on public.businesses;
create policy "Businesses are viewable by anyone"
on public.businesses
for select
using (true);

drop policy if exists "Owners can insert businesses" on public.businesses;
create policy "Owners can insert businesses"
on public.businesses
for insert
with check (auth.uid() = owner_id);

drop policy if exists "Owners can update businesses" on public.businesses;
create policy "Owners can update businesses"
on public.businesses
for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

alter table public.profiles enable row level security;
drop policy if exists "Profiles are viewable by owner" on public.profiles;
create policy "Profiles are viewable by owner"
on public.profiles
for select
using (auth.uid() = id);
drop policy if exists "Profiles are insertable by owner" on public.profiles;
create policy "Profiles are insertable by owner"
on public.profiles
for insert
with check (auth.uid() = id);
drop policy if exists "Profiles are updatable by owner" on public.profiles;
create policy "Profiles are updatable by owner"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

alter table public.handle_history enable row level security;
drop policy if exists "Handle history viewable by owner" on public.handle_history;
create policy "Handle history viewable by owner"
on public.handle_history
for select
using (auth.uid() = user_id);
drop policy if exists "Handle history insertable by owner" on public.handle_history;
create policy "Handle history insertable by owner"
on public.handle_history
for insert
with check (auth.uid() = user_id);

alter table public.business_messages enable row level security;
drop policy if exists "Business messages viewable by anyone" on public.business_messages;
create policy "Business messages viewable by anyone"
on public.business_messages
for select
using (true);
drop policy if exists "Business messages insertable by authed" on public.business_messages;
create policy "Business messages insertable by authed"
on public.business_messages
for insert
with check (auth.uid() = user_id);

alter table public.business_offers enable row level security;
drop policy if exists "Business offers viewable by anyone" on public.business_offers;
create policy "Business offers viewable by anyone"
on public.business_offers
for select
using (true);
drop policy if exists "Business offers editable by owner" on public.business_offers;
create policy "Business offers editable by owner"
on public.business_offers
for insert
with check (auth.uid() = (select owner_id from public.businesses where id = business_id));
drop policy if exists "Business offers updatable by owner" on public.business_offers;
create policy "Business offers updatable by owner"
on public.business_offers
for update
using (auth.uid() = (select owner_id from public.businesses where id = business_id))
with check (auth.uid() = (select owner_id from public.businesses where id = business_id));

alter table public.menu_items enable row level security;
drop policy if exists "Menu items viewable by anyone" on public.menu_items;
create policy "Menu items viewable by anyone"
on public.menu_items
for select
using (true);
drop policy if exists "Menu items insertable by owner" on public.menu_items;
create policy "Menu items insertable by owner"
on public.menu_items
for insert
with check (auth.uid() = (select owner_id from public.businesses where id = business_id));
drop policy if exists "Menu items updatable by owner" on public.menu_items;
create policy "Menu items updatable by owner"
on public.menu_items
for update
using (auth.uid() = (select owner_id from public.businesses where id = business_id))
with check (auth.uid() = (select owner_id from public.businesses where id = business_id));

alter table public.orders enable row level security;
drop policy if exists "Orders viewable by buyer or owner" on public.orders;
create policy "Orders viewable by buyer or owner"
on public.orders
for select
using (
  auth.uid() = user_id
  or auth.uid() = (select owner_id from public.businesses where id = business_id)
);
drop policy if exists "Orders insertable by buyer" on public.orders;
create policy "Orders insertable by buyer"
on public.orders
for insert
with check (auth.uid() = user_id);
drop policy if exists "Orders updatable by buyer or owner" on public.orders;
create policy "Orders updatable by buyer or owner"
on public.orders
for update
using (
  auth.uid() = user_id
  or auth.uid() = (select owner_id from public.businesses where id = business_id)
)
with check (
  auth.uid() = user_id
  or auth.uid() = (select owner_id from public.businesses where id = business_id)
);

alter table public.order_items enable row level security;
drop policy if exists "Order items viewable by buyer or owner" on public.order_items;
create policy "Order items viewable by buyer or owner"
on public.order_items
for select
using (
  auth.uid() = (select user_id from public.orders where id = order_id)
  or auth.uid() = (select owner_id from public.businesses where id = (select business_id from public.orders where id = order_id))
);
drop policy if exists "Order items insertable by buyer" on public.order_items;
create policy "Order items insertable by buyer"
on public.order_items
for insert
with check (auth.uid() = (select user_id from public.orders where id = order_id));

alter table public.rooms enable row level security;
drop policy if exists "Rooms viewable by anyone" on public.rooms;
create policy "Rooms viewable by anyone"
on public.rooms
for select
using (true);
drop policy if exists "Rooms insertable by authed" on public.rooms;
create policy "Rooms insertable by authed"
on public.rooms
for insert
with check (auth.uid() = created_by);

alter table public.room_messages enable row level security;
drop policy if exists "Room messages viewable by anyone" on public.room_messages;
create policy "Room messages viewable by anyone"
on public.room_messages
for select
using (true);
drop policy if exists "Room messages insertable by authed" on public.room_messages;
create policy "Room messages insertable by authed"
on public.room_messages
for insert
with check (auth.uid() = user_id);

alter table public.room_members enable row level security;
drop policy if exists "Room members viewable by anyone" on public.room_members;
create policy "Room members viewable by anyone"
on public.room_members
for select
using (true);
drop policy if exists "Room members insertable by authed" on public.room_members;
create policy "Room members insertable by authed"
on public.room_members
for insert
with check (auth.uid() = user_id);
drop policy if exists "Room members deletable by self" on public.room_members;
create policy "Room members deletable by self"
on public.room_members
for delete
using (auth.uid() = user_id);

alter table public.direct_messages enable row level security;
drop policy if exists "Direct messages viewable by participants" on public.direct_messages;
create policy "Direct messages viewable by participants"
on public.direct_messages
for select
using (auth.uid() = sender_id or auth.uid() = recipient_id);
drop policy if exists "Direct messages insertable by sender" on public.direct_messages;
create policy "Direct messages insertable by sender"
on public.direct_messages
for insert
with check (
  auth.uid() = sender_id
  and exists (
    select 1
    from public.direct_threads
    where direct_threads.thread_key = direct_messages.thread_key
      and direct_threads.status = 'accepted'
      and (direct_threads.requester_id = auth.uid() or direct_threads.recipient_id = auth.uid())
  )
  and not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and (u2u_locked = true or shadowbanned = true)
  )
);

alter table public.blocks enable row level security;
drop policy if exists "Blocks viewable by blocker" on public.blocks;
create policy "Blocks viewable by blocker"
on public.blocks
for select
using (auth.uid() = blocker_id);
drop policy if exists "Blocks insertable by blocker" on public.blocks;
create policy "Blocks insertable by blocker"
on public.blocks
for insert
with check (auth.uid() = blocker_id);
drop policy if exists "Blocks deletable by blocker" on public.blocks;
create policy "Blocks deletable by blocker"
on public.blocks
for delete
using (auth.uid() = blocker_id);

alter table public.reports enable row level security;
drop policy if exists "Reports insertable by authed" on public.reports;
create policy "Reports insertable by authed"
on public.reports
for insert
with check (auth.uid() = reporter_id);
drop policy if exists "Reports viewable by admins" on public.reports;
create policy "Reports viewable by admins"
on public.reports
for select
using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));
drop policy if exists "Reports updatable by admins" on public.reports;
create policy "Reports updatable by admins"
on public.reports
for update
using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

alter table public.direct_threads enable row level security;
drop policy if exists "Direct threads viewable by participants" on public.direct_threads;
create policy "Direct threads viewable by participants"
on public.direct_threads
for select
using (auth.uid() = requester_id or auth.uid() = recipient_id);
drop policy if exists "Direct threads insertable by requester" on public.direct_threads;
create policy "Direct threads insertable by requester"
on public.direct_threads
for insert
with check (
  auth.uid() = requester_id
  and not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and (u2u_locked = true or shadowbanned = true)
  )
);
drop policy if exists "Direct threads updatable by recipient" on public.direct_threads;
create policy "Direct threads updatable by recipient"
on public.direct_threads
for update
using (auth.uid() = recipient_id)
with check (auth.uid() = recipient_id);

alter table public.posts enable row level security;
drop policy if exists "Posts viewable by anyone" on public.posts;
create policy "Posts viewable by anyone"
on public.posts
for select
using (true);
drop policy if exists "Posts insertable by owner" on public.posts;
create policy "Posts insertable by owner"
on public.posts
for insert
with check (
  auth.uid() = user_id
  and not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and (u2u_locked = true or shadowbanned = true)
  )
);
drop policy if exists "Posts updatable by owner" on public.posts;
create policy "Posts updatable by owner"
on public.posts
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
drop policy if exists "Posts deletable by owner" on public.posts;
create policy "Posts deletable by owner"
on public.posts
for delete
using (auth.uid() = user_id);

alter table public.appeal_requests enable row level security;
drop policy if exists "Appeals insertable by owner" on public.appeal_requests;
create policy "Appeals insertable by owner"
on public.appeal_requests
for insert
with check (auth.uid() = user_id);
drop policy if exists "Appeals viewable by owner or admin" on public.appeal_requests;
create policy "Appeals viewable by owner or admin"
on public.appeal_requests
for select
using (
  auth.uid() = user_id
  or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);
drop policy if exists "Appeals updatable by admins" on public.appeal_requests;
create policy "Appeals updatable by admins"
on public.appeal_requests
for update
using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

alter table public.bug_reports enable row level security;
drop policy if exists "Bug reports insertable by anyone" on public.bug_reports;
create policy "Bug reports insertable by anyone"
on public.bug_reports
for insert
with check (user_id is null or auth.uid() = user_id);
drop policy if exists "Bug reports viewable by admins" on public.bug_reports;
create policy "Bug reports viewable by admins"
on public.bug_reports
for select
using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));
