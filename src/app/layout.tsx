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
  title: "TapeBook — 24/5 Quantitative Futures Bias, Levels & Journal",
  description: "Session-aware quantitative bias, bounce & target levels, volatility risk gates, and P&L screenshot journal for CME Nasdaq-100 (NQ / MNQ) futures across Asia, London, and NY.",
  keywords: ["Futures", "NQ", "MNQ", "Quantitative Trading", "Asia", "London", "NY Session", "SMT", "GEX", "TradingView", "Next.js"],
  authors: [{ name: "TapeBook" }],
  openGraph: {
    title: "TapeBook — 24/5 Quantitative Futures Bias, Levels & Journal",
    description: "Session-aware quantitative bias, bounce & target levels, volatility risk gates, and P&L screenshot journal for CME Nasdaq-100 (NQ / MNQ) futures across Asia, London, and NY.",
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
      <body className="min-h-full bg-zinc-950 text-zinc-100 flex flex-col font-sans pb-16 sm:pb-0">
        <TooltipProvider>
          <TimezoneProvider>{children}</TimezoneProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
