alter table suppliers add column if not exists contacts jsonb default '[]'::jsonb;
