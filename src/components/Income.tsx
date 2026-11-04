"use client";

import { useState } from "react";
import { useHousehold } from "./Household";
import { Sheet } from "./Sheet";
import { LockIcon } from "./Icons";
import { useCards } from "./CreditCards";
import { supabase } from "@/lib/supabase";
import { useLive } from "@/lib/useLive";
import { baht, dayKey, thaiDate } from "@/lib/format";
import { cardBillsInMonth, type IncomeRow } from "@/lib/cards";
import { CatIcon, useCategories } from "./Categories";
import type { IconKey } from "@/lib/categoryIcons";
import type { BillRow, ExpenseRow } from "@/lib/types";

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const short = (d: Date) => thaiDate(d, { day: "numeric", month: "short" });

type Reserve = { key: string; date: Date | null; label: string; amount: number; icon: IconKey; note?: string };

/**
 * การ์ด "เดือนนี้": รายได้ (หรืองบ) − ใช้ไปแล้ว − ต้องกันไว้ = เหลือใช้ได้จริง
 * ต้องกันไว้ = ค่าใช้จ่ายประจำรายเดือนที่ยังไม่ได้จด + บิลบัตรที่ยังไม่ถึงวันจ่าย (แท็บของฉัน)
 */
export function MonthCard({ scope, spent, bills, monthRows, ym, header, onBudget }: {
  scope: "home" | "mine"; spent: number; bills: BillRow[]; monthRows: ExpenseRow[]; ym: { y: number; m: number };
  header: React.ReactNode; onBudget: () => void;
}) {
  const { household, people, userId, role } = useHousehold();
  const cats = useCategories();
  const hid = household.id;
  const incomes = useLive<IncomeRow>("incomes", hid, () => supabase().from("incomes").select("*").order("created_at"));
  const { cards, charges } = useCards(scope === "mine" ? hid : undefined);
  const [open, setOpen] = useState(false);
  const now = new Date();
  const todayKey = dayKey(now);
  const isThisMonth = ym.y === now.getFullYear() && ym.m === now.getMonth();
  const isPast = ym.y * 12 + ym.m < now.getFullYear() * 12 + now.getMonth();

  const myIncome = (i: IncomeRow) => i.created_by === userId || i.who === role;
  const inc = incomes.rows.filter((i) => (scope === "home" ? !i.private : myIncome(i)));
  const income = inc.reduce((s, i) => s + Number(i.amount), 0);
  const useBudget = scope === "home" && household.budget_enabled && household.monthly_budget > 0;
  const base = useBudget ? Number(household.monthly_budget) : income;

  // บิลบัตรที่ครบจ่ายเดือนนี้: ถึงวันแล้ว = จ่ายแล้ว, ยังไม่ถึง = ต้องกันไว้
  const myCards = scope === "mine" ? cards.filter((c) => c.owner === role || c.created_by === userId) : [];
  const cardBills = cardBillsInMonth(myCards, charges, ym.y, ym.m);
  const cardPaid = cardBills.filter((b) => isPast || dayKey(b.due) < todayKey).reduce((s, b) => s + b.amount, 0);
  const reserves: Reserve[] = [];
  if (!isPast) {
    for (const b of cardBills) if (dayKey(b.due) >= todayKey || !isThisMonth)
      reserves.push({ key: `card-${b.card.id}`, date: b.due, label: `บิลบัตร ${b.card.name}`, amount: b.amount, icon: "bill" });
    const dim = new Date(ym.y, ym.m + 1, 0).getDate();
    for (const b of bills) {
      if (b.period !== "monthly" || monthRows.some((e) => e.bill_id === b.id)) continue;
      // ถึงวันแล้วแต่ยังไม่จด (ไม่ใช่ยอดไม่คงที่) ถือว่าจ่ายไปก่อนเริ่มใช้แอป ไม่นับ
      if (isThisMonth && !b.variable && b.due_day != null && b.due_day < now.getDate()) continue;
      const c = cats.get(b.category ?? "bill");
      reserves.push({
        key: `bill-${b.id}`, date: b.due_day ? new Date(ym.y, ym.m, Math.min(b.due_day, dim)) : null, label: b.name, amount: Number(b.amount), icon: c.icon,
        note: b.variable ? "ยอดประมาณ" : b.auto_record ? "จดให้อัตโนมัติ" : undefined,
      });
    }
    reserves.sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));
  }
  const reserve = reserves.reduce((s, r) => s + r.amount, 0);
  const used = spent + cardPaid;
  const left = base - used - reserve;
  const daysLeft = isThisMonth ? new Date(ym.y, ym.m + 1, 0).getDate() - now.getDate() + 1 : 0;
  const seg = (v: number) => `${Math.min(100, base > 0 ? (v / base) * 100 : 0)}%`;
  const [showAll, setShowAll] = useState(false);

  return (
    <section className={`card flex flex-col gap-2.5 ${scope === "home" ? "bg-peach" : "bg-lavender"}`}>
      {header}
      {base === 0 ? (
        <>
          <span className="font-display text-[30px] font-bold">{baht(used)} <span className="text-base font-medium">บาท ใช้ไปแล้ว</span></span>
          <button onClick={() => setOpen(true)} className="rounded-2xl bg-white/70 p-3 text-left text-sm">
            {scope === "home" && incomes.rows.some((i) => i.private)
              ? <>รายได้ที่ใส่ไว้ตั้งเป็น &quot;เห็นคนเดียว&quot; จึงไม่รวมในยอดบ้าน · <b className="underline">แตะเพื่อแก้</b> หรือเปิด &quot;ใช้งบ&quot;</>
              : <>💼 <b className="underline">ตั้งเงินเดือน</b> แล้วแอปจะบอกว่าเดือนนี้เหลือใช้ได้จริงกี่บาท หลังกันค่าใช้จ่ายประจำและบิลบัตรไว้แล้ว</>}
          </button>
        </>
      ) : (
        <>
          <div className="flex items-end justify-between gap-2">
            <span className="flex flex-col">
              <span className="text-sm">{isPast ? (left >= 0 ? "เดือนนั้นเหลือ" : "เดือนนั้นใช้เกิน") : left >= 0 ? "เหลือใช้ได้จริง" : "ใช้เกินไปแล้ว"}</span>
              <span className={`font-display text-[32px] font-bold leading-tight ${left < 0 ? "text-rose" : ""}`}>{baht(Math.abs(left))} <span className="text-base font-medium">บาท</span></span>
            </span>
            {isThisMonth && left > 0 && daysLeft > 0 && <span className="mb-1 rounded-xl bg-white/80 px-2.5 py-1 text-sm">วันละ ~<b>{baht(left / daysLeft)}</b> · {daysLeft} วัน</span>}
          </div>
          <span className="flex h-3 overflow-hidden rounded-full bg-white" aria-hidden>
            <span className="block h-3 bg-rose" style={{ width: seg(used) }} />
            <span className="block h-3 bg-[repeating-linear-gradient(45deg,#B49BE0_0_4px,#DCCDF3_4px_8px)]" style={{ width: seg(reserve) }} />
          </span>
          <div className="flex flex-col gap-0.5 text-sm">
            <button onClick={useBudget ? onBudget : () => setOpen(true)} className="flex justify-between text-left">
              <span>{useBudget ? "งบเดือนนี้" : scope === "home" ? "รายได้บ้าน" : "รายได้ของฉัน"} <span className="text-xs text-muted underline">{useBudget ? "ปรับงบ" : "แก้"}</span></span><span>{baht(base)}</span>
            </button>
            <span className="flex justify-between"><span><i className="mr-1.5 inline-block size-2.5 rounded-full bg-rose" />ใช้ไปแล้ว{cardPaid > 0 ? " (รวมบิลบัตรที่จ่ายแล้ว)" : ""}</span><span>− {baht(used)} · {pct(used, base)}%</span></span>
            {reserve > 0 && <span className="flex justify-between"><span><i className="mr-1.5 inline-block size-2.5 rounded-full bg-[#B49BE0]" />ต้องกันไว้</span><span>− {baht(reserve)} · {pct(reserve, base)}%</span></span>}
          </div>
        </>
      )}
      {reserves.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-2xl bg-white/75 p-3">
          <span className="text-sm font-semibold">ต้องกันเงินไว้{isThisMonth ? "เดือนนี้" : ""} {baht(reserve)} บาท</span>
          {(showAll ? reserves : reserves.slice(0, 5)).map((r) => (
            <span key={r.key} className="flex items-center gap-2 text-sm">
              <CatIcon icon={r.icon} size={28} />
              <span className="w-14 shrink-0 text-xs text-muted">{r.date ? short(r.date) : "ในเดือน"}</span>
              <span className="min-w-0 flex-1 truncate">{r.label}{r.note ? <span className="text-xs text-muted"> · {r.note}</span> : null}</span>
              <span className="shrink-0">{baht(r.amount)}</span>
            </span>
          ))}
          {reserves.length > 5 && <button className="self-start text-xs text-muted underline" onClick={() => setShowAll(!showAll)}>{showAll ? "ย่อ" : `ดูอีก ${reserves.length - 5} รายการ`}</button>}
        </div>
      )}
      {scope === "mine" && <span className="text-xs text-muted">นับเฉพาะของคุณ: รายการ &quot;จ่ายส่วนตัว&quot;/&quot;เห็นคนเดียว&quot; บัตรของคุณ และค่าใช้จ่ายประจำส่วนตัว</span>}
      <Sheet open={open} onClose={() => setOpen(false)} title="รายได้ต่อเดือน">
        {open && <IncomeEditor rows={incomes.rows} people={people.list.filter((p) => !p.kid)} onChange={incomes.refresh} />}
      </Sheet>
    </section>
  );
}

