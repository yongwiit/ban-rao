// บัตรเครดิต: คำนวณรอบตัดบัตร วันครบกำหนดจ่าย และงวดผ่อน (ไม่เชื่อมธนาคาร คิดจากข้อมูลที่จดเอง)

export type CardRow = {
  id: string; name: string; bank: string | null; last4: string | null; owner: string;
  statement_day: number; due_day: number; credit_limit: number | null; color: string;
  private: boolean; active: boolean; created_by: string; created_at: string;
};
export type ChargeRow = {
  id: string; card_id: string; title: string; amount: number; charged_on: string; months: number;
  category: string | null; bill_to: string | null; bill_amount: number | null; bill_paid: boolean;
  note: string | null; created_by: string; created_at: string;
  /** subscription: none = ครั้งเดียว */
  repeat?: "none" | "monthly" | "yearly"; ended_on?: string | null;
  /** home = เข้าเงินบ้าน (หารในยอดเคลียร์), person = เก็บจากคนนั้น */
  bill_mode?: "home" | "person"; bill_status?: "none" | "pending" | "accepted" | "rejected";
};
export const isSub = (c: Pick<ChargeRow, "repeat">) => !!c.repeat && c.repeat !== "none";
/** subscription ที่ยังใช้อยู่ ณ วันนี้ */
export const activeSub = (c: ChargeRow, today: string) => isSub(c) && c.charged_on <= today && (!c.ended_on || c.ended_on >= today);
export type IncomeRow = { id: string; who: string; label: string; amount: number; private: boolean; created_by: string; valid_from?: string; valid_to?: string | null };
/** รายได้นี้ใช้ในเดือน y/m (0–11) ไหม · เงินเดือนขึ้นแล้วเดือนเก่ายังใช้ยอดเดิม */
export function incomeInMonth(i: Pick<IncomeRow, "valid_from" | "valid_to">, y: number, m: number): boolean {
  const first = ymdOf(new Date(y, m, 1)), last = ymdOf(new Date(y, m + 1, 0));
  return (i.valid_from ?? "2000-01-01") <= last && (!i.valid_to || i.valid_to >= first);
}

/** เดือนเป็นเลขลำดับ (ปี*12 + เดือน 0-11) เพื่อเทียบรอบง่ายๆ */
type Mi = number;
const mi = (y: number, m: number): Mi => y * 12 + m;
const daysIn = (i: Mi) => new Date(Math.floor(i / 12), (i % 12) + 1, 0).getDate();
/** วันที่ day ของเดือน i (ถ้าเดือนนั้นไม่มีวันนั้น ใช้วันสุดท้าย) */
export function dateOf(i: Mi, day: number): Date {
  return new Date(Math.floor(i / 12), i % 12, Math.min(day, daysIn(i)));
}
function parse(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y, m: m - 1, d };
}
const todayParts = (today: string) => parse(today);
const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** วันครบกำหนดจ่ายของบิลที่ตัดรอบเดือน i (ถ้าวันจ่ายน้อยกว่าหรือเท่าวันตัด = เดือนถัดไป) */
export function dueOfStatement(card: Pick<CardRow, "statement_day" | "due_day">, i: Mi): Date {
  return dateOf(card.due_day > card.statement_day ? i : i + 1, card.due_day);
}
/** รอบบิลแรกที่รายการนี้เข้า */
export function firstStatement(card: Pick<CardRow, "statement_day">, chargedOn: string): Mi {
  const { y, m, d } = parse(chargedOn);
  const i = mi(y, m);
  return d <= Math.min(card.statement_day, daysIn(i)) ? i : i + 1;
}
/** ยอดของรายการนี้ที่อยู่ในบิลรอบ i (จ่ายเต็ม = งวดเดียว, ผ่อน = หารเท่ากัน) */
export function amountOn(card: CardRow, c: ChargeRow, i: Mi): number {
  const k = i - firstStatement(card, c.charged_on);
  if (isSub(c)) {
    if (k < 0 || (c.repeat === "yearly" && k % 12 !== 0)) return 0;
    // รอบที่ k ตรงกับวันที่รูดเดือนที่ k (ยกเลิกแล้วไม่นับรอบหลังวันที่ยกเลิก)
    const { y, m, d } = parse(c.charged_on);
    const occ = ymdOf(dateOf(mi(y, m) + k, d));
    return c.ended_on && occ > c.ended_on ? 0 : Number(c.amount);
  }
  return k >= 0 && k < c.months ? Number(c.amount) / c.months : 0;
}

