import { createClient } from "npm:@supabase/supabase-js@2";

// ===== Feder Bniya WhatsApp bot (v2): AI-driven, full app actions, roles (staff / worker), Arabic for workers =====
const G = "https://graph.facebook.com/v21.0";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const TOKEN = Deno.env.get("WA_TOKEN")!;
const PHONE_ID = Deno.env.get("WA_PHONE_ID")!;
const ALLOWED = (Deno.env.get("ALLOWED_NUMBERS") || "").split(",").map((x) => x.replace(/\D/g, "")).filter(Boolean);
const AI_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const AI_MODEL = Deno.env.get("AI_MODEL") || "claude-haiku-5-5";

type Ctx = { from: string; role: "staff" | "worker"; lang: "he" | "ar"; member: any | null; name: string; team: any[] };
const L = (c: Ctx, he: string, ar: string) => (c.lang === "ar" ? ar : he);

// ---------- WhatsApp I/O ----------
async function reply(to: string, text: string) {
  await fetch(`${G}/${PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text.slice(0, 3900) } }),
  });
}
async function downloadMedia(mediaId: string): Promise<{ buf: Uint8Array; mime: string } | null> {
  try {
    const meta = await (await fetch(`${G}/${mediaId}`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
    const bin = await fetch(meta.url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    return { buf: new Uint8Array(await bin.arrayBuffer()), mime: meta.mime_type || "image/jpeg" };
  } catch { return null; }
}
async function uploadMedia(buf: Uint8Array, mime: string): Promise<string | null> {
  try {
    const ext = mime.startsWith("video/") ? (mime.includes("quicktime") ? "mov" : mime.includes("webm") ? "webm" : "mp4") : "jpg";
    const path = `wa/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const up = await db.storage.from("photos").upload(path, buf, { contentType: mime });
    return up.error ? null : path;
  } catch { return null; }
}
function b64(buf: Uint8Array) {
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

// ---------- dates ----------
const STAGES = ["שלד", "אינסטלציה", "חשמל", "איטום", "טיח", "ריצוף", "גמר", "אחר"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{1,2}:\d{2}$/;
function ymd(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function il() { return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem" })); }
function addDays(s: string, n: number) { const [y, m, d] = s.split("-").map(Number); return ymd(new Date(y, m - 1, d + n)); }
function fmtD(s: string | null) { if (!s) return ""; const [, m, d] = s.split("-"); return `${d}/${m}`; }
// Israel local date+time -> UTC ISO
function ilToUtc(date: string, time: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(guess));
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asIl = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"));
  return new Date(guess - (asIl - guess)).toISOString();
}

// ---------- helpers ----------
const norm = (s: any) => String(s || "").toLowerCase().trim();
function matchProject(name: string, text: string, projects: any[]) {
  const n = norm(name);
  if (n) {
    const exact = projects.find((p) => norm(p.name) === n);
    if (exact) return exact;
    const part = projects.find((p) => norm(p.name).includes(n) || n.includes(norm(p.name)));
    if (part) return part;
  }
  const t = norm(text);
  let best: any = null;
  for (const p of projects) { const pn = norm(p.name); if (pn && t.includes(pn) && (!best || pn.length > norm(best.name).length)) best = p; }
  if (best) return best;
  return projects.length === 1 ? projects[0] : null;
}
function matchMember(name: string, team: any[]) {
  const n = norm(name);
  if (!n) return null;
  return team.find((m) => norm(m.name) === n || norm(m.name_ar) === n) ||
    team.find((m) => norm(m.name).includes(n) || n.includes(norm(m.name)) || (m.name_ar && (norm(m.name_ar).includes(n) || n.includes(norm(m.name_ar))))) || null;
}
const mName = (m: any, c: Ctx) => (m ? (c.lang === "ar" ? m.name_ar || m.name : m.name) : "");
const tTitle = (t: any, c: Ctx) => (c.lang === "ar" ? t.title_ar || t.title : t.title);
const num = (n: number) => Math.round(n).toLocaleString("he-IL");

async function pushTo(userIds: string[], title: string, body: string) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  try {
    await db.from("reminders").insert(ids.map((u) => ({ user_id: u, ref: `bot:${Date.now()}:${u.slice(0, 6)}`, title, body, remind_at: new Date().toISOString() })));
  } catch (_e) { /* ignore */ }
}
async function adminIds(): Promise<string[]> {
  const { data } = await db.from("profiles").select("id").eq("role", "admin");
  return (data || []).map((x: any) => x.id);
}
async function userIsWorker(uid: string) {
  const { data } = await db.from("profiles").select("role").eq("id", uid).maybeSingle();
  return data?.role === "worker";
}

// ---------- identity ----------
async function identify(from: string): Promise<Ctx | null> {
  const last9 = from.slice(-9);
  const { data: team } = await db.from("team_members").select("id,name,name_ar,phone,user_id");
  const T = team || [];
  const member = T.find((m: any) => m.phone && String(m.phone).replace(/\D/g, "").slice(-9) === last9) || null;
  const boss = ALLOWED.includes(from);
  if (!boss && !member) return null;
  let role: "staff" | "worker" = boss ? "staff" : "worker";
  if (member?.user_id) {
    const { data: pr } = await db.from("profiles").select("role").eq("id", member.user_id).maybeSingle();
    role = pr && (pr.role === "admin" || pr.role === "team") ? "staff" : "worker";
  }
  return { from, role, lang: role === "worker" ? "ar" : "he", member, name: member ? member.name : "", team: T };
}

// ---------- Arabic translation (spoken, simple) ----------
const TR_TOOL = {
  name: "tr",
  description: "Return the Arabic translations.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: { type: "object", properties: { id: { type: "string" }, text_ar: { type: "string" }, extra_ar: { type: "string" } }, required: ["id", "text_ar"] },
      },
    },
    required: ["items"],
  },
};
async function translateItems(items: { id: string; text: string; extra?: string }[]): Promise<Record<string, { t: string; e: string }>> {
  const out: Record<string, { t: string; e: string }> = {};
  if (!AI_KEY || !items.length) return out;
  const system = `תרגם מעברית לערבית מדוברת ופשוטה (ניב פלסטיני/ערבי-ישראלי יומיומי), בכתב ערבי, עבור פועלי בנייה בישראל.
כללים: משפטים קצרים וטבעיים כמו שמדברים באתר בנייה, לא ערבית ספרותית גבוהה. שמות אנשים, שמות מקומות ושמות פרויקטים: תעתיק לאותיות ערביות (אל תתרגם משמעות). מספרים, תאריכים וכתובות: השאר מספרים כמו שהם.
מילים נפוצות: בטון=باطون, טיח=لياسة, ריצוף=تبليط, חשמל=كهربا, חשמלאי=كهربائي, אינסטלציה=سباكة, שרברב=سبّاك, איטום=عزل, שלד=هيكل, צבע=دهان, גבס=جبس, ברזל=حديد, פינוי פסולת=ترحيل نفايات, להזמין=يطلب/يحجز, לשלם=يدفع, לבדוק=يفحص.
אם הטקסט ריק, החזר מחרוזת ריקה. text_ar הוא תרגום text, extra_ar הוא תרגום extra (אם יש).`;
  for (let i = 0; i < items.length; i += 30) {
    const chunk = items.slice(i, i + 30);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": AI_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: AI_MODEL, max_tokens: 4000, system, tools: [TR_TOOL], tool_choice: { type: "tool", name: "tr" },
        messages: [{ role: "user", content: JSON.stringify(chunk.map((x) => ({ id: x.id, text: x.text || "", extra: x.extra || "" }))) }],
      }),
    });
    if (!res.ok) continue;
    const j = await res.json();
    const tu = (j.content || []).find((x: any) => x.type === "tool_use");
    for (const it of tu?.input?.items || []) out[String(it.id)] = { t: String(it.text_ar || "").trim(), e: String(it.extra_ar || "").trim() };
  }
  return out;
}
async function translateRows(table: "tasks" | "projects", rows: any[]): Promise<number> {
  const items = rows.map((r) => (table === "tasks" ? { id: r.id, text: r.title, extra: r.notes } : { id: r.id, text: r.name, extra: r.address }));
  const tr = await translateItems(items);
  let n = 0;
  for (const r of rows) {
    const x = tr[r.id];
    if (!x || !x.t) continue;
    const patch = table === "tasks" ? { title_ar: x.t, notes_ar: x.e || null } : { name_ar: x.t, address_ar: x.e || null };
    const { error } = await db.from(table).update(patch).eq("id", r.id);
    if (!error) n++;
  }
  return n;
}
async function authStaff(req: Request): Promise<boolean> {
  try {
    const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!tok) return false;
    const { data } = await db.auth.getUser(tok);
    const uid = data?.user?.id;
    if (!uid) return false;
    const { data: pr } = await db.from("profiles").select("role").eq("id", uid).maybeSingle();
    return pr?.role === "admin" || pr?.role === "team";
  } catch { return false; }
}
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, GET, OPTIONS" };
const jres = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ---------- AI ----------
const STAFF_ACTIONS = [
  "add_task", "list_tasks", "complete_task", "reopen_task", "edit_task", "delete_task",
  "add_expense", "edit_expense", "delete_expense", "expense_summary", "project_summary",
  "create_project", "set_project_status",
  "find_supplier", "add_supplier", "link_supplier",
  "add_order", "update_order", "list_orders",
  "add_doc", "add_supplier_doc",
  "add_event", "list_events", "chat",
];
const WORKER_ACTIONS = ["list_tasks", "complete_task", "reopen_task", "add_doc", "chat"];

