"use client";

import { useState } from "react";
import { CATEGORIES, PAID_FROM, type Category, type PaidFrom } from "@/lib/family";
import { supabase } from "@/lib/supabase";
import { LockIcon } from "./Icons";

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
        <label className="flex flex-col gap-1 text-sm font-medium">วันที่<input className="field" type="date" required value={d.date} onChange={(e) => set("date", e.target.value)} /></label>
        <label className="flex flex-col gap-1 text-sm font-medium">เวลา<input className="field" type="time" value={d.time} onChange={(e) => set("time", e.target.value)} /></label>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">จ่ายให้ / ร้าน<input className="field" value={d.merchant} onChange={(e) => set("merchant", e.target.value)} /></label>
      {extra}
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">หมวด</legend>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(CATEGORIES) as Category[]).map((c) => (
            <button type="button" key={c} className="chip" aria-pressed={d.category === c} onClick={() => set("category", c)}>{CATEGORIES[c]}</button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">จ่ายจาก</legend>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(PAID_FROM) as PaidFrom[]).map((p) => (
            <button type="button" key={p} className="chip" aria-pressed={d.paid_from === p} onClick={() => set("paid_from", p)}>{PAID_FROM[p]}</button>
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
