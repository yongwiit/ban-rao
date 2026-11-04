import type { PaidFrom, Role } from "./family";

export type SettleInput = {
  expenses: { amount: number; paid_from: PaidFrom; private: boolean; other_share?: number | string | null }[];
  settlements: { from_role: Role; to_role: Role; amount: number }[];
};

/**
 * รายจ่ายของบ้านที่คนใดคนหนึ่งออกก่อน แบ่งตามสัดส่วน other_share (ไม่ตั้ง = ครึ่ง)
 * คืนค่าเป็นบวก = แม่ต้องโอนให้พ่อ, ติดลบ = พ่อต้องโอนให้แม่
 * รายการ "เห็นคนเดียว" ไม่นับ เพราะเป็นของส่วนตัว
 */
/** สัดส่วนที่อีกฝ่ายช่วยจ่าย (0–1) ไม่ตั้ง = ครึ่ง */
export const otherShare = (v: number | string | null | undefined) => (v == null || v === "" ? 0.5 : Number(v));

/** ส่วนของ role ในค่าใช้จ่ายบ้านที่พ่อ/แม่ออกก่อน (0 = ไม่เกี่ยว) */
export function myShare(x: { paid_from: PaidFrom; other_share?: number | string | null }, role: string): number {
  if (x.paid_from !== "dad" && x.paid_from !== "mom") return 0;
  if (role !== "dad" && role !== "mom") return 0;
  return x.paid_from === role ? 1 - otherShare(x.other_share) : otherShare(x.other_share);
}

export function momOwesDad({ expenses, settlements }: SettleInput): number {
  let balance = 0;
  for (const e of expenses) {
    if (e.private) continue;
    if (e.paid_from === "dad") balance += e.amount * otherShare(e.other_share);
    if (e.paid_from === "mom") balance -= e.amount * otherShare(e.other_share);
  }
  for (const s of settlements) {
    if (s.from_role === "mom" && s.to_role === "dad") balance -= s.amount;
    if (s.from_role === "dad" && s.to_role === "mom") balance += s.amount;
  }
  return Math.round(balance * 100) / 100;
}
