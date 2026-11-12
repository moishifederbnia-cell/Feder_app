import { createClient } from "npm:@supabase/supabase-js@2";

// ===== Feder Bniya WhatsApp bot (v2): AI-driven, full app actions, roles (staff / worker), Arabic for workers =====
const G = "https://graph.facebook.com/v21.0";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const TOKEN = Deno.env.get("WA_TOKEN")!;
const PHONE_ID = Deno.env.get("WA_PHONE_ID")!;
const ALLOWED = (Deno.env.get("ALLOWED_NUMBERS") || "").split(",").map((x) => x.replace(/\D/g, "")).filter(Boolean);
const AI_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const AI_MODEL = Deno.env.get("AI_MODEL") || "claude-haiku-5-5";

type Ctx = { from: string; role: "staff" | "worker" | "client" | "architect"; lang: "he" | "ar"; member: any | null; name: string; team: any[]; projects?: any[]; urole?: string };
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
    const ext = mime.includes("pdf") ? "pdf" : mime.startsWith("video/") ? (mime.includes("quicktime") ? "mov" : mime.includes("webm") ? "webm" : "mp4") : "jpg";
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
const STAGES = ["חשמל", "אינסטלציה", "איטום", "ריצוף", "בנייה", "הריסה", "משימה", "אחר"];
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
  if (!boss && !member) return await identifyExternal(from, T);
  let role: "staff" | "worker" = boss ? "staff" : "worker";
  let urole = boss ? "admin" : "worker";
  if (member?.user_id) {
    const { data: pr } = await db.from("profiles").select("role").eq("id", member.user_id).maybeSingle();
    role = pr && (pr.role === "admin" || pr.role === "team" || pr.role === "ceo") ? "staff" : "worker";
    urole = pr?.role || urole;
  }
  return { from, role, lang: role === "worker" ? "ar" : "he", member, name: member ? member.name : "", team: T, urole };
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
    return pr?.role === "admin" || pr?.role === "team" || pr?.role === "ceo";
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
  "add_event", "list_events", "add_gantt", "update_gantt", "delete_gantt", "list_gantt",
  "update_sched", "request_plans", "ask_client", "send_open_items", "chat",
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
        general: { type: "boolean", description: "add_expense: true for a general expense not tied to any project (fuel, tools, office...)" },
        stages: {
          type: "array", description: "For add_gantt: one entry per week/period row of the project schedule table",
          items: { type: "object", properties: {
            title: { type: "string", description: "'התקדמות צפויה': what is planned in this period, Hebrew" },
            start: { type: "string", description: "YYYY-MM-DD start date (omit if after_last)" },
            end: { type: "string", description: "YYYY-MM-DD end date (compute from a stated duration)" },
            after_last: { type: "boolean", description: "true = start the day after the last existing row of the project (then use days)" },
            days: { type: "integer", description: "with after_last: length in days (default 6)" },
            pct: { type: "integer", description: "Completed percent 0-100, default 0" },
            color: { type: "string", description: "ירוק / כתום / כחול / אדום / סגול / אפור, or empty for automatic by percent" },
            milestone: { type: "string", description: "'אבן דרך' text, e.g. ספרינקלרים (יום רביעי 28/10)" },
            notes: { type: "string", description: "'הערות' text" },
            client_task: { type: "string", description: "'משימות ללקוח / אדריכלית' text" },
          }, required: ["title"] },
        },
        gantt_updates: {
          type: "array", description: "For update_gantt / delete_gantt: one entry per schedule row to change. Identify the row by week (the row number as shown in the table), or date (any date inside the row), or title words",
          items: { type: "object", properties: {
            week: { type: "integer", description: "row number (שבוע מספר) in the table" },
            date: { type: "string", description: "YYYY-MM-DD inside the row's period" },
            title: { type: "string", description: "identifying words of the row's planned work" },
            pct: { type: "integer", description: "new completed percent 0-100" },
            start: { type: "string", description: "new start YYYY-MM-DD" },
            end: { type: "string", description: "new end YYYY-MM-DD" },
            new_title: { type: "string", description: "new planned-work text" },
            color: { type: "string", description: "new color: ירוק / כתום / כחול / אדום / סגול / אפור / אוטומטי" },
            milestone: { type: "string", description: "new milestone text; '-' to clear" },
            notes: { type: "string", description: "new notes text; '-' to clear" },
            client_task: { type: "string", description: "new client/architect task text; '-' to clear" },
          } },
        },
        tasks: {
          type: "array", description: "For add_task: one entry per task",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Task in Hebrew" },
              title_ar: { type: "string", description: "The same task translated to clear Arabic" },
              due: { type: "string", description: "YYYY-MM-DD or empty" },
              assignee: { type: "string", description: "Team member name exactly as in the team list, or empty" },
              assignees: { type: "array", items: { type: "string" }, description: "When the task is for several people (e.g. משה, עמית ואבו יאסר): every name exactly as in the team list" },
              time: { type: "string", description: "HH:MM only if a specific time was stated for the task (reminder 30 min before is created). No time stated => leave empty, no reminder." },
              area: { type: "string", description: "Trade/area of the task: כללי, ריצוף, חשמל, אינסטלציה, טיח, איטום, צבע, מוסטפה, or another trade stated. Default כללי" },
              meeting: { type: "boolean", description: "true only if the user calls it a meeting / פגישה / מפגש: then it is also saved as a calendar event" },
              decision: { type: "boolean", description: "true if the task is waiting for a decision (ממתין להחלטה / צריך להחליט)" },
            },
            required: ["title"],
          },
        },
        title: { type: "string", description: "Words identifying an existing task (complete/reopen/edit/delete), or a doc/event title" },
        new_title: { type: "string", description: "edit_task: new task text in Hebrew" },
        new_project_name: { type: "string", description: "edit_task / edit_expense: move the item to this project (exact name from the list)" },
        new_area: { type: "string", description: "edit_task: new area (תחום)" },
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
        stage: { type: "string", description: "Trade/area: חשמל, אינסטלציה, איטום, ריצוף, בנייה, הריסה, משימה, אחר" },
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
        sched_updates: {
          type: "array", description: "update_sched: rows of the weekly gantt (Amit's format) to update. Identify by the row's words (גבס, ריצוף מדרגות...)",
          items: { type: "object", properties: {
            title: { type: "string", description: "words identifying the gantt row" },
            actual: { type: "integer", description: "actual completed percent 0-100 (\"גמרנו\"/\"הסתיים\" = 100)" },
            done: { type: "boolean", description: "for client/architect rows: done" },
          }, required: ["title"] },
        },
        topic: { type: "string", description: "ask_client: what to ask the client about, e.g. 'ספק האלומיניום', 'כל הספקים', 'מדידות מטבח'" },
        who: { type: "string", enum: ["client", "architect"], description: "send_open_items: to the client or the architect" },
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
project_name חייב להיות אחד מהשמות ברשימה בדיוק, או ריק אם לא ברור. בחר פעולה אחת בלבד.
מוצגות לפניך ההודעות האחרונות בשיחה (עד 10 דקות). אם המשתמש מתקן או משלים ('לא, התכוונתי...', 'זה לא לנוף', 'תשנה ל...', 'תוסיף שעה', 'ביטלתי'), התייחס להוראה הקודמת ופעל עליה: אם משהו כבר נשמר, השתמש ב-edit_task / edit_expense / delete_* עם title או vendor מזהים מההודעה הקודמת (project_name = הפרויקט הנוכחי של הפריט לזיהוי, new_project_name = הפרויקט החדש). אם ההוראה הקודמת לא בוצעה כי חסר פרט, השלם אותה כעת. אל תשחזר פעולה שכבר נשמרה.`;
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
- add_task: משימה חדשה. אפשר הרבה משימות בהודעה אחת: אם כותבים רשימה (משימה אחת..., משימה שתיים..., 1. 2. 3., שורות נפרדות, או "משימות לפרויקט X: ..."), צור פריט נפרד ב-tasks לכל משימה, בלי להגביל את המספר. לכל פריט יכולים להיות assignee, due, time ו-project_name משלו (אם הרשימה כוללת כמה פרויקטים). אם כתוב "כל אלה ל-X" או "לאבו יאסר: ..." החל את האדם על כל המשימות שמתחתיו עד שמוזכר אדם אחר. אם נשלחה תמונה עם הכיתוב, היא תצורף למשימה הראשונה. לכל משימה אפשר area (תחום): כללי, ריצוף, חשמל, אינסטלציה, טיח, איטום, צבע, מוסטפה (עובד שעושה פינישים), או תחום אחר שנאמר; אם לא נאמר, כללי. לכל משימה: title בעברית, title_ar תרגום לערבית, due אם צוין, assignee אם שייך לאדם מהצוות ("תן לאבו יאסר...", "אמיתי ידאג ל..."), time=HH:MM רק אם צוינה שעה למשימה ("הספק מגיע מחר ב-10": due ו-time, תזכורת פוש חצי שעה לפני, בלי יומן). משימה בלי שעה: בלי time ובלי תזכורת. meeting=true רק אם המשתמש אמר פגישה/מפגש: אז היא נשמרת גם ביומן גוגל (due ו-time) עם תזכורת, decision=true אם זו משימה שממתינה להחלטה ("ממתין להחלטה", "צריך להחליט", "לחכות להחלטה").
- list_tasks: מה יש/פתוח/באיחור/להיום. scope: today (להיום, כולל באיחור), tomorrow, week, overdue, open, done, decision (משימות שממתינות להחלטה). assignee_name אם שאל על אדם. mine=true אם שאל "מה יש לי".
- complete_task / reopen_task: סגירה או פתיחה מחדש של משימה קיימת. title = מילים מזהות.
- edit_task: שינוי משימה קיימת. title מזהה; new_title/new_title_ar, due, assignee_name לחדשים.
- delete_task: מחיקת משימה. title מזהה.
- add_expense: הוצאה או קבלה. general=true רק אם המשתמש כתב במפורש 'כללי' או 'הוצאה כללית'. אם לא צוין פרויקט ולא נכתב 'כללי', אל תנחש: השאר project_name ריק ו-general=false (הבוט ישאל).  בתמונת קבלה קרא סכום כולל (₪), עסק, תאריך ואמצעי תשלום. אמצעי תשלום: אם מופיעות ספרות כרטיס (למשל ****1234), VISA/Mastercard/ישראכרט/כאל/מקס/"אשראי"/"כרטיס"/אישור סליקה => אשראי; אם כתוב "מזומן" או "עודף" => מזומן; אחרת השאר ריק. טקסט המשתמש גובר על התמונה.
- edit_expense / delete_expense: הוצאה קיימת. vendor ו/או amount מזהים, או last=true ל"האחרונה". לחדשים: new_amount, new_vendor, pay.
- expense_summary: כמה הוצאנו. project_name אופציונלי, vendor אופציונלי, pay אופציונלי, period (week/month/all), group_by.
- project_summary: מצב פרויקט (הוצאות ומשימות).
- create_project: פרויקט חדש (project_name = שם חדש, address, client_name). set_project_status: status אחד מ: בהתחלה, בביצוע, בפינישים, הסתיים.
- find_supplier: טלפון/פרטי ספק (supplier_name). add_supplier: ספק חדש או עדכון ספק קיים (supplier_name, supplier_field = התחום/קטגוריה כמו אלומיניום, supplier_phone). אם מבקשים גם לשייך אותו לפרויקט, מלא project_name והוא ישויך באותה פעולה. אם הטקסט כולל שורה '(איש קשר שנשלח: שם, טלפון)', קח ממנה את השם והטלפון. link_supplier: שיוך ספק קיים לפרויקט.
- add_order: הזמנת חומר (item, supplier_name אופציונלי, status). update_order: item מזהה + status חדש. list_orders: הזמנות פתוחות.
- add_doc: תיעוד עבודה באתר (תמונה או וידאו שאינם קבלה). title קצר, stage אם ברור.
- add_supplier_doc: תעודת משלוח או תיעוד שקשור לספק (supplier_name, kind).
- לוח הגאנט (לוח זמנים שבועי של פרויקט, טבלה עם: שבוע מספר, תאריכים, התקדמות צפויה, הושלם באחוזים וצבע, אבני דרך, הערות, משימות ללקוח/אדריכלית). add_gantt: שורה לכל שבוע/תקופה ב-stages (title=התקדמות צפויה, start, end או after_last+days, pct, color, milestone, notes, client_task). update_gantt: gantt_updates, לכל שורה זיהוי לפי week (מספר השבוע בטבלה) או date או title, ובנוסף כל שדה לשינוי (pct, start, end, new_title, color, milestone, notes, client_task; '-' מנקה שדה). אפשר כמה שינויים בהודעה אחת. delete_gantt: מחיקת שורה (gantt_updates עם זיהוי). list_gantt: הצג את הלוח. כל "זז/נדחה/הושלם/הוסף אבן דרך/משימה ללקוח" בהקשר של לוח זמנים הוא update_gantt.
- add_event: פגישה/אירוע ביומן. title, due=התאריך (YYYY-MM-DD), time (HH:MM) אם יש, location, remind_minutes.
- list_events: מה ביומן. scope today/tomorrow/week.
- update_sched: עדכון ביצוע בגאנט השבועי (הפורמט של עמית: שורות כמו גבס, ריצוף מדרגות, שפכטל, עם יעד אחוזים לכל שבוע). "גבס 85", "ריצוף מדרגות גמרנו", "שפכטל קומה 2 חצי" => sched_updates עם title ו-actual. "בוצע" לשורת לקוח/אדריכלית => done=true. עדיף update_sched על update_gantt כשמדובר בשם של עבודה ולא במספר שבוע.
- request_plans: לבקש מהאדריכלית של הפרויקט לשלוח תוכניות ומסמכים (למשל "תשלח לאדריכלית בכהן בקשה לתוכניות").
- ask_client: לשאול את הלקוח של הפרויקט שאלה בוואטסאפ, בעיקר על ספקים ("תשאל את לוי מה קורה עם ספק האלומיניום", "תשאל את הלקוח על כל הספקים"). topic = הנושא.
- send_open_items: לשלוח ללקוח (who=client) או לאדריכלית (who=architect) את רשימת הדברים הפתוחים שבאחריותם לפי הגאנט.
- add_task עם כמה אחראים ("למשה, עמית ואבו יאסר"): מלא assignees עם כל השמות.
- chat: כל דבר אחר או כשחסר פרט הכרחי. ב-reply משפט קצר בעברית ושאלה על מה שחסר.
${common}`;
}

