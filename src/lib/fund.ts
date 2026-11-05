// หลักการเงินครอบครัว: แยกเงินออมออกจากรายจ่าย + กันเงินค่าใช้จ่ายรายปีไว้ทุกเดือน (sinking fund)
import { BILL_PERIODS } from "./family";
import type { BillRow } from "./types";

/** หมวดที่เป็นเงินออม/ลงทุน (ไม่ใช่การใช้เงิน) */
export const SAVING_CATS = new Set(["save", "invest"]);
export const isSaving = (c?: string | null) => !!c && SAVING_CATS.has(c);

type B = Pick<BillRow, "period" | "amount" | "due_month">;
/** ค่าใช้จ่ายที่ไม่ได้จ่ายทุกเดือน (ปีละครั้ง / ต่อเทอม) → กันเงินไว้ทุกเดือน */
export const isFund = (b: Pick<BillRow, "period">) => b.period === "yearly" || b.period === "term";
/** ต้องกันไว้เดือนละเท่าไหร่ */
export const fundPerMonth = (b: B) => (Number(b.amount) * BILL_PERIODS[b.period].perYear) / 12;
const cycle = (b: B) => (b.period === "term" ? 6 : 12);
/** เดือนที่ต้องจ่าย (0–11) เทอม = ทุก 6 เดือน */
export function fundDueMonths(b: B): number[] {
  if (!b.due_month) return [];
  const m = b.due_month - 1;
  return b.period === "term" ? [m, (m + 6) % 12] : [m];
}
export const isDueMonth = (b: B, m: number) => fundDueMonths(b).includes(m);
/** กันไว้แล้วประมาณเท่าไหร่ ณ เดือน m (นับตั้งแต่จ่ายครั้งก่อน เดือนที่จ่าย = ครบ) */
export function fundSaved(b: B, m: number): number | null {
  if (!b.due_month) return null;
  const k = (((m - (b.due_month - 1)) % 12) + 12) % 12 % cycle(b);
  return fundPerMonth(b) * (k === 0 ? cycle(b) : k);
}
/** ภาระผ่อน: ค่าใช้จ่ายประจำที่ชื่อมีคำว่า "ผ่อน" */
export const isLoan = (b: Pick<BillRow, "name">) => b.name.includes("ผ่อน");
