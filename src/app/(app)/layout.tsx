"use client";

import { HouseholdProvider, useHousehold } from "@/components/Household";
import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { usePathname } from "next/navigation";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const showNav = !path.startsWith("/slip");
  return (
    <HouseholdProvider>
      <div className={`mx-auto min-h-dvh max-w-md px-5 pt-6 ${showNav ? "pb-32" : "pb-8"}`}><ParentGate path={path}>{children}</ParentGate></div>
      {showNav && <BottomNav />}
    </HouseholdProvider>
  );
}

/** หน้าเงินและสลิปเป็นของพ่อแม่ ลูกไม่เห็น */
function ParentGate({ path, children }: { path: string; children: React.ReactNode }) {
  const { isParent } = useHousehold();
  if (!isParent && (path.startsWith("/money") || path.startsWith("/slip"))) {
    return (
      <div className="flex flex-col items-center gap-3 pt-24 text-center">
        <p className="text-4xl">🙈</p>
        <p className="font-display text-lg font-semibold">หน้านี้สำหรับพ่อแม่นะ</p>
        <Link href="/stars" className="btn-dark">ไปสมุดดาวของหนู ⭐</Link>
      </div>
    );
  }
  return <>{children}</>;
}
