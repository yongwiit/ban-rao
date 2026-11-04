import type { Repeat } from "./recur";
import type { BillPeriod, Category, PaidFrom, Role, Who } from "./family";

export type EventRow = {
  id: string; title: string; starts_at: string; ends_at: string | null; all_day: boolean; who: Who;
  note: string | null; private: boolean; created_by: string;
  repeat: Repeat; remind_before: number | null; countdown?: boolean;
};
export type CommentRow = { id: string; event_id: string; body: string; created_by: string; created_at: string };
export type ListRow = { id: string; name: string; sort: number; remind_at: string | null; remind_repeat: "none" | "daily" | "weekly" | "monthly" };
export type ItemRow = { id: string; list_id: string; name: string; done: boolean; created_by: string; created_at: string };
export type CategoryRow = { id: string; name: string };
export type ExpenseRow = {
  id: string; amount: number; spent_at: string; merchant: string; category: Category; paid_from: PaidFrom;
  private: boolean; status: "pending" | "confirmed"; slip_ref: string | null; bank: string | null;
  note: string | null; created_by: string; created_at: string;
  bill_id?: string | null; card_charge_id?: string | null;
};
export type BillRow = {
  id: string; name: string; amount: number; period: BillPeriod; due_day: number | null; active: boolean;
  paid_from: PaidFrom; category: string | null; created_by: string | null;
  /** หักบัญชีอัตโนมัติ: ระบบจดรายจ่ายให้ทุกเดือนในวันครบกำหนด (ตั้งแต่ auto_from) */
  auto_record: boolean; auto_from: string | null;
  /** ยอดไม่คงที่: เตือนให้จดยอดจริงทุกเดือน */
  variable: boolean;
};
export type SettlementRow = { id: string; from_role: Role; to_role: Role; amount: number; created_at: string };
export type MemberRow = { user_id: string; role: Role };
export type StarTask = { id: string; title: string; stars: number; emoji: string; kid: string | null; active: boolean };
export type StarReward = { id: string; title: string; cost: number; emoji: string; active: boolean };
export type StarLog = {
  id: string; kid: string; kind: "earn" | "redeem"; stars: number; title: string; emoji: string;
  status: "pending" | "approved" | "rejected"; created_by: string; created_at: string; decided_at: string | null;
};
