"use client";

import { useState } from "react";
import { useHousehold } from "./Household";
import { Sheet } from "./Sheet";
import { supabase } from "@/lib/supabase";
import { useLive } from "@/lib/useLive";
import { CATEGORIES, PERSONAL_CATEGORIES } from "@/lib/family";
import { ICON_PATHS, ICON_TONE, type IconKey } from "@/lib/categoryIcons";

export type Cat = { key: string; label: string; icon: IconKey; scope: "home" | "personal"; custom: boolean; id?: string };
type CustomRow = { id: string; name: string; icon: string; scope: "home" | "personal" };

const DEFAULT_ICON: Record<string, IconKey> = { pearl: "kid" };
const iconOf = (k: string): IconKey => (DEFAULT_ICON[k] ?? (k in ICON_PATHS ? k : "other")) as IconKey;
export const DEFAULT_CATS: Cat[] = Object.entries(CATEGORIES).map(([key, label]) => ({
  key, label, icon: iconOf(key), scope: PERSONAL_CATEGORIES.has(key) ? "personal" : "home", custom: false,
}));

/** หมวดทั้งหมดของบ้าน (ตั้งต้น + ที่สร้างเอง) */
export function useCategories() {
  const { household } = useHousehold();
  const custom = useLive<CustomRow>("expense_categories", household.id, () =>
    supabase().from("expense_categories").select("id, name, icon, scope").order("created_at"));
  const hidden = new Set(household.hidden_categories ?? []);
  const all: Cat[] = [
    ...DEFAULT_CATS,
    ...custom.rows.map((r) => ({ key: r.name, label: r.name, icon: (r.icon in ICON_PATHS ? r.icon : "other") as IconKey, scope: r.scope, custom: true, id: r.id })),
  ];
  const map = new Map(all.map((c) => [c.key, c]));
  const get = (k: string | null | undefined): Cat => map.get(k ?? "other") ?? { key: k ?? "other", label: k ?? "อื่นๆ", icon: "other", scope: "home", custom: true };
  return { all, visible: all.filter((c) => !hidden.has(c.key)), hidden, get, refresh: custom.refresh };
}

export function CatIcon({ icon, size = 36 }: { icon: IconKey; size?: number }) {
  const [fg, bg] = ICON_TONE[icon];
  return (
    <span className="flex shrink-0 items-center justify-center rounded-xl" style={{ width: size, height: size, background: bg }} aria-hidden>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke={fg} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d={ICON_PATHS[icon]} /></svg>
    </span>
  );
}

/** เลือกหมวด (มีไอคอน) + จัดการหมวด */
export function CategoryPicker({ value, onChange, label = "หมวด" }: { value: string; onChange: (c: Cat) => void; label?: string }) {
  const cats = useCategories();
  const [manage, setManage] = useState(false);
  const list = cats.visible.some((c) => c.key === value) ? cats.visible : [...cats.visible, cats.get(value)];
  return (
    <fieldset>
      <legend className="mb-1.5 flex w-full items-center justify-between text-sm font-medium">
        <span>{label}</span>
        <button type="button" className="text-xs font-normal text-muted underline" onClick={() => setManage(true)}>เพิ่ม / จัดการหมวด</button>
      </legend>
      <div className="grid grid-cols-4 gap-x-1 gap-y-2">
        {list.map((c) => (
          <button type="button" key={c.key} aria-pressed={value === c.key} onClick={() => onChange(c)}
            className={`flex flex-col items-center gap-1 rounded-2xl px-0.5 py-1.5 text-[11px] leading-tight ${value === c.key ? "bg-cocoa/10 ring-2 ring-cocoa" : ""}`}>
            <CatIcon icon={c.icon} size={36} />
            <span className="line-clamp-2 text-center">{c.label}</span>
          </button>
        ))}
      </div>
      <Sheet open={manage} onClose={() => setManage(false)} title="จัดการหมวด">
        {manage && <CategoryManager onPicked={(c) => { onChange(c); setManage(false); }} />}
      </Sheet>
    </fieldset>
  );
}

