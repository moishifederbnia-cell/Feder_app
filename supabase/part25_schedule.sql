alter table gantt_items add column if not exists milestone text;
alter table gantt_items add column if not exists client_task text;
alter table gantt_items add column if not exists color text;
