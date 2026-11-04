// แปลงข้อความ OCR จากสลิปโอนเงินไทย เป็นยอด วันเวลา ผู้รับ ธนาคาร เลขอ้างอิง
import type { Category } from "./family";

export type SlipFields = {
  kind: "slip" | "receipt";
  amount: number | null;
  datetime: string | null; // YYYY-MM-DDTHH:mm เวลาไทย
  recipient: string | null;
  bank: string | null;
  reference: string | null;
  category_guess: Category;
};

const MONTHS: [RegExp, number][] = [
  [/^ม\.?ค/, 1], [/^ก\.?พ/, 2], [/^มี\.?ค/, 3], [/^เม\.?ย/, 4], [/^พ\.?ค/, 5], [/^มิ\.?ย/, 6],
  [/^ก\.?ค/, 7], [/^ส\.?ค/, 8], [/^ก\.?ย/, 9], [/^ต\.?ค/, 10], [/^พ\.?ย/, 11], [/^ธ\.?ค/, 12],
  [/^jan/i, 1], [/^feb/i, 2], [/^mar/i, 3], [/^apr/i, 4], [/^may/i, 5], [/^jun/i, 6],
  [/^jul/i, 7], [/^aug/i, 8], [/^sep/i, 9], [/^oct/i, 10], [/^nov/i, 11], [/^dec/i, 12],
];
const BANK = /^(ธ\.|ธนาคาร|bank\b|กสิกร|kbank|k ?plus|ไทยพาณิชย์|scb|กรุงเทพ|bbl|กรุงไทย|ktb|กรุงศรี|krungsri|ทหารไทย|ttb|ออมสิน|gsb|ธกส|ธ\.ก\.ส|ยูโอบี|uob|ซีไอเอ็มบี|cimb|แลนด์|kkp|เกียรตินาคิน|พร้อมเพย์|promptpay|true ?money|ทรูมันนี่)/i;
const MONEY = /(\d{1,3}(?:[,\s]\d{3})+|\d+)[.,](\d{2})(?!\d)/g;
const GUESS: [RegExp, Category][] = [
  [/ข้าว|กาแฟ|ก๋วยเตี๋ยว|อาหาร|ขนม|ร้านอาหาร|ส้มตำ|ชาบู|บุฟเฟ่|grab|lineman|foodpanda|robinhood|cafe|coffee|คอฟฟี่|คาเฟ่|ครัว|ร้านข้าว|ก๋วยจั๊บ|หมูกระทะ|starbucks|amazon/i, "food"],
  [/น้ำมัน|ปตท|ptt|เชลล์|shell|บางจาก|caltex|คาลเท็กซ์|ทางด่วน|easy ?pass|m-?flow|ล้างรถ|ซ่อมรถ|ยางรถ|ที่จอด/i, "car"],
  [/การไฟฟ้า|ไฟฟ้า|กฟน|กฟภ|\bmea\b|\bpea\b/i, "power"],
  [/การประปา|ประปา|กปน|กปภ|\bmwa\b|\bpwa\b/i, "water"],
  [/3bb|ais ?fibre|true ?online|ทรูออนไลน์|อินเทอร์เน็ต|internet|nt |fiber|ไฟเบอร์/i, "net"],
  [/ais|true|dtac|ทรูมูฟ|โทรศัพท์/i, "phone"],
  [/ประกัน|insurance|ค่าเช่า|นิติบุคคล/i, "bill"],
  [/โรงเรียน|school|อนุบาล|kids|คิดส์|ของเล่น|toy/i, "pearl"],
  [/lotus|โลตัส|big ?c|บิ๊กซี|makro|แม็คโคร|แม็กซ์แวลู|max ?value|7-?eleven|เซเว่น|cp ?all|ซีพี ออลล์|tops|ท็อปส์|villa|วิลล่า|ซูเปอร์|super|homepro|โฮมโปร|ไทวัสดุ|ikea|อิเกีย|watsons|วัตสัน|boots|ร้านยา|เภสัช/i, "home"],
];

const norm = (s: string) =>
  s.replace(/ํา/g, "ำ")
    .replace(/\.[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]+/g, ".") // สระลอยหลังจุด เช่น "พ.ุย." = OCR อ่านเพี้ยน
    .replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50))
    .replace(/[|]/g, " ").replace(/[ \t]+/g, " ");
const money = (m: RegExpMatchArray) => Number(`${m[1].replace(/[,\s]/g, "")}.${m[2]}`);

