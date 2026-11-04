"use client";

import Link from "next/link";
import { useState } from "react";
import { useHousehold } from "@/components/Household";
import { Sheet } from "@/components/Sheet";
import { Bear, Bunny } from "@/components/Mascots";
import { ChevronIcon, LockIcon, TrashIcon, UploadIcon } from "@/components/Icons";
import { ExpenseForm, toDraftTime, type ExpenseDraft } from "@/components/ExpenseForm";
import { BILL_PERIODS, CATEGORIES, PAID_FROM, PEOPLE, monthlySetAside, type BillPeriod } from "@/lib/family";
import { baht, dayKey, monthRange, thaiDate, thaiTime } from "@/lib/format";
import { momOwesDad } from "@/lib/settle";
import { supabase } from "@/lib/supabase";
import { useLive } from "@/lib/useLive";
import type { BillRow, ExpenseRow, SettlementRow } from "@/lib/types";

export default function MoneyPage() {
  const { household, reloadHousehold, signOut } = useHousehold();
  const hid = household.id;
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const { start, end } = monthRange(ym.y, ym.m);
  const [editing, setEditing] = useState<ExpenseDraft | null>(null);
  const [billOpen, setBillOpen] = useState<BillRow | "new" | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);

  const month = useLive<ExpenseRow>("expenses", hid, () =>
    supabase().from("expenses").select("*").gte("spent_at", start).lt("spent_at", end).order("spent_at", { ascending: false }), [start]);
  const allShared = useLive<Pick<ExpenseRow, "amount" | "paid_from" | "private">>("expenses", hid, () =>
    supabase().from("expenses").select("amount, paid_from, private").neq("paid_from", "pot"));
  const settlements = useLive<SettlementRow>("settlements", hid, () => supabase().from("settlements").select("*"));
  const bills = useLive<BillRow>("bills", hid, () => supabase().from("bills").select("*").order("created_at"));

  const shared = month.rows.filter((e) => !e.private);
  const total = shared.reduce((s, e) => s + Number(e.amount), 0);
  const budget = household.monthly_budget;
  const owe = momOwesDad({
    expenses: allShared.rows.map((e) => ({ ...e, amount: Number(e.amount) })),
    settlements: settlements.rows.map((s) => ({ ...s, amount: Number(s.amount) })),
  });
  const activeBills = bills.rows.filter((b) => b.active);
  const setAside = activeBills.reduce((s, b) => s + monthlySetAside(Number(b.amount), b.period), 0);
  const isThisMonth = ym.y === now.getFullYear() && ym.m === now.getMonth();
  const daysLeft = new Date(ym.y, ym.m + 1, 0).getDate() - now.getDate() + 1;

  async function toggleBudget() {
    await supabase().from("households").update({ budget_enabled: !household.budget_enabled }).eq("id", hid);
    reloadHousehold();
  }
  async function settle() {
    if (owe === 0) return;
    const amount = Math.abs(owe);
    const row = owe > 0 ? { from_role: "mom", to_role: "dad", amount } : { from_role: "dad", to_role: "mom", amount };
    await supabase().from("settlements").insert(row);
  }
  function shift(n: number) {
    const d = new Date(ym.y, ym.m + n, 1);
    setYm({ y: d.getFullYear(), m: d.getMonth() });
  }
  function edit(e: ExpenseRow) {
    setEditing({
      id: e.id, amount: String(Number(e.amount)), ...toDraftTime(e.spent_at), merchant: e.merchant,
      category: e.category, paid_from: e.paid_from, private: e.private, note: e.note ?? "", slip_ref: e.slip_ref, bank: e.bank,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-[26px] font-bold">เงินบ้านเรา</h1>
        <Link href="/slip" className="btn-dark min-h-11 px-4 text-sm"><UploadIcon />อัปโหลดสลิป</Link>
      </header>

      <section className="card flex flex-col gap-2 bg-peach">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button aria-label="เดือนก่อน" onClick={() => shift(-1)} className="flex size-9 items-center justify-center rounded-full bg-white/70"><ChevronIcon dir="left" size={16} /></button>
            <span className="text-sm">{thaiDate(new Date(ym.y, ym.m, 15), { month: "long", year: "numeric" })} ใช้ไป</span>
            <button aria-label="เดือนถัดไป" onClick={() => shift(1)} className="flex size-9 items-center justify-center rounded-full bg-white/70"><ChevronIcon size={16} /></button>
          </div>
          <button onClick={toggleBudget} aria-pressed={household.budget_enabled} className="flex h-8 items-center gap-1.5 rounded-xl bg-white px-2.5 text-[13px]">
            <span className={`relative h-[18px] w-[30px] rounded-full ${household.budget_enabled ? "bg-rose" : "bg-[#C9B8AE]"}`}>
              <span className={`absolute top-0.5 size-3.5 rounded-full bg-white ${household.budget_enabled ? "left-[14px]" : "left-0.5"}`} />
            </span>ใช้งบ
          </button>
        </div>
        <span className="font-display text-[30px] font-bold">{baht(total)} <span className="text-base font-medium">บาท</span></span>
        {household.budget_enabled && (
          <button onClick={() => setBudgetOpen(true)} className="flex flex-col gap-1 text-left">
            <span className="h-2.5 overflow-hidden rounded-full bg-white"><span className="block h-2.5 bg-rose" style={{ width: `${Math.min(100, budget ? (total / budget) * 100 : 0)}%` }} /></span>
            <span className="text-xs">
              งบ {baht(budget)} · {total <= budget ? `เหลือ ${baht(budget - total)} บาท` : `เกินงบ ${baht(total - budget)} บาท`}
              {isThisMonth && total <= budget ? ` สำหรับ ${daysLeft} วัน` : ""} · แตะเพื่อแก้งบ
            </span>
          </button>
        )}
      </section>

      <section className="card flex items-center gap-3">
        {owe >= 0 ? <Bear size={40} /> : <Bunny size={40} />}
        <div className="flex flex-1 flex-col">
          <span className="text-[13px] text-muted">ยอดเคลียร์กัน (ที่ออกก่อน แบ่งครึ่ง)</span>
          <span className="font-semibold">
            {owe === 0 ? "เคลียร์กันครบแล้ว" : owe > 0 ? `${PEOPLE.mom.name}โอนให้${PEOPLE.dad.name} ${baht(owe)} บาท` : `${PEOPLE.dad.name}โอนให้${PEOPLE.mom.name} ${baht(-owe)} บาท`}
          </span>
        </div>
        {owe !== 0 && <button onClick={settle} className="btn-soft min-h-10 px-3.5 text-[13px]">เคลียร์แล้ว</button>}
      </section>

      <section className="card flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-[17px] font-semibold">บิลประจำ & เงินเก็บต่อเดือน</h2>
          <button onClick={() => setBillOpen("new")} className="min-h-9 px-1 text-sm text-muted">+ เพิ่ม</button>
        </div>
        {activeBills.length === 0 && <p className="text-sm text-muted">เพิ่มบิล เช่น ค่าไฟ ประกันรถ ค่าเทอม แล้วแอปจะคำนวณว่าต้องเก็บเดือนละเท่าไร</p>}
        {activeBills.map((b) => (
          <button key={b.id} onClick={() => setBillOpen(b)} className="flex min-h-8 items-center justify-between text-left text-sm">
            <span>{b.name} <span className="text-muted">· {b.period === "monthly" ? "ทุกเดือน" : `${baht(Number(b.amount))}/${b.period === "yearly" ? "ปี" : "เทอม"}`}{b.due_day ? ` · วันที่ ${b.due_day}` : ""}</span></span>
            <span>{baht(monthlySetAside(Number(b.amount), b.period))}</span>
          </button>
        ))}
        {activeBills.length > 0 && (
          <div className="flex items-center justify-between border-t border-dashed border-line pt-2 font-semibold">
            <span>ต้องเก็บเดือนละ</span><span className="font-display text-lg">{baht(setAside)} บาท</span>
          </div>
        )}
      </section>

      <section className="card flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-[17px] font-semibold">รายการเดือนนี้</h2>
          <button onClick={() => setEditing({ amount: "", date: dayKey(now), time: thaiTime(now), merchant: "", category: "home", paid_from: "pot", private: false, note: "" })} className="min-h-9 px-1 text-sm text-muted">+ จดเอง</button>
        </div>
        {month.rows.length === 0 && <p className="text-sm text-muted">ยังไม่มีรายการ</p>}
        {month.rows.map((e) => (
          <button key={e.id} onClick={() => edit(e)} className="flex items-center gap-2.5 text-left text-sm">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-mint">{e.private ? <LockIcon size={16} /> : <span className="text-xs font-semibold">{CATEGORIES[e.category].slice(0, 2)}</span>}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold">{e.merchant || CATEGORIES[e.category]}</span>
              <span className="text-xs text-muted">{thaiDate(e.spent_at, { day: "numeric", month: "short" })} · {PAID_FROM[e.paid_from]}{e.slip_ref ? " · จากสลิป" : ""}{e.private ? " · เห็นคนเดียว" : ""}</span>
            </span>
            {e.status === "pending" && <span className="rounded-lg bg-butter px-2 py-0.5 text-[11px] font-semibold">รอตรวจ</span>}
            <span className="font-semibold">{baht(Number(e.amount))}</span>
          </button>
        ))}
      </section>

      <button onClick={signOut} className="mt-2 min-h-11 text-sm text-muted underline">ออกจากระบบ · รหัสบ้าน {household.join_code}</button>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "แก้รายการ" : "จดรายจ่าย"}>
        {editing && (
          <>
            <ExpenseForm key={editing.id ?? "new"} initial={editing} submitLabel={editing.id ? "บันทึก" : "จดรายจ่าย"} onSaved={() => { setEditing(null); month.refresh(); }} />
            {editing.id && (
              <button className="mt-3 flex min-h-11 w-full items-center justify-center gap-1 text-sm text-rose" onClick={async () => {
                if (!confirm("ลบรายการนี้?")) return;
                await supabase().from("expenses").delete().eq("id", editing.id!);
                setEditing(null);
              }}><TrashIcon />ลบรายการ</button>
            )}
          </>
        )}
      </Sheet>

      <Sheet open={!!billOpen} onClose={() => setBillOpen(null)} title={billOpen === "new" ? "เพิ่มบิลประจำ" : "แก้บิล"}>
        {billOpen && <BillForm key={billOpen === "new" ? "new" : billOpen.id} bill={billOpen === "new" ? null : billOpen} onDone={() => setBillOpen(null)} />}
      </Sheet>

      <Sheet open={budgetOpen} onClose={() => setBudgetOpen(false)} title="งบต่อเดือน">
        <BudgetForm current={budget} onDone={async () => { await reloadHousehold(); setBudgetOpen(false); }} householdId={hid} />
      </Sheet>
    </div>
  );
}

