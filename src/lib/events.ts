import type { EventRow } from "./types";
import { dayKey, thaiDate, thaiTime } from "./format";
import { REPEAT_LABEL, addDays, occursOn } from "./recur";

/** เงื่อนไข Supabase: นัดที่คาบเกี่ยวช่วง [start, end) รวมนัดหลายวัน และนัดซ้ำ */
export function overlapFilter(start: string): string {
  return `ends_at.gte.${start},and(ends_at.is.null,starts_at.gte.${start}),repeat.neq.none`;
}

/** วันที่นัดนี้มี ภายในช่วง from..to (YYYY-MM-DD รวมทั้งสองวัน) รองรับนัดซ้ำ */
export function eventDaysIn(e: EventRow, from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) if (occursOn(e, d)) out.push(d);
  return out;
}

/** ทุกวัน (YYYY-MM-DD ตามเวลาไทย) ที่นัดนี้ครอบคลุม */
export function eventDays(e: Pick<EventRow, "starts_at" | "ends_at">): string[] {
  const first = dayKey(e.starts_at);
  const last = e.ends_at ? dayKey(e.ends_at) : first;
  const out: string[] = [];
  for (let d = new Date(`${first}T12:00:00+07:00`); dayKey(d) <= last && out.length < 366; d.setUTCDate(d.getUTCDate() + 1)) out.push(dayKey(d));
  return out;
}

export function isMultiDay(e: Pick<EventRow, "starts_at" | "ends_at">): boolean {
  return !!e.ends_at && dayKey(e.ends_at) !== dayKey(e.starts_at);
}

/** ข้อความเวลา เช่น "09:00", "ทั้งวัน", "4–6 พ.ย. · วันที่ 2 จาก 3" */
export function eventWhen(e: EventRow, onDay?: string): string {
  if (isMultiDay(e)) {
    const days = eventDays(e);
    const range = `${thaiDate(e.starts_at, { day: "numeric", month: "short" })} – ${thaiDate(e.ends_at!, { day: "numeric", month: "short" })}`;
    const i = onDay ? days.indexOf(onDay) : -1;
    return i >= 0 ? `${range} · วันที่ ${i + 1} จาก ${days.length}` : `${range} (${days.length} วัน)`;
  }
  const t = e.all_day ? "ทั้งวัน" : thaiTime(e.starts_at);
  return e.repeat && e.repeat !== "none" ? `${t} · ${REPEAT_LABEL[e.repeat]}` : t;
}
