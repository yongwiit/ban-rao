"use client";

import { useEffect, useRef, useState } from "react";
import { Sheet } from "./Sheet";

const DEFAULTS: Record<string, string[]> = {
  home: ["income", "history", "settle", "goals", "fixed", "list"],
  mine: ["income", "cards", "history", "fixed", "list"],
};
const KEY = (scope: string) => `ban-rao:money-order:${scope}`;

/** ลำดับกล่องในหน้าเงินแยกตามแท็บ (จำในเครื่องนี้) */
export function useSectionOrder(scope: "home" | "mine") {
  const [saved, setSaved] = useState<Record<string, string[]>>({});
  useEffect(() => {
    try {
      const r: Record<string, string[]> = {};
      for (const s of ["home", "mine"]) { const v = localStorage.getItem(KEY(s)); if (v) r[s] = JSON.parse(v); }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSaved(r);
    } catch { /* ไม่มี storage ก็ใช้ลำดับตั้งต้น */ }
  }, []);
  const base = DEFAULTS[scope];
  const mine = (saved[scope] ?? []).filter((k) => base.includes(k));
  const ids = [...mine, ...base.filter((k) => !mine.includes(k))];
  function set(next: string[]) {
    setSaved((s) => ({ ...s, [scope]: next }));
    try { localStorage.setItem(KEY(scope), JSON.stringify(next)); } catch { /* ignore */ }
  }
  return {
    ids,
    move(id: string, dir: -1 | 1) {
      const i = ids.indexOf(id), j = i + dir;
      if (i < 0 || j < 0 || j >= ids.length) return;
      const next = [...ids];
      [next[i], next[j]] = [next[j], next[i]];
      set(next);
    },
    reset: () => set(base),
  };
}

type Order = ReturnType<typeof useSectionOrder>;

/** กดค้างที่กล่องไหนก็ได้ → เปิดหน้าเลื่อนกล่องขึ้น/ลง */
export function Reorderable({ order, sections }: { order: Order; sections: Record<string, { label: string; node: React.ReactNode } | null> }) {
  const [open, setOpen] = useState<string | null>(null);
  const ids = order.ids.filter((k) => sections[k]);
  return (
    <>
      {ids.map((k) => <LongPress key={k} onLongPress={() => setOpen(k)}>{sections[k]!.node}</LongPress>)}
      <p className="text-center text-xs text-muted">กดค้างที่กล่องเพื่อเลื่อนขึ้นลง</p>
      <Sheet open={!!open} onClose={() => setOpen(null)} title="เลื่อนกล่อง">
        <div className="flex flex-col gap-2">
          {ids.map((k, i) => (
            <div key={k} className={`flex min-h-12 items-center gap-2 rounded-2xl px-3 text-sm ${k === open ? "bg-peach font-semibold" : "bg-sand"}`}>
              <span className="flex-1">{sections[k]!.label}</span>
              <button type="button" aria-label={`เลื่อน${sections[k]!.label}ขึ้น`} disabled={i === 0} onClick={() => { order.move(k, -1); setOpen(k); }} className="flex size-10 items-center justify-center rounded-xl bg-white text-lg disabled:opacity-30">▲</button>
              <button type="button" aria-label={`เลื่อน${sections[k]!.label}ลง`} disabled={i === ids.length - 1} onClick={() => { order.move(k, 1); setOpen(k); }} className="flex size-10 items-center justify-center rounded-xl bg-white text-lg disabled:opacity-30">▼</button>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <button type="button" className="btn-soft flex-1" onClick={order.reset}>คืนค่าเดิม</button>
            <button type="button" className="btn-dark flex-1" onClick={() => setOpen(null)}>เสร็จ</button>
          </div>
        </div>
      </Sheet>
    </>
  );
}

function LongPress({ onLongPress, children }: { onLongPress: () => void; children: React.ReactNode }) {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cancel = () => { if (t.current) clearTimeout(t.current); t.current = null; start.current = null; };
  return (
    <div
      className="select-none [-webkit-touch-callout:none]"
      onPointerDown={(e) => {
        fired.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        t.current = setTimeout(() => { fired.current = true; navigator.vibrate?.(15); onLongPress(); }, 550);
      }}
      onPointerMove={(e) => { if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel(); }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onContextMenu={(e) => { if (fired.current) e.preventDefault(); }}
      onClickCapture={(e) => { if (fired.current) { e.stopPropagation(); e.preventDefault(); fired.current = false; } }}
    >
      {children}
    </div>
  );
}
