import type { Metadata, Viewport } from "next";
import { Mali, Noto_Sans_Thai } from "next/font/google";
import "./globals.css";

const mali = Mali({ variable: "--font-mali", weight: ["500", "600", "700"], subsets: ["thai", "latin"] });
const noto = Noto_Sans_Thai({ variable: "--font-noto-thai", weight: ["400", "500", "600"], subsets: ["thai", "latin"] });

export const metadata: Metadata = {
  title: "บ้านเรา",
  description: "ปฏิทิน ซื้อของ และเงินของบ้าน สำหรับทุกคนในครอบครัว",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "บ้านเรา", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/apple-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#FFF8F0",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${mali.variable} ${noto.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
