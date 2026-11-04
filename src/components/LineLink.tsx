"use client";

import { useState } from "react";
import { LINE_OA_ID } from "@/lib/config";
import { supabase } from "@/lib/supabase";

export function LineLink() {
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function getCode() {
    setBusy(true);
    const { data } = await supabase().rpc("my_line_link_code");
    setBusy(false);
    setCode(data as string);
  }

  return (
    <section className="card flex flex-col gap-2 text-sm">
      <h2 className="font-display text-[17px] font-semibold">จดผ่าน LINE</h2>
      <p className="text-muted">พิมพ์ในไลน์ เช่น &quot;ข้าวมันไก่ 60&quot; หรือ &quot;ซื้อ ไข่&quot; แล้วจะขึ้นในแอปเอง</p>
      {LINE_OA_ID && (
        <a href={`https://line.me/R/ti/p/${encodeURIComponent(LINE_OA_ID)}`} target="_blank" rel="noreferrer"
          className="flex min-h-11 items-center justify-center rounded-full bg-[#06C755] font-semibold text-white">1. แอดเพื่อน LINE บ้านเรา</a>
      )}
      {code ? (
        <div className="rounded-2xl bg-mint px-3 py-2 text-center">
          <p>{LINE_OA_ID ? "2. " : ""}ส่งรหัสนี้ในแชท LINE บ้านเรา (ใช้ได้ 30 นาที)</p>
          <p className="font-display text-3xl font-bold tracking-[0.3em]">{code}</p>
        </div>
      ) : (
        <button onClick={getCode} disabled={busy} className="btn-soft min-h-11">{LINE_OA_ID ? "2. " : ""}ขอรหัสเชื่อม LINE</button>
      )}
    </section>
  );
}
