"use client";

import { useState } from "react";
import { useHousehold } from "./Household";
import { Sheet } from "./Sheet";
import { LockIcon } from "./Icons";
import { useCards } from "./CreditCards";
import { supabase } from "@/lib/supabase";
import { useLive } from "@/lib/useLive";
import { baht, dayKey } from "@/lib/format";
import { cardSummary, cardsDueInMonth, type IncomeRow } from "@/lib/cards";

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

/**
 * เงินเดือน / รายได้ต่อเดือน → ดูว่าใช้ไปกี่ % (รายจ่ายที่จด + บิลบัตรที่ครบจ่ายเดือนนั้น)
 * และภาระประจำ (ค่าใช้จ่ายประจำ + ผ่อนบัตร) กี่ % ของรายได้
 */
export function Income({ scope, spent, setAside, ym }: { scope: "home" | "mine"; spent: number; setAside: number; ym: { y: number; m: number } }) {
  const { household, people, userId, role } = useHousehold();
  const hid = household.id;
  const incomes = useLive<IncomeRow>("incomes", hid, () => supabase().from("incomes").select("*").order("created_at"));
  const { cards, charges } = useCards(hid);
  const [open, setOpen] = useState(false);
  const today = dayKey(new Date());

  // ของบ้าน = รายได้/บัตรที่ไม่ได้ซ่อน · ของฉัน = ของฉันเอง (รวมที่ซ่อนไว้)
  const myIncome = (i: IncomeRow) => i.created_by === userId || i.who === role;
  const inc = incomes.rows.filter((i) => (scope === "home" ? !i.private : myIncome(i)));
  // บัตรของใครของมัน: นับเฉพาะในแท็บ "ของฉัน" (ส่วนที่เข้าเงินบ้านจะถูกจดเป็นรายจ่ายบ้านหลังอีกฝ่ายยืนยัน)
  const myCards = scope === "mine" ? cards.filter((c) => c.owner === role || c.created_by === userId) : [];
  const total = inc.reduce((s, i) => s + Number(i.amount), 0);
  const cardDue = cardsDueInMonth(myCards, charges, ym.y, ym.m);
  const installments = myCards.reduce((s, c) => s + cardSummary(c, charges.filter((x) => x.card_id === c.id), today).monthlyInstallments, 0);
  const fixed = setAside;
  const used = spent + cardDue;
  const left = total - used;
  const usedPct = pct(used, total);
  const seg = (v: number) => `${Math.min(100, total > 0 ? (v / total) * 100 : 0)}%`;

  return (
    <section className="card flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-[17px] font-semibold">💼 {scope === "home" ? "รายได้บ้าน" : "รายได้ของฉัน"} & ใช้ไปกี่ %</h2>
        <button onClick={() => setOpen(true)} className="min-h-9 px-1 text-sm text-muted">{inc.length ? "แก้" : "+ ตั้งเงินเดือน"}</button>
      </div>
      {total === 0 ? (
        scope === "home" && incomes.rows.some((i) => i.private)
          ? <p className="text-sm text-muted">รายได้ที่ใส่ไว้ตั้งเป็น &quot;เห็นคนเดียว&quot; จึงไม่รวมในยอดบ้าน ดูได้ที่แท็บ &quot;ของฉัน&quot; หรือกด <b>แก้</b> แล้วแตะให้รวมในยอดบ้าน</p>
          : <p className="text-sm text-muted">ตั้งเงินเดือน (หรือรายได้อื่น) แล้วแอปจะบอกว่าเดือนนี้ใช้ไปกี่ % ของรายได้ รวมบิลบัตรเครดิตด้วย</p>
      ) : (
        <>
          <div className="flex items-baseline justify-between">
            <span className="text-sm">รายได้ต่อเดือน {baht(total)} บาท</span>
            <span className={`font-display text-2xl font-bold ${usedPct > 100 ? "text-rose" : ""}`}>{usedPct}%</span>
          </div>
          <span className="flex h-3 overflow-hidden rounded-full bg-sand" aria-hidden>
            <span className="block h-3 bg-rose" style={{ width: seg(spent) }} />
            <span className="block h-3 bg-[#8A6FC7]" style={{ width: seg(cardDue) }} />
          </span>
          <div className="flex flex-col gap-0.5 text-sm">
            <span className="flex justify-between"><span><i className="mr-1.5 inline-block size-2.5 rounded-full bg-rose" />รายจ่ายที่จด</span><span>{baht(spent)} · {pct(spent, total)}%</span></span>
            {scope === "mine" && <span className="flex justify-between"><span><i className="mr-1.5 inline-block size-2.5 rounded-full bg-[#8A6FC7]" />บิลบัตรเครดิตที่ครบจ่ายเดือนนี้</span><span>{baht(cardDue)} · {pct(cardDue, total)}%</span></span>}
            <span className="flex justify-between border-t border-dashed border-line pt-1 font-semibold"><span>{left >= 0 ? "เหลือ" : "ใช้เกินรายได้"}</span><span>{baht(Math.abs(left))} บาท</span></span>
          </div>
          {(fixed > 0 || installments > 0) && (
            <p className="rounded-2xl bg-sand px-3 py-2 text-xs">
              ภาระประจำต่อเดือน {baht(fixed + installments)} บาท = <b>{pct(fixed + installments, total)}% ของรายได้</b>
              {fixed > 0 ? ` (ค่าใช้จ่ายประจำ ${baht(fixed)}` : " ("}{fixed > 0 && installments > 0 ? " + " : ""}{installments > 0 ? `ผ่อนบัตร ${baht(installments)}` : ""})
            </p>
          )}
        </>
      )}
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
