"use client";

import { useState } from "react";
import { play, setSoundOn, soundOn } from "@/lib/sfx";

/** เปิด/ปิดเสียงในแอป (หัวใจ ดาว ฯลฯ) จำไว้ในเครื่องนี้ */
export function SoundToggle() {
  const [on, setOn] = useState(() => (typeof window === "undefined" ? true : soundOn()));
  return (
    <section className="card flex items-center justify-between gap-3">
      <div>
        <h2 className="font-display text-lg font-semibold">เสียงในแอป 🔊</h2>
        <p className="text-sm text-muted">เสียงตอนส่งหัวใจ ได้รับหัวใจ และให้ดาว</p>
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label="เสียงในแอป"
        onClick={() => { const v = !on; setSoundOn(v); setOn(v); if (v) play("heart"); }}
        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${on ? "bg-[#5FA37E]" : "bg-sand"}`}
      >
        <span className={`absolute top-1 size-6 rounded-full bg-white shadow transition-all ${on ? "left-7" : "left-1"}`} />
      </button>
    </section>
  );
}
