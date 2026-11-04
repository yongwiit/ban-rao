"use client";

import type { TabKey } from "@/lib/menus";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { clearJoinCode, pendingJoinCode } from "@/lib/invite";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { GOOGLE_LOGIN } from "@/lib/config";
import { DEFAULT_PEOPLE, makePeople, person, type MascotKind, type People, type MemberRole, isParentRole } from "@/lib/family";
import { Bear, Bunny, Chick, Family, Mascot } from "./Mascots";
import { Credit } from "./Credit";
import { PresenceProvider } from "./Presence";

export type HouseholdRow = {
  id: string;
  name: string;
  join_code: string;
  monthly_budget: number;
  budget_enabled: boolean;
  hidden_tabs: string[];
  hidden_categories: string[];
};

type Ctx = {
  userId: string;
  role: MemberRole;
  isParent: boolean;
  household: HouseholdRow;
  partnerJoined: boolean;
  people: People;
  reloadPeople: () => Promise<void>;
  reloadHousehold: () => Promise<void>;
  /** เมนูนี้เปิดใช้อยู่ไหม */
  shows: (tab: TabKey) => boolean;
  tourDone: boolean;
  finishTour: () => void;
  signOut: () => Promise<void>;
};

const HouseholdContext = createContext<Ctx | null>(null);