// ---------- short conversation memory (last ~10 minutes), stored in bot_pending under key "mem:<phone>" ----------
const MEM_TTL = 10 * 60 * 1000;
async function loadMem(from: string): Promise<{ u: string; b: string; t: number }[]> {
  try {
    const { data } = await db.from("bot_pending").select("payload").eq("phone", "mem:" + from).maybeSingle();
    const turns = (data?.payload?.turns || []) as any[];
    return turns.filter((x) => x && x.t > Date.now() - MEM_TTL).slice(-6);
  } catch (_e) { return []; }
}
async function saveMem(from: string, u: string, b: string) {
  try {
    const turns = await loadMem(from);
    turns.push({ u: String(u || "").slice(0, 700), b: String(b || "").slice(0, 700), t: Date.now() });
    await db.from("bot_pending").upsert({ phone: "mem:" + from, payload: { kind: "mem", turns: turns.slice(-6) }, created_at: new Date().toISOString() });
  } catch (_e) { /* memory is best-effort */ }
}

async function aiParse(c: Ctx, text: string, media: { buf: Uint8Array; mime: string } | null, isVideo: boolean, projects: any[]) {
  const content: any[] = [];
  if (media && !isVideo) content.push(media.mime.includes("pdf") ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64(media.buf) } } : { type: "image", source: { type: "base64", media_type: media.mime, data: b64(media.buf) } });
  content.push({ type: "text", text: (text || "") + (isVideo ? "\n(נשלח וידאו)" : "") || "(תמונה בלי טקסט)" });
  const hist = await loadMem(c.from);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": AI_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: AI_MODEL, max_tokens: 3000, system: systemPrompt(c, projects),
      tools: [actTool(c.role === "worker" ? WORKER_ACTIONS : STAFF_ACTIONS)], tool_choice: { type: "tool", name: "act" },
      messages: [...hist.flatMap((x) => [{ role: "user", content: [{ type: "text", text: x.u || "(הודעה)" }] }, { role: "assistant", content: [{ type: "text", text: x.b || "(אישור)" }] }]), { role: "user", content }],
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

