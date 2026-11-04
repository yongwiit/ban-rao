"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BagIcon, CalIcon, HomeIcon, WalletIcon } from "./Icons";

const TABS = [
  { href: "/", label: "วันนี้", Icon: HomeIcon },
  { href: "/calendar", label: "ปฏิทิน", Icon: CalIcon },
  { href: "/shopping", label: "ซื้อของ", Icon: BagIcon },
  { href: "/money", label: "เงิน", Icon: WalletIcon },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="เมนูหลัก" className="fixed inset-x-0 bottom-0 z-20 px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex h-[72px] max-w-md items-center justify-around rounded-[28px] bg-white shadow-[0_6px_20px_rgba(74,59,54,.10)]">
        {TABS.map(({ href, label, Icon }) => {
          const on = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? "page" : undefined}
              className={`flex min-h-12 min-w-16 flex-col items-center justify-center gap-0.5 rounded-2xl text-xs font-medium ${on ? "bg-peach text-cocoa" : "text-muted"}`}
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
