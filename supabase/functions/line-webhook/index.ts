// LINE บ้านเรา: รับข้อความจาก LINE OA แล้วบันทึกลงแอป
// ตั้ง secret: LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN (และ ANTHROPIC_API_KEY ถ้าจะอ่านสลิป)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import Anthropic from "npm:@anthropic-ai/sdk@1.4.0";
import { betaZodOutputFormat } from "npm:@anthropic-ai/sdk@1.4.0/helpers/beta/zod";
import { z } from "npm:zod@4.6.7";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const SECRET = Deno.env.get("LINE_CHANNEL_SECRET") ?? "";
const TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ?? "";
const APP = "https://ban-rao.vercel.app";

const NAMES = { dad: "พ่ออั้ม", mom: "แม่แพ็ค" } as const;
const PAID = { pot: "กองกลาง", dad: "พ่ออั้มออกก่อน", mom: "แม่แพ็คออกก่อน", personal: "จ่ายส่วนตัว" } as const;
const CATS: Record<string, string> = { home: "ของใช้ในบ้าน", food: "อาหาร", pearl: "น้องเพิร์ล", bill: "บิล", car: "รถ", gift: "ของขวัญ", other: "อื่นๆ" };
const GUESS: [RegExp, string][] = [
  [/ข้าว|กาแฟ|ชา|ก๋วยเตี๋ยว|อาหาร|ขนม|ร้านอาหาร|ส้มตำ|หมู|ไก่|ปลา|ผัก|ผลไม้|น้ำดื่ม|ชาบู|บุฟเฟ่|grab ?food|lineman|foodpanda/i, "food"],
  [/น้ำมัน|ปตท|ptt|เชลล์|shell|บางจาก|ทางด่วน|ล้างรถ|ซ่อมรถ|ที่จอด|รถ/i, "car"],
  [/ค่าไฟ|ค่าน้ำ|เน็ต|internet|ais|true|dtac|ประกัน|บิล|ค่าเช่า|ผ่อน/i, "bill"],
  [/เพิร์ล|ลูก|โรงเรียน|ค่าเทอม|นม ?ผง|ผ้าอ้อม|ของเล่น|เรียนพิเศษ/i, "pearl"],
  [/ของขวัญ|วันเกิด|ครบรอบ/i, "gift"],
  [/lotus|โลตัส|big ?c|บิ๊กซี|makro|แม็คโคร|7-?11|เซเว่น|tops|ท็อปส์|ซูเปอร์|ทิชชู่|ผงซักฟอก|สบู่|ยาสีฟัน|ของใช้/i, "home"],
];

const baht = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const HELP = `วิธีใช้ LINE บ้านเรา 🏠
• จดรายจ่าย: พิมพ์ชื่อกับยอด เช่น "ข้าวมันไก่ 60"
   ใส่คำว่า "กองกลาง" หรือ "ส่วนตัว" เพิ่มได้ เช่น "ค่าไฟ 1800 กองกลาง"
   (ถ้าไม่ใส่ จะนับว่าคุณออกก่อน)
• เพิ่มของที่ต้องซื้อ: "ซื้อ ไข่" หรือ "ซื้อ นม, ทิชชู่"
• ดูยอดเดือนนี้: "สรุป"
• ส่งรูปสลิปโอนเงิน: ระบบจะอ่านแล้วบันทึกให้ (ถ้าเปิดระบบอ่านสลิปแล้ว)`;

async function verify(body: string, sig: string | null): Promise<boolean> {
  if (!sig || !SECRET) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  const expected = btoa(String.fromCharCode(...mac));
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

async function reply(replyToken: string, text: string) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text: text.slice(0, 4900) }] }),
  });
}

type Member = { user_id: string; household_id: string; role: "dad" | "mom" };
async function memberFor(lineUserId: string): Promise<Member | null> {
  const { data: link } = await db.from("line_links").select("user_id").eq("line_user_id", lineUserId).maybeSingle();
  if (!link) return null;
  const { data: m } = await db.from("members").select("user_id, household_id, role").eq("user_id", link.user_id).maybeSingle();
  return (m as Member) ?? null;
}

function monthStartBangkok(): string {
  const now = new Date(Date.now() + 7 * 3600_000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, -7)).toISOString();
}

async function monthTotal(hid: string): Promise<number> {
  const { data } = await db.from("expenses").select("amount, paid_from, private").eq("household_id", hid).gte("spent_at", monthStartBangkok());
  return (data ?? []).filter((e) => !e.private && e.paid_from !== "personal").reduce((s, e) => s + Number(e.amount), 0);
}

