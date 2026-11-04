"use client";

import { useState } from "react";
import { useHousehold } from "./Household";
import { usePresence } from "./Presence";
import { Mascot } from "./Mascots";
import { Sheet } from "./Sheet";
import { supabase } from "@/lib/supabase";
import { useLive } from "@/lib/useLive";
import { play } from "@/lib/sfx";
import { confetti } from "@/lib/confetti";
import { thaiDate, thaiTime } from "@/lib/format";

type Note = { id: string; from_user: string; to_user: string | null; body: string; emoji: string; created_at: string };
const QUICK = ["วันนี้สู้ๆ นะ 💪", "รักนะ 💗", "ขอบคุณที่ดูแลบ้านนะ 🏠", "คิดถึง 🥰", "เดินทางปลอดภัยนะ 🚗", "กินข้าวด้วยนะ 🍚"];
const EMOJI = ["💌", "💗", "🌷", "☀️", "🍀", "🧸"];

/** โน้ตรักบนหน้าวันนี้: เห็นโน้ตล่าสุด 3 วันที่ส่งถึงเรา และเขียนโน้ตถึงกันได้ */
export function LoveNotes() {
  const { household, userId, people } = useHousehold();
  const { members } = usePresence();
  const [since] = useState(() => new Date(Date.now() - 3 * 864e5).toISOString());
  const notes = useLive<Note>("love_notes", household.id, () =>
    supabase().from("love_notes").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(20));
  const [open, setOpen] = useState(false);
  const nameOf = (uid: string) => { const m = members.find((x) => x.user_id === uid); return m ? people.get(m.role) : null; };
  const forMe = notes.rows.filter((n) => n.from_user !== userId).slice(0, 2);
  const mineLatest = notes.rows.find((n) => n.from_user === userId);

  return (
    <>
      {forMe.map((n) => {
        const p = nameOf(n.from_user);
        return (
          <div key={n.id} className="flex items-center gap-3 rounded-[22px] bg-[#FBDCE4] px-4 py-3">
            {p ? <Mascot kind={p.mascot} size={40} happy /> : <span className="text-3xl">{n.emoji}</span>}
            <div className="flex flex-1 flex-col">
              <span className="text-xs text-muted">{n.emoji} โน้ตจาก{p?.name ?? "คนในบ้าน"} · {thaiDate(n.created_at, { day: "numeric", month: "short" })} {thaiTime(n.created_at)}</span>
              <span className="font-semibold">{n.body}</span>
            </div>
          </div>
        );
      })}
      <button onClick={() => setOpen(true)} className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-white/70 text-sm text-muted">
        💌 {mineLatest ? `ส่งโน้ตไปแล้ว "${mineLatest.body.slice(0, 18)}${mineLatest.body.length > 18 ? "…" : ""}" · เขียนใหม่` : "เขียนโน้ตถึงกัน"}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="เขียนโน้ตถึงกัน 💌">
        {open && <NoteForm onDone={() => setOpen(false)} />}
      </Sheet>
    </>
  );
}

function NoteForm({ onDone }: { onDone: () => void }) {
  const { userId, people } = useHousehold();
  const { members } = usePresence();
  const others = members.filter((m) => m.user_id !== userId);
  const [to, setTo] = useState<string | null>(others.length === 1 ? others[0].user_id : null);
  const [body, setBody] = useState("");
  const [emoji, setEmoji] = useState("💌");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return setMsg("เขียนอะไรสักนิดก่อนนะ");
    setBusy(true);
    const { error } = await supabase().from("love_notes").insert({ to_user: to, body: body.trim(), emoji });
    setBusy(false);
    if (error) return setMsg("ส่งไม่ได้ ลองใหม่อีกครั้ง");
    play("heart");
    confetti({ emoji, count: 16 });
    onDone();
  }

  return (
    <form onSubmit={send} className="flex flex-col gap-4">
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">ถึง</legend>
        <div className="flex flex-wrap gap-2">
          {others.length > 1 && <button type="button" className="chip" aria-pressed={to === null} onClick={() => setTo(null)}>ทุกคนในบ้าน</button>}
          {others.map((m) => <button type="button" key={m.user_id} className="chip" aria-pressed={to === m.user_id} onClick={() => setTo(m.user_id)}>{people.get(m.role).name}</button>)}
        </div>
        {others.length === 0 && <p className="text-sm text-muted">ยังไม่มีใครเข้าบ้านเลย ชวนอีกฝ่ายได้ที่หน้าตั้งค่า</p>}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        {QUICK.map((q) => <button type="button" key={q} className="chip" onClick={() => setBody(q)}>{q}</button>)}
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        ข้อความ
        <textarea className="field min-h-20 py-3" maxLength={120} value={body} onChange={(e) => setBody(e.target.value)} placeholder="เช่น เย็นนี้ทำกับข้าวรอนะ" />
      </label>
      <div className="flex gap-2">
        {EMOJI.map((x) => <button type="button" key={x} aria-pressed={emoji === x} onClick={() => setEmoji(x)} className={`size-11 rounded-2xl text-2xl ${emoji === x ? "bg-peach ring-2 ring-cocoa" : "bg-sand"}`}>{x}</button>)}
      </div>
      {msg && <p role="alert" className="text-sm text-rose">{msg}</p>}
      <button className="btn-dark" disabled={busy || others.length === 0}>ส่งโน้ต {emoji}</button>
      <p className="text-center text-xs text-muted">โน้ตแสดงบนหน้าวันนี้ของอีกฝ่าย 3 วัน และเด้งแจ้งเตือนถ้าเปิดไว้</p>
    </form>
  );
}
