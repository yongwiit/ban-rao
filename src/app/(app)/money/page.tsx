"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PromptPayQR } from "@/components/PromptPayQR";
import { Goals } from "@/components/Goals";
import { CreditCards, useCards } from "@/components/CreditCards";
import { BillRequests } from "@/components/BillRequests";
import { FixedCosts } from "@/components/FixedCosts";
import { Reorderable, useCollapsed, useSectionOrder } from "@/components/Reorder";
import { activeSub, cardBillsInMonth } from "@/lib/cards";
import { MonthCard } from "@/components/Income";
import { isFund, isSaving } from "@/lib/fund";
import { MonthList, buildMonthItems, cardItemsInMonth } from "@/components/MonthList";
import { confetti } from "@/lib/confetti";
import { play } from "@/lib/sfx";
import { validPromptPay } from "@/lib/promptpay";
import { useHousehold } from "@/components/Household";
import { Sheet } from "@/components/Sheet";
import { Bear, Bunny } from "@/components/Mascots";
import { ChevronIcon, TrashIcon, UploadIcon } from "@/components/Icons";
import { SpendHistory, type Row as HistRow } from "@/components/SpendHistory";
import { ExpenseForm, toDraftTime, type ExpenseDraft } from "@/components/ExpenseForm";
import { isHouseholdSpend } from "@/lib/family";
import { baht, dayKey, monthRange, thaiDate, thaiTime } from "@/lib/format";
import { momOwesDad, myShare } from "@/lib/settle";
import { supabase } from "@/lib/supabase";
import { useLive } from "@/lib/useLive";
import type { BillRow, ExpenseRow, SettlementRow } from "@/lib/types";

