"use client";

import Link from "next/link";
import { LoveNotes } from "@/components/LoveNotes";
import { addDays } from "@/lib/recur";
import { daysUntil as daysTo, type Goal } from "@/components/Goals";
import { useHousehold } from "@/components/Household";
import { Mascot } from "@/components/Mascots";
import { FamilyPresence } from "@/components/Presence";
import { GearIcon, PlusIcon } from "@/components/Icons";
import { baht, dayKey, monthRange, thaiDate, thaiTime } from "@/lib/format";
import { daysUntil, nextDue } from "@/lib/bills";
import { supabase } from "@/lib/supabase";
import { eventWhen, overlapFilter } from "@/lib/events";
import { occursOn } from "@/lib/recur";
import { isHouseholdSpend } from "@/lib/family";
import { useLive } from "@/lib/useLive";
import { useCards } from "@/components/CreditCards";
import { cardSummary } from "@/lib/cards";
import type { BillRow, EventRow, ExpenseRow, ItemRow } from "@/lib/types";

function greeting(h: number) {
  if (h < 5) return "ดึกแล้วนะ 🌙";
  if (h < 11) return "อรุณสวัสดิ์ ☀️";
  if (h < 16) return "สวัสดีตอนบ่าย";
  if (h < 21) return "สวัสดีตอนเย็น";
  return "ฝันดีนะ 🌙";
}

/** วันถัดไปที่นัดนี้เกิด (ภายใน ~1 ปี) */
function nextOn(e: EventRow, today: string): string | null {
  for (let i = 0; i <= 400; i++) { const d = addDays(today, i); if (occursOn(e, d)) return d; }
  return null;
}

/** อารมณ์ตัวการ์ตูนตามงบเดือนนี้ */
function mood(pct: number, dayOfMonth: number, daysInMonth: number) {
  const pace = (dayOfMonth / daysInMonth) * 100;
  if (pct >= 100) return { face: "😵", happy: false, text: "เกินงบแล้ว ไม่เป็นไรนะ เดือนหน้าสู้ใหม่" };
  if (pct >= 80) return { face: "😅", happy: false, text: "ใกล้เต็มงบแล้ว ค่อยๆ ใช้นะ" };
  if (pct <= pace) return { face: "😊", happy: true, text: "ใช้เงินชิลๆ อยู่ในงบ เก่งมาก" };
  return { face: "🙂", happy: true, text: "ใช้เร็วกว่าปกตินิดนึง ยังไหวอยู่" };
}

