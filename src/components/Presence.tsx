"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import type { MemberRole } from "@/lib/family";
import { Mascot } from "./Mascots";
import { useHousehold } from "./Household";
import { play } from "@/lib/sfx";

export type MemberInfo = { user_id: string; role: MemberRole; last_seen_at: string | null };
type Ctx = { members: MemberInfo[]; online: Set<string>; sendHeart: (to: string) => Promise<string | null> };
const PresenceContext = createContext<Ctx>({ members: [], online: new Set(), sendHeart: async () => null });
export const usePresence = () => useContext(PresenceContext);

/** ติดตามว่าใครในบ้านเปิดแอปอยู่ และรับหัวใจที่คนในบ้านส่งมา */
export function PresenceProvider({ userId, role, householdId, children }: { userId: string; role: MemberRole; householdId: string; children: ReactNode }) {
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [hearts, setHearts] = useState<{ id: string; from: string }[]>([]);

  const loadMembers = useCallback(async () => {
    const { data } = await supabase().from("members").select("user_id, role, last_seen_at").eq("household_id", householdId);
    setMembers((data ?? []) as MemberInfo[]);
  }, [householdId]);

  useEffect(() => {
    const db = supabase();
    const touch = () => { if (document.visibilityState === "visible") db.rpc("touch_presence").then(() => {}); };
    touch();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMembers();
    const timer = setInterval(touch, 60_000);

    const ch = db.channel(`presence-${householdId}`, { config: { presence: { key: userId } } });
    ch.on("presence", { event: "sync" }, () => setOnline(new Set(Object.keys(ch.presenceState()))))
      .on("presence", { event: "leave" }, () => loadMembers())
      .subscribe((status) => { if (status === "SUBSCRIBED" && document.visibilityState === "visible") ch.track({ role }); });
    const onVis = () => {
      if (document.visibilityState === "visible") { ch.track({ role }); touch(); loadMembers(); }
      else { ch.untrack(); touch(); }
    };
    document.addEventListener("visibilitychange", onVis);

    const hc = db.channel(`hearts-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "hearts", filter: `to_user=eq.${userId}` }, (p) => {
        const row = p.new as { id: string; from_user: string };
        play("receive");
        setHearts((h) => [...h, { id: row.id, from: row.from_user }]);
        setTimeout(() => setHearts((h) => h.filter((x) => x.id !== row.id)), 3200);
      })
      .subscribe();

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
      db.removeChannel(ch);
      db.removeChannel(hc);
    };
  }, [householdId, userId, role, loadMembers]);

  const sendHeart = useCallback(async (to: string) => {
    const { error } = await supabase().from("hearts").insert({ household_id: householdId, from_user: userId, to_user: to });
    return error ? "ส่งถี่ไปนิด รอสักครู่แล้วส่งใหม่นะ" : null;
  }, [householdId, userId]);

  const { people } = useHousehold();
  const fromName = (id: string) => { const m = members.find((x) => x.user_id === id); return m ? people.get(m.role).name : "คนในบ้าน"; };

  return (
    <PresenceContext.Provider value={{ members, online, sendHeart }}>
      {children}
      {hearts.map((h) => (
        <div key={h.id} role="status" className="pointer-events-none fixed inset-x-0 top-6 z-[60] flex justify-center">
          <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold shadow-lg">💗 {fromName(h.from)}ส่งหัวใจให้</span>
          {[-60, -20, 20, 60, 0].map((dx, i) => (
            <span key={i} className="float-heart" style={{ ["--dx" as string]: `${dx}px`, animationDelay: `${i * 0.18}s` }} aria-hidden>💗</span>
          ))}
        </div>
      ))}
    </PresenceContext.Provider>
  );
}

function ago(iso: string | null): string {
  if (!iso) return "ยังไม่เคยเปิดแอป";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 2) return "เพิ่งเปิดแอปเมื่อกี้";
  if (m < 60) return `เปิดแอปล่าสุด ${m} นาทีที่แล้ว`;
  const h = Math.round(m / 60);
  if (h < 24) return `เปิดแอปล่าสุด ${h} ชั่วโมงที่แล้ว`;
  const d = Math.round(h / 24);
  return d < 30 ? `เปิดแอปล่าสุด ${d} วันที่แล้ว` : "นานแล้วที่ไม่ได้เปิดแอป";
}

/** มาสคอตครอบครัวที่หน้าวันนี้: ใครออนไลน์จะเด้งและมีจุดเขียว แตะเพื่อดูสถานะหรือส่งหัวใจ */
export function FamilyPresence({ me, size = 44 }: { me: string; size?: number }) {
  const { members, online, sendHeart } = usePresence();
  const { people } = useHousehold();
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [noAcc, setNoAcc] = useState<string | null>(null);
  const { isParent } = useHousehold();
  const sel = members.find((m) => m.user_id === open);
  const lone = noAcc ? people.get(noAcc) : null;
  const shown = people.list.slice(0, 5);

  return (
    <div className="relative">
      <div className="flex items-end">
        {shown.map((p, i) => {
          const m = members.find((x) => x.role === p.key);
          const isOn = !!m && online.has(m.user_id) && m.user_id !== me;
          const face = <><Mascot kind={p.mascot} size={size} happy={isOn} />{isOn && <span className="absolute right-0.5 bottom-1 size-3 rounded-full border-2 border-white bg-[#4CC27A]" />}</>;
          return m ? (
            <button
              key={p.key}
              onClick={() => { setOpen(open === m.user_id ? null : m.user_id); setNoAcc(null); setMsg(null); }}
              aria-label={`${p.name}${m.user_id === me ? " (คุณ)" : isOn ? " ออนไลน์อยู่" : ""}`}
              className={`relative ${i ? "-ml-2" : ""} ${isOn ? "hop" : ""}`}
              style={isOn ? { animationDelay: `${i * 0.3}s` } : undefined}
            >{face}</button>
          ) : (
            <button key={p.key} onClick={() => { setNoAcc(noAcc === p.key ? null : p.key); setOpen(null); }} className={`relative ${i ? "-ml-2" : ""}`} aria-label={p.name}>{face}</button>
          );
        })}
      </div>
      {lone && (
        <div className="absolute top-full right-0 z-30 mt-2 w-60 rounded-2xl bg-white p-3 text-sm shadow-[0_8px_28px_rgba(74,59,54,.18)]">
          <p className="font-semibold">{lone.name}</p>
          <p className="mt-0.5 text-muted">{lone.kid ? `${lone.name}ยังไม่มีบัญชีในแอป${isParent ? " ถ้าลูกมีมือถือ ให้สมัครแล้วเลือก \"ลูก\" ใส่รหัสบ้านจากหน้าตั้งค่า" : ""}` : `${lone.name}ยังไม่ได้เข้าบ้าน ส่งลิงก์เชิญได้ที่หน้าตั้งค่า`}</p>
          {lone.kid && <a href="/stars" className="btn-soft mt-2 flex w-full items-center justify-center">⭐ ดูสมุดดาวของ{lone.name}</a>}
          {!lone.kid && <a href="/settings" className="btn-soft mt-2 flex w-full items-center justify-center">ไปหน้าเชิญ</a>}
        </div>
      )}
      {sel && (
        <div className="absolute top-full right-0 z-30 mt-2 w-60 rounded-2xl bg-white p-3 text-sm shadow-[0_8px_28px_rgba(74,59,54,.18)]">
          <p className="font-semibold">{people.get(sel.role).name}{sel.user_id === me && " (คุณ)"}</p>
          {sel.user_id === me ? (
            <p className="mt-0.5 text-muted">คนอื่นในบ้านจะเห็นตัวการ์ตูนของคุณเด้งตอนคุณเปิดแอปอยู่</p>
          ) : (
            <>
              <p className="mt-0.5 flex items-center gap-1.5 text-muted">
                {online.has(sel.user_id) ? <><span className="size-2 rounded-full bg-[#4CC27A]" />เปิดแอปอยู่ตอนนี้</> : ago(sel.last_seen_at)}
              </p>
              <button
                className="btn-soft mt-2 w-full"
                onClick={async () => {
                  play("heart");
                  const err = await sendHeart(sel.user_id);
                  setMsg(err ?? `ส่งหัวใจให้${people.get(sel.role).name}แล้ว 💗`);
                }}
              >ส่งหัวใจ 💗</button>
              {msg && <p role="status" className="mt-1.5 text-center text-xs text-muted">{msg}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
