"use client";

import { useState } from "react";
import { PAID_FROM_KEYS, paidFromLabel, type Category, type PaidFrom } from "@/lib/family";
import { CategoryPicker } from "./Categories";
import { useHousehold } from "./Household";
import { supabase } from "@/lib/supabase";
import { LockIcon } from "./Icons";
import { useLive } from "@/lib/useLive";
import { monthRange } from "@/lib/format";
import { matchBill } from "@/lib/billMatch";
import type { BillRow } from "@/lib/types";

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export type ExpenseDraft = {
  id?: string;
  amount: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  merchant: string;
  category: Category;
  paid_from: PaidFrom;
  private: boolean;
  note: string;
  slip_ref?: string | null;
  bank?: string | null;
  /** จดจากค่าใช้จ่ายประจำ (ใหม่เท่านั้น) */
  bill_id?: string | null;
  /** สัดส่วนที่อีกฝ่ายช่วยจ่าย (จากค่าใช้จ่ายประจำ) */
  other_share?: number | null;
};

export function toDraftTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }),
    time: d.toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }),
  };
}

export function ExpenseForm({ initial, submitLabel, onSaved, extra }: {
  initial: ExpenseDraft;
  submitLabel: string;
  onSaved: () => void;
  extra?: React.ReactNode;
}) {
  const [d, setD] = useState<ExpenseDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { people, household, userId } = useHousehold();
  const [paidTouched, setPaidTouched] = useState(false);
  // จดใหม่ที่ไม่ได้มาจากปุ่ม "จด" ของค่าใช้จ่ายประจำ → หาค่าประจำที่ตรงกันให้อัตโนมัติ (กันนับซ้ำ)
  const canLink = !d.id && !initial.bill_id;
  const [linkOff, setLinkOff] = useState(false);
  const [yy, mm] = d.date.split("-").map(Number);
  const range = monthRange(yy || 2000, (mm || 1) - 1);
  const bills = useLive<BillRow>("bills", canLink ? household?.id : undefined, () =>
    supabase().from("bills").select("*").eq("active", true).eq("period", "monthly"), []);
  const recorded = useLive<{ bill_id: string | null }>("expenses", canLink ? household?.id : undefined, () =>
    supabase().from("expenses").select("bill_id").not("bill_id", "is", null).gte("spent_at", range.start).lt("spent_at", range.end), [range.start]);
  const match = canLink ? matchBill(bills.rows, recorded.rows.map((r) => r.bill_id), d, userId) : null;
  const link = match && !linkOff ? match : null;
  const set = <K extends keyof ExpenseDraft>(k: K, v: ExpenseDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(d.amount.replace(/,/g, ""));
    if (!(amount > 0)) return setErr("ใส่ยอดเงินให้ถูกต้อง");
    setBusy(true);
    const row = {
      amount,
      spent_at: new Date(`${d.date}T${d.time || "12:00"}:00+07:00`).toISOString(),
      merchant: d.merchant.trim(),
      category: d.category,
      paid_from: d.paid_from,
      private: d.private,
      note: d.note.trim() || null,
      status: "confirmed" as const,
      slip_ref: d.slip_ref ?? null,
      bank: d.bank ?? null,
      ...(d.bill_id && !d.id ? { bill_id: d.bill_id } : link ? { bill_id: link.id } : {}),
      ...(d.other_share != null && !d.id ? { other_share: d.other_share } : link && link.other_share != null ? { other_share: link.other_share } : {}),
    };
    const q = d.id ? supabase().from("expenses").update(row).eq("id", d.id) : supabase().from("expenses").insert(row);
    const { error } = await q;
    setBusy(false);
    if (error) {
      setErr(error.code === "23505" ? "สลิปนี้เคยบันทึกไปแล้ว" : error.message);
      return;
    }
    onSaved();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-medium">ยอดเงิน (บาท)
        <input className="field font-display text-2xl font-bold" inputMode="decimal" required value={d.amount} onChange={(e) => set("amount", e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">วันที่<input className="field min-w-0" type="date" required value={d.date} onChange={(e) => set("date", e.target.value)} /></label>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">เวลา<input className="field min-w-0" type="time" value={d.time} onChange={(e) => set("time", e.target.value)} /></label>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">จ่ายให้ / ร้าน<input className="field" value={d.merchant} onChange={(e) => set("merchant", e.target.value)} /></label>
      {extra}
      <CategoryPicker value={d.category} onChange={(c) => setD((x) => ({
        ...x, category: c.key,
        // หมวดส่วนตัว → จ่ายส่วนตัว (ถ้ายังไม่ได้เลือกเอง)
        paid_from: x.id || paidTouched ? x.paid_from : c.scope === "personal" ? "personal" : x.paid_from === "personal" ? "pot" : x.paid_from,
      }))} />
      {match && (link ? (
        <div className="flex items-center gap-2 rounded-2xl bg-mint/40 px-3 py-2 text-sm">
          <span className="flex-1">✓ นับเป็น <b>{match.name}</b> ของเดือน {TH_MONTHS[(mm || 1) - 1]} <span className="text-xs text-muted">(ไม่นับซ้ำกับค่าใช้จ่ายประจำ)</span></span>
          <button type="button" onClick={() => setLinkOff(true)} aria-label="ไม่นับเป็นค่าใช้จ่ายประจำ" className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted">✕</button>
        </div>
      ) : (
        <button type="button" onClick={() => setLinkOff(false)} className="min-h-11 self-start text-sm text-muted underline">นับเป็น {match.name} ของเดือนนี้ไหม?</button>
      ))}
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">จ่ายจาก</legend>
        <div className="flex flex-wrap gap-1.5">
          {PAID_FROM_KEYS.map((p) => (
            <button type="button" key={p} className="chip" aria-pressed={d.paid_from === p} onClick={() => { setPaidTouched(true); set("paid_from", p); }}>{paidFromLabel(p, people)}</button>
          ))}
        </div>
      </fieldset>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" className="size-5 accent-cocoa" checked={d.private} onChange={(e) => set("private", e.target.checked)} />
        <LockIcon />เห็นคนเดียว (เช่น ของขวัญ) ไม่นับในยอดบ้าน
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">โน้ต<input className="field" value={d.note} onChange={(e) => set("note", e.target.value)} placeholder="ไม่ใส่ก็ได้" /></label>
      {err && <p role="alert" className="text-sm text-rose">{err}</p>}
      <button className="btn-dark" disabled={busy}>{busy ? "กำลังบันทึก…" : submitLabel}</button>
    </form>
  );
}
