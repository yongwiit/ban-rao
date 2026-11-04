"use client";

import { useState } from "react";
import { inviteLink, inviteText } from "@/lib/invite";

export function InviteButtons({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const text = inviteText(code);
    if (navigator.share) {
      try { await navigator.share({ title: "บ้านเรา", text }); return; } catch { /* ปิดหน้าแชร์ */ return; }
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex gap-2">
      <a className="flex min-h-11 flex-1 items-center justify-center rounded-full bg-[#06C755] px-4 text-sm font-semibold text-white"
        href={`https://line.me/R/share?text=${encodeURIComponent(inviteText(code))}`} target="_blank" rel="noreferrer">
        ส่งชวนทาง LINE
      </a>
      <button type="button" onClick={share} className="btn-soft min-h-11 flex-1 text-sm" aria-label={`แชร์ลิงก์เชิญ ${inviteLink(code)}`}>
        {copied ? "คัดลอกแล้ว" : "แชร์ / คัดลอกลิงก์"}
      </button>
    </div>
  );
}
