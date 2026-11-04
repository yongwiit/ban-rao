// ค่าสาธารณะของ Supabase (ค่านี้ส่งไปที่เบราว์เซอร์อยู่แล้ว ไม่ใช่ความลับ)
// ถ้าตั้ง env ไว้ใน Vercel จะใช้ค่าจาก env ก่อน
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://kzxiifuapumtnjpwcrxt.supabase.co";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_yW4RcXG3a3O9rT83eUI51Q_FA1Mcr05";
// LINE OA ของบ้านเรา เช่น "@123abcde" (ใส่หลังสร้าง LINE OA แล้ว)
export const LINE_OA_ID = process.env.NEXT_PUBLIC_LINE_OA_ID || "";

/** กุญแจสาธารณะสำหรับ Web Push (คู่กับกุญแจลับที่เก็บใน Supabase) */
export const VAPID_PUBLIC_KEY = "BJjE-hd62z5BtXtRCcuGHAS5PpZPj1AMs0jBNGJ7mbd9IcBg4iCxKOpLDXIZ-MtjHh6yoGJpCfzQ2REJOifHAaY";
