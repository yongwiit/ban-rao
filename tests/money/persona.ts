// บ้านจำลองสำหรับทดสอบ (ข้อมูลสมมุติทั้งหมด): พ่อพนักงานออฟฟิศ แม่ ลูก · พ.ค. 2568 – พ.ย. 2569 (~1.6 ปี)
// ใช้ทั้งในชุดทดสอบ (npm test) และในภาพหน้าจอจำลอง
import type { BillRow, ExpenseRow, SettlementRow } from "../../src/lib/types";
import type { CardRow, ChargeRow, IncomeRow } from "../../src/lib/cards";

export const DAD = "u-dad", MOM = "u-mom", H = "h-test";
const pad = (n: number) => String(n).padStart(2, "0");
export const iso = (d: string, hm = "12:00") => new Date(`${d}T${hm}:00+07:00`).toISOString();
/** เดือนที่จำลอง: 2025-05 ถึง 2026-11 (m = 0–11) */
export const MONTHS: { y: number; m: number }[] = [];
for (let i = 0; i < 19; i++) { const d = new Date(2025, 4 + i, 1); MONTHS.push({ y: d.getFullYear(), m: d.getMonth() }); }
const day = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(Math.min(d, new Date(y, m + 1, 0).getDate()))}`;

const bill = (b: Partial<BillRow> & Pick<BillRow, "id" | "name" | "amount" | "period">): BillRow => ({
  due_day: null, active: true, paid_from: "pot", category: "bill", created_by: DAD, auto_record: false, auto_from: null, variable: false, other_share: null, due_month: null, ...b,
});
export const bills: BillRow[] = [
  bill({ id: "b-house", name: "ผ่อนบ้าน", amount: 15000, period: "monthly", due_day: 1, paid_from: "dad", other_share: 0.5, category: "home", auto_record: true, auto_from: "2025-05-01" }),
  bill({ id: "b-car", name: "ผ่อนรถ", amount: 9500, period: "monthly", due_day: 5, paid_from: "personal", category: "car", auto_record: true, auto_from: "2025-05-01" }),
  bill({ id: "b-power", name: "ค่าไฟ", amount: 1800, period: "monthly", due_day: 20, category: "power", variable: true }),
  bill({ id: "b-net", name: "ค่าเน็ต", amount: 599, period: "monthly", due_day: 3, category: "net", auto_record: true, auto_from: "2025-05-01" }),
  bill({ id: "b-phone", name: "ค่าโทรศัพท์", amount: 499, period: "monthly", due_day: 15, paid_from: "personal", category: "phone", variable: true }),
  bill({ id: "b-carins", name: "ประกันรถ", amount: 18000, period: "yearly", due_day: 10, due_month: 8, paid_from: "personal", category: "car" }),
  bill({ id: "b-school", name: "ค่าเทอมลูก", amount: 25000, period: "term", due_day: 15, due_month: 5, category: "study" }),
  bill({ id: "b-snack", name: "ค่าขนมลูก", amount: 100, period: "daily", category: "pearl" }),
];

export const incomes: IncomeRow[] = [
  { id: "i-dad1", who: "dad", label: "เงินเดือน", amount: 45000, private: false, created_by: DAD, valid_from: "2000-01-01", valid_to: "2026-03-31" },
  { id: "i-dad2", who: "dad", label: "เงินเดือน", amount: 48000, private: false, created_by: DAD, valid_from: "2026-04-01", valid_to: null },
  { id: "i-mom", who: "mom", label: "เงินเดือน", amount: 35000, private: false, created_by: MOM, valid_from: "2000-01-01", valid_to: null },
];

export const cards: CardRow[] = [
  { id: "c-k", name: "บัตรกสิกร", bank: "กสิกร", last4: "1111", owner: "dad", statement_day: 25, due_day: 10, credit_limit: 100000, color: "#5E8FC9", private: false, active: true, created_by: DAD, created_at: "2025-05-01" },
  { id: "c-u", name: "UOB", bank: "UOB", last4: "2222", owner: "dad", statement_day: 5, due_day: 25, credit_limit: 60000, color: "#7A6FC9", private: false, active: true, created_by: DAD, created_at: "2025-05-01" },
];
const ch = (c: Partial<ChargeRow> & Pick<ChargeRow, "id" | "card_id" | "title" | "amount" | "charged_on">): ChargeRow => ({
  months: 1, category: "shop", bill_to: null, bill_amount: null, bill_paid: false, note: null, created_by: DAD, created_at: "x", repeat: "none", ended_on: null, bill_mode: "person", bill_status: "none", ...c,
});
export const charges: ChargeRow[] = [
  ch({ id: "s-netflix", card_id: "c-k", title: "Netflix", amount: 419, charged_on: "2025-06-12", repeat: "monthly", category: "fun" }),
  ch({ id: "s-spotify", card_id: "c-k", title: "Spotify", amount: 149, charged_on: "2025-06-20", repeat: "monthly", ended_on: "2026-02-28", category: "fun" }),
  ch({ id: "s-icloud", card_id: "c-u", title: "iCloud", amount: 1190, charged_on: "2025-09-01", repeat: "yearly", category: "fun" }),
  ch({ id: "x-tv", card_id: "c-k", title: "ทีวี (ผ่อน 10)", amount: 24000, charged_on: "2025-09-28", months: 10, category: "home" }),
  ch({ id: "x-laptop", card_id: "c-u", title: "โน้ตบุ๊ก (ผ่อน 6)", amount: 30000, charged_on: "2026-08-03", months: 6, category: "study" }),
  ch({ id: "x-sofa", card_id: "c-k", title: "โซฟา (เข้าเงินบ้าน)", amount: 8000, charged_on: "2026-02-14", category: "home", bill_to: "mom", bill_mode: "home", bill_status: "accepted", bill_amount: 8000 }),
];
// รูดบัตรทั่วไปเดือนละ 2 รายการ
for (const { y, m } of MONTHS) {
  if (day(y, m, 8) <= "2026-11-05") charges.push(ch({ id: `g-${y}-${m}`, card_id: "c-k", title: "เติมน้ำมัน", amount: 1500, charged_on: day(y, m, 8), category: "car" }));
  if (day(y, m, 27) <= "2026-11-05") charges.push(ch({ id: `d-${y}-${m}`, card_id: "c-u", title: "ร้านอาหาร", amount: 1200, charged_on: day(y, m, 27), category: "food" }));
}

const ex = (e: Partial<ExpenseRow> & Pick<ExpenseRow, "id" | "amount" | "spent_at" | "merchant" | "category">): ExpenseRow => ({
  household_id: H, paid_from: "pot", private: false, status: "confirmed", slip_ref: null, bank: null, note: null, created_by: DAD, created_at: e.spent_at, bill_id: null, card_charge_id: null, other_share: null, ...e,
} as ExpenseRow);
export const expenses: ExpenseRow[] = [];
const TODAY = "2026-11-05";
for (const { y, m } of MONTHS) {
  const k = `${y}-${m}`;
  const push = (id: string, d: number, amount: number, merchant: string, category: string, extra: Partial<ExpenseRow> = {}) => {
    const dd = day(y, m, d);
    if (dd <= TODAY) expenses.push(ex({ id: `${id}-${k}`, amount, spent_at: iso(dd), merchant, category, ...extra }));
  };
  // ของบ้าน
  [2, 9, 16, 23].forEach((d, i) => push(`mk${i}`, d, 2000 + i * 100, "ตลาด", "food"));
  push("lotus", 12, 1800, "โลตัส", "home");
  push("house", 1, 15000, "ผ่อนบ้าน", "home", { paid_from: "dad", bill_id: "b-house", other_share: 0.5, note: "หักอัตโนมัติ" });
  push("net", 3, 599, "ค่าเน็ต", "net", { bill_id: "b-net", note: "หักอัตโนมัติ" });
  push("power", 20, 1700 + (m % 3) * 150, "การไฟฟ้า", "power", { bill_id: "b-power" });
  push("snack", 28, 3000, "ค่าขนมลูกทั้งเดือน", "pearl", { bill_id: "b-snack" });
  if (m === 4 || m === 10) push("school", 15, 25000, "ค่าเทอมลูก", "study", { bill_id: "b-school" });
  if (m === 11 && y === 2025) push("trip", 27, 12000, "เที่ยวเชียงใหม่", "travel", { paid_from: "mom" });
  // ของพ่อ (ส่วนตัว)
  push("car", 5, 9500, "ผ่อนรถ", "car", { paid_from: "personal", bill_id: "b-car", note: "หักอัตโนมัติ" });
  push("phone", 15, 499, "AIS", "phone", { paid_from: "personal", bill_id: "b-phone" });
  push("save", 26, 4000, "ฝากออม", "save", { paid_from: "personal" });
  push("invest", 26, 2000, "กองทุน", "invest", { paid_from: "personal" });
  push("lunch", 18, 1600, "ข้าวกลางวัน", "food", { paid_from: "personal" });
  if (m === 7) push("carins", 10, 18000, "ประกันรถ", "car", { paid_from: "personal", bill_id: "b-carins" });
}

export const settlements: SettlementRow[] = MONTHS.filter(({ y, m }) => day(y, m, 6) <= TODAY)
  .map(({ y, m }) => ({ id: `st-${y}-${m}`, from_role: "mom", to_role: "dad", amount: 7500, created_at: iso(day(y, m, 6)) }));
