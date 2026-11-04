/** วันครบกำหนดครั้งถัดไปของบิล (ตามวันที่ในเดือน) นับจากวันนี้ */
export function nextDue(dueDay: number, from = new Date()): Date {
  const y = from.getFullYear();
  const m = from.getMonth();
  const today = new Date(y, m, from.getDate());
  const clamp = (yy: number, mm: number) => Math.min(dueDay, new Date(yy, mm + 1, 0).getDate());
  let d = new Date(y, m, clamp(y, m));
  if (d < today) d = new Date(y, m + 1, clamp(y, m + 1));
  return d;
}

export function daysUntil(d: Date, from = new Date()): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  return Math.round((d.getTime() - a) / 86400000);
}
