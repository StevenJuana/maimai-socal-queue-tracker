-- Add the Round1 Plaza Bonita location without duplicating it on reruns.
insert into public.locations(name, city, sort_order, active)
values ('Plaza Bonita', 'National City', 8, true)
on conflict (name) do update
set city = excluded.city,
    sort_order = excluded.sort_order,
    active = true;
