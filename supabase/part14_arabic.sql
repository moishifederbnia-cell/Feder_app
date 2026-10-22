alter table projects add column if not exists name_ar text;
alter table projects add column if not exists address_ar text;
alter table tasks add column if not exists notes_ar text;

drop function if exists worker_tasks();
create or replace function worker_tasks()
returns table(id uuid, title text, title_ar text, notes text, notes_ar text, status text, due date, project_id uuid, project_name text, project_name_ar text, assignee_id uuid, assignee_name text, mine boolean)
language sql security definer stable set search_path = public as
$$ select t.id, t.title, t.title_ar, t.notes, t.notes_ar, t.status, t.due, t.project_id, p.name, p.name_ar, t.assignee_id,
          coalesce(m.name_ar, m.name),
          (m.user_id = auth.uid())
   from tasks t
   left join projects p on p.id = t.project_id
   left join team_members m on m.id = t.assignee_id
   where exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'worker') $$;

drop function if exists worker_projects();
create or replace function worker_projects()
returns table(id uuid, name text, name_ar text, status text, address text, address_ar text)
language sql security definer stable set search_path = public as
$$ select p.id, p.name, p.name_ar, p.status, p.address, p.address_ar from projects p
   where exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'worker') $$;

grant execute on function worker_tasks() to authenticated;
grant execute on function worker_projects() to authenticated;
