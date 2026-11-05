// ชุดทดสอบระบบเงิน: ตัวเลขที่คาดไว้คิดด้วยมือจากบ้านจำลอง (persona.ts) แล้วเทียบกับสูตรในแอป
// รัน: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { cardBillsInMonth, cardSummary, incomeInMonth, installment } from "../../src/lib/cards";
import { momOwesDad, myShare } from "../../src/lib/settle";
import { fundPerMonth, fundSaved, isDueMonth, isFund } from "../../src/lib/fund";
import { buildMonthItems, cardItemsInMonth } from "../../src/components/MonthList";
import { bills, cards, charges, expenses, incomes, settlements, DAD } from "./persona";

const near = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 0.01, `${msg ?? ""} got ${a} expected ${b}`);
const billsIn = (y: number, m: number) => Object.fromEntries(cardBillsInMonth(cards, charges, y, m).map((b) => [b.card.id, b]));
const bill = (id: string) => bills.find((b) => b.id === id)!;
const people = { get: (k: string) => ({ name: k === "dad" ? "พ่อ" : k === "mom" ? "แม่" : k }) } as unknown as Parameters<typeof buildMonthItems>[0]["people"];

test("บิลบัตร ธ.ค. 68: Netflix + Spotify + งวดทีวี 1 + น้ำมัน / UOB ร้านอาหาร", () => {
  const b = billsIn(2025, 11);
  near(b["c-k"].amount, 419 + 149 + 2400 + 1500, "กสิกร");
  assert.equal(b["c-k"].due.getDate(), 10);
  near(b["c-u"].amount, 1200, "UOB");
});

test("Spotify ยกเลิก 28 ก.พ. 69: รอบ ก.พ. ยังเก็บ รอบ มี.ค. ไม่เก็บ", () => {
  near(billsIn(2026, 2)["c-k"].amount, 419 + 149 + 2400 + 1500 + 8000, "บิลจ่าย มี.ค. (รวมโซฟา)");
  near(billsIn(2026, 3)["c-k"].amount, 419 + 2400 + 1500, "บิลจ่าย เม.ย.");
});

test("โซฟาเข้าเงินบ้าน: ได้คืนครึ่งหนึ่งในบิลที่จ่าย มี.ค.", () => {
  near(billsIn(2026, 2)["c-k"].refund, 4000);
});

test("ทีวีผ่อน 10 งวด: งวดสุดท้ายอยู่บิลจ่าย ส.ค. 69 แล้วหมด", () => {
  near(billsIn(2026, 7)["c-k"].amount, 419 + 2400 + 1500, "ส.ค.");
  near(billsIn(2026, 8)["c-k"].amount, 419 + 1500, "ก.ย.");
  const st = installment(cards[0], charges.find((c) => c.id === "x-tv")!, "2026-11-05");
  assert.equal(st.done, true);
  assert.equal(st.paid, 10);
});

test("iCloud รายปี: เก็บเฉพาะบิล ก.ย.", () => {
  near(billsIn(2026, 8)["c-u"].amount, 1190 + 5000 + 1200, "ก.ย. 69");
  near(billsIn(2026, 9)["c-u"].amount, 5000 + 1200, "ต.ค. 69");
});

test("เดือนนี้ (พ.ย. 69) และเดือนหน้า (ธ.ค. 69)", () => {
  const nov = billsIn(2026, 10), dec = billsIn(2026, 11);
  near(nov["c-k"].amount, 419 + 1500, "พ.ย. กสิกร");
  near(nov["c-u"].amount, 5000 + 1200, "พ.ย. UOB");
  near(dec["c-k"].amount, 419, "ธ.ค. กสิกร (ยังไม่รูดเพิ่ม มีแต่ Netflix)");
  near(dec["c-u"].amount, 5000, "ธ.ค. UOB งวดโน้ตบุ๊ก");
});

