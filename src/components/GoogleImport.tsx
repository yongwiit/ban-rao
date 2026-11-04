"use client";

import { useEffect, useState } from "react";
import { useHousehold } from "@/components/Household";
import { PEOPLE, type Who } from "@/lib/family";
import { supabase } from "@/lib/supabase";
import type { ImportedEvent } from "@/lib/icsImport";

const KEY = "ban-rao-gcal-url";
const WHO: Who[] = ["dad", "mom", "pearl", "all"];

export function GoogleImport() {
  const { role } = useHousehold();
  const [url, setUrl] = useState("");
  useEffect(() => {
    let saved = "";
    try { saved = localStorage.getItem(KEY) ?? ""; } catch { /* ไม่เป็นไร */ }
    if (saved) queueMicrotask(() => setUrl((u) => u || saved));
  }, []);
  const [who, setWho] = useState<Who>(role);
  const [priv, setPriv] = useState(false);
  const [found, setFound] = useState<ImportedEvent[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [help, setHelp] = useState(false);

  async function load(body: { url?: string; ics?: string }) {
    setBusy(true); setMsg(null); setFound(null);
    try {
      const res = await fetch("/api/import-ics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) return setMsg(j.error ?? "อ่านปฏิทินไม่สำเร็จ");
      setFound(j.events);
      if (body.url) try { localStorage.setItem(KEY, body.url); } catch { /* ไม่เป็นไร */ }
      if (!j.events.length) setMsg("ไม่พบนัดในช่วง 1 เดือนก่อนถึง 1 ปีข้างหน้า");
    } catch { setMsg("เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง"); } finally { setBusy(false); }
  }

  async function onFile(f: File | undefined) {
    if (f) await load({ ics: await f.text() });
  }

  async function save() {
    if (!found?.length) return;
    setBusy(true); setMsg(null);
    const rows = found.map((e) => ({ ...e, who, private: priv, remind_before: null }));
    let done = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase().from("events").upsert(rows.slice(i, i + 200), { onConflict: "household_id,external_uid" });
      if (error) { setBusy(false); return setMsg(`นำเข้าได้ ${done} นัด แล้วติดปัญหา: ${error.message}`); }
      done += Math.min(200, rows.length - i);
    }
    setBusy(false); setFound(null);
    setMsg(`นำเข้าแล้ว ${done} นัด ดูได้ที่หน้าปฏิทิน (กดนำเข้าซ้ำได้ นัดเดิมจะอัปเดต ไม่ซ้ำ)`);
  }

  return (
    <section className="card flex flex-col gap-2 text-sm">
      <h2 className="font-display text-[17px] font-semibold">นำเข้านัดจาก Google Calendar</h2>
      <p className="text-muted">วางลิงก์ &quot;ที่อยู่ลับในรูปแบบ iCal&quot; ของ Google Calendar หรือเลือกไฟล์ .ics</p>
      <button type="button" onClick={() => setHelp(!help)} className="self-start text-sm underline">{help ? "ซ่อนวิธีหาลิงก์" : "หาลิงก์ได้ที่ไหน?"}</button>
      {help && (
        <ol className="list-decimal rounded-2xl bg-sand py-2 pr-3 pl-7 text-muted">
          <li>เปิด calendar.google.com ในคอมพิวเตอร์ (หรือมือถือแล้วกด &quot;เวอร์ชันเดสก์ท็อป&quot;)</li>
          <li>กดเฟือง ⚙️ มุมขวาบน → การตั้งค่า</li>
          <li>แถบซ้าย &quot;การตั้งค่าสำหรับปฏิทินของฉัน&quot; กดชื่อปฏิทินของคุณ</li>
          <li>เลื่อนลงไปที่ &quot;ผสานรวมปฏิทิน&quot; → &quot;ที่อยู่ลับในรูปแบบ iCal&quot; กดคัดลอก</li>
          <li>กลับมาวางในช่องด้านล่าง แล้วกด &quot;ดึงนัด&quot;</li>
        </ol>
      )}
      <label className="sr-only" htmlFor="gcal">ลิงก์ iCal</label>
      <input id="gcal" className="field min-h-11" inputMode="url" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" value={url} onChange={(e) => setUrl(e.target.value)} />
      <div className="flex gap-2">
        <button className="btn-dark flex-1" disabled={busy || !url.trim()} onClick={() => load({ url })}>{busy && !found ? "กำลังดึง…" : "ดึงนัด"}</button>
        <label className="btn-soft flex flex-1 cursor-pointer items-center justify-center">
          เลือกไฟล์ .ics
          <input type="file" accept=".ics,text/calendar" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      </div>
      <p className="text-xs text-muted">ลิงก์ลับนี้เก็บไว้ในเครื่องนี้เท่านั้น ไม่ได้ส่งให้ใคร</p>

      {found && found.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-dashed border-line pt-2">
          <p className="font-semibold">เจอ {found.length} นัด{found.some((e) => e.repeat !== "none") ? ` (นัดซ้ำ ${found.filter((e) => e.repeat !== "none").length})` : ""}</p>
          <ul className="max-h-40 overflow-y-auto text-muted">
            {found.slice(0, 30).map((e) => (
              <li key={e.external_uid} className="truncate">• {new Date(e.starts_at).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short" })} {e.title}</li>
            ))}
            {found.length > 30 && <li>และอีก {found.length - 30} นัด</li>}
          </ul>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 font-medium">เป็นนัดของใคร</legend>
            <div className="flex flex-wrap gap-2">
              {WHO.map((w) => <button type="button" key={w} className="chip" aria-pressed={who === w} onClick={() => setWho(w)}>{PEOPLE[w].name}</button>)}
            </div>
          </fieldset>
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="size-5 accent-cocoa" checked={priv} onChange={(e) => setPriv(e.target.checked)} />เห็นคนเดียว</label>
          <button className="btn-dark" disabled={busy} onClick={save}>{busy ? "กำลังนำเข้า…" : `นำเข้า ${found.length} นัด`}</button>
          <p className="text-xs text-muted">นัดที่นำเข้าจะไม่ตั้งเตือนไว้ ถ้าอยากให้เตือน กดแก้นัดนั้นแล้วเลือกเวลาเตือนได้</p>
        </div>
      )}
      {msg && <p role="status" className="text-sm">{msg}</p>}
    </section>
  );
}
