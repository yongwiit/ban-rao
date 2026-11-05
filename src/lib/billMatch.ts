import type { BillRow } from "./types";

/**
 * จดรายจ่ายใหม่ (เช่นจากสลิปค่าไฟ) → หาค่าใช้จ่ายประจำรายเดือนที่ตรงกัน เพื่อนับเป็นของเดือนนั้น ไม่ให้นับซ้ำ
 * ตรงกัน = เปิดอยู่ · รายเดือน · หมวดเดียวกัน · ฝั่งเดียวกัน (บ้าน/ส่วนตัวของฉัน) · เดือนนั้นยังไม่ได้จด
 */
export function matchBill(
  bills: BillRow[],
  recordedIds: (string | null | undefined)[],
  d: { category: string; paid_from: string },
  userId: string | null | undefined,
): BillRow | null {
  const done = new Set(recordedIds.filter(Boolean));
  const personal = d.paid_from === "personal";
  const hits = bills.filter((b) => b.active && b.period === "monthly" && b.category === d.category && !done.has(b.id)
    && (personal ? b.paid_from === "personal" && b.created_by === userId : b.paid_from !== "personal"));
  return hits.find((b) => b.paid_from === d.paid_from) ?? hits[0] ?? null;
}
