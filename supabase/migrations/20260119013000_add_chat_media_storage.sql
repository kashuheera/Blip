-- Create storage bucket + policies for chat media uploads.

insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "Chat media read" on storage.objects;
create policy "Chat media read"
on storage.objects
for select
using (bucket_id = 'chat-media');

drop policy if exists "Chat media insert" on storage.objects;
create policy "Chat media insert"
on storage.objects
for insert
with check (bucket_id = 'chat-media' and auth.role() = 'authenticated');

drop policy if exists "Chat media delete" on storage.objects;
create policy "Chat media delete"
on storage.objects
for delete
using (bucket_id = 'chat-media' and owner = auth.uid());
