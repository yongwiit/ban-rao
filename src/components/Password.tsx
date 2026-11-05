"use client";

import { useState } from "react";
import type { AuthError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { Bunny, Family } from "./Mascots";

const MIN = 6;

/** แปลงข้อความผิดพลาดของระบบล็อกอินเป็นภาษาไทยที่เข้าใจง่าย */
export function authErrorThai(e: AuthError | Error | null | undefined): string {
  if (!e) return "";
  const code = (e as AuthError).code ?? "";
  const m = e.message.toLowerCase();
  if (code === "same_password" || m.includes("different from the old")) return "รหัสใหม่ต้องไม่ซ้ำกับรหัสเดิมนะ";
  if (code === "weak_password" || m.includes("at least")) return `รหัสผ่านต้องยาวอย่างน้อย ${MIN} ตัว`;
  if (code === "invalid_credentials" || m.includes("invalid login")) return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
  if (code === "email_address_not_authorized" || m.includes("not authorized")) return "ตอนนี้ระบบยังส่งอีเมลไปที่อีเมลนี้ไม่ได้ ให้คุณพ่อช่วยดูให้ก่อนนะ";
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || m.includes("rate limit") || m.includes("security purposes")) return "ขอบ่อยไปนิด รอสักครู่แล้วลองใหม่นะ";
  if (code === "session_not_found" || code === "session_expired" || m.includes("auth session missing")) return "ลิงก์หมดอายุแล้ว ขอลิงก์ใหม่อีกครั้งนะ";
  if (m.includes("fetch") || m.includes("network")) return "เชื่อมต่อไม่ได้ ลองเช็กอินเทอร์เน็ตแล้วลองใหม่";
  return e.message;
}

