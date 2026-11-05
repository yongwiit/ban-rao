"use client";

import { useState } from "react";
import { useHousehold } from "./Household";
import { Sheet } from "./Sheet";
import { TrashIcon } from "./Icons";
import { CatIcon, CategoryPicker, useCategories } from "./Categories";
import { supabase } from "@/lib/supabase";
import { baht, dayKey, monthRange } from "@/lib/format";
import { useLive } from "@/lib/useLive";
import { BILL_PERIODS, FIXED_COST_PRESETS, PAID_FROM_KEYS, monthlySetAside, paidFromLabel, type BillPeriod, type PaidFrom } from "@/lib/family";
import type { ChargeRow } from "@/lib/cards";
import type { BillRow, ExpenseRow } from "@/lib/types";
import type { ExpenseDraft } from "./ExpenseForm";
import { myShare, otherShare } from "@/lib/settle";
import { FUND_MONTH } from "@/lib/config";
import { fundDueMonths, fundPerMonth, fundSaved, isFund } from "@/lib/fund";

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

const otherOf = (p: PaidFrom) => (p === "dad" ? "mom" : "dad");
/** " · แม่ช่วย 50%" สำหรับค่าใช้จ่ายบ้านที่พ่อ/แม่ออกก่อน */
function shareText(b: BillRow, people: ReturnType<typeof useHousehold>["people"]) {
  if (b.paid_from !== "dad" && b.paid_from !== "mom") return "";
  const v = otherShare(b.other_share);
  return v > 0 ? ` · ${people.get(otherOf(b.paid_from)).name}ช่วย ${Math.round(v * 100)}%` : " · จ่ายคนเดียว";
}

/** ค่าใช้จ่ายประจำต่อเดือน (รวม subscription ในบัตรที่ยังใช้อยู่) */
export function fixedMonthly(bills: BillRow[], subs: ChargeRow[] = []) {
  return bills.reduce((s, b) => s + monthlySetAside(Number(b.amount), b.period), 0)
    + subs.reduce((s, c) => s + (c.repeat === "yearly" ? Number(c.amount) / 12 : Number(c.amount)), 0);
}

/**
 * ค่าใช้จ่ายประจำ: แท็บบ้าน = ของบ้าน · แท็บของฉัน = ส่วนตัว + subscription ในบัตรของฉัน
 * หักบัญชีอัตโนมัติ → ระบบจดให้ทุกเดือน · ยอดไม่คงที่ → กด "จดยอดเดือนนี้"
 */
