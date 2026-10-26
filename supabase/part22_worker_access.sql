-- אילו פרויקטים עובד שטח רואה + רק משימות שמשויכות אליו
create table if not exists worker_access (
  user_id uuid references auth.users on delete cascade,
  project_id uuid references projects on delete cascade,
  primary key (user_id, project_id)
);
alter table worker_access enable row level security;
drop policy if exists "staff all" on worker_access;
create policy "staff all" on worker_access for all using (is_staff()) with check (is_staff());
do $$ begin
  begin alter publication supabase_realtime add table worker_access; exception when others then null; end;
end $$;

-- כרגע: כל עובד שטח קיים רואה את כל הפרויקטים הקיימים (אפשר לשנות במסך המשתמשים)
insert into worker_access (user_id, project_id)
select pr.id, p.id from profiles pr cross join projects p where pr.role = 'worker'
on conflict do nothing;

drop function if exists worker_tasks();
create or replace function worker_tasks()
returns table(id uuid, title text, title_ar text, notes text, notes_ar text, status text, due date, due_time text, kind text, photo text, project_id uuid, project_name text, project_name_ar text, assignee_id uuid, assignee_name text, mine boolean)
language sql security definer stable set search_path = public as
$$ select t.id, t.title, t.title_ar, t.notes, t.notes_ar, t.status, t.due, t.due_time, t.kind, t.photo, t.project_id, p.name, p.name_ar, t.assignee_id,
          coalesce(m.name_ar, m.name),
          true
   from tasks t
   join team_members m on m.id = t.assignee_id and m.user_id = auth.uid()
   left join projects p on p.id = t.project_id
   where t.status <> 'ממתין להחלטה'
     and exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'worker')
     and exists (select 1 from worker_access a where a.user_id = auth.uid() and a.project_id = t.project_id) $$;
grant execute on function worker_tasks() to authenticated;

drop function if exists worker_projects();
create or replace function worker_projects()
returns table(id uuid, name text, name_ar text, status text, address text, address_ar text)
language sql security definer stable set search_path = public as
$$ select p.id, p.name, p.name_ar, p.status, p.address, p.address_ar from projects p
   where exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'worker')
     and exists (select 1 from worker_access a where a.user_id = auth.uid() and a.project_id = p.id) $$;
grant execute on function worker_projects() to authenticated;

create or replace function worker_set_done(tid uuid, is_done boolean)
returns void
language plpgsql security definer set search_path = public as
$$ begin
  if not exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'worker') then return; end if;
  update tasks set status = case when is_done then 'הושלם' else 'לביצוע' end,
                   done_at = case when is_done then now() else null end
  where id = tid
    and exists (select 1 from team_members m where m.id = tasks.assignee_id and m.user_id = auth.uid());
end $$;
grant execute on function worker_set_done(uuid, boolean) to authenticated;

create or replace function is_task_photo(n text)
returns boolean
language sql security definer stable set search_path = public as
$$ select exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'worker')
      and exists (select 1 from tasks t join team_members m on m.id = t.assignee_id and m.user_id = auth.uid()
                  where t.photo = n and t.status <> 'ממתין להחלטה') $$;
grant execute on function is_task_photo(text) to authenticated;
