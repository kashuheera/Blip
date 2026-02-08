-- KYC verification workflow: document uploads + request queue + admin review

alter table public.user_private
  add column if not exists id_doc_front_path text,
  add column if not exists id_doc_back_path text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_private_kyc_status_check'
  ) then
    alter table public.user_private
      add constraint user_private_kyc_status_check
      check (kyc_status in ('pending', 'submitted', 'verified', 'rejected'));
  end if;
end $$;

create table if not exists public.kyc_verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending',
  notes text,
  created_at timestamptz default now(),
  reviewed_at timestamptz,
  reviewed_by uuid
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'kyc_verification_status_check'
  ) then
    alter table public.kyc_verification_requests
      add constraint kyc_verification_status_check
      check (status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

create index if not exists kyc_verification_requests_user_id_idx
  on public.kyc_verification_requests (user_id);

create unique index if not exists kyc_verification_requests_pending_idx
  on public.kyc_verification_requests (user_id)
  where status = 'pending';

alter table public.kyc_verification_requests enable row level security;

drop policy if exists "KYC requests viewable by owner or admin" on public.kyc_verification_requests;
create policy "KYC requests viewable by owner or admin"
  on public.kyc_verification_requests for select
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

drop policy if exists "KYC requests insertable by owner" on public.kyc_verification_requests;
create policy "KYC requests insertable by owner"
  on public.kyc_verification_requests for insert
  with check (
    auth.uid() = user_id
    and public.is_personal_account(auth.uid())
  );

drop policy if exists "KYC requests updatable by admin" on public.kyc_verification_requests;
create policy "KYC requests updatable by admin"
  on public.kyc_verification_requests for update
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

drop policy if exists "KYC requests deletable by admin" on public.kyc_verification_requests;
create policy "KYC requests deletable by admin"
  on public.kyc_verification_requests for delete
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

drop policy if exists "User private viewable by admin" on public.user_private;
create policy "User private viewable by admin"
  on public.user_private for select
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

drop policy if exists "User private updatable by admin" on public.user_private;
create policy "User private updatable by admin"
  on public.user_private for update
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

create or replace function public.review_kyc_verification(
  p_request_id uuid,
  p_status text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id
  from public.kyc_verification_requests
  where id = p_request_id;

  if v_user_id is null then
    return;
  end if;

  update public.kyc_verification_requests
    set status = p_status,
        notes = p_notes,
        reviewed_at = now(),
        reviewed_by = auth.uid()
  where id = p_request_id;

  update public.user_private
    set kyc_status = case
      when p_status = 'approved' then 'verified'
      when p_status = 'rejected' then 'rejected'
      else 'submitted'
    end,
        updated_at = now()
  where user_id = v_user_id;
end;
$$;

insert into storage.buckets (id, name, public)
values ('kyc-docs', 'kyc-docs', false)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "KYC docs read" on storage.objects;
create policy "KYC docs read"
on storage.objects
for select
using (
  bucket_id = 'kyc-docs'
  and (
    owner = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  )
);

drop policy if exists "KYC docs insert" on storage.objects;
create policy "KYC docs insert"
on storage.objects
for insert
with check (
  bucket_id = 'kyc-docs'
  and owner = auth.uid()
);

drop policy if exists "KYC docs delete" on storage.objects;
create policy "KYC docs delete"
on storage.objects
for delete
using (
  bucket_id = 'kyc-docs'
  and (
    owner = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  )
);
