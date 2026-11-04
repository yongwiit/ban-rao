"use client";

import { useState } from "react";
import { useHousehold } from "./Household";
import { Sheet } from "./Sheet";
import { PromptPayQR } from "./PromptPayQR";
import { supabase } from "@/lib/supabase";
import { useLive } from "@/lib/useLive";
import { baht, thaiDate } from "@/lib/format";
import { confetti } from "@/lib/confetti";
import { play } from "@/lib/sfx";
import { validPromptPay } from "@/lib/promptpay";

export type Goal = { id: string; household_id: string; title: string; emoji: string; target: number; deadline: string | null; promptpay: string | null; active: boolean; created_at: string };
export type Deposit = { id: string; goal_id: string; amount: number; who: string; note: string | null; created_at: string };

const EMOJI = ["🐷", "🏖️", "✈️", "🏠", "🚗", "🎓", "💍", "🎁", "📱", "🧸", "🏥", "💰"];

/** วันที่เหลือถึงเส้นตาย (นับวันนี้เป็น 0) */
export function daysUntil(day: string): number {
  const today = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }) + "T00:00:00+07:00");
  return Math.round((new Date(day + "T00:00:00+07:00").getTime() - today.getTime()) / 864e5);
}

export function goalStats(g: Goal, deps: Deposit[]) {
  const saved = deps.filter((d) => d.goal_id === g.id).reduce((s, d) => s + Number(d.amount), 0);
  const left = Math.max(0, Number(g.target) - saved);
  const pct = Math.min(100, (saved / Number(g.target)) * 100);
  const days = g.deadline ? daysUntil(g.deadline) : null;
  const months = days != null ? Math.max(1, Math.ceil(days / 30.4)) : null;
  return { saved, left, pct, days, perMonth: months && left > 0 ? Math.ceil(left / months) : null, done: saved >= Number(g.target) };
}

/** การ์ดเป้าออมเงินในหน้าเงิน (เฉพาะพ่อแม่) */
export function Goals() {
  const { household } = useHousehold();
  const hid = household.id;
  const goals = useLive<Goal>("savings_goals", hid, () => supabase().from("savings_goals").select("*").eq("active", true).order("created_at"));
  const deps = useLive<Deposit>("savings_deposits", hid, () => supabase().from("savings_deposits").select("*").order("created_at", { ascending: false }));
  const [open, setOpen] = useState<Goal | null>(null);
  const [edit, setEdit] = useState<Goal | "new" | null>(null);

  return (
    <section className="card flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-[17px] font-semibold">เป้าออมเงิน</h2>
        <button onClick={() => setEdit("new")} className="min-h-9 px-1 text-sm text-muted">+ ตั้งเป้า</button>
      </div>
      {goals.rows.length === 0 && <p className="text-sm text-muted">ตั้งเป้า เช่น &quot;ไปทะเล 20,000 ภายในมีนาคม&quot; แอปจะบอกว่าต้องเก็บเดือนละเท่าไร และมี QR ให้โอนเข้าเป้า</p>}
      {goals.rows.map((g) => {
        const st = goalStats(g, deps.rows);
        return (
          <button key={g.id} onClick={() => setOpen(g)} className="flex flex-col gap-1.5 rounded-2xl bg-mint p-3 text-left">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{g.emoji}</span>
              <span className="flex-1 font-semibold">{g.title}</span>
              <span className="text-sm">{st.done ? "ถึงเป้าแล้ว 🎉" : `${Math.floor(st.pct)}%`}</span>
            </div>
            <span className="h-3 overflow-hidden rounded-full bg-white"><span className="block h-3 rounded-full bg-mint-strong transition-all" style={{ width: `${st.pct}%` }} /></span>
            <span className="text-xs text-muted">
              {baht(st.saved)} / {baht(Number(g.target))} บาท
              {st.days != null && !st.done ? ` · ${st.days > 0 ? `อีก ${st.days} วัน` : st.days === 0 ? "ถึงวันนี้" : "เลยกำหนดแล้ว"}` : ""}
              {st.perMonth ? ` · ควรเก็บเดือนละ ${baht(st.perMonth)}` : ""}
            </span>
          </button>
        );
      })}
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? `${open.emoji} ${open.title}` : ""}>
        {open && <GoalDetail key={open.id} goal={goals.rows.find((g) => g.id === open.id) ?? open} deps={deps.rows.filter((d) => d.goal_id === open.id)} onEdit={() => { setEdit(open); setOpen(null); }} />}
      </Sheet>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit === "new" ? "ตั้งเป้าออมเงิน" : "แก้เป้า"}>
        {edit && <GoalForm key={edit === "new" ? "new" : edit.id} goal={edit === "new" ? null : edit} onDone={() => setEdit(null)} />}
      </Sheet>
    </section>
  );
}

