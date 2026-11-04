// ค่าสาธารณะของ Supabase (ค่านี้ส่งไปที่เบราว์เซอร์อยู่แล้ว ไม่ใช่ความลับ)
// Vercel Preview ใช้โปรเจกต์ Dev (ban-rao-dev) เสมอ เพื่อไม่ให้หน้าทดสอบแตะข้อมูลจริง
// Production และเครื่องตัวเองใช้ env ถ้าตั้งไว้ ไม่งั้นใช้ค่าเดิมของบ้านเรา
const IS_PREVIEW = process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";
const DEV_URL = "https://vajpmyzqyamnsvkrzxox.supabase.co";
const DEV_KEY = "sb_publishable_OGGSUG79WW9gBbqK9ea_Zg_qzg4D8uL";
export const SUPABASE_URL = IS_PREVIEW ? DEV_URL : process.env.NEXT_PUBLIC_SUPABASE_URL || "https://kzxiifuapumtnjpwcrxt.supabase.co";
export const SUPABASE_ANON_KEY = IS_PREVIEW ? DEV_KEY : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_yW4RcXG3a3O9rT83eUI51Q_FA1Mcr05";
// LINE OA ของบ้านเรา เช่น "@123abcde" (ใส่หลังสร้าง LINE OA แล้ว)
export const LINE_OA_ID = process.env.NEXT_PUBLIC_LINE_OA_ID || "";

/** กุญแจสาธารณะสำหรับ Web Push (คู่กับกุญแจลับที่เก็บใน Supabase) */
export const VAPID_PUBLIC_KEY = "BJjE-hd62z5BtXtRCcuGHAS5PpZPj1AMs0jBNGJ7mbd9IcBg4iCxKOpLDXIZ-MtjHh6yoGJpCfzQ2REJOifHAaY";
export const GOOGLE_LOGIN = false; // เปิดเมื่อตั้งค่า Google ใน Supabase เสร็จ
