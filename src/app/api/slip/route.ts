import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/config";

export const maxDuration = 60;

const Slip = z.object({
  is_slip: z.boolean().describe("true ถ้าภาพเป็นสลิปโอนเงิน/จ่ายเงินจริง"),
  amount: z.number().nullable().describe("ยอดเงินบาท เป็นตัวเลข ไม่มีคอมม่า"),
  datetime: z.string().nullable().describe("วันเวลาที่โอน รูปแบบ YYYY-MM-DDTHH:mm ปี ค.ศ. เวลาไทย"),
  recipient: z.string().nullable().describe("ชื่อผู้รับเงินหรือร้านค้า"),
  bank: z.string().nullable().describe("ธนาคารหรือแอปของผู้โอน"),
  reference: z.string().nullable().describe("เลขที่รายการ/เลขอ้างอิง ตามที่พิมพ์ในสลิป"),
  category_guess: z.enum(["home", "food", "pearl", "bill", "car", "gift", "other"]).describe("เดาหมวดจากชื่อผู้รับ"),
});
export type SlipResult = z.infer<typeof Slip>;

const PROMPT = `อ่านสลิปโอนเงินของธนาคารไทยหรือพร้อมเพย์ในภาพนี้
- ปีในสลิปมักเป็น พ.ศ. ให้แปลงเป็น ค.ศ. (ลบ 543) เช่น 69 หรือ 2569 = 2026
- ถ้าเลขใดอ่านไม่ชัด ให้ใส่ null อย่าเดา
- หมวด: home ของใช้ในบ้าน/ซูเปอร์, food อาหาร/ร้านอาหาร, pearl ของลูก/โรงเรียน, bill ค่าน้ำไฟเน็ตประกัน, car น้ำมัน/รถ, gift ของขวัญ, other อื่นๆ`;

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  const url = SUPABASE_URL;
  const anon = SUPABASE_ANON_KEY;
  if (!token) return Response.json({ error: "ยังไม่ได้ล็อกอิน" }, { status: 401 });
  const { data: user } = await createClient(url, anon).auth.getUser(token);
  if (!user.user) return Response.json({ error: "ยังไม่ได้ล็อกอิน" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "ยังไม่ได้เปิดระบบอ่านสลิป กรอกยอดเองด้านล่างได้เลยนะ" }, { status: 500 });

  const { image, mediaType } = (await req.json()) as { image?: string; mediaType?: string };
  if (!image || image.length > 7_000_000) return Response.json({ error: "ไฟล์ภาพไม่ถูกต้องหรือใหญ่เกินไป" }, { status: 400 });
  const media = (["image/jpeg", "image/png", "image/webp"] as const).find((m) => m === mediaType) ?? "image/jpeg";

  try {
    const client = new Anthropic();
    const msg = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(Slip) },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: media, data: image } },
          { type: "text", text: PROMPT },
        ],
      }],
    });
    if (msg.stop_reason === "refusal" || !msg.parsed_output) {
      return Response.json({ error: "อ่านสลิปไม่ได้ ลองกรอกเองนะ" }, { status: 422 });
    }
    return Response.json(msg.parsed_output);
  } catch (e) {
    console.error("slip read failed", e);
    return Response.json({ error: "อ่านสลิปไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 502 });
  }
}
