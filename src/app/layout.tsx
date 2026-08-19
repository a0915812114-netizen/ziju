import type { Metadata } from "next";
import { Noto_Sans_TC, Noto_Serif_TC } from "next/font/google";
import "./globals.css";

const noto = Noto_Sans_TC({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto",
});

const notoSerif = Noto_Serif_TC({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-noto-serif",
});

export const metadata: Metadata = {
  title: "字句｜聽打、斷句、對時間",
  description: "把影片留在你的電腦，只送出聲音做繁體中文聽打與字幕校對。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" className={`${noto.variable} ${notoSerif.variable} h-full antialiased`}>
      <body className="min-h-full bg-[var(--bg)] font-sans text-[var(--text)]">
        {children}
      </body>
    </html>
  );
}