function GoalDetail({ goal, deps, onEdit }: { goal: Goal; deps: Deposit[]; onEdit: () => void }) {
  const { people } = useHousehold();
  const st = goalStats(goal, deps);
  const [amount, setAmount] = useState(st.perMonth ? String(st.perMonth) : "");
  const [who, setWho] = useState("pot");
  const [showQr, setShowQr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const qrId = goal.promptpay ?? null;
  const n = Number(amount);

  async function add(sign: 1 | -1) {
    if (!(n > 0)) return setMsg("ใส่ยอดก่อนนะ");
    setBusy(true); setMsg(null);
    const { error } = await supabase().from("savings_deposits").insert({ goal_id: goal.id, amount: sign * n, who, note: sign < 0 ? "ถอนออก" : null });
    setBusy(false);
    if (error) return setMsg("บันทึกไม่ได้ ลองใหม่อีกครั้ง");
    setShowQr(false);
    if (sign > 0) {
      const reached = !st.done && st.saved + n >= Number(goal.target);
      play(reached ? "tada" : "star");
      confetti(reached ? { emoji: "🎉", count: 40 } : { emoji: "🪙", count: 14 });
      setMsg(reached ? "ถึงเป้าแล้ว! เก่งมากทั้งบ้านเลย 🎉" : `ฝากแล้ว ${baht(n)} บาท 🐷`);
    } else setMsg(`ถอนออก ${baht(n)} บาท`);
  }
  async function remove(id: string) {
    await supabase().from("savings_deposits").delete().eq("id", id);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-1 rounded-3xl bg-mint p-4 text-center">
        <span className="text-5xl">{goal.emoji}</span>
        <span className="font-display text-3xl font-bold">{baht(st.saved)} <span className="text-base font-medium">/ {baht(Number(goal.target))}</span></span>
        <span className="h-3 w-full overflow-hidden rounded-full bg-white"><span className="block h-3 rounded-full bg-mint-strong" style={{ width: `${st.pct}%` }} /></span>
        <span className="text-sm">
          {st.done ? "ถึงเป้าแล้ว 🎉" : `ขาดอีก ${baht(st.left)} บาท`}
          {goal.deadline ? ` · ภายใน ${thaiDate(goal.deadline, { day: "numeric", month: "short", year: "2-digit" })}${st.days != null && st.days >= 0 && !st.done ? ` (อีก ${st.days} วัน)` : ""}` : ""}
        </span>
        {st.perMonth ? <span className="text-sm font-semibold">ควรเก็บเดือนละ {baht(st.perMonth)} บาท</span> : null}
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          ฝากเข้าเป้า (บาท)
          <input className="field" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="เช่น 1000" />
        </label>
        <div className="flex flex-wrap gap-2">
          {[["pot", "กองกลาง"], ["dad", people.get("dad").name], ["mom", people.get("mom").name]].map(([k, label]) => (
            <button key={k} type="button" aria-pressed={who === k} onClick={() => setWho(k)} className="chip">{label}</button>
          ))}
        </div>
        {validPromptPay(qrId) && n > 0 && (
          showQr ? <PromptPayQR id={qrId} amount={n} name={`บัญชี${goal.title}`} /> : <button className="btn-soft" onClick={() => setShowQr(true)}>แสดง QR สำหรับโอนเข้าบัญชีเก็บเงิน</button>
        )}
        <button className="btn-dark" disabled={busy} onClick={() => add(1)}>🐷 บันทึกว่าฝากแล้ว</button>
        <button className="min-h-11 text-sm text-muted underline" disabled={busy} onClick={() => add(-1)}>ถอนเงินออกจากเป้า</button>
        {msg && <p role="status" className="text-center text-sm">{msg}</p>}
      </div>

      {deps.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">ประวัติ</h3>
          {deps.slice(0, 20).map((d) => (
            <div key={d.id} className="flex min-h-9 items-center gap-2 text-sm">
              <span className="flex-1">{thaiDate(d.created_at, { day: "numeric", month: "short" })} · {d.who === "pot" ? "กองกลาง" : people.get(d.who).name}{d.note ? ` · ${d.note}` : ""}</span>
              <span className={Number(d.amount) < 0 ? "text-rose" : ""}>{Number(d.amount) > 0 ? "+" : ""}{baht(Number(d.amount))}</span>
              <button aria-label="ลบรายการนี้" onClick={() => remove(d.id)} className="min-h-9 px-2 text-muted">✕</button>
            </div>
          ))}
        </div>
      )}
      <button className="btn-soft" onClick={onEdit}>✏️ แก้เป้า</button>
    </div>
  );
}

