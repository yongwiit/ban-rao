"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ocrSlip, warmUpOcr } from "@/lib/slipOcr";
import { ExpenseForm, type ExpenseDraft } from "@/components/ExpenseForm";
import { BackIcon, UploadIcon } from "@/components/Icons";
import { Bunny, Family } from "@/components/Mascots";
import type { Role } from "@/lib/family";
import { useHousehold } from "@/components/Household";
import { dayKey, thaiTime } from "@/lib/format";
type SlipResult = {
  is_slip: boolean; kind?: "slip" | "receipt"; amount: number | null; datetime: string | null; recipient: string | null;
  bank: string | null; reference: string | null;
  category_guess: "home" | "food" | "pearl" | "bill" | "car" | "gift" | "other";
};

type Item = { key: string; preview: string; state: "reading" | "ready" | "saved" | "error"; draft?: ExpenseDraft; msg?: string };

async function shrink(file: File): Promise<{ data: string; preview: string; canvas: HTMLCanvasElement }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/jpeg", 0.85);
  return { data: url.split(",")[1], preview: url, canvas: c };
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
  const role = useHousehold().role as Role;
  const [items, setItems] = useState<Item[]>([]);
  const [zoom, setZoom] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { warmUpOcr(); }, []);
  const remove = (key: string) => setItems((xs) => xs.filter((x) => x.key !== key));
  const patch = (key: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    for (const f of Array.from(files)) {
      const key = crypto.randomUUID();
      try {
        const { preview, canvas } = await shrink(f);
        setItems((xs) => [...xs, { key, preview, state: "reading" }]);
        // อ่านในเครื่องเท่านั้น รูปไม่ออกจากมือถือ และไม่ถูกเก็บไว้ที่ไหน
        let r: SlipResult | null = null;
        try {
          const o = await ocrSlip(canvas);
          if (o.amount) r = { ...o, is_slip: true, category_guess: o.category_guess as SlipResult["category_guess"] };
        } catch (e) { console.warn("ocr failed", e); }
        if (!r) {
          patch(key, { state: "error", msg: "อ่านยอดจากภาพนี้ไม่ได้ กรอกเองด้านล่างได้เลยนะ (ถ่ายใบเสร็จให้ตรง สว่าง เต็มกรอบ จะอ่านได้ดีขึ้น)", draft: toDraft({ is_slip: false, amount: null, datetime: null, recipient: null, bank: null, reference: null, category_guess: "other" }, role) });
          continue;
        }
        patch(key, { state: "ready", draft: toDraft(r, role), msg: r.kind === "receipt" ? "อ่านใบเสร็จให้แล้ว ตรวจยอดรวมกับชื่อร้านอีกทีน้า" : undefined });
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
        <h1 className="font-display text-2xl font-bold">บันทึกจากสลิป / ใบเสร็จ</h1>
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
            <span className="font-semibold">เลือกภาพสลิปหรือใบเสร็จ</span>
            <span className="text-xs text-muted">เลือกหลายใบพร้อมกันได้ · สลิปซ้ำจะไม่ถูกบันทึกสองรอบ</span>
          </button>

          {open.map((it) => (
            <section key={it.key} className="card flex flex-col gap-3">
              <div className="flex items-center gap-3">
                {it.preview && (
                  <button onClick={() => setZoom(it.preview)} aria-label="ขยายดูสลิป" className="relative shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.preview} alt="สลิปที่อัปโหลด" className="h-24 w-16 rounded-xl border border-line object-cover" />
                    <span className="absolute right-1 bottom-1 rounded-full bg-white/90 px-1 text-[10px]">🔍</span>
                  </button>
                )}
                <div className="flex flex-1 items-center gap-2 text-sm">
                  <Bunny size={36} happy={it.state === "ready"} />
                  {it.state === "reading" ? "กำลังอ่านให้นะ… (ครั้งแรกอาจใช้เวลาสักครู่)" : it.msg ?? "อ่านสลิปให้แล้ว ตรวจอีกทีก่อนบันทึกน้า"}
                </div>
                <button onClick={() => remove(it.key)} aria-label="ยกเลิกสลิปใบนี้" className="flex min-h-11 shrink-0 flex-col items-center justify-center rounded-2xl border border-line bg-cream px-2.5 text-xs text-muted">
                  <span className="text-lg leading-none">✕</span>ยกเลิก
                </button>
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
          {open.length > 1 && (
            <button onClick={() => setItems((xs) => xs.filter((x) => x.state === "saved"))} className="min-h-11 text-sm text-rose underline">ยกเลิกทั้งหมด {open.length} ใบที่ยังไม่บันทึก</button>
          )}
          {savedCount > 0 && <p className="text-center text-sm text-muted">บันทึกไปแล้ว {savedCount} ใบ</p>}
          {zoom && (
            <button onClick={() => setZoom(null)} aria-label="ปิดรูป" className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-cocoa/80 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={zoom} alt="สลิปขยาย" className="max-h-[82dvh] max-w-full rounded-2xl bg-white object-contain" />
              <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold">แตะเพื่อปิด</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
