-- maimai SoCal Queue Tracker: database, RLS and private verification screenshot storage.
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Player' check (char_length(display_name) between 1 and 40),
  verification_status text not null default 'pending' check (verification_status in ('pending','approved','rejected')),
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  city text not null,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

create table public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  screenshot_path text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(), reviewed_at timestamptz, reviewed_by uuid references public.profiles(id)
);

create table public.status_updates (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete restrict,
  playing_count integer not null check (playing_count between 0 and 99),
  queue_count integer not null check (queue_count between 0 and 99),
  user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index status_updates_location_time_idx on public.status_updates(location_id, created_at desc);
create index verification_requests_status_time_idx on public.verification_requests(status, created_at);

create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(nullif(left(trim(new.raw_user_meta_data ->> 'display_name'), 40), ''), 'Player'))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.create_profile_for_new_user();

-- Protect verification and role columns from self-service profile updates.
create or replace function public.protect_profile_privileges()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'Only administrators may change role';
  end if;
  if new.verification_status is distinct from old.verification_status
     and auth.uid() is not null and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
     and not (old.id=auth.uid() and old.verification_status='rejected' and new.verification_status='pending'
              and exists(select 1 from public.verification_requests r where r.user_id=old.id and r.status='pending')) then
    raise exception 'Only administrators may change verification status';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger protect_profile_privileges before update on public.profiles
for each row execute function public.protect_profile_privileges();

-- A definer helper avoids recursive profiles-table RLS when admin policies check roles.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin');
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

alter table public.profiles enable row level security;
alter table public.locations enable row level security;
alter table public.status_updates enable row level security;
alter table public.verification_requests enable row level security;

create policy "public read active locations" on public.locations for select to anon, authenticated using (active or public.is_admin());
create policy "admin manage locations" on public.locations for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "users read own profile and admins all" on public.profiles for select to authenticated using (id=auth.uid() or public.is_admin());
create policy "users update own profile and admins all" on public.profiles for update to authenticated using (id=auth.uid() or public.is_admin()) with check (id=auth.uid() or public.is_admin());
create policy "public read status updates" on public.status_updates for select to anon, authenticated using (true);
create policy "approved players insert updates" on public.status_updates for insert to authenticated with check (user_id=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.verification_status='approved'));
create policy "admins manage status updates" on public.status_updates for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "users read own requests admins all" on public.verification_requests for select to authenticated using (user_id=auth.uid() or public.is_admin());
create policy "users create own request" on public.verification_requests for insert to authenticated with check (user_id=auth.uid() and status='pending');
create policy "users replace own pending request" on public.verification_requests for update to authenticated using (user_id=auth.uid() and status in ('pending','rejected')) with check (user_id=auth.uid() and status='pending');

-- This view exposes only public status fields plus display name, never profile roles or verification state.
create or replace view public.public_status_updates with (security_invoker = false) as
select u.id, u.location_id, u.playing_count, u.queue_count, u.created_at, p.display_name
from public.status_updates u join public.profiles p on p.id=u.user_id;
grant select on public.public_status_updates to anon, authenticated;

create or replace function public.review_verification_request(target_request_id uuid, decision text)
returns void language plpgsql security definer set search_path = '' as $$
declare request_user uuid;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='admin') then raise exception 'Admin access required'; end if;
  if decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
  select user_id into request_user from public.verification_requests where id=target_request_id and status='pending' for update;
  if request_user is null then raise exception 'Pending request not found'; end if;
  update public.profiles set verification_status=decision where id=request_user;
  update public.verification_requests set status=decision, reviewed_at=now(), reviewed_by=auth.uid() where id=target_request_id;
end;
$$;
revoke all on function public.review_verification_request(uuid,text) from public;
grant execute on function public.review_verification_request(uuid,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('verification-screenshots','verification-screenshots',false,4194304,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false, file_size_limit=4194304, allowed_mime_types=array['image/jpeg','image/png','image/webp'];
create policy "users upload own verification screenshot" on storage.objects for insert to authenticated with check (bucket_id='verification-screenshots' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "admins read verification screenshots" on storage.objects for select to authenticated using (bucket_id='verification-screenshots' and public.is_admin());
create policy "admins delete verification screenshots" on storage.objects for delete to authenticated using (bucket_id='verification-screenshots' and public.is_admin());

insert into public.locations(name,city,sort_order) values
('Burbank','Burbank',1),('Lakewood','Lakewood',2),('Main Place','Santa Ana',3),
('Puente Hills','City of Industry',4),('Mission Viejo','Mission Viejo',5),('Temecula','Temecula',6),('Moreno Valley','Moreno Valley',7)
on conflict(name) do nothing;
