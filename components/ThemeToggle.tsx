"use client";

import { MoonIcon, SunIcon } from "./icons";

/**
 * Icon visibility is driven purely by the html[data-theme] attribute,
 * so the server render never mismatches the client.
 */
export default function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const next = root.dataset.theme === "light" ? "dark" : "light";
    root.dataset.theme = next;
    try {
      localStorage.setItem("five-theme", next);
    } catch {
      /* private mode; the choice just won't persist */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch between dark and light theme"
      className="grid size-9 place-items-center rounded-full border border-hairline text-muted transition-colors duration-150 hover:border-hairline-strong hover:text-ink"
    >
      <span className="hidden [html[data-theme=dark]_&]:block">
        <SunIcon />
      </span>
      <span className="hidden [html[data-theme=light]_&]:block">
        <MoonIcon />
      </span>
    </button>
  );
}
