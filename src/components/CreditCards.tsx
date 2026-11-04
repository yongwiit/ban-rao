"use client";

import { useState } from "react";
import { useHousehold } from "./Household";
import { Sheet } from "./Sheet";
import { TrashIcon } from "./Icons";
import { CatIcon, CategoryPicker, useCategories } from "./Categories";
import { supabase } from "@/lib/supabase";
import { useLive } from "@/lib/useLive";
import { baht, dayKey, thaiDate } from "@/lib/format";
import { COLORS, softOf } from "@/lib/family";
import { cardSummary, installment, isSub, type CardRow, type ChargeRow } from "@/lib/cards";
import { play } from "@/lib/sfx";

/** บัตรของฉัน + รายการทั้งหมด (ระบบให้เห็นเฉพาะบัตรของตัวเอง) */
export function useCards(hid: string | undefined) {
  const cards = useLive<CardRow>("credit_cards", hid, () => supabase().from("credit_cards").select("*").eq("active", true).order("created_at"));
  const charges = useLive<ChargeRow>("card_charges", hid, () => supabase().from("card_charges").select("*").order("charged_on", { ascending: false }).order("created_at", { ascending: false }));
  return { cards: cards.rows, charges: charges.rows, refresh: () => { cards.refresh(); charges.refresh(); } };
}

const day = (d: Date | string) => thaiDate(d, { day: "numeric", month: "short" });
function daysTo(d: Date, today: string): number {
  const t = new Date(`${today}T00:00:00`);
  return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - t.getTime()) / 864e5);
}
const inDays = (n: number) => (n === 0 ? "วันนี้" : n === 1 ? "พรุ่งนี้" : `อีก ${n} วัน`);
const REPEAT_LABEL = { monthly: "ทุกเดือน", yearly: "ทุกปี" } as const;

/** สถานะเรียกเก็บแบบสั้น */
function billText(c: ChargeRow, name: (k: string) => string): string {
  if (!c.bill_to) return "";
  const who = name(c.bill_to);
  const amt = c.bill_mode === "home" ? "เข้าเงินบ้าน" : `เก็บจาก${who} ${baht(Number(c.bill_amount ?? c.amount))}`;
  const st = c.bill_status === "pending" ? ` · รอ${who}ยืนยัน` : c.bill_status === "accepted" ? ` · ${who}ยืนยันแล้ว ✓` : c.bill_status === "rejected" ? ` · ${who}ปฏิเสธ` : "";
  return ` · ${amt}${st}${c.bill_mode !== "home" && c.bill_paid ? " · ได้เงินแล้ว ✓" : ""}`;
}

