"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function CalendarLink() {
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || token) return;
    supabase().rpc("my_calendar_token").then(({ data }) => setToken(data as string));
  }, [open, token]);

  const url = token ? `${window.location.origin}/api/cal/${token}.ics` : "";
  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="card flex flex-col gap-2">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center justify-between text-left">
        <span className="font-display text-[17px] font-semibold">ดูนัดใน Google / Samsung Calendar</span>
        <span className="text-sm text-muted">{open ? "ซ่อน" : "ตั้งค่า"}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-muted">นัดในแอปจะไปขึ้นในปฏิทินของมือถือ (ทางเดียว อัปเดตทุกไม่กี่ชั่วโมง) ลิงก์นี้เป็นของคุณคนเดียว อย่าส่งให้คนอื่น</p>
          <div className="flex gap-2">
            <input readOnly aria-label="ลิงก์ปฏิทิน" className="field min-h-11 min-w-0 flex-1 text-xs" value={url || "กำลังสร้างลิงก์…"} onFocus={(e) => e.target.select()} />
            <button onClick={copy} disabled={!url} className="btn-soft shrink-0 text-sm">{copied ? "คัดลอกแล้ว" : "คัดลอก"}</button>
          </div>
          <ol className="list-decimal space-y-1 pl-5">
            <li>กดคัดลอกลิงก์ด้านบน</li>
            <li>เปิด <a className="underline" href="https://calendar.google.com/calendar/u/0/r/settings/addbyurl" target="_blank" rel="noreferrer">Google Calendar หน้าเพิ่มจาก URL</a> (ใช้เบราว์เซอร์ ไม่ใช่แอป)</li>
            <li>วางลิงก์แล้วกด <b>เพิ่มปฏิทิน</b></li>
            <li>Samsung Calendar: ไปที่เมนู ☰ แล้วเปิดให้แสดงปฏิทินจากบัญชี Google ชื่อ <b>บ้านเรา</b></li>
          </ol>
          {url && <a className="underline" href={url.replace(/^https?:/, "webcal:")}>iPhone: กดตรงนี้เพื่อเพิ่มในปฏิทิน iPhone</a>}
        </div>
      )}
    </section>
  );
}
