"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { clearJoinCode, pendingJoinCode } from "@/lib/invite";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Role } from "@/lib/family";
import { PEOPLE } from "@/lib/family";
import { Bear, Bunny, Family } from "./Mascots";
import { Credit } from "./Credit";
import { PresenceProvider } from "./Presence";

export type HouseholdRow = {
  id: string;
  name: string;
  join_code: string;
  monthly_budget: number;
  budget_enabled: boolean;
};

type Ctx = {
  userId: string;
  role: Role;
  household: HouseholdRow;
  partnerJoined: boolean;
  reloadHousehold: () => Promise<void>;
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
  const [member, setMember] = useState<{ role: Role; household: HouseholdRow; partnerJoined: boolean } | null | undefined>(undefined);

  useEffect(() => {
    supabase().auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase().auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const loadMember = useCallback(async () => {
    if (!session) return;
    const db = supabase();
    const { data: me } = await db.from("members").select("role, household_id").eq("user_id", session.user.id).maybeSingle();
    if (!me) {
      setMember(null);
      return;
    }
    const [{ data: hh }, { count }] = await Promise.all([
      db.from("households").select("id, name, join_code, monthly_budget, budget_enabled").eq("id", me.household_id).single(),
      db.from("members").select("user_id", { count: "exact", head: true }).eq("household_id", me.household_id),
    ]);
    if (hh) {
      setMember({
        role: me.role as Role,
        household: { ...hh, monthly_budget: Number(hh.monthly_budget) },
        partnerJoined: (count ?? 0) >= 2,
      });
    }
  }, [session]);

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
        household: member.household,
        partnerJoined: member.partnerJoined,
        reloadHousehold: loadMember,
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

function Setup({ onDone }: { onDone: () => Promise<void> }) {
  const [role, setRole] = useState<Role>("dad");
  const [code, setCode] = useState(() => pendingJoinCode());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(fn: "create_household" | "join_household") {
    setBusy(true);
    setMsg(null);
    const args = fn === "create_household" ? { p_role: role } : { p_code: code, p_role: role };
    const { error } = await supabase().rpc(fn, args);
    setBusy(false);
    if (error) setMsg(error.message.includes("duplicate") ? `${PEOPLE[role].name} อยู่ในบ้านนี้แล้ว เลือกอีกคน` : error.message);
    else { clearJoinCode(); await onDone(); }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-5">
      <h1 className="font-display text-2xl font-bold">ตั้งค่าบ้าน</h1>
      <section className="card flex flex-col gap-3">
        <p className="font-medium">คุณคือใคร</p>
        <div className="grid grid-cols-2 gap-3">
          {(["dad", "mom"] as Role[]).map((r) => (
            <button
              key={r}
              aria-pressed={role === r}
              onClick={() => setRole(r)}
              className={`flex flex-col items-center gap-1 rounded-3xl p-3 ${role === r ? "bg-peach ring-2 ring-cocoa" : "bg-sand"}`}
            >
              {r === "dad" ? <Bear size={56} /> : <Bunny size={56} />}
              <span className="font-semibold">{PEOPLE[r].name}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="card flex flex-col gap-3">
        <p className="font-medium">คนแรกของบ้าน</p>
        <button className="btn-dark" disabled={busy} onClick={() => run("create_household")}>สร้างบ้านใหม่</button>
      </section>
      <section className="card flex flex-col gap-3">
        <p className="font-medium">มีรหัสบ้านจากอีกคนแล้ว</p>
        <label className="sr-only" htmlFor="code">รหัสบ้าน</label>
        <input id="code" className="field tracking-[0.3em] uppercase" placeholder="รหัส 6 ตัว" value={code} onChange={(e) => setCode(e.target.value)} />
        <button className="btn-soft" disabled={busy || code.trim().length < 6} onClick={() => run("join_household")}>เข้าร่วมบ้าน</button>
      </section>
      {msg && <p role="alert" className="text-center text-sm text-rose">{msg}</p>}
    </main>
  );
}
