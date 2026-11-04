"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ExpenseForm, type ExpenseDraft } from "@/components/ExpenseForm";
import { BackIcon, UploadIcon } from "@/components/Icons";
import { Bunny, Family } from "@/components/Mascots";
import { useHousehold } from "@/components/Household";
import { dayKey, thaiTime } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { SlipResult } from "@/app/api/slip/route";

type Item = { key: string; preview: string; state: "reading" | "ready" | "saved" | "error"; draft?: ExpenseDraft; msg?: string };

async function shrink(file: File): Promise<{ data: string; preview: string }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/jpeg", 0.85);
  return { data: url.split(",")[1], preview: url };
}

function toDraft(r: SlipResult, role: "dad" | "mom"): ExpenseDraft {
  const now = new Date();
  const [date, time] = r.datetime?.split("T") ?? [];
  return {
    amount: r.amount ? String(r.amount) : "",
    date: /^\d{4}-\d{2}-\d{2}$/.test(date ?? "") ? date : dayKey(now),
    time: /^\d{2}:\d{2}/.test(time ?? "") ? time.slice(0, 5) : thaiTime(now),
    merchant: r.recipient ?? "",
    category: r.category_guess,
    paid_from: role === "dad" ? "dad" : "mom",
    private: false,
    note: "",
    slip_ref: r.reference ? `${r.bank ?? ""}:${r.reference}`.trim() : null,
    bank: r.bank,
  };
}

export default function SlipPage() {
  const { role } = useHousehold();
  const [items, setItems] = useState<Item[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const patch = (key: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const { data: s } = await supabase().auth.getSession();
    const token = s.session?.access_token;
    for (const f of Array.from(files)) {
      const key = crypto.randomUUID();
      try {
        const { data, preview } = await shrink(f);
        setItems((xs) => [...xs, { key, preview, state: "reading" }]);
        const res = await fetch("/api/slip", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ image: data, mediaType: "image/jpeg" }),
        });
        const body = await res.json();
        if (!res.ok) { patch(key, { state: "error", msg: body.error, draft: toDraft({ is_slip: false, amount: null, datetime: null, recipient: null, bank: null, reference: null, category_guess: "other" }, role) }); continue; }
        const r = body as SlipResult;
        patch(key, { state: "ready", draft: toDraft(r, role), msg: r.is_slip ? undefined : "ภาพนี้อาจไม่ใช่สลิป ตรวจอีกทีนะ" });
      } catch {
        setItems((xs) => xs.some((x) => x.key === key) ? xs : [...xs, { key, preview: "", state: "error", msg: "เปิดไฟล์ภาพนี้ไม่ได้" }]);
        patch(key, { state: "error", msg: "เปิดไฟล์ภาพนี้ไม่ได้" });
      }
    }
    if (input.current) input.current.value = "";
  }

  const open = items.filter((i) => i.state !== "saved");
  const savedCount = items.length - open.length;

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center gap-2">
        <Link href="/money" aria-label="กลับ" className="flex size-11 items-center justify-center rounded-full bg-white"><BackIcon /></Link>
        <h1 className="font-display text-2xl font-bold">บันทึกจากสลิป</h1>
      </header>

      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />

      {items.length > 0 && open.length === 0 ? (
        <div className="flex flex-col items-center gap-3.5 py-16 text-center">
          <Family size={66} happy />
          <h2 className="font-display text-2xl font-bold">บันทึกแล้ว!</h2>
          <p>บันทึก {savedCount} สลิปเรียบร้อย</p>
          <Link href="/money" className="flex h-13 items-center rounded-full bg-mint-strong px-7 font-semibold">ไปหน้าเงิน</Link>
          <button onClick={() => input.current?.click()} className="min-h-11 text-sm text-muted">อัปโหลดสลิปเพิ่ม</button>
        </div>
      ) : (
        <>
          <button onClick={() => input.current?.click()} className="card flex flex-col items-center gap-2 border-2 border-dashed border-line py-6 text-center">
            <UploadIcon size={28} />
            <span className="font-semibold">เลือกภาพสลิป</span>
            <span className="text-xs text-muted">เลือกหลายใบพร้อมกันได้ · สลิปซ้ำจะไม่ถูกบันทึกสองรอบ</span>
          </button>

          {open.map((it) => (
            <section key={it.key} className="card flex flex-col gap-3">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {it.preview && <img src={it.preview} alt="สลิปที่อัปโหลด" className="h-24 w-16 shrink-0 rounded-xl border border-line object-cover" />}
                <div className="flex items-center gap-2 text-sm">
                  <Bunny size={36} happy={it.state === "ready"} />
                  {it.state === "reading" ? "กำลังอ่านสลิปให้นะ…" : it.msg ?? "อ่านสลิปให้แล้ว ตรวจอีกทีก่อนบันทึกน้า"}
                </div>
              </div>
              {it.draft && (
                <ExpenseForm
                  initial={it.draft}
                  submitLabel="ยืนยันบันทึก"
                  onSaved={() => patch(it.key, { state: "saved" })}
                  extra={it.draft.slip_ref ? <p className="text-xs text-muted">{it.draft.bank} · อ้างอิง …{it.draft.slip_ref.slice(-6)}</p> : null}
                />
              )}
            </section>
          ))}
          {savedCount > 0 && <p className="text-center text-sm text-muted">บันทึกไปแล้ว {savedCount} ใบ</p>}
        </>
      )}
    </div>
  );
}
