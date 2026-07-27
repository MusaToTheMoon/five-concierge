"use client";

import { useState } from "react";
import type { Source } from "@/lib/types";
import { ArrowOutIcon } from "./icons";

/** How many chips show before the rest fold behind a "+n more" toggle. */
const VISIBLE_LIMIT = 4;

/** Cited FIVE pages under an answer. Trust is the feature; keep them visible. */
export default function SourceChips({ sources }: { sources: Source[] }) {
  const [expanded, setExpanded] = useState(false);
  if (sources.length === 0) return null;

  const overflow = sources.length - VISIBLE_LIMIT;
  const shown =
    expanded || overflow <= 0 ? sources : sources.slice(0, VISIBLE_LIMIT - 1);

  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Sources">
      {shown.map((source) => (
        <li key={source.url}>
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="relative inline-flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1.5 text-xs text-muted transition-colors duration-150 before:absolute before:-inset-1.5 before:content-[''] hover:border-hairline-strong hover:text-ink"
          >
            <span className="max-w-52 truncate">{source.title}</span>
            <ArrowOutIcon className="size-3 shrink-0 opacity-60" />
          </a>
        </li>
      ))}
      {!expanded && overflow > 0 && (
        <li>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="relative rounded-full border border-hairline px-2.5 py-1.5 text-xs text-muted transition-colors duration-150 before:absolute before:-inset-1.5 before:content-[''] hover:border-hairline-strong hover:text-ink"
          >
            +{overflow + 1} more
          </button>
        </li>
      )}
    </ul>
  );
}
