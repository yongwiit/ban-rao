import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/config";
import { buildIcs, type FeedEvent } from "@/lib/ics";

// ลิงก์ปฏิทินสำหรับ Google / Samsung / Apple Calendar (สมัครรับแบบอ่านอย่างเดียว)
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const clean = token.replace(/\.ics$/, "");
  if (!/^[a-f0-9]{32,}$/.test(clean)) return new Response("not found", { status: 404 });
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const [{ data, error }, { data: ppl }] = await Promise.all([
    db.rpc("calendar_feed_v2", { p_token: clean }),
    db.rpc("calendar_people", { p_token: clean }),
  ]);
  if (error) return new Response("error", { status: 500 });
  const names = Object.fromEntries(((ppl ?? []) as { key: string; name: string }[]).map((p) => [p.key, p.name]));
  return new Response(buildIcs((data ?? []) as FeedEvent[], names), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="ban-rao.ics"',
      "cache-control": "no-store",
    },
  });
}