/** การ์ดบัตรเครดิตในแท็บ "ของฉัน" */
export function CreditCards() {
  const { household } = useHousehold();
  const { cards, charges, refresh } = useCards(household.id);
  const today = dayKey(new Date());
  const [openId, setOpenId] = useState<string | null>(null);
  const [edit, setEdit] = useState<CardRow | "new" | null>(null);
  const open = cards.find((c) => c.id === openId) ?? null;

  return (
    <section className="card flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-[17px] font-semibold">💳 บัตรเครดิตของฉัน</h2>
        <button onClick={() => setEdit("new")} className="min-h-9 px-1 text-sm text-muted">+ เพิ่มบัตร</button>
      </div>
      {cards.length === 0 && <p className="text-sm text-muted">เพิ่มบัตร ใส่วันตัดรอบกับวันจ่าย แล้วจดว่ารูดอะไรไป (จ่ายเต็ม ผ่อน หรือ subscription รายเดือน/ปี) · บัตรเห็นเฉพาะคุณ ถ้าจะให้อีกฝ่ายช่วยจ่าย กดเรียกเก็บแล้วรอเขายืนยัน</p>}
      {cards.map((card) => {
        const mine = charges.filter((c) => c.card_id === card.id);
        const s = cardSummary(card, mine, today);
        const d = daysTo(s.bill.due, today);
        const pending = mine.filter((c) => c.bill_status === "pending").length;
        return (
          <button key={card.id} onClick={() => setOpenId(card.id)} className="flex flex-col gap-1 rounded-2xl p-3 text-left" style={{ background: softOf(card.color) }}>
            <span className="flex items-center gap-2">
              <span className="h-5 w-8 shrink-0 rounded-md" style={{ background: card.color }} aria-hidden />
              <span className="flex-1 truncate font-semibold">{card.name}{card.last4 ? ` ··${card.last4}` : ""}</span>
              {pending > 0 && <span className="rounded-lg bg-butter px-1.5 py-0.5 text-[11px]">รอยืนยัน {pending}</span>}
            </span>
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-sm">{s.bill.closed ? "ต้องจ่าย" : "บิลรอบถัดไป"} <b className="font-display text-xl">{baht(s.bill.amount)}</b> บาท</span>
              <span className={`shrink-0 rounded-lg px-2 py-0.5 text-xs font-semibold ${s.bill.closed && s.bill.amount > 0 && d <= 3 ? "bg-butter" : "bg-white/70"}`}>จ่าย {day(s.bill.due)} · {inDays(d)}</span>
            </span>
            <span className="text-xs text-muted">
              รอบนี้ใช้ไป {baht(s.cycleAmount)} (ตัด {day(s.cycleEnd)})
              {s.installments.length > 0 ? ` · ผ่อนอยู่ ${s.installments.length} รายการ เดือนละ ${baht(s.monthlyInstallments)}` : ""}
              {s.subs.length > 0 ? ` · subscription ${s.subs.length}` : ""}
              {card.credit_limit ? ` · วงเงินเหลือ ~${baht(Number(card.credit_limit) - s.outstanding)}` : ""}
            </span>
          </button>
        );
      })}
      <Sheet open={!!open} onClose={() => setOpenId(null)} title={open ? `💳 ${open.name}` : ""}>
        {open && <CardDetail key={open.id} card={open} charges={charges.filter((c) => c.card_id === open.id)} today={today} onEditCard={() => { setEdit(open); setOpenId(null); }} refresh={refresh} />}
      </Sheet>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit === "new" ? "เพิ่มบัตรเครดิต" : "แก้บัตร"}>
        {edit && <CardForm key={edit === "new" ? "new" : edit.id} card={edit === "new" ? null : edit} onDone={() => { setEdit(null); refresh(); }} />}
      </Sheet>
    </section>
  );
}

type Filter = "cycle" | "inst" | "sub" | "bill" | "all";

