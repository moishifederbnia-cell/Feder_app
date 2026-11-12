-- part28 (גרסה 52): משימה לכמה אנשים, תוכניות ומסמכים, גאנט בסגנון עמית, אחריות ואספקות,
-- אזור לקוח, אדריכלית, תשלומים ובקשות שינוי. בטוח להרצה חוזרת.

-- ===== תפקידים =====
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('pending','admin','team','ceo','accountant','client','worker','architect'));

create or replace function my_role() returns text
language sql security definer stable set search_path = public as
$$ select role from profiles where id = auth.uid() $$;
grant execute on function my_role() to authenticated;

-- ===== משימה לכמה אנשים =====
alter table tasks add column if not exists assignee_ids jsonb default '[]'::jsonb;
update tasks set assignee_ids = jsonb_build_array(assignee_id::text)
  where assignee_id is not null and (assignee_ids is null or assignee_ids = '[]'::jsonb);
alter table tasks add column if not exists client_visible boolean default false;
alter table team_members add column if not exists email text;

-- עובד שטח רואה משימה גם כשהוא אחד מכמה אחראים
drop function if exists worker_tasks();
create or replace function worker_tasks()
returns table(id uuid, title text, title_ar text, notes text, notes_ar text, status text, due date, due_time text, kind text, photo text, project_id uuid, project_name text, project_name_ar text, assignee_id uuid, assignee_name text, mine boolean)
language sql security definer stable set search_path = public as
$$ select t.id, t.title, t.title_ar, t.notes, t.notes_ar, t.status, t.due, t.due_time, t.kind, t.photo, t.project_id, p.name, p.name_ar, m.id,
          coalesce(m.name_ar, m.name), true
   from tasks t
   join team_members m on m.user_id = auth.uid() and (m.id = t.assignee_id or coalesce(t.assignee_ids,'[]'::jsonb) ? m.id::text)
   left join projects p on p.id = t.project_id
   where t.status <> 'ממתין להחלטה'
     and exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'worker')
     and exists (select 1 from worker_access a where a.user_id = auth.uid() and a.project_id = t.project_id) $$;
grant execute on function worker_tasks() to authenticated;

create or replace function worker_set_done(tid uuid, is_done boolean)
returns void
language plpgsql security definer set search_path = public as
$$ begin
  if not exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'worker') then return; end if;
  update tasks set status = case when is_done then 'הושלם' else 'לביצוע' end,
                   done_at = case when is_done then now() else null end
  where id = tid
    and exists (select 1 from team_members m where m.user_id = auth.uid()
                and (m.id = tasks.assignee_id or coalesce(tasks.assignee_ids,'[]'::jsonb) ? m.id::text));
end $$;
grant execute on function worker_set_done(uuid, boolean) to authenticated;

create or replace function is_task_photo(n text)
returns boolean
language sql security definer stable set search_path = public as
$$ select exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'worker')
      and exists (select 1 from tasks t join team_members m on m.user_id = auth.uid()
                    and (m.id = t.assignee_id or coalesce(t.assignee_ids,'[]'::jsonb) ? m.id::text)
                  where t.photo = n and t.status <> 'ממתין להחלטה') $$;
grant execute on function is_task_photo(text) to authenticated;

-- ===== תוכניות ומסמכים + מה הלקוח רואה =====
alter table plans add column if not exists kind text default 'תוכנית';
alter table plans add column if not exists client_visible boolean default false;
alter table plans add column if not exists uploaded_by uuid;
alter table docs add column if not exists client_visible boolean default false;

-- ===== גאנט בסגנון עמית =====
alter table projects add column if not exists sched_start date;
alter table projects add column if not exists sched_weeks int default 5;
alter table projects add column if not exists sched_goal text;

create table if not exists sched_rows (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  section text default 'contractor',          -- contractor | client
  title text not null,
  targets jsonb default '{}'::jsonb,          -- {"1":70,"2":100}  (null = פס בלי אחוז)
  actual int default 0,                       -- ביצוע בפועל %
  done boolean default false,                 -- לשורות לקוח/אדריכלית
  urgent boolean default false,               -- "מיידי"
  milestone boolean default false,            -- כוכב
  assignee_id uuid,
  note text,
  sort int default 0,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);
