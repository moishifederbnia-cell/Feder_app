// parse-task: turns one spoken/typed sentence into a task (title, project, person, date).
// Used by the CEO "הוסף משימה" button. Uses the same ANTHROPIC_API_KEY secret as the bot.
// Create it in Supabase as a NEW function named exactly: parse-task   (turn "Verify JWT" OFF, like the bot; the code checks the user itself)
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const AI_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const AI_MODEL = Deno.env.get("AI_MODEL") || "claude-haiku-5-5";
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const tok = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await db.auth.getUser(tok);
    if (!u?.user) return json({ error: "auth" }, 401);
    const { data: prof } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
    if (!prof || !["admin", "team", "ceo"].includes(prof.role)) return json({ error: "role" }, 403);

    const b = await req.json();
    const text = String(b.text || "").slice(0, 500);
    const projects = (b.projects || []).slice(0, 80);
    const team = (b.team || []).slice(0, 80);
    if (!text || !AI_KEY) return json({});

    const system =
      "You turn one Hebrew sentence from a construction company manager into a task. Today is " + b.today +
      ". Projects (id: name): " + projects.map((p: any) => p.id + ": " + p.name).join(" | ") +
      ". Team (id: name): " + team.map((m: any) => m.id + ": " + m.name + (m.me ? " (the speaker)" : "")).join(" | ") +
      ". Pick the project and person only if clearly mentioned (a family name usually means the project). " +
      "due = YYYY-MM-DD (היום, מחר, יום ראשון..., בעוד שבוע), empty if not mentioned. " +
      "title = the task itself in short clean Hebrew, without the project, person or date words.";
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": AI_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: AI_MODEL, max_tokens: 400, system,
        tools: [{
          name: "task", description: "The task",
          input_schema: {
            type: "object",
            properties: {
              title: { type: "string" }, projectId: { type: "string" },
              assigneeId: { type: "string" }, due: { type: "string" },
            },
            required: ["title"],
          },
        }],
        tool_choice: { type: "tool", name: "task" },
        messages: [{ role: "user", content: text }],
      }),
    });
    const out = await res.json();
    const t = (out.content || []).find((c: any) => c.type === "tool_use")?.input || {};
    const okP = projects.some((p: any) => p.id === t.projectId);
    const okM = team.some((m: any) => m.id === t.assigneeId);
    return json({
      title: String(t.title || "").slice(0, 200),
      projectId: okP ? t.projectId : "",
      assigneeId: okM ? t.assigneeId : "",
      due: /^\d{4}-\d{2}-\d{2}$/.test(t.due || "") ? t.due : "",
    });
  } catch (_e) {
    return json({ error: "fail" }, 500);
  }
});
