// มาสคอตของบ้าน: เลือกได้ต่อคนในหน้าตั้งค่า
import { DEFAULT_PEOPLE, type MascotKind, type People, type Person } from "@/lib/family";

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

function Eyes({ happy, y = 25, dx = 6 }: { happy?: boolean; y?: number; dx?: number }) {
  return happy ? (
    <path d={`M${24 - dx - 2} ${y}q2-3 4 0M${24 + dx - 2} ${y}q2-3 4 0`} stroke="#4A3B36" strokeWidth="1.8" fill="none" strokeLinecap="round" />
  ) : (
    <>
      <circle cx={24 - dx} cy={y} r="2" fill="#4A3B36" />
      <circle cx={24 + dx} cy={y} r="2" fill="#4A3B36" />
    </>
  );
}

export function Cat({ size = 44, happy, label }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" {...a11y(label)}>
      <path d="M8 22L10 6l11 9z" fill="#B9B2AD" /><path d="M40 22L38 6l-11 9z" fill="#B9B2AD" />
      <path d="M11 17l1-7 6 5z" fill="#F8C9CF" /><path d="M37 17l-1-7-6 5z" fill="#F8C9CF" />
      <circle cx="24" cy="28" r="16" fill="#CFC9C4" />
      <Eyes happy={happy} y={26} />
      <path d="M22 31l2 2 2-2z" fill="#E58C9A" />
      <path d="M8 30h7M8 34h7M33 30h7M33 34h7" stroke="#8C8480" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

export function Puppy({ size = 44, happy, label }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" {...a11y(label)}>
      <ellipse cx="10" cy="22" rx="6" ry="11" fill="#9A6B4F" /><ellipse cx="38" cy="22" rx="6" ry="11" fill="#9A6B4F" />
      <circle cx="24" cy="27" r="16" fill="#E8C49A" />
      <ellipse cx="24" cy="33" rx="7" ry="5" fill="#F6E3CC" />
      <Eyes happy={happy} />
      <ellipse cx="24" cy="31" rx="2.6" ry="2" fill="#4A3B36" />
      <path d="M24 33v2" stroke="#4A3B36" strokeWidth="1.4" />
    </svg>
  );
}

export function Panda({ size = 44, happy, label }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" {...a11y(label)}>
      <circle cx="11" cy="13" r="6.5" fill="#4A3B36" /><circle cx="37" cy="13" r="6.5" fill="#4A3B36" />
      <circle cx="24" cy="27" r="17" fill="#FFFFFF" stroke="#E9D6D0" />
      <ellipse cx="17" cy="25" rx="4.5" ry="5.5" fill="#4A3B36" transform="rotate(-20 17 25)" />
      <ellipse cx="31" cy="25" rx="4.5" ry="5.5" fill="#4A3B36" transform="rotate(20 31 25)" />
      {happy ? <path d="M15 25q2-2.5 4 0M29 25q2-2.5 4 0" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        : <><circle cx="17.5" cy="25" r="1.6" fill="#fff" /><circle cx="30.5" cy="25" r="1.6" fill="#fff" /></>}
      <ellipse cx="24" cy="32" rx="2.4" ry="1.7" fill="#4A3B36" />
      <circle cx="12" cy="33" r="2.5" fill="#F6A9A0" /><circle cx="36" cy="33" r="2.5" fill="#F6A9A0" />
    </svg>
  );
}

export function Piggy({ size = 44, happy, label }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" {...a11y(label)}>
      <path d="M9 18l3-10 8 6z" fill="#F2A7B5" /><path d="M39 18l-3-10-8 6z" fill="#F2A7B5" />
      <circle cx="24" cy="27" r="17" fill="#F8C4CE" />
      <Eyes happy={happy} y={23} dx={7} />
      <ellipse cx="24" cy="31" rx="6.5" ry="4.5" fill="#F2A7B5" />
      <circle cx="22" cy="31" r="1.3" fill="#B5657A" /><circle cx="26" cy="31" r="1.3" fill="#B5657A" />
    </svg>
  );
}

export function Frog({ size = 44, happy, label }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" {...a11y(label)}>
      <circle cx="15" cy="15" r="7" fill="#9CCB7A" /><circle cx="33" cy="15" r="7" fill="#9CCB7A" />
      <ellipse cx="24" cy="30" rx="18" ry="14" fill="#A9D68A" />
      {happy ? <path d="M12 15q3-3 6 0M30 15q3-3 6 0" stroke="#4A3B36" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        : <><circle cx="15" cy="15" r="3" fill="#fff" /><circle cx="15" cy="15" r="1.7" fill="#4A3B36" /><circle cx="33" cy="15" r="3" fill="#fff" /><circle cx="33" cy="15" r="1.7" fill="#4A3B36" /></>}
      <path d="M17 32q7 6 14 0" stroke="#4A3B36" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <circle cx="11" cy="31" r="2.5" fill="#F6A9A0" /><circle cx="37" cy="31" r="2.5" fill="#F6A9A0" />
    </svg>
  );
}

const KINDS: Record<MascotKind, (p: Props) => React.JSX.Element> = { bear: Bear, bunny: Bunny, chick: Chick, cat: Cat, puppy: Puppy, panda: Panda, piggy: Piggy, frog: Frog };

export function Mascot({ kind, ...p }: Props & { kind: MascotKind }) {
  const M = KINDS[kind] ?? Bear;
  return <M {...p} />;
}

/** ตัวการ์ตูนของทุกคนในบ้านเรียงกัน */
export function Family({ size = 44, happy, people = DEFAULT_PEOPLE }: { size?: number; happy?: boolean; people?: Person[] }) {
  return (
    <div className="flex" role="img" aria-label={people.map((p) => p.name).join(" ")}>
      {people.map((p, i) => (
        <span key={p.key} className={i ? "-ml-2" : ""}><Mascot kind={p.mascot} size={size} happy={happy} /></span>
      ))}
    </div>
  );
}

/** ตัวการ์ตูนของเจ้าของนัด (ทั้งบ้าน = ทุกคน) */
export function MascotFor({ who, people, size = 36 }: { who: string; people: People; size?: number }) {
  if (who === "all") return <Family size={size * 0.8} people={people.list} />;
  return <Mascot kind={people.get(who).mascot} size={size} />;
}