function GoalForm({ goal, onDone }: { goal: Goal | null; onDone: () => void }) {
  const { people } = useHousehold();
  const [title, setTitle] = useState(goal?.title ?? "");
  const [emoji, setEmoji] = useState(goal?.emoji ?? "🐷");
  const [target, setTarget] = useState(goal ? String(Number(goal.target)) : "");
  const [deadline, setDeadline] = useState(goal?.deadline ?? "");
  const [pp, setPp] = useState(goal?.promptpay ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const pps = ["dad", "mom"].map((k) => people.get(k)).filter((p) => validPromptPay(p.promptpay));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const t = Number(target);
    if (!title.trim()) return setMsg("ตั้งชื่อเป้าก่อนนะ");
    if (!(t > 0)) return setMsg("ใส่ยอดเป้าหมายก่อนนะ");
    const promptpay = pp.replace(/\D/g, "") || null;
    if (promptpay && !validPromptPay(promptpay)) return setMsg("พร้อมเพย์ใส่เบอร์มือถือ 10 หลัก หรือเลขบัตร 13 หลัก");
    setBusy(true);
    const row = { title: title.trim(), emoji, target: t, deadline: deadline || null, promptpay };
    const { error } = goal ? await supabase().from("savings_goals").update(row).eq("id", goal.id) : await supabase().from("savings_goals").insert(row);
    setBusy(false);
    if (error) return setMsg("บันทึกไม่ได้ ลองใหม่อีกครั้ง");
    onDone();
  }
  async function remove() {
    if (!goal) return;
    await supabase().from("savings_goals").update({ active: false }).eq("id", goal.id);
    onDone();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {EMOJI.map((x) => <button type="button" key={x} aria-pressed={emoji === x} onClick={() => setEmoji(x)} className={`size-11 rounded-2xl text-2xl ${emoji === x ? "bg-peach ring-2 ring-cocoa" : "bg-sand"}`}>{x}</button>)}
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">ชื่อเป้า<input className="field" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น ไปทะเลช่วงปิดเทอม" /></label>
      <label className="flex flex-col gap-1 text-sm font-medium">ยอดที่อยากเก็บ (บาท)<input className="field" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ""))} placeholder="20000" /></label>
      <label className="flex flex-col gap-1 text-sm font-medium">อยากได้ภายในวันที่ (ไม่บังคับ)<input className="field" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        พร้อมเพย์ของบัญชีเก็บเงิน (ไม่บังคับ)
        <input className="field" inputMode="numeric" maxLength={17} value={pp} onChange={(e) => setPp(e.target.value)} placeholder="เบอร์ หรือเลขบัตรที่ผูกบัญชีเก็บเงิน" />
        {pps.length > 0 && <span className="flex flex-wrap gap-2 pt-1">{pps.map((p) => <button type="button" key={p.key} className="chip" onClick={() => setPp(p.promptpay ?? "")}>ใช้ของ{p.name}</button>)}</span>}
        <span className="text-xs font-normal text-muted">ใส่แล้วจะมี QR ใส่ยอดให้สแกนโอนจากแอปธนาคาร · แอปไม่ได้เชื่อมกับธนาคาร</span>
      </label>
      {msg && <p role="alert" className="text-sm text-rose">{msg}</p>}
      <button className="btn-dark" disabled={busy}>{goal ? "บันทึก" : "ตั้งเป้า"}</button>
      {goal && (confirmDel ? (
        <div className="flex gap-2">
          <button type="button" className="btn-soft flex-1" onClick={() => setConfirmDel(false)}>ไม่ลบ</button>
          <button type="button" className="btn-dark flex-1" onClick={remove}>ลบเป้านี้</button>
        </div>
      ) : <button type="button" className="min-h-11 text-sm text-rose underline" onClick={() => setConfirmDel(true)}>ลบเป้านี้</button>)}
    </form>
  );
}
