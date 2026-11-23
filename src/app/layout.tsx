import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OpenPulse | NQ Pre-Market & NY Open Briefing",
  description: "Pre-market & NY open bias, key-levels, and stop-risk briefing for futures traders (1 trade/day NQ continuation retrace specialist)",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full bg-[#090d16] text-slate-100 flex flex-col font-sans">
        {children}
      </body>
    </html>
  );
}
