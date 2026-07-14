import Link from "next/link";
import ThemeToggle from "./ThemeToggle";

/** Sticky masthead: FIVE wordmark, tracked-out "Concierge", destinations. */
export default function Header() {
  return (
    <header className="hairline sticky top-0 z-40 border-b bg-night/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="group flex items-baseline gap-3">
          <span className="font-display text-2xl font-semibold tracking-tight text-ivory transition-colors group-hover:text-gold-bright">
            FIVE
          </span>
          <span className="h-4 w-px self-center bg-gold/40" aria-hidden />
          <span className="text-[0.65rem] font-medium uppercase tracking-[0.35em] text-gold">
            Concierge
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <p className="hidden text-[0.65rem] font-medium uppercase tracking-[0.25em] text-sand sm:block">
            Dubai · Zurich · Ibiza
          </p>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
