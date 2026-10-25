drop function if exists worker_tasks();
create or replace function worker_tasks()
returns table(id uuid, title text, title_ar text, notes text, notes_ar text, status text, due date, due_time text, kind text, photo text, project_id uuid, project_name text, project_name_ar text, assignee_id uuid, assignee_name text, mine boolean)
language sql security definer stable set search_path = public as
$$ select t.id, t.title, t.title_ar, t.notes, t.notes_ar, t.status, t.due, t.due_time, t.kind, t.photo, t.project_id, p.name, p.name_ar, t.assignee_id,
          coalesce(m.name_ar, m.name),
          (m.user_id = auth.uid())
   from tasks t
   left join projects p on p.id = t.project_id
   left join team_members m on m.id = t.assignee_id
   where t.status <> 'ממתין להחלטה'
     and exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'worker') $$;
grant execute on function worker_tasks() to authenticated;

create or replace function is_task_photo(n text)
returns boolean
language sql security definer stable set search_path = public as
$$ select exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'worker')
      and exists (select 1 from tasks t where t.photo = n and t.status <> 'ממתין להחלטה') $$;
grant execute on function is_task_photo(text) to authenticated;

drop policy if exists "worker task photos" on storage.objects;
create policy "worker task photos" on storage.objects for select
  using (bucket_id = 'photos' and is_task_photo(name));
