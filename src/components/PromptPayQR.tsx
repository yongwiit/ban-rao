"use client";

import { useEffect, useState } from "react";
import { maskPromptPay, promptPayPayload } from "@/lib/promptpay";
import { baht } from "@/lib/format";

/** QR พร้อมเพย์ใส่ยอดไว้แล้ว ให้อีกฝ่ายเปิดแอปธนาคารของตัวเองสแกนโอน (แอปเราไม่ยุ่งกับบัญชีธนาคาร) */
export function PromptPayQR({ id, amount, name }: { id: string; amount?: number; name: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    import("qrcode").then(({ toDataURL }) =>
      toDataURL(promptPayPayload(id, amount), { margin: 2, width: 560, errorCorrectionLevel: "M", color: { dark: "#2B211E", light: "#FFFFFF" } }),
    ).then((u) => { if (!off) setSrc(u); }).catch(() => setSrc(null));
    return () => { off = true; };
  }, [id, amount]);

  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl bg-white p-4 text-center">
      <span className="rounded-full bg-[#1A3A6B] px-3 py-1 text-xs font-semibold text-white">พร้อมเพย์ PromptPay</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt={`QR พร้อมเพย์ของ${name}`} className="size-56" /> : <div className="size-56 animate-pulse rounded-2xl bg-sand" />}
      <p className="font-semibold">{name} · {maskPromptPay(id)}</p>
      {amount ? <p className="font-display text-2xl font-bold">{baht(amount, 2)} บาท</p> : <p className="text-sm text-muted">คนโอนใส่ยอดเอง</p>}
      <p className="text-xs text-muted">
        เปิดแอปธนาคาร → สแกน QR จากเครื่องนี้ หรือแคปหน้าจอแล้วเลือก &quot;สแกนจากรูป&quot; · ตรวจชื่อผู้รับในแอปธนาคารก่อนยืนยันทุกครั้ง
      </p>
      {src && <a href={src} download={`promptpay-${name}.png`} className="btn-soft min-h-10 px-4 text-sm">บันทึกรูป QR</a>}
    </div>
  );
}
