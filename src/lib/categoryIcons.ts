// ไอคอนเส้นของหมวดรายจ่าย (viewBox 24, stroke) + สีพื้นพาสเทล
export type IconKey =
  | "food" | "shop" | "travel" | "home" | "kid" | "bill" | "water" | "power" | "net" | "phone"
  | "save" | "merit" | "invest" | "health" | "fun" | "gift" | "car" | "pet" | "study" | "other";

export const ICON_PATHS: Record<IconKey, string> = {
  food: "M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 1-3 4-3 7h3v11",
  shop: "M6 8h12l-1 12H7L6 8zM9 8V6a3 3 0 0 1 6 0v2",
  travel: "M3 13l18-7-7 18-2-8-9-3z",
  home: "M4 11l8-7 8 7v9H4v-9zM10 20v-5h4v5",
  kid: "M12 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM6 21v-3a6 6 0 0 1 12 0v3M9.5 7h.01M14.5 7h.01",
  bill: "M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21V3zM10 8h4M10 12h4",
  water: "M12 3c3 4.5 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-6.5 6-11z",
  power: "M13 3L5 14h6l-1 7 8-11h-6l1-7z",
  net: "M4 9a12 12 0 0 1 16 0M7 12.5a7.5 7.5 0 0 1 10 0M10 16a3 3 0 0 1 4 0M12 19.5h.01",
  phone: "M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2",
  save: "M5 12a7 6 0 0 1 13-2h1.5v4H18a7 6 0 0 1-3 3v2h-2v-1.5h-2V19H9v-2.5A6 6 0 0 1 5 12zM10 8h4M15 11h.01",
  merit: "M12 21c-4 0-7-2.5-7-5 2 0 4 .5 7 2.5 3-2 5-2.5 7-2.5 0 2.5-3 5-7 5zM12 18.5V10M12 10c-2-1-3-3-3-5 2 0 3 1 3 2 0-1 1-2 3-2 0 2-1 4-3 5z",
  invest: "M4 19h16M6 15l4-4 3 3 5-6M14 8h4v4",
  health: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10zM9 11h6M12 8v6",
  fun: "M4 6h16v12H4zM10 9.5v5l4-2.5-4-2.5z",
  gift: "M4 10h16v4H4zM6 14h12v7H6zM12 10v11M12 10c-2 0-4-1-4-3s2-2 4 3c2-5 4-5 4-3s-2 3-4 3z",
  car: "M5 16V12l2-5h10l2 5v4M5 16h14M5 16v2M19 16v2M7.5 13.5h.01M16.5 13.5h.01",
  pet: "M8 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM16 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM5 13a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM19 13a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM12 12c3 0 5 4 5 6s-2 2-5 1-5 1-5-1 2-6 5-6z",
  study: "M3 9l9-4 9 4-9 4-9-4zM7 11v5c3 2 7 2 10 0v-5M21 9v5",
  other: "M6 12h.01M12 12h.01M18 12h.01",
};

/** สีไอคอน / สีพื้น */
export const ICON_TONE: Record<IconKey, [string, string]> = {
  food: ["#C7703A", "#FDE3D6"], shop: ["#B5577A", "#F8DDE7"], travel: ["#4C7FB8", "#D6E6F7"],
  home: ["#6E8B3D", "#E4EFD3"], kid: ["#C08A1E", "#FBEBC2"], bill: ["#7A6A63", "#EEE5DE"],
  water: ["#3B8FB5", "#D3ECF5"], power: ["#C4961A", "#FBEFC2"], net: ["#6F62B8", "#E6DDF5"],
  phone: ["#5B6B8C", "#E1E6F0"], save: ["#C26A86", "#F8DDE7"], merit: ["#C98A2A", "#FBE9CF"],
  invest: ["#3F8A5F", "#DFF1E6"], health: ["#C9566A", "#F9DCE0"], fun: ["#8A5FC2", "#ECE1F7"],
  gift: ["#D06A5A", "#FBE0DA"], car: ["#5A7385", "#DEE7EE"], pet: ["#8F6B4A", "#F1E6DA"],
  study: ["#4B6FA8", "#DCE5F4"], other: ["#7A6A63", "#F3EAE2"],
};