const BOT_VERSION = "12.11.26 (הודעות יוזמות, 4 משתמשים, גאנט שבועי, לקוחות ואדריכליות)";
const GANTT_COLORS = ["ירוק", "כתום", "כחול", "אדום", "סגול", "אפור"];
const ganttColor = (c: any) => { const v = String(c || "").trim(); return GANTT_COLORS.includes(v) ? v : null; };
const strOrNull = (v: any) => { const t = String(v == null ? "" : v).trim(); return t && t !== "-" && t !== "אין" ? t : null; };

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
  if (p.kind === "delete_gantt") {
    const { error } = await db.from("gantt_items").delete().in("id", p.ids);
    return error ? "לא הצלחתי למחוק." : `נמחק ✓ ${p.label}`;
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

  // timed task: reminder before the time; if cal=true (a meeting) also a calendar event
  const mkTimed = async (title: string, date: string, timeIn: string, projId: string | null, remindIn: any, cal: boolean, extraUsers: string[], taskId: string): Promise<string> => {
    let evLinked = false;
    const time = timeIn.padStart(5, "0");
    const startIso = ilToUtc(date, time);
    const id = crypto.randomUUID();
    if (cal) {
      const { error } = await db.from("events").insert({ id, title, start_at: startIso, end_at: new Date(Date.parse(startIso) + 3600000).toISOString(), all_day: false, project_id: projId, location: null, notes: null });
      if (error) return "";
      evLinked = true;
      await db.from("tasks").update({ event_id: id, kind: "פגישה" }).eq("id", taskId);
    }
    const rm = remindIn === undefined || remindIn === null ? 30 : Number(remindIn);
    const label = cal ? " 📅 ביומן " + time : " ⏰ " + time;
    if (rm >= 0) {
      const when = new Date(Date.parse(startIso) - rm * 60000);
      if (when.getTime() > Date.now()) {
        const ids = Array.from(new Set([...(await bossIds()), ...extraUsers.filter(Boolean)]));
        if (ids.length) await db.from("reminders").insert(ids.map((u: string) => ({ user_id: u, ref: "task:" + taskId + ":" + u.slice(0, 6), title, body: "בשעה " + time, remind_at: when.toISOString() })));
        return label + " · תזכורת " + (rm ? rm + " דק' לפני" : "בזמן");
      }
    }
    return label;
  };

  switch (a.action) {
    case "update_sched": case "request_plans": case "ask_client": case "send_open_items":
      return await handleExtraAction(a, c, proj, P, needProj);
    // ----- tasks -----
    case "add_task": {
      const items: any[] = Array.isArray(a.tasks) && a.tasks.length ? a.tasks : (a.title ? [{ title: a.title, due: a.due, assignee: a.assignee_name }] : []);
      if (!items.length) return "מה המשימה?";
      if (!proj && !items.some((x: any) => x.project_name)) return needProj;
      const out: string[] = [];
      const projNames = new Set<string>();
      let first = true;
      for (const it of items) {
        const title = String(it.title || "").trim(); if (!title) continue;
        const ip = it.project_name ? (matchProject(it.project_name, "", P) || proj) : proj;
        if (!ip) { out.push("✗ " + title + " (לא ידוע לאיזה פרויקט)"); continue; }
        const due = DATE_RE.test(it.due || "") ? it.due : null;
        const mems: any[] = [];
        for (const nm of [...(Array.isArray(it.assignees) ? it.assignees : []), it.assignee].filter(Boolean)) { const mm = matchMember(String(nm), c.team); if (mm && !mems.some((x) => x.id === mm.id)) mems.push(mm); }
        const mem = mems[0] || null;
        const row: any = { project_id: ip.id, title, title_ar: it.title_ar || null, due, status: (it.decision || a.decision) ? "ממתין להחלטה" : "לביצוע", assignee_id: mem ? mem.id : null, assignee_ids: mems.map((x) => x.id) };
        const hasT = TIME_RE.test(it.time || "") && !!due;
        const tid = crypto.randomUUID();
        row.id = tid;
        if (hasT) row.due_time = it.time.padStart(5, "0");
        if (mediaPath && first) row.photo = mediaPath;
        row.area = String(it.area || a.area || "").trim() || "כללי";
        let ins = await db.from("tasks").insert(row);
        if (ins.error) { delete row.assignee_ids; ins = await db.from("tasks").insert(row); }
        if (ins.error && (hasT || row.photo || row.area)) { delete row.due_time; delete row.photo; delete row.area; ins = await db.from("tasks").insert(row); }
        if (ins.error) { out.push("✗ " + title); continue; }
        first = false;
        projNames.add(ip.name);
        let evNote = "";
        if (hasT) evNote = await mkTimed(title, due as string, it.time, ip.id, a.remind_minutes, !!it.meeting, mems.map((x) => x.user_id || ""), tid);
        out.push(`• ${title}${mems.length ? " ← " + mems.map((x) => x.name).join(", ") : ""}${due ? " (עד " + fmtD(due) + ")" : ""}${evNote}${projNames.size > 1 || (it.project_name && proj && ip.id !== proj.id) ? " [" + ip.name + "]" : ""}`);
        for (const mm of mems) await notifyAssignee(mm.id, title, it.title_ar || null, ip.name, c);
      }
      const head = projNames.size === 1 ? `נשמר ✓ ב"${Array.from(projNames)[0]}" (${out.filter((x) => x.startsWith("•")).length} משימות):` : `נשמר ✓ (${out.filter((x) => x.startsWith("•")).length} משימות):`;
      return head + "\n" + out.join("\n");
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
      if (who) q = q.or(`assignee_id.eq.${who.id},assignee_ids.cs.${JSON.stringify([who.id])}`);
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
      if (a.new_project_name) { const np = matchProject(a.new_project_name, "", P); if (np) { patch.project_id = np.id; parts.push(`פרויקט: ${np.name}`); } }
      if (a.new_area) { patch.area = String(a.new_area).trim(); parts.push(`תחום: ${patch.area}`); }
      if (!parts.length) return "מה לשנות במשימה? (טקסט, תאריך, אחראי, פרויקט או תחום)";
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
      const gen = !proj && a.general === true && /כללי|כללית/.test(text || "");
      if (!proj && !gen) return L(c, "לאיזה פרויקט? כתוב את שם הפרויקט (" + P.map((p: any) => p.name).join(", ") + ") או 'כללי' אם זו הוצאה כללית בלי פרויקט.", "");
      const amount = Number(a.amount);
      if (!isFinite(amount) || amount <= 0) return "לא הצלחתי לקרוא סכום. כתוב אותו בהודעה, למשל: 350 חשמל בנימין " + proj.name;
      const pay = a.pay === "מזומן" || a.pay === "אשראי" ? a.pay : null;
      const vendor = String(a.vendor || "").trim() || "ללא ספק";
      const date = DATE_RE.test(a.date || "") ? a.date : ymd(il());
      const { error } = await db.from("expenses").insert({ project_id: proj ? proj.id : null, vendor, amount, pay, photo: mediaPath, date, note: a.note || null });
      if (error) return "לא הצלחתי לשמור את ההוצאה.";
      return `נשמר ✓ הוצאה ${proj ? 'ב"' + proj.name + '"' : "כללית"}: ${vendor} ${num(amount)} ₪${pay ? " · " + pay : ""}${mediaPath ? " · עם קבלה" : ""}`;
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
      if (a.new_project_name) { const np = matchProject(a.new_project_name, "", P); if (np) { patch.project_id = np.id; parts.push(`פרויקט ${np.name}`); } }
      if (!parts.length) return "מה לשנות בהוצאה? (סכום, ספק, פרויקט או אמצעי תשלום)";
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
        if (ins.error) return "לא הצלחתי לשמור את הספק.";
        sup = ins.data || (await supplierByName(name));
        if (!sup) return "לא הצלחתי לשמור את הספק.";
        created = true;
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
      const stage = STAGES.includes(a.stage) ? a.stage : "אחר";
      const title = String(a.title || "").trim() || stage;
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
    // ----- gantt -----
    case "add_gantt": {
      if (!proj) return needProj;
      const st: any[] = Array.isArray(a.stages) ? a.stages : [];
      const { data: ex } = await db.from("gantt_items").select("end_date").eq("project_id", proj.id).order("end_date", { ascending: false }).limit(1);
      let lastEnd: string | null = ex && ex[0] ? ex[0].end_date : null;
      const rows: any[] = [];
      for (const x of st) {
        const title = String(x.title || "").trim(); if (!title) continue;
        let start = DATE_RE.test(x.start || "") ? x.start : "";
        let end = DATE_RE.test(x.end || "") ? x.end : "";
        if (!start && x.after_last) { start = lastEnd ? addDays(lastEnd, 1) : ymd(il()); end = end || addDays(start, Math.max(0, (Number(x.days) || 6) - 1)); }
        if (!start || !end) continue;
        if (end < start) end = start;
        lastEnd = end;
        rows.push({
          project_id: proj.id, title, start_date: start, end_date: end,
          pct: Math.max(0, Math.min(100, Math.round(Number(x.pct) || 0))),
          color: ganttColor(x.color), milestone: strOrNull(x.milestone), notes: strOrNull(x.notes), client_task: strOrNull(x.client_task),
        });
      }
      if (!rows.length) return "לא הבנתי את השורות. כתוב מה מתוכנן ותאריכי התחלה וסיום, למשל: שבוע ריצוף מה-1.11 עד 6.11.";
      let { error } = await db.from("gantt_items").insert(rows);
      if (error) {
        // columns for milestone / client task / color may not exist yet: retry without them
        const slim = rows.map((r) => ({ project_id: r.project_id, title: r.title, start_date: r.start_date, end_date: r.end_date, pct: r.pct }));
        const r2 = await db.from("gantt_items").insert(slim); error = r2.error;
        if (!error) return `נשמר ✓ בלוח הזמנים של "${proj.name}" (בלי אבני דרך/צבע/הערות: הרץ את ה-SQL של לוח הזמנים):\n` + rows.map((r) => `• ${fmtD(r.start_date)} – ${fmtD(r.end_date)}: ${r.title}`).join("\n");
        return "לא הצלחתי לשמור בלוח הזמנים. ודא שהרצת את ה-SQL של הגאנט.";
      }
      return `נשמר ✓ בלוח הזמנים של "${proj.name}":\n` + rows.map((r) => `• ${fmtD(r.start_date)} – ${fmtD(r.end_date)}: ${r.title}${r.pct ? " · " + r.pct + "%" : ""}${r.milestone ? " · אבן דרך: " + r.milestone : ""}${r.client_task ? " · ללקוח: " + r.client_task : ""}`).join("\n");
    }
    case "update_gantt":
    case "delete_gantt": {
      const ups: any[] = Array.isArray(a.gantt_updates) ? a.gantt_updates : [];
      if (!ups.length) return "איזה שבוע בלוח הזמנים? כתוב מספר שבוע או תאריך, ומה לעדכן.";
      // load rows of the project (numbering = order by start date, like the app)
      const loadRows = async (pid: string) => (await db.from("gantt_items").select("*").eq("project_id", pid).order("start_date").order("end_date")).data || [];
      let list: any[] = [];
      let pr = proj;
      if (!pr) {
        const { data: all } = await db.from("gantt_items").select("project_id").limit(500);
        const ids = Array.from(new Set((all || []).map((g: any) => g.project_id)));
        if (ids.length === 1) pr = P.find((p: any) => p.id === ids[0]) || null;
      }
      if (!pr) return needProj;
      list = await loadRows(pr.id);
      if (!list.length) return `אין שורות בלוח הזמנים של "${pr.name}".`;
      const out: string[] = [];
      const dels: any[] = [];
      for (const u of ups) {
        let g: any = null;
        if (Number(u.week) >= 1) g = list[Number(u.week) - 1] || null;
        else if (DATE_RE.test(u.date || "")) g = list.find((x: any) => x.start_date <= u.date && u.date <= x.end_date) || null;
        else if (u.title) {
          const key = norm(u.title);
          const hits = list.filter((x: any) => norm(x.title).includes(key) || key.includes(norm(x.title)));
          if (hits.length > 1) { out.push(`• "${u.title}": מצאתי כמה שורות, כתוב מספר שבוע (${hits.slice(0, 5).map((h: any) => list.indexOf(h) + 1).join(", ")})`); continue; }
          g = hits[0] || null;
        }
        if (!g) { out.push(`• לא מצאתי שורה ${u.week ? "שבוע " + u.week : u.date ? "בתאריך " + fmtD(u.date) : "\"" + (u.title || "") + "\""}`); continue; }
        const wk = list.indexOf(g) + 1;
        if (a.action === "delete_gantt") { dels.push({ id: g.id, wk, title: g.title }); continue; }
        const patch: any = {}; const parts: string[] = [];
        if (u.pct !== undefined && u.pct !== null && isFinite(Number(u.pct))) { patch.pct = Math.max(0, Math.min(100, Math.round(Number(u.pct)))); parts.push(`הושלם ${patch.pct}%`); }
        if (DATE_RE.test(u.start || "")) { patch.start_date = u.start; parts.push(`התחלה ${fmtD(u.start)}`); }
        if (DATE_RE.test(u.end || "")) { patch.end_date = u.end; parts.push(`סיום ${fmtD(u.end)}`); }
        if (patch.start_date && !patch.end_date && g.end_date < patch.start_date) patch.end_date = patch.start_date;
        if (patch.end_date && !patch.start_date && patch.end_date < g.start_date) patch.start_date = patch.end_date;
        if (u.new_title) { patch.title = String(u.new_title).trim(); parts.push(`תוכן: ${patch.title}`); }
        if (u.color) { patch.color = ganttColor(u.color); parts.push(`צבע ${u.color}`); }
        if (u.milestone !== undefined && u.milestone !== null && String(u.milestone).trim()) { patch.milestone = strOrNull(u.milestone); parts.push(patch.milestone ? `אבן דרך: ${patch.milestone}` : "אבן דרך נוקתה"); }
        if (u.notes !== undefined && u.notes !== null && String(u.notes).trim()) { patch.notes = strOrNull(u.notes); parts.push(patch.notes ? `הערה: ${patch.notes}` : "הערה נוקתה"); }
        if (u.client_task !== undefined && u.client_task !== null && String(u.client_task).trim()) { patch.client_task = strOrNull(u.client_task); parts.push(patch.client_task ? `ללקוח: ${patch.client_task}` : "משימה ללקוח נוקתה"); }
        if (!parts.length) { out.push(`• שבוע ${wk}: מה לעדכן?`); continue; }
        let { error } = await db.from("gantt_items").update(patch).eq("id", g.id);
        if (error) { const slim: any = {}; for (const k of ["pct", "start_date", "end_date", "title", "notes"]) if (k in patch) slim[k] = patch[k]; if (Object.keys(slim).length) error = (await db.from("gantt_items").update(slim).eq("id", g.id)).error; else error = { message: "cols" } as any; }
        out.push(error ? `• שבוע ${wk}: לא הצלחתי לעדכן (ודא שהרצת את ה-SQL של לוח הזמנים)` : `• שבוע ${wk} (${fmtD(patch.start_date || g.start_date)} – ${fmtD(patch.end_date || g.end_date)}): ${parts.join(", ")}`);
      }
      if (dels.length) {
        await savePending(c.from, { kind: "delete_gantt", ids: dels.map((d) => d.id), label: dels.map((d) => `שבוע ${d.wk} (${d.title})`).join(", ") + ` ב"${pr.name}"` });
        return `למחוק ${dels.map((d) => `שבוע ${d.wk} (${d.title})`).join(", ")} מלוח הזמנים של "${pr.name}"?\nכתוב "כן" לאישור.` + (out.length ? "\n" + out.join("\n") : "");
      }
      return `עודכן ✓ לוח הזמנים של "${pr.name}":\n` + out.join("\n");
    }
    case "list_gantt": {
      if (!proj) return needProj;
      const { data } = await db.from("gantt_items").select("*").eq("project_id", proj.id).order("start_date").order("end_date");
      if (!data || !data.length) return `אין שורות בלוח הזמנים של "${proj.name}".`;
      const ov = Math.round(data.reduce((t: number, g: any) => t + (Number(g.pct) || 0), 0) / data.length);
      return `לוח הזמנים של "${proj.name}" (התקדמות כללית ${ov}%):\n` + data.map((g: any, i: number) => `${i + 1}. ${fmtD(g.start_date)} – ${fmtD(g.end_date)}: ${g.title}${g.pct ? " · " + g.pct + "%" : ""}${g.milestone ? " · אבן דרך: " + g.milestone : ""}${g.client_task ? " · ללקוח: " + g.client_task : ""}`).join("\n");
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
• לוח זמנים בנוף: שבוע 1 ריצוף 25-30.10, אבן דרך ספרינקלרים / שבוע 2 הושלם 80% / תוסיף שבוע אחרי האחרון / מה לוח הזמנים בנוף
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
const T_RCPT = /קבלה|קבלת|חשבונית|הוצא|receipt|invoice/i, T_PLAN = /תוכנית|תכנית|שרטוט/, T_DOC = /תיעוד/;
async function handleDocument(c: Ctx, caption: string, id: string, filename: string): Promise<string> {
  if (c.role !== "staff") return L(c, "אין לך הרשאה לשלוח קבצים.", "غير مسموح لك بإرسال الملفات.");
  const dm = await downloadMedia(id);
  if (!dm) return "לא הצלחתי לקבל את הקובץ. נסה שוב.";
  const isPdf = dm.mime.includes("pdf");
  // the caption says it is a receipt -> expense (PDF only)
  if (isPdf && T_RCPT.test(caption) && !T_PLAN.test(caption)) return await route(c, caption, { id, video: false });
  const ext = ((filename.match(/\.([A-Za-z0-9]{1,6})$/) || [])[1] || (isPdf ? "pdf" : "bin")).toLowerCase();
  const path = `plans/wa/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const up = await db.storage.from("photos").upload(path, dm.buf, { contentType: dm.mime || "application/octet-stream" });
  if (up.error) return "לא הצלחתי לשמור את הקובץ.";
  const base = (filename || "").replace(/\.[^.]+$/, "").trim();
  const { data: pr } = await db.from("projects").select("id,name");
  const proj = matchProject("", caption, pr || []);
  const rec: any = { kind: "plan_file", path, name: filename || `file.${ext}`, ext, title: base || caption.trim() || "תוכנית", projId: proj ? proj.id : null };
  if (T_PLAN.test(caption) && proj) return await savePlanRec(rec, proj);
  if (T_DOC.test(caption) && proj) return await saveDocRec(rec, proj);
  await savePending(c.from, rec);
  return "קיבלתי את הקובץ. מה זה? כתוב: תוכנית / " + (isPdf ? "קבלה / " : "") + "תיעוד" + (proj ? "" : ", ואת שם הפרויקט (" + (pr || []).map((p: any) => p.name).join(", ") + ")") + ".\nאפשר לכתוב 'בטל'.";
}
async function saveDocRec(rec: any, proj: any): Promise<string> {
  const { error } = await db.from("docs").insert({ project_id: proj.id, title: rec.title, stage: "אחר", photo: rec.path, date: ymd(il()) });
  return error ? "לא הצלחתי לשמור את התיעוד." : `נשמר ✓ תיעוד ב"${proj.name}": ${rec.title}`;
}

// ---------- contacts ----------
async function handleContacts(c: Ctx, contacts: any[]): Promise<string> {
  if (c.role !== "staff") return L(c, "אין לך הרשאה לשלוח אנשי קשר.", "غير مسموح لك بإرسال جهات الاتصال.");
  const list = (contacts || []).map((x: any) => ({ name: String(x?.name?.formatted_name || x?.name?.first_name || "").trim(), phone: String(x?.phones?.[0]?.phone || x?.phones?.[0]?.wa_id || "").trim() })).filter((x: any) => x.name || x.phone);
  if (!list.length) return "לא הצלחתי לקרוא את איש הקשר.";
  await savePending(c.from, { kind: "contact", list });
  return "קיבלתי: " + list.map((x: any) => `${x.name} ${x.phone}`.trim()).join(" ; ") + "\nמה לעשות איתו? למשל: \"תשמור כספק אלומיניום ותשייך לפרויקט הזולאי\" (או 'בטל').";
}

// ---------- voice notes (speech to text) ----------
const STT_KEY = Deno.env.get("STT_KEY") || "";
const STT_PROVIDER = (Deno.env.get("STT_PROVIDER") || "groq").toLowerCase();
const STT_MODEL = Deno.env.get("STT_MODEL") || (STT_PROVIDER === "openai" ? "gpt-4o-transcribe" : "whisper-large-v3");
async function transcribe(buf: Uint8Array, mime: string, hint: string): Promise<string> {
  const ext = /ogg|opus/i.test(mime) ? "ogg" : /mp4|m4a|aac/i.test(mime) ? "m4a" : /mpeg|mp3/i.test(mime) ? "mp3" : /wav/i.test(mime) ? "wav" : /webm/i.test(mime) ? "webm" : "ogg";
  const url = STT_PROVIDER === "openai" ? "https://api.openai.com/v1/audio/transcriptions" : "https://api.groq.com/openai/v1/audio/transcriptions";
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: mime.split(";")[0] || "audio/ogg" }), `voice.${ext}`);
  fd.append("model", STT_MODEL);
  fd.append("response_format", "json");
  fd.append("temperature", "0");
  if (hint) fd.append("prompt", hint.slice(0, 700));
  const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${STT_KEY}` }, body: fd });
  if (!res.ok) throw new Error("stt " + res.status);
  const j = await res.json();
  return String(j.text || "").trim();
}
async function handleAudio(c: Ctx, id: string): Promise<string> {
  if (!STT_KEY) return L(c, "תמלול הודעות קוליות עדיין לא הופעל. כתוב לי בטקסט.", "الرسائل الصوتية غير مفعّلة بعد، اكتب لي نصاً.");
  const dm = await downloadMedia(id);
  if (!dm) return L(c, "לא הצלחתי לקבל את ההקלטה. נסה שוב.", "تعذّر استلام التسجيل، حاول مرة أخرى.");
  if (dm.buf.length > 24 * 1024 * 1024) return L(c, "ההקלטה ארוכה מדי. שלח קצרה יותר.", "التسجيل طويل جداً، أرسل تسجيلاً أقصر.");
  const { data: pr } = await db.from("projects").select("name");
  const hint = "הודעה קולית של מנהל עבודה בחברת בנייה בישראל. פרויקטים: " + (pr || []).map((p: any) => p.name).join(", ") + ". אנשי צוות: " + c.team.map((m: any) => m.name).join(", ") + ". מילים: משימה, פגישה, בטון, טיח, ריצוף, שפכטל, אינסטלציה, חשמל, איטום, קבלה, ספק.";
  let text = "";
  try { text = await transcribe(dm.buf, dm.mime, hint); } catch (_e) { return L(c, "התמלול נכשל. נסה שוב או כתוב בטקסט.", "فشل التفريغ، حاول مرة أخرى أو اكتب نصاً."); }
  if (text.replace(/[\s.,!?]/g, "").length < 2) return L(c, "לא שמעתי כלום בהקלטה.", "لم أسمع شيئاً في التسجيل.");
  const out = await route(c, text, null, true);
  return `🎤 ${L(c, "שמעתי", "سمعت")}: "${text.slice(0, 600)}"\n\n${out}`;
}

// ---------- routing ----------
async function route(c: Ctx, text: string, media: { id: string; video: boolean } | null, voice = false): Promise<string> {
  const t = text.trim();
  if (c.role === "staff" && !media && /^\s*גרסה\s*$/.test(t)) return "גרסת הבוט: " + BOT_VERSION;
  if (!media && t) { const pre = await preRoute(c, t); if (pre) return pre; }
  // image/video waiting for the missing detail (usually the project)
  let tt = t;
  let mediaCarry: { buf: Uint8Array; mime: string } | null = null;
  let carryPath: string | null = null, carryVideo = false;
  if (c.role === "staff" && !media && t) {
    const mp = await peekPending(c.from);
    if (mp && mp.kind === "media_wait") {
      await db.from("bot_pending").delete().eq("phone", c.from);
      if (NO.test(t)) return "בוטל. התמונה לא נשמרה.";
      try {
        const dl = await db.storage.from("photos").download(mp.path);
        if (dl.data) { mediaCarry = { buf: new Uint8Array(await dl.data.arrayBuffer()), mime: mp.mime }; carryPath = mp.path; carryVideo = !!mp.video; }
      } catch (_e) { /* ignore */ }
      if (mediaCarry) tt = (mp.text ? mp.text + "\n" : "") + "(תשובה לשאלה על התמונה ששלחתי קודם: " + t + ")";
    }
  }
  // contact waiting for an instruction
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
      const list = (pr || []).map((p: any) => p.name).join(", ");
      const kindW = T_RCPT.test(t) ? "rcpt" : T_PLAN.test(t) ? "plan" : T_DOC.test(t) ? "doc" : "";
      const proj = (t.length <= 80 ? matchProject(t, t, pr || []) : null) || (pr || []).find((p: any) => p.id === pp.projId) || null;
      if (!kindW) { if (t.length <= 80) return "זו תוכנית, קבלה או תיעוד? כתוב אחת מהמילים האלה" + (proj ? "" : " ואת שם הפרויקט (" + list + ")") + ", או 'בטל'."; }
      else if (kindW === "rcpt") {
        if (pp.ext !== "pdf") return "קבלה אפשר לשלוח כ-PDF או כתמונה. הקובץ הזה אינו PDF. כתוב 'תוכנית' או 'תיעוד', או 'בטל'.";
        await db.from("bot_pending").delete().eq("phone", c.from);
        const dl = await db.storage.from("photos").download(pp.path);
        if (dl.data) {
          mediaCarry = { buf: new Uint8Array(await dl.data.arrayBuffer()), mime: "application/pdf" }; carryPath = pp.path; carryVideo = false;
          tt = "(קבלה ב-PDF שנשלחה קודם) " + t + (proj && !matchProject(t, t, pr || []) ? " " + proj.name : "");
        }
      } else {
        if (!proj) return "לאיזה פרויקט? כתוב את שמו (" + list + ") או 'בטל'.";
        await db.from("bot_pending").delete().eq("phone", c.from);
        return kindW === "plan" ? await savePlanRec(pp, proj) : await saveDocRec(pp, proj);
      }
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
  if (mediaCarry) { m = mediaCarry; path = carryPath; media = { id: "", video: carryVideo }; }
  if (AI_KEY) {
    try {
      const out = await handleAI(c, voice ? tt + "\n[הערה: הטקסט תומלל אוטומטית מהודעה קולית, ייתכנו טעויות שמיעה בשמות ובמילים. תקן לפי רשימות הפרויקטים והצוות.]" : tt, m, !!media?.video, path);
      if (c.role === "staff" && media && m && path && (/^(לאיזה פרויקט|لأي مشروع)/.test(out) || /[?؟]\s*$/.test(out.trim()))) {
        await savePending(c.from, { kind: "media_wait", path, mime: m.mime, video: !!media.video, text: t });
      }
      return out;
    } catch (_e) { /* fall back */ }
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
      await waTouch(from);
      let out = helpText(c);
      if (c.role === "client" || c.role === "architect") { out = await handleExternal(c, m); if (out) await reply(from, out); continue; }
      if (m.type === "button" || m.type === "interactive") { out = await handleButton(c, m); if (out) await reply(from, out); continue; }
      if (m.type === "text") out = await route(c, m.text?.body || "", null);
      else if (m.type === "image") out = await route(c, m.image?.caption || "", { id: m.image.id, video: false });
      else if (m.type === "video") out = await route(c, m.video?.caption || "", { id: m.video.id, video: true });
      else if (m.type === "audio") out = await handleAudio(c, m.audio.id);
      else if (m.type === "contacts") out = await handleContacts(c, m.contacts || []);
      else if (m.type === "document") out = await handleDocument(c, m.document?.caption || "", m.document.id, m.document?.filename || "");
      else out = L(c, "אני מבין טקסט, תמונות, וידאו וקבצים בלבד.", "أفهم النصوص والصور والفيديو والملفات فقط.");
      {
        let uText = "";
        if (m.type === "text") uText = m.text?.body || "";
        else if (m.type === "image" || m.type === "video") uText = "[" + (m.type === "image" ? "תמונה" : "וידאו") + "] " + ((m[m.type]?.caption) || "");
        else if (m.type === "audio") { const mm = /"([^"]*)"/.exec(out); uText = "[הודעה קולית] " + (mm ? mm[1] : ""); }
        else if (m.type === "document") uText = "[קובץ] " + (m.document?.caption || m.document?.filename || "");
        if (uText) await saveMem(from, uText, out);
      }
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
    if (body?.action === "cron") {
      const { data: ck } = await db.from("bot_config").select("value").eq("key", "cron_key").maybeSingle();
      if (!ck || body.key !== ck.value) return jres({ ok: false }, 401);
      return jres({ ok: true, sent: await runCron(body.force) });
    }
    if (body?.action === "cron_test") {
      if (!(await authStaff(req))) return jres({ ok: false, error: "unauthorized" }, 401);
      return jres({ ok: true, sent: await runCron(body.force) });
    }
    if (body?.action === "send_ext") {
      if (!(await authStaff(req))) return jres({ ok: false, error: "unauthorized" }, 401);
      const r = await sendExtFromApp(body);
      return jres(r);
    }
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

// ===================== part 6 (12.11.26): proactive messages, clients, architects, weekly gantt =====================
const TPL = {
  morning: Deno.env.get("TPL_MORNING") || "feder_morning",
  morning_ar: Deno.env.get("TPL_MORNING_AR") || "feder_morning_ar",
  meeting: Deno.env.get("TPL_MEETING") || "feder_meeting",
  meeting_ar: Deno.env.get("TPL_MEETING_AR") || "feder_meeting_ar",
  evening: Deno.env.get("TPL_EVENING") || "feder_evening",
  evening_ar: Deno.env.get("TPL_EVENING_AR") || "feder_evening_ar",
  update: Deno.env.get("TPL_UPDATE") || "feder_update",
};
const MORNING_HOUR = Number(Deno.env.get("MORNING_HOUR") || 7);
const EVENING_HOUR = Number(Deno.env.get("EVENING_HOUR") || 17);
const last9 = (p: any) => String(p || "").replace(/\D/g, "").slice(-9);
const intl = (p: any) => { let d = String(p || "").replace(/\D/g, ""); if (d.startsWith("0")) d = "972" + d.slice(1); return d; };

// ---------- 24h window bookkeeping ----------
async function waTouch(from: string) {
  try { await db.from("wa_window").upsert({ phone: from, last_in: new Date().toISOString() }); } catch (_e) { /* table missing */ }
}
async function windowOpen(to: string): Promise<boolean> {
  try {
    const { data } = await db.from("wa_window").select("last_in").eq("phone", to).maybeSingle();
    return !!data && Date.now() - Date.parse(data.last_in) < 23.5 * 3600 * 1000;
  } catch (_e) { return false; }
}
async function sendTemplate(to: string, name: string, lang: string, params: string[], payload?: string): Promise<boolean> {
  const comps: any[] = [{ type: "body", parameters: params.map((t) => ({ type: "text", text: String(t).replace(/[\n\t]+/g, " ").replace(/ {4,}/g, " ").slice(0, 900) || "-" })) }];
  if (payload) comps.push({ type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload }] });
  const r = await fetch(`${G}/${PHONE_ID}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "template", template: { name, language: { code: lang }, components: comps } }),
  });
  return r.ok;
}
// send free text if the 24h window is open, otherwise the template (and keep the full text for the button press)
async function waSend(to: string, fullText: string, tpl: { name: string; lang: string; params: string[]; payload: string }): Promise<string> {
  if (await windowOpen(to)) { await reply(to, fullText); return "text"; }
  await db.from("bot_pending").upsert({ phone: "more:" + to, payload: { text: fullText }, created_at: new Date().toISOString() });
  const ok = await sendTemplate(to, tpl.name, tpl.lang, tpl.params, tpl.payload);
  return ok ? "template" : "failed";
}
async function stateGet(k: string) { try { const { data } = await db.from("bot_state").select("value").eq("key", k).maybeSingle(); return data?.value ?? null; } catch (_e) { return null; } }
async function stateSet(k: string, v: string) { try { await db.from("bot_state").upsert({ key: k, value: v, updated_at: new Date().toISOString() }); } catch (_e) { /* ignore */ } }

// ---------- people & task lists ----------
async function teamPeople() {
  const { data: team } = await db.from("team_members").select("id,name,name_ar,phone,user_id");
  const { data: prof } = await db.from("profiles").select("id,role");
  const roles: Record<string, string> = {}; (prof || []).forEach((p: any) => (roles[p.id] = p.role));
  return (team || []).map((m: any) => {
    const ph = intl(m.phone);
    let r = m.user_id ? roles[m.user_id] || "worker" : "worker";
    if (ALLOWED.includes(ph) && r === "worker") r = "admin";
    return { ...m, intl: ph, urole: r, lang: r === "worker" ? "ar" : "he" };
  });
}
const isMine = (t: any, mid: string) => t.assignee_id === mid || (Array.isArray(t.assignee_ids) && t.assignee_ids.includes(mid));
async function openTasksUpTo(day: string) {
  const { data } = await db.from("tasks").select("id,title,title_ar,project_id,status,due,due_time,kind,assignee_id,assignee_ids").neq("status", "הושלם").neq("status", "ממתין להחלטה").lte("due", day).order("due", { ascending: true });
  return data || [];
}
async function projMap() {
  const { data } = await db.from("projects").select("id,name,name_ar,status,client_phone,client_name,architect_phone,architect_name,sched_start,sched_weeks");
  const m: Record<string, any> = {}; (data || []).forEach((p: any) => (m[p.id] = p)); return { list: data || [], byId: m };
}
function fmtList(tasks: any[], pm: Record<string, any>, ar: boolean, today: string, numbered = false, start = 1) {
  const groups: Record<string, any[]> = {};
  tasks.forEach((t) => { const k = t.project_id || "-"; (groups[k] = groups[k] || []).push(t); });
  let n = start; const lines: string[] = [];
  Object.keys(groups).forEach((k) => {
    const p = pm[k]; lines.push("*" + (p ? (ar ? p.name_ar || p.name : p.name) : (ar ? "عام" : "כללי")) + "*");
    groups[k].forEach((t) => {
      const late = t.due && t.due < today;
      lines.push((numbered ? n++ + ". " : "• ") + (ar ? t.title_ar || t.title : t.title) + (t.kind === "פגישה" && t.due_time ? " 🕐 " + t.due_time : "") + (late ? (ar ? " ⚠️ متأخرة" : " ⚠️ באיחור") : ""));
    });
    lines.push("");
  });
  return lines.join("\n").trim();
}
async function morningFor(person: any, all: any[], people: any[], pm: Record<string, any>, today: string) {
  const workers = people.filter((p) => p.urole === "worker").map((p) => p.id);
  const mine = all.filter((t) => isMine(t, person.id));
  let extra: any[] = [];
  if (person.urole === "admin" || person.urole === "team") extra = all.filter((t) => !isMine(t, person.id) && workers.some((w) => isMine(t, w)));
  const ar = person.lang === "ar";
  const first = String(ar ? person.name_ar || person.name : person.name).split(" ")[0];
  let txt = (ar ? "☀️ صباح الخير " : "☀️ בוקר טוב ") + first + "\n\n";
  if (mine.length) txt += (extra.length ? (ar ? "مهامك:\n" : "*המשימות שלך:*\n") : "") + fmtList(mine, pm, ar, today);
  else if (extra.length) txt += ar ? "لا توجد مهام لك اليوم.\n" : "אין לך משימות להיום.\n";
  if (extra.length) {
    const byW: Record<string, any[]> = {};
    extra.forEach((t) => { const w = people.find((p) => p.urole === "worker" && isMine(t, p.id)); const k = w ? w.name : "צוות"; (byW[k] = byW[k] || []).push(t); });
    Object.keys(byW).forEach((k) => { txt += "\n\n*המשימות של " + k + ":*\n" + fmtList(byW[k], pm, false, today); });
  }
  txt += ar ? "\n\nاكتب لي عندما تنتهي من شيء ✔️" : "\n\nכתוב לי כשסיימת משהו ✔️";
  return { count: mine.length + extra.length, text: txt.trim(), first };
}

// ---------- weekly gantt (Amit's format) helpers ----------
function curWeek(p: any, today: string) {
  if (!p.sched_start) return 0;
  const s = new Date(p.sched_start + "T12:00:00"); s.setDate(s.getDate() - s.getDay());
  const t = new Date(today + "T12:00:00");
  return Math.floor((t.getTime() - s.getTime()) / (7 * 864e5)) + 1;
}
const tgt = (r: any) => (r.targets && typeof r.targets === "object" ? r.targets : {});
function targetAt(r: any, w: number) { let b = 0; for (const k of Object.keys(tgt(r))) { const v = tgt(r)[k]; if (+k <= w && v != null && +v > b) b = +v; } return b; }
async function schedBehind(p: any, today: string) {
  const cw = curWeek(p, today); if (cw < 1) return { cw, rows: [] as any[], late: [] as string[] };
  const { data: rows } = await db.from("sched_rows").select("id,title,section,targets,actual,done").eq("project_id", p.id);
  const { data: resp } = await db.from("resp_items").select("item,week,done,grp").eq("project_id", p.id);
  const late: string[] = [], week: any[] = [];
  (rows || []).forEach((r: any) => {
    if (r.section === "client") { const ws = Object.keys(tgt(r)).map(Number).sort((a, b) => a - b); if (!r.done && ws[0] && ws[0] < cw) late.push(r.title); return; }
    const act = +r.actual || 0, prev = targetAt(r, cw - 1), cur = targetAt(r, cw);
    if (act < prev) late.push(r.title);
    if (Object.prototype.hasOwnProperty.call(tgt(r), String(cw)) && act < cur) week.push({ ...r, target: cur });
    else if (act < prev) week.push({ ...r, target: prev });
  });
  (resp || []).forEach((it: any) => { if (!it.done && it.week && it.week < cw && !late.includes(it.item)) late.push(it.item); });
  return { cw, rows: week, late };
}

// ---------- the scheduler: POST {action:"cron", key} every 15 minutes ----------
async function runCron(force?: string) {
  const now = il(), today = ymd(now), dow = now.getDay(), hh = now.getHours(), mm = now.getMinutes();
  const work = dow >= 0 && dow <= 4; // Sunday..Thursday
  const out: string[] = [];
  const people = (await teamPeople()).filter((p) => p.intl.length >= 11);
  const pm = await projMap();
  // meeting reminders ~30 minutes before
  {
    const { data: meets } = await db.from("tasks").select("id,title,title_ar,project_id,due,due_time,assignee_id,assignee_ids,status,kind").eq("due", today).eq("kind", "פגישה").neq("status", "הושלם");
    for (const t of meets || []) {
      if (!t.due_time) continue;
      const [h, mi] = String(t.due_time).split(":").map(Number);
      const mins = h * 60 + mi - (hh * 60 + mm);
      if (mins <= 10 || mins > 45) continue;
      if (await stateGet("meet:" + t.id)) continue;
      await stateSet("meet:" + t.id, "1");
      let to = people.filter((p) => isMine(t, p.id));
      if (!to.length) to = people.filter((p) => p.urole === "admin");
      for (const p of to) {
        const ar = p.lang === "ar", pn = pm.byId[t.project_id];
        const title = (ar ? t.title_ar || t.title : t.title) + (pn ? " · " + (ar ? pn.name_ar || pn.name : pn.name) : "");
        const txt = (ar ? "⏰ تذكير: " : "⏰ תזכורת: ") + title + (ar ? " اليوم الساعة " : " היום בשעה ") + t.due_time + (ar ? "." : ". אתה זוכר?");
        await waSend(p.intl, txt, { name: ar ? TPL.meeting_ar : TPL.meeting, lang: ar ? "ar" : "he", params: [title, t.due_time], payload: "meet_ok" });
        out.push("meeting→" + p.name);
      }
    }
  }
  // morning tasks
  if ((work && hh === MORNING_HOUR) || force === "morning") {
    const all = await openTasksUpTo(today);
    for (const p of people) {
      const k = "morning:" + today + ":" + p.id;
      if (force !== "morning" && await stateGet(k)) continue;
      await stateSet(k, "1");
      const m = await morningFor(p, all, people, pm.byId, today);
      if (!m.count) continue;
      const ar = p.lang === "ar";
      await waSend(p.intl, m.text, { name: ar ? TPL.morning_ar : TPL.morning, lang: ar ? "ar" : "he", params: [m.first, String(m.count)], payload: "show_tasks" });
      out.push("morning→" + p.name);
    }
  }
  // end of day: did you do it + gantt questions; late projects → CEO
  if ((work && hh === EVENING_HOUR) || force === "evening") {
    const all = await openTasksUpTo(today);
    const sched: Record<string, any> = {};
    for (const pr of pm.list) if (pr.sched_start && pr.status !== "הסתיים") sched[pr.id] = await schedBehind(pr, today);
    for (const p of people) {
      const k = "evening:" + today + ":" + p.id;
      if (force !== "evening" && await stateGet(k)) continue;
      await stateSet(k, "1");
      const ar = p.lang === "ar";
      const mine = all.filter((t) => isMine(t, p.id));
      const items: any[] = mine.map((t, i) => ({ n: i + 1, type: "task", id: t.id, title: ar ? t.title_ar || t.title : t.title }));
      if (p.urole === "admin" || p.urole === "team") {
        Object.keys(sched).forEach((pid) => sched[pid].rows.slice(0, 6).forEach((r: any) => items.push({ n: items.length + 1, type: "sched", id: r.id, title: r.title, project: pm.byId[pid]?.name || "", actual: +r.actual || 0, target: r.target })));
      }
      if (!items.length) continue;
      let txt = ar ? "🌙 مساء الخير. هل أنهيت؟\n" : "🌙 סיכום יום – מה בוצע?\n";
      const tk = items.filter((x) => x.type === "task"), sc = items.filter((x) => x.type === "sched");
      if (tk.length) txt += "\n" + tk.map((x) => x.n + ". " + x.title).join("\n");
      if (sc.length) txt += "\n\n*לפי הגאנט:*\n" + sc.map((x) => x.n + ". " + x.title + " (" + x.project + ") – יעד " + x.target + "%, עכשיו " + x.actual + "%").join("\n");
      txt += ar ? "\n\nاكتب أرقام المهام المنجزة، مثلاً: 1,3" : "\n\nענה למשל: *1,3* (בוצעו)" + (sc.length ? " או *" + sc[0].n + " 80* (אחוז בגאנט)" : "") + ". \"הכל\" = הכול בוצע.";
      await db.from("bot_pending").upsert({ phone: "eod:" + p.intl, payload: { items, ar }, created_at: new Date().toISOString() });
      const first = String(ar ? p.name_ar || p.name : p.name).split(" ")[0];
      await waSend(p.intl, txt, { name: ar ? TPL.evening_ar : TPL.evening, lang: ar ? "ar" : "he", params: [first, String(items.length)], payload: "eod" });
      out.push("evening→" + p.name);
    }
    // a project that just fell behind → CEO (or the admins)
    const bosses = people.filter((p) => p.urole === "ceo");
    const toAlert = bosses.length ? bosses : people.filter((p) => p.urole === "admin");
    for (const pid of Object.keys(sched)) {
      const s = sched[pid], was = await stateGet("late:" + pid), now2 = s.late.length ? "late" : "ok";
      if (now2 !== was) await stateSet("late:" + pid, now2);
      if (now2 === "late" && was !== "late") {
        const pn = pm.byId[pid]?.name || "";
        const txt = "⚠️ " + pn + " נכנס לאיחור (שבוע " + s.cw + ").\nמעכב: " + s.late.slice(0, 4).join(", ");
        for (const b of toAlert) await waSend(b.intl, txt, { name: TPL.update, lang: "he", params: [pn, "נכנס לאיחור – מעכב: " + s.late.slice(0, 3).join(", ")], payload: "more" });
        out.push("late→" + pn);
      }
    }
  }
  // weekly report (Thursday afternoon) → staff and CEO only, never clients/workers
  if ((dow === 4 && hh === WEEKLY_HOUR) || force === "weekly") {
    const k = "weekly:" + today;
    if (force === "weekly" || !(await stateGet(k))) {
      await stateSet(k, "1");
      const txt = await weeklyReport(today, pm);
      for (const p of people.filter((x) => x.urole === "admin" || x.urole === "team" || x.urole === "ceo")) {
        await waSend(p.intl, txt, { name: TPL.update, lang: "he", params: ["סיכום שבועי", "הדוח השבועי של כל הפרויקטים מוכן"], payload: "more" });
        out.push("weekly→" + p.name);
      }
    }
  }
  return out;
}
const WEEKLY_HOUR = Number(Deno.env.get("WEEKLY_HOUR") || 14);
async function weeklyReport(today: string, pm: { list: any[]; byId: Record<string, any> }) {
  const from = addDays(today, -6), next7 = addDays(today, 7);
  const { data: done } = await db.from("tasks").select("title,project_id,done_at").eq("status", "הושלם").gte("done_at", from + "T00:00:00");
  const { data: open } = await db.from("tasks").select("title,project_id,due,status").neq("status", "הושלם");
  const { data: exp } = await db.from("expenses").select("amount,project_id,date").gte("date", from);
  const lines: string[] = ["📊 *סיכום שבועי – פדר בניה*", fmtD(from) + "–" + fmtD(today), ""];
  let totalExp = 0;
  for (const p of pm.list.filter((x: any) => x.status !== "הסתיים")) {
    const d = (done || []).filter((t: any) => t.project_id === p.id);
    const o = (open || []).filter((t: any) => t.project_id === p.id);
    const late = o.filter((t: any) => t.due && t.due < today);
    const nextW = o.filter((t: any) => t.due && t.due >= today && t.due <= next7);
    const dec = o.filter((t: any) => t.status === "ממתין להחלטה");
    const e = (exp || []).filter((x: any) => x.project_id === p.id).reduce((s: number, x: any) => s + (Number(x.amount) || 0), 0);
    totalExp += e;
    if (!d.length && !o.length && !e) continue;
    lines.push("🏗️ *" + p.name + "*");
    if (p.sched_start) {
      const sb = await schedBehind(p, today);
      lines.push("שבוע " + sb.cw + " בגאנט" + (sb.late.length ? " · ⚠️ מעכב: " + sb.late.slice(0, 3).join(", ") : " · בזמן ✅"));
    }
    if (d.length) lines.push("✔️ בוצעו " + d.length + ": " + d.slice(0, 5).map((t: any) => t.title).join(", ") + (d.length > 5 ? "…" : ""));
    if (late.length) lines.push("⚠️ באיחור " + late.length + ": " + late.slice(0, 4).map((t: any) => t.title).join(", "));
    if (dec.length) lines.push("❓ ממתין להחלטה: " + dec.slice(0, 3).map((t: any) => t.title).join(", "));
    if (nextW.length) lines.push("📅 שבוע הבא: " + nextW.slice(0, 4).map((t: any) => t.title).join(", "));
    if (e) lines.push("💰 הוצאות השבוע: ₪" + num(e));
    lines.push("");
  }
  if (totalExp) lines.push("סה״כ הוצאות השבוע: ₪" + num(totalExp));
  lines.push("שבת שלום 🙏");
  return lines.join("\n").trim();
}

// ---------- buttons (template quick replies) ----------
async function handleButton(c: Ctx, m: any): Promise<string> {
  const payload = m.button?.payload || m.interactive?.button_reply?.id || "";
  const text = m.button?.text || m.interactive?.button_reply?.title || "";
  const ar = c.lang === "ar";
  const more = await db.from("bot_pending").select("payload").eq("phone", "more:" + c.from).maybeSingle();
  if (payload === "show_tasks") {
    const today = ymd(il()), people = await teamPeople(), pm = await projMap();
    const me = people.find((p) => last9(p.phone) === last9(c.from));
    if (!me) return more.data?.payload?.text || "";
    const mm = await morningFor(me, await openTasksUpTo(today), people, pm.byId, today);
    return mm.count ? mm.text : (ar ? "لا توجد مهام اليوم 👍" : "אין משימות להיום 👍");
  }
  if (payload === "eod") {
    const p = await db.from("bot_pending").select("payload").eq("phone", "eod:" + c.from).maybeSingle();
    return more.data?.payload?.text || (p.data ? "מה בוצע?" : (ar ? "شكراً" : "תודה!"));
  }
  if (payload === "meet_ok") return ar ? "👍" : "מעולה 👍";
  if (more.data?.payload?.text) { await db.from("bot_pending").delete().eq("phone", "more:" + c.from); return more.data.payload.text; }
  return text ? await route(c, text, null) : "";
}

// ---------- replies to the end-of-day list ("1,3" / "5 80" / "הכל") ----------
async function preRoute(c: Ctx, t: string): Promise<string | null> {
  if (c.role !== "staff" && c.role !== "worker") return null;
  const { data } = await db.from("bot_pending").select("payload,created_at").eq("phone", "eod:" + c.from).maybeSingle();
  if (!data || Date.now() - Date.parse(data.created_at) > 20 * 3600 * 1000) return null;
  const items: any[] = data.payload.items || [], ar = !!data.payload.ar;
  const all = /^(הכל|הכול|כולם|כולן|הכל בוצע|כל המשימות|الكل|كلها|خلصت كل)/.test(t.trim());
  const nums = (t.match(/\d{1,3}\s*%?/g) || []).map((x) => ({ v: parseInt(x, 10), pct: /%/.test(x) }));
  const rest = t.replace(/\d+|%|[,.\-–=:\s]|בוצעו|בוצע|הושלמו|סיימתי|גמרתי|גמרנו|סגרתי|כן|ו|تم|خلصت|و/g, "");
  if (!all && (!nums.length || rest.length > 0)) return null;
  const done: string[] = [], gantt: string[] = [];
  if (all) items.filter((x) => x.type === "task").forEach((x) => done.push(x.id));
  for (let i = 0; i < nums.length; i++) {
    const it = items.find((x) => x.n === nums[i].v); if (!it || nums[i].pct) continue;
    if (it.type === "sched" && i + 1 < nums.length && (nums[i + 1].pct || !items.some((x) => x.n === nums[i + 1].v) || nums[i + 1].v > items.length)) {
      const pct = Math.max(0, Math.min(100, nums[i + 1].v)); i++;
      await db.from("sched_rows").update({ actual: pct, updated_at: new Date().toISOString() }).eq("id", it.id);
      gantt.push(it.title + " " + pct + "%");
    } else if (it.type === "task") done.push(it.id);
    else if (it.type === "sched") { await db.from("sched_rows").update({ actual: 100, updated_at: new Date().toISOString() }).eq("id", it.id); gantt.push(it.title + " 100%"); }
  }
  if (!done.length && !gantt.length) return null;
  if (done.length) await db.from("tasks").update({ status: "הושלם", done_at: new Date().toISOString() }).in("id", done);
  const left = items.filter((x) => x.type === "task" && !done.includes(x.id));
  if (!left.length) await db.from("bot_pending").delete().eq("phone", "eod:" + c.from);
  if (ar) return "شكراً! ✔️ تم تحديث " + done.length + " مهام" + (left.length ? "\nباقي: " + left.map((x) => x.n + ". " + x.title).join("، ") : "");
  return "עודכן ✓" + (done.length ? "\nבוצעו: " + items.filter((x) => done.includes(x.id)).map((x) => x.title).join(", ") : "") + (gantt.length ? "\nגאנט: " + gantt.join(", ") : "") + (left.length ? "\nנשארו פתוחות: " + left.map((x) => x.n + ". " + x.title).join(", ") : "");
}

// ---------- clients & architects (limited) ----------
async function identifyExternal(from: string, T: any[]): Promise<Ctx | null> {
  try {
    const { data } = await db.from("projects").select("id,name,client_phone,client_name,architect_phone,architect_name,status");
    const l9 = from.slice(-9);
    const arch = (data || []).filter((p: any) => last9(p.architect_phone) === l9 && p.status !== "הסתיים");
    const cli = (data || []).filter((p: any) => last9(p.client_phone) === l9 && p.status !== "הסתיים");
    if (arch.length) return { from, role: "architect", lang: "he", member: null, name: arch[0].architect_name || "", team: T, projects: arch };
    if (cli.length) return { from, role: "client", lang: "he", member: null, name: cli[0].client_name || "", team: T, projects: cli };
  } catch (_e) { /* columns missing */ }
  return null;
}
async function staffPush(title: string, body: string) { await pushTo(await adminIds(), title, body); }
const SUP_FIELDS = ["מטבח", "אלומיניום", "אינסטלציה", "חשמל", "מיזוג", "דלתות", "ריצוף", "שיש", "סניטרי", "תאורה", "נגרות", "זכוכית", "צבע", "גבס", "מעקות", "פרגולה"];
async function addClientSupplier(pid: string, name: string, phone: string, field: string) {
  const d = String(phone || "").replace(/\D/g, "");
  let sid: string | null = null;
  if (d.length >= 9) {
    const { data } = await db.from("suppliers").select("id,phone");
    const f = (data || []).find((s: any) => last9(s.phone) === d.slice(-9)); if (f) sid = f.id;
  }
  if (!sid) {
    const ins = await db.from("suppliers").insert({ name: name || phone, phone: phone || null, field: field || null, notes: "נוסף ע״י הלקוח בוואטסאפ" }).select("id").maybeSingle();
    sid = ins.data?.id || null;
  }
  if (!sid) return false;
  let r = await db.from("project_suppliers").upsert({ project_id: pid, supplier_id: sid, client_added: true }, { onConflict: "project_id,supplier_id" });
  if (r.error) r = await db.from("project_suppliers").upsert({ project_id: pid, supplier_id: sid }, { onConflict: "project_id,supplier_id" });
  return !r.error;
}
async function handleExternal(c: Ctx, m: any): Promise<string> {
  const ps = c.projects || [];
  let proj = ps[0];
  const isArch = c.role === "architect";
  const askK = "ext:" + c.from;
  const { data: ask } = await db.from("bot_pending").select("payload,created_at").eq("phone", askK).maybeSingle();
  if (ask?.payload?.project_id) proj = ps.find((p: any) => p.id === ask.payload.project_id) || proj;
  const text = m.type === "text" ? String(m.text?.body || "").trim() : (m.button?.text || m.interactive?.button_reply?.title || "");
  if (m.type === "button" || m.type === "interactive") {
    const more = await db.from("bot_pending").select("payload").eq("phone", "more:" + c.from).maybeSingle();
    if (more.data?.payload?.text) { await db.from("bot_pending").delete().eq("phone", "more:" + c.from); return more.data.payload.text; }
  }
  // which project (if several)
  if (ps.length > 1 && !ask?.payload?.project_id && text) { const pp = matchProject(text, text, ps); if (pp) proj = pp; }
  // files / photos
  if (m.type === "document" || m.type === "image") {
    const id = m.document?.id || m.image?.id, fname = m.document?.filename || "תמונה.jpg";
    const md = await downloadMedia(id); if (!md) return "לא הצלחתי לקבל את הקובץ, אפשר לשלוח שוב?";
    const ext = (fname.match(/\.([A-Za-z0-9]{1,6})$/) || [])[1]?.toLowerCase() || (md.mime.includes("pdf") ? "pdf" : "jpg");
    const path = "plans/ext/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
    const up = await db.storage.from("photos").upload(path, md.buf, { contentType: md.mime });
    if (up.error) return "לא הצלחתי לשמור את הקובץ, אפשר לשלוח שוב?";
    const title = (m.document?.caption || m.image?.caption || fname.replace(/\.[^.]+$/, "")).slice(0, 120);
    const row: any = { project_id: proj.id, title, file_path: path, file_name: fname, file_type: ext, kind: isArch ? "תוכנית" : "מסמך אחר", notes: isArch ? "נשלח ע״י האדריכלית בוואטסאפ" : "נשלח ע״י הלקוח בוואטסאפ" };
    let ins = await db.from("plans").insert(row);
    if (ins.error) { delete row.kind; ins = await db.from("plans").insert(row); }
    await staffPush(isArch ? "האדריכלית שלחה קובץ" : "הלקוח שלח קובץ", title + " · " + proj.name);
    return "תודה! הקובץ נשמר בפרויקט " + proj.name + " ✔️" + (ps.length > 1 ? "\n(אם זה לפרויקט אחר, כתבו את שמו)" : "");
  }
  // contacts → supplier (clients)
  if (m.type === "contacts" && !isArch) {
    const list = (m.contacts || []).map((x: any) => ({ name: String(x?.name?.formatted_name || x?.name?.first_name || "").trim(), phone: String(x?.phones?.[0]?.phone || x?.phones?.[0]?.wa_id || "").trim() }));
    const names: string[] = [];
    for (const x of list) { const field = (ask?.payload?.topic && SUP_FIELDS.find((f) => String(ask.payload.topic).includes(f))) || SUP_FIELDS.find((f) => x.name.includes(f)) || ""; if (await addClientSupplier(proj.id, x.name, x.phone, field)) names.push(x.name + (field ? " (" + field + ")" : "")); }
    if (names.length) await staffPush("הלקוח הוסיף ספק", names.join(", ") + " · " + proj.name);
    return names.length ? "תודה! נשמר אצלנו כספק בפרויקט " + proj.name + ": " + names.join(", ") + " ✔️" : "לא הצלחתי לשמור את איש הקשר, אפשר לכתוב שם וטלפון?";
  }
  if (m.type === "audio") return "אפשר לכתוב לנו בהודעה כתובה? 🙏";
  if (!text) return "קיבלנו, תודה!";
  // text with a phone number → supplier (clients)
  const ph = text.match(/0\d[\d\-\s]{7,11}\d|\+?972[\d\-\s]{8,12}\d/);
  if (ph && !isArch) {
    const name = text.replace(ph[0], "").replace(/[:\-–,]+/g, " ").replace(/\s+/g, " ").trim();
    const field = SUP_FIELDS.find((f) => text.includes(f)) || (ask?.payload?.topic && SUP_FIELDS.find((f) => String(ask.payload.topic).includes(f))) || "";
    if (await addClientSupplier(proj.id, name || ph[0], ph[0].replace(/[^\d+]/g, ""), field)) {
      await staffPush("הלקוח הוסיף ספק", (name || ph[0]) + (field ? " · " + field : "") + " · " + proj.name);
      return "תודה! " + (name || "הספק") + " נשמר אצלנו" + (field ? " כספק " + field : "") + " בפרויקט " + proj.name + " ✔️";
    }
  }
  // answer to a question we asked (resp item) / general message → saved for Moshe
  if (ask?.payload?.item_id) {
    const doneW = /(בוצע|כן|סיימנו|הוזמן|יש|נשלח|מוכן)/.test(text);
    await db.from("resp_items").update({ reply: text.slice(0, 500), ...(doneW ? { done: true, done_at: new Date().toISOString() } : {}) }).eq("id", ask.payload.item_id);
  }
  await db.from("messages").insert({ project_id: proj.id, body: (isArch ? "[אדריכלית בוואטסאפ] " : "[וואטסאפ] ") + text.slice(0, 1500) });
  await staffPush(isArch ? "הודעה מהאדריכלית" : "הודעה מהלקוח", text.slice(0, 120) + " · " + proj.name);
  return "תודה, קיבלנו! משה יחזור אליך אם צריך 🙏";
}

// ---------- staff commands: request plans / ask client / send open items / update weekly gantt ----------
async function sendToExternal(p: any, who: "client" | "architect", text: string, short: string, topic: string, itemId?: string): Promise<string> {
  const phone = who === "client" ? p.client_phone : p.architect_phone;
  if (!phone) return who === "client" ? "אין טלפון של הלקוח בפרויקט " + p.name + ". מוסיפים בעריכת הפרויקט באפליקציה." : "אין טלפון של האדריכלית בפרויקט " + p.name + ". מוסיפים בעריכת הפרויקט באפליקציה.";
  const to = intl(phone);
  await db.from("bot_pending").upsert({ phone: "ext:" + to, payload: { project_id: p.id, topic, item_id: itemId || null }, created_at: new Date().toISOString() });
  const how = await waSend(to, text, { name: TPL.update, lang: "he", params: [p.name, short], payload: "more" });
  if (how === "failed") return "השליחה נכשלה. ודא שהתבנית " + TPL.update + " אושרה במטא.";
  return "נשלח ✓ ל" + (who === "client" ? "לקוח" : "אדריכלית") + (how === "template" ? " (בתבנית, כי לא כתבו לבוט ב-24 השעות האחרונות)" : "") + ":\n" + text;
}
async function openItemsText(p: any, who: "client" | "architect") {
  const { data } = await db.from("resp_items").select("id,item,note,week,urgent,grp").eq("project_id", p.id).eq("done", false);
  const list = (data || []).filter((x: any) => (who === "architect" ? x.grp === "architect" : x.grp === "client" || x.grp === "client_supply"));
  if (!list.length) return null;
  return { list, text: "שלום, עדכון מפדר בניה לגבי " + p.name + ".\nאלה הדברים שמחכים לטיפולכם לפי לוח הזמנים:\n" + list.map((x: any, i: number) => (i + 1) + ". " + x.item + (x.urgent ? " (מיידי)" : "") + (x.week ? " – עד שבוע " + x.week : "") + (x.note ? " – " + x.note : "")).join("\n") + "\n\nאפשר לענות כאן (למשל: \"1 בוצע\") ולשלוח קבצים. תודה!" };
}
async function handleExtraAction(a: any, c: Ctx, proj: any, P: any[], needProj: string): Promise<string> {
  if (a.action === "update_sched") {
    const ups = Array.isArray(a.sched_updates) ? a.sched_updates : [];
    if (!ups.length) return "מה לעדכן בגאנט? למשל: גבס 80";
    let q = db.from("sched_rows").select("id,title,project_id,section,targets,actual");
    if (proj) q = q.eq("project_id", proj.id);
    const { data } = await q;
    const rows = data || [], done: string[] = [], miss: string[] = [];
    for (const u of ups) {
      const k = norm(u.title || "");
      const cand = rows.filter((r: any) => norm(r.title).includes(k) || k.includes(norm(r.title)));
      if (!cand.length) { miss.push(u.title); continue; }
      if (cand.length > 1 && !proj && new Set(cand.map((r: any) => r.project_id)).size > 1) { miss.push(u.title + " (באיזה פרויקט?)"); continue; }
      const r = cand[0], patch: any = { updated_at: new Date().toISOString() };
      if (u.actual != null) patch.actual = Math.max(0, Math.min(100, Math.round(u.actual)));
      if (u.done != null) patch.done = !!u.done;
      if (r.section === "client" && u.actual != null && u.done == null) patch.done = u.actual >= 100;
      await db.from("sched_rows").update(patch).eq("id", r.id);
      done.push(r.title + (patch.actual != null ? " " + patch.actual + "%" : patch.done ? " ✓" : ""));
    }
    return (done.length ? "עודכן בגאנט ✓ " + done.join(", ") : "") + (miss.length ? (done.length ? "\n" : "") + "לא מצאתי בגאנט: " + miss.join(", ") : "");
  }
  if (!proj) return needProj;
  const { data: full } = await db.from("projects").select("*").eq("id", proj.id).maybeSingle();
  const p = full || proj;
  if (a.action === "request_plans") {
    const txt = "שלום" + (p.architect_name ? " " + p.architect_name : "") + ", כאן הבוט של פדר בניה 👋\nאפשר לשלוח לכאן את התוכניות והמסמכים לפרויקט *" + p.name + "* (PDF או תמונה), והם יישמרו ישר אצלנו בפרויקט. תודה! 📐";
    return await sendToExternal(p, "architect", txt, "נשמח שתשלחי לכאן את התוכניות והמסמכים לפרויקט", "plans");
  }
  if (a.action === "send_open_items") {
    const who = a.who === "architect" ? "architect" : "client";
    const o = await openItemsText(p, who);
    if (!o) return "אין פריטים פתוחים ל" + (who === "client" ? "לקוח" : "אדריכלית") + " בפרויקט " + p.name + ".";
    return await sendToExternal(p, who, o.text, o.list.length + " דברים מחכים לטיפולכם לפי לוח הזמנים", "open_items", o.list.length === 1 ? o.list[0].id : undefined);
  }
  // ask_client
  const topic = String(a.topic || "הספקים").trim();
  const all = /כל הספקים|הספקים/.test(topic);
  const { data: it } = await db.from("resp_items").select("id,item").eq("project_id", p.id).eq("done", false);
  const match = (it || []).find((x: any) => norm(x.item).includes(norm(topic.replace(/^ספק\s*ה?/, ""))) || norm(topic).includes(norm(x.item)));
  const txt = "שלום" + (p.client_name ? " " + p.client_name : "") + ", כאן הבוט של פדר בניה 👋\n" +
    (all ? "כדי שנתאם את העבודה, אפשר לשלוח לנו כאן את אנשי הקשר של הספקים שלכם (מטבח, אלומיניום, דלתות, מיזוג וכו')? מספיק לשתף איש קשר או לכתוב שם וטלפון."
      : "רצינו לשאול – מה קורה עם " + topic + "? אפשר לענות כאן, ואם יש ספק, לשתף את איש הקשר שלו.") + "\nתודה!";
  return await sendToExternal(p, "client", txt, all ? "נשמח לקבל את אנשי הקשר של הספקים שלכם" : "רצינו לשאול מה קורה עם " + topic, topic, match?.id);
}
// from the app (staff button): {action:"send_ext", project_id, kind: suppliers|plans|open_client|open_architect}
async function sendExtFromApp(b: any) {
  const { data: p } = await db.from("projects").select("*").eq("id", b.project_id).maybeSingle();
  if (!p) return { ok: false, msg: "פרויקט לא נמצא" };
  const fake: any = { action: "", topic: "כל הספקים" };
  if (b.kind === "plans") fake.action = "request_plans";
  else if (b.kind === "open_client" || b.kind === "open_architect") { fake.action = "send_open_items"; fake.who = b.kind === "open_architect" ? "architect" : "client"; }
  else fake.action = "ask_client";
  const c: any = { from: "", role: "staff", lang: "he", member: null, name: "", team: [] };
  const msg = await handleExtraAction(fake, c, p, [p], "");
  return { ok: msg.startsWith("נשלח"), msg };
}
