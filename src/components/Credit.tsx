/** เครดิตผู้ทำแอป แสดงที่หน้าเข้าสู่ระบบและหน้าตั้งค่า */
export function Credit({ className = "" }: { className?: string }) {
  return (
    <p className={`text-center text-xs text-muted ${className}`}>
      ใช้ฟรี 💛 สร้างด้วยรักโดย <span className="font-semibold">Aumm K. · Daddy&apos;s Pearl</span>
    </p>
  );
}
