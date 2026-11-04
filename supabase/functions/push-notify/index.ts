// แจ้งเตือนบ้านเรา: นัดใหม่ / แก้นัด / เตือนก่อนถึงนัด (cron ทุก 5 นาที) / ทดสอบ
// ปลอดภัยแม้ใครเรียก: ส่งเฉพาะสิ่งที่ถึงเวลาจริง และกันส่งซ้ำด้วยตาราง push_log
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import webpush from "npm:web-push@3.6.7";
import { addDays, fireOn, occursOn, startOn, thDay, thHm, type RecurEvent } from "./recur.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const NAMES: Record<string, string> = { dad: "พ่ออั้ม", mom: "แม่แพ็ค", pearl: "น้องเพิร์ล", all: "ทั้งบ้าน" };
const WINDOW_MIN = 15;

type Ev = RecurEvent & {
  id: string; household_id: string; title: string; who: string; private: boolean;
  created_by: string; updated_by: string | null; updated_at: string;
};
type Sub = { endpoint: string; user_id: string; p256dh: string; auth: string; notify_new: boolean; notify_remind: boolean };

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

async function send(users: string[], flag: "notify_new" | "notify_remind", payload: Record<string, unknown>) {
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
      const mins = e.remind_before ?? 0;
      const lead = mins === 0 ? (e.all_day ? "วันนี้" : "ถึงเวลาแล้ว") : mins < 60 ? `อีก ${mins} นาที` : mins < 1440 ? `อีก ${mins / 60} ชั่วโมง` : mins < 10080 ? `อีก ${mins / 1440} วัน` : "อีก 1 สัปดาห์";
      sent += await send(await recipients(e), "notify_remind", {
        title: `🔔 ${lead}: ${e.title}`,
        body: `${when(e, day)} · ${NAMES[e.who] ?? ""}`,
        url: "/calendar", tag: `rm-${e.id}-${day}`,
      });
    }
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
      JSON.stringify({ title: "🐻 บ้านเราแจ้งเตือนได้แล้ว", body: "จะเตือนเมื่อมีนัดใหม่ แก้นัด และก่อนถึงนัด", url: "/settings", tag: "test" }), { TTL: 600 });
    sent++;
  }
  return { sent };
}

Deno.serve(async (req) => {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    let out: unknown = { ok: true };
    if (body.type === "cron") out = await onCron();
    else if ((body.type === "new" || body.type === "change") && typeof body.event_id === "string") out = await onChange(body.event_id, body.type);
    else if (body.type === "test" && typeof body.endpoint === "string") out = await onTest(body.endpoint);
    return Response.json(out, { headers: cors });
  } catch (err) {
    console.error(err);
    return Response.json({ error: String(err) }, { status: 500, headers: cors });
  }
});
