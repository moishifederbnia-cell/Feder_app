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

async function downloadMedia(mediaId: string): Promise<{ buf: Uint8Array; mime: string } | null> {
  try {
    const meta = await (await fetch(`${G}/${mediaId}`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
    const bin = await fetch(meta.url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    return { buf: new Uint8Array(await bin.arrayBuffer()), mime: meta.mime_type || "image/jpeg" };
  } catch { return null; }
}
async function uploadPhoto(buf: Uint8Array, mime: string): Promise<string | null> {
  try {
    const path = `wa/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const up = await db.storage.from("photos").upload(path, buf, { contentType: mime });
    return up.error ? null : path;
  } catch { return null; }
}
function b64(buf: Uint8Array) {
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

// ---------- AI layer (optional: needs ANTHROPIC_API_KEY) ----------
const AI_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const AI_MODEL = Deno.env.get("AI_MODEL") || "claude-haiku-5-5";

const ACT_TOOL = {
  name: "act",
  description: "Decide what the construction manager wants and extract the details.",
  input_schema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["add_task", "add_expense", "list_open_tasks", "complete_task", "project_summary", "chat"] },
      project_name: { type: "string", description: "Project name exactly as in the projects list, or empty if not stated/unclear" },
      title: { type: "string", description: "Task text (add_task) or text identifying the task to close (complete_task)" },
      due: { type: "string", description: "Due date YYYY-MM-DD, or empty" },
      amount: { type: "number", description: "Expense amount in shekels" },
      vendor: { type: "string", description: "Supplier/store name" },
      pay: { type: "string", enum: ["מזומן", "אשראי", ""], description: "Payment method if stated or visible, else empty" },
      date: { type: "string", description: "Expense date YYYY-MM-DD if visible on a receipt, else empty" },
      note: { type: "string", description: "Short note for the expense, or empty" },
      reply: { type: "string", description: "For action=chat only: a short Hebrew answer or a question asking for the missing detail" },
    },
    required: ["action"],
  },
};

async function aiParse(text: string, img: { buf: Uint8Array; mime: string } | null, projects: any[]) {
  const today = ymd(il());
  const system = `אתה עוזר של מנהל עבודה בחברת בנייה (פדר בניה). הוא כותב לך בעברית קצרה מהשטח, לפעמים עם תמונת קבלה.
תפקידך לבחור פעולה אחת בלבד ולמלא את הפרטים. התאריך היום: ${today} (שעון ישראל).
פרויקטים קיימים: ${projects.map((p) => p.name).join(" | ") || "(אין)"}.
כללים:
- add_task: משימה חדשה. due אם צוין תאריך או "מחר"/"יום ראשון" וכו' (חשב לפי התאריך של היום).
- add_expense: הוצאה או קבלה. אם יש תמונת קבלה, קרא ממנה את הסכום הכולל (בשקלים), שם העסק, התאריך ואמצעי התשלום אם מופיע. טקסט המשתמש גובר על התמונה.
- list_open_tasks: שאלה מה פתוח/מה צריך לעשות.
- complete_task: ביקש לסגור/לסמן כבוצעה משימה. title = מילים מזהות של המשימה.
- project_summary: שאלה כמה הוצאנו / מצב / סיכום של פרויקט.
- chat: כל דבר אחר, או כשחסר פרט הכרחי (למשל פרויקט לא ברור). ב-reply כתוב משפט קצר בעברית ושאל מה חסר.
project_name חייב להיות אחד מהשמות ברשימה בדיוק, או ריק אם לא ברור.`;
  const content: any[] = [];
  if (img) content.push({ type: "image", source: { type: "base64", media_type: img.mime, data: b64(img.buf) } });
  content.push({ type: "text", text: text || "(תמונה בלי טקסט)" });
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": AI_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: AI_MODEL, max_tokens: 500, system, tools: [ACT_TOOL], tool_choice: { type: "tool", name: "act" }, messages: [{ role: "user", content }] }),
  });
  if (!res.ok) throw new Error("ai " + res.status);
  const j = await res.json();
  const tu = (j.content || []).find((c: any) => c.type === "tool_use");
  if (!tu) throw new Error("no tool use");
  return tu.input as any;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function pickProject(name: string, text: string, projects: any[]) {
  const n = String(name || "").trim().toLowerCase();
  if (n) {
    const exact = projects.find((p) => String(p.name).trim().toLowerCase() === n);
    if (exact) return exact;
    const part = projects.find((p) => String(p.name).toLowerCase().includes(n) || n.includes(String(p.name).toLowerCase()));
    if (part) return part;
  }
  const f = findProject(text, projects);
  if (f) return projects.find((p) => p.id === f.id) || null;
  return projects.length === 1 ? projects[0] : null;
}

async function handleAI(text: string, img: { buf: Uint8Array; mime: string } | null, photoPath: string | null) {
  const { data: projects } = await db.from("projects").select("id,name");
  const P = projects || [];
  const a = await aiParse(text, img, P);
  const proj = pickProject(a.project_name, text, P);
  const needProj = "לאיזה פרויקט? כתוב את שם הפרויקט (" + P.map((p: any) => p.name).join(", ") + ").";

  switch (a.action) {
    case "add_task": {
      if (!proj) return needProj;
      const title = String(a.title || "").trim();
      if (!title) return "מה המשימה?";
      const due = DATE_RE.test(a.due || "") ? a.due : null;
      const { error } = await db.from("tasks").insert({ project_id: proj.id, title, due, status: "לביצוע" });
      if (error) return "לא הצלחתי לשמור את המשימה.";
      return `נשמר ✓ משימה ב"${proj.name}": ${title}${due ? ` (עד ${due})` : ""}`;
    }
    case "add_expense": {
      if (!proj) return needProj;
      const amount = Number(a.amount);
      if (!isFinite(amount) || amount <= 0) return "לא הצלחתי לקרוא סכום. כתוב אותו בהודעה, למשל: 350 חשמל בנימין " + proj.name;
      const pay = a.pay === "מזומן" || a.pay === "אשראי" ? a.pay : null;
      const vendor = String(a.vendor || "").trim() || "ללא ספק";
      const date = DATE_RE.test(a.date || "") ? a.date : ymd(il());
      const { error } = await db.from("expenses").insert({ project_id: proj.id, vendor, amount, pay, photo: photoPath, date, note: a.note || null });
      if (error) return "לא הצלחתי לשמור את ההוצאה.";
      return `נשמר ✓ הוצאה ב"${proj.name}": ${vendor} ${amount} ₪${pay ? " · " + pay : ""}${photoPath ? " · עם קבלה" : ""}`;
    }
    case "list_open_tasks": {
      let q = db.from("tasks").select("title,due,project_id").neq("status", "הושלם").order("due", { ascending: true, nullsFirst: false }).limit(15);
      if (proj) q = q.eq("project_id", proj.id);
      const { data } = await q;
      if (!data?.length) return "אין משימות פתוחות.";
      const names: Record<string, string> = {}; P.forEach((p: any) => (names[p.id] = p.name));
      return "משימות פתוחות:\n" + data.map((t: any) => `• ${t.title}${proj ? "" : " (" + (names[t.project_id] || "") + ")"}${t.due ? " · עד " + t.due : ""}`).join("\n");
    }
    case "complete_task": {
      const key = String(a.title || "").trim().toLowerCase();
      if (!key) return "איזו משימה לסגור?";
      let q = db.from("tasks").select("id,title,project_id").neq("status", "הושלם");
      if (proj) q = q.eq("project_id", proj.id);
      const { data } = await q;
      const hits = (data || []).filter((t: any) => String(t.title).toLowerCase().includes(key) || key.includes(String(t.title).toLowerCase()));
      if (hits.length === 0) return "לא מצאתי משימה פתוחה כזאת.";
      if (hits.length > 1) return "מצאתי כמה משימות:\n" + hits.slice(0, 6).map((t: any) => "• " + t.title).join("\n") + "\nכתוב את השם המדויק של אחת מהן.";
      const { error } = await db.from("tasks").update({ status: "הושלם", done_at: new Date().toISOString() }).eq("id", hits[0].id);
      if (error) return "לא הצלחתי לסגור את המשימה.";
      return `נשמר ✓ המשימה "${hits[0].title}" סומנה כבוצעה.`;
    }
    case "project_summary": {
      if (!proj) return needProj;
      const { data: ex } = await db.from("expenses").select("amount,pay").eq("project_id", proj.id);
      const { data: tk } = await db.from("tasks").select("status").eq("project_id", proj.id);
      const total = (ex || []).reduce((s: number, x: any) => s + (Number(x.amount) || 0), 0);
      const sumBy = (p: string) => (ex || []).filter((x: any) => x.pay === p).reduce((s: number, x: any) => s + (Number(x.amount) || 0), 0);
      const done = (tk || []).filter((t: any) => t.status === "הושלם").length;
      const open = (tk || []).length - done;
      return `${proj.name}:\nהוצאות: ${total.toLocaleString("he-IL")} ₪ (מזומן ${sumBy("מזומן").toLocaleString("he-IL")}, אשראי ${sumBy("אשראי").toLocaleString("he-IL")})\nמשימות: ${open} פתוחות, ${done} הושלמו`;
    }
    default:
      return a.reply || HELP;
  }
}

async function route(text: string, mediaId: string | null) {
  let img: { buf: Uint8Array; mime: string } | null = null;
  let photoPath: string | null = null;
  if (mediaId) {
    img = await downloadMedia(mediaId);
    if (img) photoPath = await uploadPhoto(img.buf, img.mime);
  }
  if (AI_KEY) {
    try { return await handleAI(text, img, photoPath); } catch (_e) { /* fall back to rules */ }
  }
  if (mediaId && !text) return "קיבלתי את התמונה, אבל חסר כיתוב. שלח שוב עם כיתוב, למשל: 350 חשמל בנימין הנוף אשראי";
  return await handleText(text, photoPath);
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
      if (m.type === "text") out = await route(m.text?.body || "", null);
      else if (m.type === "image") out = await route(m.image?.caption || "", m.image.id);
      await reply(from, out);
    }
  } catch (_e) { /* always 200 to Meta */ }
  return new Response("ok");
});
