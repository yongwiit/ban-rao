"use client";

import { useMemo, useState } from "react";
import { useHousehold } from "@/components/Household";
import { Mascot } from "@/components/Mascots";
import { Sheet } from "@/components/Sheet";
import { supabase } from "@/lib/supabase";
import { useLive } from "@/lib/useLive";
import { play } from "@/lib/sfx";
import { confetti } from "@/lib/confetti";
import { thaiDate, thaiTime } from "@/lib/format";
import type { StarLog, StarReward, StarTask } from "@/lib/types";
import { PromptPayQR } from "@/components/PromptPayQR";
import { validPromptPay } from "@/lib/promptpay";
import Link from "next/link";

/** ยอดดาว: ได้ดาวนับเมื่ออนุมัติ / แลกรางวัลหักทันทีแม้ยังรอ */
function balanceOf(logs: StarLog[], kid: string) {
  return logs.filter((l) => l.kid === kid && (l.status === "approved" || (l.kind === "redeem" && l.status === "pending"))).reduce((s, l) => s + l.stars, 0);
}

export default function StarsPage() {
  const { household, people, isParent, role, userId } = useHousehold();
  const hid = household.id;
  const kids = people.list.filter((p) => p.kid);
  const [picked, setPicked] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payAmt, setPayAmt] = useState("");
  const kid = isParent ? (picked && kids.some((k) => k.key === picked) ? picked : kids[0]?.key) : role;
  const me = kid ? people.get(kid) : null;

  const tasks = useLive<StarTask>("star_tasks", hid, () => supabase().from("star_tasks").select("*").eq("active", true).order("created_at"));
  const rewards = useLive<StarReward>("star_rewards", hid, () => supabase().from("star_rewards").select("*").eq("active", true).order("cost"));
  const logs = useLive<StarLog>("star_log", hid, () => supabase().from("star_log").select("*").order("created_at", { ascending: false }).limit(300));

  const [edit, setEdit] = useState<{ type: "task" | "reward"; row: StarTask | StarReward | null } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [clearAsk, setClearAsk] = useState(false);
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });

  const balance = kid ? balanceOf(logs.rows, kid) : 0;
  const myLogs = logs.rows.filter((l) => l.kid === kid);
  const pending = logs.rows.filter((l) => l.status === "pending" && (isParent ? true : l.kid === kid));
  const myTasks = tasks.rows.filter((t) => !t.kid || t.kid === kid);
  const nextReward = useMemo(() => rewards.rows.find((r) => r.cost > balance) ?? rewards.rows[rewards.rows.length - 1], [rewards.rows, balance]);

  async function add(row: Omit<StarLog, "id" | "created_at" | "decided_at" | "created_by" | "status"> & { status: StarLog["status"] }, okMsg: string) {
    setBusy(row.title);
    setMsg(null);
    const { error } = await supabase().from("star_log").insert({ household_id: hid, created_by: userId, ...row });
    setBusy(null);
    if (error) { setMsg(error.message.includes("ดาวไม่พอ") ? "ดาวยังไม่พอนะ สะสมอีกนิด" : "บันทึกไม่ได้ ลองใหม่อีกครั้ง"); return false; }
    setMsg(okMsg);
    return true;
  }

  async function earn(t: StarTask) {
    if (!kid || !me) return;
    if (isParent) {
      if (await add({ kid, kind: "earn", stars: t.stars, title: t.title, emoji: t.emoji, status: "approved" }, `ให้${me.name} ${t.stars} ดาวแล้ว ⭐`)) { play("star"); confetti({ emoji: "⭐" }); }
    } else if (await add({ kid, kind: "earn", stars: t.stars, title: t.title, emoji: t.emoji, status: "pending" }, "ส่งให้พ่อแม่ดูแล้ว รออนุมัตินะ")) play("heart");
  }

  async function redeem(r: StarReward) {
    if (!kid || !me) return;
    const status = isParent ? "approved" : "pending";
    if (await add({ kid, kind: "redeem", stars: -r.cost, title: r.title, emoji: r.emoji, status }, isParent ? `แลก${r.title}ให้${me.name}แล้ว 🎉` : "ขอแลกแล้ว รอพ่อแม่อนุมัตินะ")) {
      play("tada");
      confetti({ emoji: r.emoji });
    }
  }

  async function decide(l: StarLog, ok: boolean) {
    setBusy(l.id);
    const { error } = await supabase().from("star_log").update({ status: ok ? "approved" : "rejected" }).eq("id", l.id);
    setBusy(null);
    if (error) return setMsg(error.message.includes("ดาวไม่พอ") ? "ดาวไม่พอแล้ว" : "บันทึกไม่ได้");
    if (ok) { play(l.kind === "earn" ? "star" : "tada"); confetti({ emoji: l.emoji }); }
  }

  async function removeLog(id: string) {
    setBusy(id);
    const { error } = await supabase().from("star_log").delete().eq("id", id);
    setBusy(null);
    setDelId(null);
    setMsg(error ? "ลบไม่ได้ ลองใหม่อีกครั้ง" : "ลบรายการแล้ว");
  }
  async function clearAll() {
    if (!kid || !me) return;
    setBusy("clear");
    const { error } = await supabase().from("star_log").delete().eq("household_id", hid).eq("kid", kid);
    setBusy(null);
    setClearAsk(false);
    setMsg(error ? "ล้างไม่ได้ ลองใหม่อีกครั้ง" : `ล้างประวัติของ${me.name}แล้ว เริ่มนับใหม่ 0 ดาว`);
  }

  // สรุปรายเดือน (เวลาไทย)
  const mKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }).slice(0, 7);
  const key = `${ym.y}-${String(ym.m + 1).padStart(2, "0")}`;
  const counted = myLogs.filter((l) => l.status === "approved" || (l.kind === "redeem" && l.status === "pending"));
  const inMonth = counted.filter((l) => mKey(l.created_at) === key);
  const earnedMonth = inMonth.filter((l) => l.kind === "earn").reduce((a, l) => a + l.stars, 0);
  const redeemedMonth = inMonth.filter((l) => l.kind === "redeem");
  const usedMonth = -redeemedMonth.reduce((a, l) => a + l.stars, 0);
  const earnedAll = counted.filter((l) => l.kind === "earn").reduce((a, l) => a + l.stars, 0);
  const usedAll = -counted.filter((l) => l.kind === "redeem").reduce((a, l) => a + l.stars, 0);
  const months6 = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { y: d.getFullYear(), m: d.getMonth(), k, label: d.toLocaleDateString("th-TH", { month: "short" }), v: counted.filter((l) => l.kind === "earn" && mKey(l.created_at) === k).reduce((a, l) => a + l.stars, 0) };
  });
  const maxM = Math.max(1, ...months6.map((x) => x.v));
  function shift(n: number) { const d = new Date(ym.y, ym.m + n, 1); setYm({ y: d.getFullYear(), m: d.getMonth() }); }

  if (!kids.length) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-[26px] font-bold">สมุดสะสมดาว ⭐</h1>
        <section className="card text-sm text-muted">ยังไม่มีลูกในบ้าน เพิ่มได้ที่ตั้งค่า &gt; คนในบ้าน</section>
      </div>
    );
  }

  // แสตมป์: เต็มแถวละ 10 ดวง ถึงรางวัลถัดไป
  const goal = Math.max(10, Math.min(60, nextReward?.cost ?? 10));
  const filled = Math.max(0, Math.min(balance, goal));

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-[26px] font-bold">สมุดสะสมดาว ⭐</h1>
        {isParent && me && <button className="btn-soft min-h-10 px-3.5 text-[13px]" onClick={() => setPayOpen(true)}>💸 โอนให้{me.name}</button>}
      </header>
      <Sheet open={payOpen} onClose={() => setPayOpen(false)} title={me ? `โอนเงินให้${me.name}` : ""}>
        {me && (validPromptPay(me.promptpay) ? (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium">
              ยอดเงิน (บาท) ไม่ใส่ก็ได้
              <input className="field" inputMode="decimal" value={payAmt} onChange={(e) => setPayAmt(e.target.value.replace(/[^\d.]/g, ""))} placeholder="เช่น ค่าขนม 100" />
            </label>
            <div className="flex flex-wrap gap-2">{[20, 50, 100, 200].map((n) => <button key={n} type="button" className="chip" aria-pressed={payAmt === String(n)} onClick={() => setPayAmt(String(n))}>{n}</button>)}</div>
            <PromptPayQR id={me.promptpay} amount={Number(payAmt) > 0 ? Number(payAmt) : undefined} name={me.name} />
          </div>
        ) : (
          <p className="rounded-2xl bg-sand p-3 text-sm">ใส่พร้อมเพย์ของ{me.name}ก่อนนะ ที่ <Link href="/settings" className="font-semibold underline">ตั้งค่า → คนในบ้าน</Link> แตะชื่อ{me.name} แล้วใส่เบอร์ในช่อง &quot;พร้อมเพย์&quot;</p>
        ))}
      </Sheet>

      {isParent && kids.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {kids.map((k) => (
            <button key={k.key} className="chip flex items-center gap-1" aria-pressed={kid === k.key} onClick={() => setPicked(k.key)}>
              <Mascot kind={k.mascot} size={22} />{k.name}
            </button>
          ))}
        </div>
      )}

      {me && (
        <section className="card flex flex-col gap-3" style={{ background: me.soft }}>
          <div className="flex items-center gap-3">
            <Mascot kind={me.mascot} size={60} happy={balance > 0} />
            <div className="flex-1">
              <p className="font-display text-lg font-semibold">{me.name}</p>
              <p className="text-sm text-muted">{nextReward ? (balance >= nextReward.cost ? `แลก${nextReward.title}ได้แล้ว! 🎉` : `อีก ${nextReward.cost - balance} ดาว ได้${nextReward.title}`) : "ให้พ่อแม่ตั้งของรางวัลก่อนนะ"}</p>
            </div>
            <div className="text-right">
              <p className="font-display text-4xl font-bold leading-none">{balance}</p>
              <p className="text-xs text-muted">ดาว</p>
            </div>
          </div>
          <div className="grid grid-cols-10 gap-1 rounded-2xl bg-white/70 p-2" aria-label={`สะสมแล้ว ${balance} ดาว`}>
            {Array.from({ length: goal }, (_, i) => (
              <span key={i} className={`flex aspect-square items-center justify-center rounded-full text-[15px] ${i < filled ? "stamp-in" : "border-2 border-dashed border-[#E6D9CF]"}`} style={i < filled ? { animationDelay: `${Math.min(i, 20) * 0.03}s` } : undefined}>
                {i < filled ? "⭐" : ""}
              </span>
            ))}
          </div>
        </section>
      )}

      {msg && <p role="status" className="rounded-2xl bg-white px-4 py-2 text-center text-sm">{msg}</p>}

      {pending.length > 0 && (
        <section className="card flex flex-col gap-2">
          <h2 className="font-display text-lg font-semibold">{isParent ? "รออนุมัติ" : "รอพ่อแม่ดู"} ({pending.length})</h2>
          {pending.map((l) => (
            <div key={l.id} className="flex items-center gap-2 rounded-2xl bg-sand px-3 py-2">
              <span className="text-xl">{l.emoji}</span>
              <div className="flex flex-1 flex-col">
                <span className="text-sm font-semibold">{l.kind === "earn" ? l.title : `ขอแลก ${l.title}`}</span>
                <span className="text-xs text-muted">{people.get(l.kid).name} · {l.kind === "earn" ? `+${l.stars}` : l.stars} ดาว</span>
              </div>
              {isParent && (
                <>
                  <button className="min-h-10 rounded-full bg-white px-3 text-sm" disabled={busy === l.id} onClick={() => decide(l, false)}>ไม่ให้</button>
                  <button className="min-h-10 rounded-full bg-cocoa px-3 text-sm font-semibold text-cream" disabled={busy === l.id} onClick={() => decide(l, true)}>อนุมัติ</button>
                </>
              )}
            </div>
          ))}
        </section>
      )}

      <section className="card flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">ทำแล้วได้ดาว</h2>
          {isParent && <button className="text-sm text-muted underline" onClick={() => setEdit({ type: "task", row: null })}>+ เพิ่มงาน</button>}
        </div>
        {myTasks.length === 0 && <p className="text-sm text-muted">{isParent ? "เพิ่มงานเช่น แปรงฟัน เก็บของเล่น อ่านหนังสือ" : "ยังไม่มีงาน รอพ่อแม่ตั้งนะ"}</p>}
        {myTasks.map((t) => (
          <div key={t.id} className="flex items-center gap-3">
            <button className="flex flex-1 items-center gap-3 text-left" onClick={() => isParent && setEdit({ type: "task", row: t })} disabled={!isParent}>
              <span className="flex size-10 items-center justify-center rounded-xl bg-sand text-xl">{t.emoji}</span>
              <span className="flex flex-col">
                <span className="font-semibold">{t.title}</span>
                <span className="text-xs text-muted">+{t.stars} ดาว{t.kid ? ` · ของ${people.get(t.kid).name}` : ""}{isParent ? " · ✏️ แตะเพื่อแก้/ลบ" : ""}</span>
              </span>
            </button>
            <button className="btn-soft min-w-24 px-3 text-sm" disabled={busy === t.title} onClick={() => earn(t)}>{isParent ? "ให้ดาว" : "ทำแล้ว!"}</button>
          </div>
        ))}
      </section>

      <section className="card flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">ของรางวัล</h2>
          {isParent && <button className="text-sm text-muted underline" onClick={() => setEdit({ type: "reward", row: null })}>+ เพิ่มรางวัล</button>}
        </div>
        {rewards.rows.length === 0 && <p className="text-sm text-muted">{isParent ? "เพิ่มรางวัลเช่น ไอศกรีม 1 ถ้วย, ดูการ์ตูน 30 นาที" : "ยังไม่มีรางวัล"}</p>}
        {rewards.rows.map((r) => {
          const pct = Math.min(100, Math.round((Math.max(balance, 0) / r.cost) * 100));
          return (
            <div key={r.id} className="flex items-center gap-3">
              <button className="flex flex-1 items-center gap-3 text-left" onClick={() => isParent && setEdit({ type: "reward", row: r })} disabled={!isParent}>
                <span className="flex size-10 items-center justify-center rounded-xl bg-lavender text-xl">{r.emoji}</span>
                <span className="flex flex-1 flex-col gap-1">
                  <span className="font-semibold">{r.title}</span>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sand"><span className="block h-1.5 rounded-full bg-[#F2C94C]" style={{ width: `${pct}%` }} /></span>
                    {r.cost} ดาว
                  </span>
                  {isParent && <span className="text-xs text-muted">✏️ แตะเพื่อแก้/ลบ</span>}
                </span>
              </button>
              <button className="btn-dark min-w-24 px-3 text-sm" disabled={balance < r.cost || busy === r.title} onClick={() => redeem(r)}>{isParent ? "แลกให้" : "ขอแลก"}</button>
            </div>
          );
        })}
      </section>

      <section className="card flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">สรุปดาว</h2>
          <div className="flex items-center gap-1 text-sm">
            <button aria-label="เดือนก่อน" className="size-9 rounded-full bg-sand" onClick={() => shift(-1)}>‹</button>
            <span className="min-w-20 text-center">{new Date(ym.y, ym.m, 15).toLocaleDateString("th-TH", { month: "short", year: "2-digit" })}</span>
            <button aria-label="เดือนถัดไป" className="size-9 rounded-full bg-sand" onClick={() => shift(1)}>›</button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-mint p-2"><p className="font-display text-2xl font-bold">+{earnedMonth}</p><p className="text-xs">ได้เดือนนี้</p></div>
          <div className="rounded-2xl bg-lavender p-2"><p className="font-display text-2xl font-bold">−{usedMonth}</p><p className="text-xs">แลกเดือนนี้</p></div>
          <div className="rounded-2xl bg-[#FBE9B8] p-2"><p className="font-display text-2xl font-bold">{balance}</p><p className="text-xs">คงเหลือตอนนี้</p></div>
        </div>
        <div className="flex h-20 items-end gap-2" aria-label="ดาวที่ได้ 6 เดือนล่าสุด">
          {months6.map((x) => (
            <button key={x.k} onClick={() => setYm({ y: x.y, m: x.m })} className="flex flex-1 flex-col items-center justify-end gap-1 self-stretch">
              <span className="text-[10px] text-muted">{x.v || ""}</span>
              <span className={`w-full rounded-t-md ${x.k === key ? "bg-[#F2C94C]" : "bg-[#F6E3A6]"}`} style={{ height: `${Math.max(4, (x.v / maxM) * 52)}px` }} />
              <span className={`text-[11px] ${x.k === key ? "font-semibold" : "text-muted"}`}>{x.label}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-semibold">แลกอะไรไปบ้างเดือนนี้</p>
          {redeemedMonth.length === 0 ? <p className="text-muted">ยังไม่ได้แลก</p> : redeemedMonth.map((l) => (
            <p key={l.id} className="flex justify-between"><span>{l.emoji} {l.title}{l.status === "pending" ? " (รออนุมัติ)" : ""} · {thaiDate(l.created_at, { day: "numeric", month: "short" })}</span><span className="text-rose">{l.stars}</span></p>
          ))}
        </div>
        <p className="border-t border-dashed border-line pt-2 text-xs text-muted">ตั้งแต่เริ่ม ได้ทั้งหมด {earnedAll} ดาว · แลกไป {usedAll} ดาว · เหลือ {balance} ดาว</p>
      </section>

      <section className="card flex flex-col gap-1.5">
        <h2 className="font-display text-lg font-semibold">ประวัติดาว</h2>
        {isParent && myLogs.length > 0 && <p className="text-xs text-muted">แตะรายการเพื่อลบ (เช่น กดผิดหรือทดสอบ)</p>}
        {myLogs.length === 0 && <p className="text-sm text-muted">ยังไม่มี</p>}
        {myLogs.slice(0, 60).map((l) => (
          <div key={l.id} className="flex flex-col">
          <button disabled={!isParent} onClick={() => setDelId(delId === l.id ? null : l.id)} className={`flex min-h-8 items-center gap-2 text-left text-sm ${l.status === "rejected" ? "opacity-50" : ""}`}>
            <span>{l.emoji}</span>
            <span className="flex-1">{l.kind === "redeem" ? `แลก ${l.title}` : l.title}<span className="text-xs text-muted"> · {thaiDate(l.created_at, { day: "numeric", month: "short" })} {thaiTime(l.created_at)}{l.status === "pending" ? " · รออนุมัติ" : l.status === "rejected" ? " · ไม่ได้อนุมัติ" : ""}</span></span>
            <span className={`font-semibold ${l.stars > 0 ? "text-[#3F8F63]" : "text-rose"}`}>{l.stars > 0 ? `+${l.stars}` : l.stars}</span>
          </button>
          {delId === l.id && (
            <div className="mb-1 flex items-center justify-end gap-2 rounded-xl bg-sand px-2 py-1.5 text-xs">
              <span className="flex-1">ลบแล้วดาวจะ{l.stars > 0 ? "ลด" : "คืน"} {Math.abs(l.stars)} ดวง</span>
              <button className="min-h-9 rounded-full bg-white px-3" onClick={() => setDelId(null)}>ไม่ลบ</button>
              <button className="min-h-9 rounded-full bg-cocoa px-3 font-semibold text-cream" disabled={busy === l.id} onClick={() => removeLog(l.id)}>ลบ</button>
            </div>
          )}
          </div>
        ))}
        {isParent && myLogs.length > 0 && me && (clearAsk ? (
          <div className="mt-2 flex flex-col gap-2 rounded-2xl bg-[#FBDCE4] p-3 text-sm">
            <p>ล้างประวัติทั้งหมดของ{me.name}? ดาวจะกลับเป็น 0 และย้อนคืนไม่ได้</p>
            <div className="flex gap-2">
              <button className="btn-soft flex-1" onClick={() => setClearAsk(false)}>ไม่ล้าง</button>
              <button className="btn-dark flex-1" disabled={busy === "clear"} onClick={clearAll}>ล้างเลย</button>
            </div>
          </div>
        ) : (
          <button className="mt-1 min-h-11 text-sm text-rose underline" onClick={() => setClearAsk(true)}>ล้างประวัติทั้งหมด (เริ่มใหม่ 0 ดาว)</button>
        ))}
      </section>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.type === "reward" ? (edit.row ? "แก้รางวัล" : "เพิ่มรางวัล") : edit?.row ? "แก้งาน" : "เพิ่มงาน"}>
        {edit && <ItemForm key={edit.row?.id ?? edit.type} type={edit.type} row={edit.row} householdId={hid} kids={kids.map((k) => ({ key: k.key, name: k.name }))} onDone={() => setEdit(null)} />}
      </Sheet>
    </div>
  );
}

const TASK_EMOJI = ["🪥", "🧸", "📚", "🛏️", "🥦", "🧹", "🎒", "🚿", "🍽️", "🌱", "🙏", "⭐"];
const REWARD_EMOJI = ["🍦", "📺", "🧸", "🎮", "🍫", "🎡", "🎨", "🍕", "📖", "🛝", "🎁", "💰"];

function ItemForm({ type, row, householdId, kids, onDone }: { type: "task" | "reward"; row: StarTask | StarReward | null; householdId: string; kids: { key: string; name: string }[]; onDone: () => void }) {
  const task = type === "task";
  const [title, setTitle] = useState(row?.title ?? "");
  const [n, setN] = useState(row ? (task ? (row as StarTask).stars : (row as StarReward).cost) : task ? 1 : 10);
  const [emoji, setEmoji] = useState(row?.emoji ?? (task ? "🪥" : "🍦"));
  const [kid, setKid] = useState<string | null>(task ? (row as StarTask | null)?.kid ?? null : null);
  const [msg, setMsg] = useState<string | null>(null);
  const table = task ? "star_tasks" : "star_rewards";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setMsg("ใส่ชื่อก่อนนะ");
    const body = task ? { title: title.trim(), stars: n, emoji, kid } : { title: title.trim(), cost: n, emoji };
    const { error } = row ? await supabase().from(table).update(body).eq("id", row.id) : await supabase().from(table).insert({ household_id: householdId, ...body });
    if (error) return setMsg("บันทึกไม่ได้ ลองใหม่อีกครั้ง");
    onDone();
  }
  async function remove() {
    if (!row) return;
    await supabase().from(table).update({ active: false }).eq("id", row.id);
    onDone();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium">
        {task ? "ทำอะไร" : "รางวัลคืออะไร"}
        <input className="field" maxLength={60} value={title} placeholder={task ? "เช่น แปรงฟันก่อนนอน" : "เช่น ไอศกรีม 1 ถ้วย"} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-1.5">
        {(task ? TASK_EMOJI : REWARD_EMOJI).map((x) => (
          <button type="button" key={x} aria-pressed={emoji === x} onClick={() => setEmoji(x)} className={`size-11 rounded-xl text-xl ${emoji === x ? "bg-peach ring-2 ring-cocoa" : "bg-sand"}`}>{x}</button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{task ? "ได้กี่ดาว" : "ใช้กี่ดาว"}</span>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="ลด" className="size-11 rounded-full bg-sand text-xl" onClick={() => setN(Math.max(1, n - (task ? 1 : 5)))}>−</button>
          <span className="w-16 text-center font-display text-2xl font-bold">{n} ⭐</span>
          <button type="button" aria-label="เพิ่ม" className="size-11 rounded-full bg-sand text-xl" onClick={() => setN(Math.min(task ? 100 : 1000, n + (task ? 1 : 5)))}>+</button>
        </div>
      </div>
      {task && kids.length > 1 && (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">ของใคร</legend>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className="chip" aria-pressed={kid === null} onClick={() => setKid(null)}>ลูกทุกคน</button>
            {kids.map((k) => <button type="button" key={k.key} className="chip" aria-pressed={kid === k.key} onClick={() => setKid(k.key)}>{k.name}</button>)}
          </div>
        </fieldset>
      )}
      {msg && <p role="alert" className="text-sm text-rose">{msg}</p>}
      <button className="btn-dark">บันทึก</button>
      {row && <button type="button" className="min-h-11 text-sm text-rose underline" onClick={remove}>ลบ{task ? "งาน" : "รางวัล"}นี้</button>}
    </form>
  );
}
