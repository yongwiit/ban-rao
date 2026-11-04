"use client";

import { useState } from "react";
import { useHousehold } from "./Household";
import { Family } from "./Mascots";
import { MenuToggles } from "./MenuPicker";
import { MENUS } from "@/lib/menus";

type Step = { id: string; title: string };

/** ทัวร์สั้นๆ ตอนเข้าแอปครั้งแรก (แสดงครั้งเดียวต่อคน) */
export function Tour({ onClose }: { onClose: () => void }) {
  const { household, isParent, people } = useHousehold();
  const steps: Step[] = [
    { id: "hi", title: `ยินดีต้อนรับสู่${household.name || "บ้านเรา"} 🏡` },
    { id: "menus", title: "ในแอปมีอะไรบ้าง" },
    ...(isParent ? [{ id: "pick", title: "เลือกเมนูที่บ้านคุณใช้" }] : []),
    { id: "go", title: "พร้อมแล้ว!" },
  ];
  const [i, setI] = useState(0);
  const step = steps[i];
  const last = i === steps.length - 1;

  return (
    <div role="dialog" aria-modal="true" aria-label="วิธีใช้แอป" className="fixed inset-0 z-50 flex items-end justify-center bg-cocoa/40 sm:items-center">
      <div className="flex max-h-[92dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-[32px] bg-cream p-6 pb-[max(24px,env(safe-area-inset-bottom))] sm:rounded-[32px]">
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5" aria-label={`ขั้นที่ ${i + 1} จาก ${steps.length}`}>
            {steps.map((s, n) => <span key={s.id} className={`h-2 rounded-full transition-all ${n === i ? "w-6 bg-cocoa" : "w-2 bg-sand"}`} />)}
          </div>
          {!last && <button onClick={onClose} className="min-h-10 px-2 text-sm text-muted">ข้าม</button>}
        </div>

        <h2 className="font-display text-2xl font-bold">{step.title}</h2>

        {step.id === "hi" && (
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <Family size={64} happy people={people.list} />
            <p>แอปเล็กๆ ของครอบครัว ไว้ดูนัด จดของที่ต้องซื้อ และดูแลเงินในบ้านด้วยกัน</p>
            <p className="text-sm text-muted">ใช้เวลาแค่ 30 วินาที</p>
          </div>
        )}

        {step.id === "menus" && (
          <div className="flex flex-col gap-2">
            <Row emoji="🏠" name="วันนี้" desc="หน้าแรก สรุปทุกอย่างของวันนี้ในหน้าเดียว" />
            {MENUS.filter((m) => isParent || !m.parent).map((m) => <Row key={m.key} emoji={m.emoji} name={m.name} desc={m.desc} />)}
            <p className="text-sm text-muted">เมนูอยู่แถบล่างสุดของจอ ทุกอย่างที่ใครจดจะขึ้นให้ทุกคนเห็นทันที</p>
          </div>
        )}

        {step.id === "pick" && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted">ปิดเมนูที่ไม่ใช้ได้เลย เช่น บ้านที่ยังไม่มีลูกปิดสมุดดาวได้ เปลี่ยนใจทีหลังได้ที่ ตั้งค่า</p>
            <MenuToggles />
          </div>
        )}

        {step.id === "go" && (
          <div className="flex flex-col gap-3">
            <Tip emoji="🔔" text="เปิดแจ้งเตือนที่ ตั้งค่า (ไอคอนเฟืองมุมขวาบน) จะได้ไม่พลาดนัด" />
            {isParent && <Tip emoji="💌" text="ชวนอีกคนเข้าบ้านได้ที่ ตั้งค่า → ชวนเข้าบ้าน" />}
            <Tip emoji="📲" text="กด &quot;เพิ่มไปยังหน้าจอโฮม&quot; ในเบราว์เซอร์ จะเปิดแอปได้เหมือนแอปทั่วไป" />
          </div>
        )}

        <div className="mt-1 flex gap-2">
          {i > 0 && <button onClick={() => setI(i - 1)} className="btn-soft flex-1">ย้อนกลับ</button>}
          <button onClick={() => (last ? onClose() : setI(i + 1))} className="btn-dark flex-[2]">{last ? "เริ่มใช้เลย" : "ต่อไป"}</button>
        </div>
      </div>
    </div>
  );
}

function Row({ emoji, name, desc }: { emoji: string; name: string; desc: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5">
      <span className="text-2xl">{emoji}</span>
      <span className="flex flex-col"><span className="font-semibold">{name}</span><span className="text-xs text-muted">{desc}</span></span>
    </div>
  );
}

function Tip({ emoji, text }: { emoji: string; text: string }) {
  return <p className="flex items-start gap-3 rounded-2xl bg-white px-3 py-3 text-sm"><span className="text-xl">{emoji}</span><span>{text}</span></p>;
}

/** แสดงทัวร์อัตโนมัติแค่ครั้งแรก */
export function FirstTour() {
  const { tourDone, finishTour, userId } = useHousehold();
  const [seenHere] = useState(() => { try { return localStorage.getItem(`tour-done-${userId}`) === "1"; } catch { return false; } });
  if (tourDone || seenHere) return null;
  return <Tour onClose={finishTour} />;
}
