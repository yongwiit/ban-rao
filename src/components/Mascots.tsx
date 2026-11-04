// มาสคอตประจำบ้าน: พ่ออั้ม (หมี), แม่แพ็ค (กระต่าย), น้องเพิร์ล (ลูกเจี๊ยบ)
type Props = { size?: number; happy?: boolean; label?: string };

function a11y(label?: string) {
  return label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
}

export function Bear({ size = 44, happy, label }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" {...a11y(label)}>
      <circle cx="12" cy="12" r="7" fill="#C9A27E" />
      <circle cx="36" cy="12" r="7" fill="#C9A27E" />
      <circle cx="24" cy="27" r="17" fill="#D9B48F" />
      <ellipse cx="24" cy="32" rx="7" ry="5" fill="#F3E1CC" />
      {happy ? (
        <path d="M16 25q2-3 4 0M28 25q2-3 4 0" stroke="#4A3B36" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      ) : (
        <>
          <circle cx="18" cy="25" r="2" fill="#4A3B36" />
          <circle cx="30" cy="25" r="2" fill="#4A3B36" />
        </>
      )}
      <ellipse cx="24" cy="30" rx="2.2" ry="1.6" fill="#4A3B36" />
      <circle cx="12" cy="31" r="2.5" fill="#F6A9A0" />
      <circle cx="36" cy="31" r="2.5" fill="#F6A9A0" />
    </svg>
  );
}

export function Bunny({ size = 44, happy, label }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" {...a11y(label)}>
      <ellipse cx="17" cy="11" rx="5" ry="11" fill="#FFFFFF" stroke="#E9D6D0" />
      <ellipse cx="31" cy="11" rx="5" ry="11" fill="#FFFFFF" stroke="#E9D6D0" />
      <ellipse cx="17" cy="12" rx="2.4" ry="7" fill="#F8C9CF" />
      <ellipse cx="31" cy="12" rx="2.4" ry="7" fill="#F8C9CF" />
      <circle cx="24" cy="30" r="15" fill="#FFFFFF" stroke="#E9D6D0" />
      {happy ? (
        <path d="M17 29q2-3 4 0M27 29q2-3 4 0" stroke="#4A3B36" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      ) : (
        <>
          <circle cx="19" cy="29" r="1.8" fill="#4A3B36" />
          <circle cx="29" cy="29" r="1.8" fill="#4A3B36" />
        </>
      )}
      <path d="M22 33q2 2 4 0" stroke="#4A3B36" fill="none" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="14" cy="34" r="2.5" fill="#F6A9A0" />
      <circle cx="34" cy="34" r="2.5" fill="#F6A9A0" />
    </svg>
  );
}

export function Chick({ size = 44, happy, label }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" {...a11y(label)}>
      <path d="M21 11q1-7 4-1q3-5 4 1z" fill="#F2C94C" />
      <circle cx="24" cy="27" r="17" fill="#FBE39A" />
      {happy ? (
        <path d="M16 25q2-3 4 0M28 25q2-3 4 0" stroke="#4A3B36" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      ) : (
        <>
          <circle cx="18" cy="25" r="2" fill="#4A3B36" />
          <circle cx="30" cy="25" r="2" fill="#4A3B36" />
        </>
      )}
      <path d="M21 30l3 3 3-3z" fill="#E8964F" />
      <circle cx="12" cy="31" r="2.5" fill="#F6A9A0" />
      <circle cx="36" cy="31" r="2.5" fill="#F6A9A0" />
    </svg>
  );
}

export function Family({ size = 44, happy }: { size?: number; happy?: boolean }) {
  return (
    <div className="flex" role="img" aria-label="พ่ออั้ม แม่แพ็ค และน้องเพิร์ล">
      <Bear size={size} happy={happy} />
      <span className="-ml-2"><Bunny size={size} happy={happy} /></span>
      <span className="-ml-2"><Chick size={size} happy={happy} /></span>
    </div>
  );
}

export function MascotFor({ who, size = 36 }: { who: "dad" | "mom" | "pearl" | "all"; size?: number }) {
  if (who === "dad") return <Bear size={size} />;
  if (who === "mom") return <Bunny size={size} />;
  if (who === "pearl") return <Chick size={size} />;
  return <Family size={size * 0.8} />;
}
