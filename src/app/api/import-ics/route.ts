import { parseIcs } from "@/lib/icsImport";

// อ่านปฏิทิน .ics จากลิงก์ (เช่น ที่อยู่ลับ iCal ของ Google Calendar) หรือจากไฟล์ที่ส่งมา
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { url?: string; ics?: string };
  let text = typeof body.ics === "string" ? body.ics : "";
  if (!text && typeof body.url === "string") {
    let url: URL;
    try { url = new URL(body.url.trim().replace(/^webcal:\/\//i, "https://")); } catch { return Response.json({ error: "ลิงก์ไม่ถูกต้อง" }, { status: 400 }); }
    const host = url.hostname;
    if (url.protocol !== "https:" || host === "localhost" || /^[\d.]+$/.test(host) || host.includes(":") || host.endsWith(".internal")) {
      return Response.json({ error: "ใช้ได้เฉพาะลิงก์ https ของปฏิทิน" }, { status: 400 });
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: "follow" });
      if (!res.ok) return Response.json({ error: `เปิดลิงก์ไม่ได้ (${res.status}) ลองคัดลอกลิงก์ใหม่` }, { status: 400 });
      text = await res.text();
    } catch {
      return Response.json({ error: "โหลดปฏิทินไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 400 });
    }
  }
  if (!text.includes("BEGIN:VCALENDAR")) return Response.json({ error: "ไม่ใช่ไฟล์ปฏิทิน (.ics)" }, { status: 400 });
  if (text.length > 8_000_000) return Response.json({ error: "ปฏิทินใหญ่เกินไป" }, { status: 400 });
  try {
    return Response.json({ events: parseIcs(text) });
  } catch {
    return Response.json({ error: "อ่านไฟล์ปฏิทินไม่ได้" }, { status: 400 });
  }
}
