type P = { size?: number; className?: string };
const base = (size: number) => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true,
});
export const HomeIcon = ({ size = 22, className }: P) => (<svg {...base(size)} className={className}><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /></svg>);
export const CalIcon = ({ size = 22, className }: P) => (<svg {...base(size)} className={className}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>);
export const BagIcon = ({ size = 22, className }: P) => (<svg {...base(size)} className={className}><path d="M5 8h14l-1.5 11a2 2 0 0 1-2 1.7h-7a2 2 0 0 1-2-1.7z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>);
export const WalletIcon = ({ size = 22, className }: P) => (<svg {...base(size)} className={className}><rect x="3" y="6" width="18" height="14" rx="3" /><path d="M16 13h2M3 10h18" /></svg>);
export const PlusIcon = ({ size = 22, className }: P) => (<svg {...base(size)} className={className}><path d="M12 5v14M5 12h14" /></svg>);
export const UploadIcon = ({ size = 18, className }: P) => (<svg {...base(size)} className={className}><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>);
export const LockIcon = ({ size = 14, className }: P) => (<svg {...base(size)} className={className}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>);
export const CheckIcon = ({ size = 16, className }: P) => (<svg {...base(size)} strokeWidth={3} className={className}><path d="M5 12l5 5 9-10" /></svg>);
export const BackIcon = ({ size = 20, className }: P) => (<svg {...base(size)} className={className}><path d="M15 5l-7 7 7 7" /></svg>);
export const ChatIcon = ({ size = 16, className }: P) => (<svg {...base(size)} className={className}><path d="M4 5h16v11H9l-5 4z" /></svg>);
export const TrashIcon = ({ size = 16, className }: P) => (<svg {...base(size)} className={className}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>);
export const EditIcon = ({ size = 16, className }: P) => (<svg {...base(size)} className={className}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13 7l4 4" /></svg>);
export const ChevronIcon = ({ size = 18, dir = "right", className }: P & { dir?: "left" | "right" }) => (<svg {...base(size)} className={className}><path d={dir === "right" ? "M9 5l7 7-7 7" : "M15 5l-7 7 7 7"} /></svg>);
export const GearIcon = ({ size = 22, className }: P) => (<svg {...base(size)} className={className}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>);
export const StarIcon = ({ size = 22, className }: P) => (<svg {...base(size)} className={className}><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" /></svg>);
