-- =====================================================================
--  CLASS NOTES HUB  -  Supabase setup
--  Supabase > SQL Editor > New query > paste this whole file > RUN
--  (Running it again is safe, nothing breaks)
-- =====================================================================

-- ---------- 1. Settings (the class code lives here, students cannot read it)
create table if not exists public.app_settings (
  key   text primary key,
  value text not null
);
insert into public.app_settings (key, value) values ('class_code', '8c2026')
on conflict (key) do nothing;
alter table public.app_settings enable row level security;   -- no policy = no client access

-- ---------- 2. Profiles (one record per student)
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null,
  role       text not null default 'student' check (role in ('student','admin')),
  banned     boolean not null default false,
  ban_reason text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- ---------- 3. Helper functions
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and banned = false);
$$;

create or replace function public.is_active()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and banned = false);
$$;

-- ---------- 4. Check the class code on signup + create the profile
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare code text;
begin
  select value into code from public.app_settings where key = 'class_code';
  if lower(coalesce(new.raw_user_meta_data->>'class_code','')) <> lower(coalesce(code,'')) then
    raise exception 'Wrong class code';
  end if;
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), 'Student'));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Lets the app show a friendly error before signup
create or replace function public.check_class_code(p_code text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.app_settings
                 where key = 'class_code' and lower(value) = lower(trim(coalesce(p_code,''))));
$$;
grant execute on function public.check_class_code(text) to anon, authenticated;

-- Change your own name
create or replace function public.update_my_name(p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_active() then raise exception 'Your account is blocked'; end if;
  if length(trim(coalesce(p_name,''))) < 2 then raise exception 'Name is too short'; end if;
  update public.profiles set full_name = left(trim(p_name), 40) where id = auth.uid();
end;
$$;

-- ---------- 5. Pages (notebook photos)
create table if not exists public.pages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id) on delete set null default auth.uid(),
  subject    text not null,
  chapter    text not null,
  note_date  date not null,
  uploader   text not null,
  file_path  text not null,
  url        text not null,
  created_at timestamptz not null default now()
);
create index if not exists pages_subject_idx on public.pages (subject);
create index if not exists pages_user_idx    on public.pages (user_id);
alter table public.pages enable row level security;

-- ---------- 6. Favourites
create table if not exists public.favourites (
  user_id    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  page_id    uuid not null references public.pages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, page_id)
);
alter table public.favourites enable row level security;

-- ---------- 7. Reports
create table if not exists public.reports (
  id         uuid primary key default gen_random_uuid(),
  page_id    uuid not null references public.pages(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  reason     text not null,
  status     text not null default 'open' check (status in ('open','resolved')),
  created_at timestamptz not null default now(),
  unique (page_id, user_id)
);
alter table public.reports enable row level security;

-- ---------- 8. Homework
create table if not exists public.homework (
  id              uuid primary key default gen_random_uuid(),
  subject         text not null,
  title           text not null,
  details         text,
  due_date        date not null,
  created_by      uuid references public.profiles(id) on delete set null default auth.uid(),
  created_by_name text not null,
  created_at      timestamptz not null default now()
);
alter table public.homework enable row level security;

-- ---------- 9. Security rules (RLS)
-- profiles
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated using (true);

-- pages
drop policy if exists "pages read"   on public.pages;
drop policy if exists "pages insert" on public.pages;
drop policy if exists "pages delete" on public.pages;
create policy "pages read"   on public.pages for select to authenticated using (public.is_active());
create policy "pages insert" on public.pages for insert to authenticated
  with check (public.is_active() and user_id = auth.uid());
create policy "pages delete" on public.pages for delete to authenticated
  using ((user_id = auth.uid() and public.is_active()) or public.is_admin());

-- favourites
drop policy if exists "fav read"   on public.favourites;
drop policy if exists "fav insert" on public.favourites;
drop policy if exists "fav delete" on public.favourites;
create policy "fav read"   on public.favourites for select to authenticated using (user_id = auth.uid());
create policy "fav insert" on public.favourites for insert to authenticated
  with check (user_id = auth.uid() and public.is_active());
create policy "fav delete" on public.favourites for delete to authenticated using (user_id = auth.uid());

-- reports
drop policy if exists "reports insert" on public.reports;
drop policy if exists "reports admin read"   on public.reports;
drop policy if exists "reports admin update" on public.reports;
drop policy if exists "reports admin delete" on public.reports;
create policy "reports insert" on public.reports for insert to authenticated
  with check (user_id = auth.uid() and public.is_active());
create policy "reports admin read"   on public.reports for select to authenticated using (public.is_admin());
create policy "reports admin update" on public.reports for update to authenticated using (public.is_admin());
create policy "reports admin delete" on public.reports for delete to authenticated using (public.is_admin());

-- homework
drop policy if exists "hw read"   on public.homework;
drop policy if exists "hw insert" on public.homework;
drop policy if exists "hw delete" on public.homework;
create policy "hw read"   on public.homework for select to authenticated using (public.is_active());
create policy "hw insert" on public.homework for insert to authenticated
  with check (public.is_active() and created_by = auth.uid());
create policy "hw delete" on public.homework for delete to authenticated
  using ((created_by = auth.uid() and public.is_active()) or public.is_admin());

-- ---------- 10. Photo storage
insert into storage.buckets (id, name, public)
values ('notes', 'notes', true)
on conflict (id) do nothing;

drop policy if exists "notes select" on storage.objects;
drop policy if exists "notes insert" on storage.objects;
drop policy if exists "notes delete" on storage.objects;
create policy "notes select" on storage.objects for select to authenticated
  using (bucket_id = 'notes');
create policy "notes insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'notes' and public.is_active() and (storage.foldername(name))[1] = auth.uid()::text);
create policy "notes delete" on storage.objects for delete to authenticated
  using (bucket_id = 'notes' and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text));

