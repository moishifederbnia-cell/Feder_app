-- אינדקסים להאצת שליפות (בטוח להרצה חוזרת)
create index if not exists idx_tasks_project on tasks(project_id);
create index if not exists idx_tasks_assignee on tasks(assignee_id);
create index if not exists idx_tasks_created on tasks(created_at desc);
create index if not exists idx_expenses_project on expenses(project_id);
create index if not exists idx_expenses_created on expenses(created_at desc);
create index if not exists idx_docs_project on docs(project_id);
create index if not exists idx_messages_project on messages(project_id, created_at desc);
create index if not exists idx_orders_project on orders(project_id);
create index if not exists idx_events_start on events(start_at);
create index if not exists idx_plans_project on plans(project_id);
create index if not exists idx_project_suppliers_project on project_suppliers(project_id);
create index if not exists idx_supplier_docs_order on supplier_docs(order_id);
create index if not exists idx_supplier_docs_project on supplier_docs(project_id);
create index if not exists idx_gantt_project on gantt_items(project_id);
create index if not exists idx_reminders_due on reminders(remind_at) where sent = false;
