import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "vietnamese"], variable: "--font-inter" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export const metadata: Metadata = {
  title: "NIKKE UniRaid Calculator",
  description: "Công cụ phân công lượt đánh Union Raid cho NIKKE",
  authors: [{ name: "Ng0cTh4nh" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${inter.variable} ${outfit.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
