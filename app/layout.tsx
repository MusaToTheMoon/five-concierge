import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

/*
 * Type pairing: Fraunces (editorial display serif, optical sizing on) against
 * Manrope (refined grotesque) for body and UI. High contrast on purpose —
 * thin oversized serif headlines, small tracked-out sans labels.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["opsz", "SOFT", "WONK"],
  variable: "--font-fraunces",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "FIVE Concierge",
  description:
    "An AI concierge for FIVE Hotels and Resorts — grounded answers about the hotels, dining, nightlife and spa, plus personalised evening itineraries. Unofficial portfolio demo.",
};

export const viewport: Viewport = {
  themeColor: "#0b0906",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="relative flex min-h-dvh flex-col overflow-x-hidden">
        {/* Ambient gold glow, fixed behind everything */}
        <div
          aria-hidden
          className="pointer-events-none fixed -top-40 left-1/2 -z-10 h-[32rem] w-[52rem] -translate-x-1/2 rounded-full bg-gold/[0.07] blur-[120px] animate-glow-drift"
        />
        <Header />
        <main className="flex w-full flex-1 flex-col">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
