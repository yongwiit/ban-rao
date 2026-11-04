"use client";

import Link from "next/link";
import { useHousehold } from "@/components/Household";
import { InviteButtons } from "@/components/InviteButtons";
import { LineLink } from "@/components/LineLink";
import { CalendarLink } from "@/components/CalendarLink";
import { PushSetup } from "@/components/PushSetup";
import { BackIcon, ChevronIcon, WalletIcon } from "@/components/Icons";
import { PEOPLE } from "@/lib/family";
import { baht } from "@/lib/format";

export default function SettingsPage() {
  const { household, role, partnerJoined, signOut } = useHousehold();

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <Link href="/" aria-label="กลับ" className="flex size-11 items-center justify-center rounded-full bg-white"><BackIcon /></Link>
        <h1 className="font-display text-[26px] font-bold">ตั้งค่า</h1>
      </header>

      <section className="card flex flex-col gap-1 text-sm">
        <h2 className="font-display text-[17px] font-semibold">{household.name || "บ้านเรา"}</h2>
        <p className="text-muted">คุณคือ {PEOPLE[role].name} · {partnerJoined ? "อยู่ครบทั้งสองคนแล้ว" : "ยังรออีกคนเข้าบ้าน"}</p>
      </section>

      <PushSetup />

      <section className="card flex flex-col gap-2">
        <h2 className="font-display text-[17px] font-semibold">ชวนเข้าบ้าน · รหัส {household.join_code}</h2>
        <p className="text-sm text-muted">ส่งลิงก์ให้อีกคน กดแล้วสมัครเข้าบ้านนี้ได้เลย</p>
        <InviteButtons code={household.join_code} />
      </section>

      <LineLink />

      <CalendarLink />

      <Link href="/money" className="card flex items-center gap-3 text-sm">
        <span className="flex size-9 items-center justify-center rounded-xl bg-mint"><WalletIcon size={18} /></span>
        <span className="flex flex-1 flex-col">
          <span className="font-semibold">งบประจำเดือน</span>
          <span className="text-xs text-muted">{household.budget_enabled ? `ตั้งไว้ ${baht(Number(household.monthly_budget))} · ปรับได้ที่หน้าเงิน` : "ยังไม่ได้ตั้ง · ตั้งได้ที่หน้าเงิน"}</span>
        </span>
        <ChevronIcon />
      </Link>

      <button onClick={signOut} className="mt-2 min-h-11 text-sm text-muted underline">ออกจากระบบ</button>
    </div>
  );
}
