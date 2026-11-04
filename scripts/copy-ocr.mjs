// คัดลอกไฟล์ OCR (Tesseract) ไปไว้ใน public/ocr ตอน build จะได้ไม่ต้องพึ่ง CDN
import { cpSync, mkdirSync } from "node:fs";
const out = "public/ocr";
mkdirSync(out, { recursive: true });
cpSync("node_modules/tesseract.js/dist/worker.min.js", `${out}/worker.min.js`);
for (const f of ["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"]) {
  cpSync(`node_modules/tesseract.js-core/${f}`, `${out}/${f}`);
}
cpSync("node_modules/@tesseract.js-data/tha/4.0.0_best_int/tha.traineddata.gz", `${out}/tha.traineddata.gz`);
cpSync("node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", `${out}/eng.traineddata.gz`);
console.log("OCR files copied to", out);