export default function MoneyPage() {
  const { household, reloadHousehold, people, userId, role } = useHousehold();
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
  const allShared = useLive<Pick<ExpenseRow, "amount" | "paid_from" | "private" | "other_share">>("expenses", hid, () =>
    supabase().from("expenses").select("amount, paid_from, private, other_share").neq("paid_from", "pot"));
  const settlements = useLive<SettlementRow>("settlements", hid, () => supabase().from("settlements").select("*"));
  const bills = useLive<BillRow>("bills", hid, () => supabase().from("bills").select("*").order("created_at"));

  const shared = month.rows.filter(inScope);
  // รายจ่ายจริง = ไม่รวมเงินออม/ลงทุน และไม่รวมค่าใช้จ่ายรายปีที่จ่ายจากเงินที่กันไว้ทุกเดือน
  // จ่ายจากเงินที่กันไว้ได้ ก็ต่อเมื่อเพิ่มรายการนี้ก่อนเดือนที่ดู (มีเวลากันเงินแล้ว)
  const viewKey = `${ym.y}-${String(ym.m + 1).padStart(2, "0")}`;
  const fundIds = new Set(bills.rows.filter((b) => isFund(b) && (!b.created_at || b.created_at.slice(0, 7) < viewKey)).map((b) => b.id));
  const counted = (e: Pick<ExpenseRow, "category" | "bill_id">) => !isSaving(e.category) && !(e.bill_id && fundIds.has(e.bill_id));
  const total = shared.filter(counted).reduce((s, e) => s + Number(e.amount), 0);
  const deposits = useLive<{ amount: number; who: string }>("savings_deposits", hid, () =>
    supabase().from("savings_deposits").select("amount, who").gte("created_at", start).lt("created_at", end), [start]);
  const saved = shared.filter((e) => isSaving(e.category)).reduce((s, e) => s + Number(e.amount), 0)
    + deposits.rows.filter((d) => scope === "home" || d.who === role).reduce((s, d) => s + Number(d.amount), 0);
  const budget = household.monthly_budget;
  const owe = momOwesDad({
    expenses: allShared.rows.map((e) => ({ ...e, amount: Number(e.amount) })),
    settlements: settlements.rows.map((s) => ({ ...s, amount: Number(s.amount) })),
  });
  const cards = useCards(hid);
  const today = dayKey(now);
  const activeBills = bills.rows.filter((b) => b.active && (scope === "home" ? b.paid_from !== "personal" : b.paid_from === "personal" && b.created_by === userId));
  // แท็บของฉัน: ค่าใช้จ่ายบ้านที่พ่อ/แม่ออกก่อน → แสดงส่วนของฉัน
  const shareBills = scope === "mine" ? bills.rows.filter((b) => b.active && b.period === "monthly" && myShare(b, role) > 0) : [];
  const mySubs = scope === "mine" ? cards.charges.filter((c) => activeSub(c, today)) : [];
  const isThisMonth = ym.y === now.getFullYear() && ym.m === now.getMonth();
  const order = useSectionOrder(scope);
  const collapsed = useCollapsed(scope);
  const ticks = useLive<{ card_id: string; ym: string }>("card_bill_paid", scope === "mine" ? hid : undefined, () => supabase().from("card_bill_paid").select("card_id,ym"));

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

  // แท็บของฉัน: รวมรายการที่รูดบัตรของฉันในกราฟย้อนหลัง (ตามเดือนที่รูด)
  // ส่วนที่เรียกเก็บแล้ว (ยืนยันแล้ว) ถูกจดเป็นรายจ่ายของคนอื่น/ของบ้านไปแล้ว จึงไม่นับซ้ำ
  const mineWeight = (e: HistRow) => mineOnly(e) ? 1 : !e.private && !e.card_charge_id ? myShare(e, role) : 0;
  const myCardList = cards.cards.filter((c) => c.owner === role || c.created_by === userId);
  const cardRows: HistRow[] = scope !== "mine" ? [] : Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - i, 15))
    .flatMap((d) => cardItemsInMonth(myCardList, cards.charges, d.getFullYear(), d.getMonth()))
    .map((it) => ({ amount: it.amount, spent_at: it.at.toISOString(), category: it.category, paid_from: "personal" as const, private: false, created_by: userId, other_share: null, card_charge_id: null }));
  const listItems = buildMonthItems({ scope, rows: month.rows, cardItems: scope === "mine" ? cardItemsInMonth(myCardList, cards.charges, ym.y, ym.m) : [], role, userId, people });
  const listTotal = listItems.reduce((s, i) => s + i.amount, 0);

  // ยอดสรุปตอนซ่อนกล่อง: กล่องค่าใช้จ่าย = ยอดรวม · กล่องที่ต้องจ่าย = ยอดค้าง
  const ymKey = `${ym.y}-${String(ym.m + 1).padStart(2, "0")}`;
  // เดือนหน้า: ยังไม่ถึงกำหนด จึงไม่ใช่ "ค้าง" แต่เป็นยอดที่จะต้องจ่าย
  const isFuture = ym.y * 12 + ym.m > now.getFullYear() * 12 + now.getMonth();
  const owed = (v: number) => (v > 0 ? { summary: `${isFuture ? "ต้องจ่าย" : "ค้าง"} ${baht(v)} บาท`, tone: "due" as const } : { summary: isFuture ? "ไม่มียอดที่ต้องจ่าย" : "ไม่มียอดค้างชำระ", tone: "ok" as const });
  const histTotal = scope === "mine"
    ? month.rows.reduce((s, e) => s + Number(e.amount) * mineWeight(e), 0) + cardRows.filter((r) => dayKey(r.spent_at).slice(0, 7) === ymKey).reduce((s, r) => s + r.amount, 0)
    : total;
  const myCards = cards.cards.filter((c) => c.owner === role || c.created_by === userId);
  // เดือนที่ผ่านไปแล้ว ถือว่าจ่ายครบ (ตรงกับการ์ดบนสุด) ไม่ขึ้นว่าค้าง
  const isPast = ym.y * 12 + ym.m < now.getFullYear() * 12 + now.getMonth();
  const cardDue = isPast ? 0 : cardBillsInMonth(myCards, cards.charges, ym.y, ym.m).filter((b) => !ticks.rows.some((t) => t.card_id === b.card.id && t.ym === ymKey)).reduce((s, b) => s + b.amount, 0);
  const recorded = (id: string) => month.rows.some((e) => e.bill_id === id);
  const fixedDue = isPast ? 0 : activeBills.filter((b) => b.period === "monthly" && !recorded(b.id)).reduce((s, b) => s + Number(b.amount), 0)
    + shareBills.filter((b) => !recorded(b.id)).reduce((s, b) => s + Number(b.amount) * myShare(b, role), 0);

  const sections: Record<string, { label: string; node: React.ReactNode; summary?: string; tone?: "ok" | "due" } | null> = {
    history: { label: "📊 ย้อนหลัง 6 เดือน", summary: `เดือนนี้ใช้ ${baht(histTotal)} บาท`, node: <SpendHistory householdId={hid} extra={cardRows} weight={scope === "mine" ? mineWeight : undefined} note={scope === "mine" ? "นับตามวันที่ใช้/รูดบัตร (ผ่อนนับเดือนละงวด) รวมส่วนของฉันในรายจ่ายบ้านที่พ่อ/แม่ออกก่อน · การ์ดด้านบนนับบิลบัตรตอนจ่าย ตัวเลขจึงอาจไม่เท่ากัน" : undefined} selected={ym} onPick={setYm} budget={budget} budgetOn={scope === "home" && household.budget_enabled} filter={inScope} /> },
    settle: scope !== "home" ? null : { label: "💞 ยอดเคลียร์กัน", ...(owe === 0 ? owed(0) : { summary: `${owe > 0 ? people.get("mom").name : people.get("dad").name}ค้างโอน ${baht(Math.abs(owe))} บาท`, tone: "due" as const }), node: (
      <section className="card flex items-center gap-3">
        {owe >= 0 ? <Bear size={40} /> : <Bunny size={40} />}
        <div className="flex flex-1 flex-col">
          <span className="text-[13px] text-muted">ยอดเคลียร์กัน (ที่ออกก่อน แบ่งตามสัดส่วน)</span>
          <span className="font-semibold">
            {owe === 0 ? "เคลียร์กันครบแล้ว" : owe > 0 ? `${people.get("mom").name}โอนให้${people.get("dad").name} ${baht(owe)} บาท` : `${people.get("dad").name}โอนให้${people.get("mom").name} ${baht(-owe)} บาท`}
          </span>
        </div>
        {owe !== 0 && <button onClick={() => setSettleOpen(true)} className="btn-soft min-h-10 px-3.5 text-[13px]">โอน / เคลียร์</button>}
      </section>
    ) },
    cards: scope !== "mine" ? null : { label: "💳 บัตรเครดิตของฉัน", ...owed(cardDue), node: <CreditCards /> },
    goals: scope !== "home" ? null : { label: "🎯 เป้าหมายออมเงิน", node: <Goals /> },
    fixed: { label: scope === "home" ? "📌 ค่าใช้จ่ายประจำของบ้าน" : "📌 ค่าใช้จ่ายประจำของฉัน", ...owed(fixedDue), node: <FixedCosts scope={scope} bills={activeBills} shareBills={shareBills} subs={mySubs} cardName={Object.fromEntries(cards.cards.map((c) => [c.id, c.name]))} monthRows={month.rows} isThisMonth={isThisMonth} onRecord={setEditing} /> },
    list: { label: "🧾 รายการเดือนนี้", summary: `${listItems.length} รายการ · ${baht(listTotal)} บาท`, node: (
      <MonthList scope={scope} items={listItems} onEdit={edit} onAdd={() => setEditing(newDraft(scope === "home" ? "home" : "food"))} />
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

      <MonthCard scope={scope} spent={total} saved={saved} counted={counted} bills={activeBills} shareBills={shareBills} monthRows={month.rows} ym={ym} onBudget={() => setBudgetOpen(true)} onRecord={setEditing} header={
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button aria-label="เดือนก่อน" onClick={() => shift(-1)} className="flex size-9 items-center justify-center rounded-full bg-white/70"><ChevronIcon dir="left" size={16} /></button>
            <span className="text-sm font-semibold">{thaiDate(new Date(ym.y, ym.m, 15), { month: "long", year: "numeric" })}</span>
            <button aria-label="เดือนถัดไป" onClick={() => shift(1)} className="flex size-9 items-center justify-center rounded-full bg-white/70"><ChevronIcon size={16} /></button>
          </div>
          {scope === "home" && <button onClick={toggleBudget} aria-pressed={household.budget_enabled} className="flex h-8 items-center gap-1.5 rounded-xl bg-white px-2.5 text-[13px]">
            <span className={`relative h-[18px] w-[30px] rounded-full ${household.budget_enabled ? "bg-rose" : "bg-[#C9B8AE]"}`}>
              <span className={`absolute top-0.5 size-3.5 rounded-full bg-white ${household.budget_enabled ? "left-[14px]" : "left-0.5"}`} />
            </span>ใช้งบ
          </button>}
        </div>
      } />

      <Reorderable order={order} sections={sections} collapsed={collapsed} />

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
