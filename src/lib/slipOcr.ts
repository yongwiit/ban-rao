"use client";
// อ่านสลิปในเครื่อง (ฟรี) ด้วย Tesseract.js + อ่าน QR บนสลิปด้วย jsQR
import { parseSlipText, type SlipFields } from "./slipParse";

type Worker = { recognize: (img: string) => Promise<{ data: { text: string } }> };
let worker: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  worker ??= import("tesseract.js").then(({ createWorker }) => createWorker(["tha", "eng"], 1, { workerPath: "/ocr/worker.min.js", corePath: "/ocr", langPath: "/ocr" }) as unknown as Promise<Worker>);
  return worker;
}

/** เริ่มโหลดตัวอ่านล่วงหน้า (ครั้งแรกโหลดราว 5 MB แล้วเก็บไว้ในเครื่อง) */
export function warmUpOcr() {
  getWorker().catch(() => { worker = null; });
}

async function readQr(canvas: HTMLCanvasElement): Promise<string | null> {
  const { default: jsQR } = await import("jsqr");
  const ctx = canvas.getContext("2d")!;
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(data, width, height)?.data ?? null;
}

/** ทำภาพให้อ่านง่าย: ขาวดำ + ดึงความต่างสี (ช่วยภาพถ่ายใบเสร็จที่มืดหรือติดสีกระดาษ) */
function enhance(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  // ภาพเล็กไปให้ขยาย ตัวหนังสือจะคมขึ้น
  const k = Math.max(src.width, src.height) < 1200 ? 2 : 1;
  c.width = src.width * k; c.height = src.height * k;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    // ใช้ช่องสีที่สว่างที่สุด ทำให้กระดาษสีฟ้า/ชมพูกลายเป็นขาว
    const g = Math.max(d[i], d[i + 1], d[i + 2]) * 0.6 + (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * 0.4;
    d[i] = d[i + 1] = d[i + 2] = g;
    hist[g | 0]++;
  }
  const n = d.length / 4;
  let lo = 0, hi = 255, acc = 0;
  for (; lo < 255 && (acc += hist[lo]) < n * 0.02; lo++);
  acc = 0;
  for (; hi > 0 && (acc += hist[hi]) < n * 0.3; hi--);
  if (hi - lo > 20) {
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / (hi - lo)));
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export async function ocrSlip(canvas: HTMLCanvasElement): Promise<SlipFields & { text: string }> {
  const [w, qr] = await Promise.all([getWorker(), readQr(canvas).catch(() => null)]);
  const { data } = await w.recognize(enhance(canvas).toDataURL("image/png"));
  const fields = parseSlipText(data.text);
  // QR บนสลิปมีเลขอ้างอิงธุรกรรม ใช้กันบันทึกซ้ำได้แม้อ่านตัวหนังสือไม่ออก
  if (!fields.reference && qr) fields.reference = `qr:${qr.slice(0, 120)}`;
  return { ...fields, text: data.text };
}
