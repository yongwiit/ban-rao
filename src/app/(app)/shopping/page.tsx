"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useHousehold } from "@/components/Household";
import { Bunny } from "@/components/Mascots";
import { CheckIcon, EditIcon, PlusIcon, TrashIcon } from "@/components/Icons";
import { dayKey, thaiDate, thaiTime } from "@/lib/format";
import { thHm } from "@/lib/recur";
import { Sheet } from "@/components/Sheet";
import { supabase } from "@/lib/supabase";
import { useLive } from "@/lib/useLive";
import { confetti } from "@/lib/confetti";
import { play } from "@/lib/sfx";
import type { ItemRow, ListRow } from "@/lib/types";

export default function ShoppingPage() {
  const { household } = useHousehold();
  const lists = useLive<ListRow>("shopping_lists", household.id, () => supabase().from("shopping_lists").select("*").order("sort"));
  const items = useLive<ItemRow>("shopping_items", household.id, () => supabase().from("shopping_items").select("*").order("created_at"));
  const [picked, setPicked] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [doneMsg, setDoneMsg] = useState(false);
  const [newList, setNewList] = useState("");
  const [editList, setEditList] = useState<ListRow | null>(null);
  const [editItem, setEditItem] = useState<ItemRow | null>(null);
  const [remindList, setRemindList] = useState<ListRow | null>(null);
  const listId = lists.rows.some((l) => l.id === picked) ? picked! : lists.rows[0]?.id;
  const current = lists.rows.find((l) => l.id === listId);

  const inList = items.rows.filter((i) => i.list_id === listId);
  const sorted = [...inList.filter((i) => !i.done), ...inList.filter((i) => i.done)];
  const anyDone = inList.some((i) => i.done);

  const frequent = useMemo(() => {
    const open = new Set(inList.filter((i) => !i.done).map((i) => i.name));
    const count: Record<string, number> = {};
    for (const i of items.rows) if (i.list_id === listId && i.done) count[i.name] = (count[i.name] ?? 0) + 1;
    return Object.entries(count).filter(([n]) => !open.has(n)).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n]) => n);
  }, [items.rows, inList, listId]);

  async function add(n: string) {
    const v = n.trim();
    if (!v || !listId) return;
    // ถ้าเคยซื้อแล้ว ให้ดึงกลับมาแทนการสร้างซ้ำ
    const old = inList.find((i) => i.done && i.name === v);
    if (old) await supabase().from("shopping_items").update({ done: false }).eq("id", old.id);
    else await supabase().from("shopping_items").insert({ list_id: listId, name: v });
    setName("");
    items.refresh();
  }
  async function toggle(i: ItemRow) {
    const finishing = !i.done && inList.filter((x) => !x.done).length === 1;
    await supabase().from("shopping_items").update({ done: !i.done }).eq("id", i.id);
    // ติ๊กชิ้นสุดท้ายของลิสต์ = ซื้อครบแล้ว เย้
    if (finishing) { play("tada"); confetti({ emoji: "🛍️", count: 30 }); setDoneMsg(true); setTimeout(() => setDoneMsg(false), 4000); }
    items.refresh();
  }
  async function addList() {
    const v = newList.trim();
    if (!v) return;
    const { data } = await supabase().from("shopping_lists").insert({ name: v, sort: lists.rows.length }).select().single();
    setNewList("");
    await lists.refresh();
    if (data) setPicked(data.id);
  }
  async function removeItem(i: ItemRow) {
    await supabase().from("shopping_items").delete().eq("id", i.id);
    items.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-[26px] font-bold">ต้องซื้อ</h1>
        <Bunny size={48} />
      </header>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {lists.rows.map((l) => (
          <button key={l.id} aria-pressed={l.id === listId} onClick={() => setPicked(l.id)} className={`h-10 shrink-0 rounded-full px-4 text-sm font-medium ${l.id === listId ? "bg-cocoa text-cream" : "bg-white"}`}>{l.name}</button>
        ))}
      </div>
      {current && (
        <div className="-mt-2 flex flex-wrap gap-x-4">
          <button onClick={() => setEditList(current)} className="flex min-h-9 items-center gap-1 text-sm text-muted">
            <EditIcon size={14} />แก้ชื่อ / ลบลิสต์
          </button>
          <button onClick={() => setRemindList(current)} className="flex min-h-9 items-center gap-1 text-sm text-muted">
            🔔 {current.remind_at ? `เตือน ${thaiDate(current.remind_at, { weekday: "short", day: "numeric", month: "short" })} ${thaiTime(current.remind_at)}${REPEAT_LIST[current.remind_repeat] ? ` · ${REPEAT_LIST[current.remind_repeat]}` : ""}` : "ตั้งเตือนไปซื้อ"}
          </button>
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); add(name); }} className="flex items-center gap-2 rounded-[18px] bg-white py-1 pr-1.5 pl-3.5 shadow-[0_4px_14px_rgba(74,59,54,.06)]">
        <label htmlFor="add" className="sr-only">เพิ่มของ</label>
        <input id="add" className="h-11 flex-1 bg-transparent text-base outline-none" placeholder="เพิ่มของที่ต้องซื้อ…" value={name} onChange={(e) => setName(e.target.value)} />
        <button aria-label="เพิ่ม" className="flex size-11 items-center justify-center rounded-[14px] bg-mint-strong"><PlusIcon size={20} /></button>
      </form>

      {frequent.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">ซื้อบ่อย</span>
          {frequent.map((f) => <button key={f} onClick={() => add(f)} className="min-h-9 rounded-xl bg-lavender px-2.5 text-sm">+ {f}</button>)}
        </div>
      )}

      <section className="flex flex-col gap-2">
        {doneMsg && <p role="status" className="rounded-2xl bg-mint px-4 py-3 text-center font-semibold">ซื้อครบแล้ว เก่งมาก! 🎉 ขอบคุณที่ช่วยกันนะ</p>}
        {sorted.length === 0 && <p className="py-6 text-center text-sm text-muted">ลิสต์นี้ว่างอยู่</p>}
        {sorted.map((i) => (
          <div key={i.id} className={`flex min-h-[52px] items-center gap-3 rounded-[18px] px-3.5 ${i.done ? "bg-sand" : "bg-white"}`}>
            <button onClick={() => toggle(i)} aria-pressed={i.done} className="flex flex-1 items-center gap-3 py-2 text-left">
              <span className={`flex size-[26px] shrink-0 items-center justify-center rounded-[9px] ${i.done ? "bg-[#7FBF9C] text-white" : "border-2 border-[#C9B8AE]"}`}>{i.done && <CheckIcon />}</span>
              <span className={`flex-1 ${i.done ? "text-muted line-through" : ""}`}>{i.name}</span>
            </button>
            {i.done
              ? <button aria-label={`ลบ ${i.name}`} onClick={() => removeItem(i)} className="flex size-11 items-center justify-center text-muted"><TrashIcon /></button>
              : <button aria-label={`แก้ ${i.name}`} onClick={() => setEditItem(i)} className="flex size-11 items-center justify-center text-muted"><EditIcon /></button>}
          </div>
        ))}
      </section>

      {anyDone && <Link href="/slip" className="btn-dark">ซื้อเสร็จแล้ว บันทึกรายจ่ายจากสลิป</Link>}

      <form onSubmit={(e) => { e.preventDefault(); addList(); }} className="flex gap-2">
        <label htmlFor="nl" className="sr-only">ชื่อลิสต์ใหม่</label>
        <input id="nl" className="field min-h-11" placeholder="สร้างลิสต์ใหม่ เช่น ของไปเที่ยว" value={newList} onChange={(e) => setNewList(e.target.value)} />
        <button className="btn-soft shrink-0">สร้าง</button>
      </form>

      <Sheet open={!!editList} onClose={() => setEditList(null)} title="แก้ไขลิสต์">
        {editList && (
          <RenameForm key={editList.id} initial={editList.name} label="ชื่อลิสต์"
            deleteLabel="ลบลิสต์นี้ (ของในลิสต์จะหายด้วย)"
            onSave={async (v) => { await supabase().from("shopping_lists").update({ name: v }).eq("id", editList.id); await lists.refresh(); setEditList(null); }}
            onDelete={async () => {
              if (!confirm(`ลบลิสต์ "${editList.name}" และของทั้งหมดในลิสต์?`)) return;
              await supabase().from("shopping_lists").delete().eq("id", editList.id);
              setPicked(null); await lists.refresh(); items.refresh(); setEditList(null);
            }} />
        )}
      </Sheet>

      <Sheet open={!!remindList} onClose={() => setRemindList(null)} title="เตือนไปซื้อของ">
        {remindList && <RemindForm key={remindList.id} list={remindList} onDone={async () => { await lists.refresh(); setRemindList(null); }} />}
      </Sheet>

      <Sheet open={!!editItem} onClose={() => setEditItem(null)} title="แก้ไขของ">
        {editItem && (
          <RenameForm key={editItem.id} initial={editItem.name} label="ชื่อของ" deleteLabel="ลบของชิ้นนี้"
            onSave={async (v) => { await supabase().from("shopping_items").update({ name: v }).eq("id", editItem.id); items.refresh(); setEditItem(null); }}
            onDelete={async () => { await removeItem(editItem); setEditItem(null); }} />
        )}
      </Sheet>
    </div>
  );
}