export default function TodayPage() {
  const { household, userId, people, isParent, role, shows } = useHousehold();
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
  const marked = useLive<EventRow>("events", hid, () => supabase().from("events").select("*").eq("countdown", true));
  const goals = useLive<Goal>("savings_goals", isParent ? hid : undefined, () => supabase().from("savings_goals").select("*").eq("active", true).not("deadline", "is", null));
  const spend = useLive<ExpenseRow>("expenses", hid, () =>
    supabase().from("expenses").select("*").eq("private", false).gte("spent_at", start).lt("spent_at", end), [start]);

  const monthTotal = spend.rows.filter(isHouseholdSpend).reduce((s, e) => s + Number(e.amount), 0);
  const pending = spend.rows.filter((e) => e.status === "pending").length;
  const cards = useCards(isParent ? hid : undefined);
  const dueSoon = [
        // ข้ามบิลที่จดเดือนนี้ไปแล้ว (เช่น หักบัญชีอัตโนมัติ)
        ...bills.rows.filter((b) => b.due_day && !spend.rows.some((e) => e.bill_id === b.id)).map((b) => ({ name: b.name, due: nextDue(b.due_day!) })),
        // บิลบัตรเครดิตที่ตัดรอบแล้วและยังมียอด
        ...cards.cards.map((c) => ({ c, s: cardSummary(c, cards.charges.filter((x) => x.card_id === c.id), today) }))
          .filter(({ s }) => s.bill.closed && s.bill.amount > 0).map(({ c, s }) => ({ name: `💳${c.name}`, due: s.bill.due })),
  ]
    .filter((b) => daysUntil(b.due) <= 7)
    .sort((a, b) => a.due.getTime() - b.due.getTime());
  const todays = events.rows.filter((e) => occursOn(e, today));
  const kidEvent = todays.find((e) => people.get(e.who).kid);
  const budget = household.monthly_budget;
  const pct = budget > 0 ? Math.min(100, Math.round((monthTotal / budget) * 100)) : 0;
  const rawPct = budget > 0 ? (monthTotal / budget) * 100 : 0;
  const md = mood(rawPct, now.getDate(), new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate());
  const countdowns = [
    ...marked.rows.map((e) => { const d = nextOn(e, today); return d ? { key: e.id, title: e.title, days: daysTo(d), emoji: e.repeat === "yearly" ? "🎂" : "⏳", color: people.get(e.who).soft } : null; }),
    ...goals.rows.map((g) => ({ key: g.id, title: g.title, days: daysTo(g.deadline!), emoji: g.emoji, color: "#DFF1E6" })),
  ].filter((x): x is NonNullable<typeof x> => !!x && x.days >= 0 && x.days <= 365).sort((a, b) => a.days - b.days).slice(0, 3);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted">{thaiDate(now, { weekday: "long", day: "numeric", month: "short", year: "2-digit" })}</p>
          <h1 className="font-display text-[26px] font-bold leading-[1.45] mt-1 whitespace-nowrap">{greeting(Number(thaiTime(now).slice(0, 2)))}</h1>
        </div>
        <div className="flex items-center gap-2">
          <FamilyPresence me={userId} size={people.list.length > 3 ? 34 : 40} />
          <Link href="/settings" aria-label="ตั้งค่า" className="flex size-11 items-center justify-center rounded-full bg-white shadow-[0_4px_14px_rgba(74,59,54,.06)]"><GearIcon size={20} /></Link>
        </div>
      </header>

      {kidEvent && (
        <div className="flex items-center gap-3 rounded-[20px] bg-white px-4 py-2.5 shadow-[0_4px_14px_rgba(74,59,54,.06)]">
          <Mascot kind={people.get(kidEvent.who).mascot} size={36} />
          <p className="text-sm">
            วันนี้{people.get(kidEvent.who).name}มี{kidEvent.title} {kidEvent.all_day ? "" : `ตอน ${thaiTime(kidEvent.starts_at)} `}อย่าลืมน้า
          </p>
        </div>
      )}

      <LoveNotes />

      {countdowns.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {countdowns.map((c) => (
            <div key={c.key} className="flex min-w-[118px] flex-1 flex-col items-center rounded-3xl px-3 py-3 text-center" style={{ background: c.color }}>
              <span className="text-2xl">{c.emoji}</span>
              <span className="font-display text-2xl font-bold">{c.days === 0 ? "วันนี้!" : c.days}</span>
              {c.days > 0 && <span className="-mt-1 text-xs">วัน</span>}
              <span className="line-clamp-1 text-xs font-semibold">{c.title}</span>
            </div>
          ))}
        </div>
      )}

      {shows("calendar") && <section className="card flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">นัดวันนี้</h2>
          <Link href="/calendar" className="text-sm text-muted">ดูปฏิทิน</Link>
        </div>
        {todays.length === 0 && <p className="text-sm text-muted">วันนี้ว่าง พักผ่อนได้เลย</p>}
        {todays.map((e) => (
          <div key={e.id} className="flex items-center gap-3">
            <span className="h-9 w-1.5 rounded-full" style={{ background: people.get(e.who).color }} />
            <div className="flex flex-col">
              <span className="font-semibold">{e.title}</span>
              <span className="text-sm text-muted">{eventWhen(e, today)} · {people.get(e.who).name}</span>
            </div>
          </div>
        ))}
      </section>}

      <div className="grid grid-cols-2 gap-3 empty:hidden">
        {shows("shopping") && <Link href="/shopping" className="flex flex-col gap-1.5 rounded-3xl bg-mint p-4 only:col-span-2">
          <span className="font-display font-semibold">ต้องซื้อ</span>
          <span className="font-display text-3xl font-bold">{items.rows.length}</span>
          <span className="line-clamp-1 text-sm">{items.rows.slice(0, 3).map((i) => i.name).join(" ") || "ครบแล้ว"}</span>
        </Link>}
        {isParent ? shows("money") && <Link href="/money" className="flex flex-col gap-1.5 rounded-3xl bg-peach p-4 only:col-span-2">
          <span className="font-display font-semibold">บิลใน 7 วัน</span>
          <span className="font-display text-3xl font-bold">{dueSoon.length}</span>
          <span className="line-clamp-1 text-sm">{dueSoon.map((b) => `${b.name} ${thaiDate(b.due, { day: "numeric", month: "short" })}`).join(" · ") || "ยังไม่มี"}</span>
        </Link> : shows("stars") && <Link href="/stars" className="flex flex-col gap-1.5 rounded-3xl bg-[#FBE9B8] p-4 only:col-span-2">
          <span className="font-display font-semibold">สมุดดาว</span>
          <span className="font-display text-3xl font-bold">⭐</span>
          <span className="text-sm">ทำงานบ้าน สะสมดาว แลกรางวัล</span>
        </Link>}
      </div>

      {isParent && shows("money") && <><Link href="/money" className="card flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <span className="font-display font-semibold">เดือนนี้ใช้ไป</span>
          {household.budget_enabled && <span className="text-sm text-muted">งบ {baht(budget)} บาท</span>}
        </div>
        <span className="font-display text-[28px] font-bold">{baht(monthTotal)} <span className="text-base font-medium">บาท</span></span>
        {household.budget_enabled && (
          <>
            <div className="h-3 overflow-hidden rounded-full bg-sand"><div className="h-3 rounded-full bg-[#E9A0B4]" style={{ width: `${pct}%` }} /></div>
            <div className="flex items-center gap-2">
              <span className="relative"><Mascot kind={people.get(role).mascot} size={34} happy={md.happy} /><span className="absolute -right-1 -bottom-1 text-sm">{md.face}</span></span>
              <span className="text-sm">{md.text}</span>
            </div>
          </>
        )}
        {pending > 0 && <span className="text-sm">มี {pending} รายการจากสลิปรอตรวจ</span>}
      </Link>

      <Link href="/slip" className="btn-dark fixed bottom-[108px] right-6 z-10 shadow-[0_8px_20px_rgba(74,59,54,.25)]">
        <PlusIcon /> สลิป
      </Link></>}
    </div>
  );
}
