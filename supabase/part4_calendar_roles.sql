alter table profiles add column if not exists email text;
update profiles p set email = u.email from auth.users u where u.id = p.id and p.email is null;
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('pending','admin','team','accountant','client'));
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as
$$ begin
insert into profiles(id, name, email, role)
values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email), new.email,
case when (select count(*) from profiles) = 0 then 'admin' else 'pending' end);
return new;
end $$;
create or replace function is_accountant() returns boolean
language sql security definer stable set search_path = public as
$$ select exists(select 1 from profiles where id = auth.uid() and role = 'accountant') $$;
create table if not exists events (
id uuid primary key default gen_random_uuid(),
title text not null,
start_at timestamptz not null,
end_at timestamptz,
all_day boolean default false,
project_id uuid references projects on delete set null,
location text,
notes text,
google_id text unique,
created_at timestamptz default now()
);
alter table events enable row level security;
create policy "staff all" on events for all using (is_staff()) with check (is_staff());
create policy "accountant sees expenses" on expenses for select using (is_accountant());
create policy "accountant sees projects" on projects for select using (is_accountant());
create policy "accountant photos" on storage.objects for select using (bucket_id = 'photos' and is_accountant());
do $$ declare t text; begin
foreach t in array array['projects','tasks','expenses','suppliers','orders','docs','messages','events','profiles','client_projects'] loop
begin execute format('alter publication supabase_realtime add table %I', t); exception when others then null; end;
end loop;
end $$;
