-- Feder app schema. Paste into Supabase > SQL Editor > Run.

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  name text,
  role text not null default 'pending' check (role in ('pending','admin','team','client')),
  created_at timestamptz default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null, address text, client_name text, client_phone text,
  status text default 'בהתחלה', budget numeric,
  created_at timestamptz default now()
);
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  title text not null, due date, status text default 'לביצוע', notes text,
  created_at timestamptz default now()
);
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  vendor text, amount numeric, date date default current_date, note text, photo text,
  created_at timestamptz default now()
);
create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null, field text, phone text, notes text,
  created_at timestamptz default now()
);
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  supplier_id uuid references suppliers on delete set null,
  item text not null, status text default 'לא הוזמן', note text,
  created_at timestamptz default now()
);
create table if not exists docs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  title text, stage text, date date default current_date, note text, photo text,
  created_at timestamptz default now()
);
create table if not exists client_projects (
  user_id uuid references auth.users on delete cascade,
  project_id uuid references projects on delete cascade,
  primary key (user_id, project_id)
);
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  sender uuid references auth.users default auth.uid(),
  body text not null,
  created_at timestamptz default now()
);

create or replace function is_staff() returns boolean
language sql security definer stable set search_path = public as
$$ select exists(select 1 from profiles where id = auth.uid() and role in ('admin','team')) $$;

create or replace function my_client_project(pid uuid) returns boolean
language sql security definer stable set search_path = public as
$$ select exists(select 1 from client_projects where user_id = auth.uid() and project_id = pid) $$;

-- new users start as 'pending' (no access) until Moshi promotes them
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as
$$ begin
  insert into profiles(id, name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email),
          case when (select count(*) from profiles) = 0 then 'admin' else 'pending' end);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

alter table profiles enable row level security;
create policy "own or staff reads profile" on profiles for select using (id = auth.uid() or is_staff());
create policy "admin edits profiles" on profiles for update using (exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

do $$ declare t text; begin
  foreach t in array array['projects','tasks','expenses','suppliers','orders','docs','client_projects'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "staff all" on %I for all using (is_staff()) with check (is_staff())', t);
  end loop;
end $$;

-- clients: read-only on their own projects; tasks and docs only
create policy "client sees project" on projects for select using (my_client_project(id));
create policy "client sees tasks" on tasks for select using (my_client_project(project_id));
create policy "client sees docs" on docs for select using (my_client_project(project_id));

alter table messages enable row level security;
create policy "staff messages" on messages for all using (is_staff()) with check (is_staff());
create policy "client reads messages" on messages for select using (my_client_project(project_id));
create policy "client sends messages" on messages for insert with check (my_client_project(project_id) and sender = auth.uid());

-- photo storage
insert into storage.buckets (id, name, public) values ('photos','photos', false) on conflict do nothing;
create policy "staff photos" on storage.objects for all
  using (bucket_id = 'photos' and is_staff()) with check (bucket_id = 'photos' and is_staff());
