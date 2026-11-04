"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useHousehold } from "@/components/Household";
import { Chick, Family } from "@/components/Mascots";
import { GearIcon, PlusIcon } from "@/components/Icons";
import { PEOPLE } from "@/lib/family";
import { baht, dayKey, monthRange, thaiDate, thaiTime } from "@/lib/format";
import { daysUntil, nextDue } from "@/lib/bills";
import { supabase } from "@/lib/supabase";
import { eventWhen, overlapFilter } from "@/lib/events";
import { occursOn } from "@/lib/recur";
import { isHouseholdSpend } from "@/lib/family";
import { useLive } from "@/lib/useLive";
import type { BillRow, EventRow, ExpenseRow, ItemRow } from "@/lib/types";

function greeting(h: number) {
  if (h < 11) return "สวัสดีตอนเช้า";
  if (h < 16) return "สวัสดีตอนบ่าย";
  return "สวัสดีตอนเย็น";
}

export default function TodayPage() {
  const { household } = useHousehold();
  const hid = household.id;
  const now = new Date();
  const today = dayKey(now);
  const { start, end } = monthRange(now.getFullYear(), now.getMonth());
  const dayStart = new Date(`${today}T00:00:00+07:00`).toISOString();
  const dayEnd = new Date(`${today}T23:59:59+07:00`).toISOString();

  const events = useLive<EventRow>("events", hid, () =>
    supabase().from("events").select("*").lte("starts_at", dayEnd).or(overlapFilter(dayStart)).order("starts_at"), [dayStart]);
  const items = useLive<ItemRow>("shopping_items", hid, () =>
    supabase().from("shopping_items").select("*").eq("done", false).order("created_at"));
  const bills = useLive<BillRow>("bills", hid, () => supabase().from("bills").select("*").eq("active", true));
  const spend = useLive<ExpenseRow>("expenses", hid, () =>
    supabase().from("expenses").select("*").eq("private", false).gte("spent_at", start).lt("spent_at", end), [start]);

  const monthTotal = spend.rows.filter(isHouseholdSpend).reduce((s, e) => s + Number(e.amount), 0);
  const pending = spend.rows.filter((e) => e.status === "pending").length;
  const dueSoon = useMemo(
    () =>
      bills.rows
        .filter((b) => b.due_day)
        .map((b) => ({ ...b, due: nextDue(b.due_day!) }))
        .filter((b) => daysUntil(b.due) <= 7)
        .sort((a, b) => a.due.getTime() - b.due.getTime()),
    [bills.rows],
  );
  const todays = events.rows.filter((e) => occursOn(e, today));
  const pearlEvent = todays.find((e) => e.who === "pearl");
  const budget = household.monthly_budget;
  const pct = budget > 0 ? Math.min(100, Math.round((monthTotal / budget) * 100)) : 0;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted">{thaiDate(now, { weekday: "long", day: "numeric", month: "short", year: "2-digit" })}</p>
          <h1 className="font-display text-[26px] font-bold whitespace-nowrap">{greeting(Number(thaiTime(now).slice(0, 2)))}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Family size={44} />
          <Link href="/settings" aria-label="ตั้งค่า" className="flex size-11 items-center justify-center rounded-full bg-white shadow-[0_4px_14px_rgba(74,59,54,.06)]"><GearIcon size={20} /></Link>
        </div>
      </header>

      {pearlEvent && (
        <div className="flex items-center gap-3 rounded-[20px] bg-white px-4 py-2.5 shadow-[0_4px_14px_rgba(74,59,54,.06)]">
          <Chick size={36} />
          <p className="text-sm">
            วันนี้{PEOPLE.pearl.name}มี{pearlEvent.title} {pearlEvent.all_day ? "" : `ตอน ${thaiTime(pearlEvent.starts_at)} `}อย่าลืมน้า
          </p>
        </div>
      )}

      <section className="card flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">นัดวันนี้</h2>
          <Link href="/calendar" className="text-sm text-muted">ดูปฏิทิน</Link>
        </div>
        {todays.length === 0 && <p className="text-sm text-muted">วันนี้ว่าง พักผ่อนได้เลย</p>}
        {todays.map((e) => (
          <div key={e.id} className="flex items-center gap-3">
            <span className="h-9 w-1.5 rounded-full" style={{ background: PEOPLE[e.who].color }} />
            <div className="flex flex-col">
              <span className="font-semibold">{e.title}</span>
              <span className="text-sm text-muted">{eventWhen(e, today)} · {PEOPLE[e.who].name}</span>
            </div>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/shopping" className="flex flex-col gap-1.5 rounded-3xl bg-mint p-4">
          <span className="font-display font-semibold">ต้องซื้อ</span>
          <span className="font-display text-3xl font-bold">{items.rows.length}</span>
          <span className="line-clamp-1 text-sm">{items.rows.slice(0, 3).map((i) => i.name).join(" ") || "ครบแล้ว"}</span>
        </Link>
        <Link href="/money" className="flex flex-col gap-1.5 rounded-3xl bg-peach p-4">
          <span className="font-display font-semibold">บิลใน 7 วัน</span>
          <span className="font-display text-3xl font-bold">{dueSoon.length}</span>
          <span className="line-clamp-1 text-sm">{dueSoon.map((b) => `${b.name} ${thaiDate(b.due, { day: "numeric", month: "short" })}`).join(" · ") || "ยังไม่มี"}</span>
        </Link>
      </div>

      <Link href="/money" className="card flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <span className="font-display font-semibold">เดือนนี้ใช้ไป</span>
          {household.budget_enabled && <span className="text-sm text-muted">งบ {baht(budget)} บาท</span>}
        </div>
        <span className="font-display text-[28px] font-bold">{baht(monthTotal)} <span className="text-base font-medium">บาท</span></span>
        {household.budget_enabled && (
          <div className="h-3 overflow-hidden rounded-full bg-sand"><div className="h-3 rounded-full bg-[#E9A0B4]" style={{ width: `${pct}%` }} /></div>
        )}
        {pending > 0 && <span className="text-sm">มี {pending} รายการจากสลิปรอตรวจ</span>}
      </Link>

      <Link href="/slip" className="btn-dark fixed bottom-[108px] right-6 z-10 shadow-[0_8px_20px_rgba(74,59,54,.25)]">
        <PlusIcon /> สลิป
      </Link>
    </div>
  );
}
