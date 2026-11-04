// ชื่อและสีของคนในบ้าน แก้ที่ไฟล์นี้ไฟล์เดียว
export type Who = "dad" | "mom" | "pearl" | "all";
export type Role = "dad" | "mom";
export type PaidFrom = "pot" | Role;

export const PEOPLE: Record<Who, { name: string; color: string; soft: string }> = {
  dad: { name: "พ่ออั้ม", color: "#5E8FC9", soft: "#D6E6F7" },
  mom: { name: "แม่แพ็ค", color: "#D9738F", soft: "#FBDCE4" },
  pearl: { name: "น้องเพิร์ล", color: "#D9941F", soft: "#FBE9B8" },
  all: { name: "ทั้งบ้าน", color: "#5FA37E", soft: "#DFF1E6" },
};

export const PAID_FROM: Record<PaidFrom, string> = {
  pot: "กองกลาง",
  dad: "พ่ออั้มออกก่อน",
  mom: "แม่แพ็คออกก่อน",
};

export const CATEGORIES = {
  home: "ของใช้ในบ้าน",
  food: "อาหาร",
  pearl: "น้องเพิร์ล",
  bill: "บิล",
  car: "รถ",
  gift: "ของขวัญ",
  other: "อื่นๆ",
} as const;
export type Category = keyof typeof CATEGORIES;

export const BILL_PERIODS = {
  monthly: { label: "ทุกเดือน", perYear: 12 },
  yearly: { label: "ปีละครั้ง", perYear: 1 },
  term: { label: "ต่อเทอม (ปีละ 2)", perYear: 2 },
} as const;
export type BillPeriod = keyof typeof BILL_PERIODS;

/** เงินที่ต้องกันไว้ต่อเดือนสำหรับบิลหนึ่งรายการ */
export function monthlySetAside(amount: number, period: BillPeriod): number {
  return (amount * BILL_PERIODS[period].perYear) / 12;
}
