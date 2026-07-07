import type { Source } from "@/lib/types";

/** The citation row rendered under grounded answers and itinerary stops. */
export default function SourceLinks({ sources }: { sources: Source[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <span className="text-[0.6rem] font-semibold uppercase tracking-[0.25em] text-sand/70">
        Sources
      </span>
      {sources.map((source) => (
        <a
          key={source.url}
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          title={source.url}
          className="hairline inline-flex max-w-full items-center gap-1 truncate rounded-full border bg-onyx/60 px-2.5 py-1 text-[0.7rem] text-gold transition-colors hover:border-gold/50 hover:text-gold-bright"
        >
          <span className="truncate">{source.title}</span>
          <span aria-hidden className="shrink-0 text-[0.6rem]">↗</span>
        </a>
      ))}
    </div>
  );
}
