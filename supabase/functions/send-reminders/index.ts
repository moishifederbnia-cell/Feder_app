import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

webpush.setVapidDetails(
  "mailto:" + (Deno.env.get("VAPID_EMAIL") || "admin@example.com"),
  Deno.env.get("VAPID_PUBLIC")!,
  Deno.env.get("VAPID_PRIVATE")!,
);

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("no", { status: 401 });
  }
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: due } = await db.from("reminders").select("*")
    .eq("sent", false).lte("remind_at", new Date().toISOString()).limit(100);
  let n = 0;
  for (const r of due || []) {
    const { data: subs } = await db.from("push_subscriptions").select("*").eq("user_id", r.user_id);
    for (const s of subs || []) {
      try {
        await webpush.sendNotification(s.sub, JSON.stringify({ title: r.title, body: r.body || "" }));
        n++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) {
          await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        }
      }
    }
    await db.from("reminders").update({ sent: true }).eq("id", r.id);
  }
  return new Response("sent " + n);
});
