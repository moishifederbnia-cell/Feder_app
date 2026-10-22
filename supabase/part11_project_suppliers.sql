create table if not exists project_suppliers (
project_id uuid references projects on delete cascade,
supplier_id uuid references suppliers on delete cascade,
created_at timestamptz default now(),
primary key (project_id, supplier_id)
);
create table if not exists supplier_docs (
id uuid primary key default gen_random_uuid(),
project_id uuid references projects on delete cascade,
supplier_id uuid references suppliers on delete cascade,
kind text default 'תעודת משלוח',
title text,
note text,
date date default current_date,
photo text,
created_at timestamptz default now()
);
alter table project_suppliers enable row level security;
alter table supplier_docs enable row level security;
create policy "staff all" on project_suppliers for all using (is_staff()) with check (is_staff());
create policy "staff all" on supplier_docs for all using (is_staff()) with check (is_staff());
alter publication supabase_realtime add table project_suppliers;
alter publication supabase_realtime add table supplier_docs;
