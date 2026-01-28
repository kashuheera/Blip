-- Business metadata + verification workflow.

alter table public.businesses
  add column if not exists categories text[],
  add column if not exists amenities text[],
  add column if not exists verification_status text default 'unverified',
  add column if not exists verification_notes text,
  add column if not exists verification_requested_at timestamptz,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references auth.users (id);

do $$
begin
  if to_regclass('public.businesses') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'businesses_verification_status_check'
        and conrelid = to_regclass('public.businesses')
    ) then
      alter table public.businesses
        add constraint businesses_verification_status_check
        check (verification_status in ('unverified', 'pending', 'verified', 'rejected'));
    end if;
  end if;
end;
$$;

create table if not exists public.business_verification_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses (id) on delete cascade,
  owner_id uuid references auth.users (id) on delete cascade,
  status text default 'pending',
  notes text,
  evidence_url text,
  created_at timestamptz default now(),
  reviewed_at timestamptz,
  reviewer_id uuid references auth.users (id),
  reviewer_notes text
);

do $$
begin
  if to_regclass('public.business_verification_requests') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'business_verification_requests_status_check'
        and conrelid = to_regclass('public.business_verification_requests')
    ) then
      alter table public.business_verification_requests
        add constraint business_verification_requests_status_check
        check (status in ('pending', 'approved', 'rejected'));
    end if;
  end if;
end;
$$;

create index if not exists business_verification_requests_business_idx
  on public.business_verification_requests (business_id, created_at desc);

create index if not exists business_verification_requests_status_idx
  on public.business_verification_requests (status, created_at desc);

create unique index if not exists business_verification_requests_pending_idx
  on public.business_verification_requests (business_id)
  where status = 'pending';

alter table public.business_verification_requests enable row level security;

drop policy if exists "Verification requests viewable by owner or admin"
  on public.business_verification_requests;
create policy "Verification requests viewable by owner or admin"
  on public.business_verification_requests
  for select
  using (
    auth.uid() = owner_id
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

drop policy if exists "Verification requests insertable by owner"
  on public.business_verification_requests;
create policy "Verification requests insertable by owner"
  on public.business_verification_requests
  for insert
  with check (
    auth.uid() = owner_id
    and auth.uid() = (select owner_id from public.businesses where id = business_id)
  );

drop policy if exists "Verification requests updatable by admins"
  on public.business_verification_requests;
create policy "Verification requests updatable by admins"
  on public.business_verification_requests
  for update
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

create or replace function public.review_business_verification(
  p_request_id uuid,
  p_status text,
  p_notes text default null
)
returns table (request_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.business_verification_requests%rowtype;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin = true) then
    raise exception 'Not allowed';
  end if;

  select *
  into request_row
  from public.business_verification_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Request not found';
  end if;

  if request_row.status <> 'pending' then
    return query select request_row.id, request_row.status;
    return;
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid status';
  end if;

  update public.business_verification_requests
  set status = p_status,
      reviewer_id = auth.uid(),
      reviewer_notes = p_notes,
      reviewed_at = now()
  where id = request_row.id;

  if p_status = 'approved' then
    update public.businesses
    set verified = true,
        verification_status = 'verified',
        verification_notes = p_notes,
        verified_at = now(),
        verified_by = auth.uid()
    where id = request_row.business_id;
  else
    update public.businesses
    set verified = false,
        verification_status = 'rejected',
        verification_notes = p_notes,
        verified_at = null,
        verified_by = auth.uid()
    where id = request_row.business_id;
  end if;

  return query select request_row.id, p_status;
end;
$$;