function BillForm({ bill, onDone }: { bill: BillRow | null; onDone: () => void }) {
  const [name, setName] = useState(bill?.name ?? "");
  const [amount, setAmount] = useState(bill ? String(Number(bill.amount)) : "");
  const [period, setPeriod] = useState<BillPeriod>(bill?.period ?? "monthly");
  const [due, setDue] = useState(bill?.due_day ? String(bill.due_day) : "");
  const [err, setErr] = useState<string | null>(null);
  const n = Number(amount.replace(/,/g, ""));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!(n > 0)) return setErr("ใส่ยอดเงินให้ถูกต้อง");
    const row = { name: name.trim(), amount: n, period, due_day: due ? Number(due) : null };
    const { error } = bill ? await supabase().from("bills").update(row).eq("id", bill.id) : await supabase().from("bills").insert(row);
    if (error) return setErr(error.message);
    onDone();
  }
  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-medium">ชื่อบิล<input className="field" required value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ประกันรถ" /></label>
      <label className="flex flex-col gap-1 text-sm font-medium">ยอดต่อครั้ง (บาท)<input className="field" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">จ่ายบ่อยแค่ไหน</legend>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(BILL_PERIODS) as BillPeriod[]).map((p) => <button type="button" key={p} className="chip" aria-pressed={period === p} onClick={() => setPeriod(p)}>{BILL_PERIODS[p].label}</button>)}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1 text-sm font-medium">ครบกำหนดวันที่ (ไม่ใส่ก็ได้)<input className="field" type="number" min={1} max={31} value={due} onChange={(e) => setDue(e.target.value)} /></label>
      {n > 0 && <p className="rounded-2xl bg-mint px-3 py-2 text-sm">ต้องเก็บเดือนละ <b>{baht(monthlySetAside(n, period))} บาท</b></p>}
      {err && <p role="alert" className="text-sm text-rose">{err}</p>}
      <button className="btn-dark">บันทึกบิล</button>
      {bill && (
        <button type="button" className="flex min-h-11 items-center justify-center gap-1 text-sm text-rose" onClick={async () => { await supabase().from("bills").delete().eq("id", bill.id); onDone(); }}>
          <TrashIcon />ลบบิล
        </button>
      )}
    </form>
  );
}

function BudgetForm({ current, onDone, householdId }: { current: number; onDone: () => void; householdId: string }) {
  const [v, setV] = useState(String(current));
  return (
    <form className="flex flex-col gap-3" onSubmit={async (e) => {
      e.preventDefault();
      const n = Number(v.replace(/,/g, ""));
      if (n >= 0) { await supabase().from("households").update({ monthly_budget: n }).eq("id", householdId); onDone(); }
    }}>
      <label className="flex flex-col gap-1 text-sm font-medium">งบต่อเดือน (บาท)<input className="field" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} /></label>
      <button className="btn-dark">บันทึกงบ</button>
    </form>
  );
}