create table if not exists resp_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  grp text default 'client',                  -- client | client_supply | architect | office
  item text not null,
  note text,
  stage text,
  week int,
  urgent boolean default false,
  done boolean default false,
  done_at timestamptz,
  reply text,                                 -- תשובת לקוח/אדריכלית
  sort int default 0,
  created_at timestamptz default now()
);
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  title text not null,
  amount numeric,
  due date,
  paid boolean default false,
  paid_at date,
  note text,
  created_at timestamptz default now()
);
create table if not exists change_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  user_id uuid default auth.uid(),
  body text not null,
  status text default 'חדש',                  -- חדש | הצעת מחיר | אושר | נדחה | בוצע
  price numeric,
  reply text,
  client_ok boolean,
  created_at timestamptz default now()
);
alter table project_suppliers add column if not exists client_added boolean default false;

do $$ declare t text; begin
  foreach t in array array['sched_rows','resp_items','payments','change_requests'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "staff all" on %I', t);
    execute format('create policy "staff all" on %I for all using (is_staff()) with check (is_staff())', t);
    begin execute format('alter publication supabase_realtime add table %I', t); exception when others then null; end;
  end loop;
end $$;

-- לקוח ואדריכלית (משויכים דרך client_projects)
drop policy if exists "client sees sched" on sched_rows;
create policy "client sees sched" on sched_rows for select using (my_client_project(project_id));
drop policy if exists "client sees resp" on resp_items;
create policy "client sees resp" on resp_items for select using (my_client_project(project_id) and (
  (my_role() = 'client' and grp in ('client','client_supply')) or (my_role() = 'architect' and grp = 'architect')));
drop policy if exists "client sees payments" on payments;
create policy "client sees payments" on payments for select using (my_client_project(project_id) and my_role() = 'client');
drop policy if exists "client sees changes" on change_requests;
create policy "client sees changes" on change_requests for select using (my_client_project(project_id) and my_role() = 'client');
drop policy if exists "client adds change" on change_requests;
create policy "client adds change" on change_requests for insert with check (my_client_project(project_id) and my_role() = 'client' and user_id = auth.uid());

-- תיעוד: הלקוח רואה רק מה שסומן "גלוי ללקוח"
drop policy if exists "client sees docs" on docs;
create policy "client sees docs" on docs for select using (my_client_project(project_id) and (client_visible or my_role() = 'architect'));
-- תוכניות ומסמכים: לקוח – רק מה שסומן; אדריכלית – הכול בפרויקטים שלה + העלאה
drop policy if exists "client sees plans" on plans;
create policy "client sees plans" on plans for select using (my_client_project(project_id) and (client_visible or my_role() = 'architect'));
drop policy if exists "architect adds plans" on plans;
create policy "architect adds plans" on plans for insert with check (my_client_project(project_id) and my_role() = 'architect');
-- ספקים שהלקוח הוסיף
drop policy if exists "client sees own psup" on project_suppliers;
create policy "client sees own psup" on project_suppliers for select using (my_client_project(project_id) and client_added);
drop policy if exists "client sees own suppliers" on suppliers;
create policy "client sees own suppliers" on suppliers for select using (exists (select 1 from project_suppliers ps where ps.supplier_id = suppliers.id and ps.client_added and my_client_project(ps.project_id)));

-- קבצים: לקוח/אדריכלית רואים רק קבצים של מה שמותר להם; אדריכלית מעלה לתיקיית plans
create or replace function client_file(n text) returns boolean
language sql security definer stable set search_path = public as
$$ select exists (select 1 from docs d where d.photo = n and my_client_project(d.project_id) and (d.client_visible or my_role() = 'architect'))
       or exists (select 1 from plans p where p.file_path = n and my_client_project(p.project_id) and (p.client_visible or my_role() = 'architect')) $$;
grant execute on function client_file(text) to authenticated;
drop policy if exists "client files" on storage.objects;
create policy "client files" on storage.objects for select using (bucket_id = 'photos' and client_file(name));
drop policy if exists "architect uploads" on storage.objects;
create policy "architect uploads" on storage.objects for insert with check (bucket_id = 'photos' and my_role() = 'architect' and name like 'plans/%');

-- התראה לצוות (משמש את פעולות הלקוח/האדריכלית)
create or replace function notify_staff(t text, b text, r text) returns void
language sql security definer set search_path = public as
$$ insert into reminders (user_id, ref, title, body, remind_at)
   select id, r, t, b, now() from profiles where role in ('admin','team') $$;

-- לקוח/אדריכלית מסמנים פריט אחריות כבוצע + תשובה
create or replace function client_set_resp(rid uuid, is_done boolean, txt text) returns void
language plpgsql security definer set search_path = public as
$$ declare it resp_items; begin
  select * into it from resp_items where id = rid;
  if it.id is null or not my_client_project(it.project_id) then return; end if;
  if not ((my_role() = 'client' and it.grp in ('client','client_supply')) or (my_role() = 'architect' and it.grp = 'architect')) then return; end if;
  update resp_items set done = is_done, done_at = case when is_done then now() else null end,
         reply = coalesce(nullif(txt,''), reply) where id = rid;
  perform notify_staff(case when my_role() = 'architect' then 'האדריכלית עדכנה' else 'הלקוח עדכן' end,
    it.item || case when is_done then ' – בוצע' else '' end || coalesce(' · ' || nullif(txt,''), '') || ' · ' || (select name from projects where id = it.project_id),
    'resp:' || rid || ':' || extract(epoch from now())::bigint);
end $$;
grant execute on function client_set_resp(uuid, boolean, text) to authenticated;

-- לקוח מאשר/דוחה הצעת מחיר לבקשת שינוי
create or replace function client_change_ok(cid uuid, ok boolean) returns void
language plpgsql security definer set search_path = public as
$$ declare c change_requests; begin
  select * into c from change_requests where id = cid;
  if c.id is null or not my_client_project(c.project_id) or my_role() <> 'client' then return; end if;
  update change_requests set client_ok = ok, status = case when ok then 'אושר' else 'נדחה' end where id = cid;
  perform notify_staff(case when ok then 'הלקוח אישר שינוי' else 'הלקוח דחה שינוי' end, c.body || ' · ' || (select name from projects where id = c.project_id),
    'chg:' || cid || ':' || extract(epoch from now())::bigint);
end $$;
grant execute on function client_change_ok(uuid, boolean) to authenticated;

-- לקוח מוסיף ספק לפרויקט שלו (בלי כפילויות לפי טלפון)
create or replace function client_add_supplier(pid uuid, sname text, sfield text, sphone text) returns uuid
language plpgsql security definer set search_path = public as
$$ declare sid uuid; digits text := regexp_replace(coalesce(sphone,''), '\D', '', 'g'); begin
  if not my_client_project(pid) or my_role() <> 'client' or coalesce(trim(sname),'') = '' then return null; end if;
  if length(digits) >= 9 then
    select id into sid from suppliers where right(regexp_replace(coalesce(phone,''), '\D', '', 'g'), 9) = right(digits, 9) limit 1;
  end if;
  if sid is null then
    insert into suppliers (name, field, phone, notes) values (trim(sname), nullif(trim(sfield),''), nullif(trim(sphone),''), 'נוסף ע״י הלקוח') returning id into sid;
  end if;
  insert into project_suppliers (project_id, supplier_id, client_added) values (pid, sid, true)
    on conflict (project_id, supplier_id) do update set client_added = true;
  perform notify_staff('הלקוח הוסיף ספק', trim(sname) || coalesce(' · ' || nullif(trim(sfield),''), '') || ' · ' || (select name from projects where id = pid),
    'csup:' || sid || ':' || extract(epoch from now())::bigint);
  return sid;
end $$;
grant execute on function client_add_supplier(uuid, text, text, text) to authenticated;

-- התראה לצוות כשלקוח שולח הודעה או בקשת שינוי
create or replace function notify_client_msg() returns trigger
language plpgsql security definer set search_path = public as
$$ begin
  if exists (select 1 from profiles where id = auth.uid() and role in ('client','architect')) then
    perform notify_staff(case when tg_table_name = 'change_requests' then 'בקשת שינוי מהלקוח' else 'הודעה מהלקוח' end,
      left(coalesce(new.body,''), 120) || ' · ' || (select name from projects where id = new.project_id),
      'cmsg:' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists client_msg_notify on messages;
create trigger client_msg_notify after insert on messages for each row execute function notify_client_msg();
drop trigger if exists client_chg_notify on change_requests;
create trigger client_chg_notify after insert on change_requests for each row execute function notify_client_msg();

-- אינדקסים
create index if not exists sched_rows_project on sched_rows(project_id);
create index if not exists resp_items_project on resp_items(project_id);
create index if not exists payments_project on payments(project_id);
create index if not exists change_requests_project on change_requests(project_id);

-- התראה לצוות כשאדריכלית מעלה תוכנית
create or replace function notify_arch_plan() returns trigger
language plpgsql security definer set search_path = public as
$$ begin
  if exists (select 1 from profiles where id = auth.uid() and role = 'architect') then
    perform notify_staff('האדריכלית העלתה קובץ', coalesce(new.title,'') || ' · ' || (select name from projects where id = new.project_id), 'plan:' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists arch_plan_notify on plans;
create trigger arch_plan_notify after insert on plans for each row execute function notify_arch_plan();
