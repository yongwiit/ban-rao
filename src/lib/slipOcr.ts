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

export async function ocrSlip(canvas: HTMLCanvasElement): Promise<SlipFields & { text: string }> {
  const [w, qr] = await Promise.all([getWorker(), readQr(canvas).catch(() => null)]);
  const { data } = await w.recognize(canvas.toDataURL("image/png"));
  const fields = parseSlipText(data.text);
  // QR บนสลิปมีเลขอ้างอิงธุรกรรม ใช้กันบันทึกซ้ำได้แม้อ่านตัวหนังสือไม่ออก
  if (!fields.reference && qr) fields.reference = `qr:${qr.slice(0, 120)}`;
  return { ...fields, text: data.text };
}
