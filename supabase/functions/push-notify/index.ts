// แจ้งเตือนบ้านเรา: นัดใหม่ / แก้นัด / เตือนก่อนถึงนัด / เตือนไปซื้อของ (cron ทุก 5 นาที) / ส่งหัวใจ / ดาว / รายจ่าย+งบ / ชวนอัปสลิป 2 ทุ่ม / ทดสอบ
// ปลอดภัยแม้ใครเรียก: ส่งเฉพาะสิ่งที่ถึงเวลาจริง และกันส่งซ้ำ
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import webpush from "npm:web-push@3.6.7";
import { addDays, fireOn, occursOn, startOn, thDay, thHm, type RecurEvent } from "./recur.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const nameCache = new Map<string, Record<string, string>>();
/** ชื่อคนในบ้าน (แก้ได้ในแอป) */
async function names(hid: string): Promise<Record<string, string>> {
  if (!nameCache.has(hid)) {
    const { data } = await db.from("household_people").select("key, name").eq("household_id", hid);
    nameCache.set(hid, { all: "ทั้งบ้าน", ...Object.fromEntries((data ?? []).map((r) => [r.key, r.name])) });
  }
  return nameCache.get(hid)!;
}
const WINDOW_MIN = 15;

type Ev = RecurEvent & {
  id: string; household_id: string; title: string; who: string; private: boolean;
  created_by: string; updated_by: string | null; updated_at: string;
};
type Sub = { endpoint: string; user_id: string; p256dh: string; auth: string; notify_new: boolean; notify_remind: boolean };
type Flag = "notify_new" | "notify_remind" | "notify_money" | "notify_daily";

let vapidReady = false;
async function initVapid() {
  if (vapidReady) return;
  const { data } = await db.from("app_secrets").select("key, value").in("key", ["vapid_public", "vapid_private"]);
  const k = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  webpush.setVapidDetails("https://ban-rao.vercel.app", k.vapid_public, k.vapid_private);
  vapidReady = true;
}

/** คนที่ควรได้แจ้งเตือนของนัดนี้ */
async function recipients(e: Ev): Promise<string[]> {
  if (e.private) return [e.created_by];
  const { data } = await db.from("members").select("user_id, role").eq("household_id", e.household_id);
  const rows = data ?? [];
  if (e.who === "dad" || e.who === "mom") return rows.filter((m) => m.role === e.who).map((m) => m.user_id);
  return rows.map((m) => m.user_id);
}

async function send(users: string[], flag: Flag, payload: Record<string, unknown>) {
  if (!users.length) return 0;
  await initVapid();
  const { data } = await db.from("push_subscriptions").select("*").in("user_id", users).eq(flag, true);
  let n = 0;
  for (const s of (data ?? []) as Sub[]) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: "high" });
      n++;
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      else console.error("push failed", code, String(err));
    }
  }
  return n;
}

/** จดลง log ก่อนส่ง ถ้าเคยจดแล้วแปลว่าส่งไปแล้ว */
async function claim(event_id: string, kind: string, fire_at: string): Promise<boolean> {
  const { error } = await db.from("push_log").insert({ event_id, kind, fire_at });
  return !error;
}

function when(e: Ev, day: string): string {
  const d = new Date(`${day}T12:00:00+07:00`).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", weekday: "short", day: "numeric", month: "short" });
  if (e.ends_at && (e.repeat ?? "none") === "none" && thDay(e.ends_at) !== day) {
    const end = new Date(e.ends_at).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short" });
    return `${d} – ${end}`;
  }
  return e.all_day ? `${d} ทั้งวัน` : `${d} ${thHm(startOn(e, day))} น.`;
}

