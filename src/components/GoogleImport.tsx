"use client";

import { useEffect, useState } from "react";
import { useHousehold } from "@/components/Household";
import { type Who } from "@/lib/family";
import { thaiDate, thaiTime } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/config";
import type { ImportedEvent } from "@/lib/icsImport";

type Imp = { url: string; who: Who; private: boolean; last_synced_at: string | null; last_count: number | null; last_error: string | null };

export function GoogleImport() {
  const { role, userId, people } = useHousehold();
  const [imp, setImp] = useState<Imp | null>(null);
  const [url, setUrl] = useState("");
  const [who, setWho] = useState<Who>(role);
  const [priv, setPriv] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [file, setFile] = useState<ImportedEvent[] | null>(null);

  async function reload() {
    const { data } = await supabase().from("calendar_imports").select("url, who, private, last_synced_at, last_count, last_error").eq("user_id", userId).maybeSingle();
    const row = data as Imp | null;
    setImp(row);
    if (row) { setUrl(row.url); setWho(row.who); setPriv(row.private); }
  }
  useEffect(() => { queueMicrotask(reload); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function syncNow() {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/gcal-sync`, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ type: "user", user_id: userId }),
    });
    return (await res.json().catch(() => ({ ok: false, error: "เชื่อมต่อไม่ได้" }))) as { ok: boolean; count?: number; removed?: number; error?: string };
  }

  async function start() {
    if (!url.trim()) return;
    setBusy(true); setMsg("กำลังดึงนัด…");
    const { error } = await supabase().from("calendar_imports").upsert({ user_id: userId, url: url.trim(), who, private: priv }, { onConflict: "user_id" });
    if (error) { setBusy(false); return setMsg(error.message); }
    const r = await syncNow();
    await reload();
    setBusy(false);
    setMsg(r.ok ? `ดึงแล้ว ${r.count} นัด${r.removed ? ` (ลบนัดที่ไม่มีแล้ว ${r.removed})` : ""} · จากนี้จะดึงเองทุกชั่วโมง` : `ดึงไม่สำเร็จ: ${r.error}`);
  }

  async function stop() {
    if (!confirm("หยุดดึงนัดจาก Google อัตโนมัติ? (นัดที่ดึงมาแล้วยังอยู่)")) return;
    await supabase().from("calendar_imports").delete().eq("user_id", userId);
    setImp(null); setUrl(""); setMsg("หยุดดึงอัตโนมัติแล้ว");
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy(true); setMsg(null);
    const res = await fetch("/api/import-ics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ics: await f.text() }) });
    const j = await res.json().catch(() => ({ error: "อ่านไฟล์ไม่สำเร็จ" }));
    setBusy(false);
    if (!res.ok) return setMsg(j.error);
    setFile(j.events);
    if (!j.events.length) setMsg("ไม่พบนัดในไฟล์ (ช่วง 1 เดือนก่อนถึง 1 ปีข้างหน้า)");
  }

  async function saveFile() {
    if (!file?.length) return;
    setBusy(true);
    const rows = file.map((e) => ({ ...e, who, private: priv }));
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase().from("events").upsert(rows.slice(i, i + 200), { onConflict: "household_id,external_uid" });
      if (error) { setBusy(false); return setMsg(error.message); }
    }
    setBusy(false); setMsg(`นำเข้าจากไฟล์แล้ว ${file.length} นัด`); setFile(null);
  }

  return (
    <section className="card flex flex-col gap-2 text-sm">
      <h2 className="font-display text-[17px] font-semibold">ดึงนัดจาก Google Calendar</h2>
      {imp ? (
        <p className="rounded-2xl bg-mint px-3 py-2">
          ✅ ดึงเองทุกชั่วโมง
          {imp.last_synced_at && <> · ล่าสุด {thaiDate(imp.last_synced_at, { day: "numeric", month: "short" })} {thaiTime(imp.last_synced_at)}</>}
          {imp.last_error ? <span className="block text-rose">ครั้งล่าสุดไม่สำเร็จ: {imp.last_error}</span> : imp.last_count != null && <> · {imp.last_count} นัด</>}
        </p>
      ) : (
        <p className="text-muted">วางลิงก์ &quot;ที่อยู่ลับในรูปแบบ iCal&quot; ของ Google Calendar แล้วแอปจะดึงนัดให้เองทุกชั่วโมง</p>
      )}
      <button type="button" onClick={() => setHelp(!help)} className="self-start text-sm underline">{help ? "ซ่อนวิธีหาลิงก์" : "หาลิงก์ได้ที่ไหน?"}</button>
      {help && (
        <ol className="list-decimal rounded-2xl bg-sand py-2 pr-3 pl-7 text-muted">
          <li>เปิด calendar.google.com ในคอมพิวเตอร์ (หรือมือถือแล้วกด &quot;เวอร์ชันเดสก์ท็อป&quot;)</li>
          <li>กดเฟือง ⚙️ มุมขวาบน → การตั้งค่า</li>
          <li>แถบซ้าย &quot;การตั้งค่าสำหรับปฏิทินของฉัน&quot; กดชื่อปฏิทินของคุณ</li>
          <li>เลื่อนลงไปที่ &quot;ผสานรวมปฏิทิน&quot; → &quot;ที่อยู่ลับในรูปแบบ iCal&quot; กดคัดลอก</li>
          <li>กลับมาวางในช่องด้านล่าง</li>
        </ol>
      )}
      <label className="sr-only" htmlFor="gcal">ลิงก์ iCal</label>
      <input id="gcal" className="field min-h-11" inputMode="url" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" value={url} onChange={(e) => setUrl(e.target.value)} />
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 font-medium">นัดจาก Google เป็นของใคร</legend>
        <div className="flex flex-wrap gap-2">
          {[...people.list.map((p) => p.key), "all"].map((w) => <button type="button" key={w} className="chip" aria-pressed={who === w} onClick={() => setWho(w)}>{people.get(w).name}</button>)}
        </div>
      </fieldset>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="size-5 accent-cocoa" checked={priv} onChange={(e) => setPriv(e.target.checked)} />เห็นคนเดียว</label>
      <button className="btn-dark" disabled={busy || !url.trim()} onClick={start}>{busy ? "กำลังดึง…" : imp ? "บันทึกและดึงเดี๋ยวนี้" : "เริ่มดึงอัตโนมัติ"}</button>
      {imp && <button className="min-h-11 text-sm text-rose" onClick={stop}>หยุดดึงอัตโนมัติ</button>}
      <p className="text-xs text-muted">ลิงก์ลับเก็บไว้เฉพาะของคุณ อีกคนในบ้านมองไม่เห็น · นัดที่ลบใน Google จะหายจากแอปด้วย · ตอนดึงจะไม่ส่งแจ้งเตือน ถ้าอยากให้เตือนนัดไหน กดแก้นัดนั้นแล้วเลือกเวลาเตือน</p>

      <div className="flex flex-col gap-2 border-t border-dashed border-line pt-2">
        <label className="btn-soft flex cursor-pointer items-center justify-center">
          หรือนำเข้าจากไฟล์ .ics (ครั้งเดียว)
          <input type="file" accept=".ics,text/calendar" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {file && file.length > 0 && (
          <button className="btn-dark" disabled={busy} onClick={saveFile}>นำเข้า {file.length} นัดจากไฟล์ (เป็นของ{people.get(who).name})</button>
        )}
      </div>
      {msg && <p role="status" className="text-sm">{msg}</p>}
    </section>
  );
}
