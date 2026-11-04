"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { SUPABASE_URL, SUPABASE_ANON_KEY, VAPID_PUBLIC_KEY } from "@/lib/config";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";
type Prefs = { notify_new: boolean; notify_remind: boolean; notify_money: boolean; notify_daily: boolean };

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function currentSub(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

export function PushSetup() {
  const [state, setState] = useState<State>("loading");
  const [prefs, setPrefs] = useState<Prefs>({ notify_new: true, notify_remind: true, notify_money: true, notify_daily: true });
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return setState(ios && !standalone ? "ios-install" : "unsupported");
      }
      if (Notification.permission === "denied") return setState("denied");
      const sub = await currentSub();
      if (!sub) return setState("off");
      setEndpoint(sub.endpoint);
      const { data } = await supabase().from("push_subscriptions").select("notify_new, notify_remind, notify_money, notify_daily").eq("endpoint", sub.endpoint).maybeSingle();
      if (data) setPrefs(data as Prefs);
      setState(data ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setBusy(true); setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "denied" : "off"); return; }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC_KEY) }));
      const j = sub.toJSON();
      const { error } = await supabase().from("push_subscriptions").upsert({ endpoint: sub.endpoint, p256dh: j.keys!.p256dh, auth: j.keys!.auth, ...prefs }, { onConflict: "endpoint" });
      if (error) throw error;
      setEndpoint(sub.endpoint);
      setState("on");
      await test(sub.endpoint);
    } catch (e) {
      setMsg(`เปิดไม่สำเร็จ: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true);
    const sub = await currentSub();
    if (sub) {
      await supabase().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
    setEndpoint(null); setState("off"); setBusy(false);
  }

  async function toggle(k: keyof Prefs) {
    const next = { ...prefs, [k]: !prefs[k] };
    setPrefs(next);
    if (endpoint) await supabase().from("push_subscriptions").update(next).eq("endpoint", endpoint);
  }

  async function test(ep = endpoint) {
    if (!ep) return;
    setMsg("ส่งแจ้งเตือนทดสอบแล้ว รอสักครู่");
    await fetch(`${SUPABASE_URL}/functions/v1/push-notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ type: "test", endpoint: ep }),
    }).catch(() => setMsg("ส่งทดสอบไม่สำเร็จ ลองใหม่อีกครั้ง"));
  }

  return (
    <section className="card flex flex-col gap-2 text-sm">
      <h2 className="font-display text-[17px] font-semibold">แจ้งเตือน 🔔</h2>
      {state === "loading" && <p className="text-muted">กำลังเช็ก…</p>}
      {state === "ios-install" && (
        <div className="flex flex-col gap-1">
          <p>iPhone ต้องติดตั้งแอปไว้ที่หน้าจอก่อน ถึงจะรับแจ้งเตือนได้</p>
          <ol className="list-decimal pl-5 text-muted">
            <li>เปิดเว็บนี้ใน Safari</li>
            <li>กดปุ่มแชร์ (สี่เหลี่ยมมีลูกศรขึ้น) ด้านล่าง</li>
            <li>เลือก &quot;เพิ่มไปยังหน้าจอโฮม&quot;</li>
            <li>เปิดแอปบ้านเราจากไอคอนบนหน้าจอ แล้วกลับมาหน้านี้</li>
          </ol>
        </div>
      )}
      {state === "unsupported" && <p className="text-muted">เบราว์เซอร์นี้ยังรับแจ้งเตือนไม่ได้ ลองเปิดด้วย Chrome (Android) หรือ Safari ที่ติดตั้งไว้หน้าจอโฮม (iPhone)</p>}
      {state === "denied" && <p className="text-muted">เครื่องนี้ปิดแจ้งเตือนของบ้านเราไว้ ให้ไปที่ ตั้งค่าเครื่อง → แจ้งเตือน → บ้านเรา (หรือ Chrome) แล้วเปิดอนุญาต จากนั้นกลับมากดอีกครั้ง</p>}
      {state === "off" && (
        <>
          <p className="text-muted">รับแจ้งเตือนเมื่อมีนัดใหม่ แก้นัด และก่อนถึงนัด (ต้องเปิดแยกในแต่ละเครื่อง)</p>
          <button className="btn-dark" disabled={busy} onClick={enable}>{busy ? "กำลังเปิด…" : "เปิดแจ้งเตือนในเครื่องนี้"}</button>
        </>
      )}
      {state === "on" && (
        <>
          <p className="text-muted">เครื่องนี้รับแจ้งเตือนอยู่</p>
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="size-5 accent-cocoa" checked={prefs.notify_new} onChange={() => toggle("notify_new")} />เมื่อมีคนเพิ่มหรือแก้นัด</label>
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="size-5 accent-cocoa" checked={prefs.notify_remind} onChange={() => toggle("notify_remind")} />เตือนก่อนถึงนัด</label>
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="size-5 accent-cocoa" checked={prefs.notify_money} onChange={() => toggle("notify_money")} />เมื่ออีกฝ่ายจดรายจ่าย และเมื่อใช้งบถึง 80% / เกินงบ</label>
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="size-5 accent-cocoa" checked={prefs.notify_daily} onChange={() => toggle("notify_daily")} />2 ทุ่ม ชวนอัปสลิปของวันนี้</label>
          <p className="text-xs text-muted">นัดเห็นคนเดียว เตือนเฉพาะเจ้าของ · นัดของพ่อหรือแม่ เตือนเฉพาะคนนั้น · นัดของลูกหรือทั้งบ้าน เตือนทุกคน</p>
          <div className="flex gap-2">
            <button className="btn-soft flex-1" onClick={() => test()}>ทดสอบแจ้งเตือน</button>
            <button className="btn-soft flex-1" disabled={busy} onClick={disable}>ปิดในเครื่องนี้</button>
          </div>
        </>
      )}
      {msg && <p role="status" className="text-xs text-muted">{msg}</p>}
    </section>
  );
}
