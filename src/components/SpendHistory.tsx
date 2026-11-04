"use client";

import { useState } from "react";
import { isHouseholdSpend } from "@/lib/family";
import { ICON_TONE } from "@/lib/categoryIcons";
import { CatIcon, useCategories } from "./Categories";
import { baht, dayKey, monthRange, thaiDate } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useLive } from "@/lib/useLive";
import type { ExpenseRow } from "@/lib/types";

export type Row = Pick<ExpenseRow, "amount" | "spent_at" | "category" | "paid_from" | "private" | "created_by" | "other_share" | "card_charge_id">;
const MONTHS = 6;

/** กราฟแท่งยอดใช้ย้อนหลัง 6 เดือน (แต่ละแท่งซ้อนสีตามหมวด) + แยกตามหมวดของเดือนที่เลือก */
type ViewProps = { selected: { y: number; m: number }; onPick: (ym: { y: number; m: number }) => void; budget: number; budgetOn: boolean; filter?: (e: Row) => boolean; weight?: (e: Row) => number; note?: string };

export function SpendHistory({ householdId, extra = [], ...view }: ViewProps & { householdId: string; extra?: Row[] }) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1), 1);
  const from = monthRange(first.getFullYear(), first.getMonth()).start;
  const to = monthRange(now.getFullYear(), now.getMonth()).end;
  const rows = useLive<Row>("expenses", householdId, () =>
    supabase().from("expenses").select("amount, spent_at, category, paid_from, private, created_by, other_share, card_charge_id").gte("spent_at", from).lt("spent_at", to), [from]);
  return <SpendHistoryView rows={extra.length ? [...rows.rows, ...extra] : rows.rows} {...view} />;
}

