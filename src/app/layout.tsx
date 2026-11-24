import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TimezoneProvider } from "@/context/TimezoneContext";
import { TooltipProvider } from "@/components/ui/tooltip";
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
  title: "MinBook — Quantitative NY Open Futures Decision Engine",
  description: "Action-first quantitative pre-market & NY open decision engine engineered specifically for futures traders executing 1 trade per day on CME Nasdaq-100 (NQ / MNQ).",
  keywords: ["Futures", "NQ", "MNQ", "Quantitative Trading", "NY Open", "ICT", "SMT", "GEX", "TradingView", "Next.js"],
  authors: [{ name: "MinBook Team" }],
  openGraph: {
    title: "MinBook — Quantitative NY Open Futures Decision Engine",
    description: "Action-first quantitative pre-market & NY open decision engine engineered specifically for futures traders executing 1 trade per day on CME Nasdaq-100 (NQ / MNQ).",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark h-full antialiased ${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-full bg-zinc-950 text-zinc-100 flex flex-col font-sans">
        <TooltipProvider>
          <TimezoneProvider>{children}</TimezoneProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
