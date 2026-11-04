"use client";

import { useState } from "react";
import { useHousehold } from "./Household";
import { supabase } from "@/lib/supabase";
import { MENUS, type TabKey } from "@/lib/menus";

/** พ่อแม่เลือกเมนูที่บ้านนี้ใช้ ทุกคนในบ้านเห็นเหมือนกัน */
export function MenuToggles() {
  const { household, reloadHousehold } = useHousehold();
  const [hidden, setHidden] = useState<string[]>(household.hidden_tabs);
  const [err, setErr] = useState(false);

  async function toggle(k: TabKey) {
    const next = hidden.includes(k) ? hidden.filter((x) => x !== k) : [...hidden, k];
    setHidden(next);
    const { error } = await supabase().from("households").update({ hidden_tabs: next }).eq("id", household.id);
    if (error) { setErr(true); setHidden(hidden); return; }
    setErr(false);
    reloadHousehold();
  }

  return (
    <div className="flex flex-col gap-2">
      {MENUS.map((m) => {
        const on = !hidden.includes(m.key);
        return (
          <div key={m.key} className="flex items-center gap-3 rounded-2xl bg-sand/60 px-3 py-2.5">
            <span className="text-2xl">{m.emoji}</span>
            <span className="flex flex-1 flex-col">
              <span className="font-semibold">{m.name}</span>
              <span className="text-xs text-muted">{m.desc}</span>
            </span>
            <button
              role="switch"
              aria-checked={on}
              aria-label={`เมนู${m.name}`}
              onClick={() => toggle(m.key)}
              className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${on ? "bg-[#5FA37E]" : "bg-sand"}`}
            >
              <span className={`absolute top-1 size-6 rounded-full bg-white shadow transition-all ${on ? "left-7" : "left-1"}`} />
            </button>
          </div>
        );
      })}
      {err && <p role="alert" className="text-sm text-rose">บันทึกไม่ได้ ลองใหม่อีกครั้ง</p>}
    </div>
  );
}

export function MenuSettings({ onReplayTour }: { onReplayTour: () => void }) {
  return (
    <section className="card flex flex-col gap-3">
      <div>
        <h2 className="font-display text-lg font-semibold">เมนูที่บ้านเราใช้</h2>
        <p className="text-sm text-muted">ปิดเมนูที่ไม่ใช้ แอปจะดูง่ายขึ้น ข้อมูลเดิมไม่หาย เปิดกลับได้ทุกเมื่อ</p>
      </div>
      <MenuToggles />
      <button onClick={onReplayTour} className="min-h-10 text-sm text-muted underline">ดูวิธีใช้แอปอีกครั้ง</button>
    </section>
  );
}