function actTool(actions: string[]) {
  return {
    name: "act",
    description: "Decide what the sender wants and extract the details.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: actions },
        project_name: { type: "string", description: "Project name exactly as in the list, or empty" },
        tasks: {
          type: "array", description: "For add_task: one entry per task",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Task in Hebrew" },
              title_ar: { type: "string", description: "The same task translated to clear Arabic" },
              due: { type: "string", description: "YYYY-MM-DD or empty" },
              assignee: { type: "string", description: "Team member name exactly as in the team list, or empty" },
              time: { type: "string", description: "HH:MM if the task is a meeting/appointment at a specific time (then it is saved as a task AND a calendar event with a reminder)" },
              decision: { type: "boolean", description: "true if the task is waiting for a decision (ממתין להחלטה / צריך להחליט)" },
            },
            required: ["title"],
          },
        },
        title: { type: "string", description: "Words identifying an existing task (complete/reopen/edit/delete), or a doc/event title" },
        new_title: { type: "string", description: "edit_task: new task text in Hebrew" },
        new_title_ar: { type: "string", description: "edit_task: new task text in Arabic" },
        due: { type: "string", description: "YYYY-MM-DD (edit_task new due / event date) or empty" },
        assignee_name: { type: "string", description: "Team member (edit_task new assignee, or list_tasks filter)" },
        mine: { type: "boolean", description: "list_tasks: the sender asks about their own tasks (שלי / لي)" },
        scope: { type: "string", enum: ["today", "tomorrow", "week", "overdue", "open", "done", "decision"], description: "list_tasks/list_events scope" },
        amount: { type: "number" }, new_amount: { type: "number" },
        vendor: { type: "string", description: "Supplier/store name on an expense" },
        new_vendor: { type: "string" },
        pay: { type: "string", enum: ["מזומן", "אשראי", ""] },
        date: { type: "string", description: "Date YYYY-MM-DD if stated/visible, else empty" },
        note: { type: "string" },
        stage: { type: "string", description: "Work stage: שלד, אינסטלציה, חשמל, איטום, טיח, ריצוף, גמר, אחר" },
        last: { type: "boolean", description: "The user means the latest/last one" },
        supplier_name: { type: "string" }, supplier_field: { type: "string" }, supplier_phone: { type: "string" },
        kind: { type: "string", enum: ["תעודת משלוח", "תיעוד"], description: "add_supplier_doc kind" },
        item: { type: "string", description: "Order item (add_order) or words identifying an order (update_order)" },
        status: { type: "string", description: "Order status (לא הוזמן/הוזמן/הגיע) or project status (בהתחלה/בביצוע/סיום)" },
        time: { type: "string", description: "Event start HH:MM (24h) or empty for all-day" },
        end_time: { type: "string" }, location: { type: "string" },
        remind_minutes: { type: "number", description: "Minutes before the event to remind; -1 for none; default 30" },
        group_by: { type: "string", enum: ["vendor", "pay", "none"], description: "expense_summary grouping" },
        period: { type: "string", enum: ["week", "month", "all"], description: "expense_summary period" },
        address: { type: "string" }, client_name: { type: "string" },
        reply: { type: "string", description: "For action=chat: short answer or a question asking for the missing detail" },
      },
      required: ["action"],
    },
  };
}

