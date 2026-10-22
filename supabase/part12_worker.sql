alter table tasks add column if not exists title_ar text;
alter table team_members add column if not exists name_ar text;
update team_members set name_ar = 'أبو ياسر' where name = 'אבו יאסר' and name_ar is null;
update team_members set name_ar = 'عميتاي' where name = 'אמיתי' and name_ar is null;
update team_members set name_ar = 'أبي' where name = 'אבי' and name_ar is null;
update team_members set name_ar = 'موشي' where name = 'מוישי' and name_ar is null;
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('pending','admin','team','accountant','client','worker'));

drop function if exists worker_tasks();
create or replace function worker_tasks()
returns table(id uuid, title text, title_ar text, notes text, status text, due date, project_id uuid, project_name text, assignee_id uuid, assignee_name text, mine boolean)
language sql security definer stable set search_path = public as
$$ select t.id, t.title, t.title_ar, t.notes, t.status, t.due, t.project_id, p.name, t.assignee_id,
          coalesce(m.name_ar, m.name),
          (m.user_id = auth.uid())
   from tasks t
   left join projects p on p.id = t.project_id
   left join team_members m on m.id = t.assignee_id
   where exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'worker') $$;

create or replace function worker_projects()
returns table(id uuid, name text, status text, address text)
language sql security definer stable set search_path = public as
$$ select p.id, p.name, p.status, p.address from projects p
   where exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'worker') $$;

create or replace function worker_set_done(tid uuid, is_done boolean)
returns void
language plpgsql security definer set search_path = public as
$$ begin
  if not exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'worker') then return; end if;
  update tasks set status = case when is_done then 'הושלם' else 'לביצוע' end,
                   done_at = case when is_done then now() else null end
  where id = tid;
end $$;

grant execute on function worker_tasks() to authenticated;
grant execute on function worker_projects() to authenticated;
grant execute on function worker_set_done(uuid, boolean) to authenticated;
