import type { PaidFrom, Role } from "./family";

export type SettleInput = {
  expenses: { amount: number; paid_from: PaidFrom; private: boolean }[];
  settlements: { from_role: Role; to_role: Role; amount: number }[];
};

/**
 * รายจ่ายของบ้านที่คนใดคนหนึ่งออกก่อน แบ่งครึ่งกัน
 * คืนค่าเป็นบวก = แม่ต้องโอนให้พ่อ, ติดลบ = พ่อต้องโอนให้แม่
 * รายการ "เห็นคนเดียว" ไม่นับ เพราะเป็นของส่วนตัว
 */
export function momOwesDad({ expenses, settlements }: SettleInput): number {
  let balance = 0;
  for (const e of expenses) {
    if (e.private) continue;
    if (e.paid_from === "dad") balance += e.amount / 2;
    if (e.paid_from === "mom") balance -= e.amount / 2;
  }
  for (const s of settlements) {
    if (s.from_role === "mom" && s.to_role === "dad") balance -= s.amount;
    if (s.from_role === "dad" && s.to_role === "mom") balance += s.amount;
  }
  return Math.round(balance * 100) / 100;
}
