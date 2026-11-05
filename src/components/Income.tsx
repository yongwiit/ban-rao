"use client";

import { useState } from "react";
import { useHousehold } from "./Household";
import { Sheet } from "./Sheet";
import { LockIcon } from "./Icons";
import { useCards } from "./CreditCards";
import { useCollapsed } from "./Reorder";
import { supabase } from "@/lib/supabase";
import { useLive } from "@/lib/useLive";
import { baht, dayKey, thaiDate } from "@/lib/format";
import { cardBillsInMonth, cardSummary, incomeInMonth, isOneTime, oneTimeRange, type IncomeRow } from "@/lib/cards";
import { fundPerMonth, isDueMonth, isFund, isLoan } from "@/lib/fund";
import { useCategories } from "./Categories";
import type { IconKey } from "@/lib/categoryIcons";
import type { BillRow, ExpenseRow } from "@/lib/types";
import type { ExpenseDraft } from "./ExpenseForm";
import { myShare } from "@/lib/settle";

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const short = (d: Date) => thaiDate(d, { day: "numeric", month: "short" });

type Item = { key: string; date: Date | null; label: string; amount: number; icon: IconKey; note?: string; paid: boolean; tap?: () => void; fromFund?: boolean };
type PaidRow = { card_id: string; ym: string; amount: number | null };

/** ป้ายวันที่อ่านง่าย: วันนี้ / พรุ่งนี้ / อีก N วัน / เลยมา N วัน */
function dueChip(date: Date | null, paid: boolean, isThisMonth: boolean): { text: string; tone: string } {
  if (paid) return { text: "จ่ายแล้ว", tone: "text-[#3F8A5F]" };
  if (!date) return { text: "ในเดือนนี้", tone: "text-muted" };
  if (!isThisMonth) return { text: short(date), tone: "text-muted" };
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const n = Math.round((d.getTime() - t.getTime()) / 86_400_000);
  if (n === 0) return { text: "วันนี้", tone: "bg-butter font-semibold" };
  if (n === 1) return { text: "พรุ่งนี้", tone: "bg-butter" };
  if (n > 1) return { text: `อีก ${n} วัน`, tone: "text-muted" };
  return { text: `เลยมา ${-n} วัน`, tone: "bg-rose/15 font-semibold text-rose" };
}

/**
 * การ์ด "เดือนนี้": รายได้ (หรืองบ) − ใช้ไปแล้ว − ยังต้องจ่าย = เหลือใช้ได้จริง
 * บิลเดือนนี้ = ค่าใช้จ่ายประจำรายเดือน + บิลบัตร (แท็บของฉัน) ติ๊กได้ว่าจ่ายแล้ว
 * ค่าใช้จ่ายประจำ: ติ๊ก = จดเป็นรายจ่าย · บิลบัตร: ติ๊ก = บันทึกว่าจ่ายรอบนี้แล้ว (card_bill_paid)
 */
