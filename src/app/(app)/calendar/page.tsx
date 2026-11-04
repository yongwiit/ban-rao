"use client";

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
import { eventDays, eventWhen, isMultiDay, overlapFilter } from "@/lib/events";
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
    for (const e of events.rows) for (const d of eventDays(e)) (map[d] ??= []).push(e);
    return map;
  }, [events.rows]);

  const firstDow = new Date(ym.y, ym.m, 1).getDay();
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const key = (d: number) => `${ym.y}-${String(ym.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
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
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((d, i) =>
            d === null ? <span key={`b${i}`} /> : (
              <button
                key={d}
                onClick={() => setSel(key(d))}
                aria-label={thaiDate(key(d), { day: "numeric", month: "long" })}
                aria-pressed={sel === key(d)}
                className={`flex h-12 flex-col items-center justify-center gap-1 rounded-2xl text-[15px] ${sel === key(d) ? "bg-peach font-semibold" : ""} ${today === key(d) && sel !== key(d) ? "ring-2 ring-[#E9A0B4] ring-inset" : ""}`}
              >
                {d}
                <span className="flex h-1.5 gap-0.5">
                  {(byDay[key(d)] ?? []).slice(0, 4).map((e) => <span key={e.id} className={`h-1.5 rounded-full ${isMultiDay(e) ? "w-3" : "w-1.5"}`} style={{ background: PEOPLE[e.who].color }} />)}
                </span>
              </button>
            ),
          )}
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
          <span className="text-sm text-muted">{eventWhen(e, day)} · {PEOPLE[e.who].name}{e.private ? " · เห็นคนเดียว" : ""}</span>
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
    const row = { title: title.trim(), starts_at, ends_at, all_day: isAllDay, who, note: note.trim() || null, private: priv };
    const { error } = editing
      ? await supabase().from("events").update(row).eq("id", editing.id)
      : await supabase().from("events").insert(row);
    setBusy(false);
    if (error) return setErr(error.message);
    setTitle(""); setNote(""); setPriv(false); setMulti(false); setErr(null);
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
          </>
        )}
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-medium">ของใคร</legend>
          <div className="flex flex-wrap gap-2">
            {WHO.map((w) => <button type="button" key={w} className="chip" aria-pressed={who === w} onClick={() => setWho(w)}>{PEOPLE[w].name}</button>)}
          </div>
        </fieldset>
        <label className="flex flex-col gap-1 text-sm font-medium">โน้ต<input className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ไม่ใส่ก็ได้" /></label>
        {mine && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-5 accent-cocoa" checked={priv} onChange={(e) => setPriv(e.target.checked)} /><LockIcon />เห็นคนเดียว (เช่น เซอร์ไพรส์ วันครบรอบ)</label>}
        {err && <p role="alert" className="text-sm text-rose">{err}</p>}
        <button className="btn-dark" disabled={busy}>{editing ? "บันทึกการแก้ไข" : "บันทึกนัด"}</button>
      </form>
    </Sheet>
  );
}