const ICON_CHOICES = Object.keys(ICON_PATHS) as IconKey[];

function CategoryManager({ onPicked }: { onPicked: (c: Cat) => void }) {
  const { household, reloadHousehold } = useHousehold();
  const cats = useCategories();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<IconKey>("other");
  const [scope, setScope] = useState<"home" | "personal">("home");
  const [msg, setMsg] = useState<string | null>(null);

  async function add() {
    const n = name.trim();
    if (!n) return setMsg("ตั้งชื่อหมวดก่อนนะ");
    if (cats.all.some((c) => c.label === n || c.key === n)) return setMsg("มีหมวดนี้อยู่แล้ว");
    const { error } = await supabase().from("expense_categories").insert({ name: n, icon, scope });
    if (error) return setMsg("เพิ่มไม่ได้ ลองใหม่อีกครั้ง");
    cats.refresh();
    onPicked({ key: n, label: n, icon, scope, custom: true });
  }
  async function toggleHidden(key: string) {
    const h = new Set(household.hidden_categories ?? []);
    if (h.has(key)) h.delete(key); else h.add(key);
    await supabase().from("households").update({ hidden_categories: [...h] }).eq("id", household.id);
    reloadHousehold();
  }
  async function remove(c: Cat) {
    if (!c.id) return;
    await supabase().from("expense_categories").delete().eq("id", c.id);
    cats.refresh();
  }
  async function setCustomScope(c: Cat, s: "home" | "personal") {
    if (!c.id) return;
    await supabase().from("expense_categories").update({ scope: s }).eq("id", c.id);
    cats.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-3">
        <span className="text-sm font-semibold">เพิ่มหมวดใหม่</span>
        <div className="flex items-center gap-2">
          <CatIcon icon={icon} size={44} />
          <input className="field" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ค่าเรียนพิเศษ" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ICON_CHOICES.map((k) => (
            <button type="button" key={k} aria-label={`ไอคอน ${k}`} aria-pressed={icon === k} onClick={() => setIcon(k)} className={`rounded-xl ${icon === k ? "ring-2 ring-cocoa" : ""}`}><CatIcon icon={k} size={34} /></button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <button type="button" className="chip" aria-pressed={scope === "home"} onClick={() => setScope("home")}>🏠 ของบ้าน</button>
          <button type="button" className="chip" aria-pressed={scope === "personal"} onClick={() => setScope("personal")}>🙋 ส่วนตัว</button>
        </div>
        {msg && <p role="alert" className="text-sm text-rose">{msg}</p>}
        <button type="button" className="btn-dark" onClick={add}>เพิ่มหมวด</button>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold">หมวดทั้งหมด</span>
        <span className="text-xs text-muted">ซ่อนหมวดที่ไม่ใช้ได้ (รายการเก่ายังอยู่ครบ) · หมวด &quot;ส่วนตัว&quot; จะตั้งเป็นจ่ายส่วนตัวให้อัตโนมัติ</span>
        {cats.all.map((c) => (
          <div key={c.key} className={`flex min-h-12 items-center gap-2.5 text-sm ${cats.hidden.has(c.key) ? "opacity-50" : ""}`}>
            <CatIcon icon={c.icon} size={32} />
            <span className="min-w-0 flex-1 truncate">{c.label}</span>
            {c.custom
              ? <button type="button" className="rounded-lg bg-sand px-2 py-1 text-xs" onClick={() => setCustomScope(c, c.scope === "home" ? "personal" : "home")}>{c.scope === "home" ? "🏠 บ้าน" : "🙋 ส่วนตัว"}</button>
              : <span className="text-xs text-muted">{c.scope === "home" ? "🏠 บ้าน" : "🙋 ส่วนตัว"}</span>}
            {c.custom
              ? <button type="button" className="min-h-10 px-2 text-xs text-rose" onClick={() => remove(c)}>ลบ</button>
              : <button type="button" className="min-h-10 px-2 text-xs underline" onClick={() => toggleHidden(c.key)}>{cats.hidden.has(c.key) ? "แสดง" : "ซ่อน"}</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
