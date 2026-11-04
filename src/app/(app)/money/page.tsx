"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PromptPayQR } from "@/components/PromptPayQR";
import { Goals } from "@/components/Goals";
import { CreditCards, useCards } from "@/components/CreditCards";
import { BillRequests } from "@/components/BillRequests";
import { FixedCosts, fixedMonthly } from "@/components/FixedCosts";
import { Reorderable, useSectionOrder } from "@/components/Reorder";
import { CatIcon, useCategories } from "@/components/Categories";
import { activeSub, chargeInMonth } from "@/lib/cards";
import { Income } from "@/components/Income";
import { Utilities } from "@/components/Utilities";
import { confetti } from "@/lib/confetti";
import { play } from "@/lib/sfx";
import { validPromptPay } from "@/lib/promptpay";
import { useHousehold } from "@/components/Household";
import { Sheet } from "@/components/Sheet";
import { Bear, Bunny } from "@/components/Mascots";
import { ChevronIcon, LockIcon, TrashIcon, UploadIcon } from "@/components/Icons";
import { SpendHistory } from "@/components/SpendHistory";
import { ExpenseForm, toDraftTime, type ExpenseDraft } from "@/components/ExpenseForm";
import { paidFromLabel, isHouseholdSpend } from "@/lib/family";
import { baht, dayKey, monthRange, thaiDate, thaiTime } from "@/lib/format";
import { momOwesDad } from "@/lib/settle";
import { supabase } from "@/lib/supabase";
import { useLive } from "@/lib/useLive";
import type { BillRow, ExpenseRow, SettlementRow } from "@/lib/types";