/** ลิงก์ในอีเมลรีเซ็ตรหัสพาเข้าแอปมาพร้อม #...type=recovery */
export function isRecoveryLanding(): boolean {
  if (typeof window === "undefined") return false;
  return /(^|[#&])type=recovery(&|$)/.test(window.location.hash);
}

/** ลิงก์หมดอายุ/ใช้ไปแล้ว: Supabase ส่ง #error=...&error_code=otp_expired กลับมา */
export function recoveryLinkError(): string | null {
  if (typeof window === "undefined") return null;
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  if (!h.get("error") && !h.get("error_code")) return null;
  return h.get("error_code") === "otp_expired" ? "ลิงก์ในอีเมลหมดอายุหรือถูกใช้ไปแล้ว กด \"ลืมรหัสผ่าน?\" เพื่อขอลิงก์ใหม่นะ" : "ลิงก์ใช้ไม่ได้ ลองขอลิงก์ใหม่อีกครั้งนะ";
}

function PwField({ label, value, onChange, autoComplete, show }: { label: string; value: string; onChange: (v: string) => void; autoComplete: string; show: boolean }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      <input className="field" type={show ? "text" : "password"} required minLength={MIN} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function ShowToggle({ show, setShow }: { show: boolean; setShow: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center gap-2 self-start text-sm text-muted">
      <input type="checkbox" className="size-4 accent-[#4A3B36]" checked={show} onChange={(e) => setShow(e.target.checked)} />
      แสดงรหัสผ่าน
    </label>
  );
}

/** หน้า "ลืมรหัสผ่าน" (อยู่ในหน้าเข้าสู่ระบบ) ส่งลิงก์ตั้งรหัสใหม่ไปที่อีเมล */
export function ForgotPassword({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await supabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/` });
    setBusy(false);
    if (error) setMsg(authErrorThai(error));
    else setSent(true);
  }

  if (sent) {
    return (
      <div className="card flex flex-col items-center gap-3 text-center">
        <Bunny size={56} happy />
        <h2 className="font-display text-xl font-semibold">ส่งลิงก์ให้แล้ว 💌</h2>
        <p className="text-sm text-muted">เปิดอีเมล <b className="text-cocoa">{email.trim()}</b> แล้วกดลิงก์ &quot;ตั้งรหัสผ่านใหม่&quot;<br />ถ้าไม่เห็น ลองดูในกล่อง จดหมายขยะ / Spam นะ</p>
        <p className="text-xs text-muted">ลิงก์ใช้ได้ครั้งเดียว และหมดอายุใน 1 ชั่วโมง</p>
        <button type="button" className="btn-soft w-full" onClick={onBack}>กลับไปหน้าเข้าสู่ระบบ</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card flex flex-col gap-3">
      <div>
        <h2 className="font-display text-xl font-semibold">ลืมรหัสผ่าน? ไม่เป็นไรนะ 🐻</h2>
        <p className="text-sm text-muted">ใส่อีเมลที่ใช้สมัคร เดี๋ยวส่งลิงก์ให้ไปตั้งรหัสใหม่</p>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        อีเมล
        <input className="field" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      {msg && <p role="alert" className="text-sm text-rose">{msg}</p>}
      <button className="btn-dark mt-1" disabled={busy}>{busy ? "กำลังส่ง…" : "ส่งลิงก์ไปที่อีเมล"}</button>
      <button type="button" className="min-h-11 text-sm text-muted underline" onClick={onBack}>กลับไปหน้าเข้าสู่ระบบ</button>
    </form>
  );
}

/** หน้าตั้งรหัสผ่านใหม่ หลังกดลิงก์จากอีเมล (ตอนนี้เข้าสู่ระบบชั่วคราวแล้ว) */
export function NewPasswordScreen({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== pw2) return setMsg("รหัสสองช่องยังไม่ตรงกัน ลองพิมพ์ใหม่นะ");
    setBusy(true);
    setMsg(null);
    const { error } = await supabase().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) setMsg(authErrorThai(error));
    else setOk(true);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <Family size={64} happy={ok} />
        <h1 className="font-display text-3xl font-bold">{ok ? "เรียบร้อย!" : "ตั้งรหัสผ่านใหม่"}</h1>
        <p className="text-muted">{ok ? "ครั้งหน้าเข้าสู่ระบบด้วยรหัสใหม่นี้นะ" : "เลือกรหัสใหม่ที่จำง่ายสำหรับเรา แต่เดายากสำหรับคนอื่น"}</p>
      </div>
      {ok ? (
        <button className="btn-dark" onClick={() => { history.replaceState(null, "", "/"); onDone(); }}>เข้าบ้านกันเลย 🏡</button>
      ) : (
        <form onSubmit={submit} className="card flex flex-col gap-3">
          <PwField label="รหัสผ่านใหม่" value={pw} onChange={setPw} autoComplete="new-password" show={show} />
          <PwField label="พิมพ์รหัสใหม่อีกครั้ง" value={pw2} onChange={setPw2} autoComplete="new-password" show={show} />
          <ShowToggle show={show} setShow={setShow} />
          <p className="text-xs text-muted">อย่างน้อย {MIN} ตัว</p>
          {msg && <p role="alert" className="text-sm text-rose">{msg}</p>}
          <button className="btn-dark mt-1" disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึกรหัสใหม่"}</button>
        </form>
      )}
    </main>
  );
}

/** กล่อง "เปลี่ยนรหัสผ่าน" ในหน้าตั้งค่า ต้องใส่รหัสเดิมก่อน กันคนอื่นหยิบมือถือไปเปลี่ยน */
export function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function reset() { setCur(""); setPw(""); setPw2(""); setMsg(null); setShow(false); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== pw2) return setMsg("รหัสใหม่สองช่องยังไม่ตรงกัน ลองพิมพ์ใหม่นะ");
    if (pw === cur) return setMsg("รหัสใหม่ต้องไม่ซ้ำกับรหัสเดิมนะ");
    setBusy(true);
    setMsg(null);
    const auth = supabase().auth;
    const { data: { user } } = await auth.getUser();
    if (!user?.email) { setBusy(false); return setMsg("บัญชีนี้ไม่มีอีเมล จึงเปลี่ยนรหัสที่นี่ไม่ได้"); }
    // เช็กรหัสเดิมก่อน
    const check = await auth.signInWithPassword({ email: user.email, password: cur });
    if (check.error) { setBusy(false); return setMsg(check.error.code === "invalid_credentials" || /invalid login/i.test(check.error.message) ? "รหัสเดิมไม่ถูกต้อง ลองอีกครั้งนะ" : authErrorThai(check.error)); }
    const { error } = await auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setMsg(authErrorThai(error));
    reset();
    setOk(true);
    setOpen(false);
  }

  return (
    <section className="card flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">รหัสผ่าน 🔑</h2>
          <p className="text-sm text-muted">{ok ? "เปลี่ยนรหัสเรียบร้อยแล้ว ✨" : "เปลี่ยนรหัสที่ใช้เข้าสู่ระบบ"}</p>
        </div>
        {!open && <button className="chip shrink-0" onClick={() => { setOpen(true); setOk(false); }}>เปลี่ยนรหัส</button>}
      </div>
      {open && (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <PwField label="รหัสผ่านเดิม" value={cur} onChange={setCur} autoComplete="current-password" show={show} />
          <PwField label="รหัสผ่านใหม่" value={pw} onChange={setPw} autoComplete="new-password" show={show} />
          <PwField label="พิมพ์รหัสใหม่อีกครั้ง" value={pw2} onChange={setPw2} autoComplete="new-password" show={show} />
          <ShowToggle show={show} setShow={setShow} />
          {msg && <p role="alert" className="text-sm text-rose">{msg}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-soft" onClick={() => { reset(); setOpen(false); }}>ยกเลิก</button>
            <button className="btn-dark" disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
          </div>
          <p className="text-xs text-muted">จำรหัสเดิมไม่ได้? ออกจากระบบ แล้วกด &quot;ลืมรหัสผ่าน?&quot; ในหน้าเข้าสู่ระบบ</p>
        </form>
      )}
    </section>
  );
}
