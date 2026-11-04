"use client";

import { useEffect, useRef, useState } from "react";
import { Sheet } from "./Sheet";
import { useHousehold } from "./Household";

const DEFAULTS: Record<string, string[]> = {
  home: ["history", "settle", "goals", "fixed", "list"],
  mine: ["cards", "history", "fixed", "list"],
};

/**
 * ค่าตั้งรายการ (string[]) ต่อแท็บ: เก็บบน server ตามบัญชี (members.ui_prefs)
 * ค่าที่เคยจำไว้ในเครื่องจะถูกย้ายขึ้น server ครั้งแรกที่เปิด
 */
function usePrefList(name: "money-order" | "money-hidden", scope: "home" | "mine") {
  const { uiPrefs, setUiPref } = useHousehold();
  const key = `${name}:${scope}`;
  const server = uiPrefs[key];
  useEffect(() => {
    if (Array.isArray(server)) return;
    try {
      const v = localStorage.getItem(`ban-rao:${key}`);
      if (v) setUiPref(key, JSON.parse(v));
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, Array.isArray(server)]);
  const list = Array.isArray(server) ? (server as string[]) : [];
  return [list, (next: string[]) => setUiPref(key, next)] as const;
}

/** ลำดับกล่องในหน้าเงินแยกตามแท็บ */
export function useSectionOrder(scope: "home" | "mine") {
  const [saved, set] = usePrefList("money-order", scope);
  const base = DEFAULTS[scope];
  const mine = saved.filter((k) => base.includes(k));
  const ids = [...mine, ...base.filter((k) => !mine.includes(k))];
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

/** กล่องที่ซ่อนไว้ แยกตามแท็บ */
export function useCollapsed(scope: "home" | "mine") {
  const [ids, set] = usePrefList("money-hidden", scope);
  return {
    has: (id: string) => ids.includes(id),
    toggle: (id: string) => set(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]),
  };
}
type Collapsed = ReturnType<typeof useCollapsed>;
type Section = { label: string; node: React.ReactNode; summary?: string; tone?: "ok" | "due" };

/** กดค้างที่กล่องไหนก็ได้ → เปิดหน้าเลื่อนกล่องขึ้น/ลง */
export function Reorderable({ order, sections, collapsed }: { order: Order; sections: Record<string, Section | null>; collapsed: Collapsed }) {
  const [open, setOpen] = useState<string | null>(null);
  const ids = order.ids.filter((k) => sections[k]);
  return (
    <>
      {ids.map((k) => {
        const sec = sections[k]!;
        return (
          <LongPress key={k} onLongPress={() => setOpen(k)}>
            {collapsed.has(k) ? (
              <button type="button" onClick={() => collapsed.toggle(k)} aria-expanded={false} aria-label={`แสดง${sec.label}`}
                className="card flex w-full items-center gap-2 py-3 text-left">
                <span className="flex-1 font-display text-[15px] font-semibold">{sec.label}</span>
                <span className={`text-sm ${sec.tone === "due" ? "font-semibold text-rose" : sec.tone === "ok" ? "text-[#3F8A5F]" : "font-semibold"}`}>{sec.summary ?? "แตะเพื่อแสดง"}</span>
                <span className="text-muted" aria-hidden>▾</span>
              </button>
            ) : (
              <div className="flex flex-col">
                {sec.node}
                <button type="button" onClick={() => collapsed.toggle(k)} aria-expanded aria-label={`ซ่อน${sec.label}`} className="-mt-1 min-h-8 self-end px-3 text-xs text-muted">ซ่อนกล่องนี้ ▴</button>
              </div>
            )}
          </LongPress>
        );
      })}
      <p className="text-center text-xs text-muted">กดค้างที่กล่องเพื่อเลื่อนขึ้นลง · กด &quot;ซ่อนกล่องนี้&quot; เพื่อย่อเหลือแค่ยอด</p>
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
