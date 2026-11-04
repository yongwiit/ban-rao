// เมนูที่บ้านเลือกเปิด/ปิดได้ (หน้า "วันนี้" ปิดไม่ได้)
export type TabKey = "calendar" | "shopping" | "stars" | "money";
export const MENUS: { key: TabKey; emoji: string; name: string; desc: string; parent?: boolean }[] = [
  { key: "calendar", emoji: "📅", name: "ปฏิทิน", desc: "นัดของทุกคนในบ้าน เตือนก่อนถึงเวลา" },
  { key: "shopping", emoji: "🛒", name: "ซื้อของ", desc: "รายการของที่ต้องซื้อ ใครไปซื้อก็ติ๊กได้" },
  { key: "stars", emoji: "⭐", name: "สมุดดาว", desc: "ลูกทำงานบ้าน สะสมดาว แลกรางวัล" },
  { key: "money", emoji: "💰", name: "เงิน", desc: "จดรายจ่าย อ่านสลิป งบเดือน เงินออม", parent: true },
];
