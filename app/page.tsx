"use client";

import { KeyboardEvent, useRef, useState } from "react";
import Chat from "@/components/Chat";
import PlanMyNight from "@/components/PlanMyNight";
import ThemeToggle from "@/components/ThemeToggle";

const MODES = [
  { id: "chat", label: "Concierge" },
  { id: "plan", label: "Plan My Night" },
] as const;

type Mode = (typeof MODES)[number]["id"];

export default function Home() {
  const [mode, setMode] = useState<Mode>("chat");
  const tabRefs = useRef<Partial<Record<Mode, HTMLButtonElement | null>>>({});

  /** Roving-tabindex arrow navigation, per the ARIA tabs pattern. */
  function onTablistKeyDown(event: KeyboardEvent) {
    const order = MODES.map((m) => m.id);
    const current = order.indexOf(mode);
    let next: Mode | null = null;
    if (event.key === "ArrowRight") next = order[(current + 1) % order.length];
    else if (event.key === "ArrowLeft")
      next = order[(current - 1 + order.length) % order.length];
    else if (event.key === "Home") next = order[0];
    else if (event.key === "End") next = order[order.length - 1];
    if (next) {
      event.preventDefault();
      setMode(next);
      tabRefs.current[next]?.focus();
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-hairline bg-bg">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6">
          <p className="flex items-baseline gap-1.5 text-sm font-semibold tracking-[0.14em]">
            FIVE
            <span aria-hidden className="size-1 self-center rounded-full bg-gold" />
          </p>
          <nav
            role="tablist"
            aria-label="Concierge modes"
            className="flex gap-1"
            onKeyDown={onTablistKeyDown}
          >
            {MODES.map((m) => {
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  ref={(el) => {
                    tabRefs.current[m.id] = el;
                  }}
                  role="tab"
                  id={`tab-${m.id}`}
                  aria-selected={active}
                  aria-controls={`panel-${m.id}`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setMode(m.id)}
                  className={`relative rounded-md px-2 py-2 text-sm whitespace-nowrap transition-colors duration-150 sm:px-3 ${
                    active ? "text-ink" : "text-muted hover:text-ink"
                  }`}
                >
                  {m.label}
                  <span
                    aria-hidden
                    className={`absolute inset-x-3 bottom-0 block h-px transition-colors duration-150 ${
                      active ? "bg-gold" : "bg-transparent"
                    }`}
                  />
                </button>
              );
            })}
          </nav>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 sm:px-6">
        <section
          role="tabpanel"
          id="panel-chat"
          aria-labelledby="tab-chat"
          hidden={mode !== "chat"}
          className={mode === "chat" ? "flex flex-1 flex-col" : undefined}
        >
          <Chat />
        </section>
        <section
          role="tabpanel"
          id="panel-plan"
          aria-labelledby="tab-plan"
          hidden={mode !== "plan"}
        >
          <PlanMyNight />
        </section>
      </main>

      <footer className="mx-auto w-full max-w-2xl px-5 pt-2 pb-5 sm:px-6">
        <p className="text-xs text-faint">
          Unofficial demo. Not affiliated with FIVE Hotels and Resorts.
        </p>
      </footer>
    </div>
  );
}
