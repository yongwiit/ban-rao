// ชุดทดสอบระบบเงิน: ตัวเลขที่คาดไว้คิดด้วยมือจากบ้านจำลอง (persona.ts) แล้วเทียบกับสูตรในแอป
// รัน: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { cardBillsInMonth, cardSummary, incomeInMonth, installment, isOneTime, oneTimeRange, type IncomeRow } from "../../src/lib/cards";
import { matchBill } from "../../src/lib/billMatch";
import { momOwesDad, myShare } from "../../src/lib/settle";
import { fundPerMonth, fundSaved, isDueMonth, isFund } from "../../src/lib/fund";
import { buildMonthItems, cardItemsInMonth } from "../../src/components/MonthList";
import { bills, cards, charges, expenses, incomes, settlements, DAD, MOM } from "./persona";

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

// ---- จดค่าน้ำ/ไฟ/เน็ต/มือถือจากสลิป: ต้องผูกกับค่าใช้จ่ายประจำ ไม่นับซ้ำ ----
const recordedIn = (ym: string) => expenses.filter((e) => e.bill_id && new Date(e.spent_at).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }).startsWith(ym)).map((e) => e.bill_id);

test("สลิปค่าไฟ ธ.ค. 69 (ยังไม่จด) → ผูกกับ 'ค่าไฟ' ของบ้าน", () => {
  assert.equal(matchBill(bills, recordedIn("2026-12"), { category: "power", paid_from: "dad" }, DAD)?.id, "b-power");
  assert.equal(matchBill(bills, recordedIn("2026-12"), { category: "power", paid_from: "pot" }, MOM)?.id, "b-power");
});

test("สลิปค่าไฟ ต.ค. 69 (จดไปแล้ว) → ไม่ผูกซ้ำ", () => {
  assert.equal(matchBill(bills, recordedIn("2026-10"), { category: "power", paid_from: "dad" }, DAD), null);
});

test("สลิปค่ามือถือ (ส่วนตัวของพ่อ) → ผูกเฉพาะเจ้าของ · แม่จดไม่ผูกของพ่อ", () => {
  assert.equal(matchBill(bills, [], { category: "phone", paid_from: "personal" }, DAD)?.id, "b-phone");
  assert.equal(matchBill(bills, [], { category: "phone", paid_from: "personal" }, MOM), null);
  assert.equal(matchBill(bills, [], { category: "phone", paid_from: "dad" }, DAD), null, "จ่ายจากเงินบ้าน ไม่ใช่บิลส่วนตัว");
});

test("สลิปค่าเน็ต พ.ย. 69: หักอัตโนมัติจดแล้ว → ไม่ผูกซ้ำ · ประกันรถรายปีไม่ถูกผูก", () => {
  assert.equal(matchBill(bills, recordedIn("2026-11"), { category: "net", paid_from: "pot" }, DAD), null);
  assert.equal(matchBill(bills, [], { category: "car", paid_from: "personal" }, DAD)?.id, "b-car", "รายเดือน (ผ่อนรถ) เท่านั้น");
  assert.equal(matchBill(bills.filter((b) => b.id !== "b-car"), [], { category: "car", paid_from: "personal" }, DAD), null);
  assert.equal(matchBill(bills, [], { category: "food", paid_from: "pot" }, DAD), null, "ตลาด ไม่ใช่ค่าใช้จ่ายประจำ");
});

test("ผูกแล้วยอดเดือนไม่ซ้ำ: ค่าไฟ ธ.ค. จดจากสลิป 1,900 → ยอดใช้ 1,900 ไม่ใช่ 1,900 + ประมาณ 1,800", () => {
  const b = matchBill(bills, recordedIn("2026-12"), { category: "power", paid_from: "pot" }, DAD)!;
  const slip = { bill_id: b.id, amount: 1900 };
  const monthRows = [slip];
  // กล่องค่าใช้จ่ายประจำ / การ์ดเดือนนี้: บิลที่จดแล้ว ไม่ต้องกันเงินซ้ำ
  const stillDue = bills.filter((x) => x.active && x.period === "monthly" && x.paid_from !== "personal" && x.id === "b-power" && !monthRows.some((r) => r.bill_id === x.id));
  assert.equal(stillDue.length, 0);
  // สลิปใบที่ 2 ของเดือนเดียวกัน (เช่นจ่ายค่าไฟสองบ้าน) → ไม่ผูกซ้ำ
  assert.equal(matchBill(bills, [...recordedIn("2026-12"), b.id], { category: "power", paid_from: "pot" }, DAD), null);
});

