"use client";

import { useState } from "react";
import type { Itinerary } from "@/lib/types";
import SourceChips from "./SourceChips";
import { RetryIcon } from "./icons";

const DESTINATIONS = ["Dubai", "Zurich", "Ibiza"] as const;
const VIBES = ["chic dinner", "party", "relaxed", "romantic"] as const;
const GROUPS = ["solo", "couple", "small group", "big group"] as const;
const INTERESTS = ["dining", "nightlife", "spa", "pool"] as const;

type Destination = (typeof DESTINATIONS)[number];
type Vibe = (typeof VIBES)[number];
type Group = (typeof GROUPS)[number];
type Interest = (typeof INTERESTS)[number];

const chipBase =
  "rounded-full border px-3.5 py-1.5 text-sm capitalize transition-colors duration-150";
const chipOff =
  "border-hairline text-muted hover:border-hairline-strong hover:text-ink";
const chipOn = "border-gold bg-gold-soft text-ink";

function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className="text-xs font-medium tracking-[0.08em] text-faint uppercase">
        {label}
      </legend>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={option} className={`${chipBase} cursor-pointer ${value === option ? chipOn : chipOff}`}>
            <input
              type="radio"
              name={label}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              className="sr-only"
            />
            {option}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function PlanMyNight() {
  const [destination, setDestination] = useState<Destination>("Dubai");
  const [vibe, setVibe] = useState<Vibe>("party");
  const [group, setGroup] = useState<Group>("couple");
  const [interests, setInterests] = useState<Interest[]>(["dining", "nightlife"]);
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleInterest(interest: Interest) {
    setInterests((current) =>
      current.includes(interest)
        ? current.filter((i) => i !== interest)
        : [...current, interest],
    );
  }

  async function curate() {
    setPending(true);
    setError(null);
    setItinerary(null);
    try {
      const res = await fetch("/api/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination, vibe, group, interests }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Something went wrong.");
      setItinerary(data.itinerary);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "The concierge couldn't be reached. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }

  const showComposer = !itinerary && !pending;

  return (
    <div className="py-8">
      {showComposer && (
        <>
          <h1 className="font-serif text-3xl italic">One perfect evening.</h1>
          <p className="mt-3 max-w-[52ch] text-muted">
            Tell the concierge the shape of your night and get a curated,
            source-grounded itinerary across FIVE&apos;s venues.
          </p>
          <form
            className="mt-10 space-y-8"
            onSubmit={(e) => {
              e.preventDefault();
              void curate();
            }}
          >
            <ChoiceGroup
              label="Destination"
              options={DESTINATIONS}
              value={destination}
              onChange={setDestination}
            />
            <ChoiceGroup label="Vibe" options={VIBES} value={vibe} onChange={setVibe} />
            <ChoiceGroup label="Going as" options={GROUPS} value={group} onChange={setGroup} />
            <fieldset>
              <legend className="text-xs font-medium tracking-[0.08em] text-faint uppercase">
                Interests
              </legend>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {INTERESTS.map((interest) => {
                  const on = interests.includes(interest);
                  return (
                    <label
                      key={interest}
                      className={`${chipBase} cursor-pointer ${on ? chipOn : chipOff}`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleInterest(interest)}
                        className="sr-only"
                      />
                      {interest}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                type="submit"
                disabled={interests.length === 0}
                className="rounded-full bg-gold px-6 py-2.5 text-sm font-medium text-gold-ink transition-[background-color,opacity] duration-150 hover:bg-gold-hover disabled:cursor-default disabled:opacity-35"
              >
                Curate my evening
              </button>
              {interests.length === 0 && (
                <p className="text-sm text-muted">Pick at least one interest.</p>
              )}
            </div>
          </form>
          {error && (
            <div className="mt-8 flex flex-wrap items-center gap-3 rounded-lg bg-danger-soft px-4 py-3 text-sm">
              <span className="text-danger">{error}</span>
              <button
                type="button"
                onClick={() => void curate()}
                className="inline-flex items-center gap-1.5 font-medium text-ink underline-offset-4 hover:underline"
              >
                <RetryIcon className="size-3.5" />
                Try again
              </button>
            </div>
          )}
        </>
      )}

      {pending && (
        <div aria-live="polite">
          <p className="font-serif text-lg italic text-muted">
            Curating your evening…
          </p>
          <div className="mt-8 space-y-8">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-6">
                <div
                  className="h-3.5 w-14 shrink-0 animate-pulse rounded bg-raised"
                  style={{ animationDelay: `${i * 120}ms` }}
                />
                <div className="flex-1 space-y-2.5">
                  <div
                    className="h-3.5 w-2/5 animate-pulse rounded bg-raised"
                    style={{ animationDelay: `${i * 120 + 60}ms` }}
                  />
                  <div
                    className="h-3.5 w-4/5 animate-pulse rounded bg-raised"
                    style={{ animationDelay: `${i * 120 + 120}ms` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {itinerary && (
        <article>
          <header>
            <h1 className="font-serif text-3xl italic">{itinerary.title}</h1>
            <p className="mt-2 text-muted">{itinerary.subtitle}</p>
            <p className="mt-4 text-xs tracking-[0.08em] text-faint uppercase">
              {destination} · {vibe} · {group}
            </p>
          </header>
          <ol className="mt-10">
            {itinerary.stops.map((stop, i) => (
              <li
                key={i}
                className="relative grid gap-x-6 gap-y-1 border-l border-hairline pt-0 pb-10 pl-6 last:pb-2 sm:grid-cols-[5.5rem_1fr] sm:pl-8"
              >
                <span
                  aria-hidden
                  className="absolute top-1.5 -left-[3px] size-[5px] rounded-full bg-gold"
                />
                <time className="text-sm text-gold-text tabular-nums">
                  {stop.time}
                </time>
                <div className="space-y-1.5">
                  <h2 className="text-base font-medium">
                    {stop.venue}
                    <span className="ml-2 text-sm font-normal text-faint">
                      {stop.property}
                    </span>
                  </h2>
                  <p className="max-w-[60ch] text-sm leading-relaxed text-muted">
                    {stop.blurb}
                  </p>
                  {stop.source && (
                    <div className="pt-1">
                      <SourceChips sources={[stop.source]} />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={() => setItinerary(null)}
            className="mt-6 rounded-full border border-hairline px-5 py-2 text-sm text-muted transition-colors duration-150 hover:border-hairline-strong hover:text-ink"
          >
            Plan another evening
          </button>
        </article>
      )}
    </div>
  );
}
