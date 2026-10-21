create table if not exists plans (
id uuid primary key default gen_random_uuid(),
project_id uuid references projects on delete cascade,
title text not null,
file_path text,
file_name text,
file_type text,
notes text,
created_at timestamptz default now()
);
alter table plans enable row level security;
create policy "staff all" on plans for all using (is_staff()) with check (is_staff());
do $$ begin
alter publication supabase_realtime add table plans;
exception when others then null;
end $$;