function findAmount(text: string): number | null {
  const key = text.search(/จำนวน(?:เงิน)?|ยอด(?:เงิน|โอน|ชำระ)?|amount|total/i);
  if (key >= 0) {
    for (const m of text.slice(key).matchAll(MONEY)) {
      const v = money(m);
      if (v > 0) return v;
    }
  }
  // ไม่มีคำนำ: เลือกยอดที่ตามด้วย บาท/THB ที่ไม่ใช่ค่าธรรมเนียม
  const lines = text.split("\n");
  const cands: number[] = [];
  lines.forEach((ln, i) => {
    if (/ค่าธรรมเนียม|fee/i.test(ln) || /ค่าธรรมเนียม|fee/i.test(lines[i - 1] ?? "")) return;
    for (const m of ln.matchAll(MONEY)) if (/บาท|thb|฿/i.test(ln)) cands.push(money(m));
  });
  const v = cands.find((x) => x > 0);
  return v ?? null;
}

function findDate(text: string): string | null {
  const re = /(\d{1,2})\s*([ก-๙a-z]{1,3}\.?\s?[ก-๙a-z]{0,3}\.?)\s*(\d{2,4})\s*[-,]?\s*(?:เวลา\s*)?(\d{1,2})[:.](\d{2})/i;
  const m = text.match(re);
  if (!m) return null;
  const mon = MONTHS.find(([r]) => r.test(m[2].replace(/\s/g, "")))?.[1];
  if (!mon) return null;
  let y = Number(m[3]);
  if (y < 100) y += y > 40 ? 2500 : 2000; // 69 = พ.ศ. 2569, 26 = ค.ศ. 2026
  if (y > 2400) y -= 543;
  const d = Number(m[1]), h = Number(m[4]), mi = Number(m[5]);
  if (d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${y}-${p(mon)}-${p(d)}T${p(h)}:${p(mi)}`;
}

function findRef(text: string): string | null {
  const m = text.match(/(?:เลขที่รายการ|รหัสอ้างอิง|เลขอ้างอิง|หมายเลขอ้างอิง|transaction ?(?:id|no)|ref(?:erence)?(?: ?no)?)\s*[:.]?\s*\n?\s*([A-Za-z0-9]{8,})/i);
  return m?.[1] ?? null;
}

// ตัดเศษตัวอักษรจากโลโก้/ไอคอนที่ OCR อ่านติดมาหน้าบรรทัด เช่น "© ", "@ ", "e "
const clean = (l: string) =>
  l.replace(/^(?:[^ก-๙A-Za-z0-9]+|[A-Za-z]{1,2}\s+(?=[ก-๙]))+/, "").replace(/[^ก-๙A-Za-z0-9.)]+$/, "").trim();
const ACCOUNT = /[xX*]{2,}|\d{3}-\d-\d{4,5}|\d{3}-\d{3}-\d{4}|รหัสร้านค้า|merchant ?id|biller ?id|รหัสผู้รับ|wallet ?id|เลขที่บัญชี|บัญชี ?:/i;
const LABEL_TO = /^(ไปยัง|ไปที่|ไป|ถึง|ผู้รับเงิน|ผู้รับ|รับเงิน|ชื่อร้านค้า|ชื่อร้าน|ร้านค้า|ชำระให้|จ่ายให้|to|payee|merchant(?: name)?)(?=[\s:.]|$)\s*[:.]?\s*/i;
const LABEL_FROM = /^(จาก|ผู้โอน|ผู้จ่าย|from)(?=[\s:.]|$)/i;
const NOT_NAME = /โอนเงิน|ชำระเงิน|จ่ายบิล|เติมเงิน|สำเร็จ|รายการ|จำนวน|ยอด|บาท|ค่าธรรมเนียม|อ้างอิง|สแกน|ตรวจสอบ|บันทึก|ช่วยจำ|วันที่|เวลา|successful|complete|\bamount\b|\bfee\b|\bref\b|^k ?plus$|make|scb ?easy|น\.$|\d{1,2}[:.]\d{2}/i;
const TITLED = /^(นาย|นางสาว|นาง|น\.ส\.?|ด\.ช\.?|ด\.ญ\.?|mr\.?|mrs\.?|ms\.?|miss|บจก\.?|บริษัท|หจก\.?|ห้าง|ร้าน|คุณ|co\.|company)/i;

function isName(l: string | undefined): boolean {
  if (!l || BANK.test(l) || ACCOUNT.test(l) || NOT_NAME.test(l) || LABEL_FROM.test(l)) return false;
  const letters = (l.match(/[ก-๙A-Za-z]/g) ?? []).length;
  const digits = (l.match(/\d/g) ?? []).length;
  return letters >= 2 && digits <= letters / 2;
}

function findParties(raw: string[]): { bank: string | null; recipient: string | null } {
  const lines = raw.map(clean).filter(Boolean);
  const anchor = (l: string) => BANK.test(l) || ACCOUNT.test(l);
  const stop = lines.findIndex((l) => /^(จำนวน|เลขที่รายการ|ค่าธรรมเนียม|amount)/i.test(l));
  const body = stop >= 0 ? lines.slice(0, stop) : lines;
  // ผู้โอน = ชื่อแรกที่มีธนาคาร/เลขบัญชีตามมาใน 2 บรรทัด
  const sender = body.findIndex((l, i) => isName(l) && body.slice(i + 1, i + 3).some(anchor));
  const bankLine = (sender >= 0 ? body.slice(sender + 1, sender + 3).find((l) => BANK.test(l)) : null) ?? lines.find((l) => BANK.test(l) && l.length <= 40) ?? null;
  let recipient: string | null = null;

  // 1) มีป้ายบอก เช่น "ไปยัง นาย ก" / "ผู้รับ" แล้วชื่ออยู่บรรทัดถัดไป
  const to = lines.findIndex((l) => LABEL_TO.test(l));
  if (to >= 0) {
    const rest = lines[to].replace(LABEL_TO, "");
    recipient = isName(rest) ? rest : lines.slice(to + 1, to + 3).find(isName) ?? null;
  }

  // 2) แบบสลิปทั่วไป: [ชื่อผู้โอน / ธนาคาร / เลขบัญชี] แล้วตามด้วย [ชื่อผู้รับหรือร้าน / ธนาคาร หรือรหัสร้าน]
  if (!recipient && sender >= 0) {
    let i = sender + 1;
    while (i < body.length && !isName(body[i])) i++;
    recipient = body[i] ?? null;
  }

  // 3) ไม่เจอธนาคารเลย: ใช้ชื่อที่มีคำนำหน้า (คนที่สองคือผู้รับ)
  if (!recipient) {
    const titled = lines.filter((l) => TITLED.test(l) && isName(l));
    recipient = titled[1] ?? null;
  }
  return { bank: bankLine, recipient: recipient?.slice(0, 80) ?? null };
}

// ---------- ใบเสร็จ ----------
const RECEIPT_HINT = /ใบเสร็จ|receipt|tax ?inv|ใบกำกับภาษี|ราคารวม|รวมทั้งสิ้น|ยอดสุทธิ|เงินทอน|\bchange\b|\bcash\b|เงินสด|vat|vatable|subtotal|sub ?total|pos ?(?:id|no)|cashier|พนักงาน|ขอบคุณ|thank ?you/gi;
const SLIP_HINT = /โอนเงินสำเร็จ|ชำระเงินสำเร็จ|จ่ายบิลสำเร็จ|เลขที่รายการ|รหัสอ้างอิง|ค่าธรรมเนียม/;
const TOTAL_STRONG = /รวมทั้งสิ้น|รวมท.?ั?งส|ยอดสุ.?ธ|สุ[ทกห]ธิ|ยอดชำระ|ยอดที่ต้องชำระ|grand ?total|net ?total|net ?amount|total ?due|amount ?due|total ?amount|ทั้งหมด/i;
const TOTAL_WEAK = /total|ยอดรวม|รวมเงิน|รวม|ttl/i;
const NOT_TOTAL = /sub ?total|ก่อน ?vat|ก่อนภาษี|vatable|ภาษี|vat|ส่วนลด|discount|เงินทอน|ทอน|change|cash|เงินสด|รับเงิน|รับมา|tendered|point|แต้ม|สะสม/i;
const MONEY_LOOSE = /(\d{1,3}(?:,\d{3})+|\d+)(?:[.,](\d{2}))?(?![\d.,])/g;
const moneyLoose = (m: RegExpMatchArray) => Number(`${m[1].replace(/,/g, "")}.${m[2] ?? "00"}`);

/** เดาว่าข้อความเป็นใบเสร็จ (ไม่ใช่สลิปโอนเงิน) */
export function looksLikeReceipt(text: string): boolean {
  if (SLIP_HINT.test(text)) return false;
  return (text.match(RECEIPT_HINT) ?? []).length >= 2 || TOTAL_STRONG.test(text);
}

function amountOnLine(lines: string[], i: number): number | null {
  for (const ln of [lines[i], lines[i + 1]]) {
    if (!ln) continue;
    const vals = [...ln.matchAll(MONEY_LOOSE)].map(moneyLoose).filter((v) => v > 0 && v < 1e7);
    // ราคาอยู่ท้ายบรรทัด
    if (vals.length) return vals[vals.length - 1];
  }
  return null;
}

function receiptTotal(lines: string[]): number | null {
  // ไล่จากล่างขึ้นบน เพราะยอดรวมสุดท้ายมักอยู่ล่าง
  for (const re of [TOTAL_STRONG, TOTAL_WEAK]) {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (re.test(lines[i]) && !NOT_TOTAL.test(lines[i].replace(re, ""))) {
        const v = amountOnLine(lines, i);
        if (v) return v;
      }
    }
  }
  return null;
}

/** ยอดรวมจากใบเสร็จ ตรวจซ้ำด้วย เงินสด − เงินทอน ถ้ามี (ช่วยตอนตัวเลขอ่านเพี้ยน) */
function receiptAmount(lines: string[]): number | null {
  const found = receiptTotal(lines) ?? receiptMax(lines);
  const pick = (re: RegExp) => {
    const l = lines.find((x) => re.test(x) && !/ใบเสร็จ|ใบกำกับ/.test(x));
    const v = l ? [...l.matchAll(MONEY)].map(money) : [];
    return v.length ? v[v.length - 1] : null;
  };
  const cash = pick(/เงินสด|cash|รับเงิน|รับมา|tendered/i), change = pick(/เงินทอน|ทอน|change/i);
  if (cash && change != null && cash > change) {
    const paid = Math.round((cash - change) * 100) / 100;
    if (!found || Math.abs(found - paid) <= Math.max(1, paid * 0.02)) return paid;
  }
  return found;
}

function receiptMax(lines: string[]): number | null {
  // ไม่เจอคำว่ารวม: ใช้ราคาที่มากที่สุด (ไม่นับเงินสด/เงินทอน)
  const vals = lines.filter((l) => !NOT_TOTAL.test(l) && !/โทร|tel|tax ?id|เลขประจำตัว|\d{2}[/-]\d{2}[/-]\d{2,4}/i.test(l))
    .flatMap((l) => [...l.matchAll(MONEY)].map(money)).filter((v) => v > 0 && v < 1e6);
  return vals.length ? Math.max(...vals) : null;
}

function receiptDate(text: string): string | null {
  const thai = findDate(text);
  if (thai) return thai;
  const m = text.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[^\d\n]{0,12}(\d{1,2})[:.](\d{2}))?/);
  if (!m) return null;
  const d = Number(m[1]), mon = Number(m[2]);
  let y = Number(m[3]);
  if (y < 100) y += y > 40 ? 2500 : 2000;
  if (y > 2400) y -= 543;
  if (d < 1 || d > 31 || mon < 1 || mon > 12 || y < 2000 || y > 2100) return null;
  let h = m[4] ? Number(m[4]) : NaN, mi = m[5] ? Number(m[5]) : NaN;
  if (!(h <= 23 && mi <= 59)) {
    const t = text.match(/(?:^|[^\d])([01]?\d|2[0-3])[:.]([0-5]\d)(?![\d.])/m);
    h = t ? Number(t[1]) : 12; mi = t ? Number(t[2]) : 0;
  }
  const p = (n: number) => String(n).padStart(2, "0");
  return `${y}-${p(mon)}-${p(d)}T${p(h)}:${p(mi)}`;
}

function receiptShop(lines: string[]): string | null {
  const skip = /ใบเสร็จ|receipt|tax ?inv|ใบกำกับ|ต้นฉบับ|สำเนา|copy|abb|เลขประจำตัว|tax ?id|โทร|tel|เลขที่|no\.|pos|วันที่|date|เวลา|time|สาขาที่|www|http|@|ยินดีต้อนรับ|welcome/i;
  for (const raw of lines.slice(0, 6)) {
    const l = clean(raw);
    const letters = (l.match(/[ก-๙A-Za-z]/g) ?? []).length;
    if (letters >= 3 && !skip.test(l) && !MONEY.test(l)) { MONEY.lastIndex = 0; return l.slice(0, 60); }
    MONEY.lastIndex = 0;
  }
  return null;
}

function receiptNo(text: string): string | null {
  const m = text.match(/(?:เลขที่(?:ใบเสร็จ|ใบกำกับ)?|receipt ?(?:no|#)|tax ?inv(?:oice)?\.? ?(?:no)?|inv(?:oice)? ?no|bill ?no|r#|no\.?)\s*[:#.]?\s*([A-Za-z0-9/-]{5,})/i);
  return m?.[1] ?? null;
}

export function parseReceiptText(raw: string): SlipFields {
  const text = norm(raw);
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const shop = receiptShop(lines);
  const no = receiptNo(text);
  const category_guess = GUESS.find(([re]) => re.test(shop ?? "") || re.test(lines.slice(0, 8).join(" ")))?.[1] ?? "other";
  return { kind: "receipt", amount: receiptAmount(lines), datetime: receiptDate(text), recipient: shop, bank: null, reference: no ? `rc:${(shop ?? "").slice(0, 12)}:${no}` : null, category_guess };
}

export function parseSlipText(raw: string): SlipFields {
  const text = norm(raw);
  if (looksLikeReceipt(text)) return parseReceiptText(raw);
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const { bank, recipient } = findParties(lines);
  const category_guess = GUESS.find(([re]) => re.test(recipient ?? ""))?.[1] ?? "other";
  return { kind: "slip", amount: findAmount(text), datetime: findDate(text), recipient, bank, reference: findRef(text), category_guess };
}
