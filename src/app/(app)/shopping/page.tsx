"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useHousehold } from "@/components/Household";
import { Bunny } from "@/components/Mascots";
import { CheckIcon, EditIcon, PlusIcon, TrashIcon } from "@/components/Icons";
import { Sheet } from "@/components/Sheet";
import { supabase } from "@/lib/supabase";
import { useLive } from "@/lib/useLive";
import type { ItemRow, ListRow } from "@/lib/types";

export default function ShoppingPage() {
  const { household } = useHousehold();
  const lists = useLive<ListRow>("shopping_lists", household.id, () => supabase().from("shopping_lists").select("*").order("sort"));
  const items = useLive<ItemRow>("shopping_items", household.id, () => supabase().from("shopping_items").select("*").order("created_at"));
  const [picked, setPicked] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [newList, setNewList] = useState("");
  const [editList, setEditList] = useState<ListRow | null>(null);
  const [editItem, setEditItem] = useState<ItemRow | null>(null);
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
    await supabase().from("shopping_items").update({ done: !i.done }).eq("id", i.id);
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
        <button onClick={() => setEditList(current)} className="-mt-2 flex min-h-9 items-center gap-1 self-start text-sm text-muted">
          <EditIcon size={14} />แก้ชื่อ / ลบลิสต์ &quot;{current.name}&quot;
        </button>
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