async function link(lineUserId: string, code: string): Promise<string> {
  const { data: row } = await db.from("line_link_codes").select("user_id, expires_at").eq("code", code).maybeSingle();
  if (!row || new Date(row.expires_at) < new Date()) return "รหัสไม่ถูกต้องหรือหมดอายุแล้ว ลองกดขอรหัสใหม่ในแอปหน้าเงินนะ";
  await db.from("line_links").delete().or(`line_user_id.eq.${lineUserId},user_id.eq.${row.user_id}`);
  await db.from("line_links").insert({ line_user_id: lineUserId, user_id: row.user_id });
  await db.from("line_link_codes").update({ expires_at: new Date().toISOString() }).eq("code", code);
  const { data: m } = await db.from("members").select("role").eq("user_id", row.user_id).maybeSingle();
  return `เชื่อมกับบ้านเราแล้ว 🎉 สวัสดี${m ? NAMES[m.role as "dad" | "mom"] : ""}\n\n${HELP}`;
}

async function addExpense(m: Member, text: string): Promise<string | null> {
  // ใช้ตัวเลขตัวสุดท้ายเป็นยอด เช่น "7-11 120" = 120
  const all = [...text.matchAll(/(\d[\d,]*(?:\.\d{1,2})?)\s*(?:บาท|฿|บ\.?)?/g)];
  const num = all[all.length - 1];
  if (!num) return null;
  const amount = Number(num[1].replace(/,/g, ""));
  if (!(amount > 0) || amount > 10_000_000) return null;
  let rest = (text.slice(0, num.index) + " " + text.slice(num.index! + num[0].length)).trim();
  let paid: keyof typeof PAID = m.role;
  if (/กองกลาง/.test(rest)) { paid = "pot"; rest = rest.replace(/กองกลาง/g, ""); }
  else if (/ส่วนตัว/.test(rest)) { paid = "personal"; rest = rest.replace(/ส่วนตัว/g, ""); }
  const merchant = rest.replace(/\s+/g, " ").trim().slice(0, 80);
  const category = GUESS.find(([re]) => re.test(merchant))?.[1] ?? "other";
  const { error } = await db.from("expenses").insert({
    household_id: m.household_id, created_by: m.user_id, amount, merchant, category, paid_from: paid, status: "confirmed",
  });
  if (error) return `บันทึกไม่สำเร็จ: ${error.message}`;
  const total = await monthTotal(m.household_id);
  return `บันทึกแล้ว ✅\n${merchant || CATS[category]} ${baht(amount)} บาท\nหมวด ${CATS[category]} · ${PAID[paid]}\n\nเดือนนี้บ้านใช้ไป ${baht(total)} บาท\nแก้หมวดหรือยอดได้ในแอป ${APP}/money`;
}

async function addShopping(m: Member, text: string): Promise<string> {
  const names = text.replace(/^(ซื้อ|\+)\s*/, "").split(/[,\n、]+|\s+และ\s+/).map((s) => s.trim()).filter(Boolean).slice(0, 20);
  if (!names.length) return 'พิมพ์ของที่ต้องซื้อต่อท้าย เช่น "ซื้อ ไข่"';
  const { data: list } = await db.from("shopping_lists").select("id, name").eq("household_id", m.household_id).order("sort").limit(1).maybeSingle();
  if (!list) return "ยังไม่มีลิสต์ซื้อของ สร้างในแอปก่อนนะ";
  await db.from("shopping_items").insert(names.map((name) => ({ list_id: list.id, household_id: m.household_id, name, created_by: m.user_id })));
  return `เพิ่มในลิสต์ "${list.name}" แล้ว 🛒\n${names.map((n) => `• ${n}`).join("\n")}`;
}

async function summary(m: Member): Promise<string> {
  const [{ data: hh }, total, { count }] = await Promise.all([
    db.from("households").select("monthly_budget, budget_enabled").eq("id", m.household_id).single(),
    monthTotal(m.household_id),
    db.from("shopping_items").select("id", { count: "exact", head: true }).eq("household_id", m.household_id).eq("done", false),
  ]);
  const budget = Number(hh?.monthly_budget ?? 0);
  const left = hh?.budget_enabled ? `\nงบ ${baht(budget)} · ${total <= budget ? `เหลือ ${baht(budget - total)}` : `เกินงบ ${baht(total - budget)}`} บาท` : "";
  return `สรุปเดือนนี้ 📊\nบ้านใช้ไป ${baht(total)} บาท${left}\nของที่ต้องซื้อ ${count ?? 0} อย่าง\n\nดูละเอียดในแอป ${APP}/money`;
}

const Slip = z.object({
  is_slip: z.boolean(),
  amount: z.number().nullable(),
  datetime: z.string().nullable().describe("YYYY-MM-DDTHH:mm ปี ค.ศ. เวลาไทย"),
  recipient: z.string().nullable(),
  bank: z.string().nullable(),
  reference: z.string().nullable(),
  category_guess: z.enum(["home", "food", "pearl", "bill", "car", "gift", "other"]),
});

