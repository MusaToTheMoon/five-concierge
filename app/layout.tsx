import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

/*
 * Type pairing: Fraunces (editorial display serif, optical sizing on) against
 * Manrope (refined grotesque) for body and UI. High contrast on purpose:
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
    "An AI concierge for FIVE Hotels and Resorts, with grounded answers about the hotels, dining, nightlife and spa, plus personalised evening itineraries. Unofficial portfolio demo.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0906" },
    { media: "(prefers-color-scheme: light)", color: "#f4f0e6" },
  ],
};

/*
 * Sets the stored (or OS-preferred) theme on <html> before first paint, so a
 * returning light-mode guest never sees a dark flash. Kept tiny and inline.
 */
const THEME_INIT = `(function(){try{var d=document.documentElement,s=localStorage.getItem('five-theme');if(s!=='light'&&s!=='dark'){s=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}d.dataset.theme=s;}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // The inline theme script sets data-theme before hydration; this scopes
      // the expected attribute mismatch to <html> only.
      suppressHydrationWarning
      className={`${fraunces.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="relative flex min-h-dvh flex-col overflow-x-hidden">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
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
