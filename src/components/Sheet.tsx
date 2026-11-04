"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** แผ่นเลื่อนขึ้นจากด้านล่าง ใช้ <dialog> เพื่อให้กดปุ่ม Esc / โฟกัสถูกต้อง */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 mt-auto w-full max-w-none bg-transparent p-0 backdrop:bg-cocoa/30 sm:mx-auto sm:max-w-md"
    >
      <div className="mx-auto max-w-md rounded-t-[28px] bg-cream px-5 pt-5 pb-[max(24px,env(safe-area-inset-bottom))]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">{title}</h2>
          <button onClick={onClose} className="min-h-11 px-2 text-sm text-muted">ปิด</button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
