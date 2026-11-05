"use client";

import { useState } from "react";
import { CatIcon, useCategories } from "./Categories";
import { LockIcon } from "./Icons";
import { baht, thaiDate, thaiTime } from "@/lib/format";
import { isHouseholdSpend, paidFromLabel } from "@/lib/family";
import { myShare } from "@/lib/settle";
import { chargeInMonth, isSub, type CardRow, type ChargeRow } from "@/lib/cards";
import type { ExpenseRow } from "@/lib/types";

export type ListKind = "home" | "self" | "card" | "share";
export type ListItem = {
  key: string; at: Date; title: string; amount: number; category: string; kind: ListKind;
  sub: string; expense?: ExpenseRow; pending?: boolean; locked?: boolean;
};

const KIND_LABEL: Record<Exclude<ListKind, "home">, string> = { self: "จ่ายเอง", card: "รูดบัตร", share: "ส่วนของฉันในบ้าน" };

/** รายการบัตรของฉันที่ตกในเดือน y/m (ผ่อนนับเดือนละงวด · ส่วนที่เรียกเก็บแล้วหักออก) */
export function cardItemsInMonth(cards: CardRow[], charges: ChargeRow[], y: number, m: number): ListItem[] {
  const out: ListItem[] = [];
  const name = new Map(cards.map((c) => [c.id, c.name]));
  for (const c of charges) {
    const [cy, cm, cd] = c.charged_on.split("-").map(Number);
    const k = (y - cy) * 12 + m - (cm - 1);
    const inst = c.months > 1 && !isSub(c);
    let v = inst ? (k >= 0 && k < c.months ? Number(c.amount) / c.months : 0) : chargeInMonth(c, y, m);
    if (v <= 0) continue;
    let billed = "";
    if (c.bill_to && c.bill_status === "accepted") {
      const part = c.bill_mode === "home" ? v : Math.min(v, Number(c.bill_amount ?? 0) / (inst ? c.months : 1));
      v -= part;
      billed = c.bill_mode === "home" ? " · เข้าเงินบ้าน" : ` · เรียกเก็บแล้ว ${baht(part)}`;
      if (v <= 0) continue;
    }
    const at = new Date(y, m, Math.min(cd, new Date(y, m + 1, 0).getDate()), 12);
    const card = name.get(c.card_id) ?? "";
    out.push({
      key: `card-${c.id}-${y}-${m}`, at, title: c.title, amount: v, category: c.category ?? "other", kind: "card",
      sub: `${card.startsWith("บัตร") ? "" : "บัตร "}${card}${inst ? ` · ผ่อนงวด ${k + 1}/${c.months}` : isSub(c) ? " · subscription" : ""}${billed}`,
    });
  }
  return out;
}

/** รายการเดือนนี้: แท็บบ้าน = รายจ่ายบ้าน · แท็บของฉัน = จ่ายเอง + รูดบัตร + ส่วนของฉันในรายจ่ายบ้าน */
export function buildMonthItems({ scope, rows, cardItems, role, userId, people }: {
  scope: "home" | "mine"; rows: ExpenseRow[]; cardItems: ListItem[]; role: string; userId: string;
  people: Parameters<typeof paidFromLabel>[1];
}): ListItem[] {
  const items: ListItem[] = [];
  for (const e of rows) {
    const extra = `${e.slip_ref ? ` · สลิป${e.bank ? ` ${e.bank}` : ""}` : ""}${e.note === "หักอัตโนมัติ" ? " · หักอัตโนมัติ" : ""}`;
    const base = { at: new Date(e.spent_at), title: e.merchant, category: e.category, expense: e, pending: e.status === "pending" };
    const mine = e.created_by === userId && (e.paid_from === "personal" || e.private);
    if (scope === "home") {
      if (!isHouseholdSpend(e)) continue;
      items.push({ ...base, key: e.id, amount: Number(e.amount), kind: "home", sub: `${paidFromLabel(e.paid_from, people)}${extra}` });
    } else if (mine) {
      items.push({ ...base, key: e.id, amount: Number(e.amount), kind: "self", locked: e.private, sub: `${e.private && e.paid_from !== "personal" ? "เห็นคนเดียว" : "จ่ายเอง"}${extra}` });
    } else if (!e.private && !e.card_charge_id) {
      const sh = myShare(e, role);
      if (sh <= 0) continue;
      items.push({ ...base, key: `share-${e.id}`, amount: Number(e.amount) * sh, kind: "share",
        sub: `ส่วนของฉัน ${Math.round(sh * 100)}% จาก ${baht(Number(e.amount))} · ${paidFromLabel(e.paid_from, people)}` });
    }
  }
  if (scope === "mine") items.push(...cardItems);
  return items.sort((a, b) => b.at.getTime() - a.at.getTime());
}

