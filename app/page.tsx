"use client";

import { useState } from "react";

type Tab = "concierge" | "night";

/**
 * Single-page shell: an editorial hero and the two experiences —
 * the grounded chat concierge and the Plan My Night itinerary builder.
 */
export default function Home() {
  const [tab, setTab] = useState<Tab>("concierge");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 sm:px-6">
      {/* Hero */}
      <section className="animate-rise-slow pt-10 pb-8 sm:pt-14">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.4em] text-gold">
          AI Guest Concierge
        </p>
        <h1 className="mt-3 font-display text-4xl font-light leading-[1.05] text-ivory sm:text-6xl">
          Your night,
          <span className="font-medium italic text-gold-bright"> curated.</span>
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-sand sm:text-base">
          Ask anything about FIVE&apos;s hotels, dining, nightlife and spas —
          answers are grounded in FIVE&apos;s own pages, with sources. Or let
          the concierge plan your whole evening.
        </p>
      </section>

      {/* Tab switcher */}
      <div
        role="tablist"
        aria-label="Concierge modes"
        className="hairline flex w-fit items-center gap-1 rounded-full border bg-charcoal/60 p-1"
      >
        <TabButton
          active={tab === "concierge"}
          onClick={() => setTab("concierge")}
        >
          Ask the Concierge
        </TabButton>
        <TabButton active={tab === "night"} onClick={() => setTab("night")}>
          Plan My Night
        </TabButton>
      </div>

      {/* Active experience */}
      <div className="flex flex-1 flex-col pt-6 pb-10">
        {tab === "concierge" ? <PlaceholderPanel /> : <PlaceholderPanel />}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] transition-all duration-300 sm:px-5 ${
        active
          ? "bg-gold/15 text-gold-bright shadow-[inset_0_0_0_1px] shadow-gold/30"
          : "text-sand hover:text-ivory"
      }`}
    >
      {children}
    </button>
  );
}

function PlaceholderPanel() {
  return (
    <div className="hairline flex flex-1 items-center justify-center rounded-2xl border bg-charcoal/40 p-10">
      <p className="text-sm text-sand">Coming together…</p>
    </div>
  );
}
