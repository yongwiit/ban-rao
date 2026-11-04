"use client";
// คอนเฟตตีเล็กๆ ไม่ต้องใช้ไลบรารี
const COLORS = ["#F2C94C", "#E9A0B4", "#8ECDB0", "#9BB8E8", "#F6A97A", "#C3A6E8"];

export function confetti(opts: { emoji?: string; count?: number } = {}) {
  if (typeof document === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const n = opts.count ?? 36;
  const box = document.createElement("div");
  box.setAttribute("aria-hidden", "true");
  box.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:70;overflow:hidden";
  for (let i = 0; i < n; i++) {
    const s = document.createElement("span");
    const useEmoji = opts.emoji && i % 3 === 0;
    s.textContent = useEmoji ? opts.emoji! : "";
    const size = useEmoji ? 22 : 6 + Math.random() * 6;
    s.className = "confetti-bit";
    s.style.cssText = `left:${Math.random() * 100}%;width:${useEmoji ? "auto" : size + "px"};height:${useEmoji ? "auto" : size * 1.6 + "px"};font-size:${size}px;background:${useEmoji ? "transparent" : COLORS[i % COLORS.length]};animation-delay:${Math.random() * 0.4}s;animation-duration:${1.8 + Math.random() * 1.2}s;--rot:${Math.random() * 720 - 360}deg;--drift:${Math.random() * 120 - 60}px`;
    box.appendChild(s);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 3600);
}
