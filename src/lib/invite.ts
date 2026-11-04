const KEY = "ban-rao-join";

/** รหัสบ้านจากลิงก์เชิญ (?join=XXXXXX) จำไว้จนกว่าจะเข้าร่วมเสร็จ */
export function pendingJoinCode(): string {
  if (typeof window === "undefined") return "";
  const fromUrl = new URLSearchParams(window.location.search).get("join")?.trim().toUpperCase() ?? "";
  try {
    if (fromUrl) localStorage.setItem(KEY, fromUrl);
    return fromUrl || localStorage.getItem(KEY) || "";
  } catch {
    return fromUrl;
  }
}

export function clearJoinCode() {
  try { localStorage.removeItem(KEY); } catch {}
  if (typeof window !== "undefined" && window.location.search.includes("join=")) {
    window.history.replaceState(null, "", window.location.pathname);
  }
}

export function inviteLink(code: string): string {
  return `${window.location.origin}/?join=${encodeURIComponent(code)}`;
}

export function inviteText(code: string): string {
  return `มาใช้แอป "บ้านเรา" ด้วยกันนะ 🏠\nกดลิงก์นี้ แล้วสมัครด้วยอีเมล ระบบจะพาเข้าบ้านให้เลย\n${inviteLink(code)}\n(รหัสบ้าน ${code})`;
}
