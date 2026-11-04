"use client";

import { useEffect, useState } from "react";
import { useHousehold } from "./Household";
import { CatIcon, useCategories } from "./Categories";
import { supabase } from "@/lib/supabase";
import { useLive } from "@/lib/useLive";
import { baht, thaiDate } from "@/lib/format";
import { play } from "@/lib/sfx";

type Req = {
  id: string; title: string; amount: number; bill_amount: number | null; months: number; repeat: "none" | "monthly" | "yearly";
  bill_mode: "home" | "person"; charged_on: string; card_name: string; from_role: string; category: string | null;
};

/** คำขอเรียกเก็บจากบัตรของอีกฝ่าย ที่รอฉันกดยืนยัน */
export function BillRequests() {
  const { household, people } = useHousehold();
  const cats = useCategories();
  // บัตรของอีกฝ่ายมองไม่เห็นโดยตรง จึงดึงผ่านฟังก์ชัน และดึงใหม่ทุกครั้งที่กลับมาเปิดแอป
  const reqs = useLive<Req>("card_charges", household.id, () => supabase().rpc("my_card_bill_requests"));
  const { refresh } = reqs;
  useEffect(() => {
    const on = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, [refresh]);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function respond(r: Req, accept: boolean) {
    setBusy(r.id);
    const { error } = await supabase().rpc("respond_card_bill", { p_charge: r.id, p_accept: accept });
    setBusy(null);
    if (error) return setDone("ทำรายการไม่ได้ ลองใหม่อีกครั้ง");
    if (accept) play("heart");
    setDone(accept ? `ยืนยันแล้ว ✓ บันทึก "${r.title}" ${r.bill_mode === "home" ? "เข้าเงินบ้าน" : "เป็นรายจ่ายส่วนตัวของคุณ"}แล้ว` : `ปฏิเสธ "${r.title}" แล้ว แจ้งกลับให้${people.get(r.from_role).name}รู้แล้ว`);
    reqs.refresh();
  }

  if (reqs.rows.length === 0 && !done) return null;
  return (
    <section className="card flex flex-col gap-3 border-2 border-butter">
      <h2 className="font-display text-[17px] font-semibold">🔔 รอคุณยืนยัน {reqs.rows.length > 0 ? `(${reqs.rows.length})` : ""}</h2>
      {done && <p role="status" className="text-sm text-[#3F8A5F]">{done}</p>}
      {reqs.rows.map((r) => {
        const from = people.get(r.from_role).name;
        const amt = r.bill_mode === "home" ? Number(r.amount) : Number(r.bill_amount ?? r.amount);
        const cat = cats.get(r.category);
        return (
          <div key={r.id} className="flex flex-col gap-2 rounded-2xl bg-sand p-3 text-sm">
            <div className="flex items-center gap-2.5">
              <CatIcon icon={cat.icon} size={38} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-semibold">{r.title}</span>
                <span className="text-xs text-muted">
                  {from}รูด{r.card_name.startsWith("บัตร") ? "" : "บัตร"}{r.card_name} · {thaiDate(r.charged_on, { day: "numeric", month: "short" })} · {cat.label}
                  {r.repeat === "monthly" ? " · ทุกเดือน" : r.repeat === "yearly" ? " · ทุกปี" : r.months > 1 ? ` · ผ่อน ${r.months} เดือน` : ""}
                </span>
              </span>
              <span className="font-display text-lg font-bold">{baht(amt)}</span>
            </div>
            <p className="text-xs">
              {r.bill_mode === "home"
                ? `${from}ขอใส่เข้าเงินบ้าน (${from}ออกไปก่อน แล้วหารกันในยอดเคลียร์)`
                : `${from}ขอเก็บจากคุณ ${baht(amt)} บาท${amt < Number(r.amount) ? ` จากยอด ${baht(Number(r.amount))}` : ""} · นับเป็นรายจ่ายส่วนตัวของคุณ`}
              {r.repeat !== "none" ? " · ยืนยันครั้งเดียว แอปจดให้เองทุกรอบ" : ""}
            </p>
            <div className="flex gap-2">
              <button className="btn-soft flex-1" disabled={busy === r.id} onClick={() => respond(r, false)}>ไม่ใช่ของฉัน</button>
              <button className="btn-dark flex-1" disabled={busy === r.id} onClick={() => respond(r, true)}>ยืนยัน</button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
