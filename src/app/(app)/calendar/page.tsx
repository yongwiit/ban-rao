"use client";

import Link from "next/link";

import { useMemo, useState } from "react";
import { useHousehold } from "@/components/Household";
import { Sheet } from "@/components/Sheet";
import { Bear } from "@/components/Mascots";
import { ChatIcon, ChevronIcon, EditIcon, LockIcon, PlusIcon, TrashIcon } from "@/components/Icons";
import { PEOPLE, type Who } from "@/lib/family";
import { dayKey, monthRange, thaiDate } from "@/lib/format";

/** HH:mm ตามเวลาไทย สำหรับช่อง input type=time */
function thaiTime24(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });
}
import { eventDays, eventDaysIn, eventWhen, isMultiDay, overlapFilter } from "@/lib/events";
import { REMIND_OPTIONS, REPEAT_LABEL, addDays, remindLabel, type Repeat } from "@/lib/recur";
import { supabase } from "@/lib/supabase";
import { useLive } from "@/lib/useLive";
import type { CommentRow, EventRow } from "@/lib/types";

const WEEK = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const WHO: Who[] = ["dad", "mom", "pearl", "all"];

export default function CalendarPage() {
  const { household, userId } = useHousehold();
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [sel, setSel] = useState(dayKey(now));
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EventRow | null>(null);
  const { start, end } = monthRange(ym.y, ym.m);

  const events = useLive<EventRow>("events", household.id, () =>
    supabase().from("events").select("*").lt("starts_at", end).or(overlapFilter(start)).order("starts_at"), [start]);

  const byDay = useMemo(() => {
    const map: Record<string, EventRow[]> = {};
    const last = addDays(dayKey(end), -1);
    for (const e of events.rows) for (const d of eventDaysIn(e, dayKey(start), last)) (map[d] ??= []).push(e);
    return map;
  }, [events.rows, start, end]);

  const firstDow = new Date(ym.y, ym.m, 1).getDay();
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const row = cells.slice(i, i + 7).map((d) => (d === null ? null : key(d)));
    while (row.length < 7) row.push(null);
    weeks.push(row);
  }
  function key(d: number) { return `${ym.y}-${String(ym.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`; }
  const today = dayKey(now);
  const selected = byDay[sel] ?? [];

  function shift(n: number) {
    const d = new Date(ym.y, ym.m + n, 1);
    setYm({ y: d.getFullYear(), m: d.getMonth() });
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button aria-label="เดือนก่อน" onClick={() => shift(-1)} className="flex size-11 items-center justify-center rounded-full bg-white"><ChevronIcon dir="left" /></button>
          <h1 className="px-1 font-display text-2xl font-bold">{thaiDate(new Date(ym.y, ym.m, 15), { month: "long", year: "numeric" })}</h1>
          <button aria-label="เดือนถัดไป" onClick={() => shift(1)} className="flex size-11 items-center justify-center rounded-full bg-white"><ChevronIcon /></button>
        </div>
        <button aria-label="เพิ่มนัด" onClick={() => setAdding(true)} className="flex size-11 items-center justify-center rounded-full bg-cocoa text-cream"><PlusIcon /></button>
      </header>

      <div className="flex flex-wrap gap-2">
        {WHO.map((w) => (
          <span key={w} className="flex items-center gap-1.5 rounded-xl bg-white px-2.5 py-1 text-sm">
            <span className="size-2.5 rounded-full" style={{ background: PEOPLE[w].color }} />{PEOPLE[w].name}
          </span>
        ))}
      </div>

      <section className="card p-3">
        <div className="grid grid-cols-7 pb-1 text-center text-xs text-muted">{WEEK.map((w) => <span key={w}>{w}</span>)}</div>
        <div className="flex flex-col gap-1">
          {weeks.map((wk, wi) => {
            const { segs, lanes, more } = layoutWeek(wk, byDay);
            const rows = Math.max(lanes, 1);
            return (
              <div key={wi} className="grid grid-cols-7" style={{ gridTemplateRows: `26px repeat(${rows}, 17px) ${more.some(Boolean) ? "12px" : "4px"}` }}>
                {wk.map((k, ci) => k === null ? <span key={`b${ci}`} style={{ gridColumn: ci + 1, gridRow: "1 / -1" }} /> : (
                  <button
                    key={k}
                    onClick={() => setSel(k)}
                    aria-label={thaiDate(k, { day: "numeric", month: "long" })}
                    aria-pressed={sel === k}
                    style={{ gridColumn: ci + 1, gridRow: "1 / -1" }}
                    className={`mx-px flex flex-col items-center rounded-xl pt-1 text-[15px] ${sel === k ? "bg-peach font-semibold" : ""} ${today === k && sel !== k ? "ring-2 ring-[#E9A0B4] ring-inset" : ""}`}
                  >
                    {Number(k.slice(8))}
                    {more[ci] > 0 && <span className="sr-only">มีนัด {(byDay[k] ?? []).length} รายการ</span>}
                  </button>
                ))}
                {segs.map((g) => (
                  <span
                    key={`${g.e.id}-${g.s}`}
                    aria-hidden
                    style={{ gridColumn: `${g.s + 1} / ${g.t + 2}`, gridRow: g.lane + 2, background: PEOPLE[g.e.who].soft, color: "#4A3B36", borderLeft: g.head ? `3px solid ${PEOPLE[g.e.who].color}` : undefined }}
                    className={`pointer-events-none z-10 mx-0.5 mb-px truncate px-1 text-[10px] leading-4 ${g.head ? "rounded-l-md" : "-ml-px rounded-l-none"} ${g.tail ? "rounded-r-md" : "-mr-px rounded-r-none"}`}
                  >
                    {g.e.title}
                  </span>
                ))}
                {more.map((n, ci) => n > 0 && (
                  <span key={`m${ci}`} aria-hidden style={{ gridColumn: ci + 1, gridRow: rows + 2 }} className="pointer-events-none z-10 text-center text-[9px] leading-3 text-muted">+{n}</span>
                ))}
              </div>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="font-display text-lg font-semibold">{sel === today ? "วันนี้ " : "วันที่ "}{thaiDate(sel, { day: "numeric", month: "short" })}</h2>
        {selected.length === 0 && (
          <div className="flex items-center gap-3 rounded-[20px] bg-white p-4 text-sm text-muted"><Bear size={36} />ว่าง ไม่มีนัด</div>
        )}
        {selected.map((e) => (
          <EventCard key={e.id} e={e} day={sel} mine={e.created_by === userId} open={openId === e.id} onToggle={() => setOpenId(openId === e.id ? null : e.id)} onEdit={() => setEditing(e)} householdId={household.id} />
        ))}
      </section>

      <Link href="/settings" className="text-center text-sm text-muted underline">เชื่อมกับ Google / Samsung Calendar อยู่ในหน้าตั้งค่า</Link>

      <AddEvent open={adding} onClose={() => setAdding(false)} day={sel} />
      {editing && <AddEvent key={editing.id} open onClose={() => setEditing(null)} day={sel} editing={editing} mine={editing.created_by === userId} />}
    </div>
  );
}

function EventCard({ e, day, mine, open, onToggle, onEdit, householdId }: { e: EventRow; day: string; mine: boolean; open: boolean; onToggle: () => void; onEdit: () => void; householdId: string }) {
  const comments = useLive<CommentRow>("event_comments", householdId, () =>
    supabase().from("event_comments").select("*").eq("event_id", e.id).order("created_at"), [e.id]);
  const [text, setText] = useState("");

  async function send() {
    if (!text.trim()) return;
    await supabase().from("event_comments").insert({ event_id: e.id, body: text.trim() });
    setText("");
  }
  async function remove() {
    if (confirm(`ลบนัด "${e.title}"?`)) await supabase().from("events").delete().eq("id", e.id);
  }

  return (
    <div className="card flex flex-col gap-2 px-4 py-3">
      <button onClick={onToggle} aria-expanded={open} className="flex items-center gap-3 text-left">
        <span className="w-1.5 self-stretch rounded-full" style={{ background: PEOPLE[e.who].color }} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5 font-semibold">{e.title}{e.private && <LockIcon className="text-muted" />}</span>
          <span className="text-sm text-muted">{eventWhen(e, day)} · {PEOPLE[e.who].name}{e.private ? " · เห็นคนเดียว" : ""}{e.remind_before != null ? ` · 🔔 ${remindLabel(e)}` : ""}</span>
        </span>
        {comments.rows.length > 0 && <span className="flex items-center gap-1 text-xs text-muted"><ChatIcon />{comments.rows.length}</span>}
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t border-dashed border-line pt-2">
          {e.note && <p className="text-sm">{e.note}</p>}
          {comments.rows.map((c) => <p key={c.id} className="rounded-2xl bg-sand px-3 py-2 text-sm">{c.body}</p>)}
          <div className="flex gap-2">
            <label className="sr-only" htmlFor={`c-${e.id}`}>คอมเมนต์</label>
            <input id={`c-${e.id}`} className="field min-h-11" placeholder="เช่น ใครไปรับ?" value={text} onChange={(ev) => setText(ev.target.value)} onKeyDown={(ev) => ev.key === "Enter" && send()} />
            <button className="btn-soft" onClick={send}>ส่ง</button>
          </div>
          <div className="flex justify-end gap-4">
            <button onClick={onEdit} className="flex min-h-11 items-center gap-1 text-sm"><EditIcon />แก้ไขนัด</button>
            {mine && <button onClick={remove} className="flex min-h-11 items-center gap-1 text-sm text-rose"><TrashIcon />ลบนัด</button>}
          </div>
        </div>
      )}
    </div>
  );
}

function AddEvent({ open, onClose, day, editing, mine = true }: { open: boolean; onClose: () => void; day: string; editing?: EventRow; mine?: boolean }) {
  const multiInit = editing ? isMultiDay(editing) : false;
  const [title, setTitle] = useState(editing?.title ?? "");
  const [date, setDate] = useState(editing ? dayKey(editing.starts_at) : day);
  const [time, setTime] = useState(editing && !editing.all_day ? thaiTime24(editing.starts_at) : "09:00");
  const [allDay, setAllDay] = useState(editing ? editing.all_day && !multiInit : false);
  const [multi, setMulti] = useState(multiInit);
  const [endDate, setEndDate] = useState(editing?.ends_at ? dayKey(editing.ends_at) : editing ? dayKey(editing.starts_at) : day);
  const [who, setWho] = useState<Who>(editing?.who ?? "all");
  const [note, setNote] = useState(editing?.note ?? "");
  const [priv, setPriv] = useState(editing?.private ?? false);
  const [repeat, setRepeat] = useState<Repeat>(editing?.repeat ?? "none");
  const [remind, setRemind] = useState<number | null>(editing ? editing.remind_before : 60);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastDay, setLastDay] = useState(day);
  if (!editing && day !== lastDay) { setLastDay(day); setDate(day); setEndDate(day); }

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    if (multi && endDate < date) return setErr("วันกลับต้องไม่ก่อนวันไป");
    setBusy(true);
    const isAllDay = allDay || multi;
    const starts_at = new Date(`${date}T${isAllDay ? "00:00" : time}:00+07:00`).toISOString();
    const ends_at = multi ? new Date(`${endDate}T23:59:00+07:00`).toISOString() : null;
    const opt = REMIND_OPTIONS.find((o) => o.value === remind);
    const remind_before = isAllDay && opt && !opt.allDay ? 0 : remind;
    const row = { title: title.trim(), starts_at, ends_at, all_day: isAllDay, who, note: note.trim() || null, private: priv, repeat: multi ? "none" : repeat, remind_before };
    const { error } = editing
      ? await supabase().from("events").update(row).eq("id", editing.id)
      : await supabase().from("events").insert(row);
    setBusy(false);
    if (error) return setErr(error.message);
    setTitle(""); setNote(""); setPriv(false); setMulti(false); setRepeat("none"); setErr(null);
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={editing ? "แก้ไขนัด" : "เพิ่มนัด"}>
      <form onSubmit={save} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">ชื่อนัด<input className="field" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น หมอฟันน้องเพิร์ล" /></label>
        <div className="flex gap-2">
          <button type="button" className="chip flex-1" aria-pressed={!multi} onClick={() => setMulti(false)}>วันเดียว</button>
          <button type="button" className="chip flex-1" aria-pressed={multi} onClick={() => { setMulti(true); if (endDate < date) setEndDate(date); }}>หลายวัน (เช่น ไปเที่ยว)</button>
        </div>
        {multi ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium">วันไป<input className="field" type="date" required value={date} onChange={(e) => { setDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); }} /></label>
            <label className="flex flex-col gap-1 text-sm font-medium">วันกลับ<input className="field" type="date" required min={date} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm font-medium">วันที่<input className="field" type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></label>
              <label className="flex flex-col gap-1 text-sm font-medium">เวลา<input className="field" type="time" disabled={allDay} value={time} onChange={(e) => setTime(e.target.value)} /></label>
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-5 accent-cocoa" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />ทั้งวัน</label>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-sm font-medium">ซ้ำ</legend>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(REPEAT_LABEL) as Repeat[]).map((r) => <button type="button" key={r} className="chip" aria-pressed={repeat === r} onClick={() => setRepeat(r)}>{REPEAT_LABEL[r]}</button>)}
              </div>
            </fieldset>
          </>
        )}
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-medium">ของใคร</legend>
          <div className="flex flex-wrap gap-2">
            {WHO.map((w) => <button type="button" key={w} className="chip" aria-pressed={who === w} onClick={() => setWho(w)}>{PEOPLE[w].name}</button>)}
          </div>
        </fieldset>
        <label className="flex flex-col gap-1 text-sm font-medium">แจ้งเตือน
          <select className="field" value={remind === null ? "off" : String(remind)} onChange={(e) => setRemind(e.target.value === "off" ? null : Number(e.target.value))}>
            {REMIND_OPTIONS.filter((o) => !(allDay || multi) || o.allDay).map((o) => (
              <option key={String(o.value)} value={o.value === null ? "off" : String(o.value)}>{allDay || multi ? o.allDay : o.label}</option>
            ))}
          </select>
          <span className="text-xs font-normal text-muted">{priv ? "นัดเห็นคนเดียว เตือนเฉพาะคุณ" : who === "dad" || who === "mom" ? `เตือนเฉพาะ${PEOPLE[who].name}` : "เตือนทุกคนในบ้าน"}</span>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">โน้ต<input className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ไม่ใส่ก็ได้" /></label>
        {mine && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-5 accent-cocoa" checked={priv} onChange={(e) => setPriv(e.target.checked)} /><LockIcon />เห็นคนเดียว (เช่น เซอร์ไพรส์ วันครบรอบ)</label>}
        {err && <p role="alert" className="text-sm text-rose">{err}</p>}
        <button className="btn-dark" disabled={busy}>{editing ? "บันทึกการแก้ไข" : "บันทึกนัด"}</button>
      </form>
    </Sheet>
  );
}

