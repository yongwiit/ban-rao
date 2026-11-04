const TZ = "Asia/Bangkok";

export function baht(n: number, digits = 0): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function thaiDate(d: Date | string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "2-digit" }): string {
  return new Date(d).toLocaleDateString("th-TH", { timeZone: TZ, ...opts });
}

export function thaiTime(d: Date | string): string {
  return new Date(d).toLocaleTimeString("th-TH", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}

/** YYYY-MM-DD ตามเวลาไทย */
export function dayKey(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-CA", { timeZone: TZ });
}

export function monthRange(year: number, month: number): { start: string; end: string } {
  // month: 0-11, ขอบเขตตามเวลาไทย (UTC+7)
  const start = new Date(Date.UTC(year, month, 1, -7));
  const end = new Date(Date.UTC(year, month + 1, 1, -7));
  return { start: start.toISOString(), end: end.toISOString() };
}
