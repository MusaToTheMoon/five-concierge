import type { Source } from "@/lib/types";
import { ArrowOutIcon } from "./icons";

/** Cited FIVE pages under an answer. Trust is the feature; keep them visible. */
export default function SourceChips({ sources }: { sources: Source[] }) {
  if (sources.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Sources">
      {sources.map((source) => (
        <li key={source.url}>
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 text-xs text-muted transition-colors duration-150 hover:border-hairline-strong hover:text-ink"
          >
            <span className="max-w-52 truncate">{source.title}</span>
            <ArrowOutIcon className="size-3 shrink-0 opacity-60" />
          </a>
        </li>
      ))}
    </ul>
  );
}
