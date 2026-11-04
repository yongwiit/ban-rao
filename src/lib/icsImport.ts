import ICAL from "ical.js";
import type { Repeat } from "./recur";

export type ImportedEvent = {
  external_uid: string; title: string; starts_at: string; ends_at: string | null;
  all_day: boolean; note: string | null; repeat: Repeat;
};

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (t: ICAL.Time) => `${t.year}-${pad(t.month)}-${pad(t.day)}`;

/** แปลงเวลาใน .ics เป็น ISO (เวลาที่ไม่มีโซน ถือว่าเป็นเวลาไทย) */
function toIso(t: ICAL.Time): string {
  if (t.isDate) return new Date(`${ymd(t)}T00:00:00+07:00`).toISOString();
  const tz = t.zone?.tzid;
  if (tz && tz !== "floating" && (tz === "UTC" || ICAL.TimezoneService.has(tz))) return t.toJSDate().toISOString();
  return new Date(`${ymd(t)}T${pad(t.hour)}:${pad(t.minute)}:${pad(t.second)}+07:00`).toISOString();
}

/** วันสุดท้ายของนัดทั้งวัน (DTEND เป็นวันถัดไปแบบไม่รวม) */
function allDayEnd(start: ICAL.Time, end: ICAL.Time | null): string | null {
  if (!end) return null;
  const last = end.clone();
  last.adjust(-1, 0, 0, 0);
  if (last.compare(start) <= 0) return null;
  return new Date(`${ymd(last)}T23:59:00+07:00`).toISOString();
}

function simpleRepeat(rule: ICAL.Recur | null, start: ICAL.Time): Repeat | null {
  if (!rule) return "none";
  if ((rule.interval ?? 1) !== 1 || rule.count || rule.until) return null;
  const parts = Object.keys(rule.parts ?? {});
  const map: Record<string, Repeat> = { DAILY: "daily", WEEKLY: "weekly", MONTHLY: "monthly", YEARLY: "yearly" };
  const r = map[rule.freq ?? ""];
  if (!r) return null;
  if (parts.length === 0) return r;
  // WEEKLY;BYDAY=วันเดียวกับวันเริ่ม ก็ถือว่าซ้ำทุกสัปดาห์แบบธรรมดา
  const days = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const byday = rule.parts.BYDAY as string[] | undefined;
  if (r === "weekly" && parts.length === 1 && byday?.length === 1 && byday[0] === days[start.dayOfWeek() - 1]) return r;
  if (r === "monthly" && parts.length === 1 && (rule.parts.BYMONTHDAY as number[] | undefined)?.[0] === start.day) return r;
  return null;
}

/** อ่านไฟล์ .ics แล้วคืนรายการนัด (นัดซ้ำแบบซับซ้อนจะแตกเป็นรายครั้งในช่วง 1 ปีข้างหน้า) */
export function parseIcs(text: string, now = new Date()): ImportedEvent[] {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const tz of root.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(tz);
  const from = now.getTime() - 30 * 864e5;
  const to = now.getTime() + 366 * 864e5;
  const out: ImportedEvent[] = [];

  for (const v of root.getAllSubcomponents("vevent")) {
    if (v.hasProperty("recurrence-id")) continue;
    const ev = new ICAL.Event(v);
    const uid = ev.uid || `${ev.summary}-${ev.startDate?.toString()}`;
    if (!ev.startDate || uid.endsWith("@ban-rao")) continue; // ไม่ดึงนัดของบ้านเรากลับมาซ้ำ
    if (String(v.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED") continue;
    const title = (ev.summary || "(ไม่มีชื่อ)").slice(0, 200);
    const note = [ev.location, ev.description].filter(Boolean).join("\n").slice(0, 1000) || null;
    const allDay = ev.startDate.isDate;

    const make = (start: ICAL.Time, end: ICAL.Time | null, repeat: Repeat, key: string): ImportedEvent => {
      let ends: string | null = null;
      if (allDay) ends = allDayEnd(start, end);
      else if (end && ymd(end) !== ymd(start) && end.toJSDate().getTime() - start.toJSDate().getTime() > 864e5 / 2) ends = toIso(end);
      return { external_uid: key, title, starts_at: toIso(start), ends_at: repeat === "none" ? ends : null, all_day: allDay, note, repeat };
    };

    const rule = v.getFirstPropertyValue("rrule") as ICAL.Recur | null;
    const rep = simpleRepeat(rule, ev.startDate);
    if (rep === "none") {
      const s = new Date(toIso(ev.startDate)).getTime();
      const e = ev.endDate ? new Date(toIso(ev.endDate)).getTime() : s;
      if (e >= from && s <= to) out.push(make(ev.startDate, ev.endDate, "none", uid));
    } else if (rep) {
      out.push(make(ev.startDate, ev.endDate, rep, uid));
    } else {
      const it = ev.iterator();
      for (let i = 0, t = it.next(); t && i < 400; t = it.next(), i++) {
        const ms = toIso(t);
        const at = new Date(ms).getTime();
        if (at > to) break;
        if (at < from) continue;
        const d = ev.getOccurrenceDetails(t);
        out.push(make(d.startDate, d.endDate, "none", `${uid}#${ms}`));
        if (out.length > 3000) break;
      }
    }
    if (out.length > 3000) break;
  }
  return out;
}
