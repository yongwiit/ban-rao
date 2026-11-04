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

/** ยอดดาว: ได้ดาวนับเมื่ออนุมัติ / แลกรางวัลหักทันทีแม้ยังรอ */
function balanceOf(logs: StarLog[], kid: string) {
  return logs.filter((l) => l.kid === kid && (l.status === "approved" || (l.kind === "redeem" && l.status === "pending"))).reduce((s, l) => s + l.stars, 0);
}

export default function StarsPage() {
  const { household, people, isParent, role, userId } = useHousehold();
  const hid = household.id;
  const kids = people.list.filter((p) => p.kid);
  const [picked, setPicked] = useState<string | null>(null);
  const kid = isParent ? (picked && kids.some((k) => k.key === picked) ? picked : kids[0]?.key) : role;
  const me = kid ? people.get(kid) : null;

  const tasks = useLive<StarTask>("star_tasks", hid, () => supabase().from("star_tasks").select("*").eq("active", true).order("created_at"));
  const rewards = useLive<StarReward>("star_rewards", hid, () => supabase().from("star_rewards").select("*").eq("active", true).order("cost"));
  const logs = useLive<StarLog>("star_log", hid, () => supabase().from("star_log").select("*").order("created_at", { ascending: false }).limit(300));

  const [edit, setEdit] = useState<{ type: "task" | "reward"; row: StarTask | StarReward | null } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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
      </header>

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
                <span className="text-xs text-muted">+{t.stars} ดาว{t.kid ? ` · ของ${people.get(t.kid).name}` : ""}</span>
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
                </span>
              </button>
              <button className="btn-dark min-w-24 px-3 text-sm" disabled={balance < r.cost || busy === r.title} onClick={() => redeem(r)}>{isParent ? "แลกให้" : "ขอแลก"}</button>
            </div>
          );
        })}
      </section>

      <section className="card flex flex-col gap-1.5">
        <h2 className="font-display text-lg font-semibold">ประวัติดาว</h2>
        {myLogs.length === 0 && <p className="text-sm text-muted">ยังไม่มี</p>}
        {myLogs.slice(0, 30).map((l) => (
          <div key={l.id} className={`flex items-center gap-2 text-sm ${l.status === "rejected" ? "opacity-50" : ""}`}>
            <span>{l.emoji}</span>
            <span className="flex-1">{l.kind === "redeem" ? `แลก ${l.title}` : l.title}<span className="text-xs text-muted"> · {thaiDate(l.created_at, { day: "numeric", month: "short" })} {thaiTime(l.created_at)}{l.status === "pending" ? " · รออนุมัติ" : l.status === "rejected" ? " · ไม่ได้อนุมัติ" : ""}</span></span>
            <span className={`font-semibold ${l.stars > 0 ? "text-[#3F8F63]" : "text-rose"}`}>{l.stars > 0 ? `+${l.stars}` : l.stars}</span>
          </div>
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
