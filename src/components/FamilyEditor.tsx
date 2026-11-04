"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { COLORS, MASCOTS, MASCOT_LABEL, type MascotKind, type Person } from "@/lib/family";
import { useHousehold } from "./Household";
import { Mascot } from "./Mascots";
import { Sheet } from "./Sheet";

/** การ์ดในหน้าตั้งค่า: แก้ชื่อ ตัวการ์ตูน สีของแต่ละคน และเพิ่ม/ลบลูก */
export function FamilyEditor() {
  const { household, people, reloadPeople } = useHousehold();
  const [edit, setEdit] = useState<Person | "new" | null>(null);

  return (
    <section className="card flex flex-col gap-3">
      <div>
        <h2 className="font-display text-[17px] font-semibold">คนในบ้าน</h2>
        <p className="text-sm text-muted">แตะเพื่อเปลี่ยนชื่อ ตัวการ์ตูน หรือสี</p>
      </div>
      <ul className="flex flex-col gap-1.5">
        {people.list.map((p) => (
          <li key={p.key}>
            <button onClick={() => setEdit(p)} className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-2 text-left" style={{ background: p.soft }}>
              <Mascot kind={p.mascot} size={40} />
              <span className="flex-1 font-semibold">{p.name}</span>
              <span className="text-xs text-muted">{p.kid ? "ลูก" : p.key === "dad" ? "คุณพ่อ" : "คุณแม่"}</span>
              <span className="size-4 rounded-full" style={{ background: p.color }} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <button className="btn-soft" onClick={() => setEdit("new")}>+ เพิ่มลูก</button>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit === "new" ? "เพิ่มลูก" : "แก้ไขข้อมูล"}>
        {edit && <PersonForm key={edit === "new" ? "new" : edit.key} p={edit === "new" ? null : edit} householdId={household.id} keys={people.list.map((x) => x.key)} onDone={async () => { await reloadPeople(); setEdit(null); }} />}
      </Sheet>
    </section>
  );
}

function nextKidKey(keys: string[]): string {
  if (!keys.includes("pearl")) return "pearl";
  for (let i = 2; i < 100; i++) if (!keys.includes(`kid${i}`)) return `kid${i}`;
  return "kid99";
}

function PersonForm({ p, householdId, keys, onDone }: { p: Person | null; householdId: string; keys: string[]; onDone: () => Promise<void> }) {
  const used = keys.length;
  const [name, setName] = useState(p?.name ?? "");
  const [mascot, setMascot] = useState<MascotKind>(p?.mascot ?? MASCOTS[(used + 2) % MASCOTS.length]);
  const [color, setColor] = useState(p?.color ?? COLORS[used % COLORS.length]);
  const [pp, setPp] = useState(p?.promptpay ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setMsg("ใส่ชื่อก่อนนะ");
    const promptpay = pp.replace(/\D/g, "") || null;
    if (promptpay && !/^(\d{10}|\d{13}|\d{15})$/.test(promptpay)) return setMsg("พร้อมเพย์ใส่เบอร์มือถือ 10 หลัก หรือเลขบัตรประชาชน 13 หลัก");
    setBusy(true);
    const db = supabase().from("household_people");
    const { error } = p
      ? await db.update({ name: name.trim(), mascot, color, ...(p.kid ? {} : { promptpay }) }).eq("household_id", householdId).eq("key", p.key)
      : await db.insert({ household_id: householdId, key: nextKidKey(keys), name: name.trim(), mascot, color, sort: 10 + used });
    setBusy(false);
    if (error) return setMsg("บันทึกไม่ได้ ลองใหม่อีกครั้ง");
    await onDone();
  }

  async function remove() {
    if (!p) return;
    setBusy(true);
    // นัดของลูกคนนี้ย้ายไปเป็นของทั้งบ้าน
    await supabase().from("events").update({ who: "all" }).eq("household_id", householdId).eq("who", p.key);
    const { error } = await supabase().from("household_people").delete().eq("household_id", householdId).eq("key", p.key);
    setBusy(false);
    if (error) return setMsg("ลบไม่ได้ ลองใหม่อีกครั้ง");
    await onDone();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <div className="flex justify-center"><span className="rounded-full p-3" style={{ background: `${color}33` }}><Mascot kind={mascot} size={72} happy /></span></div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        ชื่อที่แสดงในแอป
        <input className="field" maxLength={20} value={name} placeholder={p ? "" : "เช่น น้องพลอย"} onChange={(e) => setName(e.target.value)} />
      </label>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">ตัวการ์ตูน</legend>
        <div className="grid grid-cols-4 gap-2">
          {MASCOTS.map((m) => (
            <button type="button" key={m} aria-pressed={mascot === m} onClick={() => setMascot(m)} className={`flex flex-col items-center rounded-2xl py-1.5 text-xs ${mascot === m ? "bg-peach ring-2 ring-cocoa" : "bg-sand"}`}>
              <Mascot kind={m} size={40} />{MASCOT_LABEL[m]}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">สีในปฏิทิน</legend>
        <div className="flex flex-wrap gap-2.5">
          {COLORS.map((c) => (
            <button type="button" key={c} aria-label={`สี ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} className={`size-10 rounded-full ${color === c ? "ring-[3px] ring-cocoa ring-offset-2" : ""}`} style={{ background: c }} />
          ))}
        </div>
      </fieldset>
      {p && !p.kid && (
        <label className="flex flex-col gap-1 text-sm font-medium">
          พร้อมเพย์ (ไม่บังคับ)
          <input className="field" inputMode="numeric" maxLength={17} value={pp} placeholder="เบอร์มือถือ หรือเลขบัตรประชาชน" onChange={(e) => setPp(e.target.value)} />
          <span className="text-xs font-normal text-muted">ใช้สร้าง QR ให้อีกฝ่ายสแกนโอนตอนเคลียร์เงินหรือฝากเงินออม แอปไม่ได้เชื่อมกับธนาคาร และเห็นเฉพาะคนในบ้าน</span>
        </label>
      )}
      {msg && <p role="alert" className="text-sm text-rose">{msg}</p>}
      <button className="btn-dark" disabled={busy}>{p ? "บันทึก" : "เพิ่มลูก"}</button>
      {p?.kid && (confirmDel ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-[#FBDCE4] p-3 text-sm">
          <p>ลบ{p.name}ออกจากบ้าน? นัดของ{p.name}จะย้ายไปเป็นของทั้งบ้าน</p>
          <div className="flex gap-2">
            <button type="button" className="btn-soft flex-1" onClick={() => setConfirmDel(false)}>ไม่ลบ</button>
            <button type="button" className="btn-dark flex-1" disabled={busy} onClick={remove}>ลบเลย</button>
          </div>
        </div>
      ) : (
        <button type="button" className="min-h-11 text-sm text-rose underline" onClick={() => setConfirmDel(true)}>ลบออกจากบ้าน</button>
      ))}
    </form>
  );
}
