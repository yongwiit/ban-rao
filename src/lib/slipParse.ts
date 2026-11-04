// แปลงข้อความ OCR จากสลิปโอนเงินไทย เป็นยอด วันเวลา ผู้รับ ธนาคาร เลขอ้างอิง
import type { Category } from "./family";

export type SlipFields = {
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
  [/ข้าว|กาแฟ|ก๋วยเตี๋ยว|อาหาร|ขนม|ร้านอาหาร|ส้มตำ|ชาบู|บุฟเฟ่|grab|lineman|foodpanda|robinhood|cafe|คาเฟ่|ครัว/i, "food"],
  [/น้ำมัน|ปตท|ptt|เชลล์|shell|บางจาก|caltex|คาลเท็กซ์|ทางด่วน|easy ?pass|m-?flow|ล้างรถ|ซ่อมรถ|ยางรถ|ที่จอด/i, "car"],
  [/การไฟฟ้า|ไฟฟ้า|การประปา|ประปา|ais|true|dtac|3bb|nt |ประกัน|insurance|ค่าเช่า|นิติบุคคล/i, "bill"],
  [/โรงเรียน|school|อนุบาล|kids|คิดส์|ของเล่น|toy/i, "pearl"],
  [/lotus|โลตัส|big ?c|บิ๊กซี|makro|แม็คโคร|แม็กซ์แวลู|max ?value|7-?eleven|เซเว่น|cp ?all|ซีพี ออลล์|tops|ท็อปส์|villa|วิลล่า|ซูเปอร์|super|homepro|โฮมโปร|ไทวัสดุ|ikea|อิเกีย|watsons|วัตสัน|boots|ร้านยา|เภสัช/i, "home"],
];

const norm = (s: string) => s.replace(/ํา/g, "ำ").replace(/[|]/g, " ").replace(/[ \t]+/g, " ");
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

function findParties(lines: string[]): { bank: string | null; recipient: string | null } {
  const bankIdx = lines.map((l, i) => (BANK.test(l) ? i : -1)).filter((i) => i >= 0);
  const bank = bankIdx.length ? lines[bankIdx[0]] : null;
  const isName = (l: string | undefined) => !!l && !BANK.test(l) && !/x{2,}|\d{3,}|โอนเงิน|สำเร็จ|รายการ|จำนวน|บาท|:/i.test(l) && /[ก-๙a-z]{2,}/i.test(l);
  let recipient: string | null = null;
  if (bankIdx.length >= 2) {
    const i = bankIdx[1];
    recipient = isName(lines[i - 1]) ? lines[i - 1] : isName(lines[i + 1]) ? lines[i + 1] : null;
  }
  if (!recipient) {
    const to = lines.findIndex((l) => /^(ไปยัง|ไป|ถึง|ผู้รับ|to)(?=[\s:.]|$)/i.test(l));
    if (to >= 0) recipient = lines[to].replace(/^(ไปยัง|ไป|ถึง|ผู้รับ|to)\s*[:.]?\s*/i, "") || lines[to + 1] || null;
  }
  return { bank, recipient: recipient?.slice(0, 80) ?? null };
}

export function parseSlipText(raw: string): SlipFields {
  const text = norm(raw);
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const { bank, recipient } = findParties(lines);
  const category_guess = GUESS.find(([re]) => re.test(recipient ?? ""))?.[1] ?? "other";
  return { amount: findAmount(text), datetime: findDate(text), recipient, bank, reference: findRef(text), category_guess };
}
