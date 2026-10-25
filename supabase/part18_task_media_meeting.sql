alter table tasks add column if not exists due_time text;
alter table tasks add column if not exists kind text;
alter table tasks add column if not exists event_id uuid;
alter table tasks add column if not exists photo text;