async function readSlip(m: Member, messageId: string): Promise<string> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return 'ตอนนี้ยังไม่ได้เปิดระบบอ่านสลิป 🙏 พิมพ์ยอดมาแทนได้เลย เช่น "ข้าวมันไก่ 60"';
  const img = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, { headers: { authorization: `Bearer ${TOKEN}` } });
  if (!img.ok) return "เปิดรูปไม่ได้ ลองส่งใหม่อีกครั้งนะ";
  const buf = new Uint8Array(await img.arrayBuffer());
  if (buf.length > 5_000_000) return "รูปใหญ่เกินไป ลองส่งเป็นภาพหน้าจอแทนนะ";
  let b64 = "";
  for (let i = 0; i < buf.length; i += 0x8000) b64 += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  b64 = btoa(b64);
  const type = img.headers.get("content-type") ?? "image/jpeg";
  const media = (["image/jpeg", "image/png", "image/webp"] as const).find((t) => type.startsWith(t)) ?? "image/jpeg";

  const msg = await new Anthropic({ apiKey: key }).beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(Slip) },
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: media, data: b64 } },
      { type: "text", text: "อ่านสลิปโอนเงินของธนาคารไทยหรือพร้อมเพย์ในภาพนี้ ปีในสลิปมักเป็น พ.ศ. ให้แปลงเป็น ค.ศ. ถ้าอ่านไม่ชัดให้ใส่ null อย่าเดา" },
    ] }],
  });
  const r = msg.stop_reason === "refusal" ? null : msg.parsed_output;
  if (!r || !r.is_slip || !r.amount) return 'อ่านสลิปนี้ไม่ได้ ลองพิมพ์ยอดมาแทนนะ เช่น "ข้าวมันไก่ 60"';
  const spent_at = r.datetime && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(r.datetime) ? new Date(`${r.datetime.slice(0, 16)}:00+07:00`).toISOString() : new Date().toISOString();
  const { error } = await db.from("expenses").insert({
    household_id: m.household_id, created_by: m.user_id, amount: r.amount, spent_at, merchant: r.recipient ?? "",
    category: r.category_guess, paid_from: m.role, status: "pending", bank: r.bank,
    slip_ref: r.reference ? `${r.bank ?? ""}:${r.reference}` : null,
  });
  if (error?.code === "23505") return "สลิปนี้เคยบันทึกไปแล้ว 👍";
  if (error) return `บันทึกไม่สำเร็จ: ${error.message}`;
  return `อ่านสลิปแล้ว ✅ บันทึกเป็น "รอตรวจ"\n${r.recipient ?? ""} ${baht(r.amount)} บาท · ${CATS[r.category_guess]} · ${PAID[m.role]}\nตรวจหรือแก้ได้ในแอป ${APP}/money`;
}

async function handle(ev: { type: string; replyToken?: string; source?: { userId?: string }; message?: { type: string; text?: string; id: string } }) {
  if (!ev.replyToken || !ev.source?.userId) return;
  const uid = ev.source.userId;
  if (ev.type === "follow") return reply(ev.replyToken, `สวัสดีจากบ้านเรา 🏠\nเชื่อมบัญชีก่อนนะ: เปิดแอป ${APP}/money กด "เชื่อม LINE" แล้วพิมพ์รหัส 6 หลักที่ได้ส่งมาที่นี่`);
  if (ev.type !== "message" || !ev.message) return;
  const text = (ev.message.text ?? "").trim();

  const code = text.match(/^(?:ผูก|เชื่อม|link)?\s*(\d{6})$/i);
  if (code) return reply(ev.replyToken, await link(uid, code[1]));

  const m = await memberFor(uid);
  if (!m) return reply(ev.replyToken, `ยังไม่ได้เชื่อมกับบ้าน 🙏 เปิดแอป ${APP}/money กด "เชื่อม LINE" แล้วพิมพ์รหัส 6 หลักที่ได้ส่งมาที่นี่`);

  if (ev.message.type === "image") return reply(ev.replyToken, await readSlip(m, ev.message.id));
  if (ev.message.type !== "text") return reply(ev.replyToken, HELP);
  if (/^(ช่วย|วิธีใช้|help|\?)$/i.test(text)) return reply(ev.replyToken, HELP);
  if (/^(สรุป|ยอด|เดือนนี้)$/.test(text)) return reply(ev.replyToken, await summary(m));
  if (/^(ซื้อ|\+)/.test(text)) return reply(ev.replyToken, await addShopping(m, text));
  const saved = await addExpense(m, text);
  return reply(ev.replyToken, saved ?? `ไม่เข้าใจข้อความนี้ 😅\n\n${HELP}`);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const body = await req.text();
  if (!(await verify(body, req.headers.get("x-line-signature")))) return new Response("bad signature", { status: 401 });
  const { events = [] } = JSON.parse(body);
  await Promise.all(events.map((e: Parameters<typeof handle>[0]) => handle(e).catch((err) => console.error(err))));
  return new Response("ok");
});
