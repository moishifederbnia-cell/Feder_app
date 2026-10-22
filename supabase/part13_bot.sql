alter table team_members add column if not exists phone text;
create table if not exists bot_pending (
phone text primary key,
payload jsonb not null,
created_at timestamptz default now()
);
create table if not exists bot_seen (
id text primary key,
created_at timestamptz default now()
);
alter table bot_pending enable row level security;
alter table bot_seen enable row level security;