const MAX_LANES = 3;
type Seg = { e: EventRow; s: number; t: number; lane: number; head: boolean; tail: boolean };

/** วางแถบนัดในสัปดาห์: นัดหลายวันเป็นแถบยาวต่อกัน นัดวันเดียวเป็นแถบสั้นพร้อมชื่อ */
function layoutWeek(wk: (string | null)[], byDay: Record<string, EventRow[]>) {
  const runs: Omit<Seg, "lane">[] = [];
  const seen = new Set<string>();
  wk.forEach((k, ci) => {
    if (!k) return;
    for (const e of byDay[k] ?? []) {
      const id = `${e.id}@${ci}`;
      if (seen.has(id)) continue;
      let t = ci;
      const multi = isMultiDay(e) && (e.repeat ?? "none") === "none";
      if (multi) while (t + 1 < 7 && wk[t + 1] && (byDay[wk[t + 1]!] ?? []).some((x) => x.id === e.id)) t++;
      for (let c = ci; c <= t; c++) seen.add(`${e.id}@${c}`);
      const days = multi ? eventDays(e) : [k];
      runs.push({ e, s: ci, t, head: days[0] === k, tail: days[days.length - 1] === wk[t] });
    }
  });
  const multi = (r: Omit<Seg, "lane">) => (isMultiDay(r.e) && (r.e.repeat ?? "none") === "none" ? 1 : 0);
  runs.sort((a, b) => multi(b) - multi(a) || b.t - b.s - (a.t - a.s) || a.s - b.s || a.e.starts_at.localeCompare(b.e.starts_at));
  const used: boolean[][] = [];
  const segs: Seg[] = [];
  const more = Array(7).fill(0) as number[];
  for (const r of runs) {
    let lane = 0;
    while (lane < MAX_LANES && used[lane]?.slice(r.s, r.t + 1).some(Boolean)) lane++;
    if (lane >= MAX_LANES) { for (let c = r.s; c <= r.t; c++) more[c]++; continue; }
    used[lane] ??= Array(7).fill(false);
    for (let c = r.s; c <= r.t; c++) used[lane][c] = true;
    segs.push({ ...r, lane });
  }
  return { segs, lanes: used.length, more };
}
