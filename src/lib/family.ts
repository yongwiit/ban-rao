// คนในบ้าน: ชื่อ ตัวการ์ตูน และสี แก้ได้ในหน้าตั้งค่า (ตาราง household_people)
/** dad, mom = พ่อแม่ (ผูกกับบัญชี), pearl = ลูกคนแรก, kid2.. = ลูกคนต่อไป, all = ทั้งบ้าน */
export type Who = string;
export type Role = "dad" | "mom";
/** บทบาทในบัญชี: dad, mom หรือ key ของลูก */
export type MemberRole = string;
export const isParentRole = (r: string): r is Role => r === "dad" || r === "mom";
export type PaidFrom = "pot" | Role | "personal";

export const MASCOTS = ["bear", "bunny", "chick", "cat", "puppy", "panda", "piggy", "frog"] as const;
export type MascotKind = (typeof MASCOTS)[number];
export const MASCOT_LABEL: Record<MascotKind, string> = {
  bear: "หมี", bunny: "กระต่าย", chick: "ลูกเจี๊ยบ", cat: "แมว", puppy: "หมา", panda: "แพนด้า", piggy: "หมู", frog: "กบ",
};
export const COLORS = ["#5E8FC9", "#D9738F", "#D9941F", "#8A6FC7", "#3FA39B", "#E07B4F", "#7A9A3A", "#B5657A"];

export type Person = { key: string; name: string; mascot: MascotKind; color: string; soft: string; kid: boolean; promptpay?: string | null };

/** สีอ่อนจากสีหลัก (ผสมขาว 80%) */
export function softOf(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * 0.8).toString(16).padStart(2, "0");
  return `#${mix(n >> 16)}${mix((n >> 8) & 255)}${mix(n & 255)}`;
}
export function person(key: string, name: string, mascot: MascotKind, color: string): Person {
  return { key, name, mascot, color, soft: softOf(color), kid: key !== "dad" && key !== "mom" };
}

export const DEFAULT_PEOPLE: Person[] = [
  person("dad", "พ่อหมี", "bear", "#5E8FC9"),
  person("mom", "แม่กระต่าย", "bunny", "#D9738F"),
  person("pearl", "ลูกเจี๊ยบ", "chick", "#D9941F"),
];
export const EVERYONE: Person = { key: "all", name: "ทั้งบ้าน", mascot: "bear", color: "#5FA37E", soft: "#DFF1E6", kid: false };

/** ตัวช่วยค้นคนจาก key (ถ้าลบลูกไปแล้ว แสดงเป็นทั้งบ้าน) */
export type People = { list: Person[]; get: (key: string) => Person };
export function makePeople(list: Person[]): People {
  const map = new Map(list.map((p) => [p.key, p]));
  return { list, get: (k) => (k === "all" ? EVERYONE : map.get(k) ?? EVERYONE) };
}

export function paidFromLabel(p: PaidFrom, people: People): string {
  if (p === "pot") return "กองกลาง";
  if (p === "personal") return "จ่ายส่วนตัว";
  return `${people.get(p).name}ออกก่อน`;
}
export const PAID_FROM_KEYS: PaidFrom[] = ["pot", "dad", "mom", "personal"];

export const CATEGORIES = {
  food: "อาหาร",
  shop: "ช้อปปิ้ง",
  travel: "เดินทาง",
  home: "ของใช้ในบ้าน",
  pearl: "ของลูก",
  bill: "บิล",
  water: "ค่าน้ำ",
  power: "ค่าไฟ",
  net: "ค่าเน็ต",
  phone: "ค่าโทรศัพท์",
  save: "ออม",
  merit: "ทำบุญ",
  invest: "ลงทุน",
  health: "สุขภาพ",
  fun: "บันเทิง/subscription",
  gift: "ของขวัญ",
  car: "รถ",
  pet: "สัตว์เลี้ยง",
  study: "การศึกษา",
  other: "อื่นๆ",
} as const;
/** หมวดตั้งต้นที่ถือเป็นค่าใช้จ่ายส่วนตัว (ที่เหลือเป็นของบ้าน) */
export const PERSONAL_CATEGORIES = new Set(["shop", "travel", "phone", "save", "merit", "invest", "health", "fun", "gift", "car"]);
/** หมวดตั้งต้น (key) หรือชื่อหมวดที่บ้านสร้างเอง */
export type Category = string;
export function categoryLabel(c: string): string {
  return (CATEGORIES as Record<string, string>)[c] ?? c;
}
/** ไม่นับในยอดใช้ของบ้าน: เห็นคนเดียว หรือ จ่ายส่วนตัว */
export function isHouseholdSpend(e: { private: boolean; paid_from: string }): boolean {
  return !e.private && e.paid_from !== "personal";
}

export const BILL_PERIODS = {
  daily: { label: "ทุกวัน", perYear: 365, unit: "วัน" },
  monthly: { label: "ทุกเดือน", perYear: 12, unit: "เดือน" },
  yearly: { label: "ปีละครั้ง", perYear: 1, unit: "ปี" },
  term: { label: "ต่อเทอม (ปีละ 2)", perYear: 2, unit: "เทอม" },
} as const;
/** ชื่อค่าใช้จ่ายประจำที่กดเลือกได้เลย */
export const FIXED_COST_PRESETS = ["ค่าน้ำ", "ค่าไฟ", "ค่าเน็ต", "ค่าโทรศัพท์", "ค่าบ้าน/ค่าเช่า", "ค่าผ่อนรถ", "ประกัน", "ค่าเทอม", "ค่าขนมลูก", "ค่าเดินทาง"];
/** ค่าสาธารณูปโภค (หมวดรายจ่าย) */
export const UTILITIES = [
  { key: "water", emoji: "💧" },
  { key: "power", emoji: "⚡" },
  { key: "net", emoji: "📶" },
  { key: "phone", emoji: "📱" },
] as const;
export type BillPeriod = keyof typeof BILL_PERIODS;

/** เงินที่ต้องกันไว้ต่อเดือนสำหรับบิลหนึ่งรายการ */
export function monthlySetAside(amount: number, period: BillPeriod): number {
  return (amount * BILL_PERIODS[period].perYear) / 12;
}
