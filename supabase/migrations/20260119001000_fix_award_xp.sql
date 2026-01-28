-- Fix: award_xp() output column name ambiguity (xp/level OUT params vs table columns).

create or replace function public.award_xp()
returns table (xp int, level int)
language plpgsql
security definer
set search_path = public
as $$
declare
  next_xp int;
  next_level int;
begin
  update public.profiles as p
  set xp = coalesce(p.xp, 0) + 1,
      level = public.compute_level(coalesce(p.xp, 0) + 1)
  where p.id = auth.uid()
  returning p.xp, p.level into next_xp, next_level;

  if not found then
    insert into public.profiles (id, xp, level)
    values (auth.uid(), 1, public.compute_level(1))
    returning public.profiles.xp, public.profiles.level into next_xp, next_level;
  end if;

  return query select next_xp, next_level;
end;
$$;

