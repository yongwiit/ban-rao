"use client";

import { useHousehold } from "./Household";
import { supabase } from "@/lib/supabase";
import { useLive } from "@/lib/useLive";
import { baht, monthRange, thaiDate } from "@/lib/format";
import { UTILITIES, categoryLabel } from "@/lib/family";
import type { ExpenseRow } from "@/lib/types";

type Row = Pick<ExpenseRow, "amount" | "spent_at" | "category" | "paid_from" | "private" | "created_by">;

/** ค่าน้ำ ไฟ เน็ต โทรศัพท์ เดือนนี้เทียบเดือนก่อน (มาจากรายจ่ายหมวดนั้นๆ) */
export function Utilities({ ym, filter, onAdd, extra }: { ym: { y: number; m: number }; filter: (e: Row) => boolean; onAdd: (category: string) => void; extra?: (category: string, y: number, m: number) => number }) {
  const { household } = useHousehold();
  const keys = UTILITIES.map((u) => u.key as string);
  const from = monthRange(ym.y, ym.m - 5).start;
  const end = monthRange(ym.y, ym.m).end;
  const rows = useLive<Row>("expenses", household.id, () =>
    supabase().from("expenses").select("amount, spent_at, category, paid_from, private, created_by").in("category", keys).gte("spent_at", from).lt("spent_at", end), [from]);
  const monthOf = (iso: string) => { const d = new Date(new Date(iso).getTime() + 7 * 36e5); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
  const cur = ym.y * 12 + ym.m;
  const sum = (k: string, mi: number) => rows.rows.filter((e) => e.category === k && filter(e) && monthOf(e.spent_at) === mi).reduce((s, e) => s + Number(e.amount), 0)
    + (extra ? extra(k, Math.floor(mi / 12), mi % 12) : 0);
  const total = keys.reduce((s, k) => s + sum(k, cur), 0);

  return (
    <section className="card flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-[17px] font-semibold">💡 ค่าน้ำ ไฟ เน็ต</h2>
        <span className="text-sm text-muted">{thaiDate(new Date(ym.y, ym.m, 15), { month: "short" })} รวม {baht(total)}</span>
      </div>
      {UTILITIES.map((u) => {
        const now = sum(u.key, cur), prev = sum(u.key, cur - 1);
        const hist = [5, 4, 3, 2, 1].map((i) => sum(u.key, cur - i)).filter((v) => v > 0);
        const avg = hist.length ? hist.reduce((a, b) => a + b, 0) / hist.length : 0;
        const diff = now - prev;
        return (
          <div key={u.key} className="flex min-h-11 items-center gap-2.5 text-sm">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky text-lg" aria-hidden>{u.emoji}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold">{categoryLabel(u.key)}</span>
              <span className="text-xs text-muted">
                {now > 0 && prev > 0 ? (diff === 0 ? "เท่าเดือนก่อน" : `${diff > 0 ? "▲ แพงขึ้น" : "▼ ถูกลง"} ${baht(Math.abs(diff))} จากเดือนก่อน`) : prev > 0 ? `เดือนก่อน ${baht(prev)}` : "ยังไม่มีเดือนก่อน"}
                {avg > 0 ? ` · เฉลี่ย ${baht(avg)}` : ""}
              </span>
            </span>
            {now > 0 ? <span className="font-semibold">{baht(now)}</span> : <button onClick={() => onAdd(u.key)} className="btn-soft min-h-9 px-3 text-[13px]">+ จด</button>}
          </div>
        );
      })}
      <p className="text-xs text-muted">มาจากรายจ่ายหมวด ค่าน้ำ/ค่าไฟ/ค่าเน็ต/ค่าโทรศัพท์{extra ? " และรายการบัตรของฉันหมวดเดียวกัน" : ""} (อัปโหลดสลิปก็ได้ แอปเดาหมวดให้)</p>
    </section>
  );
}