function RenameForm({ initial, label, deleteLabel, onSave, onDelete }: {
  initial: string; label: string; deleteLabel: string;
  onSave: (v: string) => Promise<void>; onDelete: () => Promise<void>;
}) {
  const [v, setV] = useState(initial);
  return (
    <form className="flex flex-col gap-3" onSubmit={async (e) => { e.preventDefault(); if (v.trim()) await onSave(v.trim()); }}>
      <label className="flex flex-col gap-1 text-sm font-medium">{label}<input className="field" required value={v} onChange={(e) => setV(e.target.value)} /></label>
      <button className="btn-dark">บันทึก</button>
      <button type="button" onClick={onDelete} className="flex min-h-11 items-center justify-center gap-1 text-sm text-rose"><TrashIcon />{deleteLabel}</button>
    </form>
  );
}

const REPEAT_LIST: Record<ListRow["remind_repeat"], string> = { none: "", daily: "ทุกวัน", weekly: "ทุกสัปดาห์", monthly: "ทุกเดือน" };

function RemindForm({ list, onDone }: { list: ListRow; onDone: () => Promise<void> }) {
  const [date, setDate] = useState(() => dayKey(list.remind_at ?? new Date(Date.now() + 864e5)));
  const [time, setTime] = useState(list.remind_at ? thHm(list.remind_at) : "17:00");
  const [repeat, setRepeat] = useState<ListRow["remind_repeat"]>(list.remind_repeat ?? "none");
  const [err, setErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const at = new Date(`${date}T${time}:00+07:00`);
    if (repeat === "none" && at.getTime() < Date.now()) return setErr("เวลานี้ผ่านไปแล้ว เลือกเวลาข้างหน้า");
    const { error } = await supabase().from("shopping_lists").update({ remind_at: at.toISOString(), remind_repeat: repeat }).eq("id", list.id);
    if (error) return setErr(error.message);
    await onDone();
  }
  async function clear() {
    await supabase().from("shopping_lists").update({ remind_at: null, remind_repeat: "none" }).eq("id", list.id);
    await onDone();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <p className="text-sm text-muted">ถึงเวลาจะแจ้งเตือนทุกคนในบ้าน พร้อมบอกของที่ยังไม่ได้ซื้อในลิสต์ &quot;{list.name}&quot; (ถ้าลิสต์ว่างจะไม่เตือน)</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">วันที่<input className="field" type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="flex flex-col gap-1 text-sm font-medium">เวลา<input className="field" type="time" required value={time} onChange={(e) => setTime(e.target.value)} /></label>
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-medium">ซ้ำ</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(REPEAT_LIST) as ListRow["remind_repeat"][]).map((r) => (
            <button type="button" key={r} className="chip" aria-pressed={repeat === r} onClick={() => setRepeat(r)}>{REPEAT_LIST[r] || "ครั้งเดียว"}</button>
          ))}
        </div>
      </fieldset>
      {err && <p role="alert" className="text-sm text-rose">{err}</p>}
      <button className="btn-dark">บันทึกการเตือน</button>
      {list.remind_at && <button type="button" onClick={clear} className="min-h-11 text-sm text-rose">ยกเลิกการเตือน</button>}
      <p className="text-xs text-muted">ต้องเปิดแจ้งเตือนในหน้าตั้งค่าก่อน (ปุ่มเฟืองหน้าวันนี้)</p>
    </form>
  );
}
