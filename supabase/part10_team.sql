create table if not exists team_members (
id uuid primary key default gen_random_uuid(),
name text not null,
title text,
user_id uuid references auth.users on delete set null,
created_at timestamptz default now()
);
alter table team_members enable row level security;
create policy "staff reads team" on team_members for select using (is_staff());
create policy "admin edits team" on team_members for all using (exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')) with check (exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
insert into team_members (name, title) select 'אבו יאסר', 'מנהל עבודה' where not exists (select 1 from team_members where name = 'אבו יאסר');
insert into team_members (name) select 'אמיתי' where not exists (select 1 from team_members where name = 'אמיתי');
insert into team_members (name) select 'אבי' where not exists (select 1 from team_members where name = 'אבי');
insert into team_members (name) select 'מוישי' where not exists (select 1 from team_members where name = 'מוישי');
alter table tasks add column if not exists assignee_id uuid references team_members(id) on delete set null;
create policy "staff reminders" on reminders for all using (is_staff()) with check (is_staff());
alter publication supabase_realtime add table team_members;