// ---- รายได้ครั้งเดียว (โบนัส / งานนอก) ----
const bonus: IncomeRow = { id: "i-bonus", who: "dad", label: "โบนัส", amount: 20000, private: false, created_by: DAD, ...oneTimeRange(2026, 11) };
const side: IncomeRow = { id: "i-side", who: "mom", label: "งานนอก", amount: 3500, private: false, created_by: MOM, ...oneTimeRange(2027, 1) };

test("โบนัส ธ.ค. 69: นับเฉพาะ ธ.ค. · พ.ย. และ ม.ค. ไม่ได้", () => {
  const all = [...incomes, bonus, side];
  const sum = (y: number, m: number) => all.filter((i) => incomeInMonth(i, y, m)).reduce((s, i) => s + i.amount, 0);
  assert.equal(sum(2026, 10), 83000, "พ.ย.");
  assert.equal(sum(2026, 11), 103000, "ธ.ค. รวมโบนัส");
  assert.equal(sum(2027, 0), 83000, "ม.ค.");
  assert.equal(sum(2027, 1), 86500, "ก.พ. งานนอกแม่ (เดือน 28 วัน)");
  assert.equal(sum(2027, 2), 83000, "มี.ค.");
});

test("แยกรายได้ครั้งเดียวกับรายได้ประจำ", () => {
  assert.deepEqual(oneTimeRange(2026, 11), { valid_from: "2026-12-01", valid_to: "2026-12-31" });
  assert.equal(isOneTime(bonus), true);
  assert.equal(isOneTime(side), true);
  assert.equal(incomes.some(isOneTime), false, "เงินเดือน/เงินเดือนขึ้น ไม่ใช่ครั้งเดียว");
});

test("ภาระผ่อน (DSR) คิดจากรายได้ประจำ ไม่รวมโบนัส", () => {
  const inc = [...incomes, bonus].filter((i) => incomeInMonth(i, 2026, 11));
  const regular = inc.filter((i) => !isOneTime(i)).reduce((s, i) => s + i.amount, 0);
  assert.equal(regular, 83000);
  assert.equal(Math.round((9500 / regular) * 100), 11);
});

// ---- คำเตือนวันที่บัตรเครดิต ----
import { chargeHint, dueGap, oddDueGap } from "../../src/lib/cards";
const ymd = (d: Date) => d.toLocaleDateString("en-CA");

test("วันจ่ายห่างจากวันตัด: ตัด 25 จ่าย 10 = 15 วัน ปกติ · ตัด 28 จ่าย 30 = 2 วัน เตือน", () => {
  assert.equal(dueGap(25, 10), 15);
  assert.equal(oddDueGap(25, 10), false);
  assert.equal(oddDueGap(5, 25), false);
  assert.equal(oddDueGap(28, 30), true);
  assert.equal(oddDueGap(15, 30), false);
  assert.equal(oddDueGap(10, 30), false);
  assert.equal(oddDueGap(18, 30), false);
  assert.equal(oddDueGap(1, 30), true, "29 วัน");
});

test("รูดแล้วเข้าบิลไหน: กสิกร (ตัด 25) รูด 23 พ.ย. → บิล 25 พ.ย. จ่าย 10 ธ.ค. · ใกล้วันตัด", () => {
  const h = chargeHint(cards[0], "2026-11-23", "2026-11-23");
  assert.equal(ymd(h.statement), "2026-11-25");
  assert.equal(ymd(h.due), "2026-12-10");
  assert.equal(h.nearCut, true);
  assert.equal(chargeHint(cards[0], "2026-11-20", "2026-11-23").nearCut, false, "ก่อนวันตัด 5 วัน");
  assert.equal(chargeHint(cards[0], "2026-11-26", "2026-11-26").nearCut, false, "หลังวันตัด = รอบใหม่");
  assert.equal(ymd(chargeHint(cards[0], "2026-11-26", "2026-11-26").statement), "2026-12-25");
});

test("วันที่ผิดปกติ: อนาคต / ย้อนหลังเกิน 2 เดือน", () => {
  assert.equal(chargeHint(cards[0], "2026-11-06", "2026-11-05").future, true);
  assert.equal(chargeHint(cards[0], "2026-09-04", "2026-11-05").old, true);
  assert.equal(chargeHint(cards[0], "2026-09-06", "2026-11-05").old, false);
});