function CardDetail({ card, charges, today, onEditCard, refresh }: { card: CardRow; charges: ChargeRow[]; today: string; onEditCard: () => void; refresh: () => void }) {
  const { people } = useHousehold();
  const cats = useCategories();
  const s = cardSummary(card, charges, today);
  const [filter, setFilter] = useState<Filter>("cycle");
  const [form, setForm] = useState<ChargeRow | "new" | null>(null);
  const owedBy = new Map<string, number>();
  for (const c of charges) {
    if (c.bill_to && c.bill_mode !== "home" && c.bill_status !== "rejected" && !c.bill_paid && !isSub(c)) owedBy.set(c.bill_to, (owedBy.get(c.bill_to) ?? 0) + Number(c.bill_amount ?? c.amount));
  }
  const list = filter === "cycle" ? s.cycleCharges : filter === "inst" ? s.installments : filter === "sub" ? charges.filter(isSub) : filter === "bill" ? charges.filter((c) => c.bill_to) : charges.slice(0, 60);
  const subMonthly = s.subs.reduce((t, c) => t + (c.repeat === "yearly" ? Number(c.amount) / 12 : Number(c.amount)), 0);

  if (form) return (
    <div className="flex flex-col gap-3">
      <button className="self-start text-sm text-muted underline" onClick={() => setForm(null)}>← กลับไปที่บัตร</button>
      <ChargeForm card={card} charge={form === "new" ? null : form} today={today} onDone={() => { setForm(null); refresh(); }} />
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 rounded-3xl p-4" style={{ background: softOf(card.color) }}>
        <span className="text-sm">{s.bill.closed ? `บิลตัดรอบ ${day(s.bill.statement)} ต้องจ่าย` : `บิลรอบถัดไป (ตัด ${day(s.bill.statement)})`}</span>
        <span className="font-display text-3xl font-bold">{baht(s.bill.amount, 2)} <span className="text-base font-medium">บาท</span></span>
        <span className="text-sm">ครบกำหนด {thaiDate(s.bill.due, { weekday: "short", day: "numeric", month: "short" })} · {inDays(daysTo(s.bill.due, today))}</span>
        <span className="mt-1 border-t border-dashed border-cocoa/20 pt-1.5 text-xs">
          รอบที่กำลังใช้ {day(s.cycleStart)} – {day(s.cycleEnd)}: {baht(s.cycleAmount)} บาท
          {s.owedLeft > 0 ? ` · ยอดผ่อนที่ยังเหลือ ${baht(s.owedLeft)} บาท` : ""}
          {subMonthly > 0 ? ` · subscription ~${baht(subMonthly)}/เดือน` : ""}
          {card.credit_limit ? ` · วงเงิน ${baht(Number(card.credit_limit))} เหลือ ~${baht(Number(card.credit_limit) - s.outstanding)}` : ""}
        </span>
        <span className="text-xs text-muted">ตัดรอบทุกวันที่ {card.statement_day} · จ่ายทุกวันที่ {card.due_day}{card.bank ? ` · ${card.bank}` : ""}</span>
      </div>

      {s.cycleByCat.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">รอบนี้ใช้กับอะไร</span>
          {s.cycleByCat.map(([k, v]) => {
            const c = cats.get(k);
            return (
              <span key={k} className="flex items-center gap-2 text-sm">
                <CatIcon icon={c.icon} size={26} />
                <span className="w-24 shrink-0 truncate">{c.label}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-sand"><span className="block h-2 rounded-full" style={{ width: `${s.cycleAmount > 0 ? (v / s.cycleAmount) * 100 : 0}%`, background: card.color }} /></span>
                <span className="w-16 shrink-0 text-right">{baht(v)}</span>
              </span>
            );
          })}
        </div>
      )}

      {owedBy.size > 0 && (
        <div className="flex flex-col gap-1 rounded-2xl bg-sand p-3 text-sm">
          <span className="font-semibold">รอเก็บเงินจากคนในบ้าน</span>
          {[...owedBy].map(([k, v]) => <span key={k} className="flex justify-between"><span>{people.get(k).name}</span><span>{baht(v)} บาท</span></span>)}
        </div>
      )}

      <button className="btn-dark" onClick={() => setForm("new")}>+ จดรายการที่รูดบัตร</button>

      <div className="flex flex-wrap gap-1.5">
        {([["cycle", "รอบนี้"], ["inst", "ผ่อนอยู่"], ["sub", "subscription"], ["bill", "เรียกเก็บ"], ["all", "ทั้งหมด"]] as const).map(([k, label]) => (
          <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>
      <div className="flex flex-col gap-2.5">
        {list.length === 0 && <p className="text-sm text-muted">ยังไม่มีรายการ</p>}
        {list.map((c) => {
          const st = installment(card, c, today);
          const cat = cats.get(c.category);
          const how = isSub(c)
            ? `${REPEAT_LABEL[c.repeat as "monthly" | "yearly"]}${c.ended_on ? ` · เลิกใช้ ${day(c.ended_on)}` : ""}`
            : c.months > 1 ? (st.done ? "ผ่อนครบแล้ว" : `ผ่อน ${st.paid}/${c.months} · เดือนละ ${baht(st.perMonth)}`) : "จ่ายเต็ม";
          return (
            <button key={c.id} onClick={() => setForm(c)} className={`flex items-center gap-2.5 text-left text-sm ${c.ended_on && c.ended_on < today ? "opacity-60" : ""}`}>
              <CatIcon icon={cat.icon} size={36} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-semibold">{c.title}</span>
                <span className="text-xs text-muted">{day(c.charged_on)} · {cat.label} · {how}{billText(c, (k) => people.get(k).name)}</span>
              </span>
              <span className="font-semibold">{baht(Number(c.amount))}</span>
            </button>
          );
        })}
      </div>
      <p className="text-center text-xs text-muted">จดรายการบัตรที่นี่ที่เดียว ไม่ต้องจดซ้ำในรายจ่าย · ยอดบัตรไปรวมในการ์ดเงินเดือนของฉันตอนครบกำหนดจ่าย</p>
      <button className="btn-soft" onClick={onEditCard}>✏️ แก้บัตร</button>
    </div>
  );
}

const MONTH_CHOICES = [3, 4, 6, 10, 12, 24];

function ChargeForm({ card, charge, today, onDone }: { card: CardRow; charge: ChargeRow | null; today: string; onDone: () => void }) {
  const { people, role } = useHousehold();
  const cats = useCategories();
  const [title, setTitle] = useState(charge?.title ?? "");
  const [amount, setAmount] = useState(charge ? String(Number(charge.amount)) : "");
  const [date, setDate] = useState(charge?.charged_on ?? today);
  const [cat, setCat] = useState(charge?.category ?? "food");
  const [months, setMonths] = useState(charge?.months ?? 1);
  const [repeat, setRepeat] = useState<"none" | "monthly" | "yearly">(charge?.repeat ?? "none");
  const [endedOn, setEndedOn] = useState<string | null>(charge?.ended_on ?? null);
  const [billTo, setBillTo] = useState<string | null>(charge?.bill_to ?? null);
  const [mode, setMode] = useState<"home" | "person">(charge?.bill_mode ?? (cats.get(charge?.category ?? "food").scope === "home" ? "home" : "person"));
  const [modeTouched, setModeTouched] = useState(!!charge);
  const [part, setPart] = useState(charge?.bill_amount != null && Number(charge.bill_amount) !== Number(charge.amount));
  const [billAmount, setBillAmount] = useState(charge?.bill_amount ? String(Number(charge.bill_amount)) : "");
  const [paid, setPaid] = useState(charge?.bill_paid ?? false);
  const [notify, setNotify] = useState(true);
  const [note, setNote] = useState(charge?.note ?? "");
  const [nudgeTo, setNudgeTo] = useState<string | null>(charge?.bill_to ?? null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const n = Number(amount.replace(/,/g, ""));
  const toParent = !!billTo && !people.get(billTo).kid;
  const m = toParent ? mode : "person";
  const ba = m === "home" || !part ? n : Number(billAmount.replace(/,/g, ""));
  const billable = people.list.filter((p) => p.key !== card.owner);
  const others = people.list.filter((p) => p.key !== role);
  const billChanged = !charge || billTo !== charge.bill_to || m !== charge.bill_mode || n !== Number(charge.amount)
    || (billTo ? ba : null) !== (charge.bill_amount == null ? null : Number(charge.bill_amount)) || repeat !== (charge.repeat ?? "none") || months !== charge.months || date !== charge.charged_on;
  const who = billTo ? people.get(billTo).name : "";

  async function nudge(id: string, to: string) {
    const { error } = await supabase().from("card_nudges").insert({ charge_id: id, to_who: to });
    return !error;
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setMsg("ใส่ชื่อรายการก่อนนะ");
    if (!(n > 0)) return setMsg("ใส่ยอดเงินให้ถูกต้อง");
    if (billTo && !(ba > 0 && ba <= n)) return setMsg("ยอดที่เรียกเก็บต้องมากกว่า 0 และไม่เกินยอดรายการ");
    if (!(months >= 1 && months <= 60)) return setMsg("ผ่อนได้ 1–60 เดือน");
    setBusy(true); setMsg(null);
    const row = {
      card_id: card.id, title: title.trim(), amount: n, charged_on: date, category: cat, months: repeat === "none" ? months : 1,
      repeat, ended_on: repeat === "none" ? null : endedOn,
      bill_to: billTo, bill_mode: m, bill_amount: billTo ? ba : null, bill_paid: billTo && m === "person" ? paid : false, note: note.trim() || null,
    };
    const res = charge
      ? await supabase().from("card_charges").update(row).eq("id", charge.id).select("id").single()
      : await supabase().from("card_charges").insert(row).select("id").single();
    if (res.error) { setBusy(false); return setMsg("บันทึกไม่ได้ ลองใหม่อีกครั้ง"); }
    // ส่งให้พ่อ/แม่: แจ้งให้กดยืนยันเสมอ · ลูก: แจ้งถ้าเลือก
    if (billTo && billTo !== role && billChanged && (toParent || notify)) await nudge(res.data.id, billTo);
    setBusy(false);
    onDone();
  }
  async function sendNudge() {
    if (!charge || !nudgeTo) return;
    setBusy(true);
    const ok = await nudge(charge.id, nudgeTo);
    setBusy(false);
    if (ok) play("heart");
    setMsg(ok ? `ส่งแจ้งเตือนให้${people.get(nudgeTo).name}แล้ว 🔔` : "เพิ่งส่งไป รอสักครู่แล้วลองใหม่นะ");
  }
  async function remove() {
    if (!charge) return;
    await supabase().from("card_charges").delete().eq("id", charge.id);
    onDone();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <h3 className="font-display text-lg font-semibold">{charge ? "แก้รายการ" : "จดรายการที่รูดบัตร"}</h3>
      <label className="flex flex-col gap-1 text-sm font-medium">รูดซื้ออะไร<input className="field" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น ทีวี, Netflix, ค่าไฟ" /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">{repeat === "none" ? "ยอดทั้งหมด (บาท)" : `ยอด${REPEAT_LABEL[repeat]} (บาท)`}<input className="field min-w-0" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} /></label>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">{repeat === "none" ? "วันที่รูด" : "เริ่มตัดวันที่"}<input className="field min-w-0" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      </div>

      <CategoryPicker value={cat} onChange={(c) => { setCat(c.key); if (!modeTouched) setMode(c.scope === "home" ? "home" : "person"); }} />

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">จ่ายแบบไหน</legend>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="chip" aria-pressed={repeat === "none" && months === 1} onClick={() => { setRepeat("none"); setMonths(1); }}>จ่ายเต็มครั้งเดียว</button>
          <button type="button" className="chip" aria-pressed={repeat === "monthly"} onClick={() => { setRepeat("monthly"); setMonths(1); }}>🔁 ทุกเดือน</button>
          <button type="button" className="chip" aria-pressed={repeat === "yearly"} onClick={() => { setRepeat("yearly"); setMonths(1); }}>🔁 ทุกปี</button>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {MONTH_CHOICES.map((x) => <button type="button" key={x} className="chip" aria-pressed={repeat === "none" && months === x} onClick={() => { setRepeat("none"); setMonths(x); }}>ผ่อน {x} เดือน</button>)}
          <label className="flex items-center gap-1 text-sm">อื่นๆ
            <input className="field min-h-10" style={{ width: 80 }} inputMode="numeric" aria-label="จำนวนเดือนที่ผ่อน" value={repeat !== "none" || MONTH_CHOICES.includes(months) || months === 1 ? "" : String(months)} placeholder="เดือน"
              onChange={(e) => { const v = Number(e.target.value.replace(/\D/g, "")); if (v) { setRepeat("none"); setMonths(Math.min(60, v)); } }} />
          </label>
        </div>
        {repeat !== "none" && (
          <p className="mt-2 rounded-2xl bg-lavender px-3 py-2 text-sm">
            subscription ตัดบัตร{repeat === "monthly" ? `ทุกวันที่ ${Number(date.slice(8))}` : `ทุกปีวันที่ ${day(date)}`} แอปนับเข้าบิลให้เอง ไม่ต้องจดใหม่
            {charge && (endedOn
              ? <> · เลิกใช้ตั้งแต่ {day(endedOn)} <button type="button" className="underline" onClick={() => setEndedOn(null)}>ใช้ต่อ</button></>
              : <> · <button type="button" className="font-semibold underline" onClick={() => setEndedOn(today)}>เลิกใช้ตั้งแต่วันนี้</button></>)}
          </p>
        )}
        {repeat === "none" && months > 1 && n > 0 && (() => {
          const st = installment(card, { id: "", card_id: card.id, title, amount: n, charged_on: date, months, category: null, bill_to: null, bill_amount: null, bill_paid: false, note: null, created_by: "", created_at: "" }, today);
          return <p className="mt-2 rounded-2xl bg-mint px-3 py-2 text-sm">เดือนละ <b>{baht(st.perMonth, 2)} บาท</b> · จ่ายไปแล้ว {st.paid} งวด เหลือ {st.left} งวด · งวดสุดท้าย {thaiDate(st.lastDue, { day: "numeric", month: "short", year: "2-digit" })}</p>;
        })()}
      </fieldset>

      <fieldset className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-3">
        <legend className="sr-only">เรียกเก็บจากคนในบ้าน</legend>
        <span className="text-sm font-medium">เรียกเก็บจากคนในบ้าน</span>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="chip" aria-pressed={billTo === null} onClick={() => setBillTo(null)}>ไม่เรียกเก็บ (ของฉันเอง)</button>
          {billable.map((p) => <button type="button" key={p.key} className="chip" aria-pressed={billTo === p.key} onClick={() => { setBillTo(p.key); setNudgeTo(p.key); }}>{p.name}</button>)}
        </div>
        {billTo && toParent && (
          <div className="flex flex-col gap-1.5">
            <button type="button" aria-pressed={m === "home"} onClick={() => { setMode("home"); setModeTouched(true); }} className={`rounded-2xl border p-2.5 text-left text-sm ${m === "home" ? "border-cocoa bg-peach" : "border-line"}`}>
              <b>🏠 เข้าเงินบ้าน</b><span className="block text-xs text-muted">ค่าใช้จ่ายของบ้าน (เช่น น้ำ ไฟ เน็ต) ฉันออกไปก่อน แล้วหารกันในยอดเคลียร์</span>
            </button>
            <button type="button" aria-pressed={m === "person"} onClick={() => { setMode("person"); setModeTouched(true); }} className={`rounded-2xl border p-2.5 text-left text-sm ${m === "person" ? "border-cocoa bg-peach" : "border-line"}`}>
              <b>🙋 เก็บจาก{who}</b><span className="block text-xs text-muted">เป็นของ{who}เอง นับเป็นรายจ่ายส่วนตัวของ{who}</span>
            </button>
          </div>
        )}
        {billTo && m === "person" && <>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className="chip" aria-pressed={!part} onClick={() => setPart(false)}>เต็มจำนวน{n > 0 ? ` ${baht(n)}` : ""}</button>
            <button type="button" className="chip" aria-pressed={part} onClick={() => setPart(true)}>บางส่วน</button>
          </div>
          {part && <label className="flex flex-col gap-1 text-sm font-medium">เก็บจาก{who} (บาท)
            <input className="field" inputMode="decimal" value={billAmount} onChange={(e) => setBillAmount(e.target.value.replace(/[^\d.,]/g, ""))} placeholder={n > 0 ? `ไม่เกิน ${baht(n)}` : ""} />
            {n > 0 && <span className="flex gap-1.5 pt-1">{[2, 3].map((d) => <button type="button" key={d} className="chip" onClick={() => setBillAmount(String(Math.round((n / d) * 100) / 100))}>หาร {d}</button>)}</span>}
          </label>}
          {months > 1 && ba > 0 && <span className="text-xs text-muted">{who}จ่ายเดือนละ {baht(ba / months, 2)} บาท × {months} เดือน</span>}
          {charge && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-5 accent-cocoa" checked={paid} onChange={(e) => setPaid(e.target.checked)} />ได้รับเงินจาก{who}แล้ว</label>}
        </>}
        {billTo && toParent && (
          <p className="rounded-xl bg-sand px-2.5 py-2 text-xs">
            {charge && !billChanged && charge.bill_status === "accepted" ? `✓ ${who}ยืนยันแล้ว บันทึกเข้า${m === "home" ? "เงินบ้าน" : `รายจ่ายของ${who}`}แล้ว`
              : charge && !billChanged && charge.bill_status === "rejected" ? `✕ ${who}ปฏิเสธรายการนี้ · แก้ยอดหรือแบบแล้วบันทึกเพื่อส่งใหม่`
              : `🔔 ส่งให้${who}กดยืนยันก่อน พอยืนยันแล้วจึงบันทึกเข้า${m === "home" ? "เงินบ้าน" : `รายจ่ายของ${who}`}${repeat !== "none" ? ` และจดให้เอง${REPEAT_LABEL[repeat]}` : ""}`}
          </p>
        )}
        {billTo && !toParent && (!charge || billChanged) && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-5 accent-cocoa" checked={notify} onChange={(e) => setNotify(e.target.checked)} />🔔 ส่งแจ้งเตือนให้{who} (ลูกเห็นแค่ข้อความ ไม่เห็นหน้าบัตร)</label>}
      </fieldset>

      <label className="flex flex-col gap-1 text-sm font-medium">โน้ต<input className="field" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="ไม่ใส่ก็ได้" /></label>
      {msg && <p role="status" className="text-sm">{msg}</p>}
      <button className="btn-dark" disabled={busy}>{busy ? "กำลังบันทึก…" : billTo && toParent && billChanged ? `บันทึกและส่งให้${who}ยืนยัน` : "บันทึก"}</button>

      {charge && others.length > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl bg-white p-3">
          <span className="text-sm font-medium">🔔 แจ้งเตือนคนในบ้านเรื่องรายการนี้</span>
          <div className="flex flex-wrap gap-1.5">
            {others.map((p) => <button type="button" key={p.key} className="chip" aria-pressed={nudgeTo === p.key} onClick={() => setNudgeTo(p.key)}>{p.name}</button>)}
          </div>
          <button type="button" className="btn-soft" disabled={busy || !nudgeTo} onClick={sendNudge}>ส่งแจ้งเตือน{nudgeTo ? `ให้${people.get(nudgeTo).name}` : ""}</button>
        </div>
      )}

      {charge && (confirmDel ? (
        <div className="flex gap-2">
          <button type="button" className="btn-soft flex-1" onClick={() => setConfirmDel(false)}>ไม่ลบ</button>
          <button type="button" className="btn-dark flex-1" onClick={remove}>ลบรายการนี้</button>
        </div>
      ) : <button type="button" className="flex min-h-11 items-center justify-center gap-1 text-sm text-rose" onClick={() => setConfirmDel(true)}><TrashIcon />ลบรายการ</button>)}
    </form>
  );
}

const BANKS = ["กสิกร", "ไทยพาณิชย์", "กรุงเทพ", "กรุงไทย", "กรุงศรี", "ทีทีบี", "ยูโอบี", "ซิตี้", "เคทีซี", "อิออน"];

function CardForm({ card, onDone }: { card: CardRow | null; onDone: () => void }) {
  const { role } = useHousehold();
  const [name, setName] = useState(card?.name ?? "");
  const [bank, setBank] = useState(card?.bank ?? "");
  const [last4, setLast4] = useState(card?.last4 ?? "");
  const [sDay, setSDay] = useState(card ? String(card.statement_day) : "");
  const [dDay, setDDay] = useState(card ? String(card.due_day) : "");
  const [limit, setLimit] = useState(card?.credit_limit ? String(Number(card.credit_limit)) : "");
  const [color, setColor] = useState(card?.color ?? COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const s = Number(sDay), d = Number(dDay), lim = Number(limit.replace(/,/g, ""));
    if (!name.trim()) return setMsg("ตั้งชื่อบัตรก่อนนะ");
    if (!(s >= 1 && s <= 31) || !(d >= 1 && d <= 31)) return setMsg("ใส่วันตัดรอบและวันจ่าย เป็นวันที่ 1–31");
    if (last4 && !/^\d{4}$/.test(last4)) return setMsg("เลขท้ายบัตรใส่ 4 หลัก");
    setBusy(true); setMsg(null);
    // บัตรของใครของมัน: บัตรใหม่เป็นของคนที่เพิ่มเสมอ
    const row = { name: name.trim(), bank: bank.trim() || null, last4: last4 || null, owner: card?.owner ?? role, statement_day: s, due_day: d, credit_limit: lim > 0 ? lim : null, color };
    const { error } = card ? await supabase().from("credit_cards").update(row).eq("id", card.id) : await supabase().from("credit_cards").insert(row);
    setBusy(false);
    if (error) return setMsg("บันทึกไม่ได้ ลองใหม่อีกครั้ง");
    onDone();
  }
  async function retire() {
    if (!card) return;
    await supabase().from("credit_cards").update({ active: false }).eq("id", card.id);
    onDone();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-medium">ชื่อบัตร<input className="field" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น บัตรเที่ยว, บัตรปั๊ม" /></label>
      <label className="flex flex-col gap-1 text-sm font-medium">ธนาคาร (ไม่บังคับ)
        <input className="field" maxLength={40} value={bank} onChange={(e) => setBank(e.target.value)} />
        <span className="flex flex-wrap gap-1.5 pt-1">{BANKS.map((b) => <button type="button" key={b} className="chip" aria-pressed={bank === b} onClick={() => setBank(b)}>{b}</button>)}</span>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">วันตัดรอบ (วันที่)<input className="field min-w-0" type="number" min={1} max={31} value={sDay} onChange={(e) => setSDay(e.target.value)} placeholder="เช่น 25" /></label>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">วันครบกำหนดจ่าย<input className="field min-w-0" type="number" min={1} max={31} value={dDay} onChange={(e) => setDDay(e.target.value)} placeholder="เช่น 10" /></label>
      </div>
      <p className="-mt-1 text-xs text-muted">ดูได้จากใบแจ้งยอดบัตร · ถ้าวันจ่ายน้อยกว่าวันตัดรอบ แอปถือว่าจ่ายเดือนถัดไป</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">เลขท้าย 4 ตัว<input className="field min-w-0" inputMode="numeric" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))} placeholder="ไม่บังคับ" /></label>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">วงเงิน (บาท)<input className="field min-w-0" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="ไม่บังคับ" /></label>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">สีบัตร</legend>
        <div className="flex flex-wrap gap-2">{COLORS.map((c) => <button type="button" key={c} aria-label={`สี ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} className={`size-9 rounded-full ${color === c ? "ring-2 ring-cocoa ring-offset-2" : ""}`} style={{ background: c }} />)}</div>
      </fieldset>
      <p className="text-xs text-muted">🔒 บัตรเห็นเฉพาะคุณ คนอื่นในบ้านไม่เห็นบัตรและรายการ จะเห็นเฉพาะรายการที่คุณส่งไปเรียกเก็บ</p>
      {msg && <p role="alert" className="text-sm text-rose">{msg}</p>}
      <button className="btn-dark" disabled={busy}>{card ? "บันทึก" : "เพิ่มบัตร"}</button>
      {card && (confirmDel ? (
        <div className="flex gap-2">
          <button type="button" className="btn-soft flex-1" onClick={() => setConfirmDel(false)}>ไม่ใช่</button>
          <button type="button" className="btn-dark flex-1" onClick={retire}>เลิกใช้บัตรนี้</button>
        </div>
      ) : <button type="button" className="min-h-11 text-sm text-rose underline" onClick={() => setConfirmDel(true)}>เลิกใช้บัตรนี้ (ซ่อนจากหน้าเงิน)</button>)}
    </form>
  );
}
