// สร้างข้อความ QR พร้อมเพย์ (มาตรฐาน EMVCo / Thai QR) ทำในเครื่อง ไม่เชื่อมธนาคาร
// คนจ่ายเปิดแอปธนาคารของตัวเองสแกน แล้วยืนยันในแอปธนาคารเอง

const f = (id: string, v: string) => `${id}${String(v.length).padStart(2, "0")}${v}`;

function crc16(s: string): string {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function validPromptPay(id: string | null | undefined): id is string {
  return !!id && /^(\d{10}|\d{13}|\d{15})$/.test(id);
}

/** id = เบอร์มือถือ 10 หลัก / เลขบัตร 13 หลัก / e-wallet 15 หลัก, amount = บาท (ไม่ใส่ = ให้คนจ่ายกรอกเอง) */
export function promptPayPayload(id: string, amount?: number): string {
  const target = id.length === 10 ? f("01", `0066${id.slice(1)}`) : id.length === 13 ? f("02", id) : f("03", id);
  const hasAmount = amount != null && amount > 0;
  const body =
    f("00", "01") +
    f("01", hasAmount ? "12" : "11") +
    f("29", f("00", "A000000677010111") + target) +
    f("58", "TH") +
    f("53", "764") +
    (hasAmount ? f("54", amount.toFixed(2)) : "") +
    "6304";
  return body + crc16(body);
}

/** ซ่อนเบอร์บางส่วน เช่น 081-xxx-5678 */
export function maskPromptPay(id: string): string {
  if (id.length === 10) return `${id.slice(0, 3)}-xxx-${id.slice(6)}`;
  return `${"x".repeat(id.length - 4)}${id.slice(-4)}`;
}