/** สถานะงวดผ่อน: จ่ายไปแล้วกี่งวด (นับงวดที่เลยวันครบกำหนดแล้ว) เหลือกี่งวด */
export function installment(card: CardRow, c: ChargeRow, today: string) {
  const first = firstStatement(card, c.charged_on);
  if (isSub(c)) return { paid: 0, left: 0, perMonth: Number(c.amount), done: !!c.ended_on && c.ended_on < today, lastDue: dueOfStatement(card, first) };
  let paid = 0;
  for (let k = 0; k < c.months; k++) if (ymdOf(dueOfStatement(card, first + k)) < today) paid++;
  const perMonth = Number(c.amount) / c.months;
  return { paid, left: c.months - paid, perMonth, done: paid >= c.months, lastDue: dueOfStatement(card, first + c.months - 1) };
}

/** สรุปบัตร ณ วันนี้: รอบที่กำลังใช้ และบิลที่ต้องจ่ายครั้งถัดไป */
export function cardSummary(card: CardRow, charges: ChargeRow[], today: string) {
  const t = todayParts(today);
  const ti = mi(t.y, t.m);
  // รอบที่กำลังใช้ = วันตัดรอบที่ยังไม่ถึง (หรือวันนี้)
  const open: Mi = t.d <= Math.min(card.statement_day, daysIn(ti)) ? ti : ti + 1;
  const sum = (i: Mi) => charges.reduce((s, c) => s + amountOn(card, c, i), 0);
  const prev = open - 1;
  const prevDue = dueOfStatement(card, prev);
  // บิลรอบก่อนยังไม่ถึงวันจ่าย → ต้องจ่ายบิลนั้น ไม่งั้นบิลถัดไปคือรอบที่กำลังใช้
  const billOpen = ymdOf(prevDue) >= today;
  const bill = billOpen
    ? { statement: dateOf(prev, card.statement_day), due: prevDue, amount: sum(prev), closed: true }
    : { statement: dateOf(open, card.statement_day), due: dueOfStatement(card, open), amount: sum(open), closed: false };
  const cycleCharges = charges.filter((c) => amountOn(card, c, open) > 0);
  const subs = charges.filter((c) => activeSub(c, today));
  const installments = charges.filter((c) => c.months > 1 && !installment(card, c, today).done);
  const owedLeft = installments.reduce((s, c) => { const st = installment(card, c, today); return s + st.perMonth * st.left; }, 0);
  return {
    cycleEnd: dateOf(open, card.statement_day),
    cycleStart: new Date(dateOf(prev, card.statement_day).getTime() + 864e5),
    cycleAmount: sum(open),
    /** บิลล่าสุดที่ตัดรอบแล้ว (แม้เลยวันจ่ายแล้ว) ไว้แสดงสถานะจ่ายแล้ว/ยัง */
    last: { statement: dateOf(prev, card.statement_day), due: prevDue, amount: sum(prev) },
    /** วันจ่ายของรอบที่กำลังใช้อยู่ (ยังไม่ตัด) */
    cycleDue: dueOfStatement(card, open),
    cycleCharges,
    bill,
    installments,
    subs,
    /** รอบนี้แยกตามหมวด (มากไปน้อย) */
    cycleByCat: [...cycleCharges.reduce((m, c) => m.set(c.category ?? "other", (m.get(c.category ?? "other") ?? 0) + amountOn(card, c, open)), new Map<string, number>())].sort((a, b) => b[1] - a[1]),
    /** ยอดที่ยังไม่ได้จ่าย: บิลที่ตัดแล้วแต่ยังไม่ถึงวันจ่าย + รอบนี้ + งวดผ่อนที่เหลือหลังจากนี้ */
    outstanding: (billOpen ? sum(prev) : 0) + sum(open) + charges.filter((c) => !isSub(c)).reduce((s, c) => {
      let t = 0;
      for (let i = open + 1; i < open + 61; i++) t += amountOn(card, c, i);
      return s + t;
    }, 0),
    /** ผ่อนต่อเดือนรวม (งวดที่ยังเหลือ) */
    monthlyInstallments: installments.reduce((s, c) => s + Number(c.amount) / c.months, 0),
    /** ยอดผ่อนที่ยังค้าง (ไม่รวมรอบนี้ที่จ่ายเต็ม) */
    owedLeft,
  };
}