function systemPrompt(c: Ctx, projects: any[]) {
  const d = il();
  const wd = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"][d.getDay()];
  const team = c.team.map((m) => m.name + (m.name_ar ? ` (${m.name_ar})` : "")).join(" | ");
  const common = `היום: ${ymd(d)} (יום ${wd}), שעון ישראל. חשב תאריכים יחסיים ("מחר", "יום ראשון הבא", "בעוד שבוע") לפי היום.
פרויקטים: ${projects.map((p) => p.name).join(" | ") || "(אין)"}.
אנשי צוות: ${team || "(אין)"}.
project_name חייב להיות אחד מהשמות ברשימה בדיוק, או ריק אם לא ברור. בחר פעולה אחת בלבד.`;
  if (c.role === "worker") {
    return `אתה עוזר בוואטסאפ של חברת בנייה (פדר בניה) שמדבר עם פועל שטח בשם ${c.name || "הפועל"}. הוא כותב בערבית או בעברית.
הוא מורשה רק: לראות משימות (list_tasks), לסגור משימה (complete_task) או לפתוח מחדש (reopen_task), לשלוח תיעוד של עבודה בתמונה או וידאו (add_doc), או לשאול שאלה כללית (chat).
אסור לו לראות או לשנות כסף, הוצאות, ספקים או תקציבים. אם ביקש משהו כזה, action=chat עם reply בערבית: "هذا غير متاح لك".
"مهامي"/"שלי" => mine=true. בתיעוד: כתוב title ו-note בעברית (תרגם מערבית), stage אם ברור.
כשאתה כותב reply בערבית, השתמש בערבית פשוטה וברורה.
${common}`;
  }
  return `אתה עוזר של מנהל עבודה בחברת בנייה (פדר בניה). הוא כותב לך בעברית קצרה מהשטח, לפעמים עם תמונת קבלה או תיעוד.
בחר את הפעולה והמלא פרטים:
- add_task: משימה חדשה (אפשר כמה, ב-tasks). לכל משימה: title בעברית, title_ar תרגום לערבית, due אם צוין, assignee אם שייך לאדם מהצוות ("תן לאבו יאסר...", "אמיתי ידאג ל..."), time=HH:MM אם המשימה היא פגישה/מפגש בשעה מסוימת ("פגישה מחר ב-10 עם ספק האלומיניום": due ו-time, ותישמר גם כמשימה וגם ביומן עם תזכורת פוש), decision=true אם זו משימה שממתינה להחלטה ("ממתין להחלטה", "צריך להחליט", "לחכות להחלטה").
- list_tasks: מה יש/פתוח/באיחור/להיום. scope: today (להיום, כולל באיחור), tomorrow, week, overdue, open, done, decision (משימות שממתינות להחלטה). assignee_name אם שאל על אדם. mine=true אם שאל "מה יש לי".
- complete_task / reopen_task: סגירה או פתיחה מחדש של משימה קיימת. title = מילים מזהות.
- edit_task: שינוי משימה קיימת. title מזהה; new_title/new_title_ar, due, assignee_name לחדשים.
- delete_task: מחיקת משימה. title מזהה.
- add_expense: הוצאה או קבלה. בתמונת קבלה קרא סכום כולל (₪), עסק, תאריך ואמצעי תשלום. אמצעי תשלום: אם מופיעות ספרות כרטיס (למשל ****1234), VISA/Mastercard/ישראכרט/כאל/מקס/"אשראי"/"כרטיס"/אישור סליקה => אשראי; אם כתוב "מזומן" או "עודף" => מזומן; אחרת השאר ריק. טקסט המשתמש גובר על התמונה.
- edit_expense / delete_expense: הוצאה קיימת. vendor ו/או amount מזהים, או last=true ל"האחרונה". לחדשים: new_amount, new_vendor, pay.
- expense_summary: כמה הוצאנו. project_name אופציונלי, vendor אופציונלי, pay אופציונלי, period (week/month/all), group_by.
- project_summary: מצב פרויקט (הוצאות ומשימות).
- create_project: פרויקט חדש (project_name = שם חדש, address, client_name). set_project_status: status אחד מ: בהתחלה, בביצוע, בפינישים, הסתיים.
- find_supplier: טלפון/פרטי ספק (supplier_name). add_supplier: ספק חדש או עדכון ספק קיים (supplier_name, supplier_field = התחום/קטגוריה כמו אלומיניום, supplier_phone). אם מבקשים גם לשייך אותו לפרויקט, מלא project_name והוא ישויך באותה פעולה. אם הטקסט כולל שורה '(איש קשר שנשלח: שם, טלפון)', קח ממנה את השם והטלפון. link_supplier: שיוך ספק קיים לפרויקט.
- add_order: הזמנת חומר (item, supplier_name אופציונלי, status). update_order: item מזהה + status חדש. list_orders: הזמנות פתוחות.
- add_doc: תיעוד עבודה באתר (תמונה או וידאו שאינם קבלה). title קצר, stage אם ברור.
- add_supplier_doc: תעודת משלוח או תיעוד שקשור לספק (supplier_name, kind).
- add_event: פגישה/אירוע ביומן. title, due=התאריך (YYYY-MM-DD), time (HH:MM) אם יש, location, remind_minutes.
- list_events: מה ביומן. scope today/tomorrow/week.
- chat: כל דבר אחר או כשחסר פרט הכרחי. ב-reply משפט קצר בעברית ושאלה על מה שחסר.
${common}`;
}

async function aiParse(c: Ctx, text: string, media: { buf: Uint8Array; mime: string } | null, isVideo: boolean, projects: any[]) {
  const content: any[] = [];
  if (media && !isVideo) content.push({ type: "image", source: { type: "base64", media_type: media.mime, data: b64(media.buf) } });
  content.push({ type: "text", text: (text || "") + (isVideo ? "\n(נשלח וידאו)" : "") || "(תמונה בלי טקסט)" });
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": AI_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: AI_MODEL, max_tokens: 900, system: systemPrompt(c, projects),
      tools: [actTool(c.role === "worker" ? WORKER_ACTIONS : STAFF_ACTIONS)], tool_choice: { type: "tool", name: "act" },
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) throw new Error("ai " + res.status);
  const j = await res.json();
  const tu = (j.content || []).find((x: any) => x.type === "tool_use");
  if (!tu) throw new Error("no tool use");
  return tu.input as any;
}

// ---------- pending confirmations ----------
async function savePending(from: string, payload: any) {
  await db.from("bot_pending").upsert({ phone: from, payload, created_at: new Date().toISOString() });
}
async function takePending(from: string): Promise<any | null> {
  const { data } = await db.from("bot_pending").select("payload,created_at").eq("phone", from).maybeSingle();
  if (!data) return null;
  await db.from("bot_pending").delete().eq("phone", from);
  if (Date.now() - Date.parse(data.created_at) > 10 * 60 * 1000) return null;
  return data.payload;
}
const YES = /^(כן|אישור|אשר|בטח|סבבה|yes|ok|okay|نعم|اي|أيوه)\s*[.!]?$/i;
const NO = /^(לא|בטל|ביטול|עזוב|no|cancel|لا)\s*[.!]?$/i;

async function execPending(p: any, c: Ctx): Promise<string> {
  if (p.kind === "delete_task") {
    const { error } = await db.from("tasks").delete().eq("id", p.id);
    return error ? "לא הצלחתי למחוק." : `נמחק ✓ ${p.label}`;
  }
  if (p.kind === "edit_task") {
    const { error } = await db.from("tasks").update(p.patch).eq("id", p.id);
    if (error) return "לא הצלחתי לעדכן.";
    if (p.patch.assignee_id) await notifyAssignee(p.patch.assignee_id, p.title_for_push || p.label, p.title_ar_for_push || null, p.project_name, c);
    return `עודכן ✓ ${p.label}`;
  }
  if (p.kind === "delete_expense") {
    const { error } = await db.from("expenses").delete().eq("id", p.id);
    return error ? "לא הצלחתי למחוק." : `נמחק ✓ ${p.label}`;
  }
  if (p.kind === "edit_expense") {
    const { error } = await db.from("expenses").update(p.patch).eq("id", p.id);
    return error ? "לא הצלחתי לעדכן." : `עודכן ✓ ${p.label}`;
  }
  return "אין מה לאשר.";
}

async function notifyAssignee(memberId: string, title: string, titleAr: string | null, projectName: string, c: Ctx) {
  const m = c.team.find((x) => x.id === memberId);
  if (!m || !m.user_id) return;
  if (m.user_id && m.phone && String(m.phone).replace(/\D/g, "").slice(-9) === c.from.slice(-9)) return; // self
  const worker = await userIsWorker(m.user_id);
  await pushTo([m.user_id], worker ? "مهمة جديدة لك" : "משימה חדשה בשבילך", (worker && titleAr ? titleAr : title) + (projectName ? " · " + projectName : ""));
}

// ---------- task finder ----------
async function findTasks(hint: string, proj: any | null, done: boolean) {
  let q = db.from("tasks").select("id,title,title_ar,project_id,status,due,assignee_id");
  q = done ? q.eq("status", "הושלם") : q.neq("status", "הושלם");
  if (proj) q = q.eq("project_id", proj.id);
  const { data } = await q.limit(300);
  const k = norm(hint);
  if (!k) return [];
  return (data || []).filter((t: any) => norm(t.title).includes(k) || k.includes(norm(t.title)) || (t.title_ar && (norm(t.title_ar).includes(k) || k.includes(norm(t.title_ar)))));
}

