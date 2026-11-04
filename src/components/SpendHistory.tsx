"use client";

import { categoryLabel, isHouseholdSpend } from "@/lib/family";
import { baht, dayKey, monthRange, thaiDate } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useLive } from "@/lib/useLive";
import type { ExpenseRow } from "@/lib/types";

type Row = Pick<ExpenseRow, "amount" | "spent_at" | "category" | "paid_from" | "private" | "created_by">;
const MONTHS = 6;
const BAR_COLORS = ["#D9738F", "#5E8FC9", "#5FA37E", "#D9941F", "#9B7FD1", "#C9A27E", "#7A6A63"];

/** กราฟแท่งยอดใช้ของบ้านย้อนหลัง 6 เดือน + แยกตามหมวดของเดือนที่เลือก */
type ViewProps = { selected: { y: number; m: number }; onPick: (ym: { y: number; m: number }) => void; budget: number; budgetOn: boolean; filter?: (e: Row) => boolean };

export function SpendHistory({ householdId, ...view }: ViewProps & { householdId: string }) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1), 1);
  const from = monthRange(first.getFullYear(), first.getMonth()).start;
  const to = monthRange(now.getFullYear(), now.getMonth()).end;
  const rows = useLive<Row>("expenses", householdId, () =>
    supabase().from("expenses").select("amount, spent_at, category, paid_from, private, created_by").gte("spent_at", from).lt("spent_at", to), [from]);
  return <SpendHistoryView rows={rows.rows} {...view} />;
}

export function SpendHistoryView({ rows, selected, onPick, budget, budgetOn, filter = isHouseholdSpend }: ViewProps & { rows: Row[] }) {
  const now = new Date();
  const months = Array.from({ length: MONTHS }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1 - i), 1);
    return { y: d.getFullYear(), m: d.getMonth(), key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` };
  });

  const totals: Record<string, number> = {};
  const byCat: Record<string, Record<string, number>> = {};
  for (const e of rows) {
    if (!filter(e)) continue;
    const k = dayKey(e.spent_at).slice(0, 7);
    totals[k] = (totals[k] ?? 0) + Number(e.amount);
    (byCat[k] ??= {})[e.category] = (byCat[k][e.category] ?? 0) + Number(e.amount);
  }
  const max = Math.max(1, budgetOn ? budget : 0, ...months.map((m) => totals[m.key] ?? 0));
  const selKey = `${selected.y}-${String(selected.m + 1).padStart(2, "0")}`;
  const cats = Object.entries(byCat[selKey] ?? {}).sort((a, b) => b[1] - a[1]);
  const selTotal = totals[selKey] ?? 0;
  const avg = months.reduce((s, m) => s + (totals[m.key] ?? 0), 0) / MONTHS;

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
            const v = totals[m.key] ?? 0;
            const on = m.key === selKey;
            const over = budgetOn && budget > 0 && v > budget;
            return (
              <button key={m.key} onClick={() => onPick({ y: m.y, m: m.m })} aria-pressed={on}
                aria-label={`${thaiDate(new Date(m.y, m.m, 15), { month: "long" })} ${baht(v)} บาท`}
                className="relative flex h-full flex-1 items-end justify-center">
                <span className={`relative w-full max-w-9 rounded-t-lg ${over ? "bg-rose" : on ? "bg-cocoa" : "bg-mint-strong"}`}
                  style={{ height: `${Math.max(3, (v / max) * 100)}%` }}>
                  <span className={`absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] ${on ? "font-semibold" : "text-muted"}`}>{v >= 1000 ? `${baht(v / 1000, v < 10000 ? 1 : 0)}k` : baht(v)}</span>
                </span>
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
        <span className="text-sm font-semibold">{thaiDate(new Date(selected.y, selected.m, 15), { month: "long", year: "numeric" })} แยกตามหมวด</span>
        {cats.length === 0 && <p className="text-sm text-muted">ยังไม่มีรายจ่ายของบ้านเดือนนี้</p>}
        {cats.map(([c, v], i) => (
          <div key={c} className="flex flex-col gap-1 text-sm">
            <div className="flex justify-between"><span>{categoryLabel(c)}</span><span>{baht(v)} <span className="text-muted">· {Math.round((v / selTotal) * 100)}%</span></span></div>
            <span className="h-2 overflow-hidden rounded-full bg-sand"><span className="block h-2 rounded-full" style={{ width: `${(v / selTotal) * 100}%`, background: BAR_COLORS[i % BAR_COLORS.length] }} /></span>
          </div>
        ))}
      </div>
    </section>
  );
}