export function MonthList({ scope, items, onEdit, onAdd }: {
  scope: "home" | "mine"; items: ListItem[]; onEdit: (e: ExpenseRow) => void; onAdd: () => void;
}) {
  const cats = useCategories();
  const [kind, setKind] = useState<ListKind | "all">("all");
  const [more, setMore] = useState(false);
  const shown = kind === "all" ? items : items.filter((i) => i.kind === kind);
  const sum = (k?: ListKind) => (k ? items.filter((i) => i.kind === k) : items).reduce((s, i) => s + i.amount, 0);
  const kinds = (["self", "card", "share"] as const).filter((k) => items.some((i) => i.kind === k));
  return (
    <section className="card flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-[17px] font-semibold">รายการเดือนนี้</h2>
        <button onClick={onAdd} className="min-h-9 px-1 text-sm text-muted">+ จดเอง</button>
      </div>
      {items.length > 0 && (
        <div className="flex items-baseline justify-between rounded-2xl bg-sand px-3 py-2 text-sm">
          <span>{kind === "all" ? "รวมทั้งเดือน" : KIND_LABEL[kind as Exclude<ListKind, "home">]} · {shown.length} รายการ</span>
          <b className="font-display text-lg">{baht(sum(kind === "all" ? undefined : kind))} บาท</b>
        </div>
      )}
      {scope === "mine" && kinds.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button className="chip" aria-pressed={kind === "all"} onClick={() => setKind("all")}>ทั้งหมด</button>
          {kinds.map((k) => <button key={k} className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{KIND_LABEL[k]} {baht(sum(k))}</button>)}
        </div>
      )}
      {shown.length === 0 && <p className="text-sm text-muted">ยังไม่มีรายการ</p>}
      {(more ? shown : shown.slice(0, 30)).map((i) => {
        const cat = cats.get(i.category);
        const body = (
          <>
            <span className="relative shrink-0">
              <CatIcon icon={cat.icon} size={36} />
              {i.locked && <span className="absolute -bottom-1 -right-1 rounded-full bg-white p-0.5"><LockIcon size={12} /></span>}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold">{i.title || cat.label}</span>
              <span className="truncate text-xs text-muted">{thaiDate(i.at, { day: "numeric", month: "short" })}{i.expense ? ` ${thaiTime(i.at)}` : ""} · {cat.label} · {i.sub}</span>
            </span>
            {i.pending && <span className="rounded-lg bg-butter px-2 py-0.5 text-[11px] font-semibold">รอตรวจ</span>}
            <span className="shrink-0 font-semibold">{baht(i.amount)}</span>
          </>
        );
        return i.expense
          ? <button key={i.key} onClick={() => onEdit(i.expense!)} className="flex items-center gap-2.5 text-left text-sm">{body}</button>
          : <div key={i.key} className="flex items-center gap-2.5 text-sm">{body}</div>;
      })}
      {shown.length > 30 && <button className="self-start text-xs text-muted underline" onClick={() => setMore(!more)}>{more ? "ย่อ" : `ดูอีก ${shown.length - 30} รายการ`}</button>}
      {scope === "mine" && items.some((i) => i.kind === "card") && <p className="text-xs text-muted">รูดบัตรนับตามวันที่รูด (ผ่อนนับเดือนละงวด) แก้ได้ที่หน้าบัตร · การ์ดบนสุดนับยอดบัตรตอนจ่ายบิล ตัวเลขจึงอาจไม่เท่ากัน</p>}
    </section>
  );
}