/** ยอดบัตรที่ครบกำหนดจ่ายในเดือนนั้น (y, m: 0-11) รวมทุกบัตร */
/** บิลบัตรแต่ละใบที่ครบกำหนดจ่ายในเดือนนี้ (ปี y เดือน m แบบ 0–11) */
/** บิลบัตรที่ครบจ่ายในเดือน y/m · refund = ส่วนที่เรียกเก็บแล้วและอีกฝ่ายยืนยัน (จะได้คืน) */
export function cardBillsInMonth(cards: CardRow[], charges: ChargeRow[], y: number, m: number): { card: CardRow; due: Date; amount: number; refund: number }[] {
  const target = mi(y, m);
  const out: { card: CardRow; due: Date; amount: number; refund: number }[] = [];
  for (const card of cards) {
    const mine = charges.filter((c) => c.card_id === card.id);
    for (let i = target - 2; i <= target; i++) {
      const due = dueOfStatement(card, i);
      if (mi(due.getFullYear(), due.getMonth()) !== target) continue;
      const amount = mine.reduce((s, c) => s + amountOn(card, c, i), 0);
      const refund = mine.reduce((s, c) => {
        if (!c.bill_to || c.bill_status !== "accepted" || !(Number(c.amount) > 0)) return s;
        // ของบ้าน: อีกฝ่ายคืนครึ่ง (ผ่านยอดเคลียร์กัน) · คนเดียว: คืนตามยอดที่เรียกเก็บ
        const ratio = c.bill_mode === "home" ? 0.5 : Math.min(1, Number(c.bill_amount ?? c.amount) / Number(c.amount));
        return s + amountOn(card, c, i) * ratio;
      }, 0);
      if (amount > 0) out.push({ card, due, amount, refund });
    }
  }
  return out;
}

export function cardsDueInMonth(cards: CardRow[], charges: ChargeRow[], y: number, m: number): number {
  return cardBillsInMonth(cards, charges, y, m).reduce((s, b) => s + b.amount, 0);
}

/** ยอดรายการบัตรที่ตกในเดือน (นับตามวันที่รูด/วันตัด subscription ไม่ใช่ตามรอบบิล) */
export function chargeInMonth(c: ChargeRow, y: number, m: number): number {
  const [cy, cm] = c.charged_on.split("-").map(Number);
  const k = mi(y, m) - mi(cy, cm - 1);
  if (k < 0) return 0;
  if (isSub(c)) {
    if (c.repeat === "yearly" && k % 12 !== 0) return 0;
    const occ = ymdOf(dateOf(mi(y, m), Number(c.charged_on.slice(8))));
    return c.ended_on && occ > c.ended_on ? 0 : Number(c.amount);
  }
  return k === 0 ? Number(c.amount) : 0;
}