export function useHousehold(): Ctx {
  const ctx = useContext(HouseholdContext);
  if (!ctx) throw new Error("useHousehold ต้องอยู่ใน HouseholdProvider");
  return ctx;
}

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [member, setMember] = useState<{ role: MemberRole; household: HouseholdRow; partnerJoined: boolean; tourDone: boolean } | null | undefined>(undefined);
  const [people, setPeople] = useState<People>(() => makePeople(DEFAULT_PEOPLE));

  const loadPeople = useCallback(async (hid: string) => {
    const { data } = await supabase().from("household_people").select("key, name, mascot, color, sort, promptpay").eq("household_id", hid).order("sort").order("key");
    if (data?.length) setPeople(makePeople(data.map((r) => ({ ...person(r.key, r.name, r.mascot as MascotKind, r.color), promptpay: r.promptpay }))));
  }, []);

  useEffect(() => {
    supabase().auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase().auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const loadMember = useCallback(async () => {
    if (!session) return;
    const db = supabase();
    const { data: me } = await db.from("members").select("role, household_id, tour_done").eq("user_id", session.user.id).maybeSingle();
    if (!me) {
      setMember(null);
      return;
    }
    const [{ data: hh }, { count }] = await Promise.all([
      db.from("households").select("id, name, join_code, monthly_budget, budget_enabled, hidden_tabs, hidden_categories").eq("id", me.household_id).single(),
      db.from("members").select("user_id", { count: "exact", head: true }).eq("household_id", me.household_id).in("role", ["dad", "mom"]),
      loadPeople(me.household_id),
    ]);
    if (hh) {
      setMember({
        role: me.role as MemberRole,
        household: { ...hh, monthly_budget: Number(hh.monthly_budget), hidden_tabs: hh.hidden_tabs ?? [], hidden_categories: hh.hidden_categories ?? [] },
        partnerJoined: (count ?? 0) >= 2,
        tourDone: !!me.tour_done,
      });
    }
  }, [session, loadPeople]);

  const hid = member?.household.id;
  useEffect(() => {
    if (!hid) return;
    const ch = supabase().channel(`people-${hid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "household_people", filter: `household_id=eq.${hid}` }, () => loadPeople(hid))
      .subscribe();
    return () => { supabase().removeChannel(ch); };
  }, [hid, loadPeople]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (session) loadMember();
  }, [session, loadMember]);

  if (session === undefined || (session && member === undefined)) {
    return <Splash />;
  }
  if (!session) return <Login />;
  if (!member) return <Setup onDone={loadMember} />;

  return (
    <HouseholdContext.Provider
      value={{
        userId: session.user.id,
        role: member.role,
        isParent: isParentRole(member.role),
        household: member.household,
        partnerJoined: member.partnerJoined,
        people,
        reloadPeople: () => loadPeople(member.household.id),
        reloadHousehold: loadMember,
        shows: (tab) => !member.household.hidden_tabs.includes(tab),
        tourDone: member.tourDone,
        finishTour: () => {
          setMember((m) => (m ? { ...m, tourDone: true } : m));
          try { localStorage.setItem(`tour-done-${session.user.id}`, "1"); } catch {}
          supabase().rpc("mark_tour_done").then(() => {});
        },
        signOut: async () => {
          await supabase().auth.signOut();
          setMember(undefined);
        },
      }}
    >
      <PresenceProvider userId={session.user.id} role={member.role} householdId={member.household.id}>{children}</PresenceProvider>
    </HouseholdContext.Provider>
  );
}

function Splash() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3">
      <Family size={56} />
      <p className="text-muted">กำลังเปิดบ้าน…</p>
    </main>
  );
}

function Login() {
  const [invited] = useState(() => pendingJoinCode());
  const [mode, setMode] = useState<"in" | "up">(invited ? "up" : "in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const auth = supabase().auth;
    const { error, data } =
      mode === "in"
        ? await auth.signInWithPassword({ email, password })
        : await auth.signUp({ email, password });
    if (!error && mode === "up" && !data.session) {
      // บัญชีถูกยืนยันอัตโนมัติด้วย trigger ในฐานข้อมูล จึงเข้าสู่ระบบต่อได้ทันที
      const again = await auth.signInWithPassword({ email, password });
      setBusy(false);
      if (again.error) setMsg("สมัครแล้ว กดลิงก์ยืนยันในอีเมลก่อน แล้วกลับมาเข้าสู่ระบบ");
      return;
    }
    setBusy(false);
    if (error) setMsg(error.message);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <Family size={64} happy />
        <h1 className="font-display text-3xl font-bold">บ้านเรา</h1>
        <p className="text-muted">ปฏิทิน ซื้อของ และเงินของบ้าน ในที่เดียว</p>
        {invited && <p className="rounded-2xl bg-lavender px-4 py-2 text-sm">คุณได้รับเชิญเข้าบ้าน 💌 สมัครด้วยอีเมลก่อน แล้วระบบจะใส่รหัสบ้านให้</p>}
      </div>
      <form onSubmit={submit} className="card flex flex-col gap-3">
        {GOOGLE_LOGIN && (
          <>
            <button
              type="button"
              className="flex min-h-12 items-center justify-center gap-2 rounded-full border-[1.5px] border-line bg-white font-semibold"
              onClick={async () => {
                const { error } = await supabase().auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
                if (error) setMsg("ยังเข้าด้วย Google ไม่ได้ ลองใช้อีเมลก่อนนะ");
              }}
            >
              <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
              เข้าด้วย Google
            </button>
            <p className="flex items-center gap-2 text-xs text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">หรือใช้อีเมล</p>
          </>
        )}
        <label className="flex flex-col gap-1 text-sm font-medium">
          อีเมล
          <input className="field" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          รหัสผ่าน
          <input className="field" type="password" required minLength={6} autoComplete={mode === "in" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {msg && <p role="alert" className="text-sm text-rose">{msg}</p>}
        <button className="btn-dark mt-1" disabled={busy}>{mode === "in" ? "เข้าสู่ระบบ" : "สมัครใช้งาน"}</button>
        <button type="button" className="min-h-11 text-sm text-muted underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "ยังไม่มีบัญชี? สมัครใช้งาน" : "มีบัญชีแล้ว? เข้าสู่ระบบ"}
        </button>
      </form>
      <Credit />
    </main>
  );
}

type KidOpt = { key: string; name: string; mascot: MascotKind; taken: boolean };

function Setup({ onDone }: { onDone: () => Promise<void> }) {
  const [who, setWho] = useState<"dad" | "mom" | "kid">("dad");
  const [code, setCode] = useState(() => pendingJoinCode());
  const [kids, setKids] = useState<KidOpt[] | null>(null);
  const [kid, setKid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(fn: "create_household" | "join_household", role: string) {
    setBusy(true);
    setMsg(null);
    const args = fn === "create_household" ? { p_role: role } : { p_code: code, p_role: role };
    const { error } = await supabase().rpc(fn, args);
    setBusy(false);
    if (error) setMsg(error.message.includes("duplicate") ? "คนนี้มีบัญชีในบ้านนี้แล้ว เลือกคนอื่น" : error.message);
    else { clearJoinCode(); await onDone(); }
  }

  async function findKids() {
    setBusy(true);
    setMsg(null);
    const { data } = await supabase().rpc("household_kids", { p_code: code });
    setBusy(false);
    if (!data?.length) return setMsg("ไม่พบบ้านนี้ หรือบ้านนี้ยังไม่ได้เพิ่มลูก ให้พ่อแม่เพิ่มที่ตั้งค่า > คนในบ้าน ก่อนนะ");
    setKids(data as KidOpt[]);
  }

  const opts: { k: "dad" | "mom" | "kid"; label: string; face: React.ReactNode }[] = [
    { k: "dad", label: "คุณพ่อ", face: <Bear size={52} /> },
    { k: "mom", label: "คุณแม่", face: <Bunny size={52} /> },
    { k: "kid", label: "ลูก", face: <Chick size={52} /> },
  ];

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-5">
      <h1 className="font-display text-2xl font-bold">ตั้งค่าบ้าน</h1>
      <section className="card flex flex-col gap-3">
        <p className="font-medium">คุณคือใคร</p>
        <div className="grid grid-cols-3 gap-2">
          {opts.map((o) => (
            <button key={o.k} aria-pressed={who === o.k} onClick={() => { setWho(o.k); setMsg(null); }}
              className={`flex flex-col items-center gap-1 rounded-3xl p-2.5 ${who === o.k ? "bg-peach ring-2 ring-cocoa" : "bg-sand"}`}>
              {o.face}<span className="font-semibold">{o.label}</span>
            </button>
          ))}
        </div>
      </section>
      {who !== "kid" ? (
        <>
          <section className="card flex flex-col gap-3">
            <p className="font-medium">คนแรกของบ้าน</p>
            <button className="btn-dark" disabled={busy} onClick={() => run("create_household", who)}>สร้างบ้านใหม่</button>
          </section>
          <section className="card flex flex-col gap-3">
            <p className="font-medium">มีรหัสบ้านจากอีกคนแล้ว</p>
            <label className="sr-only" htmlFor="code">รหัสบ้าน</label>
            <input id="code" className="field tracking-[0.3em] uppercase" placeholder="รหัส 6 ตัว" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn-soft" disabled={busy || code.trim().length < 6} onClick={() => run("join_household", who)}>เข้าร่วมบ้าน</button>
          </section>
        </>
      ) : (
        <section className="card flex flex-col gap-3">
          <p className="font-medium">ขอรหัสบ้านจากพ่อแม่</p>
          <label className="sr-only" htmlFor="kcode">รหัสบ้าน</label>
          <input id="kcode" className="field tracking-[0.3em] uppercase" placeholder="รหัส 6 ตัว" value={code} onChange={(e) => { setCode(e.target.value); setKids(null); }} />
          {!kids && <button className="btn-soft" disabled={busy || code.trim().length < 6} onClick={findKids}>ต่อไป</button>}
          {kids && (
            <>
              <p className="text-sm text-muted">หนูคือใคร</p>
              <div className="grid grid-cols-3 gap-2">
                {kids.map((k) => (
                  <button key={k.key} disabled={k.taken} aria-pressed={kid === k.key} onClick={() => setKid(k.key)}
                    className={`flex flex-col items-center gap-1 rounded-3xl p-2.5 text-sm disabled:opacity-40 ${kid === k.key ? "bg-peach ring-2 ring-cocoa" : "bg-sand"}`}>
                    <Mascot kind={k.mascot} size={44} /><span className="font-semibold">{k.name}</span>{k.taken && <span className="text-xs">มีบัญชีแล้ว</span>}
                  </button>
                ))}
              </div>
              <button className="btn-dark" disabled={busy || !kid} onClick={() => kid && run("join_household", kid)}>เข้าบ้าน</button>
            </>
          )}
        </section>
      )}
      {msg && <p role="alert" className="text-center text-sm text-rose">{msg}</p>}
    </main>
  );
}
