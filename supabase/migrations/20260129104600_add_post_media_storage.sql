-- Create storage bucket + policies for post media uploads.

insert into storage.buckets (id, name, public)
values ('post-media', 'post-media', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "Post media read" on storage.objects;
create policy "Post media read"
on storage.objects
for select
using (bucket_id = 'post-media');

drop policy if exists "Post media insert" on storage.objects;
create policy "Post media insert"
on storage.objects
for insert
with check (bucket_id = 'post-media' and auth.role() = 'authenticated');

drop policy if exists "Post media delete" on storage.objects;
create policy "Post media delete"
on storage.objects
for delete
using (bucket_id = 'post-media' and owner = auth.uid());
