create table if not exists push_subscriptions (
endpoint text primary key,
user_id uuid references auth.users on delete cascade,
sub jsonb not null,
created_at timestamptz default now()
);
create table if not exists reminders (
id uuid primary key default gen_random_uuid(),
user_id uuid references auth.users on delete cascade,
ref text,
title text not null,
body text,
remind_at timestamptz not null,
sent boolean default false,
created_at timestamptz default now()
);
alter table push_subscriptions enable row level security;
alter table reminders enable row level security;
create policy "own subs" on push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own reminders" on reminders for all using (user_id = auth.uid()) with check (user_id = auth.uid());