async function onChange(id: string, kind: "new" | "change") {
  const { data: e } = await db.from("events").select("*").eq("id", id).single<Ev>();
  if (!e) return { sent: 0 };
  if (!(await claim(e.id, kind, e.updated_at))) return { sent: 0, dup: true };
  const actor = e.updated_by ?? e.created_by;
  const users = (await recipients(e)).filter((u) => u !== actor);
  const { data: who } = await db.from("members").select("role").eq("user_id", actor).maybeSingle();
  const NAMES = await names(e.household_id);
  const by = who ? NAMES[who.role] : "";
  const sent = await send(users, "notify_new", {
    title: kind === "new" ? `📅 นัดใหม่: ${e.title}` : `✏️ แก้นัด: ${e.title}`,
    body: `${when(e, thDay(e.starts_at))} · ${NAMES[e.who] ?? ""}${by ? ` · โดย${by}` : ""}`,
    url: "/calendar", tag: `ev-${e.id}`,
  });
  return { sent };
}

async function onCron() {
  const now = Date.now();
  const from = new Date(now - 2 * 864e5).toISOString();
  const to = new Date(now + 9 * 864e5).toISOString();
  const { data } = await db.from("events").select("*").not("remind_before", "is", null)
    .or(`repeat.neq.none,and(starts_at.gte.${from},starts_at.lte.${to})`);
  let sent = 0;
  for (const e of (data ?? []) as Ev[]) {
    // รอบที่เวลาเตือนตกอยู่ในช่วง 15 นาทีที่ผ่านมา
    const target = thDay(new Date(now + (e.remind_before ?? 0) * 60_000));
    for (let i = 0; i <= 1; i++) {
      const day = addDays(target, -i);
      if (!occursOn(e, day) || (e.repeat === "none" && day !== thDay(e.starts_at))) continue;
      const fire = fireOn(e, day);
      if (!fire || fire.getTime() > now || fire.getTime() <= now - WINDOW_MIN * 60_000) continue;
      if (!(await claim(e.id, "remind", fire.toISOString()))) continue;
      const NAMES = await names(e.household_id);
      const mins = e.remind_before ?? 0;
      const lead = mins === 0 ? (e.all_day ? "วันนี้" : "ถึงเวลาแล้ว") : mins < 60 ? `อีก ${mins} นาที` : mins < 1440 ? `อีก ${mins / 60} ชั่วโมง` : mins < 10080 ? `อีก ${mins / 1440} วัน` : "อีก 1 สัปดาห์";
      sent += await send(await recipients(e), "notify_remind", {
        title: `🔔 ${lead}: ${e.title}`,
        body: `${when(e, day)} · ${NAMES[e.who] ?? ""}`,
        url: "/calendar", tag: `rm-${e.id}-${day}`,
      });
    }
  }
  sent += await onListCron(now);
  sent += await onDailyNudge(now);
  return { sent };
}

