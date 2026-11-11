-- part27: CEO role (מנכ"ל). Safe to run more than once.
-- The CEO opens on his own dashboard and has the same access as the team.
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('pending','admin','team','ceo','accountant','client','worker'));

create or replace function is_staff() returns boolean
language sql security definer stable set search_path = public as
$$ select exists(select 1 from profiles where id = auth.uid() and role in ('admin','team','ceo')) $$;
