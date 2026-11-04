"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BagIcon, CalIcon, HomeIcon, StarIcon, WalletIcon } from "./Icons";
import { useHousehold } from "./Household";

const TABS = [
  { href: "/", label: "วันนี้", Icon: HomeIcon },
  { href: "/calendar", label: "ปฏิทิน", Icon: CalIcon, tab: "calendar" as const },
  { href: "/shopping", label: "ซื้อของ", Icon: BagIcon, tab: "shopping" as const },
  { href: "/stars", label: "ดาว", Icon: StarIcon, tab: "stars" as const },
  { href: "/money", label: "เงิน", Icon: WalletIcon, parent: true, tab: "money" as const },
];

export function BottomNav() {
  const path = usePathname();
  const { isParent, shows } = useHousehold();
  return (
    <nav aria-label="เมนูหลัก" className="fixed inset-x-0 bottom-0 z-20 px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex h-[72px] max-w-md items-center justify-around rounded-[28px] bg-white shadow-[0_6px_20px_rgba(74,59,54,.10)]">
        {TABS.filter((t) => (isParent || !t.parent) && (!("tab" in t) || !t.tab || shows(t.tab))).map(({ href, label, Icon }) => {
          const on = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? "page" : undefined}
              className={`flex min-h-12 min-w-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-xs font-medium ${on ? "bg-peach text-cocoa" : "text-muted"}`}
            >
              <Icon />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