function nextAt(at: Date, repeat: string): Date | null {
  const day = thDay(at);
  let nd: string;
  if (repeat === "daily") nd = addDays(day, 1);
  else if (repeat === "weekly") nd = addDays(day, 7);
  else if (repeat === "monthly") {
    const [y, m, d] = day.split("-").map(Number);
    const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
    const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
    nd = `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
  } else return null;
  return new Date(`${nd}T${thHm(at)}:00+07:00`);
}

/** เตือนไปซื้อของตามเวลาที่ตั้งไว้ในแต่ละลิสต์ */
async function onListCron(now: number) {
  const { data } = await db.from("shopping_lists").select("id, household_id, name, remind_at, remind_repeat")
    .not("remind_at", "is", null).lte("remind_at", new Date(now).toISOString());
  let sent = 0;
  for (const l of data ?? []) {
    const old = new Date(l.remind_at);
    let next = nextAt(old, l.remind_repeat);
    while (next && next.getTime() <= now) next = nextAt(next, l.remind_repeat);
    // อัปเดตแบบมีเงื่อนไข = จองสิทธิ์ส่ง กันส่งซ้ำ
    const { data: claimed } = await db.from("shopping_lists").update({ remind_at: next ? next.toISOString() : null })
      .eq("id", l.id).eq("remind_at", l.remind_at).select("id");
    if (!claimed?.length || old.getTime() <= now - WINDOW_MIN * 60_000) continue;
    const { data: items } = await db.from("shopping_items").select("name").eq("list_id", l.id).eq("done", false).order("created_at");
    if (!items?.length) continue;
    const { data: mem } = await db.from("members").select("user_id").eq("household_id", l.household_id);
    const names = items.slice(0, 5).map((i) => i.name).join(", ") + (items.length > 5 ? ` และอีก ${items.length - 5} อย่าง` : "");
    sent += await send((mem ?? []).map((m) => m.user_id), "notify_remind", {
      title: `🛒 ถึงเวลาซื้อของ: ${l.name}`,
      body: `ต้องซื้อ ${items.length} อย่าง: ${names}`,
      url: "/shopping", tag: `ls-${l.id}`,
    });
  }
  return sent;
}

/** กันส่งซ้ำสำหรับแจ้งเตือนเรื่องเงิน */
async function once(key: string): Promise<boolean> {
  const { error } = await db.from("notify_log").insert({ key });
  return !error;
}
const bahtTh = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const thMonthStart = (d: Date) => { const [y, m] = thDay(d).split("-"); return new Date(`${y}-${m}-01T00:00:00+07:00`); };

/** จดรายจ่ายใหม่ → แจ้งพ่อหรือแม่อีกคน + เตือนเมื่อใช้งบถึง 80% / 100% */
async function onExpense(id: string) {
  const { data: e } = await db.from("expenses").select("*").eq("id", id).maybeSingle();
  if (!e || Date.now() - new Date(e.created_at).getTime() > 10 * 60_000) return { sent: 0 };
  // รายจ่ายส่วนตัว / เห็นคนเดียว ไม่แจ้งใคร
  if (e.private || e.paid_from === "personal") return { sent: 0 };
  const { data: mem } = await db.from("members").select("user_id, role").eq("household_id", e.household_id);
  const parents = (mem ?? []).filter((m) => m.role === "dad" || m.role === "mom");
  const actor = parents.find((m) => m.user_id === e.created_by);
  const NAMES = await names(e.household_id);
  const by = actor ? NAMES[actor.role] : "คนในบ้าน";
  // รวมรายการที่คนนี้จดวันนี้ ใช้ tag เดียวกัน แจ้งเตือนจะทับกันไม่รัวเครื่อง
  const dayStart = new Date(`${thDay(new Date())}T00:00:00+07:00`).toISOString();
  const { data: today } = await db.from("expenses").select("amount, private, paid_from").eq("created_by", e.created_by).gte("created_at", dayStart);
  const mine = (today ?? []).filter((x) => !x.private && x.paid_from !== "personal");
  const sum = mine.reduce((s, x) => s + Number(x.amount), 0);
  const body = mine.length > 1
    ? `วันนี้จด ${mine.length} รายการ รวม ${bahtTh(sum)} บาท · ล่าสุด ${e.merchant || "ไม่ระบุร้าน"} ${bahtTh(Number(e.amount))}`
    : `${e.merchant || "ไม่ระบุร้าน"} ${bahtTh(Number(e.amount))} บาท`;
  let sent = await send(parents.filter((m) => m.user_id !== e.created_by).map((m) => m.user_id), "notify_money", {
    title: `💸 ${by}จดรายจ่าย`, body, url: "/money", tag: `exp-${e.created_by}`,
  });

  // งบเดือนนี้
  const { data: h } = await db.from("households").select("monthly_budget, budget_enabled").eq("id", e.household_id).maybeSingle();
  const budget = Number(h?.monthly_budget ?? 0);
  if (h?.budget_enabled && budget > 0) {
    const start = thMonthStart(new Date());
    const end = new Date(start.getTime() + 40 * 864e5);
    const nextStart = thMonthStart(end);
    const { data: rows } = await db.from("expenses").select("amount, private, paid_from").eq("household_id", e.household_id)
      .gte("spent_at", start.toISOString()).lt("spent_at", nextStart.toISOString());
    const total = (rows ?? []).filter((x) => !x.private && x.paid_from !== "personal").reduce((s, x) => s + Number(x.amount), 0);
    const ym = thDay(start).slice(0, 7);
    const pct = (total / budget) * 100;
    const level = pct >= 100 ? 100 : pct >= 80 ? 80 : 0;
    if (level && (await once(`budget:${e.household_id}:${ym}:${level}`))) {
      if (level === 100) await once(`budget:${e.household_id}:${ym}:80`);
      sent += await send(parents.map((m) => m.user_id), "notify_money", {
        title: level === 100 ? "🚨 ใช้เกินงบเดือนนี้แล้ว" : "⚠️ ใช้งบเดือนนี้ไปแล้ว 80%",
        body: `ใช้ไป ${bahtTh(total)} จากงบ ${bahtTh(budget)} บาท${level === 100 ? ` (เกิน ${bahtTh(total - budget)})` : ` เหลือ ${bahtTh(budget - total)}`}`,
        url: "/money", tag: `budget-${e.household_id}`,
      });
    }
  }
  return { sent };
}

/** 2 ทุ่ม: ชวนอัปสลิปของวันนี้ */
async function onDailyNudge(now: number) {
  const hm = thHm(new Date(now));
  if (hm < "20:00" || hm >= "20:15") return 0;
  const day = thDay(new Date(now));
  const { data: subs } = await db.from("push_subscriptions").select("user_id").eq("notify_daily", true);
  const users = [...new Set((subs ?? []).map((s) => s.user_id))];
  if (!users.length) return 0;
  const { data: mem } = await db.from("members").select("user_id, role").in("user_id", users);
  const dayStart = new Date(`${day}T00:00:00+07:00`).toISOString();
  let sent = 0;
  for (const m of mem ?? []) {
    if (m.role !== "dad" && m.role !== "mom") continue;
    if (!(await once(`daily:${m.user_id}:${day}`))) continue;
    const { count } = await db.from("expenses").select("id", { count: "exact", head: true }).eq("created_by", m.user_id).gte("created_at", dayStart);
    sent += await send([m.user_id], "notify_daily", count
      ? { title: `🧾 วันนี้จดไปแล้ว ${count} รายการ`, body: "มีสลิปอื่นที่ยังไม่ได้อัปไหม แตะเพื่อเลือกสลิปของวันนี้", url: "/slip", tag: "daily" }
      : { title: "🧾 วันนี้จ่ายอะไรไปบ้าง?", body: "แตะเพื่อเลือกสลิปของวันนี้ทีเดียวหลายใบ แอปอ่านให้", url: "/slip", tag: "daily" });
  }
  return sent;
}

/** โน้ตรัก 💌 */
async function onNote(id: string) {
  const { data: n } = await db.from("love_notes").select("*").eq("id", id).maybeSingle();
  if (!n || Date.now() - new Date(n.created_at).getTime() > 5 * 60_000) return { sent: 0 };
  const { data: mem } = await db.from("members").select("user_id, role").eq("household_id", n.household_id);
  const from = (mem ?? []).find((m) => m.user_id === n.from_user);
  const name = from ? (await names(n.household_id))[from.role] ?? "คนในบ้าน" : "คนในบ้าน";
  const to = n.to_user ? [n.to_user] : (mem ?? []).map((m) => m.user_id).filter((u) => u !== n.from_user);
  const sent = await send(to, "notify_new", { title: `${n.emoji} โน้ตจาก${name}`, body: n.body, url: "/", tag: `note-${n.from_user}` });
  return { sent };
}

/** ส่งหัวใจ 💗 ถึงคนในบ้าน */
async function onHeart(id: string) {
  const { data: h } = await db.from("hearts").select("id, from_user, to_user, household_id, created_at").eq("id", id).maybeSingle();
  if (!h || Date.now() - new Date(h.created_at).getTime() > 5 * 60_000) return { sent: 0 };
  const { data: from } = await db.from("members").select("role").eq("user_id", h.from_user).eq("household_id", h.household_id).maybeSingle();
  const name = from ? (await names(h.household_id))[from.role] ?? "คนในบ้าน" : "คนในบ้าน";
  const sent = await send([h.to_user], "notify_new", { title: `💗 ${name}ส่งหัวใจให้`, body: "คิดถึงนะ", url: "/", tag: `heart-${h.from_user}` });
  return { sent };
}

/** สมุดดาว: ลูกขอ → แจ้งพ่อแม่ / พ่อแม่ให้หรืออนุมัติ → แจ้งลูก */
async function onStar(id: string) {
  const { data: l } = await db.from("star_log").select("*").eq("id", id).maybeSingle();
  if (!l) return { sent: 0 };
  const NAMES = await names(l.household_id);
  const kidName = NAMES[l.kid] ?? "ลูก";
  const { data: mem } = await db.from("members").select("user_id, role").eq("household_id", l.household_id);
  const parents = (mem ?? []).filter((m) => m.role === "dad" || m.role === "mom").map((m) => m.user_id);
  const kidUsers = (mem ?? []).filter((m) => m.role === l.kid).map((m) => m.user_id);
  // trigger เรียกเฉพาะตอนสร้างหรือเปลี่ยนสถานะ จึงไม่ส่งซ้ำ
  let sent = 0;
  if (l.status === "pending") {
    sent = await send(parents, "notify_new", {
      title: l.kind === "earn" ? `⭐ ${kidName}ทำ${l.title}แล้ว` : `🎁 ${kidName}ขอแลก${l.title}`,
      body: l.kind === "earn" ? `ขอ ${l.stars} ดาว แตะเพื่ออนุมัติ` : `ใช้ ${-l.stars} ดาว แตะเพื่ออนุมัติ`, url: "/stars", tag: `star-${l.id}`,
    });
  } else if (l.status === "approved") {
    sent = await send(kidUsers, "notify_new", {
      title: l.kind === "earn" ? `⭐ ได้ ${l.stars} ดาว!` : `🎉 ได้${l.title}แล้ว!`,
      body: l.kind === "earn" ? `${l.emoji} ${l.title} เก่งมาก` : `ใช้ไป ${-l.stars} ดาว`, url: "/stars", tag: `star-${l.id}`,
    });
  } else if (l.status === "rejected") {
    sent = await send(kidUsers, "notify_new", { title: `${l.emoji} ${l.title}`, body: l.kind === "earn" ? "พ่อแม่ยังไม่อนุมัติ ลองใหม่นะ" : "ยังไม่ได้แลก ดาวคืนให้แล้ว", url: "/stars", tag: `star-${l.id}` });
  }
  return { sent };
}

async function onTest(endpoint: string) {
  const { data: s } = await db.from("push_subscriptions").select("user_id").eq("endpoint", endpoint).maybeSingle();
  if (!s) return { sent: 0 };
  await initVapid();
  const { data } = await db.from("push_subscriptions").select("*").eq("endpoint", endpoint);
  let sent = 0;
  for (const x of (data ?? []) as Sub[]) {
    await webpush.sendNotification({ endpoint: x.endpoint, keys: { p256dh: x.p256dh, auth: x.auth } },
      JSON.stringify({ title: "🐻 บ้านเราแจ้งเตือนได้แล้ว", body: "จะเตือนเมื่อมีนัดใหม่ แก้นัด ก่อนถึงนัด และเวลาไปซื้อของ", url: "/settings", tag: "test" }), { TTL: 600 });
    sent++;
  }
  return { sent };
}

Deno.serve(async (req) => {
  nameCache.clear();
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    let out: unknown = { ok: true };
    if (body.type === "cron") out = await onCron();
    else if ((body.type === "new" || body.type === "change") && typeof body.event_id === "string") out = await onChange(body.event_id, body.type);
    else if (body.type === "expense" && typeof body.expense_id === "string") out = await onExpense(body.expense_id);
    else if (body.type === "note" && typeof body.note_id === "string") out = await onNote(body.note_id);
    else if (body.type === "heart" && typeof body.heart_id === "string") out = await onHeart(body.heart_id);
    else if (body.type === "star" && typeof body.log_id === "string") out = await onStar(body.log_id);
    else if (body.type === "test" && typeof body.endpoint === "string") out = await onTest(body.endpoint);
    return Response.json(out, { headers: cors });
  } catch (err) {
    console.error(err);
    return Response.json({ error: String(err) }, { status: 500, headers: cors });
  }
});
