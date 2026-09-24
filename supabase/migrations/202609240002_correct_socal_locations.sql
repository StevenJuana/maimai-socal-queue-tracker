-- Reconcile existing installs to the requested seven active SoCal Round1 locations.
-- Rename Santa Ana to Main Place only when Main Place does not already exist,
-- preserving the existing location ID whenever possible.
do $$
begin
  if not exists (select 1 from public.locations where name = 'Main Place') then
    update public.locations
    set name = 'Main Place', city = 'Santa Ana'
    where name = 'Santa Ana';
  end if;
end;
$$;

insert into public.locations(name, city, sort_order, active) values
  ('Burbank', 'Burbank', 1, true),
  ('Lakewood', 'Lakewood', 2, true),
  ('Main Place', 'Santa Ana', 3, true),
  ('Puente Hills', 'City of Industry', 4, true),
  ('Mission Viejo', 'Mission Viejo', 5, true),
  ('Temecula', 'Temecula', 6, true),
  ('Moreno Valley', 'Moreno Valley', 7, true)
on conflict (name) do update
set city = excluded.city,
    sort_order = excluded.sort_order,
    active = true;

-- Keep historical rows and IDs, but hide every location outside the requested active set.
update public.locations
set active = name in ('Burbank', 'Lakewood', 'Main Place', 'Puente Hills', 'Mission Viejo', 'Temecula', 'Moreno Valley');
