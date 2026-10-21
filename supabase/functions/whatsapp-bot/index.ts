import { createClient } from "npm:@supabase/supabase-js@2";

const G = "https://graph.facebook.com/v21.0";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const TOKEN = Deno.env.get("WA_TOKEN")!;
const PHONE_ID = Deno.env.get("WA_PHONE_ID")!;
const ALLOWED = (Deno.env.get("ALLOWED_NUMBERS") || "").split(",").map((x) => x.replace(/\D/g, "")).filter(Boolean);

async function reply(to: string, text: string) {
  await fetch(`${G}/${PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
  });
}

const HELP = `אני הבוט של פדר בניה. דוגמאות:
• משימה הנוף: להזמין בטון עד 25/10
• הוצאה 350 חשמל בנימין הנוף אשראי
• (שלח תמונת קבלה עם כיתוב כמו ההוצאה)
• מה פתוח הנוף`;

function ymd(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function il() { return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem" })); }

function findProject(text: string, projects: any[]) {
  const t = text.toLowerCase();
  let best: any = null;
  for (const p of projects) {
    const n = String(p.name || "").toLowerCase().trim();
    if (n && t.includes(n) && (!best || n.length > best.name.length)) best = { ...p, name: n };
  }
  return best;
}
function strip(text: string, bits: string[]) {
  let t = text;
  for (const b of bits) if (b) t = t.replace(new RegExp(b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " ");
  return t.replace(/[:：]/g, " ").replace(/\s+/g, " ").trim();
}
function parseDue(text: string) {
  const now = il();
  let m = text.match(/עד\s+(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?/);
  if (m) {
    let y = m[3] ? +m[3] : now.getFullYear(); if (y < 100) y += 2000;
    const d = new Date(y, +m[2] - 1, +m[1]);
    if (!m[3] && d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d.setFullYear(y + 1);
    return { due: ymd(d), cut: m[0] };
  }
  m = text.match(/עד\s+(מחר|מחרתיים|היום)/);
  if (m) {
    const add = m[1] === "היום" ? 0 : m[1] === "מחר" ? 1 : 2;
    return { due: ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + add)), cut: m[0] };
  }
  return { due: null, cut: "" };
}

async function handleText(text: string, photoPath: string | null) {
  const { data: projects } = await db.from("projects").select("id,name");
  const proj = findProject(text, projects || []);
  const lead = text.trim().split(/\s+/)[0];

  if (lead === "משימה") {
    if (!proj) return "לא זיהיתי פרויקט. כתוב את שם הפרויקט בהודעה, למשל: משימה הנוף: להזמין בטון";
    const { due, cut } = parseDue(text);
    const title = strip(text, ["^משימה", proj.name, cut]);
    if (!title) return "חסר תיאור למשימה.";
    const { error } = await db.from("tasks").insert({ project_id: proj.id, title, due, status: "לביצוע" });
    if (error) return "לא הצלחתי לשמור את המשימה.";
    return `נשמר ✓ משימה ב"${proj.name}": ${title}${due ? ` (עד ${due})` : ""}`;
  }

  if (lead === "הוצאה" || photoPath) {
    const am = text.match(/(\d+(?:[.,]\d+)?)/);
    if (!am) return "חסר סכום. למשל: הוצאה 350 חשמל בנימין הנוף אשראי";
    if (!proj) return "לא זיהיתי פרויקט. כתוב את שם הפרויקט בהודעה.";
    const amount = parseFloat(am[1].replace(",", "."));
    const pay = /אשראי/.test(text) ? "אשראי" : /מזומן/.test(text) ? "מזומן" : null;
    const vendor = strip(text, ["^הוצאה", am[0], proj.name, "אשראי", "מזומן", "₪", "שקל", "שח", "ש\"ח"]) || "ללא ספק";
    const { error } = await db.from("expenses").insert({
      project_id: proj.id, vendor, amount, pay, photo: photoPath, date: ymd(il()),
    });
    if (error) return "לא הצלחתי לשמור את ההוצאה.";
    return `נשמר ✓ הוצאה ב"${proj.name}": ${vendor} ${amount} ₪${pay ? " · " + pay : ""}${photoPath ? " · עם קבלה" : ""}`;
  }

  if (text.startsWith("מה פתוח") || text.startsWith("משימות")) {
    let q = db.from("tasks").select("title,due,project_id").neq("status", "הושלם").order("due", { ascending: true, nullsFirst: false }).limit(15);
    if (proj) q = q.eq("project_id", proj.id);
    const { data } = await q;
    if (!data?.length) return "אין משימות פתוחות.";
    const names: Record<string, string> = {}; (projects || []).forEach((p: any) => (names[p.id] = p.name));
    return "משימות פתוחות:\n" + data.map((t: any) => `• ${t.title}${proj ? "" : " (" + (names[t.project_id] || "") + ")"}${t.due ? " · עד " + t.due : ""}`).join("\n");
  }
  return HELP;
}

async function savePhoto(mediaId: string): Promise<string | null> {
  try {
    const meta = await (await fetch(`${G}/${mediaId}`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
    const bin = await fetch(meta.url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const buf = new Uint8Array(await bin.arrayBuffer());
    const path = `wa/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const up = await db.storage.from("photos").upload(path, buf, { contentType: meta.mime_type || "image/jpeg" });
    return up.error ? null : path;
  } catch { return null; }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    if (url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === Deno.env.get("WA_VERIFY_TOKEN")) {
      return new Response(url.searchParams.get("hub.challenge") || "");
    }
    return new Response("forbidden", { status: 403 });
  }
  try {
    const body = await req.json();
    const msgs = body?.entry?.[0]?.changes?.[0]?.value?.messages || [];
    for (const m of msgs) {
      const from = String(m.from || "").replace(/\D/g, "");
      if (!ALLOWED.includes(from)) continue;
      let out = HELP;
      if (m.type === "text") out = await handleText(m.text?.body || "", null);
      else if (m.type === "image") {
        const cap = m.image?.caption || "";
        const path = await savePhoto(m.image.id);
        out = cap ? await handleText(cap, path) : "קיבלתי את התמונה, אבל חסר כיתוב. שלח שוב עם כיתוב, למשל: 350 חשמל בנימין הנוף אשראי";
      }
      await reply(from, out);
    }
  } catch (_e) { /* always 200 to Meta */ }
  return new Response("ok");
});
