-- part29 (בוט 12.11.26): הודעות יוזמות, לקוחות ואדריכליות בוואטסאפ, מתזמן כל רבע שעה. בטוח להרצה חוזרת.

-- טלפון ושם של האדריכלית בכל פרויקט (טלפון הלקוח כבר קיים)
alter table projects add column if not exists architect_name text;
alter table projects add column if not exists architect_phone text;

-- מתי כל מספר כתב לבוט לאחרונה (חלון 24 השעות של וואטסאפ)
create table if not exists wa_window (phone text primary key, last_in timestamptz default now());
-- מה כבר נשלח (כדי לא לשלוח פעמיים) ומצב "באיחור" של כל פרויקט
create table if not exists bot_state (key text primary key, value text, updated_at timestamptz default now());
-- הגדרות פנימיות של הבוט (מפתח למתזמן)
create table if not exists bot_config (key text primary key, value text);
alter table wa_window enable row level security;
alter table bot_state enable row level security;
alter table bot_config enable row level security;   -- בלי מדיניות: רק הבוט (service role) ניגש

insert into bot_config (key, value) values ('cron_key', replace(gen_random_uuid()::text, '-', ''))
  on conflict (key) do nothing;

-- המתזמן: כל רבע שעה הבוט בודק אם צריך לשלוח בוקר טוב / תזכורת לפגישה / סיכום יום / התראת איחור
create extension if not exists pg_cron;
create extension if not exists pg_net;
do $$ begin
  perform cron.unschedule('feder-bot');
exception when others then null; end $$;
select cron.schedule('feder-bot', '*/15 * * * *', $cron$
  select net.http_post(
    url := 'https://jaaidfpfeihxfhzxsuak.supabase.co/functions/v1/smooth-worker',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object('action', 'cron', 'key', (select value from public.bot_config where key = 'cron_key'))
  );
$cron$);
