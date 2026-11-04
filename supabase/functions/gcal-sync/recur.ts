// ตรรกะนัดซ้ำ ใช้ทั้งในแอปและใน edge function (ไฟล์นี้ต้องไม่ import อะไร)
export type Repeat = "none" | "daily" | "weekly" | "monthly" | "yearly";
export type RecurEvent = { starts_at: string; ends_at: string | null; all_day: boolean; repeat?: Repeat | null; remind_before?: number | null };

export const REPEAT_LABEL: Record<Repeat, string> = {
  none: "ไม่ซ้ำ", daily: "ทุกวัน", weekly: "ทุกสัปดาห์", monthly: "ทุกเดือน", yearly: "ทุกปี",
};

/** YYYY-MM-DD ตามเวลาไทย */
export function thDay(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}
/** HH:MM ตามเวลาไทย */
export function thHm(d: Date | string): string {
  return new Date(d).toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false });
}
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const dim = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m = 1..12

/** นัดนี้มีในวัน day (YYYY-MM-DD) ไหม */
export function occursOn(e: RecurEvent, day: string): boolean {
  const first = thDay(e.starts_at);
  const repeat = e.repeat ?? "none";
  if (repeat === "none") {
    const last = e.ends_at ? thDay(e.ends_at) : first;
    return day >= first && day <= last;
  }
  if (day < first) return false;
  const [, fm, fd] = first.split("-").map(Number);
  const [y, m, d] = day.split("-").map(Number);
  switch (repeat) {
    case "daily": return true;
    case "weekly": return new Date(`${day}T12:00:00Z`).getUTCDay() === new Date(`${first}T12:00:00Z`).getUTCDay();
    case "monthly": return d === Math.min(fd, dim(y, m));
    case "yearly": return m === fm && d === Math.min(fd, dim(y, m));
  }
  return false;
}

/** เวลาเริ่มของนัดในวัน day */
export function startOn(e: RecurEvent, day: string): Date {
  return new Date(`${day}T${e.all_day ? "00:00" : thHm(e.starts_at)}:00+07:00`);
}

/** เวลาที่ควรเตือนสำหรับรอบวัน day (นัดทั้งวันนับจาก 08:00 ของวันนั้น) */
export function fireOn(e: RecurEvent, day: string): Date | null {
  if (e.remind_before == null) return null;
  const base = e.all_day ? new Date(`${day}T08:00:00+07:00`) : startOn(e, day);
  return new Date(base.getTime() - e.remind_before * 60_000);
}

export const REMIND_OPTIONS: { value: number | null; label: string; allDay: string }[] = [
  { value: null, label: "ไม่เตือน", allDay: "ไม่เตือน" },
  { value: 0, label: "ตรงเวลานัด", allDay: "เช้าวันนั้น (8 โมง)" },
  { value: 15, label: "ก่อน 15 นาที", allDay: "" },
  { value: 30, label: "ก่อน 30 นาที", allDay: "" },
  { value: 60, label: "ก่อน 1 ชั่วโมง", allDay: "" },
  { value: 120, label: "ก่อน 2 ชั่วโมง", allDay: "" },
  { value: 1440, label: "ก่อน 1 วัน", allDay: "1 วันก่อน (8 โมง)" },
  { value: 2880, label: "ก่อน 2 วัน", allDay: "2 วันก่อน (8 โมง)" },
  { value: 10080, label: "ก่อน 1 สัปดาห์", allDay: "1 สัปดาห์ก่อน (8 โมง)" },
];

export function remindLabel(e: RecurEvent): string {
  const o = REMIND_OPTIONS.find((x) => x.value === (e.remind_before ?? null));
  if (!o) return `ก่อน ${e.remind_before} นาที`;
  return e.all_day ? o.allDay || o.label : o.label;
}