export function SpendHistoryView({ rows, selected, onPick, budget, budgetOn, filter = isHouseholdSpend, weight, note }: ViewProps & { rows: Row[] }) {
  const now = new Date();
  const catInfo = useCategories();
  const [focus, setFocus] = useState<string | null>(null);
  const months = Array.from({ length: MONTHS }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1 - i), 1);
    return { y: d.getFullYear(), m: d.getMonth(), key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` };
  });

  const totals: Record<string, number> = {};
  const byCat: Record<string, Record<string, number>> = {};
  for (const e of rows) {
    // weight: สัดส่วนที่นับ (เช่น ส่วนของฉันในรายจ่ายบ้าน) ไม่ส่ง = นับเต็มตาม filter
    const w = weight ? weight(e) : filter(e) ? 1 : 0;
    if (w <= 0) continue;
    const v = Number(e.amount) * w;
    const k = dayKey(e.spent_at).slice(0, 7);
    totals[k] = (totals[k] ?? 0) + v;
    (byCat[k] ??= {})[e.category] = (byCat[k][e.category] ?? 0) + v;
  }
  const max = Math.max(1, budgetOn ? budget : 0, ...months.map((m) => totals[m.key] ?? 0));
  const selKey = `${selected.y}-${String(selected.m + 1).padStart(2, "0")}`;
  const cats = Object.entries(byCat[selKey] ?? {}).sort((a, b) => b[1] - a[1]);
  const selTotal = totals[selKey] ?? 0;
  const avg = months.reduce((s, m) => s + (totals[m.key] ?? 0), 0) / MONTHS;
  // ลำดับหมวดคงที่ทุกแท่ง (ใหญ่สุดของ 6 เดือนอยู่ล่าง)
  const allTotals: Record<string, number> = {};
  for (const k of Object.keys(byCat)) for (const [c, v] of Object.entries(byCat[k])) allTotals[c] = (allTotals[c] ?? 0) + v;
  const order = Object.keys(allTotals).sort((a, b) => allTotals[b] - allTotals[a]);
  const colorOf = (c: string) => ICON_TONE[catInfo.get(c).icon][0];

  return (
    <section className="card flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-[17px] font-semibold">ย้อนหลัง {MONTHS} เดือน</h2>
        <span className="text-xs text-muted">เฉลี่ยเดือนละ {baht(avg)} บาท</span>
      </div>

      <div className="relative ml-0 mt-3 h-28" role="group" aria-label="ยอดใช้รายเดือน">
        {budgetOn && budget > 0 && (
          <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-rose/70" style={{ bottom: `${(budget / max) * 100}%` }}>
            <span className="absolute -top-4 right-0 bg-white px-1 text-[10px] text-rose">งบ {baht(budget)}</span>
          </div>
        )}
        <div className="flex h-full items-end gap-2">
          {months.map((m) => {
            const v = focus ? byCat[m.key]?.[focus] ?? 0 : totals[m.key] ?? 0;
            const on = m.key === selKey;
            const over = budgetOn && budget > 0 && v > budget;
            return (
              <button key={m.key} onClick={() => onPick({ y: m.y, m: m.m })} aria-pressed={on}
                aria-label={`${thaiDate(new Date(m.y, m.m, 15), { month: "long" })} ${baht(v)} บาท`}
                className="relative flex h-full flex-1 items-end justify-center">
                <span className={`relative flex w-full max-w-9 flex-col-reverse overflow-hidden rounded-t-lg bg-sand ${on ? "ring-2 ring-cocoa ring-offset-1" : over ? "ring-2 ring-rose" : ""}`}
                  style={{ height: `${Math.max(3, (v / max) * 100)}%`, opacity: on ? 1 : 0.75 }}>
                  {(focus ? [focus] : order).map((c) => {
                    const cv = byCat[m.key]?.[c] ?? 0;
                    return cv > 0 ? <span key={c} className="block w-full shrink-0" style={{ height: `${(cv / (v || 1)) * 100}%`, background: colorOf(c) }} /> : null;
                  })}
                </span>
                <span className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] ${on ? "font-semibold" : "text-muted"}`} style={{ bottom: `calc(${Math.max(3, (v / max) * 100)}% + 2px)` }}>{v >= 1000 ? `${baht(v / 1000, v < 10000 ? 1 : 0)}k` : baht(v)}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex gap-2">
        {months.map((m) => (
          <span key={m.key} className={`flex-1 text-center text-[11px] ${m.key === selKey ? "font-semibold" : "text-muted"}`}>{thaiDate(new Date(m.y, m.m, 15), { month: "short" })}</span>
        ))}
      </div>

      <div className="flex flex-col gap-2 border-t border-dashed border-line pt-3">
        <span className="flex items-baseline justify-between text-sm font-semibold">
          <span>{thaiDate(new Date(selected.y, selected.m, 15), { month: "long", year: "numeric" })} แยกตามหมวด</span>
          {focus && <button className="text-xs font-normal text-muted underline" onClick={() => setFocus(null)}>ดูทุกหมวด</button>}
        </span>
        {cats.length === 0 && <p className="text-sm text-muted">ยังไม่มีรายจ่ายเดือนนี้</p>}
        {cats.map(([c, v]) => {
          const info = catInfo.get(c);
          const prevKey = months[months.findIndex((m) => m.key === selKey) - 1]?.key;
          const prev = prevKey ? byCat[prevKey]?.[c] ?? 0 : 0;
          return (
            <button key={c} onClick={() => setFocus(focus === c ? null : c)} aria-pressed={focus === c} className={`flex items-center gap-2.5 rounded-2xl text-left text-sm ${focus && focus !== c ? "opacity-50" : ""}`}>
              <CatIcon icon={info.icon} size={34} />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex justify-between gap-2"><span className="truncate">{info.label}</span><span className="shrink-0">{baht(v)} <span className="text-muted">· {Math.round((v / selTotal) * 100)}%</span></span></span>
                <span className="h-2 overflow-hidden rounded-full bg-sand"><span className="block h-2 rounded-full" style={{ width: `${(v / selTotal) * 100}%`, background: colorOf(c) }} /></span>
                {prev > 0 && <span className="text-[11px] text-muted">{v > prev ? "▲" : v < prev ? "▼" : "="} เดือนก่อน {baht(prev)}</span>}
              </span>
            </button>
          );
        })}
        {cats.length > 0 && <p className="text-xs text-muted">แตะหมวดเพื่อดูกราฟย้อนหลังเฉพาะหมวดนั้น</p>}
        {note && <p className="text-xs text-muted">{note}</p>}
      </div>
    </section>
  );
}
