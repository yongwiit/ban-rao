"use client";

import { useState } from "react";
import { useHousehold } from "./Household";
import { Sheet } from "./Sheet";
import { LockIcon, TrashIcon } from "./Icons";
import { supabase } from "@/lib/supabase";
import { useLive } from "@/lib/useLive";
import { baht, dayKey, thaiDate } from "@/lib/format";
import { COLORS, softOf } from "@/lib/family";
import { cardSummary, installment, type CardRow, type ChargeRow } from "@/lib/cards";
import { play } from "@/lib/sfx";

/** บัตรที่ใช้อยู่ + รายการทั้งหมด (ใช้ร่วมกับการ์ดเงินเดือน) */
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
/** ยอดที่ยังไม่ได้จ่าย (รวมงวดที่ยังไม่ถึงวันจ่าย) */
function outstanding(card: CardRow, charges: ChargeRow[], today: string) {
  return charges.reduce((s, c) => { const st = installment(card, c, today); return s + st.perMonth * st.left; }, 0);
}

/** การ์ดบัตรเครดิตในหน้าเงิน (เฉพาะพ่อแม่) */
export function CreditCards() {
  const { household, people } = useHousehold();
  const { cards, charges, refresh } = useCards(household.id);
  const today = dayKey(new Date());
  const [openId, setOpenId] = useState<string | null>(null);
  const [edit, setEdit] = useState<CardRow | "new" | null>(null);
  const open = cards.find((c) => c.id === openId) ?? null;

  return (
    <section className="card flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-[17px] font-semibold">💳 บัตรเครดิต</h2>
        <button onClick={() => setEdit("new")} className="min-h-9 px-1 text-sm text-muted">+ เพิ่มบัตร</button>
      </div>
      {cards.length === 0 && <p className="text-sm text-muted">เพิ่มบัตร ใส่วันตัดรอบกับวันครบกำหนดจ่าย แล้วจดว่ารูดอะไรไป (จ่ายเต็มหรือผ่อนกี่เดือน) แอปจะบอกยอดที่ต้องจ่ายแต่ละรอบ งวดที่เหลือ และเรียกเก็บจากคนในบ้านได้</p>}
      {cards.map((card) => {
        const mine = charges.filter((c) => c.card_id === card.id);
        const s = cardSummary(card, mine, today);
        const d = daysTo(s.bill.due, today);
        const owner = people.get(card.owner);
        return (
          <button key={card.id} onClick={() => setOpenId(card.id)} className="flex flex-col gap-1 rounded-2xl p-3 text-left" style={{ background: softOf(card.color) }}>
            <span className="flex items-center gap-2">
              <span className="h-5 w-8 shrink-0 rounded-md" style={{ background: card.color }} aria-hidden />
              <span className="flex-1 truncate font-semibold">{card.name}{card.last4 ? ` ··${card.last4}` : ""}</span>
              {card.private && <LockIcon />}
              <span className="text-xs text-muted">{owner.name}</span>
            </span>
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-sm">{s.bill.closed ? "ต้องจ่าย" : "บิลรอบถัดไป"} <b className="font-display text-xl">{baht(s.bill.amount)}</b> บาท</span>
              <span className={`shrink-0 rounded-lg px-2 py-0.5 text-xs font-semibold ${s.bill.closed && s.bill.amount > 0 && d <= 3 ? "bg-butter" : "bg-white/70"}`}>จ่าย {day(s.bill.due)} · {inDays(d)}</span>
            </span>
            <span className="text-xs text-muted">
              รอบนี้ใช้ไป {baht(s.cycleAmount)} (ตัด {day(s.cycleEnd)})
              {s.installments.length > 0 ? ` · ผ่อนอยู่ ${s.installments.length} รายการ เดือนละ ${baht(s.monthlyInstallments)}` : ""}
              {card.credit_limit ? ` · วงเงินเหลือ ~${baht(Number(card.credit_limit) - outstanding(card, mine, today))}` : ""}
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

type Filter = "cycle" | "inst" | "bill" | "all";

function CardDetail({ card, charges, today, onEditCard, refresh }: { card: CardRow; charges: ChargeRow[]; today: string; onEditCard: () => void; refresh: () => void }) {
  const { people } = useHousehold();
  const s = cardSummary(card, charges, today);
  const [filter, setFilter] = useState<Filter>("cycle");
  const [form, setForm] = useState<ChargeRow | "new" | null>(null);
  const billed = charges.filter((c) => c.bill_to && c.bill_amount && !c.bill_paid);
  const owedBy = new Map<string, number>();
  for (const c of billed) owedBy.set(c.bill_to!, (owedBy.get(c.bill_to!) ?? 0) + Number(c.bill_amount));
  const list = filter === "cycle" ? s.cycleCharges : filter === "inst" ? s.installments : filter === "bill" ? charges.filter((c) => c.bill_to) : charges.slice(0, 60);

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
          {card.credit_limit ? ` · วงเงิน ${baht(Number(card.credit_limit))} เหลือ ~${baht(Number(card.credit_limit) - outstanding(card, charges, today))}` : ""}
        </span>
        <span className="text-xs text-muted">ตัดรอบทุกวันที่ {card.statement_day} · จ่ายทุกวันที่ {card.due_day}{card.bank ? ` · ${card.bank}` : ""}</span>
      </div>

      {owedBy.size > 0 && (
        <div className="flex flex-col gap-1 rounded-2xl bg-sand p-3 text-sm">
          <span className="font-semibold">รอเก็บเงินจากคนในบ้าน</span>
          {[...owedBy].map(([k, v]) => <span key={k} className="flex justify-between"><span>{people.get(k).name}</span><span>{baht(v)} บาท</span></span>)}
        </div>
      )}

      <button className="btn-dark" onClick={() => setForm("new")}>+ จดรายการที่รูดบัตร</button>

      <div className="flex flex-wrap gap-1.5">
        {([["cycle", "รอบนี้"], ["inst", "ผ่อนอยู่"], ["bill", "เรียกเก็บ"], ["all", "ทั้งหมด"]] as const).map(([k, label]) => (
          <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {list.length === 0 && <p className="text-sm text-muted">ยังไม่มีรายการ</p>}
        {list.map((c) => {
          const st = installment(card, c, today);
          return (
            <button key={c.id} onClick={() => setForm(c)} className="flex items-center gap-2.5 text-left text-sm">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-xs font-semibold">{c.months > 1 ? `${st.paid}/${c.months}` : "เต็ม"}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-semibold">{c.title}</span>
                <span className="text-xs text-muted">
                  {day(c.charged_on)} · {c.months > 1 ? (st.done ? "ผ่อนครบแล้ว" : `ผ่อนไป ${st.paid} เหลือ ${st.left} เดือน · เดือนละ ${baht(st.perMonth)}`) : "จ่ายเต็ม"}
                  {c.bill_to ? ` · เก็บจาก${people.get(c.bill_to).name} ${baht(Number(c.bill_amount ?? c.amount))}${c.bill_paid ? " ✓" : ""}` : ""}
                </span>
              </span>
              <span className="font-semibold">{baht(Number(c.amount))}</span>
            </button>
          );
        })}
      </div>
      <p className="text-center text-xs text-muted">จดรายการบัตรที่นี่ที่เดียว ไม่ต้องจดซ้ำในรายจ่าย · ยอดบัตรจะไปรวมในการ์ดเงินเดือนตอนครบกำหนดจ่าย</p>
      <button className="btn-soft" onClick={onEditCard}>✏️ แก้บัตร</button>
    </div>
  );
}

const MONTH_CHOICES = [3, 4, 6, 10, 12, 24];

function ChargeForm({ card, charge, today, onDone }: { card: CardRow; charge: ChargeRow | null; today: string; onDone: () => void }) {
  const { people, role } = useHousehold();
  const [title, setTitle] = useState(charge?.title ?? "");
  const [amount, setAmount] = useState(charge ? String(Number(charge.amount)) : "");
  const [date, setDate] = useState(charge?.charged_on ?? today);
  const [months, setMonths] = useState(charge?.months ?? 1);
  const [billTo, setBillTo] = useState<string | null>(charge?.bill_to ?? null);
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
  const ba = part ? Number(billAmount.replace(/,/g, "")) : n;
  const others = people.list.filter((p) => p.key !== role);
  const billChanged = billTo !== (charge?.bill_to ?? null) || (charge && Number(charge.bill_amount) !== ba);

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
    const row = { card_id: card.id, title: title.trim(), amount: n, charged_on: date, months, bill_to: billTo, bill_amount: billTo ? ba : null, bill_paid: billTo ? paid : false, note: note.trim() || null };
    const res = charge
      ? await supabase().from("card_charges").update(row).eq("id", charge.id).select("id").single()
      : await supabase().from("card_charges").insert(row).select("id").single();
    if (res.error) { setBusy(false); return setMsg("บันทึกไม่ได้ ลองใหม่อีกครั้ง"); }
    if (billTo && billTo !== role && notify && (!charge || billChanged)) await nudge(res.data.id, billTo);
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
      <label className="flex flex-col gap-1 text-sm font-medium">รูดซื้ออะไร<input className="field" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น ทีวี, ค่าตั๋วเครื่องบิน" /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">ยอดทั้งหมด (บาท)<input className="field min-w-0" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} /></label>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">วันที่รูด<input className="field min-w-0" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">จ่ายแบบไหน</legend>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="chip" aria-pressed={months === 1} onClick={() => setMonths(1)}>จ่ายเต็ม</button>
          {MONTH_CHOICES.map((m) => <button type="button" key={m} className="chip" aria-pressed={months === m} onClick={() => setMonths(m)}>ผ่อน {m} เดือน</button>)}
          <label className="flex items-center gap-1 text-sm">อื่นๆ
            <input className="field min-h-10" style={{ width: 80 }} inputMode="numeric" aria-label="จำนวนเดือนที่ผ่อน" value={MONTH_CHOICES.includes(months) || months === 1 ? "" : String(months)} placeholder="เดือน"
              onChange={(e) => { const v = Number(e.target.value.replace(/\D/g, "")); if (v) setMonths(Math.min(60, v)); }} />
          </label>
        </div>
        {months > 1 && n > 0 && (() => {
          const st = installment(card, { id: "", card_id: card.id, title, amount: n, charged_on: date, months, category: null, bill_to: null, bill_amount: null, bill_paid: false, note: null, created_by: "", created_at: "" }, today);
          return <p className="mt-2 rounded-2xl bg-mint px-3 py-2 text-sm">เดือนละ <b>{baht(st.perMonth, 2)} บาท</b> · จ่ายไปแล้ว {st.paid} งวด เหลือ {st.left} งวด · งวดสุดท้าย {thaiDate(st.lastDue, { day: "numeric", month: "short", year: "2-digit" })}</p>;
        })()}
      </fieldset>

      <fieldset className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-3">
        <legend className="sr-only">เรียกเก็บจากคนในบ้าน</legend>
        <span className="text-sm font-medium">เรียกเก็บจากคนในบ้าน</span>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="chip" aria-pressed={billTo === null} onClick={() => setBillTo(null)}>ไม่เรียกเก็บ</button>
          {people.list.map((p) => <button type="button" key={p.key} className="chip" aria-pressed={billTo === p.key} onClick={() => { setBillTo(p.key); setNudgeTo(p.key); }}>{p.name}</button>)}
        </div>
        {billTo && <>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className="chip" aria-pressed={!part} onClick={() => setPart(false)}>เต็มจำนวน{n > 0 ? ` ${baht(n)}` : ""}</button>
            <button type="button" className="chip" aria-pressed={part} onClick={() => setPart(true)}>บางส่วน</button>
          </div>
          {part && <label className="flex flex-col gap-1 text-sm font-medium">เก็บจาก{people.get(billTo).name} (บาท)
            <input className="field" inputMode="decimal" value={billAmount} onChange={(e) => setBillAmount(e.target.value.replace(/[^\d.,]/g, ""))} placeholder={n > 0 ? `ไม่เกิน ${baht(n)}` : ""} />
            {n > 0 && <span className="flex gap-1.5 pt-1">{[2, 3].map((d) => <button type="button" key={d} className="chip" onClick={() => setBillAmount(String(Math.round((n / d) * 100) / 100))}>หาร {d}</button>)}</span>}
          </label>}
          {months > 1 && ba > 0 && <span className="text-xs text-muted">{people.get(billTo).name}จ่ายเดือนละ {baht(ba / months, 2)} บาท × {months} เดือน</span>}
          {charge && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-5 accent-cocoa" checked={paid} onChange={(e) => setPaid(e.target.checked)} />ได้รับเงินจาก{people.get(billTo).name}แล้ว</label>}
          {billTo !== role && (!charge || billChanged) && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-5 accent-cocoa" checked={notify} onChange={(e) => setNotify(e.target.checked)} />🔔 ส่งแจ้งเตือนให้{people.get(billTo).name}</label>}
        </>}
      </fieldset>

      <label className="flex flex-col gap-1 text-sm font-medium">โน้ต<input className="field" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="ไม่ใส่ก็ได้" /></label>
      {msg && <p role="status" className="text-sm">{msg}</p>}
      <button className="btn-dark" disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึก"}</button>

      {charge && others.length > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl bg-white p-3">
          <span className="text-sm font-medium">🔔 แจ้งเตือนคนในบ้านเรื่องรายการนี้</span>
          <div className="flex flex-wrap gap-1.5">
            {others.map((p) => <button type="button" key={p.key} className="chip" aria-pressed={nudgeTo === p.key} onClick={() => setNudgeTo(p.key)}>{p.name}</button>)}
          </div>
          <button type="button" className="btn-soft" disabled={busy || !nudgeTo} onClick={sendNudge}>ส่งแจ้งเตือน{nudgeTo ? `ให้${people.get(nudgeTo).name}` : ""}</button>
          <span className="text-xs text-muted">คนที่เปิดแจ้งเตือนในแอปไว้จะได้รับ · ลูกจะเห็นแค่ข้อความแจ้งเตือน ไม่เห็นหน้าบัตร</span>
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
  const { people } = useHousehold();
  const [name, setName] = useState(card?.name ?? "");
  const [bank, setBank] = useState(card?.bank ?? "");
  const [last4, setLast4] = useState(card?.last4 ?? "");
  const [owner, setOwner] = useState(card?.owner ?? "dad");
  const [sDay, setSDay] = useState(card ? String(card.statement_day) : "");
  const [dDay, setDDay] = useState(card ? String(card.due_day) : "");
  const [limit, setLimit] = useState(card?.credit_limit ? String(Number(card.credit_limit)) : "");
  const [color, setColor] = useState(card?.color ?? COLORS[0]);
  const [priv, setPriv] = useState(card?.private ?? false);
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
    const row = { name: name.trim(), bank: bank.trim() || null, last4: last4 || null, owner, statement_day: s, due_day: d, credit_limit: lim > 0 ? lim : null, color, private: priv };
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
        <legend className="mb-1.5 text-sm font-medium">บัตรของใคร</legend>
        <div className="flex flex-wrap gap-1.5">{people.list.map((p) => <button type="button" key={p.key} className="chip" aria-pressed={owner === p.key} onClick={() => setOwner(p.key)}>{p.name}</button>)}</div>
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">สีบัตร</legend>
        <div className="flex flex-wrap gap-2">{COLORS.map((c) => <button type="button" key={c} aria-label={`สี ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} className={`size-9 rounded-full ${color === c ? "ring-2 ring-cocoa ring-offset-2" : ""}`} style={{ background: c }} />)}</div>
      </fieldset>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" className="size-5 accent-cocoa" checked={priv} onChange={(e) => setPriv(e.target.checked)} />
        <LockIcon />เห็นคนเดียว (คนอื่นในบ้านไม่เห็นบัตรนี้)
      </label>
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
