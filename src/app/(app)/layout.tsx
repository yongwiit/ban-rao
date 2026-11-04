"use client";

import { HouseholdProvider } from "@/components/Household";
import { BottomNav } from "@/components/BottomNav";
import { usePathname } from "next/navigation";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const showNav = !path.startsWith("/slip");
  return (
    <HouseholdProvider>
      <div className={`mx-auto min-h-dvh max-w-md px-5 pt-6 ${showNav ? "pb-32" : "pb-8"}`}>{children}</div>
      {showNav && <BottomNav />}
    </HouseholdProvider>
  );
}