const LABELS = ["เงินเดือน", "โบนัส (เฉลี่ยต่อเดือน)", "รายได้เสริม", "ค่าเช่า", "ปันผล"];

function IncomeEditor({ rows, people, onChange }: { rows: IncomeRow[]; people: { key: string; name: string }[]; onChange: () => void }) {
  const { role } = useHousehold();
  const [who, setWho] = useState(role);
  const [label, setLabel] = useState("เงินเดือน");
  const [amount, setAmount] = useState("");
  const [priv, setPriv] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const { people: all } = useHousehold();

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount.replace(/,/g, ""));
    if (!(n > 0)) return setMsg("ใส่ยอดต่อเดือนก่อนนะ");
    const { error } = await supabase().from("incomes").insert({ who, label: label.trim() || "เงินเดือน", amount: n, private: priv });
    if (error) return setMsg("บันทึกไม่ได้ ลองใหม่อีกครั้ง");
    setAmount(""); setPriv(false); onChange();
    setMsg(`เพิ่มแล้ว ✓ ${all.get(who).name} ${baht(n)} บาท/เดือน${priv ? " (เห็นคนเดียว ดูได้ที่แท็บ \"ของฉัน\")" : ""}`);
  }
  async function update(r: IncomeRow, v: string) {
    const n = Number(v.replace(/,/g, ""));
    if (n > 0 && n !== Number(r.amount)) { await supabase().from("incomes").update({ amount: n }).eq("id", r.id); onChange(); }
  }
  async function togglePrivate(r: IncomeRow) {
    await supabase().from("incomes").update({ private: !r.private }).eq("id", r.id);
    onChange();
  }
  async function remove(id: string) {
    await supabase().from("incomes").delete().eq("id", id);
    onChange();
  }

  return (
    <div className="flex flex-col gap-4">
      {rows.length > 0 && (
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-col gap-1.5 rounded-2xl bg-sand p-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-semibold">{all.get(r.who).name} · {r.label}</span>
                <span className="w-32 shrink-0"><input className="field min-h-10 text-right" inputMode="decimal" aria-label={`ยอด${r.label}`} defaultValue={String(Number(r.amount))} onBlur={(e) => update(r, e.target.value)} /></span>
                <button aria-label="ลบ" onClick={() => remove(r.id)} className="min-h-10 px-2 text-muted">✕</button>
              </div>
              <button type="button" onClick={() => togglePrivate(r)} className="flex min-h-9 items-center gap-1.5 self-start text-xs">
                {r.private ? <><LockIcon />เห็นคนเดียว (ไม่รวมในยอดบ้าน) · <b className="underline">แตะเพื่อให้รวมในยอดบ้าน</b></> : <>🏠 รวมในยอดบ้าน · <span className="underline">แตะเพื่อเปลี่ยนเป็นเห็นคนเดียว</span></>}
              </button>
            </div>
          ))}
          <p className="text-xs text-muted">แตะตัวเลขเพื่อแก้ · ใส่เป็นยอดต่อเดือน (หลังหักภาษี/ประกันสังคมจะเห็นภาพจริงกว่า)</p>
        </div>
      )}
      <form onSubmit={add} className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-3">
        <span className="text-sm font-semibold">เพิ่มรายได้</span>
        <div className="flex flex-wrap gap-1.5">{people.map((p) => <button type="button" key={p.key} className="chip" aria-pressed={who === p.key} onClick={() => setWho(p.key)}>{p.name}</button>)}</div>
        <div className="flex flex-wrap gap-1.5">{LABELS.map((l) => <button type="button" key={l} className="chip" aria-pressed={label === l} onClick={() => setLabel(l)}>{l}</button>)}</div>
        <label className="flex flex-col gap-1 text-sm font-medium">ต่อเดือน (บาท)<input className="field" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="เช่น 35000" /></label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-5 accent-cocoa" checked={priv} onChange={(e) => setPriv(e.target.checked)} />
          <LockIcon />เห็นคนเดียว (ไม่รวมในยอดบ้าน ดูได้ที่ &quot;ของฉัน&quot;)
        </label>
        {msg && <p role="status" className={`text-sm ${msg.startsWith("เพิ่มแล้ว") ? "text-[#3F8A5F]" : "text-rose"}`}>{msg}</p>}
        <button className="btn-dark">เพิ่ม</button>
      </form>
    </div>
  );
}
