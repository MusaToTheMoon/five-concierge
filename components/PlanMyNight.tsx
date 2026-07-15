"use client";

import { useEffect, useState } from "react";
import SourceLinks from "./SourceLinks";
import type { Itinerary, Source } from "@/lib/types";

const STORAGE_KEY = "five-concierge-night-v1";

const DESTINATIONS = ["Dubai", "Zurich", "Ibiza"] as const;
const VIBES = [
  { value: "chic dinner", label: "Chic dinner" },
  { value: "party", label: "Party" },
  { value: "relaxed", label: "Relaxed" },
  { value: "romantic", label: "Romantic" },
] as const;
const GROUPS = [
  { value: "solo", label: "Just me" },
  { value: "couple", label: "Two of us" },
  { value: "small group", label: "3 to 5" },
  { value: "big group", label: "The squad" },
] as const;
const INTERESTS = ["dining", "nightlife", "spa", "pool"] as const;

interface SavedNight {
  itinerary: Itinerary;
  sources: Source[];
}

/** The signature flow: pick a mood, get a grounded evening itinerary. */
export default function PlanMyNight() {
  const [destination, setDestination] = useState<string>("Dubai");
  const [vibe, setVibe] = useState<string>("chic dinner");
  const [group, setGroup] = useState<string>("couple");
  const [interests, setInterests] = useState<string[]>(["dining", "nightlife"]);
  const [night, setNight] = useState<SavedNight | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bring back the last curated night on reload (post-mount read avoids a
  // hydration mismatch, see Chat.tsx).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setNight(JSON.parse(saved));
    } catch {
      /* start fresh */
    }
  }, []);

  const toggleInterest = (interest: string) =>
    setInterests((current) =>
      current.includes(interest)
        ? current.filter((i) => i !== interest)
        : [...current, interest],
    );

  const curate = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination, vibe, group, interests }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Request failed");
      const saved: SavedNight = { itinerary: data.itinerary, sources: data.sources };
      setNight(saved);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      } catch {
        /* non-fatal */
      }
    } catch (err) {
      setError(
        err instanceof Error && err.message !== "Failed to fetch"
          ? err.message
          : "The concierge couldn't be reached. Check your connection and try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section aria-label="Plan my night" className="flex flex-col gap-8">
      {/* Preference picker */}
      <div className="hairline animate-rise rounded-2xl border bg-charcoal/50 p-5 sm:p-7">
        <OptionRow label="Where">
          {DESTINATIONS.map((d) => (
            <Pill key={d} active={destination === d} onClick={() => setDestination(d)}>
              {d}
            </Pill>
          ))}
        </OptionRow>
        <OptionRow label="The vibe">
          {VIBES.map((v) => (
            <Pill key={v.value} active={vibe === v.value} onClick={() => setVibe(v.value)}>
              {v.label}
            </Pill>
          ))}
        </OptionRow>
        <OptionRow label="Who's coming">
          {GROUPS.map((g) => (
            <Pill key={g.value} active={group === g.value} onClick={() => setGroup(g.value)}>
              {g.label}
            </Pill>
          ))}
        </OptionRow>
        <OptionRow label="Into" hint="pick any">
          {INTERESTS.map((interest) => (
            <Pill
              key={interest}
              active={interests.includes(interest)}
              onClick={() => toggleInterest(interest)}
            >
              {interest}
            </Pill>
          ))}
        </OptionRow>

        <button
          onClick={curate}
          disabled={isLoading || interests.length === 0}
          className="mt-6 w-full rounded-xl bg-gold py-3.5 text-xs font-bold uppercase tracking-[0.25em] text-ink transition-all hover:bg-gold-bright hover:shadow-[0_0_30px] hover:shadow-gold/25 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:px-10"
        >
          {isLoading ? "Curating…" : "Curate my night"}
        </button>
        {interests.length === 0 && (
          <p className="mt-3 text-xs text-sand/70">Pick at least one interest.</p>
        )}
      </div>

      {error && (
        <div className="animate-rise rounded-xl border border-ember/30 bg-ember/10 px-4 py-3 text-sm text-ivory/90">
          {error}
        </div>
      )}

      {isLoading && <ItinerarySkeleton />}
      {!isLoading && night && <ItineraryView night={night} />}
    </section>
  );
}

function OptionRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5 last:mb-0">
      <p className="mb-2.5 text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-sand">
        {label}
        {hint && <span className="ml-2 normal-case tracking-normal text-sand/50">({hint})</span>}
      </p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Pill({
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
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-4 py-2 text-xs font-medium capitalize transition-all duration-200 ${
        active
          ? "bg-gold/15 text-gold-bright shadow-[inset_0_0_0_1px] shadow-gold/50"
          : "hairline border bg-onyx/40 text-sand hover:text-ivory"
      }`}
    >
      {children}
    </button>
  );
}

/** The generated evening, as an editorial timeline of cards. */
function ItineraryView({ night }: { night: SavedNight }) {
  const { itinerary, sources } = night;
  return (
    <div className="animate-rise-slow">
      <header className="mb-8 text-center">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.4em] text-gold">
          Your evening
        </p>
        <h2 className="mt-2 font-display text-3xl font-light italic text-ivory sm:text-4xl">
          {itinerary.title}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-sand">{itinerary.subtitle}</p>
      </header>

      <ol className="relative ml-3 space-y-6 border-l border-gold/20 pl-6 sm:ml-6 sm:pl-8">
        {itinerary.stops.map((stop, i) => (
          <li
            key={i}
            className="animate-rise relative"
            style={{ animationDelay: `${i * 120}ms` }}
          >
            {/* Timeline node */}
            <span
              aria-hidden
              className="absolute -left-[calc(1.5rem+5px)] top-7 h-2.5 w-2.5 rounded-full bg-gold shadow-[0_0_12px] shadow-gold/60 sm:-left-[calc(2rem+5px)]"
            />
            <article className="hairline rounded-2xl border bg-gradient-to-br from-charcoal to-night p-5 transition-colors hover:border-gold/40 sm:p-6">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-display text-sm font-semibold tracking-wide text-gold">
                  {stop.time}
                </p>
                <p className="text-[0.6rem] font-semibold uppercase tracking-[0.25em] text-sand/70">
                  {stop.category}
                </p>
              </div>
              <h3 className="mt-2 font-display text-2xl font-medium text-ivory">
                {stop.venue}
              </h3>
              <p className="mt-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-sand">
                {stop.property}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ivory/85">{stop.blurb}</p>
              {stop.source && <SourceLinks sources={[stop.source]} />}
            </article>
          </li>
        ))}
      </ol>

      <footer className="mt-10 border-t border-gold/15 pt-5">
        <SourceLinks sources={sources} />
      </footer>
    </div>
  );
}

/** Loading state: shimmering placeholder cards while Gemini curates. */
function ItinerarySkeleton() {
  return (
    <div aria-label="Curating your itinerary" role="status" className="space-y-6">
      <div className="text-center">
        <p className="animate-pulse font-display text-lg italic text-gold/70">
          Composing your evening…
        </p>
      </div>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="hairline animate-pulse rounded-2xl border bg-charcoal/50 p-6"
          style={{ animationDelay: `${i * 200}ms` }}
        >
          <div className="h-3 w-16 rounded bg-gold/20" />
          <div className="mt-3 h-6 w-2/5 rounded bg-ivory/10" />
          <div className="mt-3 h-3 w-full rounded bg-ivory/5" />
          <div className="mt-2 h-3 w-3/4 rounded bg-ivory/5" />
        </div>
      ))}
    </div>
  );
}
