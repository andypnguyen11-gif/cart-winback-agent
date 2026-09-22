import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Cart Win-Back Review",
  description:
    "Review, edit, and approve agent-proposed win-back offers for abandoned Seattle Seawolves ticket carts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-ink-deep font-sans text-white antialiased">{children}</body>
    </html>
  );
}
