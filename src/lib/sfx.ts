"use client";
// เสียงน่ารักสั้นๆ สร้างในเครื่องด้วย Web Audio (ไม่ต้องโหลดไฟล์) ปิดได้ในหน้าตั้งค่า
const KEY = "ban-rao-sound";
let ctx: AudioContext | null = null;

export function soundOn(): boolean {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
}
export function setSoundOn(on: boolean) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch {}
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", vol = 0.18) {
  const c = ctx!;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime + start);
  g.gain.setValueAtTime(0.0001, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(vol, c.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + dur + 0.05);
}

const SOUNDS = {
  /** ป๊อป-ปิ๊ง สองโน้ตขึ้น */
  heart: () => { tone(660, 0, 0.18, "triangle"); tone(990, 0.12, 0.28, "triangle"); },
  /** ระฆังดาว ไล่สามโน้ต */
  star: () => { tone(1046, 0, 0.2, "sine"); tone(1318, 0.09, 0.22, "sine"); tone(1568, 0.18, 0.4, "sine", 0.15); },
  /** ได้รับหัวใจ */
  receive: () => { tone(784, 0, 0.16, "triangle"); tone(1046, 0.1, 0.16, "triangle"); tone(1318, 0.2, 0.32, "triangle"); },
  /** เสร็จลิสต์ เย้ */
  tada: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.08, 0.3, "square", 0.06)); },
};

export function play(name: keyof typeof SOUNDS) {
  if (typeof window === "undefined" || !soundOn()) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
    SOUNDS[name]();
    navigator.vibrate?.(name === "heart" || name === "receive" ? [30, 40, 30] : 40);
  } catch {}
}
