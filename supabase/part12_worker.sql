alter table tasks add column if not exists title_ar text;
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('pending','admin','team','accountant','client','worker'));

create or replace function worker_tasks()
returns table(id uuid, title text, title_ar text, notes text, status text, due date, project_id uuid, project_name text)
language sql security definer stable set search_path = public as
$$ select t.id, t.title, t.title_ar, t.notes, t.status, t.due, t.project_id, p.name
   from tasks t
   left join projects p on p.id = t.project_id
   where exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'worker')
     and t.assignee_id in (select m.id from team_members m where m.user_id = auth.uid()) $$;

create or replace function worker_set_done(tid uuid, is_done boolean)
returns void
language plpgsql security definer set search_path = public as
$$ begin
  if not exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'worker') then return; end if;
  update tasks set status = case when is_done then 'הושלם' else 'לביצוע' end,
                   done_at = case when is_done then now() else null end
  where id = tid and assignee_id in (select m.id from team_members m where m.user_id = auth.uid());
end $$;

grant execute on function worker_tasks() to authenticated;
grant execute on function worker_set_done(uuid, boolean) to authenticated;