// ---------- main action handler ----------
async function handleAI(c: Ctx, text: string, media: { buf: Uint8Array; mime: string } | null, isVideo: boolean, mediaPath: string | null): Promise<string> {
  const { data: pr } = await db.from("projects").select("id,name,status");
  const P = pr || [];
  const a = await aiParse(c, text, media, isVideo, P);
  if (c.role === "worker" && !WORKER_ACTIONS.includes(a.action)) return "هذا غير متاح لك";
  const proj = matchProject(a.project_name, text, P);
  const pNames: Record<string, string> = {}; P.forEach((p: any) => (pNames[p.id] = p.name));
  const needProj = L(c, "לאיזה פרויקט? כתוב את שם הפרויקט (" + P.map((p: any) => p.name).join(", ") + ").", "لأي مشروع؟ (" + P.map((p: any) => p.name).join("، ") + ")");
  const bossIds = async () => adminIds();

  const mkEvent = async (title: string, date: string, timeIn: string, projId: string | null, remindIn: any): Promise<string> => {
    const time = timeIn.padStart(5, "0");
    const startIso = ilToUtc(date, time);
    const id = crypto.randomUUID();
    const { error } = await db.from("events").insert({ id, title, start_at: startIso, end_at: new Date(Date.parse(startIso) + 3600000).toISOString(), all_day: false, project_id: projId, location: null, notes: null });
    if (error) return "";
    const rm = remindIn === undefined || remindIn === null ? 30 : Number(remindIn);
    if (rm >= 0) {
      const when = new Date(Date.parse(startIso) - rm * 60000);
      if (when.getTime() > Date.now()) {
        const ids = await bossIds();
        if (ids.length) await db.from("reminders").insert(ids.map((u: string) => ({ user_id: u, ref: "ev:" + id + ":" + u.slice(0, 6), title, body: "בשעה " + time, remind_at: when.toISOString() })));
        return ` 📅 ביומן ${time} · תזכורת ${rm ? rm + " דק' לפני" : "בזמן הפגישה"}`;
      }
    }
    return ` 📅 ביומן ${time}`;
  };

  switch (a.action) {
    // ----- tasks -----
    case "add_task": {
      if (!proj) return needProj;
      const items: any[] = Array.isArray(a.tasks) && a.tasks.length ? a.tasks : (a.title ? [{ title: a.title, due: a.due, assignee: a.assignee_name }] : []);
      if (!items.length) return "מה המשימה?";
      const out: string[] = [];
      for (const it of items) {
        const title = String(it.title || "").trim(); if (!title) continue;
        const due = DATE_RE.test(it.due || "") ? it.due : null;
        const mem = it.assignee ? matchMember(it.assignee, c.team) : null;
        const row: any = { project_id: proj.id, title, title_ar: it.title_ar || null, due, status: (it.decision || a.decision) ? "ממתין להחלטה" : "לביצוע", assignee_id: mem ? mem.id : null };
        const { error } = await db.from("tasks").insert(row);
        if (error) { out.push("✗ " + title); continue; }
        let evNote = "";
        if (TIME_RE.test(it.time || "") && due) evNote = await mkEvent(title, due, it.time, proj.id, a.remind_minutes);
        out.push(`• ${title}${mem ? " ← " + mem.name : ""}${due ? " (עד " + fmtD(due) + ")" : ""}${evNote}`);
        if (mem) await notifyAssignee(mem.id, title, it.title_ar || null, proj.name, c);
      }
      return `נשמר ✓ ב"${proj.name}":\n` + out.join("\n");
    }
    case "list_tasks": {
      const today = ymd(il());
      const scope: string = a.scope || "open";
      let q = db.from("tasks").select("title,title_ar,due,status,project_id,assignee_id,done_at");
      if (scope === "done") q = q.eq("status", "הושלם").order("done_at", { ascending: false, nullsFirst: false });
      else if (scope === "decision") q = q.eq("status", "ממתין להחלטה").order("due", { ascending: true, nullsFirst: false });
      else {
        q = q.neq("status", "הושלם").neq("status", "ממתין להחלטה").order("due", { ascending: true, nullsFirst: false });
        if (scope === "today") q = q.lte("due", today);
        else if (scope === "tomorrow") q = q.eq("due", addDays(today, 1));
        else if (scope === "week") q = q.lte("due", addDays(today, 7));
        else if (scope === "overdue") q = q.lt("due", today);
      }
      if (proj && a.project_name) q = q.eq("project_id", proj.id);
      let who: any = null;
      if (a.mine && c.member) who = c.member;
      else if (a.assignee_name) who = matchMember(a.assignee_name, c.team);
      if (who) q = q.eq("assignee_id", who.id);
      const { data } = await q.limit(25);
      if (!data?.length) return L(c, "אין משימות" + (scope === "done" ? " שהושלמו" : "") + " כאלה 👍", "لا توجد مهام 👍");
      const SC: Record<string, string> = { today: "להיום ובאיחור", tomorrow: "למחר", week: "לשבוע הקרוב", overdue: "באיחור", open: "פתוחות", done: "שהושלמו" };
      const head = L(c, "משימות " + (SC[scope] || "") + (who ? " – " + who.name : "") + ":", "المهام" + (who ? " – " + mName(who, c) : "") + ":");
      const mById: Record<string, any> = {}; c.team.forEach((m) => (mById[m.id] = m));
      return head + "\n" + data.map((t: any) => {
        const late = t.due && t.due < today && t.status !== "הושלם";
        return `• ${tTitle(t, c)}${!(proj && a.project_name) ? " (" + (pNames[t.project_id] || "") + ")" : ""}${!who && t.assignee_id && mById[t.assignee_id] ? " · " + mName(mById[t.assignee_id], c) : ""}${t.due ? " · " + (late ? "⚠️ " : "") + L(c, "עד ", "حتى ") + fmtD(t.due) : ""}`;
      }).join("\n");
    }
    case "complete_task":
    case "reopen_task": {
      const reopen = a.action === "reopen_task";
      const hits = await findTasks(a.title || "", proj && a.project_name ? proj : null, reopen);
      if (!hits.length) return L(c, "לא מצאתי משימה כזאת.", "لم أجد هذه المهمة.");
      if (hits.length > 1) return L(c, "מצאתי כמה משימות:\n", "وجدت عدة مهام:\n") + hits.slice(0, 6).map((t: any) => "• " + tTitle(t, c)).join("\n") + L(c, "\nכתוב את השם המדויק של אחת מהן.", "\nاكتب الاسم الدقيق لإحداها.");
      const t = hits[0];
      const { error } = await db.from("tasks").update(reopen ? { status: "לביצוע", done_at: null } : { status: "הושלם", done_at: new Date().toISOString() }).eq("id", t.id);
      if (error) return L(c, "לא הצלחתי לעדכן.", "تعذّر التحديث.");
      if (c.role === "worker" && !reopen) await pushTo(await bossIds(), `${c.name || "פועל"} סגר משימה`, `${t.title} · ${pNames[t.project_id] || ""}`);
      return reopen ? L(c, `נפתחה מחדש ✓ "${t.title}"`, `أُعيد فتحها ✓ "${tTitle(t, c)}"`) : L(c, `נשמר ✓ "${t.title}" סומנה כבוצעה.`, `تم ✓ "${tTitle(t, c)}"`);
    }
    case "edit_task": {
      const hits = await findTasks(a.title || "", proj && a.project_name ? proj : null, false);
      if (!hits.length) return "לא מצאתי משימה פתוחה כזאת.";
      if (hits.length > 1) return "מצאתי כמה משימות:\n" + hits.slice(0, 6).map((t: any) => "• " + t.title).join("\n") + "\nכתוב את השם המדויק.";
      const t = hits[0]; const patch: any = {}; const parts: string[] = [];
      if (a.new_title) { patch.title = a.new_title; patch.title_ar = a.new_title_ar || null; parts.push(`טקסט: ${a.new_title}`); }
      if (DATE_RE.test(a.due || "")) { patch.due = a.due; parts.push(`תאריך: ${fmtD(a.due)}`); }
      let mem: any = null;
      if (a.assignee_name) { mem = matchMember(a.assignee_name, c.team); if (mem) { patch.assignee_id = mem.id; parts.push(`אחראי: ${mem.name}`); } }
      if (!parts.length) return "מה לשנות במשימה? (טקסט, תאריך או אחראי)";
      const label = `"${t.title}" → ${parts.join(", ")}`;
      await savePending(c.from, { kind: "edit_task", id: t.id, patch, label, title_for_push: a.new_title || t.title, title_ar_for_push: a.new_title_ar || t.title_ar || null, project_name: pNames[t.project_id] });
      return `לשנות ${label}?\nכתוב "כן" לאישור.`;
    }
    case "delete_task": {
      const hits = await findTasks(a.title || "", proj && a.project_name ? proj : null, false);
      if (!hits.length) return "לא מצאתי משימה פתוחה כזאת.";
      if (hits.length > 1) return "מצאתי כמה משימות:\n" + hits.slice(0, 6).map((t: any) => "• " + t.title).join("\n") + "\nכתוב את השם המדויק.";
      await savePending(c.from, { kind: "delete_task", id: hits[0].id, label: `המשימה "${hits[0].title}"` });
      return `למחוק את המשימה "${hits[0].title}"?\nכתוב "כן" לאישור.`;
    }
    // ----- expenses -----
    case "add_expense": {
      if (!proj) return needProj;
      const amount = Number(a.amount);
      if (!isFinite(amount) || amount <= 0) return "לא הצלחתי לקרוא סכום. כתוב אותו בהודעה, למשל: 350 חשמל בנימין " + proj.name;
      const pay = a.pay === "מזומן" || a.pay === "אשראי" ? a.pay : null;
      const vendor = String(a.vendor || "").trim() || "ללא ספק";
      const date = DATE_RE.test(a.date || "") ? a.date : ymd(il());
      const { error } = await db.from("expenses").insert({ project_id: proj.id, vendor, amount, pay, photo: mediaPath, date, note: a.note || null });
      if (error) return "לא הצלחתי לשמור את ההוצאה.";
      return `נשמר ✓ הוצאה ב"${proj.name}": ${vendor} ${num(amount)} ₪${pay ? " · " + pay : ""}${mediaPath ? " · עם קבלה" : ""}`;
    }
    case "edit_expense":
    case "delete_expense": {
      let q = db.from("expenses").select("id,vendor,amount,date,project_id,pay").order("created_at", { ascending: false });
      if (proj && a.project_name) q = q.eq("project_id", proj.id);
      const { data } = await q.limit(60);
      let hits = (data || []).filter((x: any) =>
        (!a.vendor || norm(x.vendor).includes(norm(a.vendor)) || norm(a.vendor).includes(norm(x.vendor))) &&
        (!a.amount || Number(x.amount) === Number(a.amount)));
      if (a.last) hits = hits.slice(0, 1);
      if (!hits.length) return "לא מצאתי הוצאה כזאת.";
      if (hits.length > 1) return "מצאתי כמה הוצאות:\n" + hits.slice(0, 6).map((x: any) => `• ${x.vendor} ${num(x.amount)} ₪ · ${fmtD(x.date)} (${pNames[x.project_id] || ""})`).join("\n") + "\nכתוב סכום או ספק מדויק, או 'האחרונה'.";
      const x = hits[0]; const lbl = `${x.vendor} ${num(x.amount)} ₪ (${pNames[x.project_id] || ""})`;
      if (a.action === "delete_expense") {
        await savePending(c.from, { kind: "delete_expense", id: x.id, label: `ההוצאה ${lbl}` });
        return `למחוק את ההוצאה ${lbl}?\nכתוב "כן" לאישור.`;
      }
      const patch: any = {}; const parts: string[] = [];
      if (a.new_amount) { patch.amount = Number(a.new_amount); parts.push(`סכום ${num(a.new_amount)} ₪`); }
      if (a.new_vendor) { patch.vendor = a.new_vendor; parts.push(`ספק ${a.new_vendor}`); }
      if (a.pay === "מזומן" || a.pay === "אשראי") { patch.pay = a.pay; parts.push(a.pay); }
      if (!parts.length) return "מה לשנות בהוצאה? (סכום, ספק או אמצעי תשלום)";
      await savePending(c.from, { kind: "edit_expense", id: x.id, patch, label: `ההוצאה ${lbl} → ${parts.join(", ")}` });
      return `לעדכן את ההוצאה ${lbl} ל: ${parts.join(", ")}?\nכתוב "כן" לאישור.`;
    }
    case "expense_summary": {
      let q = db.from("expenses").select("amount,pay,vendor,date,project_id");
      if (proj && a.project_name) q = q.eq("project_id", proj.id);
      const today = ymd(il());
      if (a.period === "month") q = q.gte("date", today.slice(0, 8) + "01");
      else if (a.period === "week") q = q.gte("date", addDays(today, -7));
      const { data } = await q.limit(2000);
      let rows = data || [];
      if (a.vendor) rows = rows.filter((x: any) => norm(x.vendor).includes(norm(a.vendor)));
      if (a.pay === "מזומן" || a.pay === "אשראי") rows = rows.filter((x: any) => x.pay === a.pay);
      const total = rows.reduce((s: number, x: any) => s + (Number(x.amount) || 0), 0);
      const by = (f: (x: any) => string) => { const m: Record<string, number> = {}; rows.forEach((x: any) => { const k = f(x) || "ללא"; m[k] = (m[k] || 0) + (Number(x.amount) || 0); }); return Object.entries(m).sort((p, q) => q[1] - p[1]).slice(0, 8).map(([k, v]) => `• ${k}: ${num(v)} ₪`).join("\n"); };
      const per = a.period === "week" ? " בשבוע האחרון" : a.period === "month" ? " החודש" : "";
      let out = `הוצאות${proj && a.project_name ? " ב\"" + proj.name + "\"" : ""}${a.vendor ? " ל" + a.vendor : ""}${per}: ${num(total)} ₪ (${rows.length} הוצאות)`;
      const cash = rows.filter((x: any) => x.pay === "מזומן").reduce((s: number, x: any) => s + Number(x.amount || 0), 0);
      const card = rows.filter((x: any) => x.pay === "אשראי").reduce((s: number, x: any) => s + Number(x.amount || 0), 0);
      out += `\nמזומן ${num(cash)} ₪ · אשראי ${num(card)} ₪`;
      if (a.group_by === "vendor" || (!a.vendor && rows.length > 1 && a.group_by !== "none")) out += "\n\nלפי ספק:\n" + by((x) => x.vendor);
      if (!(proj && a.project_name) && a.group_by !== "none") out += "\n\nלפי פרויקט:\n" + by((x) => pNames[x.project_id]);
      return out;
    }
    case "project_summary": {
      if (!proj) return needProj;
      const { data: ex } = await db.from("expenses").select("amount,pay").eq("project_id", proj.id);
      const { data: tk } = await db.from("tasks").select("status").eq("project_id", proj.id);
      const { data: od } = await db.from("orders").select("status").eq("project_id", proj.id);
      const total = (ex || []).reduce((s: number, x: any) => s + (Number(x.amount) || 0), 0);
      const sumBy = (p: string) => (ex || []).filter((x: any) => x.pay === p).reduce((s: number, x: any) => s + (Number(x.amount) || 0), 0);
      const done = (tk || []).filter((t: any) => t.status === "הושלם").length;
      const openO = (od || []).filter((o: any) => o.status !== "הגיע").length;
      return `${proj.name} (${proj.status || ""}):\nהוצאות: ${num(total)} ₪ (מזומן ${num(sumBy("מזומן"))}, אשראי ${num(sumBy("אשראי"))})\nמשימות: ${(tk || []).length - done} פתוחות, ${done} הושלמו\nהזמנות פתוחות: ${openO}`;
    }
    // ----- projects -----
    case "create_project": {
      const name = String(a.project_name || a.title || "").trim();
      if (!name) return "מה שם הפרויקט החדש?";
      if (P.some((p: any) => norm(p.name) === norm(name))) return `פרויקט "${name}" כבר קיים.`;
      const pid = crypto.randomUUID();
      const { error } = await db.from("projects").insert({ id: pid, name, address: a.address || null, client_name: a.client_name || null, status: "בהתחלה" });
      if (error) return "לא הצלחתי ליצור את הפרויקט.";
      await translateRows("projects", [{ id: pid, name, address: a.address || null }]);
      return `נשמר ✓ פרויקט חדש: ${name}`;
    }
    case "set_project_status": {
      if (!proj) return needProj;
      if (a.status === "סיום") a.status = "הסתיים";
      if (!["בהתחלה", "בביצוע", "בפינישים", "הסתיים"].includes(a.status)) return "איזה סטטוס? בהתחלה / בביצוע / בפינישים / הסתיים";
      const { error } = await db.from("projects").update({ status: a.status }).eq("id", proj.id);
      return error ? "לא הצלחתי לעדכן." : `נשמר ✓ ${proj.name}: ${a.status}`;
    }
    // ----- suppliers -----
    case "find_supplier": {
      const { data } = await db.from("suppliers").select("id,name,field,phone,contacts");
      const k = norm(a.supplier_name || a.vendor || a.title);
      const hits = (data || []).filter((s: any) => k && (norm(s.name).includes(k) || k.includes(norm(s.name)) || norm(s.field).includes(k))).slice(0, 5);
      if (!hits.length) return "לא מצאתי ספק כזה.";
      return hits.map((s: any) => `${s.name}${s.field ? " (" + s.field + ")" : ""}\n${s.phone || "אין טלפון"}` + ((s.contacts || []).length ? "\n" + s.contacts.map((x: any) => `${x.name || ""}${x.role ? " " + x.role : ""}: ${x.phone || ""}`).join("\n") : "")).join("\n\n");
    }
    case "add_supplier": {
      const name = String(a.supplier_name || "").trim();
      if (!name) return "מה שם הספק?";
      let sup: any = await supplierByName(name);
      let created = false;
      if (sup) {
        const patch: any = {};
        if (a.supplier_field) patch.field = a.supplier_field;
        if (a.supplier_phone) patch.phone = a.supplier_phone;
        if (Object.keys(patch).length) await db.from("suppliers").update(patch).eq("id", sup.id);
      } else {
        const ins = await db.from("suppliers").insert({ name, field: a.supplier_field || null, phone: a.supplier_phone || null }).select("id,name").maybeSingle();
        if (ins.error || !ins.data) return "לא הצלחתי לשמור את הספק.";
        sup = ins.data; created = true;
      }
      let linked = "";
      if (a.project_name && proj) {
        const lk = await db.from("project_suppliers").upsert({ project_id: proj.id, supplier_id: sup.id }, { onConflict: "project_id,supplier_id" });
        if (!lk.error) linked = ` · שויך ל"${proj.name}"`;
      }
      return `נשמר ✓ ${created ? "ספק חדש" : "ספק עודכן"}: ${name}${a.supplier_field ? " · " + a.supplier_field : ""}${a.supplier_phone ? " · " + a.supplier_phone : ""}${linked}`;
    }
    case "link_supplier": {
      if (!proj) return needProj;
      const s = await supplierByName(a.supplier_name);
      if (!s) return "לא מצאתי את הספק. אפשר להוסיף אותו קודם.";
      const { error } = await db.from("project_suppliers").upsert({ project_id: proj.id, supplier_id: s.id }, { onConflict: "project_id,supplier_id" });
      return error ? "לא הצלחתי לשייך." : `נשמר ✓ ${s.name} שויך ל"${proj.name}".`;
    }
    // ----- orders -----
    case "add_order": {
      if (!proj) return needProj;
      const item = String(a.item || a.title || "").trim();
      if (!item) return "מה להזמין?";
      const s = a.supplier_name ? await supplierByName(a.supplier_name) : null;
      const status = ["לא הוזמן", "הוזמן", "הגיע"].includes(a.status) ? a.status : "לא הוזמן";
      const { error } = await db.from("orders").insert({ project_id: proj.id, supplier_id: s ? s.id : null, item, status });
      if (error) return "לא הצלחתי לשמור את ההזמנה.";
      if (s) await db.from("project_suppliers").upsert({ project_id: proj.id, supplier_id: s.id }, { onConflict: "project_id,supplier_id" });
      return `נשמר ✓ הזמנה ב"${proj.name}": ${item}${s ? " · " + s.name : ""} · ${status}`;
    }
    case "update_order": {
      if (!["לא הוזמן", "הוזמן", "הגיע"].includes(a.status)) return "איזה מצב? לא הוזמן / הוזמן / הגיע";
      let q = db.from("orders").select("id,item,project_id,status");
      if (proj && a.project_name) q = q.eq("project_id", proj.id);
      const { data } = await q.limit(200);
      const k = norm(a.item || a.title);
      const hits = (data || []).filter((o: any) => k && (norm(o.item).includes(k) || k.includes(norm(o.item))));
      if (!hits.length) return "לא מצאתי הזמנה כזאת.";
      if (hits.length > 1) return "מצאתי כמה הזמנות:\n" + hits.slice(0, 6).map((o: any) => `• ${o.item} (${pNames[o.project_id] || ""}) · ${o.status}`).join("\n") + "\nכתוב את השם המדויק.";
      const { error } = await db.from("orders").update({ status: a.status }).eq("id", hits[0].id);
      return error ? "לא הצלחתי לעדכן." : `נשמר ✓ ${hits[0].item}: ${a.status}`;
    }
    case "list_orders": {
      let q = db.from("orders").select("item,status,project_id,supplier_id").neq("status", "הגיע");
      if (proj && a.project_name) q = q.eq("project_id", proj.id);
      const { data } = await q.limit(30);
      if (!data?.length) return "אין הזמנות פתוחות.";
      return "הזמנות פתוחות:\n" + data.map((o: any) => `• ${o.item} (${pNames[o.project_id] || ""}) · ${o.status}`).join("\n");
    }
    // ----- documentation -----
    case "add_doc": {
      if (!proj) return needProj;
      if (!mediaPath) return L(c, "שלח תמונה או וידאו עם הכיתוב.", "أرسل صورة أو فيديو مع وصف.");
      const title = String(a.title || "").trim() || "תיעוד";
      const stage = STAGES.includes(a.stage) ? a.stage : null;
      const { error } = await db.from("docs").insert({ project_id: proj.id, title, stage, note: a.note || null, photo: mediaPath, date: ymd(il()) });
      if (error) return L(c, "לא הצלחתי לשמור את התיעוד.", "تعذّر حفظ التوثيق.");
      if (c.role === "worker") await pushTo(await bossIds(), `${c.name || "פועל"} שלח תיעוד`, `${title} · ${proj.name}`);
      return L(c, `נשמר ✓ תיעוד ב"${proj.name}": ${title}${stage ? " · " + stage : ""}${isVideo ? " · וידאו" : ""}`, `تم الحفظ ✓ ${proj.name}: ${title}`);
    }
    case "add_supplier_doc": {
      if (!proj) return needProj;
      if (!mediaPath) return "שלח תמונה או וידאו של התעודה.";
      const s = await supplierByName(a.supplier_name);
      if (!s) return "לא זיהיתי את הספק. כתוב את שמו בכיתוב.";
      const kind = a.kind === "תיעוד" ? "תיעוד" : "תעודת משלוח";
      const { error } = await db.from("supplier_docs").insert({ project_id: proj.id, supplier_id: s.id, kind, title: a.title || null, note: a.note || null, photo: mediaPath, date: ymd(il()) });
      if (error) return "לא הצלחתי לשמור.";
      await db.from("project_suppliers").upsert({ project_id: proj.id, supplier_id: s.id }, { onConflict: "project_id,supplier_id" });
      return `נשמר ✓ ${kind} של ${s.name} ב"${proj.name}"`;
    }
    // ----- calendar -----
    case "add_event": {
      const title = String(a.title || "").trim();
      if (!title) return "מה האירוע?";
      if (!DATE_RE.test(a.due || a.date || "")) return "באיזה תאריך?";
      const date = DATE_RE.test(a.due || "") ? a.due : a.date;
      const hasTime = TIME_RE.test(a.time || "");
      const time = hasTime ? a.time.padStart(5, "0") : "";
      const startIso = hasTime ? ilToUtc(date, time) : ilToUtc(date, "00:00");
      let endIso: string | null = null;
      if (hasTime) endIso = TIME_RE.test(a.end_time || "") ? ilToUtc(date, a.end_time.padStart(5, "0")) : new Date(Date.parse(startIso) + 3600000).toISOString();
      const id = crypto.randomUUID();
      const { error } = await db.from("events").insert({ id, title, start_at: startIso, end_at: endIso, all_day: !hasTime, project_id: proj && a.project_name ? proj.id : null, location: a.location || null, notes: a.note || null });
      if (error) return "לא הצלחתי לשמור את האירוע.";
      let remNote = "";
      const rm = a.remind_minutes === undefined || a.remind_minutes === null ? 30 : Number(a.remind_minutes);
      if (rm >= 0) {
        const base = hasTime ? Date.parse(startIso) : Date.parse(ilToUtc(date, "08:00"));
        const when = new Date(base - (hasTime ? rm : 0) * 60000);
        if (when.getTime() > Date.now()) {
          const ids = await bossIds();
          if (ids.length) {
            await db.from("reminders").insert(ids.map((u: string) => ({ user_id: u, ref: "ev:" + id + ":" + u.slice(0, 6), title, body: (hasTime ? "בשעה " + time : "כל היום") + (a.location ? " · " + a.location : ""), remind_at: when.toISOString() })));
            remNote = hasTime ? ` · תזכורת ${rm ? rm + " דק' לפני" : "בזמן האירוע"}` : " · תזכורת בבוקר";
          }
        }
      }
      return `נשמר ✓ ביומן: ${title} · ${fmtD(date)}${hasTime ? " " + time : " (כל היום)"}${a.location ? " · " + a.location : ""}${remNote}\n(יעבור ליומן גוגל כשתפתח את האפליקציה)`;
    }
    case "list_events": {
      const today = ymd(il());
      const scope = a.scope || "today";
      const from = scope === "tomorrow" ? addDays(today, 1) : today;
      const to = scope === "today" ? today : scope === "tomorrow" ? addDays(today, 1) : addDays(today, 7);
      const { data } = await db.from("events").select("title,start_at,all_day,location").gte("start_at", ilToUtc(from, "00:00")).lt("start_at", ilToUtc(addDays(to, 1), "00:00")).order("start_at", { ascending: true }).limit(25);
      if (!data?.length) return "אין אירועים ביומן בתקופה הזאת.\n(מוצגים רק אירועים שנשמרו באפליקציה/בבוט, לא כל יומן גוגל.)";
      return "ביומן:\n" + data.map((e: any) => {
        const dt = new Date(new Date(e.start_at).toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
        return `• ${fmtD(ymd(dt))}${e.all_day ? "" : " " + String(dt.getHours()).padStart(2, "0") + ":" + String(dt.getMinutes()).padStart(2, "0")} ${e.title}${e.location ? " · " + e.location : ""}`;
      }).join("\n");
    }
    default:
      return a.reply || helpText(c);
  }
}

async function supplierByName(name: string) {
  const k = norm(name);
  if (!k) return null;
  const { data } = await db.from("suppliers").select("id,name");
  const L2 = data || [];
  return L2.find((s: any) => norm(s.name) === k) || L2.find((s: any) => norm(s.name).includes(k) || k.includes(norm(s.name))) || null;
}

function helpText(c: Ctx) {
  if (c.role === "worker") return "أنا مساعد فيدر للبناء. يمكنك:\n• \"مهامي\" لعرض مهامك\n• \"أنهيت مهمة الخرسانة\"\n• إرسال صورة أو فيديو مع اسم المشروع كتوثيق";
  return `אני הבוט של פדר בניה. אפשר לכתוב חופשי, למשל:
• משימה בנוף: להזמין בטון מחר, ואבו יאסר יפנה את הפסולת
• איזה משימות יש לי היום / מה באיחור / מה פתוח אצל אמיתי
• סגור את משימת הבטון / מחק משימה / תשייך את הבטון לאבי
• 350 חשמל בנימין הנוף אשראי (או שלח תמונת קבלה)
• כמה הוצאנו בנוף החודש / הוצאות לבנימין
• תיעוד: תמונה או וידאו עם "הנוף חשמל"
• תעודת משלוח: תמונה עם "תעודת משלוח בנימין הנוף"
• הזמנה בנוף: ברזל / הברזל הגיע
• טלפון של בנימין / ספק חדש...
• פגישה מחר ב-10 בנוף עם הלקוח / מה ביומן
מחיקה ועריכה תמיד מחכות לאישור "כן".`;
}

// ---------- rule fallback (no AI key / AI failed) ----------
async function handleRules(c: Ctx, text: string, mediaPath: string | null): Promise<string> {
  if (c.role === "worker") return "المساعد غير متاح الآن، حاول لاحقاً.";
  const { data: pr } = await db.from("projects").select("id,name");
  const P = pr || [];
  const proj = matchProject("", text, P);
  const lead = text.trim().split(/\s+/)[0];
  if (lead === "משימה" && proj) {
    const title = text.replace(/^\s*משימה/, "").replace(new RegExp(proj.name, "i"), "").replace(/[:：]/g, " ").replace(/\s+/g, " ").trim();
    if (!title) return "חסר תיאור למשימה.";
    const { error } = await db.from("tasks").insert({ project_id: proj.id, title, status: "לביצוע" });
    return error ? "לא הצלחתי לשמור." : `נשמר ✓ משימה ב"${proj.name}": ${title}`;
  }
  return helpText(c) + "\n(הבינה המלאכותית לא זמינה כרגע, נסה שוב.)";
}

// ---------- documents (plans / files) ----------
async function peekPending(from: string): Promise<any | null> {
  const { data } = await db.from("bot_pending").select("payload,created_at").eq("phone", from).maybeSingle();
  if (!data || Date.now() - Date.parse(data.created_at) > 15 * 60 * 1000) return null;
  return data.payload;
}
async function savePlanRec(rec: any, proj: any): Promise<string> {
  const { error } = await db.from("plans").insert({ project_id: proj.id, title: rec.title, file_path: rec.path, file_name: rec.name, file_type: rec.ext });
  return error ? "לא הצלחתי לשמור את הקובץ." : `נשמר ✓ בתוכניות של "${proj.name}": ${rec.title}`;
}
async function handleDocument(c: Ctx, caption: string, id: string, filename: string): Promise<string> {
  if (c.role !== "staff") return L(c, "אין לך הרשאה לשלוח קבצים.", "غير مسموح لك بإرسال الملفات.");
  const dm = await downloadMedia(id);
  if (!dm) return "לא הצלחתי לקבל את הקובץ. נסה שוב.";
  const ext = ((filename.match(/\.([A-Za-z0-9]{1,6})$/) || [])[1] || (dm.mime.includes("pdf") ? "pdf" : "bin")).toLowerCase();
  const path = `plans/wa/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const up = await db.storage.from("photos").upload(path, dm.buf, { contentType: dm.mime || "application/octet-stream" });
  if (up.error) return "לא הצלחתי לשמור את הקובץ.";
  const base = (filename || "").replace(/\.[^.]+$/, "").trim();
  const rec = { kind: "plan_file", path, name: filename || `file.${ext}`, ext, title: base || caption.trim() || "תוכנית" };
  const { data: pr } = await db.from("projects").select("id,name");
  const proj = matchProject("", caption, pr || []);
  if (proj) return await savePlanRec(rec, proj);
  await savePending(c.from, rec);
  return "קיבלתי את הקובץ. לאיזה פרויקט לשייך? (" + (pr || []).map((p: any) => p.name).join(", ") + ")\nאפשר לכתוב 'בטל'.";
}

// ---------- contacts ----------
async function handleContacts(c: Ctx, contacts: any[]): Promise<string> {
  if (c.role !== "staff") return L(c, "אין לך הרשאה לשלוח אנשי קשר.", "غير مسموح لك بإرسال جهات الاتصال.");
  const list = (contacts || []).map((x: any) => ({ name: String(x?.name?.formatted_name || x?.name?.first_name || "").trim(), phone: String(x?.phones?.[0]?.phone || x?.phones?.[0]?.wa_id || "").trim() })).filter((x: any) => x.name || x.phone);
  if (!list.length) return "לא הצלחתי לקרוא את איש הקשר.";
  await savePending(c.from, { kind: "contact", list });
  return "קיבלתי: " + list.map((x: any) => `${x.name} ${x.phone}`.trim()).join(" ; ") + "\nמה לעשות איתו? למשל: \"תשמור כספק אלומיניום ותשייך לפרויקט הזולאי\" (או 'בטל').";
}

// ---------- routing ----------
async function route(c: Ctx, text: string, media: { id: string; video: boolean } | null): Promise<string> {
  const t = text.trim();
  // contact waiting for an instruction
  let tt = t;
  if (c.role === "staff" && !media && t) {
    const cp = await peekPending(c.from);
    if (cp && cp.kind === "contact") {
      await db.from("bot_pending").delete().eq("phone", c.from);
      if (NO.test(t)) return "בוטל.";
      tt = t + "\n(איש קשר שנשלח: " + cp.list.map((x: any) => `${x.name}, ${x.phone}`).join(" ; ") + ")";
    }
  }
  // file waiting for a project
  if (c.role === "staff" && !media && t) {
    const pp = await peekPending(c.from);
    if (pp && pp.kind === "plan_file") {
      if (NO.test(t)) { await db.from("bot_pending").delete().eq("phone", c.from); return "בוטל. הקובץ נשאר שמור ללא שיוך."; }
      const { data: pr } = await db.from("projects").select("id,name");
      const proj = t.length <= 60 ? matchProject(t, t, pr || []) : null;
      if (proj) { await db.from("bot_pending").delete().eq("phone", c.from); return await savePlanRec(pp, proj); }
      if (t.length <= 60) return "לא זיהיתי את הפרויקט. כתוב את שמו (" + (pr || []).map((p: any) => p.name).join(", ") + ") או 'בטל'.";
    }
  }
  // confirmations
  if (c.role === "staff") {
    if (YES.test(t) || NO.test(t)) {
      const p = await takePending(c.from);
      if (p) return YES.test(t) ? await execPending(p, c) : "בוטל.";
      if (YES.test(t)) return "אין פעולה שממתינה לאישור.";
    } else {
      try { await db.from("bot_pending").delete().eq("phone", c.from); } catch (_e) { /* ignore */ }
    }
  }
  let m: { buf: Uint8Array; mime: string } | null = null;
  let path: string | null = null;
  if (media) {
    m = await downloadMedia(media.id);
    if (m) path = await uploadMedia(m.buf, m.mime);
    if (!path) return L(c, "לא הצלחתי לקבל את הקובץ. נסה שוב.", "تعذّر استلام الملف، حاول مرة أخرى.");
  }
  if (AI_KEY) {
    try { return await handleAI(c, tt, m, !!media?.video, path); } catch (_e) { /* fall back */ }
  }
  return await handleRules(c, tt, path);
}

// ---------- webhook ----------
async function processMessages(msgs: any[]) {
  for (const m of msgs) {
    const from = String(m.from || "").replace(/\D/g, "");
    try {
      // de-duplicate Meta retries
      const seen = await db.from("bot_seen").insert({ id: m.id });
      if (seen.error && (seen.error as any).code === "23505") continue;
      const c = await identify(from);
      if (!c) continue;
      let out = helpText(c);
      if (m.type === "text") out = await route(c, m.text?.body || "", null);
      else if (m.type === "image") out = await route(c, m.image?.caption || "", { id: m.image.id, video: false });
      else if (m.type === "video") out = await route(c, m.video?.caption || "", { id: m.video.id, video: true });
      else if (m.type === "contacts") out = await handleContacts(c, m.contacts || []);
      else if (m.type === "document") out = await handleDocument(c, m.document?.caption || "", m.document.id, m.document?.filename || "");
      else out = L(c, "אני מבין טקסט, תמונות, וידאו וקבצים בלבד.", "أفهم النصوص والصور والفيديو والملفات فقط.");
      await reply(from, out);
    } catch (_e) {
      try { await reply(from, "משהו השתבש, נסה שוב."); } catch (_e2) { /* ignore */ }
    }
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    if (url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === Deno.env.get("WA_VERIFY_TOKEN")) {
      return new Response(url.searchParams.get("hub.challenge") || "");
    }
    return new Response("forbidden", { status: 403 });
  }
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const body = await req.json();
    if (body?.action === "translate" || body?.action === "backfill") {
      if (!(await authStaff(req))) return jres({ ok: false, error: "unauthorized" }, 401);
      if (body.action === "translate") {
        const table = body.table === "projects" ? "projects" : "tasks";
        const { data } = await db.from(table).select("*").eq("id", body.id);
        const n = await translateRows(table, data || []);
        return jres({ ok: true, translated: n });
      }
      let done = 0, remaining = 0;
      const { data: pj } = await db.from("projects").select("id,name,address,name_ar");
      const pTodo = (pj || []).filter((x: any) => !x.name_ar);
      done += await translateRows("projects", pTodo.slice(0, 30));
      remaining += Math.max(0, pTodo.length - 30);
      const { data: tk } = await db.from("tasks").select("id,title,notes,title_ar").limit(1000);
      const tTodo = (tk || []).filter((x: any) => !x.title_ar);
      done += await translateRows("tasks", tTodo.slice(0, 60));
      remaining += Math.max(0, tTodo.length - 60);
      return jres({ ok: true, translated: done, remaining });
    }
    const msgs = body?.entry?.[0]?.changes?.[0]?.value?.messages || [];
    if (msgs.length) {
      const job = processMessages(msgs);
      // @ts-ignore EdgeRuntime exists on Supabase
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) EdgeRuntime.waitUntil(job);
      else await job;
    }
  } catch (_e) { /* always 200 to Meta */ }
  return new Response("ok", { headers: CORS });
});