test("โน้ตบุ๊กผ่อน 6: ณ 5 พ.ย. จ่ายแล้ว 3 งวด เหลือ 3", () => {
  const st = installment(cards[1], charges.find((c) => c.id === "x-laptop")!, "2026-11-05");
  assert.equal(st.paid, 3); // ส.ค. ก.ย. ต.ค. (บิล พ.ย. ครบ 25 พ.ย. ยังไม่ถึง)
  assert.equal(st.left, 3);
  const s = cardSummary(cards[1], charges.filter((c) => c.card_id === "c-u"), "2026-11-05");
  near(s.monthlyInstallments, 5000);
});

test("เงินเดือนขึ้น เม.ย. 69: มี.ค. ยังเป็น 80,000 · เม.ย. เป็น 83,000", () => {
  const sum = (y: number, m: number) => incomes.filter((i) => incomeInMonth(i, y, m)).reduce((s, i) => s + i.amount, 0);
  assert.equal(sum(2026, 2), 80000);
  assert.equal(sum(2026, 3), 83000);
  assert.equal(sum(2025, 4), 80000);
});

test("ยอดเคลียร์: ผ่อนบ้าน 19 เดือน × 7,500 − เที่ยว 6,000 − โอนแล้ว 18 × 7,500 = 1,500", () => {
  near(momOwesDad({ expenses: expenses.map((e) => ({ ...e, amount: Number(e.amount) })), settlements }), 1500);
});

test("กันเงินรายปี: ประกันรถ 1,500/เดือน · ค่าเทอม 4,166.67/เดือน", () => {
  near(fundPerMonth(bill("b-carins")), 1500);
  near(fundPerMonth(bill("b-school")), 25000 * 2 / 12);
  near(bills.filter(isFund).reduce((s, b) => s + fundPerMonth(b), 0), 1500 + 25000 / 6);
});

test("กันแล้วสะสม: ประกันรถ (จ่าย ส.ค.) ณ พ.ย. = 3 เดือน · เดือน ส.ค. = ครบ", () => {
  near(fundSaved(bill("b-carins"), 10)!, 4500);
  near(fundSaved(bill("b-carins"), 7)!, 18000);
  near(fundSaved(bill("b-carins"), 8)!, 1500);
  assert.equal(isDueMonth(bill("b-school"), 4), true);
  assert.equal(isDueMonth(bill("b-school"), 10), true);
  near(fundSaved(bill("b-school"), 11)!, 25000 / 6);
});

test("ส่วนของพ่อในผ่อนบ้าน = 50%", () => {
  assert.equal(myShare(bill("b-house"), "dad"), 0.5);
  assert.equal(myShare(bill("b-house"), "mom"), 0.5);
  assert.equal(myShare(bill("b-net"), "dad"), 0);
});

test("รายการเดือนนี้ แท็บของฉัน (พ.ย. 69): ผ่อนรถ + ส่วนผ่อนบ้าน + Netflix + งวดโน้ตบุ๊ก 4/6", () => {
  const rows = expenses.filter((e) => e.spent_at >= new Date("2026-11-01T00:00:00+07:00").toISOString());
  const cardItems = cardItemsInMonth(cards, charges, 2026, 10);
  const items = buildMonthItems({ scope: "mine", rows, cardItems, role: "dad", userId: DAD, people });
  const by = (k: string) => items.filter((i) => i.kind === k).reduce((s, i) => s + i.amount, 0);
  near(by("self"), 9500, "จ่ายเอง");
  near(by("share"), 7500, "ส่วนของฉันในบ้าน");
  near(by("card"), 419 + 5000, "รูดบัตร");
  assert.ok(items.some((i) => i.sub.includes("ผ่อนงวด 4/6")));
});

test("รายการเดือนนี้ แท็บบ้าน: ไม่มีของส่วนตัวปน", () => {
  const rows = expenses.filter((e) => e.spent_at.startsWith("2026-10") || e.spent_at.startsWith("2026-09-30T17"));
  const items = buildMonthItems({ scope: "home", rows, cardItems: [], role: "dad", userId: DAD, people });
  assert.ok(items.every((i) => i.expense!.paid_from !== "personal"));
});
