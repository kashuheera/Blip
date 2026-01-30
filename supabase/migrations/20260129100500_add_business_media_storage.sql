-- Create storage bucket + policies for business media uploads.

insert into storage.buckets (id, name, public)
values ('business-media', 'business-media', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "Business media read" on storage.objects;
create policy "Business media read"
on storage.objects
for select
using (bucket_id = 'business-media');

drop policy if exists "Business media insert" on storage.objects;
create policy "Business media insert"
on storage.objects
for insert
with check (bucket_id = 'business-media' and auth.role() = 'authenticated');

drop policy if exists "Business media delete" on storage.objects;
create policy "Business media delete"
on storage.objects
for delete
using (bucket_id = 'business-media' and owner = auth.uid());
