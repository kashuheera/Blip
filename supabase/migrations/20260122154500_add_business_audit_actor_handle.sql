-- Add actor handle to business audit log entries

alter table public.business_audit_log
  add column if not exists actor_handle text;

create or replace function public.record_business_audit(
  p_business_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_detail jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.business_audit_log (
    business_id,
    actor_id,
    actor_handle,
    action,
    entity_type,
    entity_id,
    detail
  ) values (
    p_business_id,
    auth.uid(),
    (select p.current_handle from public.profiles as p where p.id = auth.uid()),
    p_action,
    p_entity_type,
    p_entity_id,
    p_detail
  );
end;
$$;

update public.business_audit_log as log
set actor_handle = p.current_handle
from public.profiles as p
where log.actor_handle is null
  and log.actor_id = p.id;