export function MonthCard({ scope, spent, saved = 0, counted = () => true, bills, shareBills = [], monthRows, ym, header, onBudget, onRecord }: {
  scope: "home" | "mine"; spent: number; saved?: number; counted?: (e: ExpenseRow) => boolean; bills: BillRow[]; shareBills?: BillRow[]; monthRows: ExpenseRow[]; ym: { y: number; m: number };
  header: React.ReactNode; onBudget: () => void; onRecord: (d: ExpenseDraft) => void;
}) {
  const { household, people, userId, role } = useHousehold();
  const cats = useCategories();
  const hid = household.id;
  const incomes = useLive<IncomeRow>("incomes", hid, () => supabase().from("incomes").select("*").order("created_at"));
  const { cards, charges } = useCards(scope === "mine" ? hid : undefined);
  const paidQ = useLive<PaidRow>("card_bill_paid", scope === "mine" ? hid : undefined, () => supabase().from("card_bill_paid").select("card_id,ym,amount"));
  const [open, setOpen] = useState(false);
  const now = new Date();
  const isThisMonth = ym.y === now.getFullYear() && ym.m === now.getMonth();
  const isPast = ym.y * 12 + ym.m < now.getFullYear() * 12 + now.getMonth();
  const ymKey = `${ym.y}-${String(ym.m + 1).padStart(2, "0")}`;
  // กันเงินรายปีเริ่มตั้งแต่เดือนที่เพิ่มรายการเข้าแอป (ไม่หักย้อนเดือนก่อนหน้า)
  const addedBy = (b: BillRow) => !b.created_at || b.created_at.slice(0, 7) <= ymKey;

  const myIncome = (i: IncomeRow) => i.created_by === userId || i.who === role;
  const inc = incomes.rows.filter((i) => incomeInMonth(i, ym.y, ym.m) && (scope === "home" ? !i.private : myIncome(i)));
  const income = inc.reduce((s, i) => s + Number(i.amount), 0);
  // ภาระผ่อนเทียบรายได้ประจำเท่านั้น (โบนัส/งานนอกไม่ได้มาทุกเดือน)
  const regular = inc.filter((i) => !isOneTime(i)).reduce((s, i) => s + Number(i.amount), 0);
  const extra = income - regular;
  const useBudget = scope === "home" && household.budget_enabled && household.monthly_budget > 0;
  const base = useBudget ? Number(household.monthly_budget) : income;

  async function tickCard(cardId: string, amount: number, paid: boolean) {
    if (paid) await supabase().from("card_bill_paid").delete().eq("card_id", cardId).eq("ym", ymKey);
    else await supabase().from("card_bill_paid").insert({ card_id: cardId, ym: ymKey, amount });
    paidQ.refresh();
  }

  // บิลบัตรที่ครบจ่ายเดือนนี้ (เดือนที่ผ่านไปแล้วถือว่าจ่ายแล้ว)
  const myCards = scope === "mine" ? cards.filter((c) => c.owner === role || c.created_by === userId) : [];
  const cardBills = cardBillsInMonth(myCards, charges, ym.y, ym.m);
  const items: Item[] = [];
  for (const b of cardBills) {
    const paid = isPast || paidQ.rows.some((p) => p.card_id === b.card.id && p.ym === ymKey);
    items.push({ key: `card-${b.card.id}`, date: b.due, label: `บิลบัตร ${b.card.name}`, amount: b.amount, icon: "bill", paid, tap: isPast ? undefined : () => tickCard(b.card.id, b.amount, paid) });
  }
  if (!isPast) {
    const dim = new Date(ym.y, ym.m + 1, 0).getDate();
    for (const b of bills) {
      // รายปี/เทอม: แสดงเฉพาะเดือนที่ต้องจ่าย และจ่ายจากเงินที่กันไว้ (ไม่หักซ้ำ)
      const fund = isFund(b);
      if (fund && !isDueMonth(b, ym.m)) continue;
      // เพิ่งเพิ่มเดือนนี้ = ยังไม่ได้กันเงินไว้ → นับเป็นบิลที่ต้องจ่ายตามปกติ
      const fromFund = fund && (!b.created_at || b.created_at.slice(0, 7) < ymKey);
      const rec = monthRows.find((e) => e.bill_id === b.id);
      const c = cats.get(b.category ?? "bill");
      const date = b.due_day ? new Date(ym.y, ym.m, Math.min(b.due_day, dim)) : null;
      // ทุกวัน: รวมทั้งเดือน (วันละ x × จำนวนวัน)
      const amt = b.period === "daily" ? Number(b.amount) * dim : Number(b.amount);
      items.push({
        key: `bill-${b.id}`, date, label: b.period === "daily" ? `${b.name} (วันละ ${baht(Number(b.amount))})` : b.name, amount: rec ? Number(rec.amount) : amt, icon: c.icon, paid: !!rec, fromFund,
        note: rec ? undefined : fromFund ? "🐷 จ่ายจากเงินที่กันไว้" : b.variable ? "ยอดประมาณ" : b.auto_record ? (date && b.auto_from && dayKey(date) < b.auto_from ? "เดือนนี้กดจดเอง เดือนหน้าจดให้" : "จดให้อัตโนมัติ") : undefined,
        tap: rec ? undefined : () => onRecord({ amount: b.variable ? "" : String(amt), date: dayKey(isThisMonth ? now : date ?? new Date(ym.y, ym.m, 1)), time: "12:00", merchant: b.name, category: b.category ?? "bill", paid_from: b.paid_from, private: false, note: "", bill_id: b.id, other_share: b.other_share ?? null }),
      });
    }
    // ส่วนของฉันในค่าใช้จ่ายบ้านที่พ่อ/แม่ออกก่อน (เช่น ค่าบ้าน 50%)
    for (const b of shareBills) {
      const rec = monthRows.find((e) => e.bill_id === b.id);
      const sh = myShare(rec ?? b, role);
      const c = cats.get(b.category ?? "bill");
      const date = b.due_day ? new Date(ym.y, ym.m, Math.min(b.due_day, dim)) : null;
      const payer = b.paid_from === role;
      items.push({
        key: `share-${b.id}`, date, label: `${b.name} · ส่วนของฉัน ${Math.round(sh * 100)}%`, amount: (rec ? Number(rec.amount) : Number(b.amount)) * sh, icon: c.icon, paid: !!rec,
        note: rec ? undefined : payer ? "ฉันจ่ายก่อน" : `${people.get(b.paid_from).name}จ่ายก่อน`,
        tap: rec || !payer ? undefined : () => onRecord({ amount: String(Number(b.amount)), date: dayKey(isThisMonth ? now : date ?? new Date(ym.y, ym.m, 1)), time: "12:00", merchant: b.name, category: b.category ?? "bill", paid_from: b.paid_from, private: false, note: "", bill_id: b.id, other_share: b.other_share ?? null }),
      });
    }
  }
  const byDate = (a: Item, b: Item) => (a.date?.getTime() ?? 9e15) - (b.date?.getTime() ?? 9e15);
  items.sort((a, b) => (a.paid === b.paid ? byDate(a, b) : a.paid ? 1 : -1));
  const cardPaid = items.filter((i) => i.paid && i.key.startsWith("card-")).reduce((s, i) => s + i.amount, 0);
  const paidCount = items.filter((i) => i.paid).length;
  // ส่วนของฉันในรายจ่ายบ้านเดือนนี้ที่พ่อ/แม่ออกก่อน (ทุกรายการ ไม่ใช่แค่ค่าใช้จ่ายประจำ)
  // รายการที่มาจากบัตรไม่นับ เพราะนับในบิลบัตรแล้ว
  const sharePaid = scope === "mine" ? monthRows.filter((e) => !e.private && !e.card_charge_id && counted(e)).reduce((s, e) => s + Number(e.amount) * myShare(e, role), 0) : 0;
  // บิลบัตรที่จ่ายแล้วมีส่วนที่เรียกเก็บคนในบ้านไว้ → จะได้คืน
  const refund = cardBills.reduce((s, b) => s + b.refund, 0);
  const reserve = items.filter((i) => !i.paid && !i.fromFund).reduce((s, i) => s + i.amount, 0);
  const used = spent + cardPaid + sharePaid;
  // กันเงินไว้ทุกเดือนสำหรับค่าใช้จ่ายรายปี/ต่อเทอม (sinking fund)
  const fund = bills.filter((b) => isFund(b) && addedBy(b)).reduce((s, b) => s + fundPerMonth(b), 0);
  const left = base - used - reserve - fund - saved + refund;
  // รูดบัตรรอบที่ยังไม่ตัด (จ่ายเดือนหน้า) + ภาระผ่อนต่อเดือน
  const todayKey = dayKey(now);
  const sums = myCards.map((c) => cardSummary(c, charges.filter((x) => x.card_id === c.id), todayKey));
  const later = isThisMonth ? sums.filter((s) => s.cycleAmount > 0 && s.cycleDue.getFullYear() * 12 + s.cycleDue.getMonth() > ym.y * 12 + ym.m) : [];
  const nextCard = later.reduce((t, s) => t + s.cycleAmount, 0);
  const nextDue = later.map((s) => s.cycleDue).sort((a, b) => a.getTime() - b.getTime())[0];
  const loans = bills.filter((b) => b.period === "monthly" && isLoan(b)).reduce((s, b) => s + Number(b.amount), 0)
    + shareBills.filter(isLoan).reduce((s, b) => s + Number(b.amount) * myShare(b, role), 0)
    + sums.reduce((t, s) => t + s.monthlyInstallments, 0);
  // คิดจากยอดผ่อนปัจจุบัน จึงแสดงเฉพาะเดือนนี้
  const dsr = isThisMonth && !useBudget && regular > 0 ? Math.round((loans / regular) * 100) : 0;
  const dsrTone = dsr <= 40 ? ["ดี", "bg-mint text-[#3F8A5F]"] : dsr <= 50 ? ["เกินเกณฑ์", "bg-butter"] : ["หนักไป", "bg-rose/15 text-rose"];
  const daysLeft = isThisMonth ? new Date(ym.y, ym.m + 1, 0).getDate() - now.getDate() + 1 : 0;
  const seg = (v: number) => `${Math.min(100, base > 0 ? (v / base) * 100 : 0)}%`;
  const [showAll, setShowAll] = useState(false);
  const collapsed = useCollapsed(scope);

  return (
    <section className={`card flex flex-col gap-2.5 ${scope === "home" ? "bg-peach" : "bg-lavender"}`}>
      {header}
      {collapsed.has("month") ? (
        <button type="button" onClick={() => collapsed.toggle("month")} aria-expanded={false} className="flex items-center gap-2 text-left">
          <span className="flex-1 text-sm">{base === 0 ? "ใช้ไปแล้ว" : isPast ? (left >= 0 ? "เดือนนั้นเหลือ" : "เดือนนั้นใช้เกิน") : !isThisMonth ? (left >= 0 ? "คาดว่าจะเหลือ" : "คาดว่าจะเกิน") : left >= 0 ? (scope === "home" && !useBudget ? "เหลือหลังหักค่าใช้จ่ายบ้าน" : "เหลือใช้ได้จริง") : "ใช้เกินไปแล้ว"}</span>
          <span className={`font-display text-xl font-bold ${base > 0 && left < 0 ? "text-rose" : ""}`}>{baht(base === 0 ? used : Math.abs(left))} บาท</span>
          {reserve > 0 && <span className="text-xs font-semibold text-rose">{isThisMonth ? "ค้าง" : "ต้องจ่าย"} {baht(reserve)}</span>}
          <span className="text-muted" aria-hidden>▾</span>
        </button>
      ) : <>
      {base === 0 ? (
        <>
          <span className="font-display text-[30px] font-bold">{baht(used)} <span className="text-base font-medium">บาท ใช้ไปแล้ว</span></span>
          <button onClick={() => setOpen(true)} className="rounded-2xl bg-white/70 p-3 text-left text-sm">
            {scope === "home" && incomes.rows.some((i) => i.private && incomeInMonth(i, ym.y, ym.m))
              ? <>รายได้ที่ใส่ไว้ตั้งเป็น &quot;เห็นคนเดียว&quot; จึงไม่รวมในยอดบ้าน · <b className="underline">แตะเพื่อแก้</b> หรือเปิด &quot;ใช้งบ&quot;</>
              : <>💼 <b className="underline">ตั้งเงินเดือน</b> แล้วแอปจะบอกว่าเดือนนี้เหลือใช้ได้จริงกี่บาท หลังกันค่าใช้จ่ายประจำและบิลบัตรไว้แล้ว</>}
          </button>
        </>
      ) : (
        <>
          <div className="flex items-end justify-between gap-2">
            <span className="flex flex-col">
              <span className="text-sm">{isPast ? (left >= 0 ? "เดือนนั้นเหลือ" : "เดือนนั้นใช้เกิน") : !isThisMonth ? (left >= 0 ? "คาดว่าจะเหลือ" : "คาดว่าจะเกิน") : left >= 0 ? (scope === "home" && !useBudget ? "เหลือหลังหักค่าใช้จ่ายบ้าน" : "เหลือใช้ได้จริง") : "ใช้เกินไปแล้ว"}</span>
              <span className={`font-display text-[32px] font-bold leading-tight ${left < 0 ? "text-rose" : ""}`}>{baht(Math.abs(left))} <span className="text-base font-medium">บาท</span></span>
            </span>
            {isThisMonth && left > 0 && daysLeft > 0 && <span className="mb-1 rounded-xl bg-white/80 px-2.5 py-1 text-sm">วันละ ~<b>{baht(left / daysLeft)}</b> · {daysLeft} วัน</span>}
          </div>
          <span className="flex h-3 overflow-hidden rounded-full bg-white" aria-hidden>
            <span className="block h-3 bg-rose" style={{ width: seg(used) }} />
            <span className="block h-3 bg-[repeating-linear-gradient(45deg,#B49BE0_0_4px,#DCCDF3_4px_8px)]" style={{ width: seg(reserve) }} />
            <span className="block h-3 bg-[repeating-linear-gradient(45deg,#E8C77A_0_4px,#F6E7BE_4px_8px)]" style={{ width: seg(fund) }} />
            <span className="block h-3 bg-[#8FCFA8]" style={{ width: seg(saved) }} />
          </span>
          <div className="flex flex-col gap-0.5 text-sm">
            <button onClick={useBudget ? onBudget : () => setOpen(true)} className="flex justify-between text-left">
              <span>{useBudget ? "งบเดือนนี้" : scope === "home" ? "รายได้บ้าน" : "รายได้ของฉัน"} <span className="text-xs text-muted underline">{useBudget ? "ปรับงบ" : "แก้"}</span></span><span>{baht(base)}</span>
            </button>
            {!useBudget && extra > 0 && <span className="-mt-0.5 pl-4 text-xs text-muted">รวม 🎁 รายได้ครั้งเดียว {baht(extra)} ({inc.filter(isOneTime).map((i) => i.label).join(", ")})</span>}
            <span className="flex justify-between"><span className="flex flex-col"><span><i className="mr-1.5 inline-block size-2.5 rounded-full bg-rose" />ใช้ไปแล้ว</span>{(cardPaid > 0 || sharePaid > 0) && <span className="pl-4 text-xs text-muted">รวม{[cardPaid > 0 ? `บิลบัตร ${baht(cardPaid)}` : "", sharePaid > 0 ? `ส่วนของฉันในบ้าน ${baht(sharePaid)}` : ""].filter(Boolean).join(" · ")}</span>}</span><span className="shrink-0">− {baht(used)} · {pct(used, base)}%</span></span>
            {reserve > 0 && <span className="flex justify-between"><span><i className="mr-1.5 inline-block size-2.5 rounded-full bg-[#B49BE0]" />ยังต้องจ่าย</span><span>− {baht(reserve)} · {pct(reserve, base)}%</span></span>}
            {fund > 0 && <span className="flex justify-between"><span className="flex flex-col"><span><i className="mr-1.5 inline-block size-2.5 rounded-full bg-[#E8C77A]" />🐷 กันไว้ค่าใช้จ่ายรายปี</span><span className="pl-4 text-xs text-muted">ทยอยเก็บทุกเดือน ถึงเดือนจ่ายจะไม่สะดุด</span></span><span className="shrink-0">− {baht(fund)}</span></span>}
            {saved > 0 && <span className="flex justify-between"><span><i className="mr-1.5 inline-block size-2.5 rounded-full bg-[#8FCFA8]" />💚 เก็บออม/ลงทุนแล้ว</span><span className="shrink-0">− {baht(saved)} · {pct(saved, base)}%</span></span>}
            {refund > 0 && <span className="flex justify-between"><span><i className="mr-1.5 inline-block size-2.5 rounded-full bg-mint" />ได้คืน (รูดบัตรแล้วเรียกเก็บคนในบ้าน)</span><span>+ {baht(refund)}</span></span>}
          </div>
          {(isThisMonth || saved > 0) && !useBudget && income > 0 && (
            <span className={`self-start rounded-xl px-2.5 py-1 text-xs ${pct(saved, income) >= 10 ? "bg-mint text-[#3F8A5F]" : "bg-white/70"}`}>
              {saved > 0 ? `${pct(saved, income) >= 20 ? "🌟 เก่งมาก!" : pct(saved, income) >= 10 ? "👍 ดีเลย" : "🌱 เริ่มแล้ว"} ออมไป ${pct(saved, income)}% ของรายได้ · แนะนำ 10–20%` : `🌱 ยังไม่ได้ออมเดือนนี้ · ลองกันไว้ 10% = ${baht(income * 0.1)} บาท (จดหมวด "ออม" หรือฝากเข้าเป้าหมาย)`}
            </span>
          )}
          {(nextCard > 0 || dsr > 0) && (
            <div className="flex flex-col gap-1 rounded-2xl bg-white/60 p-2.5 text-xs">
              {nextCard > 0 && <span>💳 รูดบัตรรอบนี้แล้ว <b>{baht(nextCard)}</b> (จ่าย{nextDue ? ` ${short(nextDue)}` : "เดือนหน้า"}) · ถ้ากันไว้ด้วย เหลือ <b className={left - nextCard < 0 ? "text-rose" : ""}>{baht(left - nextCard)}</b></span>}
              {dsr > 0 && <span>🧾 ภาระผ่อนต่อเดือน <b>{baht(loans)}</b> = {dsr}% ของรายได้{extra > 0 ? "ประจำ" : ""} <span className={`ml-0.5 whitespace-nowrap rounded-md px-1.5 font-semibold ${dsrTone[1]}`}>{dsrTone[0]}</span> <span className="whitespace-nowrap text-muted">· ไม่ควรเกิน 40%</span></span>}
            </div>
          )}
        </>
      )}
      {items.length > 0 && (
        <div className="flex flex-col gap-1 rounded-2xl bg-white/75 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold">บิล{isThisMonth ? "เดือนนี้" : "เดือนนั้น"}</span>
            <span className="text-xs text-muted">จ่ายแล้ว {paidCount}/{items.length}</span>
          </div>
          {reserve > 0 && <span className="text-xs text-muted">เหลือต้องจ่าย <b className="text-cocoa">{baht(reserve)}</b> บาท · แตะวงกลมเมื่อจ่ายแล้ว</span>}
          {(showAll ? items : items.slice(0, 6)).map((r) => {
            const chip = dueChip(r.date, r.paid, isThisMonth);
            return (
              <button key={r.key} type="button" disabled={!r.tap} onClick={r.tap}
                className={`flex min-h-11 items-center gap-2.5 text-left text-sm ${r.paid ? "opacity-60" : ""}`}
                aria-label={r.paid ? `${r.label} จ่ายแล้ว${r.tap ? " แตะเพื่อยกเลิก" : ""}` : `ติ๊กว่าจ่าย ${r.label} แล้ว`}>
                <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${r.paid ? "bg-mint text-[#3F8A5F]" : "border-2 border-cocoa/25 bg-white"}`}>{r.paid ? "✓" : ""}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={`truncate ${r.paid ? "line-through" : ""}`}>{r.label}</span>
                  <span className="flex items-center gap-1.5 text-xs">
                    <span className={`rounded-md px-1.5 ${chip.tone}`}>{chip.text}</span>
                    {r.date && isThisMonth && !r.paid && <span className="text-muted">{short(r.date)}</span>}
                    {r.note && <span className="text-muted">· {r.note}</span>}
                  </span>
                </span>
                <span className={`shrink-0 ${r.paid ? "line-through" : "font-semibold"}`}>{baht(r.amount)}</span>
              </button>
            );
          })}
          {items.length > 6 && <button className="self-start text-xs text-muted underline" onClick={() => setShowAll(!showAll)}>{showAll ? "ย่อ" : `ดูอีก ${items.length - 6} รายการ`}</button>}
        </div>
      )}
      {scope === "mine" && <span className="text-xs text-muted">นับเฉพาะของคุณ: รายการ &quot;จ่ายส่วนตัว&quot;/&quot;เห็นคนเดียว&quot; บิลบัตรของคุณ ค่าใช้จ่ายประจำส่วนตัว และส่วนของคุณในรายจ่ายบ้านที่พ่อ/แม่ออกก่อน</span>}
      <button type="button" onClick={() => collapsed.toggle("month")} aria-expanded className="-mb-1 min-h-8 self-end text-xs text-muted">ซ่อนกล่องนี้ ▴</button>
      </>}
      <Sheet open={open} onClose={() => setOpen(false)} title="รายได้">
        {open && <IncomeEditor rows={incomes.rows} people={people.list.filter((p) => !p.kid)} onChange={incomes.refresh} />}
      </Sheet>
    </section>
  );
}

const LABELS = ["เงินเดือน", "โบนัส (เฉลี่ยต่อเดือน)", "รายได้เสริม", "ค่าเช่า", "ปันผล"];
const ONCE_LABELS = ["โบนัส", "งานนอก", "ค่าคอม/OT", "ขายของ", "อั่งเปา/ของขวัญ"];
const TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const monLabel = (ymd: string) => `${TH_MON[Number(ymd.slice(5, 7)) - 1]} ${String((Number(ymd.slice(0, 4)) + 543) % 100).padStart(2, "0")}`;

function IncomeEditor({ rows, people, onChange }: { rows: IncomeRow[]; people: { key: string; name: string }[]; onChange: () => void }) {
  const { role } = useHousehold();
  const [who, setWho] = useState(role);
  const [label, setLabel] = useState("เงินเดือน");
  const [amount, setAmount] = useState("");
  const [priv, setPriv] = useState(false);
  const [once, setOnce] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const { people: all } = useHousehold();
  // แก้ยอด = ใช้ตั้งแต่เดือนนี้ · เดือนก่อนๆ ยังคิดด้วยยอดเดิม
  const now = new Date();
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const monthStart = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
  const prevEnd = ymd(new Date(now.getFullYear(), now.getMonth(), 0));
  const current = rows.filter((r) => !isOneTime(r) && incomeInMonth(r, now.getFullYear(), now.getMonth()));
  const history = rows.filter((r) => !isOneTime(r) && r.valid_to && r.valid_to < monthStart).sort((a, b) => (b.valid_to ?? "").localeCompare(a.valid_to ?? ""));
  // รายได้ครั้งเดียว: เดือนนี้และเดือนหน้าๆ ก่อน แล้วตามด้วยที่ผ่านมาไม่นาน
  const onceRows = rows.filter(isOneTime).sort((a, b) => (b.valid_from ?? "").localeCompare(a.valid_from ?? ""));
  const started = (r: IncomeRow) => (r.valid_from ?? "2000-01-01") < monthStart;
  const [onceMonth, setOnceMonth] = useState(monthStart.slice(0, 7));
  const nextMonth = ymd(new Date(now.getFullYear(), now.getMonth() + 1, 1)).slice(0, 7);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount.replace(/,/g, ""));
    if (!(n > 0)) return setMsg(once ? "ใส่ยอดที่ได้ก่อนนะ" : "ใส่ยอดต่อเดือนก่อนนะ");
    if (once) {
      const [y, m] = onceMonth.split("-").map(Number);
      if (!y || !m) return setMsg("เลือกเดือนที่ได้เงินก่อนนะ");
      const { error } = await supabase().from("incomes").insert({ who, label: label.trim() || "รายได้พิเศษ", amount: n, private: priv, ...oneTimeRange(y, m - 1) });
      if (error) return setMsg("บันทึกไม่ได้ ลองใหม่อีกครั้ง");
      setAmount(""); setPriv(false); onChange();
      return setMsg(`เพิ่มแล้ว ✓ 🎁 ${all.get(who).name} ${label} ${baht(n)} บาท นับเฉพาะเดือน ${monLabel(onceMonth + "-01")}`);
    }
    const { error } = await supabase().from("incomes").insert({ who, label: label.trim() || "เงินเดือน", amount: n, private: priv, valid_from: monthStart });
    if (error) return setMsg("บันทึกไม่ได้ ลองใหม่อีกครั้ง");
    setAmount(""); setPriv(false); onChange();
    setMsg(`เพิ่มแล้ว ✓ ${all.get(who).name} ${baht(n)} บาท/เดือน${priv ? " (เห็นคนเดียว ดูได้ที่แท็บ \"ของฉัน\")" : ""}`);
  }
  async function update(r: IncomeRow, v: string) {
    const n = Number(v.replace(/,/g, ""));
    if (!(n > 0) || n === Number(r.amount)) return;
    if (isOneTime(r)) await supabase().from("incomes").update({ amount: n }).eq("id", r.id);
    else if (started(r)) {
      // ปิดยอดเดิมไว้ที่สิ้นเดือนก่อน แล้วเริ่มยอดใหม่เดือนนี้
      await supabase().from("incomes").update({ valid_to: prevEnd }).eq("id", r.id);
      await supabase().from("incomes").insert({ who: r.who, label: r.label, amount: n, private: r.private, valid_from: monthStart });
      setMsg(`บันทึกแล้ว ✓ ${baht(n)} บาท ใช้ตั้งแต่เดือนนี้ · เดือนก่อนยังคิดที่ ${baht(Number(r.amount))}`);
    } else await supabase().from("incomes").update({ amount: n }).eq("id", r.id);
    onChange();
  }
  async function togglePrivate(r: IncomeRow) {
    await supabase().from("incomes").update({ private: !r.private }).eq("id", r.id);
    onChange();
  }
  async function remove(r: IncomeRow) {
    // เคยใช้ในเดือนก่อน → หยุดตั้งแต่เดือนนี้ (เดือนเก่าไม่เปลี่ยน)
    if (!isOneTime(r) && started(r)) await supabase().from("incomes").update({ valid_to: prevEnd }).eq("id", r.id);
    else await supabase().from("incomes").delete().eq("id", r.id);
    onChange();
  }

  return (
    <div className="flex flex-col gap-4">
      {current.length > 0 && (
        <div className="flex flex-col gap-2">
          {current.map((r) => (
            <div key={r.id} className="flex flex-col gap-1.5 rounded-2xl bg-sand p-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-semibold">{all.get(r.who).name} · {r.label}</span>
                <span className="w-32 shrink-0"><input className="field min-h-10 text-right" inputMode="decimal" aria-label={`ยอด${r.label}`} defaultValue={String(Number(r.amount))} onBlur={(e) => update(r, e.target.value)} /></span>
                <button aria-label="ลบ" onClick={() => remove(r)} className="min-h-10 px-2 text-muted">✕</button>
              </div>
              <button type="button" onClick={() => togglePrivate(r)} className="flex min-h-9 items-center gap-1.5 self-start text-xs">
                {r.private ? <><LockIcon />เห็นคนเดียว (ไม่รวมในยอดบ้าน) · <b className="underline">แตะเพื่อให้รวมในยอดบ้าน</b></> : <>🏠 รวมในยอดบ้าน · <span className="underline">แตะเพื่อเปลี่ยนเป็นเห็นคนเดียว</span></>}
              </button>
            </div>
          ))}
          <p className="text-xs text-muted">แตะตัวเลขเพื่อแก้ · ใส่เป็นยอดต่อเดือน (หลังหักภาษี/ประกันสังคมจะเห็นภาพจริงกว่า) · เงินเดือนขึ้น แก้ได้เลย เดือนก่อนๆ ยังคิดด้วยยอดเดิม</p>
        </div>
      )}
      {history.length > 0 && (
        <div className="flex flex-col gap-1 rounded-2xl bg-white/70 p-3 text-xs text-muted">
          <span className="font-semibold text-cocoa">📜 ยอดเดิม (ใช้คิดเดือนก่อนๆ)</span>
          {history.slice(0, 6).map((r) => (
            <span key={r.id} className="flex justify-between"><span>{all.get(r.who).name} · {r.label} · ถึง {thaiDate(new Date(r.valid_to + "T12:00:00"), { month: "short", year: "2-digit" })}</span><span>{baht(Number(r.amount))}</span></span>
          ))}
        </div>
      )}
      {onceRows.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-2xl bg-butter/60 p-3 text-sm">
          <span className="font-semibold">🎁 รายได้ครั้งเดียว <span className="text-xs font-normal text-muted">(นับเฉพาะเดือนนั้น)</span></span>
          {onceRows.slice(0, 8).map((r) => (
            <div key={r.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">{all.get(r.who).name} · {r.label} · <b>เฉพาะ {monLabel(r.valid_from!)}</b>{r.private ? " 🔒" : ""}</span>
              <span className="w-28 shrink-0"><input className="field min-h-10 text-right" inputMode="decimal" aria-label={`ยอด${r.label}`} defaultValue={String(Number(r.amount))} onBlur={(e) => update(r, e.target.value)} /></span>
              <button aria-label="ลบ" onClick={() => remove(r)} className="min-h-10 px-2 text-muted">✕</button>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={add} className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-3">
        <span className="text-sm font-semibold">เพิ่มรายได้</span>
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" className="chip justify-center" aria-pressed={!once} onClick={() => { setOnce(false); setLabel("เงินเดือน"); }}>🔁 ได้ทุกเดือน</button>
          <button type="button" className="chip justify-center" aria-pressed={once} onClick={() => { setOnce(true); setLabel("โบนัส"); }}>🎁 ครั้งเดียว</button>
        </div>
        <div className="flex flex-wrap gap-1.5">{people.map((p) => <button type="button" key={p.key} className="chip" aria-pressed={who === p.key} onClick={() => setWho(p.key)}>{p.name}</button>)}</div>
        <div className="flex flex-wrap gap-1.5">{(once ? ONCE_LABELS : LABELS).map((l) => <button type="button" key={l} className="chip" aria-pressed={label === l} onClick={() => setLabel(l)}>{l}</button>)}</div>
        {once && (
          <div className="flex flex-col gap-1.5 text-sm font-medium">ได้เงินเดือนไหน
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" className="chip" aria-pressed={onceMonth === monthStart.slice(0, 7)} onClick={() => setOnceMonth(monthStart.slice(0, 7))}>เดือนนี้</button>
              <button type="button" className="chip" aria-pressed={onceMonth === nextMonth} onClick={() => setOnceMonth(nextMonth)}>เดือนหน้า</button>
              <input type="month" aria-label="เลือกเดือนอื่น" className="field min-h-10 w-auto flex-1" value={onceMonth} onChange={(e) => setOnceMonth(e.target.value)} />
            </div>
          </div>
        )}
        <label className="flex flex-col gap-1 text-sm font-medium">{once ? "ยอดที่ได้ (บาท)" : "ต่อเดือน (บาท)"}<input className="field" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} placeholder={once ? "เช่น 20000" : "เช่น 35000"} /></label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-5 accent-cocoa" checked={priv} onChange={(e) => setPriv(e.target.checked)} />
          <LockIcon />เห็นคนเดียว (ไม่รวมในยอดบ้าน ดูได้ที่ &quot;ของฉัน&quot;)
        </label>
        {msg && <p role="status" className={`text-sm ${msg.includes("แล้ว ✓") ? "text-[#3F8A5F]" : "text-rose"}`}>{msg}</p>}
        <button className="btn-dark">เพิ่ม</button>
      </form>
    </div>
  );
}