export function FixedCosts({ scope, bills, shareBills = [], subs, cardName = {}, monthRows, isThisMonth, onRecord }: {
  scope: "home" | "mine"; bills: BillRow[]; shareBills?: BillRow[]; subs: ChargeRow[]; cardName?: Record<string, string>; monthRows: ExpenseRow[]; isThisMonth: boolean;
  onRecord: (d: ExpenseDraft) => void;
}) {
  const cats = useCategories();
  const { people, household, role } = useHousehold();
  const [open, setOpen] = useState<BillRow | "new" | null>(null);
  const total = fixedMonthly(bills, subs) + shareBills.reduce((s, b) => s + Number(b.amount) * myShare(b, role), 0);
  // สรุปเดือนนี้: จดแล้ว / ยังไม่จด (เฉพาะรายเดือน) / subscription ที่ตัดผ่านบัตร
  const recOf = (id: string) => monthRows.find((e) => e.bill_id === id);
  const monthlyBills = bills.filter((b) => b.period === "monthly");
  const recTotal = monthlyBills.reduce((s, b) => s + Number(recOf(b.id)?.amount ?? 0), 0)
    + shareBills.reduce((s, b) => { const r = recOf(b.id); return s + (r ? Number(r.amount) * myShare(r, role) : 0); }, 0);
  const dueLeft = monthlyBills.filter((b) => !recOf(b.id)).reduce((s, b) => s + Number(b.amount), 0)
    + shareBills.filter((b) => !recOf(b.id)).reduce((s, b) => s + Number(b.amount) * myShare(b, role), 0);
  const subTotal = fixedMonthly([], subs);
  const now = new Date();
  // ยอดจริงเดือนก่อน ไว้เทียบ (เช่น ค่าน้ำ ค่าไฟ ที่ยอดไม่คงที่)
  const prevRange = monthRange(now.getFullYear(), now.getMonth() - 1);
  const prev = useLive<Pick<ExpenseRow, "bill_id" | "amount">>("expenses", household.id, () =>
    supabase().from("expenses").select("bill_id, amount").not("bill_id", "is", null).gte("spent_at", prevRange.start).lt("spent_at", prevRange.end), [prevRange.start]);
  const prevOf = (id: string) => prev.rows.filter((e) => e.bill_id === id).reduce((s, e) => s + Number(e.amount), 0);

  return (
    <section className="card flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-[17px] font-semibold">{scope === "home" ? "ค่าใช้จ่ายประจำของบ้าน" : "ค่าใช้จ่ายประจำของฉัน"}</h2>
        <button onClick={() => setOpen("new")} className="min-h-9 px-1 text-sm text-muted">+ เพิ่ม</button>
      </div>
      {bills.length === 0 && subs.length === 0 && shareBills.length === 0 && (
        <p className="text-sm text-muted">{scope === "home"
          ? "เช่น ค่าเช่า ค่าเน็ต ค่าขนมลูก ประกันบ้าน · ค่าน้ำ ค่าไฟ ตั้งเป็น \"ยอดไม่คงที่\" แล้วจดยอดจริงทุกเดือน แอปเทียบกับเดือนก่อนให้"
          : "เช่น ค่าผ่อนรถที่หักบัญชีทุกวันที่ 5 ค่าโทรศัพท์ ประกันชีวิต · ตั้ง \"หักบัญชีอัตโนมัติ\" แล้วแอปจดให้เองทุกเดือน"}</p>
      )}
      {bills.map((b) => {
        const cat = cats.get(b.category ?? "bill");
        const rec = monthRows.find((e) => e.bill_id === b.id);
        const dueToday = b.due_day != null && isThisMonth && now.getDate() >= b.due_day;
        // ตั้งจดอัตโนมัติหลังวันครบของเดือนนี้ → ระบบเริ่มจดเดือนหน้า เดือนนี้ให้กดจดเอง
        const dueKey = b.due_day != null ? dayKey(new Date(now.getFullYear(), now.getMonth(), Math.min(b.due_day, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()))) : "";
        const missed = !!(b.auto_record && b.auto_from && dueKey && dueKey < b.auto_from);
        const last = b.variable ? prevOf(b.id) : 0;
        const diff = rec && last ? Number(rec.amount) - last : 0;
        return (
          <div key={b.id} className="flex items-center gap-2.5 text-sm">
            <button onClick={() => setOpen(b)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
              <CatIcon icon={cat.icon} size={36} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-semibold">{b.name}</span>
                <span className="text-xs text-muted">
                  {b.variable ? "ยอดไม่คงที่ ~" : ""}{baht(Number(b.amount))}/{BILL_PERIODS[b.period].unit}{b.due_day ? ` · วันที่ ${b.due_day}` : ""}
                  {b.auto_record ? " · จดให้อัตโนมัติ" : ""}{scope === "home" && b.paid_from !== "pot" ? ` · ${paidFromLabel(b.paid_from, people)}` : ""}{shareText(b, people)}
                  {isFund(b) && (b.due_month ? ` · จ่าย${fundDueMonths(b).map((m) => ` ${TH_MONTHS[m]}`).join(",")}` : " · ยังไม่ได้ตั้งเดือนที่จ่าย")}
                  {last > 0 ? (diff ? ` · ${diff > 0 ? "▲ แพงขึ้น" : "▼ ถูกลง"} ${baht(Math.abs(diff))} จากเดือนก่อน` : ` · เดือนก่อน ${baht(last)}`) : ""}
                </span>
              </span>
            </button>
            {b.period === "monthly" && isThisMonth && (rec
              ? <span className="shrink-0 rounded-lg bg-mint px-2 py-1 text-xs">✓ {baht(Number(rec.amount))}</span>
              : b.auto_record && !b.variable && !missed
                ? <span className="shrink-0 text-xs text-muted">{dueToday ? "กำลังจด…" : `จดให้วันที่ ${b.due_day}`}</span>
                : <button className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${dueToday || b.variable ? "bg-butter" : "bg-sand"}`}
                    onClick={() => onRecord({ amount: b.variable ? "" : String(Number(b.amount)), date: dayKey(now), time: "12:00", merchant: b.name, category: b.category ?? "bill", paid_from: b.paid_from, private: false, note: "", bill_id: b.id, other_share: b.other_share ?? null })}>
                    จดยอดเดือนนี้
                  </button>)}
            {isFund(b) ? (() => {
              const got = fundSaved(b, now.getMonth());
              const pctGot = got == null ? 0 : Math.min(100, (got / Number(b.amount)) * 100);
              return (
                <span className="flex w-24 shrink-0 flex-col items-end gap-0.5">
                  <span className="text-xs text-muted">🐷 กันเดือนละ</span>
                  <span className="font-semibold">{baht(fundPerMonth(b))}</span>
                  {got != null && <span className="h-1.5 w-full overflow-hidden rounded-full bg-sand" title={`กันแล้ว ~${baht(got)}`}><span className="block h-1.5 rounded-full bg-[#E8C77A]" style={{ width: `${pctGot}%` }} /></span>}
                  {got != null && <span className="text-[11px] text-muted">กันแล้ว ~{baht(got)}</span>}
                </span>
              );
            })() : !(b.period === "monthly" && isThisMonth) && <span className="shrink-0">{baht(monthlySetAside(Number(b.amount), b.period))}</span>}
          </div>
        );
      })}
      {subs.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-dashed border-line pt-2">
          <span className="text-xs font-semibold text-muted">subscription ในบัตรของฉัน (แก้ได้ที่หน้าบัตร)</span>
          {subs.map((c) => {
            const cat = cats.get(c.category);
            const d = Number(c.charged_on.slice(8));
            const cut = isThisMonth && c.repeat !== "yearly" && now.getDate() >= d;
            return (
              <span key={c.id} className="flex items-center gap-2.5 text-sm">
                <CatIcon icon={cat.icon} size={30} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{c.title}</span>
                  <span className="truncate text-xs text-muted">{c.repeat === "yearly" ? "ทุกปี" : "ทุกเดือน"} วันที่ {d}{cardName[c.card_id] ? ` · ${cardName[c.card_id].startsWith("บัตร") ? "" : "บัตร "}${cardName[c.card_id]}` : ""}{cut ? " · ตัดบัตรแล้ว" : ""}{c.bill_to ? " · เรียกเก็บ" : ""}</span>
                </span>
                <span className="shrink-0">{baht(Number(c.amount))}</span>
              </span>
            );
          })}
        </div>
      )}
      {shareBills.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-dashed border-line pt-2">
          <span className="text-xs font-semibold text-muted">ส่วนของฉันในค่าใช้จ่ายบ้าน (แก้ได้ที่แท็บของบ้าน)</span>
          {shareBills.map((b) => {
            const cat = cats.get(b.category ?? "bill");
            const sh = myShare(b, role);
            const rec = monthRows.find((e) => e.bill_id === b.id);
            const payer = b.paid_from === role ? "ฉันจ่ายก่อน" : `${people.get(b.paid_from).name}จ่ายก่อน · โอนคืนตอนเคลียร์`;
            return (
              <span key={b.id} className="flex items-center gap-2.5 text-sm">
                <CatIcon icon={cat.icon} size={30} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{b.name} <span className="text-xs text-muted">· ส่วนของฉัน {Math.round(sh * 100)}%</span></span>
                  <span className="text-xs text-muted">{payer}</span>
                </span>
                {isThisMonth && rec
                  ? <span className="shrink-0 rounded-lg bg-mint px-2 py-1 text-xs">✓ {baht(Number(rec.amount) * myShare(rec, role))}</span>
                  : <span className="shrink-0">{baht(Number(b.amount) * sh)}</span>}
              </span>
            );
          })}
        </div>
      )}
      {total > 0 && (
        <div className="flex flex-col gap-0.5 border-t border-dashed border-line pt-2">
          <span className="flex items-center justify-between font-semibold"><span>รวมต่อเดือน</span><span className="font-display text-lg">{baht(total)} บาท</span></span>
          {isThisMonth && (
            <span className="text-xs text-muted">
              จดแล้ว {baht(recTotal)}{dueLeft > 0 ? ` · ยังไม่จด ${baht(dueLeft)}` : " · ครบแล้ว ✓"}{subTotal > 0 ? ` · subscription ${baht(subTotal)} ตัดผ่านบัตร (นับในบิลบัตร)` : ""}
            </span>
          )}
        </div>
      )}
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open === "new" ? "เพิ่มค่าใช้จ่ายประจำ" : "แก้ค่าใช้จ่ายประจำ"}>
        {open && <BillForm key={open === "new" ? "new" : open.id} bill={open === "new" ? null : open} scope={scope} onDone={() => setOpen(null)} />}
      </Sheet>
    </section>
  );
}

type Method = "manual" | "auto" | "variable";
const PRESET_CAT: Record<string, string> = { "ค่าน้ำ": "water", "ค่าไฟ": "power", "ค่าเน็ต": "net", "ค่าโทรศัพท์": "phone", "ค่าบ้าน/ค่าเช่า": "home", "ค่าผ่อนรถ": "car", "ค่าเทอม": "study", "ค่าขนมลูก": "pearl", "ค่าเดินทาง": "travel" };
const VARIABLE_PRESETS = new Set(["ค่าน้ำ", "ค่าไฟ", "ค่าโทรศัพท์"]);

function BillForm({ bill, scope, onDone }: { bill: BillRow | null; scope: "home" | "mine"; onDone: () => void }) {
  const { people, userId } = useHousehold();
  const cats = useCategories();
  const [name, setName] = useState(bill?.name ?? "");
  const [amount, setAmount] = useState(bill ? String(Number(bill.amount)) : "");
  const [period, setPeriod] = useState<BillPeriod>(bill?.period ?? "monthly");
  const [due, setDue] = useState(bill?.due_day ? String(bill.due_day) : "");
  const [dueMonth, setDueMonth] = useState<number | null>(bill?.due_month ?? null);
  const [cat, setCat] = useState(bill?.category ?? (scope === "home" ? "bill" : "car"));
  const [paidFrom, setPaidFrom] = useState<PaidFrom>(bill?.paid_from ?? (scope === "home" ? "pot" : "personal"));
  const [share, setShare] = useState<number>(bill?.other_share == null ? 0.5 : Number(bill.other_share));
  const [method, setMethod] = useState<Method>(bill?.variable ? "variable" : bill?.auto_record || !bill ? "auto" : "manual");
  const [err, setErr] = useState<string | null>(null);
  const n = Number(amount.replace(/,/g, ""));
  const monthly = period === "monthly";
  // ชื่อสำเร็จรูป → เดาหมวดและแบบจ่ายให้ (น้ำ ไฟ โทร ยอดไม่คงที่)
  function pickPreset(p: string) {
    setName(p);
    if (bill) return;
    const c = PRESET_CAT[p];
    if (c) { setCat(c); setPaidFrom(cats.get(c).scope === "personal" ? "personal" : "pot"); }
    if (VARIABLE_PRESETS.has(p)) { setMethod("variable"); setPeriod("monthly"); }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setErr("ใส่ชื่อรายการก่อนนะ");
    if (!(n > 0)) return setErr(method === "variable" ? "ใส่ยอดประมาณต่อเดือน (ไว้คำนวณเงินที่ต้องเตรียม)" : "ใส่ยอดเงินให้ถูกต้อง");
    const d = Number(due);
    if (method === "auto" && monthly && !(d >= 1 && d <= 31)) return setErr("ใส่วันที่จ่ายทุกเดือน (1–31) แอปจะจดรายจ่ายให้วันนั้น");
    const auto = method === "auto" && monthly;
    const row = {
      name: name.trim(), amount: n, period, due_day: due && period !== "daily" ? d : null,
      ...(!FUND_MONTH ? {} : period === "yearly" || period === "term" ? { due_month: dueMonth } : bill?.due_month ? { due_month: null } : {}), category: cat, paid_from: paidFrom,
      auto_record: auto, variable: method === "variable",
      other_share: paidFrom === "dad" || paidFrom === "mom" ? share : null,
      // เริ่มจดอัตโนมัติจากวันนี้ (ไม่ย้อนจดเดือนที่ผ่านมา)
      auto_from: auto ? (bill?.auto_record && bill.auto_from ? bill.auto_from : dayKey(new Date())) : null,
      // เปลี่ยนเป็นส่วนตัว = เป็นของคนที่แก้ (รายการเก่าอาจยังไม่มีเจ้าของ)
      ...(paidFrom === "personal" ? { created_by: userId } : {}),
    };
    const { error } = bill ? await supabase().from("bills").update(row).eq("id", bill.id) : await supabase().from("bills").insert(row);
    if (error) return setErr("บันทึกไม่ได้ ลองใหม่อีกครั้ง");
    onDone();
  }
  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-medium">ชื่อรายการ<input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ค่าผ่อนรถ, ประกันรถ" />
        <span className="flex flex-wrap gap-1.5 pt-1">{FIXED_COST_PRESETS.map((p) => <button type="button" key={p} className="chip" aria-pressed={name === p} onClick={() => pickPreset(p)}>{p}</button>)}</span>
      </label>
      <CategoryPicker value={cat} onChange={(c) => { setCat(c.key); if (!bill) setPaidFrom(c.scope === "personal" ? "personal" : "pot"); }} />
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">จ่ายบ่อยแค่ไหน</legend>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(BILL_PERIODS) as BillPeriod[]).map((p) => <button type="button" key={p} className="chip" aria-pressed={period === p} onClick={() => setPeriod(p)}>{BILL_PERIODS[p].label}</button>)}
        </div>
      </fieldset>
      {FUND_MONTH && (period === "yearly" || period === "term") && (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">{period === "term" ? "จ่ายเทอมแรกเดือนไหน (อีกเทอมห่าง 6 เดือน)" : "จ่ายเดือนไหน"}</legend>
          <div className="grid grid-cols-6 gap-1.5">
            {TH_MONTHS.map((m, i) => <button type="button" key={m} className="chip justify-center px-0" aria-pressed={dueMonth === i + 1} onClick={() => setDueMonth(dueMonth === i + 1 ? null : i + 1)}>{m}</button>)}
          </div>
          <span className="mt-1 block text-xs text-muted">🐷 แอปจะกันเงินไว้ให้ทุกเดือน ถึงเดือนจ่ายจะได้ไม่สะดุด</span>
        </fieldset>
      )}
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">จ่ายยังไง</legend>
        <div className="flex flex-col gap-1.5">
          {([
            ["auto", "🔁 ยอดเท่าเดิม · จดให้เองทุกเดือน", "เช่น ค่าผ่อนรถหักบัญชีวันที่ 5, ค่าเช่า · ถึงวันแอปบันทึกเป็นรายจ่ายจริงให้"],
            ["variable", "📱 ยอดไม่คงที่", "เช่น ค่าโทร ค่าไฟ โอนผ่านแอป · ใส่ยอดประมาณไว้ แล้วกด \"จดยอดเดือนนี้\" ทุกเดือน"],
            ["manual", "✋ จดเองเมื่อจ่าย", "ยอดเท่าเดิม แต่อยากกดจดเอง (ยอดเติมให้)"],
          ] as const).map(([k, label, hint]) => (
            <button type="button" key={k} aria-pressed={method === k} disabled={k === "auto" && !monthly} onClick={() => setMethod(k)}
              className={`rounded-2xl border p-2.5 text-left text-sm disabled:opacity-40 ${method === k ? "border-cocoa bg-peach" : "border-line"}`}>
              <b>{label}</b><span className="block text-xs text-muted">{hint}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">{method === "variable" ? "ประมาณ (บาท)" : period === "daily" ? "ยอดต่อวัน (บาท)" : "ยอดต่อครั้ง (บาท)"}<input className="field min-w-0" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} /></label>
        {period !== "daily" && <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">{method === "auto" && monthly ? "จ่ายทุกวันที่" : "ครบกำหนดวันที่"}<input className="field min-w-0" type="number" min={1} max={31} value={due} onChange={(e) => setDue(e.target.value)} placeholder={method === "auto" && monthly ? "เช่น 5" : "ไม่ใส่ก็ได้"} /></label>}
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">ใครจ่าย</legend>
        <div className="flex flex-wrap gap-1.5">
          {PAID_FROM_KEYS.map((p) => <button type="button" key={p} className="chip" aria-pressed={paidFrom === p} onClick={() => setPaidFrom(p)}>{paidFromLabel(p, people)}</button>)}
        </div>
        <span className="mt-1 block text-xs text-muted">{paidFrom === "personal" ? "🙋 ส่วนตัว: เห็นเฉพาะคุณ อยู่ในแท็บ \"ของฉัน\"" : cats.get(cat).scope === "personal" ? "หมวดนี้ปกติเป็นของส่วนตัว ถ้าเป็นของคนเดียวเลือก \"จ่ายส่วนตัว\"" : "🏠 ของบ้าน: อยู่ในแท็บ \"ของบ้าน\""}</span>
      </fieldset>
      {(paidFrom === "dad" || paidFrom === "mom") && (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">{people.get(otherOf(paidFrom)).name}ช่วยจ่ายเท่าไหร่</legend>
          <div className="flex flex-wrap gap-1.5">
            {[0, 0.3, 0.5, 0.7, 1].map((v) => <button type="button" key={v} className="chip" aria-pressed={share === v} onClick={() => setShare(v)}>{v === 0 ? "ไม่ต้อง" : v === 0.5 ? "ครึ่ง 50%" : v === 1 ? "ทั้งหมด" : `${v * 100}%`}</button>)}
            <label className="chip flex items-center gap-1">อื่นๆ<input aria-label="เปอร์เซ็นต์ที่ช่วยจ่าย" className="w-12 bg-transparent text-right outline-none" inputMode="numeric" value={[0, 0.3, 0.5, 0.7, 1].includes(share) ? "" : String(Math.round(share * 100))} placeholder="" onChange={(e) => { const x = Number(e.target.value.replace(/\D/g, "")); if (x >= 0 && x <= 100) setShare(x / 100); }} />%</label>
          </div>
          {n > 0 && <span className="mt-1 block text-xs text-muted">{people.get(otherOf(paidFrom)).name}โอนคืน {baht(n * share)} บาท · {people.get(paidFrom).name}ออกเอง {baht(n * (1 - share))} บาท (คิดในยอดเคลียร์กัน)</span>}
        </fieldset>
      )}
      {n > 0 && <p className="rounded-2xl bg-mint px-3 py-2 text-sm">ต้องเตรียมเดือนละ <b>{baht(monthlySetAside(n, period))} บาท</b>{period === "daily" ? ` (${baht(n)} × 365 วัน ÷ 12)` : ""}</p>}
      {err && <p role="alert" className="text-sm text-rose">{err}</p>}
      <button className="btn-dark">บันทึก</button>
      {bill && (
        <button type="button" className="flex min-h-11 items-center justify-center gap-1 text-sm text-rose" onClick={async () => { await supabase().from("bills").delete().eq("id", bill.id); onDone(); }}>
          <TrashIcon />ลบรายการนี้
        </button>
      )}
    </form>
  );
}
