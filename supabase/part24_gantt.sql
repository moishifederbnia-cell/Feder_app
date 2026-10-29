create table if not exists gantt_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  title text not null,
  start_date date not null,
  end_date date not null,
  area text default 'כללי',
  pct integer default 0,
  notes text,
  created_at timestamptz default now()
);
alter table gantt_items enable row level security;
drop policy if exists "staff all" on gantt_items;
create policy "staff all" on gantt_items for all using (is_staff()) with check (is_staff());
do $$ begin
  begin alter publication supabase_realtime add table gantt_items; exception when others then null; end;
end $$;
