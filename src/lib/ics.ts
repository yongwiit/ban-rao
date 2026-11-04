import { PEOPLE, type Who } from "./family";

export type FeedEvent = {
  id: string; title: string; starts_at: string; ends_at: string | null; all_day: boolean;
  who: Who; note: string | null; private: boolean; updated_at: string;
};

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** YYYYMMDD ตามเวลาไทย */
const thaiDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }).replace(/-/g, "");

/** พับบรรทัดยาวตามมาตรฐาน iCalendar (75 ไบต์) */
function fold(line: string): string {
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > 73) { out.push(cur); cur = " " + ch; } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n");
}

export function buildIcs(events: FeedEvent[]): string {
  const now = utc(new Date());
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ban-rao//TH", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:บ้านเรา", "X-WR-TIMEZONE:Asia/Bangkok", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
  ];
  for (const e of events) {
    const start = new Date(e.starts_at);
    lines.push("BEGIN:VEVENT", `UID:${e.id}@ban-rao`, `DTSTAMP:${now}`, `LAST-MODIFIED:${utc(new Date(e.updated_at))}`);
    if (e.all_day || e.ends_at) {
      const last = new Date(e.ends_at ?? e.starts_at);
      const endExclusive = new Date(`${last.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })}T12:00:00+07:00`);
      endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${thaiDay(start)}`, `DTEND;VALUE=DATE:${thaiDay(endExclusive)}`);
    } else {
      lines.push(`DTSTART:${utc(start)}`, `DTEND:${utc(new Date(start.getTime() + 60 * 60 * 1000))}`);
    }
    const who = PEOPLE[e.who]?.name ?? "";
    lines.push(`SUMMARY:${esc(`${e.title}${who && e.who !== "all" ? ` (${who})` : ""}`)}`);
    const desc = [e.note, e.private ? "🔒 เห็นคนเดียว" : null, "จากแอปบ้านเรา"].filter(Boolean).join("\n");
    lines.push(`DESCRIPTION:${esc(desc)}`);
    if (e.private) lines.push("CLASS:PRIVATE");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
