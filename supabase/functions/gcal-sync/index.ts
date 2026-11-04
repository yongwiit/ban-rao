// ดึงนัดจาก Google Calendar (ลิงก์ iCal ลับ) ทุกชั่วโมง: เพิ่ม/แก้นัด และลบนัดที่ถูกลบใน Google
// ไฟล์ icsImport.ts / recur.ts คัดลอกมาจาก src/lib (แก้ import ให้ใช้กับ Deno)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { parseIcs } from "./icsImport.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

type Imp = { user_id: string; household_id: string; url: string; who: string; private: boolean };

async function syncOne(imp: Imp) {
  try {
    const url = new URL(imp.url.trim().replace(/^webcal:\/\//i, "https://"));
    if (url.protocol !== "https:" || /^[\d.]+$/.test(url.hostname) || url.hostname === "localhost") throw new Error("ลิงก์ต้องเป็น https");
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`เปิดลิงก์ไม่ได้ (${res.status})`);
    const text = await res.text();
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("ลิงก์นี้ไม่ใช่ปฏิทิน");
    const events = parseIcs(text);
    const rows = events.map((e) => ({ ...e, household_id: imp.household_id, created_by: imp.user_id, who: imp.who, private: imp.private, source: "gcal" }));
    for (let i = 0; i < rows.length; i += 300) {
      const { error } = await db.from("events").upsert(rows.slice(i, i + 300), { onConflict: "household_id,external_uid" });
      if (error) throw new Error(error.message);
    }
    // ลบนัดที่หายไปจาก Google (เฉพาะที่ดึงมาจากลิงก์นี้ และอยู่ในช่วงที่ดึง)
    const keep = new Set(events.map((e) => e.external_uid));
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const { data: existing } = await db.from("events").select("id, external_uid, starts_at, repeat")
      .eq("household_id", imp.household_id).eq("created_by", imp.user_id).eq("source", "gcal");
    const stale = (existing ?? []).filter((e) => !keep.has(e.external_uid) && (e.repeat !== "none" || e.starts_at >= since)).map((e) => e.id);
    for (let i = 0; i < stale.length; i += 100) await db.from("events").delete().in("id", stale.slice(i, i + 100));
    await db.from("calendar_imports").update({ last_synced_at: new Date().toISOString(), last_count: events.length, last_error: null }).eq("user_id", imp.user_id);
    return { ok: true, count: events.length, removed: stale.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.from("calendar_imports").update({ last_synced_at: new Date().toISOString(), last_error: msg }).eq("user_id", imp.user_id);
    return { ok: false, error: msg };
  }
}

Deno.serve(async (req) => {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const body = await req.json().catch(() => ({}));
  let q = db.from("calendar_imports").select("user_id, household_id, url, who, private");
  if (body.type === "user" && typeof body.user_id === "string") q = q.eq("user_id", body.user_id);
  else if (body.type !== "cron") return Response.json({ ok: false }, { status: 400, headers: cors });
  const { data } = await q;
  const results = [];
  for (const imp of (data ?? []) as Imp[]) results.push(await syncOne(imp));
  return Response.json(body.type === "user" ? (results[0] ?? { ok: false, error: "ยังไม่ได้ตั้งลิงก์" }) : { synced: results.length }, { headers: cors });
});
