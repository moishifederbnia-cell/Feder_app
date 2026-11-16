-- ===================== part30_security.sql (16.11.26) =====================
-- אבטחה: סוגר פונקציות שאסור שיהיו פתוחות למי שלא מחובר (anon).
-- בטוח להרצה חוזרת. חייב לרוץ אחרי כל שאר החלקים (כי drop/create מחזיר הרשאות ברירת מחדל).

-- 1) פונקציות פעולה: רק משתמש מחובר (האפליקציה קוראת להן אחרי כניסה). מי שלא מחובר – חסום.
revoke execute on function public.admin_delete_user(uuid) from public, anon;
revoke execute on function public.client_add_supplier(uuid, text, text, text) from public, anon;
revoke execute on function public.client_change_ok(uuid, boolean) from public, anon;
revoke execute on function public.client_set_resp(uuid, boolean, text) from public, anon;
revoke execute on function public.worker_set_done(uuid, boolean) from public, anon;
revoke execute on function public.worker_tasks() from public, anon;
revoke execute on function public.worker_projects() from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;
grant execute on function public.client_add_supplier(uuid, text, text, text) to authenticated;
grant execute on function public.client_change_ok(uuid, boolean) to authenticated;
grant execute on function public.client_set_resp(uuid, boolean, text) to authenticated;
grant execute on function public.worker_set_done(uuid, boolean) to authenticated;
grant execute on function public.worker_tasks() to authenticated;
grant execute on function public.worker_projects() to authenticated;

-- 2) פונקציות פנימיות (טריגרים והתראות): אף אחד מבחוץ לא קורא להן ישירות.
--    הן ממשיכות לעבוד מתוך הטריגרים ומתוך הפונקציות האחרות.
revoke execute on function public.notify_staff(text, text, text) from public, anon, authenticated;
revoke execute on function public.notify_arch_plan() from public, anon, authenticated;
revoke execute on function public.notify_client_msg() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