export default function MoneyPage() {
  const { household, reloadHousehold, people, userId } = useHousehold();
  const [scope, setScope] = useState<"home" | "mine">("home");
  const mineOnly = (e: Pick<ExpenseRow, "created_by" | "paid_from" | "private">) => e.created_by === userId && (e.paid_from === "personal" || e.private);
  const inScope = scope === "home" ? isHouseholdSpend : mineOnly;
  const hid = household.id;
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const { start, end } = monthRange(ym.y, ym.m);
  const [editing, setEditing] = useState<ExpenseDraft | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  // ปุ่ม "จดเร็ว" จากไอคอนแอป (/money?add=1) เปิดฟอร์มจดรายจ่ายทันที
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("add") !== "1") return;
    const t = new Date();
    window.history.replaceState(null, "", "/money");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditing({ amount: "", date: dayKey(t), time: thaiTime(t), merchant: "", category: "home", paid_from: "pot", private: false, note: "" });
  }, []);

  const month = useLive<ExpenseRow>("expenses", hid, () =>
    supabase().from("expenses").select("*").gte("spent_at", start).lt("spent_at", end).order("spent_at", { ascending: false }), [start]);
  const allShared = useLive<Pick<ExpenseRow, "amount" | "paid_from" | "private">>("expenses", hid, () =>
    supabase().from("expenses").select("amount, paid_from, private").neq("paid_from", "pot"));
  const settlements = useLive<SettlementRow>("settlements", hid, () => supabase().from("settlements").select("*"));
  const bills = useLive<BillRow>("bills", hid, () => supabase().from("bills").select("*").order("created_at"));

  const shared = month.rows.filter(inScope);
  const total = shared.reduce((s, e) => s + Number(e.amount), 0);
  const budget = household.monthly_budget;
  const owe = momOwesDad({
    expenses: allShared.rows.map((e) => ({ ...e, amount: Number(e.amount) })),
    settlements: settlements.rows.map((s) => ({ ...s, amount: Number(s.amount) })),
  });
  const cards = useCards(hid);
  const cats = useCategories();
  const today = dayKey(now);
  const activeBills = bills.rows.filter((b) => b.active && (scope === "home" ? b.paid_from !== "personal" : b.paid_from === "personal" && b.created_by === userId));
  const mySubs = scope === "mine" ? cards.charges.filter((c) => activeSub(c, today)) : [];
  const setAside = fixedMonthly(activeBills, mySubs);
  // บัตรของฉันในแท็บ "ของฉัน": นับค่าน้ำไฟเน็ตที่รูดบัตรเอง (ไม่ได้ส่งไปเรียกเก็บ)
  const cardUtil = (k: string, y: number, m: number) => cards.charges
    .filter((c) => c.category === k && (!c.bill_to || c.bill_status === "rejected"))
    .reduce((s, c) => s + chargeInMonth(c, y, m), 0);
  const isThisMonth = ym.y === now.getFullYear() && ym.m === now.getMonth();
  const order = useSectionOrder(scope);
  // เดือนนี้: ค่าใช้จ่ายประจำรายเดือนที่ยังไม่ได้จด (ยังไม่ถึงวัน หรือยอดไม่คงที่ที่ยังไม่กรอก) นับรวมใน % ไว้ก่อน
  const pendingFixed = isThisMonth ? activeBills.filter((b) => b.period === "monthly" && !month.rows.some((e) => e.bill_id === b.id)
    && (b.variable || b.due_day == null || b.due_day >= now.getDate())).reduce((s, b) => s + Number(b.amount), 0) : 0;
  const daysLeft = new Date(ym.y, ym.m + 1, 0).getDate() - now.getDate() + 1;

  async function toggleBudget() {
    await supabase().from("households").update({ budget_enabled: !household.budget_enabled }).eq("id", hid);
    reloadHousehold();
  }
  async function settle() {
    if (owe === 0) return;
    const amount = Math.abs(owe);
    const row = owe > 0 ? { from_role: "mom", to_role: "dad", amount } : { from_role: "dad", to_role: "mom", amount };
    const { error } = await supabase().from("settlements").insert(row);
    if (!error) { setSettleOpen(false); play("tada"); confetti({ emoji: "💞", count: 26 }); }
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

  const newDraft = (category: string): ExpenseDraft => ({ amount: "", date: dayKey(now), time: thaiTime(now), merchant: "", category, paid_from: scope === "home" ? "pot" : "personal", private: false, note: "" });
  const list = month.rows.filter((e) => (scope === "home" ? !(e.paid_from === "personal" && e.created_by !== userId) : mineOnly(e)));

  const sections: Record<string, { label: string; node: React.ReactNode } | null> = {
    income: { label: "💼 รายได้ & ใช้ไปกี่ %", node: <Income scope={scope} spent={total} setAside={setAside} ym={ym} pendingFixed={pendingFixed} /> },
    history: { label: "📊 ย้อนหลัง 6 เดือน", node: <SpendHistory householdId={hid} selected={ym} onPick={setYm} budget={budget} budgetOn={scope === "home" && household.budget_enabled} filter={inScope} /> },
    settle: scope !== "home" ? null : { label: "💞 ยอดเคลียร์กัน", node: (
      <section className="card flex items-center gap-3">
        {owe >= 0 ? <Bear size={40} /> : <Bunny size={40} />}
        <div className="flex flex-1 flex-col">
          <span className="text-[13px] text-muted">ยอดเคลียร์กัน (ที่ออกก่อน แบ่งครึ่ง)</span>
          <span className="font-semibold">
            {owe === 0 ? "เคลียร์กันครบแล้ว" : owe > 0 ? `${people.get("mom").name}โอนให้${people.get("dad").name} ${baht(owe)} บาท` : `${people.get("dad").name}โอนให้${people.get("mom").name} ${baht(-owe)} บาท`}
          </span>
        </div>
        {owe !== 0 && <button onClick={() => setSettleOpen(true)} className="btn-soft min-h-10 px-3.5 text-[13px]">โอน / เคลียร์</button>}
      </section>
    ) },
    cards: scope !== "mine" ? null : { label: "💳 บัตรเครดิตของฉัน", node: <CreditCards /> },
    goals: scope !== "home" ? null : { label: "🎯 เป้าหมายออมเงิน", node: <Goals /> },
    fixed: { label: "📌 ค่าใช้จ่ายประจำ", node: <FixedCosts scope={scope} bills={activeBills} subs={mySubs} monthRows={month.rows} isThisMonth={isThisMonth} onRecord={setEditing} /> },
    utilities: { label: "💡 ค่าน้ำ ไฟ เน็ต", node: <Utilities ym={ym} filter={inScope} onAdd={(category) => setEditing(newDraft(category))} extra={scope === "mine" ? cardUtil : undefined} /> },
    list: { label: "🧾 รายการเดือนนี้", node: (
      <section className="card flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-[17px] font-semibold">รายการเดือนนี้</h2>
          <button onClick={() => setEditing(newDraft(scope === "home" ? "home" : "food"))} className="min-h-9 px-1 text-sm text-muted">+ จดเอง</button>
        </div>
        {list.length === 0 && <p className="text-sm text-muted">ยังไม่มีรายการ</p>}
        {list.map((e) => {
          const cat = cats.get(e.category);
          return (
            <button key={e.id} onClick={() => edit(e)} className="flex items-center gap-2.5 text-left text-sm">
              <span className="relative">
                <CatIcon icon={cat.icon} size={36} />
                {e.private && <span className="absolute -bottom-1 -right-1 rounded-full bg-white p-0.5"><LockIcon size={12} /></span>}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-semibold">{e.merchant || cat.label}</span>
                <span className="text-xs text-muted">{thaiDate(e.spent_at, { day: "numeric", month: "short" })} {thaiTime(e.spent_at)} · {cat.label} · {paidFromLabel(e.paid_from, people)}{e.slip_ref ? ` · สลิป${e.bank ? ` ${e.bank}` : ""} …${e.slip_ref.slice(-4)}` : ""}{e.private ? " · เห็นคนเดียว" : ""}{e.note === "หักอัตโนมัติ" ? " · หักอัตโนมัติ" : ""}{e.paid_from === "personal" && scope === "home" ? " · ไม่นับในยอดบ้าน" : ""}</span>
              </span>
              {e.status === "pending" && <span className="rounded-lg bg-butter px-2 py-0.5 text-[11px] font-semibold">รอตรวจ</span>}
              <span className="font-semibold">{baht(Number(e.amount))}</span>
            </button>
          );
        })}
      </section>
    ) },
  };

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-[26px] font-bold">{scope === "home" ? "เงินบ้านเรา" : "เงินของฉัน"}</h1>
        <Link href="/slip" className="btn-dark min-h-11 px-4 text-sm"><UploadIcon />อัปโหลดสลิป</Link>
      </header>

      <div className="grid grid-cols-2 gap-1 rounded-full bg-white p-1" role="tablist" aria-label="ดูเงินของ">
        {([["home", "🏠 ของบ้าน"], ["mine", "🙋 ของฉัน"]] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={scope === k} onClick={() => setScope(k)} className={`min-h-10 rounded-full text-sm font-semibold ${scope === k ? "bg-cocoa text-cream" : "text-muted"}`}>{label}</button>
        ))}
      </div>

      <BillRequests />

      <section className={`card flex flex-col gap-2 ${scope === "home" ? "bg-peach" : "bg-lavender"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button aria-label="เดือนก่อน" onClick={() => shift(-1)} className="flex size-9 items-center justify-center rounded-full bg-white/70"><ChevronIcon dir="left" size={16} /></button>
            <span className="text-sm">{thaiDate(new Date(ym.y, ym.m, 15), { month: "long", year: "numeric" })} ใช้ไป</span>
            <button aria-label="เดือนถัดไป" onClick={() => shift(1)} className="flex size-9 items-center justify-center rounded-full bg-white/70"><ChevronIcon size={16} /></button>
          </div>
          {scope === "home" && <button onClick={toggleBudget} aria-pressed={household.budget_enabled} className="flex h-8 items-center gap-1.5 rounded-xl bg-white px-2.5 text-[13px]">
            <span className={`relative h-[18px] w-[30px] rounded-full ${household.budget_enabled ? "bg-rose" : "bg-[#C9B8AE]"}`}>
              <span className={`absolute top-0.5 size-3.5 rounded-full bg-white ${household.budget_enabled ? "left-[14px]" : "left-0.5"}`} />
            </span>ใช้งบ
          </button>}
        </div>
        <span className="font-display text-[30px] font-bold">{baht(total)} <span className="text-base font-medium">บาท</span></span>
        {scope === "mine" && <span className="text-xs text-muted">รายการที่คุณจดเป็น &quot;จ่ายส่วนตัว&quot; หรือ &quot;เห็นคนเดียว&quot; · ไม่นับรวมในยอดบ้าน</span>}
        {scope === "home" && household.budget_enabled && (
          <button onClick={() => setBudgetOpen(true)} className="flex flex-col gap-1 text-left">
            <span className="h-2.5 overflow-hidden rounded-full bg-white"><span className="block h-2.5 bg-rose" style={{ width: `${Math.min(100, budget ? (total / budget) * 100 : 0)}%` }} /></span>
            <span className="text-xs">
              งบ {baht(budget)} · {total <= budget ? `เหลือ ${baht(budget - total)} บาท` : `เกินงบ ${baht(total - budget)} บาท`}
              {isThisMonth && total <= budget ? ` สำหรับ ${daysLeft} วัน` : ""} · <b className="underline">ปรับงบ</b>
            </span>
          </button>
        )}
      </section>

      <Reorderable order={order} sections={sections} />

      <Sheet open={settleOpen} onClose={() => setSettleOpen(false)} title="เคลียร์เงินกัน">
        {(() => {
          const to = people.get(owe > 0 ? "dad" : "mom"), from = people.get(owe > 0 ? "mom" : "dad");
          return (
            <div className="flex flex-col gap-3">
              <p className="text-sm">{from.name}โอนให้{to.name} <b>{baht(Math.abs(owe), 2)} บาท</b></p>
              {validPromptPay(to.promptpay)
                ? <PromptPayQR id={to.promptpay} amount={Math.abs(owe)} name={to.name} />
                : <p className="rounded-2xl bg-sand p-3 text-sm">อยากได้ QR สำหรับสแกนโอน ให้{to.name}ใส่พร้อมเพย์ที่ <Link href="/settings" className="font-semibold underline">ตั้งค่า → คนในบ้าน</Link></p>}
              <button className="btn-dark" onClick={settle}>โอนแล้ว · เคลียร์ยอด</button>
              <p className="text-center text-xs text-muted">กดหลังโอนเสร็จในแอปธนาคาร ยอดจะกลับเป็น 0</p>
            </div>
          );
        })()}
      </Sheet>

      <Link href="/settings" className="text-center text-sm text-muted underline">ชวนเข้าบ้าน · จดผ่าน LINE อยู่ในหน้าตั้งค่า</Link>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "แก้รายการ" : editing?.bill_id ? `จด${editing.merchant}เดือนนี้` : "จดรายจ่าย"}>
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

      <Sheet open={budgetOpen} onClose={() => setBudgetOpen(false)} title="งบต่อเดือน">
        <BudgetForm key={budget} current={budget} onDone={async () => { await reloadHousehold(); setBudgetOpen(false); }} householdId={hid} />
      </Sheet>
    </div>
  );
}

function BudgetForm({ current, onDone, householdId }: { current: number; onDone: () => void; householdId: string }) {
  const [v, setV] = useState(Math.round(current));
  const max = Math.max(100000, Math.ceil(v / 10000) * 10000);
  const step = (n: number) => setV((x) => Math.max(0, x + n));
  return (
    <form className="flex flex-col gap-4" onSubmit={async (e) => {
      e.preventDefault();
      await supabase().from("households").update({ monthly_budget: v }).eq("id", householdId);
      onDone();
    }}>
      <p className="text-center font-display text-4xl font-bold">{baht(v)} <span className="text-base font-medium">บาท</span></p>
      <label className="flex flex-col gap-2 text-sm font-medium">
        <span className="sr-only">เลื่อนเพื่อปรับงบ</span>
        <input type="range" min={0} max={max} step={500} value={v} onChange={(e) => setV(Number(e.target.value))} className="budget-range w-full" />
        <span className="flex justify-between text-xs text-muted"><span>0</span><span>{baht(max / 2)}</span><span>{baht(max)}</span></span>
      </label>
      <div className="grid grid-cols-4 gap-2">
        {[-1000, -500, 500, 1000].map((n) => (
          <button type="button" key={n} className="btn-soft min-h-11 px-0 text-sm" onClick={() => step(n)}>{n > 0 ? "+" : "−"}{baht(Math.abs(n))}</button>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">หรือพิมพ์ตัวเลข
        <input className="field" inputMode="numeric" value={String(v)} onChange={(e) => setV(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)} />
      </label>
      <button className="btn-dark">บันทึกงบ</button>
    </form>
  );
}
