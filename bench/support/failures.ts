/**
 * Provider failure classification.
 *
 * This runs at capture time, not at report time, and that ordering is the
 * point. A provider error message can carry a request URL, a project
 * identifier or a credential, so it is reduced to one of the categories below
 * the moment it is caught and the verbatim text is never written to disk.
 * Because nothing sensitive reaches bench/results/, those files are safe to
 * commit, which in turn makes benchmark runs diffable across commits.
 *
 * An earlier version redacted in the report generator instead. That kept the
 * raw text in the result JSON and forced the whole directory to be gitignored,
 * which then let a routine worktree removal destroy the measurements.
 */

/** Coarse reason a provider call failed. Safe to publish. */
export type FailureCategory =
  | "provider rate limit"
  | "authentication or configuration"
  | "other";

/**
 * Maps a caught error to a publishable category. The message is inspected here
 * and then discarded; callers must store only the return value.
 */
export function classifyFailure(error: unknown): FailureCategory {
  const message = error instanceof Error ? error.message : String(error);
  if (/RESOURCE_EXHAUSTED|429/.test(message)) return "provider rate limit";
  if (/GEMINI_API_KEY|API key|PERMISSION_DENIED|401|403/.test(message)) {
    return "authentication or configuration";
  }
  return "other";
}

/** Counts categories, most frequent first, for rendering as a table. */
export function tallyFailures(categories: FailureCategory[]): Array<[FailureCategory, number]> {
  const counts = new Map<FailureCategory, number>();
  for (const category of categories) {
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
}