-- ---------- 11. Admin functions (only admins can run these)
create or replace function public.admin_list_users()
returns table (id uuid, full_name text, email text, role text, banned boolean,
               ban_reason text, created_at timestamptz, pages_count bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only an admin can do this'; end if;
  return query
    select p.id, p.full_name, u.email::text, p.role, p.banned, p.ban_reason, p.created_at,
           (select count(*) from public.pages g where g.user_id = p.id)
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at desc;
end;
$$;

create or replace function public.admin_set_ban(p_target uuid, p_ban boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only an admin can do this'; end if;
  if p_target = auth.uid() then raise exception 'You cannot block yourself'; end if;
  if p_ban and exists (select 1 from public.profiles where id = p_target and role = 'admin') then
    raise exception 'Make this admin a student first, then block';
  end if;
  update public.profiles
     set banned = p_ban, ban_reason = case when p_ban then nullif(trim(p_reason), '') else null end
   where id = p_target;
end;
$$;

create or replace function public.admin_set_role(p_target uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only an admin can do this'; end if;
  if p_role not in ('student','admin') then raise exception 'Invalid role'; end if;
  if p_target = auth.uid() then raise exception 'You cannot change your own role'; end if;
  update public.profiles set role = p_role where id = p_target;
end;
$$;

create or replace function public.admin_delete_user(p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only an admin can do this'; end if;
  if p_target = auth.uid() then raise exception 'You cannot delete your own account here'; end if;
  delete from auth.users where id = p_target;
end;
$$;

create or replace function public.admin_get_class_code()
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_admin() then raise exception 'Only an admin can do this'; end if;
  select value into c from public.app_settings where key = 'class_code';
  return c;
end;
$$;

create or replace function public.admin_set_class_code(p_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only an admin can do this'; end if;
  if length(trim(coalesce(p_code,''))) < 4 then raise exception 'Code must be at least 4 characters'; end if;
  update public.app_settings set value = trim(p_code) where key = 'class_code';
end;
$$;

revoke all on function public.admin_list_users()                      from public, anon;
revoke all on function public.admin_set_ban(uuid, boolean, text)      from public, anon;
revoke all on function public.admin_set_role(uuid, text)              from public, anon;
revoke all on function public.admin_delete_user(uuid)                 from public, anon;
revoke all on function public.admin_get_class_code()                  from public, anon;
revoke all on function public.admin_set_class_code(text)              from public, anon;
revoke all on function public.update_my_name(text)                    from public, anon;
grant execute on function public.admin_list_users()                   to authenticated;
grant execute on function public.admin_set_ban(uuid, boolean, text)   to authenticated;
grant execute on function public.admin_set_role(uuid, text)           to authenticated;
grant execute on function public.admin_delete_user(uuid)              to authenticated;
grant execute on function public.admin_get_class_code()               to authenticated;
grant execute on function public.admin_set_class_code(text)           to authenticated;
grant execute on function public.update_my_name(text)                 to authenticated;

-- =====================================================================
--  LAST STEP (only once): make yourself ADMIN
--  1. First sign up on the website with your email
--  2. Then run this query (write your own email):
--
--  update public.profiles set role = 'admin'
--  where id = (select id from auth.users where email = 'aapka@email.com');
-- =====================================================================
